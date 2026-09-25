import { extractLinks, type Link } from './parse';
import { GitHub, loadConfig, saveConfig, type Artifact, type Backend, type Run, type Step } from './github';
import { DebugBackend } from './debug';
import { DEBUG } from '../config';
import { dismiss, reveal } from './ui';
import { plain, t, tr, trAttr } from './i18n';
import type { Vars } from '../../shared/i18n';

// ---------------------------------------------------------------- DOM

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const drop = $<HTMLLabelElement>('drop');
const fileInput = $<HTMLInputElement>('file');
const linksEl = $<HTMLUListElement>('links');
const runsEl = $<HTMLUListElement>('runs');
const linkCount = $('link-count');
const runCount = $('run-count');
const selectAll = $<HTMLInputElement>('select-all');
const bitrate = $<HTMLSelectElement>('bitrate');
const go = $<HTMLButtonElement>('go');
const statusEl = $('status');
const connLabel = $('conn-label');

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]) => {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...kids);
  return el;
};

/** Status line under the lists. Pass a translation key (or '' to clear it). */
const setStatus = (key: string, vars?: Vars) => (key ? tr(statusEl, key, vars) : plain(statusEl, ''));

/** Error text for the status line. */
const failed = (e: unknown) => ({ error: (e as Error).message });

function saveBlob(blob: Blob, name: string) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

const gh = new GitHub(loadConfig());
// DEBUG only works on the dev server; a production build always uses GitHub.
const debug = DEBUG && import.meta.env.DEV ? new DebugBackend() : null;
const backend: Backend = debug ?? gh;

// ---------------------------------------------------------------- links

interface LinkEntry {
  link: Link;
  title: string;
  selected: boolean;
  /** true = exists, false = missing/private, null = not checked yet */
  valid: boolean | null;
  el: HTMLLIElement;
  check: HTMLInputElement;
}

const links = new Map<string, LinkEntry>();
let dispatching = false;

function refresh() {
  const selected = [...links.values()].filter((l) => l.selected && l.valid !== false);
  linkCount.textContent = links.size ? `${selected.length}/${links.size}` : '0';
  selectAll.checked = links.size > 0 && selected.length === links.size;
  selectAll.indeterminate = selected.length > 0 && selected.length < links.size;
  go.disabled = dispatching || selected.length === 0;
  if (!dispatching) {
    go.textContent = !backend.ready
      ? t('yt.choose.connectFirst')
      : selected.length
        ? t('yt.choose.convertN', { n: selected.length })
        : t('yt.choose.convert');
  }
  if (backend.ready) plain(connLabel, backend.label);
  else tr(connLabel, 'yt.connect');
}

function setRunCount() {
  runCount.textContent = String(runs.size);
}

/** YouTube's oEmbed endpoint allows CORS and tells us whether a link exists. */
async function lookup(entry: LinkEntry, title: HTMLElement, sub: HTMLElement, img: HTMLImageElement) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(entry.link.url)}`);
    if (res.ok) {
      const d = (await res.json()) as { title: string; author_name?: string; thumbnail_url?: string };
      entry.valid = true;
      entry.title = d.title;
      title.textContent = title.title = d.title;
      plain(sub, d.author_name?.replace(/\s+-\s+Topic$/, '') || '');
      if (d.thumbnail_url) img.src = d.thumbnail_url;
    } else {
      entry.valid = false;
      entry.selected = entry.check.checked = false;
      entry.check.disabled = true;
      tr(sub, res.status === 401 || res.status === 403 ? 'yt.link.private' : 'yt.link.notFound');
      sub.classList.add('err');
    }
  } catch {
    tr(sub, 'yt.link.unchecked');
  }
  refresh();
}

function addLink(link: Link) {
  const key = `${link.kind}:${link.id}`;
  if (links.has(key)) return;

  const check = h('input', { type: 'checkbox', checked: true, className: 'checkbox checkbox-sm checkbox-primary' });
  const img = h('img', { className: 'thumb', loading: 'lazy', alt: '' });
  if (link.kind === 'video') img.src = `https://i.ytimg.com/vi/${link.id}/mqdefault.jpg`;
  img.onerror = () => (img.style.visibility = 'hidden');
  const title = h('span', { className: 'title', textContent: link.url, title: link.url });
  const sub = tr(h('span', { className: 'sub' }), 'yt.link.checking');
  const remove = trAttr(h('button', { className: 'btn btn-ghost btn-xs', type: 'button', textContent: '✕' }), 'title', 'common.remove');
  const el = h(
    'li',
    {},
    check,
    img,
    tr(
      h('span', { className: `badge badge-sm ${link.kind === 'playlist' ? 'badge-primary badge-soft' : 'badge-ghost'}` }),
      link.kind === 'playlist' ? 'yt.link.playlist' : 'yt.link.video',
    ),
    h('span', { className: 'meta' }, title, sub),
    remove,
  );

  const entry: LinkEntry = { link, title: link.url, selected: true, valid: null, el, check };
  check.onchange = () => {
    entry.selected = check.checked;
    refresh();
  };
  remove.onclick = () => {
    el.remove();
    links.delete(key);
    refresh();
  };
  links.set(key, entry);
  linksEl.append(el);
  reveal(el);
  lookup(entry, title, sub, img);
}

