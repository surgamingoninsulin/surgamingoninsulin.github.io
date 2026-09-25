// Local debug backend, only active under `npm run dev`.
//
// Runs yt-dlp on this computer with the same yt-dlp.conf as the GitHub
// workflow, so the whole pipeline can be tested before pushing. The browser
// talks to it through /__debug/* routes on the Astro dev server.
//
// Library layout: one folder per playlist, containing only MP3s:
//
//   local-downloads/<playlist title>/<song title>.mp3
//   local-downloads/Singles/<song title>.mp3        (loose video links)
//
// Bookkeeping (links, file checks, download archives) lives in .state/.
//
// Every run first lists the playlist on YouTube (song ids + lengths), then
// checks the folder: a song whose MP3 exists with the right length is
// complete and skipped; a too-short or broken MP3 is replaced; anything else
// is downloaded. This repeats until the playlist is 100% complete (or only
// songs YouTube will never give out are left).

import type { AstroIntegration } from 'astro';
import { execFile, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, join, relative, resolve } from 'node:path';
import { zipSync } from 'fflate';

const ROOT = process.cwd();
const TOOLS = join(ROOT, '.tools');
const LIB = join(ROOT, 'local-downloads');
const STATE = join(ROOT, '.state');
const STATE_FILE = join(STATE, 'playlists.json');
const PROBE_CACHE = join(STATE, 'files.json');
const CONF = join(ROOT, 'yt-dlp.conf');
const COOKIES = join(ROOT, 'cookies.txt');
const SINGLES = 'Singles';

