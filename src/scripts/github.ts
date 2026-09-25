// Thin client for the GitHub REST API: dispatches the "Download MP3" workflow
// and follows its runs and artifacts. api.github.com allows CORS, so this
// works from a static page with the user's own token.

export const WORKFLOW = 'download.yml';

export interface Config {
  owner: string;
  repo: string;
  token: string;
}

export interface Run {
  id: number;
  display_title: string;
  status: 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending' | 'paused';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at?: string;
  /** debug mode only: songs still missing after the retry rounds */
  missing?: number;
  /** debug mode only: the playlist's status line */
  step?: string;
  /** debug mode only: songs are missing, or the playlist was never checked */
  needsUpdate?: boolean;
}

export interface Step {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
}

export interface Artifact {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  archive_download_url: string;
}

export interface DispatchInputs {
  urls: string;
  bitrate: string;
  label: string;
  request_id: string;
  /** titles next to the links, so debug mode can find earlier downloads of the same playlist */
  items?: { url: string; title?: string }[];
}

/** What the UI needs from a place that runs conversions (GitHub Actions or local debug). */
export interface Backend {
  readonly ready: boolean;
  readonly label: string;
  /** Starts a conversion; returns the ids of the jobs that now handle it. */
  dispatch(inputs: DispatchInputs): Promise<{ ids: number[]; note?: string }>;
  runs(perPage?: number): Promise<Run[]>;
  run(id: number): Promise<Run>;
  steps(id: number): Promise<Step[]>;
  artifacts(id: number): Promise<Artifact[]>;
  cancel(id: number): Promise<unknown>;
  /** Removes a finished run from the list (and its files, on GitHub). */
  remove(id: number): Promise<unknown>;
  /** Downloads the songs a finished job is still missing (debug mode only). */
  retry?(id: number): Promise<unknown>;
  /** Pauses a download so the next one can start (debug mode only). */
  pause?(id: number): Promise<unknown>;
  /** Continues a paused download (debug mode only). */
  resume?(id: number): Promise<unknown>;
  artifactPage(runId: number, artifactId: number): string;
  downloadArtifact(a: Artifact): Promise<Blob>;
}

const STORAGE_KEY = 'ytmp3.github';

/**
 * On <owner>.github.io the repository can be read from the URL. The site's base
 * path is used rather than the page path, because pages live in subfolders
 * (e.g. /yt-playlist-to-mp3/) and the site may be the <owner>.github.io repo.
 */
export function guessRepo(): { owner: string; repo: string } {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!m) return { owner: '', repo: '' };
  const baseRepo = import.meta.env.BASE_URL.split('/').filter(Boolean)[0];
  return { owner: m[1], repo: baseRepo || `${m[1]}.github.io` };
}

export function loadConfig(): Config {
  const guess = guessRepo();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Config>;
    return { owner: saved.owner || guess.owner, repo: saved.repo || guess.repo, token: saved.token ?? '' };
  } catch {
    return { ...guess, token: '' };
  }
}

export function saveConfig(cfg: Config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {}
}

export class GitHubError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class GitHub implements Backend {
  private defaultBranch?: string;
  constructor(private _cfg: Config) {}

  get cfg() {
    return this._cfg;
  }

  set cfg(value: Config) {
    this._cfg = value;
    this.defaultBranch = undefined;
  }

  get ready() {
    return !!(this.cfg.owner && this.cfg.repo && this.cfg.token);
  }

  get label() {
    return this.ready ? `${this._cfg.owner}/${this._cfg.repo}` : 'Connect GitHub';
  }

  get repoUrl() {
    return `https://github.com/${this.cfg.owner}/${this.cfg.repo}`;
  }

  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`https://api.github.com/repos/${this.cfg.owner}/${this.cfg.repo}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.cfg.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        msg = (await res.json()).message ?? msg;
      } catch {}
      if (res.status === 401) msg = 'Token is invalid or expired';
      if (res.status === 404) msg = 'Repository or workflow not found — check the repo name and token access';
      if (res.status === 403 && /Resource not accessible/i.test(msg)) msg = 'Token lacks “Actions: Read and write” permission';
      throw new GitHubError(res.status, msg);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** Checks repo access and that the workflow exists. */
  async verify() {
    const repo = await this.req<{ default_branch: string; private: boolean; full_name: string }>('');
    this.defaultBranch = repo.default_branch;
    await this.req(`/actions/workflows/${WORKFLOW}`);
    return repo;
  }

  /** Starts the workflow and returns the new run's id. */
  async dispatch({ items: _items, ...inputs }: DispatchInputs): Promise<{ ids: number[] }> {
    return { ids: [await this.startWorkflow(inputs)] };
  }

  private async startWorkflow(inputs: Omit<DispatchInputs, 'items'>): Promise<number> {
    if (!this.defaultBranch) await this.verify();
    const since = Date.now() - 60_000;
    const path = `/actions/workflows/${WORKFLOW}/dispatches`;
    const body = { ref: this.defaultBranch, inputs };

    // Newer API versions can return the run id directly; fall back to looking it up.
    let direct: { workflow_run_id?: number } | undefined;
    try {
      direct = await this.req(path, { method: 'POST', body: JSON.stringify({ ...body, return_run_details: true }) });
    } catch (e) {
      if (!(e instanceof GitHubError && e.status === 422 && /return_run_details/i.test(e.message))) throw e;
      await this.req(path, { method: 'POST', body: JSON.stringify(body) });
    }
    if (direct?.workflow_run_id) return direct.workflow_run_id;

    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      const runs = await this.runs(20);
      const run = runs.find((r) => r.display_title.includes(inputs.request_id) && Date.parse(r.created_at) >= since);
      if (run) return run.id;
    }
    throw new Error('The workflow started, but its run could not be found. Check the Actions tab.');
  }

  async runs(perPage = 15): Promise<Run[]> {
    const d = await this.req<{ workflow_runs: Run[] }>(
      `/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=${perPage}`,
    );
    return d.workflow_runs;
  }

  run(id: number) {
    return this.req<Run>(`/actions/runs/${id}`);
  }

  async steps(id: number): Promise<Step[]> {
    const d = await this.req<{ jobs: { steps?: Step[] }[] }>(`/actions/runs/${id}/jobs`);
    return d.jobs[0]?.steps ?? [];
  }

  async artifacts(id: number): Promise<Artifact[]> {
    const d = await this.req<{ artifacts: Artifact[] }>(`/actions/runs/${id}/artifacts`);
    return d.artifacts;
  }

  cancel(id: number) {
    return this.req(`/actions/runs/${id}/cancel`, { method: 'POST' });
  }

  /** Deletes the workflow run, including its logs and MP3 artifact. */
  remove(id: number) {
    return this.req(`/actions/runs/${id}`, { method: 'DELETE' });
  }

  /** Direct link that downloads the artifact for anyone signed in to GitHub with access. */
  artifactPage(runId: number, artifactId: number) {
    return `${this.repoUrl}/actions/runs/${runId}/artifacts/${artifactId}`;
  }

  /** Downloads the artifact ZIP through the API (falls back to the web link on failure). */
  async downloadArtifact(a: Artifact): Promise<Blob> {
    const res = await fetch(a.archive_download_url, {
      headers: { Authorization: `Bearer ${this.cfg.token}`, 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!res.ok) throw new GitHubError(res.status, `Artifact download failed (${res.status})`);
    return res.blob();
  }
}