/** `source` is a file name, or "@key" for a translated description like "the pasted text". */
function ingestText(text: string, source: string) {
  const found = extractLinks(text);
  if (!found.length) {
    setStatus('yt.status.noLinks', { source });
    return;
  }
  const before = links.size;
  found.forEach(addLink);
  const added = links.size - before;
  const dupes = found.length - added;
  setStatus(dupes ? 'yt.status.foundDupes' : 'yt.status.found', { n: found.length, source, dupes });
  refresh();
}

// ---------------------------------------------------------------- paste box

const pasteBox = $<HTMLTextAreaElement>('paste');
const addPasted = $<HTMLButtonElement>('add-pasted');

function addFromPasteBox() {
  const text = pasteBox.value;
  if (!text.trim()) return;
  if (extractLinks(text).length) pasteBox.value = '';
  ingestText(text, '@yt.status.pastedBox');
  addPasted.disabled = !pasteBox.value.trim();
}

pasteBox.oninput = () => (addPasted.disabled = !pasteBox.value.trim());
addPasted.onclick = addFromPasteBox;
pasteBox.onkeydown = (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    addFromPasteBox();
  }
};

async function ingestFiles(files: FileList | File[]) {
  for (const f of files) ingestText(await f.text(), f.name);
}

selectAll.onchange = () => {
  for (const l of links.values()) {
    if (l.valid === false) continue;
    l.selected = l.check.checked = selectAll.checked;
  }
  refresh();
};

$('clear').onclick = () => {
  links.clear();
  linksEl.replaceChildren();
  setStatus('');
  refresh();
};

// ---------------------------------------------------------------- input: click / drop / paste

fileInput.onchange = () => {
  if (fileInput.files?.length) ingestFiles(fileInput.files);
  fileInput.value = '';
};

drop.onkeydown = (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
};

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  drop.classList.add('over');
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    drop.classList.remove('over');
  }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  drop.classList.remove('over');
  const dt = e.dataTransfer;
  if (!dt) return;
  if (dt.files.length) ingestFiles(dt.files);
  else {
    const text = dt.getData('text/uri-list') || dt.getData('text/plain');
    if (text) ingestText(text, '@yt.status.droppedText');
  }
});

window.addEventListener('paste', (e) => {
  if ((e.target as HTMLElement).closest('input, textarea')) return;
  const dt = e.clipboardData;
  if (!dt) return;
  if (dt.files.length) ingestFiles(dt.files);
  else ingestText(dt.getData('text/plain'), '@yt.status.pastedText');
});

// ---------------------------------------------------------------- runs

interface RunView {
  id: number;
  run?: Run;
  steps: Step[];
  artifact?: Artifact | null;
  el: HTMLLIElement;
  title: HTMLSpanElement;
  sub: HTMLSpanElement;
  actions: HTMLSpanElement;
}

const runs = new Map<number, RunView>();
let pollTimer: number | undefined;

const runLabel = (r: Run) => r.display_title.replace(/^MP3 · /, '').replace(/ · [\w-]+$/, '');