const isWin = process.platform === 'win32';
const RELEASE = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${
  isWin ? 'yt-dlp.exe' : process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp_linux'
}`;
const LOCAL_BIN = join(TOOLS, isWin ? 'yt-dlp.exe' : 'yt-dlp');

// When YouTube refuses songs (usually its "confirm you're not a bot" rate
// limit), the missing ones are retried after these pauses, with slower requests.
const RETRY_WAITS = [60, 180, 600];
const SLOW_ARGS = ['--sleep-requests', '3', '--sleep-interval', '8', '--max-sleep-interval', '20'];
// Errors that no retry can fix.
const PERMANENT =
  /private video|video unavailable|has been removed|account .*terminated|members[- ]only|join this channel|not available in your country|copyright|age[- ]restricted|confirm your age/i;

// ---------------------------------------------------------------- state

/** One playlist folder in the library. */
interface Entry {
  id: number;
  folder: string;
  title: string;
  urls: string[];
  hidden?: boolean;
  total?: number;
  complete?: number;
  missing?: number;
  unavailable?: number;
  checkedAt?: string;
  /** paused by the user; stays paused across restarts until Resume */
  paused?: boolean;
  /** downloading or waiting in line; picked up again after a dev-server restart */
  active?: boolean;
}

interface Expected {
  title: string;
  duration?: number;
}

interface Job {
  id: number;
  status: 'queued' | 'in_progress' | 'paused' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | null;
  step: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  item: number;
  total: number;
  errors: number;
  log: string[];
  proc?: ChildProcess;
  timer?: NodeJS.Timeout;
  kbps: string;
  /** songs YouTube lists for this playlist, by video id */
  expected: Map<string, Expected>;
  unavailable: Set<string>;
  /** running in an earlier dev-server instance (picked up after a restart) */
  detached?: boolean;
  /** why the last check failed, if it did */
  error?: string;
}

let entries: Record<string, Entry> = {};
try {
  entries = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
} catch {}

const saveEntries = () => {
  mkdirSync(STATE, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(entries, null, 2));
};

const jobs = new Map<number, Job>();
const entryOf = (id: number) => entries[String(id)];
const listFile = (id: number) => join(STATE, `${id}.urls.txt`);
const archiveFile = (id: number) => join(STATE, `${id}.archive.txt`);
let lastId = 0;
const newId = () => (lastId = Math.max(Date.now(), lastId + 1));

/** Compares folder names with titles: yt-dlp swaps | : ? etc. for look-alike characters. */
const sameName = (a: string, b: string) => {
  const n = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  return n(a) === n(b);
};

/** Folder name for a title, using the same look-alike characters as yt-dlp's --windows-filenames. */
const safeFolder = (title: string) => {
  const map: Record<string, string> = { '"': '＂', '*': '＊', ':': '：', '<': '＜', '>': '＞', '?': '？', '|': '｜', '/': '⧸', '\\': '⧹' };
  const s = title.replace(/["*:<>?|/\\]/g, (c) => map[c]).replace(/[\u0000-\u001f]/g, '').replace(/[. ]+$/, '').trim();
  return s.slice(0, 150) || 'Playlist';
};

const isVideoUrl = (u: string) => !/[?&]list=/.test(u) || (/[?&]v=/.test(u) && /[?&]list=RD/.test(u));

// ---------------------------------------------------------------- files

const isMp3 = (f: string) => /\.mp3$/i.test(f) && !/\.temp\.mp3$/i.test(f);

function mp3s(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => join(dir, f))
    .filter((f) => isMp3(f) && statSync(f).isFile());
}

/** Leaves only finished .mp3 files: removes covers, .temp/.part files and empty folders. */
function cleanup(dir: string) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const f = join(dir, name);
    if (statSync(f).isDirectory()) {
      cleanup(f);
      if (!readdirSync(f).length) rmSync(f, { recursive: true });
    } else if (!isMp3(f)) {
      rmSync(f, { force: true });
    }
  }
}

const dirSize = (dir: string) => mp3s(dir).reduce((n, f) => n + statSync(f).size, 0);

type Probe = { size: number; mtime: number; vid: string | null; dur: number };
let probeCache: Record<string, Probe> = {};
try {
  probeCache = JSON.parse(readFileSync(PROBE_CACHE, 'utf8'));
} catch {}

/** Length and YouTube id of an MP3 (cached until the file changes). */
function probe(file: string): Promise<Probe> {
  const st = statSync(file);
  const key = relative(LIB, file);
  const hit = probeCache[key];
  if (hit && hit.size === st.size && hit.mtime === st.mtimeMs) return Promise.resolve(hit);
  return new Promise((ok) => {
    execFile(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration:format_tags=purl,comment', '-of', 'json', file],
      { windowsHide: true },
      (err, stdout) => {
        let vid: string | null = null;
        let dur = 0;
        if (!err) {
          try {
            const f = JSON.parse(stdout).format ?? {};
            dur = Number(f.duration) || 0;
            vid = `${f.tags?.purl ?? ''} ${f.tags?.comment ?? ''}`.match(/watch\?v=([\w-]{11})/)?.[1] ?? null;
          } catch {}
        }
        const p = { size: st.size, mtime: st.mtimeMs, vid, dur };
        probeCache[key] = p;
        ok(p);
      },
    );
  });
}

async function probeAll(files: string[]) {
  const out: (Probe & { file: string })[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (i < files.length) {
        const file = files[i++];
        out.push({ file, ...(await probe(file)) });
      }
    }),
  );
  mkdirSync(STATE, { recursive: true });
  writeFileSync(PROBE_CACHE, JSON.stringify(probeCache));
  return out;
}

/** A song counts as complete when its MP3 is (nearly) as long as the video. */
const isComplete = (dur: number, expected?: number) => (expected ? dur >= expected * 0.95 - 3 : dur >= 5);

// ---------------------------------------------------------------- yt-dlp

let binary: Promise<string> | null = null;

const version = (bin: string) => {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};

/** yt-dlp from PATH, or the standalone release downloaded into .tools/. */
function findYtDlp(log: (s: string) => void): Promise<string> {
  binary ??= (async () => {
    if (version('yt-dlp')) return 'yt-dlp';
    if (existsSync(LOCAL_BIN) && version(LOCAL_BIN)) return LOCAL_BIN;
    log(`yt-dlp not found — downloading ${RELEASE}`);
    mkdirSync(TOOLS, { recursive: true });
    const res = await fetch(RELEASE);
    if (!res.ok) throw new Error(`Could not download yt-dlp (${res.status})`);
    writeFileSync(LOCAL_BIN, Buffer.from(await res.arrayBuffer()));
    if (!isWin) chmodSync(LOCAL_BIN, 0o755);
    return LOCAL_BIN;
  })().catch((e) => {
    binary = null;
    throw e;
  });
  return binary;
}

/** Options every yt-dlp call gets locally. */
const baseArgs = () => [
  // Locally we use the Node.js that runs this dev server as yt-dlp's JS runtime.
  '--js-runtimes', `node:${process.execPath}`,
  ...(existsSync(COOKIES) ? ['--cookies', COOKIES] : []),
];

/** Lists a playlist (or one video) on YouTube without downloading: ids, titles, lengths. */
function listUrl(bin: string, url: string): Promise<{ title?: string; items: { id: string; title: string; duration?: number }[] }> {
  return new Promise((ok, fail) => {
    execFile(
      bin,
      [...baseArgs(), '--flat-playlist', '-J', '--no-warnings', url],
      { maxBuffer: 256 * 1024 * 1024, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
      (err, stdout, stderr) => {
        if (err && !stdout) return fail(new Error(stderr.split(/\r?\n/).find((l) => l.startsWith('ERROR')) ?? err.message));
        try {
          const j = JSON.parse(stdout);
          const list = j.entries ?? [j];
          ok({
            title: j.entries ? j.title : undefined,
            items: list.filter((e: any) => e?.id).map((e: any) => ({ id: e.id, title: e.title ?? '', duration: e.duration ?? undefined })),
          });
        } catch (e) {
          fail(e as Error);
        }
      },
    );
  });
}

// ---------------------------------------------------------------- library

/**
 * Safety net for the old layout (local-downloads/<number>/<playlist>/): moves
 * those songs into the playlist folders and the loose bookkeeping files into
 * .state/legacy, so the library only ever holds playlist folders.
 */
function absorbNumberedFolders() {
  const legacy = join(STATE, 'legacy');
  for (const d of readdirSync(LIB, { withFileTypes: true })) {
    const from = join(LIB, d.name);
    if (d.isFile()) {
      mkdirSync(legacy, { recursive: true });
      renameSync(from, join(legacy, d.name));
      continue;
    }
    if (!/^\d+$/.test(d.name) || pidsFor(Number(d.name)).length) continue;
    for (const pl of readdirSync(from, { withFileTypes: true }).filter((x) => x.isDirectory())) {
      const target = join(LIB, pl.name);
      mkdirSync(target, { recursive: true });
      for (const f of mp3s(join(from, pl.name))) {
        const dest = join(target, basename(f));
        // keep the larger (more complete) copy of a song
        if (existsSync(dest) && statSync(dest).size >= statSync(f).size) rmSync(f, { force: true });
        else renameSync(f, dest);
      }
    }
    cleanup(from);
    if (!mp3s(from).length) rmSync(from, { recursive: true, force: true });
  }
}

/** Makes sure every playlist folder has an entry and a job in the list. */
function syncLibrary() {
  mkdirSync(LIB, { recursive: true });
  absorbNumberedFolders();
  const folders = readdirSync(LIB, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  let changed = false;
  for (const folder of folders) {
    if (Object.values(entries).some((e) => e.folder === folder)) continue;
    const id = newId();
    entries[id] = { id, folder, title: folder.normalize('NFKC'), urls: [] };
    changed = true;
  }
  for (const e of Object.values(entries)) {
    const onDisk = folders.includes(e.folder);
    const job = jobs.get(e.id);
    // a folder deleted by hand (and not being downloaded) leaves the library
    if (!onDisk && !e.urls.length && job?.status !== 'in_progress' && job?.status !== 'queued') {
      delete entries[e.id];
      jobs.delete(e.id);
      changed = true;
      continue;
    }
    if (!job) jobs.set(e.id, idleJob(e));
    else if (job.detached) refreshDetached(job);
  }
  if (changed) saveEntries();
}

/** Status line for a playlist that is not being downloaded right now. */
function summary(e: Entry) {
  const files = mp3s(join(LIB, e.folder)).length;
  if (!e.checkedAt || !e.total) return `${files} song(s) on disk · not checked yet — click Update`;
  const na = e.unavailable ? ` · ${e.unavailable} private/removed on YouTube` : '';
  if (!e.missing) return `Complete · ${e.complete}/${e.total} songs (100%)${na}`;
  return `${e.complete}/${e.total} songs · ${e.missing} missing${na}`;
}

function idleJob(e: Entry): Job {
  const files = mp3s(join(LIB, e.folder)).length;
  const running = pidsFor(e.id).length > 0;
  return {
    id: e.id,
    status: running ? 'in_progress' : e.paused ? 'paused' : 'completed',
    conclusion: running || e.paused ? null : files ? 'success' : 'failure',
    step: running ? 'Still downloading (picked up after a restart)' : e.paused ? pausedStep(e) : summary(e),
    createdAt: new Date(e.id).toISOString(),
    endedAt: e.checkedAt,
    item: 0,
    total: 0,
    errors: 0,
    log: [],
    kbps: '192',
    expected: new Map(),
    unavailable: new Set(),
    detached: running,
  };
}

const public_ = (j: Job) => {
  const e = entryOf(j.id);
  const dir = join(LIB, e?.folder ?? '');
  return {
    id: j.id,
    display_title: `MP3 · ${e?.title ?? 'Playlist'} · ${j.id}`,
    status: j.status,
    conclusion: j.conclusion,
    html_url: `/__debug/jobs/${j.id}/log`,
    created_at: j.createdAt,
    run_started_at: j.startedAt,
    updated_at: j.endedAt ?? new Date().toISOString(),
    step: j.step,
    files: mp3s(dir).length,
    errors: j.errors,
    size: j.status === 'completed' ? dirSize(dir) : 0,
    total: e?.total ?? 0,
    missing: j.status === 'completed' ? e?.missing ?? 0 : 0,
    unavailable: e?.unavailable ?? 0,
    needsUpdate: j.status === 'completed' && !!e && (!e.checkedAt || !!e.missing || !!j.error || !mp3s(dir).length),
  };
};

/** Checked through a function: a job can be cancelled while it waits. */
const cancelled = (job: Job) => job.conclusion === 'cancelled';
/** Pause was clicked; the job stops at its next checkpoint (or right away when yt-dlp is killed). */
const pausing = (job: Job) => !!entryOf(job.id)?.paused;

function pausedStep(e: Entry) {
  const files = mp3s(join(LIB, e.folder)).length;
  return e.total ? `Paused · ${Math.min(files, e.total)}/${e.total} songs` : `Paused · ${files} song(s) on disk`;
}

/** Stops a paused job and lets the next playlist in line start. */
function stopPaused(job: Job) {
  const e = entryOf(job.id);
  setActive(job, false);
  job.proc = undefined;
  if (job.timer) clearTimeout(job.timer);
  job.timer = undefined;
  const i = waiting.indexOf(job);
  if (i >= 0) waiting.splice(i, 1);
  if (e) cleanup(join(LIB, e.folder));
  rmSync(listFile(job.id), { force: true });
  job.status = 'paused';
  job.step = e ? pausedStep(e) : 'Paused';
  jobLog(job, '--- paused ---');
  setTimeout(startNext, 0);
}

const jobLog = (job: Job, line: string) => {
  job.log.push(line);
  if (job.log.length > 5000) job.log.splice(0, 1000);
};

// ---------------------------------------------------------------- checking a folder

/**
 * Compares the folder with what YouTube lists. Complete songs are recorded in
 * the download archive (so yt-dlp skips them); incomplete MP3s and duplicate
 * copies are deleted so they get downloaded again.
 */
async function checkFolder(job: Job) {
  const e = entryOf(job.id);
  const dir = join(LIB, e.folder);
  mkdirSync(dir, { recursive: true });
  cleanup(dir);
  mkdirSync(dir, { recursive: true });

  const probes = await probeAll(mp3s(dir));
  const byVid = new Map<string, (Probe & { file: string })[]>();
  for (const p of probes) {
    let vid = p.vid;
    // older files without a stored link: match by file name
    if (!vid) {
      const name = basename(p.file, '.mp3');
      vid = [...job.expected].find(([, x]) => sameName(safeFolder(x.title), name))?.[0] ?? null;
    }
    if (vid) byVid.set(vid, [...(byVid.get(vid) ?? []), p]);
  }

  const complete = new Set<string>();
  const missing = new Set<string>();
  for (const [vid, x] of job.expected) {
    if (job.unavailable.has(vid)) continue;
    const copies = (byVid.get(vid) ?? []).sort((a, b) => b.dur - a.dur);
    for (const extra of copies.slice(1)) rmSync(extra.file, { force: true }); // same song twice
    const best = copies[0];
    if (best && isComplete(best.dur, x.duration)) {
      complete.add(vid);
    } else {
      if (best) {
        jobLog(job, `Replacing incomplete "${x.title}" (${Math.round(best.dur)}s of ${x.duration ?? '?'}s)`);
        rmSync(best.file, { force: true });
      }
      missing.add(vid);
    }
  }

  writeFileSync(archiveFile(job.id), [...complete].map((v) => `youtube ${v}`).join('\n') + (complete.size ? '\n' : ''));
  Object.assign(e, {
    total: job.expected.size,
    complete: complete.size,
    missing: missing.size,
    unavailable: job.unavailable.size,
    checkedAt: new Date().toISOString(),
  });
  saveEntries();
  return { complete, missing };
}

// ---------------------------------------------------------------- running a playlist

async function runJob(job: Job) {
  const e = entryOf(job.id);
  Object.assign(job, { status: 'in_progress', conclusion: null, endedAt: undefined, errors: 0, detached: false, error: undefined });
  job.startedAt = new Date().toISOString();
  job.expected = new Map();
  job.unavailable = new Set();
  try {
    const bin = await findYtDlp((l) => jobLog(job, l));
    jobLog(job, `--- ${new Date().toLocaleString()} · checking "${e.title}" (yt-dlp ${version(bin)}) ---`);

    job.step = 'Reading the playlist on YouTube…';
    for (const url of e.urls) {
      const list = await listUrl(bin, url);
      for (const it of list.items) {
        if (/^\[(private|deleted) video\]$/i.test(it.title)) job.unavailable.add(it.id);
        job.expected.set(it.id, { title: it.title, duration: it.duration });
      }
      jobLog(job, `${url}: ${list.items.length} song(s) listed`);
    }
    if (cancelled(job)) return finishJob(job);
    if (pausing(job)) return stopPaused(job);

    job.step = `Checking ${job.expected.size} song(s) on disk…`;
    const { complete, missing } = await checkFolder(job);
    jobLog(job, `${complete.size} complete, ${missing.size} missing or incomplete, ${job.unavailable.size} private/removed`);
    if (!missing.size || cancelled(job)) return finishJob(job);
    if (pausing(job)) return stopPaused(job);

    writeFileSync(listFile(job.id), e.urls.join('\n'));
    runRound(job, bin, 0);
  } catch (err) {
    job.error = (err as Error).message.replace(/^ERROR:s*/, '');
    jobLog(job, `ERROR: ${job.error}`);
    finishJob(job);
  }
}

function runRound(job: Job, bin: string, round: number) {
  const e = entryOf(job.id);
  job.timer = undefined;
  const template = `${e.folder.replace(/%/g, '%%')}/%(title)s.%(ext)s`;
  const args = [
    '--config-locations', CONF,
    ...baseArgs(),
    '--batch-file', listFile(job.id),
    '--download-archive', archiveFile(job.id),
    '--audio-quality', `${job.kbps}K`,
    '--paths', LIB,
    '--output', template,
    ...(round > 0 ? SLOW_ARGS : []),
  ];
  jobLog(job, round ? `--- retry round ${round}/${RETRY_WAITS.length} ---` : `> yt-dlp ${args.join(' ')}`);
  const todo = (e.missing ?? 0) || '';
  job.step = round ? `Retrying ${todo} missing song(s) (round ${round}/${RETRY_WAITS.length})` : `Downloading ${todo} missing song(s)…`;

  const proc = spawn(bin, args, { cwd: ROOT, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  job.proc = proc;
  const prefix = () => `${round ? `Retry ${round} · ` : ''}${job.total ? `Song ${job.item}/${job.total} · ` : ''}`;

  const onLine = (line: string) => {
    if (!line.trim()) return;
    jobLog(job, line);
    let m: RegExpMatchArray | null;
    if ((m = line.match(/Downloading (?:item|video) (\d+) of (\d+)/))) {
      job.item = +m[1];
      job.total = +m[2];
    } else if ((m = line.match(/^\[download\]\s+([\d.]+)% of/))) {
      job.step = `${prefix()}downloading ${Math.round(+m[1])}%`;
    } else if (/^\[ExtractAudio\]/.test(line)) {
      job.step = `${prefix()}converting to MP3`;
    } else if (/has already been recorded in the archive/.test(line)) {
      job.step = `${prefix()}already complete, skipped`;
    } else if (/^ERROR:/.test(line)) {
      job.errors++;
      if ((m = line.match(/^ERROR: \[youtube\] ([\w-]{11}):/)) && PERMANENT.test(line)) job.unavailable.add(m[1]);
    }
  };
  const split = (stream: NodeJS.ReadableStream) => {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      buf += chunk;
      const lines = buf.split(/\r?\n|\r/);
      buf = lines.pop() ?? '';
      lines.forEach(onLine);
    });
    stream.on('end', () => onLine(buf));
  };
  split(proc.stdout!);
  split(proc.stderr!);

  proc.on('close', async (code) => {
    job.proc = undefined;
    jobLog(job, `yt-dlp exited with code ${code}`);
    if (cancelled(job)) return finishJob(job);
    if (pausing(job)) return stopPaused(job);
    job.step = 'Checking the downloaded songs…';
    const { missing } = await checkFolder(job);
    if (pausing(job) && !cancelled(job)) return stopPaused(job);
    if (missing.size && round < RETRY_WAITS.length && !cancelled(job)) {
      const wait = RETRY_WAITS[round];
      jobLog(job, `${missing.size} song(s) still missing — retrying in ${wait}s with slower requests…`);
      job.step = `${missing.size} song(s) still missing — retrying in ${wait / 60} min (round ${round + 1}/${RETRY_WAITS.length})`;
      job.timer = setTimeout(() => runRound(job, bin, round + 1), wait * 1000);
      return;
    }
    finishJob(job);
  });
  proc.on('error', (err) => jobLog(job, `ERROR: ${err.message}`));
}

function finishJob(job: Job) {
  const e = entryOf(job.id);
  const i = waiting.indexOf(job);
  if (i >= 0) waiting.splice(i, 1);
  setActive(job, false);
  if (e) cleanup(join(LIB, e.folder));
  rmSync(listFile(job.id), { force: true });
  job.status = 'completed';
  job.endedAt = new Date().toISOString();
  const files = e ? mp3s(join(LIB, e.folder)).length : 0;
  if (!cancelled(job)) job.conclusion = files && !job.error ? 'success' : 'failure';
  job.step =
    cancelled(job) ? 'Cancelled'
    : job.error ? `Check failed — ${job.error.slice(0, 140)}`
    : e?.checkedAt ? summary(e) : 'Failed — open the log for details';
  if (e?.missing && job.log.some((l) => /confirm you.re not a bot/i.test(l))) {
    jobLog(job, 'HINT: YouTube is rate-limiting this connection. Wait a while and click Update, or refresh cookies.txt.');
  }
  setTimeout(startNext, 0);
}

// ---------------------------------------------------------------- queue
//
// Playlists download one at a time: parallel downloads are what makes
// YouTube start refusing songs ("confirm you're not a bot").

const waiting: Job[] = [];
const busy = () => [...jobs.values()].some((j) => j.status === 'in_progress');

function enqueue(job: Job) {
  if (job.status === 'in_progress' || waiting.includes(job)) return;
  Object.assign(job, { status: 'queued', conclusion: null, endedAt: undefined, step: 'Waiting for its turn' });
  waiting.push(job);
  setActive(job, true);
  // decided a tick later, so links added together start bottom to top
  setTimeout(startNext, 0);
}

function setActive(job: Job, active: boolean) {
  const e = entryOf(job.id);
  if (!e || !!e.active === active) return;
  e.active = active;
  saveEntries();
}

/**
 * After a dev-server restart: playlists that were downloading or waiting are
 * put back in line (bottom to top). Finished songs are skipped by the check.
 */
let queueRestored = false;
function restoreQueue() {
  if (queueRestored) return;
  queueRestored = true;
  for (const e of Object.values(entries).sort((a, b) => a.id - b.id)) {
    if (!e.active || e.paused || e.hidden || !e.urls.length) continue;
    const job = jobs.get(e.id);
    if (!job || job.detached) continue; // still running from before the restart
    enqueue(job);
  }
}

/** Next playlist to download: the waiting one lowest in the list (oldest), so the list is worked bottom to top. */
function startNext() {
  if (busy() || !waiting.length) return;
  waiting.sort((a, b) => a.id - b.id);
  void runJob(waiting.shift()!);
}

// ---------------------------------------------------------------- downloads that outlived a restart

let procCache: { at: number; lines: string[] } = { at: 0, lines: [] };

/** Command lines of running yt-dlp processes (cached for a few seconds). */
function ytDlpProcesses(): string[] {
  if (Date.now() - procCache.at < 4000) return procCache.lines;
  const r = isWin
    ? spawnSync('powershell', ['-NoProfile', '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name like 'yt-dlp%'\" | ForEach-Object { $_.ProcessId.ToString() + ' ' + $_.CommandLine }"],
        { encoding: 'utf8', windowsHide: true })
    : spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
  const lines = (r.stdout ?? '').split(/\r?\n/).filter((l) => /yt-dlp/i.test(l));
  procCache = { at: Date.now(), lines };
  return lines;
}

const pidsFor = (id: number) =>
  ytDlpProcesses().filter((l) => l.includes(`${id}.archive.txt`)).map((l) => Number(l.trim().split(/\s+/)[0])).filter(Boolean);

function refreshDetached(job: Job) {
  if (job.status !== 'in_progress' || pidsFor(job.id).length) return;
  const e = entryOf(job.id);
  if (e) cleanup(join(LIB, e.folder));
  Object.assign(job, { detached: false, status: 'completed', conclusion: 'success', endedAt: new Date().toISOString() });
  job.step = e ? summary(e) : 'Done';
}

function killJob(job: Job) {
  const pids = job.proc?.pid ? [job.proc.pid] : pidsFor(job.id);
  for (const pid of pids) {
    // yt-dlp.exe re-launches itself and spawns ffmpeg, so kill the whole tree.
    if (isWin) spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    else process.kill(pid);
  }
  procCache.at = 0;
}

// ---------------------------------------------------------------- adding links

interface Item {
  url: string;
  title?: string;
}

function findEntry(item: Item): Entry | undefined {
  const all = Object.values(entries);
  return all.find((e) => e.urls.includes(item.url)) ?? (item.title ? all.find((e) => sameName(e.folder, item.title!)) : undefined);
}

function jobFor(e: Entry, kbps: string) {
  const job = jobs.get(e.id) ?? idleJob(e);
  jobs.set(e.id, job);
  job.kbps = kbps;
  return job;
}

/** Adds links to the library: known playlists are updated, new ones get their own folder. */
function addLinks(items: Item[], kbps: string) {
  syncLibrary();
  const started: number[] = [];
  const continued: number[] = [];
  const busyWith: string[] = [];

  const add = (e: Entry, url: string, isNew: boolean) => {
    if (!e.urls.includes(url)) e.urls.push(url);
    e.hidden = false;
    e.paused = false; // adding a paused playlist again resumes it
    const job = jobFor(e, kbps);
    if (job.status === 'in_progress' || job.status === 'queued') {
      busyWith.push(e.title);
      return;
    }
    if (!started.includes(e.id)) {
      started.push(e.id);
      if (!isNew) continued.push(e.id);
    }
  };

  for (const item of items) {
    if (isVideoUrl(item.url)) {
      let e = Object.values(entries).find((x) => x.folder === SINGLES);
      const isNew = !e;
      if (!e) {
        const id = newId();
        e = entries[id] = { id, folder: SINGLES, title: SINGLES, urls: [] };
      }
      add(e, item.url, isNew);
      continue;
    }
    let e = findEntry(item);
    const isNew = !e;
    if (!e) {
      const id = newId();
      const title = item.title || `Playlist ${new URL(item.url).searchParams.get('list') ?? id}`;
      e = entries[id] = { id, folder: safeFolder(title), title, urls: [] };
    }
    add(e, item.url, isNew);
  }
  saveEntries();
  // start after all links are recorded, so a playlist gets every new link at once
  for (const id of started) enqueue(jobs.get(id)!);
  return { ids: started, continued, busy: [...new Set(busyWith)] };
}

/**
 * One-time help for downloads from before the per-playlist layout: their links
 * are in .state/legacy/*.urls.txt. Each link's title (via YouTube's oEmbed,
 * which isn't rate-limited like downloads) tells which folder it belongs to,
 * so Update works for those folders straight away.
 */
async function adoptLegacyLinks() {
  const legacy = join(STATE, 'legacy');
  if (!existsSync(legacy)) return;
  const urls = new Set<string>();
  for (const f of readdirSync(legacy).filter((n) => n.endsWith('.urls.txt'))) {
    readFileSync(join(legacy, f), 'utf8').split(/\r?\n/).map((u) => u.trim()).filter(validUrl).forEach((u) => urls.add(u));
  }
  syncLibrary();
  let changed = false;
  for (const u of urls) {
    if (isVideoUrl(u) || Object.values(entries).some((e) => e.urls.includes(u))) continue;
    try {
      const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`);
      if (!res.ok) continue;
      const { title } = (await res.json()) as { title: string };
      const e = Object.values(entries).find((x) => sameName(x.folder, title));
      if (e) {
        e.urls.push(u);
        changed = true;
      }
    } catch {}
  }
  if (changed) saveEntries();
}