function elapsed(r: Run) {
  const start = Date.parse(r.run_started_at ?? r.created_at);
  const end = r.status === 'completed' ? Date.parse(r.updated_at) : Date.now();
  const s = Math.max(0, Math.round((end - start) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

const fmtSize = (b: number) =>
  b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;

function renderRun(v: RunView) {
  const r = v.run;
  if (!r) return;
  plain(v.title, runLabel(r)).title = runLabel(r);

  const logBtn = h('a', { className: 'btn btn-ghost btn-xs', href: r.html_url, target: '_blank', rel: 'noopener', textContent: t('yt.run.log') });
  const buttons: HTMLElement[] = [];
  let state: string;
  let cls = '';

  /** A row button that calls the backend and then refreshes the row (label and title are translation keys). */
  const action = (label: string, cls: string, title: string, call: () => Promise<unknown>) => {
    const b = h('button', { className: `btn btn-sm ${cls}`, type: 'button', title: t(title), textContent: t(label) });
    b.onclick = async () => {
      b.disabled = true;
      try {
        await call();
        v.artifact = undefined;
        await updateRun(v);
        await Promise.all([...runs.values()].filter((x) => x !== v).map((x) => updateRun(x).catch(() => {})));
        schedulePoll();
      } catch (e) {
        setStatus('yt.status.error', failed(e));
        b.disabled = false;
      }
    };
    return b;
  };

  if (r.status === 'paused') {
    state = r.step ?? t('yt.run.paused');
    if (backend.resume) buttons.push(action('yt.run.resume', 'btn-primary', 'yt.run.resumeTitle', () => backend.resume!(v.id)));
  } else if (r.status !== 'completed') {
    const current = v.steps.find((s) => s.status === 'in_progress');
    state = r.status === 'in_progress' ? `${current?.name ?? t('yt.run.running')}… ${elapsed(r)}` : r.step ?? t('yt.run.queued');
    if (backend.pause) {
      buttons.push(action('yt.run.pause', 'btn-ghost', 'yt.run.pauseTitle', () => backend.pause!(v.id)));
    }
    const cancel = h('button', { className: 'btn btn-ghost btn-xs', type: 'button', textContent: t('common.cancel') });
    cancel.onclick = async () => {
      cancel.disabled = true;
      try {
        await backend.cancel(v.id);
      } catch (e) {
        setStatus('yt.status.error', failed(e));
      }
    };
    buttons.push(cancel);
  } else if (r.conclusion === 'success') {
    const a = v.artifact;
    // debug mode reports the playlist's own status, e.g. "Complete · 217/217 songs (100%)"
    const done = r.step ?? t('yt.run.doneIn', { time: elapsed(r) });
    if (a === undefined) state = done;
    else if (!a || a.expired || !a.size_in_bytes) state = t('yt.run.gone');
    else {
      state = `${done} · ${fmtSize(a.size_in_bytes)}`;
      const dl = h('button', { className: 'btn btn-primary btn-sm', type: 'button', textContent: t('yt.run.downloadZip') });
      dl.onclick = () => downloadRun(v, a, dl);
      buttons.push(dl);
    }
    cls = r.missing ? 'err' : 'ok';
  } else {
    state = r.conclusion === 'cancelled' ? t('yt.run.cancelled') : r.step ?? t('yt.run.failed');
    cls = 'err';
  }

  // Update: only when something is missing or the playlist was never checked.
  if (r.status === 'completed' && r.conclusion !== 'cancelled' && backend.retry && (r.needsUpdate ?? true)) {
    buttons.unshift(
      action(
        r.missing ? 'yt.run.retryMissing' : 'yt.run.update',
        r.missing ? 'btn-warning' : 'btn-ghost',
        'yt.run.updateTitle',
        () => backend.retry!(v.id),
      ),
    );
  }

  plain(v.sub, state);
  v.sub.className = `sub ${cls}`;
  const extra: HTMLElement[] = [logBtn];
  if (r.status === 'completed' || r.status === 'paused') {
    const remove = h('button', { className: 'btn btn-ghost btn-xs', type: 'button', title: t('yt.run.removeTitle'), textContent: '✕' });
    remove.onclick = () => removeRun(v);
    extra.push(remove);
  }
  v.actions.replaceChildren(...buttons, ...extra);
}

/** Takes a finished job off the list (on GitHub this deletes the run and its ZIP). */
async function removeRun(v: RunView) {
  if (!runs.has(v.id)) return;
  runs.delete(v.id);
  hideRun(v.id);
  setRunCount();
  dismiss(v.el);
  try {
    await backend.remove(v.id);
  } catch (e) {
    setStatus('yt.status.couldNotRemove', { name: v.run ? runLabel(v.run) : v.id, ...failed(e) });
  }
}

// Removed jobs are also remembered in this browser, so they stay gone after a
// reload even if the server couldn't delete them.
const HIDDEN_KEY = 'ytmp3.removedRuns';
const hiddenRuns = new Set<number>(
  (() => {
    try {
      return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]') as number[];
    } catch {
      return [];
    }
  })(),
);

function unhideRun(id: number) {
  if (!hiddenRuns.delete(id)) return;
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hiddenRuns]));
  } catch {}
}

function hideRun(id: number) {
  hiddenRuns.add(id);
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hiddenRuns].slice(-500)));
  } catch {}
}

const isCancelled = (r?: Run) => r?.status === 'completed' && r.conclusion === 'cancelled';

async function downloadRun(v: RunView, a: Artifact, btn: HTMLButtonElement) {
  btn.disabled = true;
  btn.textContent = t('yt.run.downloading');
  try {
    const blob = await backend.downloadArtifact(a);
    saveBlob(blob, `${runLabel(v.run!).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 100) || 'mp3'}.zip`);
  } catch {
    // Browsers can't always follow the API redirect cross-origin; the web link works when signed in to GitHub.
    window.open(backend.artifactPage(v.id, a.id), '_blank', 'noopener');
  } finally {
    btn.disabled = false;
    btn.textContent = t('yt.run.downloadZip');
  }
}

function addRunView(id: number, run?: Run, prepend = false): RunView {
  const existing = runs.get(id);
  if (existing) return existing;
  const title = tr(h('span', { className: 'title' }), 'yt.run.starting');
  const sub = tr(h('span', { className: 'sub' }), 'yt.run.queued');
  const actions = h('span', { className: 'actions' });
  const el = h('li', {}, h('span', { className: 'meta' }, title, sub), actions);
  const v: RunView = { id, run, steps: [], el, title, sub, actions };
  runs.set(id, v);
  prepend ? runsEl.prepend(el) : runsEl.append(el);
  reveal(el);
  setRunCount();
  renderRun(v);
  return v;
}

async function updateRun(v: RunView) {
  v.run = await backend.run(v.id);
  if (isCancelled(v.run)) return removeRun(v);
  if (v.run.status === 'in_progress') v.steps = await backend.steps(v.id).catch(() => v.steps);
  if (v.run.status === 'completed' && v.run.conclusion === 'success' && v.artifact === undefined) {
    const list = await backend.artifacts(v.id);
    v.artifact = list[0] ?? null;
  }
  renderRun(v);
}

function schedulePoll() {
  clearTimeout(pollTimer);
  const active = [...runs.values()].filter((v) => v.run?.status !== 'completed' && v.run?.status !== 'paused');
  if (!active.length) return;
  pollTimer = window.setTimeout(async () => {
    await Promise.all(active.map((v) => updateRun(v).catch(() => {})));
    for (const v of active) {
      if (v.run?.status === 'completed' && !isCancelled(v.run)) {
        const name = runLabel(v.run);
        if (v.run.conclusion === 'success') setStatus('yt.status.ready', { name });
        else setStatus('yt.status.finished', { name, result: v.run.conclusion ?? '' });
      }
    }
    schedulePoll();
  }, 5000);
}

async function loadRuns() {
  if (!backend.ready) return;
  try {
    const list = await backend.runs(10);
    runs.clear();
    runsEl.replaceChildren();
    for (const r of list) {
      if (hiddenRuns.has(r.id)) continue;
      if (isCancelled(r)) {
        hideRun(r.id);
        backend.remove(r.id).catch(() => {});
      } else addRunView(r.id, r);
    }
    setRunCount();
    await Promise.all(
      [...runs.values()].filter((v) => v.run?.status === 'completed' && v.run.conclusion === 'success').map((v) => updateRun(v).catch(() => {})),
    );
    schedulePoll();
  } catch (e) {
    setStatus('yt.status.github', failed(e));
  }
}

$('refresh').onclick = loadRuns;

$('clear-runs').onclick = () => {
  const done = [...runs.values()].filter((v) => v.run?.status === 'completed');
  if (!done.length) return void setStatus('yt.status.nothingToClear');
  done.forEach(removeRun);
  setStatus('yt.status.cleared', { n: done.length });
};

// ---------------------------------------------------------------- start a conversion