// ---------------------------------------------------------------- HTTP

const send = (res: ServerResponse, status: number, body: unknown, type = 'application/json') => {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.end(type === 'application/json' ? JSON.stringify(body) : (body as string | Uint8Array));
};

const readBody = (req: IncomingMessage) =>
  new Promise<string>((ok, fail) => {
    let s = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => (s += c));
    req.on('end', () => ok(s));
    req.on('error', fail);
  });

const validUrl = (u: string) => /^https:\/\/((www|m|music)\.)?(youtube\.com|youtu\.be)\//.test(u);

async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/__debug/')) return next();
  try {
    const parts = url.pathname.split('/').filter(Boolean).slice(1); // after __debug

    if (parts[0] === 'status') {
      const bin = existsSync(LOCAL_BIN) ? LOCAL_BIN : 'yt-dlp';
      return send(res, 200, {
        ytdlp: version(bin),
        ffmpeg: spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status === 0,
        cookies: existsSync(COOKIES),
        output: LIB,
      });
    }

    // Read-only: which library playlist a link would update.
    if (parts[0] === 'match') {
      syncLibrary();
      const e = findEntry({ url: url.searchParams.get('url') ?? '', title: url.searchParams.get('title') ?? undefined });
      return send(res, 200, e ? { id: e.id, folder: e.folder, songs: mp3s(join(LIB, e.folder)).length } : { id: null });
    }

    if (parts[0] !== 'jobs') return send(res, 404, { message: 'Not found' });
    syncLibrary();
    restoreQueue();

    if (parts.length === 1 && req.method === 'GET') {
      const visible = [...jobs.values()].filter((j) => entryOf(j.id) && !entryOf(j.id).hidden);
      // fixed order, newest on top; downloads are worked from the bottom up
      visible.sort((a, b) => b.id - a.id);
      return send(res, 200, visible.map(public_));
    }
    if (parts.length === 1 && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as { urls?: string[]; items?: Item[]; bitrate: string };
      const items: Item[] = (body.items ?? (body.urls ?? []).map((u) => ({ url: u }))).filter((i) => validUrl(i.url));
      if (!items.length) return send(res, 422, { message: 'No valid YouTube URLs' });
      const kbps = ['128', '192', '256', '320'].includes(String(body.bitrate)) ? String(body.bitrate) : '192';
      const r = addLinks(items, kbps);
      if (!r.ids.length) return send(res, 409, { message: `Already downloading: ${r.busy.join(', ')}` });
      return send(res, 201, { ...r, ...public_(jobs.get(r.ids[0])!) });
    }

    const job = jobs.get(Number(parts[1]));
    const e = job && entryOf(job.id);
    if (!job || !e) return send(res, 404, { message: 'Job not found' });
    const action = parts[2];

    if (!action && req.method === 'DELETE') {
      if (job.status !== 'completed' && job.status !== 'paused') return send(res, 409, { message: 'Pause or cancel the download before removing it' });
      // Only hides the playlist from the list; the MP3s stay in local-downloads/.
      e.hidden = true;
      saveEntries();
      return send(res, 200, { removed: job.id });
    }
    if (!action) return send(res, 200, public_(job));
    if (action === 'log') return send(res, 200, job.log.join('\n') || 'No log yet — click Update to check this playlist.', 'text/plain; charset=utf-8');
    if (action === 'cancel' && req.method === 'POST') {
      job.conclusion = 'cancelled';
      if (e.paused) {
        e.paused = false;
        saveEntries();
      }
      if (job.timer) clearTimeout(job.timer);
      killJob(job);
      if (!job.proc) finishJob(job);
      return send(res, 200, public_(job));
    }
    if (action === 'pause' && req.method === 'POST') {
      if (job.status !== 'in_progress' && job.status !== 'queued') return send(res, 409, { message: 'This playlist is not downloading' });
      e.paused = true;
      saveEntries();
      if (job.status === 'queued' || job.timer) stopPaused(job);
      else if (job.proc) killJob(job); // its close handler calls stopPaused
      else if (job.detached) {
        killJob(job);
        stopPaused(job);
      }
      // otherwise it is listing/checking and stops at the next checkpoint
      return send(res, 200, public_(job));
    }
    if (action === 'resume' && req.method === 'POST') {
      if (job.status !== 'paused') return send(res, 409, { message: 'This playlist is not paused' });
      e.paused = false;
      saveEntries();
      enqueue(job);
      return send(res, 200, public_(job));
    }
    if (action === 'retry' && req.method === 'POST') {
      if (job.status !== 'completed') return send(res, 409, { message: 'This playlist is already being downloaded' });
      if (!e.urls.length) return send(res, 409, { message: 'Add this playlist\'s link once, so it can be checked against YouTube' });
      e.hidden = false;
      enqueue(job);
      return send(res, 200, public_(job));
    }
    if (action === 'zip') {
      const files: Record<string, [Uint8Array, { level: 0 }]> = {};
      const dir = join(LIB, e.folder);
      for (const f of mp3s(dir)) files[`${e.folder}/${relative(dir, f).replace(/\\/g, '/')}`] = [readFileSync(f), { level: 0 }];
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(e.folder)}.zip`);
      return send(res, 200, zipSync(files), 'application/zip');
    }
    return send(res, 404, { message: 'Not found' });
  } catch (err) {
    return send(res, 500, { message: (err as Error).message });
  }
}

export default function debugDownloader(): AstroIntegration {
  return {
    name: 'debug-downloader',
    hooks: {
      // A pre-ordered Vite plugin puts the /__debug routes in front of Astro's
      // own router, which would otherwise answer them with a 404.
      'astro:config:setup': ({ command, updateConfig, logger }) => {
        if (command !== 'dev') return;
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'debug-downloader',
                enforce: 'pre',
                apply: 'serve',
                configureServer(server) {
                  server.middlewares.use((req, res, next) => void handle(req, res, next));
                  logger.info(`Debug downloader ready — MP3s are saved to ${resolve(LIB)}`);
                  void adoptLegacyLinks();
                },
              },
            ],
          },
        });
      },
    },
  };
}