// workflow_dispatch payloads are capped at ~64 KB, so very long lists are split.
const CHUNK = 400;

go.onclick = async () => {
  if (!backend.ready) {
    openSettings();
    return;
  }
  const chosen = [...links.values()].filter((l) => l.selected && l.valid !== false);
  if (!chosen.length) return;

  dispatching = true;
  go.classList.add('busy');
  go.disabled = true;
  go.textContent = t('yt.choose.starting');
  const notes: string[] = [];
  try {
    for (let i = 0; i < chosen.length; i += CHUNK) {
      const part = chosen.slice(i, i + CHUNK);
      const first = part[0].valid ? part[0].title : part[0].link.url;
      const label = `${first.slice(0, 60)}${part.length > 1 ? ` +${part.length - 1}` : ''}`;
      if (chosen.length > CHUNK) setStatus('yt.status.startingWorkflowPart', { part: i / CHUNK + 1, total: Math.ceil(chosen.length / CHUNK) });
      else setStatus('yt.status.startingWorkflow');
      const { ids, note } = await backend.dispatch({
        urls: part.map((l) => l.link.url).join('\n'),
        items: part.map((l) => ({ url: l.link.url, title: l.valid ? l.title : undefined })),
        bitrate: bitrate.value,
        label,
        request_id: Math.random().toString(36).slice(2, 10),
      });
      if (note) notes.push(note);
      for (const id of ids) {
        unhideRun(id);
        const v = runs.get(id) ?? addRunView(id, undefined, true);
        v.artifact = undefined;
        await updateRun(v).catch(() => {});
      }
    }
    if (notes.length) setStatus('yt.status.startedNotes', { notes: notes.join(' · ') });
    else setStatus('yt.status.started');
    schedulePoll();
  } catch (e) {
    setStatus('yt.status.couldNotStart', failed(e));
  } finally {
    dispatching = false;
    go.classList.remove('busy');
    refresh();
  }
};

// ---------------------------------------------------------------- settings dialog

const dialog = $<HTMLDialogElement>('settings');
const repoInput = $<HTMLInputElement>('cfg-repo');
const tokenInput = $<HTMLInputElement>('cfg-token');
const cfgResult = $('cfg-result');

function readForm() {
  const [owner = '', repo = ''] = repoInput.value.trim().replace(/^https:\/\/github\.com\//, '').split('/');
  return { owner, repo, token: tokenInput.value.trim() };
}

function openSettings() {
  dialog.returnValue = '';
  repoInput.value = gh.cfg.owner ? `${gh.cfg.owner}/${gh.cfg.repo}` : '';
  tokenInput.value = gh.cfg.token;
  plain(cfgResult, '');
  cfgResult.className = 'cfg-result';
  dialog.showModal();
}

$('open-settings').onclick = openSettings;

// Debug mode needs no GitHub connection, so the header button is hidden;
// the status line only speaks up when a local tool is missing.
if (debug) {
  document.documentElement.dataset.debug = '';
  $('open-settings').remove();
  debug
    .status()
    .then((s) => {
      if (!s.ffmpeg) setStatus('yt.status.noFfmpeg');
    })
    .catch((e) => setStatus('yt.status.error', failed(e)));
}

$('cfg-test').onclick = async () => {
  cfgResult.className = 'cfg-result';
  tr(cfgResult, 'yt.settings.testing');
  try {
    const repo = await new GitHub(readForm()).verify();
    cfgResult.className = 'cfg-result ok';
    tr(cfgResult, 'yt.settings.connected', { repo: repo.full_name });
  } catch (e) {
    cfgResult.className = 'cfg-result err';
    tr(cfgResult, 'yt.settings.failed', failed(e));
  }
};

dialog.addEventListener('close', () => {
  if (dialog.returnValue !== 'save') return;
  gh.cfg = readForm();
  saveConfig(gh.cfg);
  refresh();
  loadRuns();
});

if (!debug && gh.cfg.owner && gh.cfg.repo) {
  ($('repo-link') as HTMLAnchorElement).href = gh.repoUrl;
  $('repo-item').hidden = false;
}

// Switching language: texts with a key are re-translated by i18n.ts; these are rebuilt.
window.addEventListener('sgoi:lang', () => {
  refresh();
  runs.forEach(renderRun);
});

refresh();
loadRuns();
