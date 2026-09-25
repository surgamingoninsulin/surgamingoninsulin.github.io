// Browser side of local debug mode: same shape as the GitHub client, but it
// talks to the dev server's /__debug/* routes (integrations/debug-downloader.ts).

import type { Artifact, Backend, DispatchInputs, Run, Step } from './github';

type Job = Run & { step: string; files: number; errors: number; size: number };

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/__debug${path}`, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (res.status === 404 && !path.startsWith('/jobs/')) {
    throw new Error('Debug server not available — DEBUG mode only works with `npm run dev`');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
  return data as T;
}

export class DebugBackend implements Backend {
  readonly ready = true;
  readonly label = 'DEBUG · local yt-dlp';

  status() {
    return req<{ ytdlp: string | null; ffmpeg: boolean; cookies: boolean; output: string }>('/status');
  }

  async dispatch(inputs: DispatchInputs): Promise<{ ids: number[]; note?: string }> {
    const r = await req<Job & { ids: number[]; continued: number[]; busy: string[] }>('/jobs', {
      method: 'POST',
      body: JSON.stringify({
        items: inputs.items ?? inputs.urls.split('\n').map((url) => ({ url })),
        bitrate: inputs.bitrate,
        label: inputs.label,
      }),
    });
    const notes: string[] = [];
    if (r.continued.length) notes.push(`${r.continued.length} earlier download(s) of the same playlist continued — only missing songs are fetched`);
    if (r.busy.length) notes.push(`already downloading: ${r.busy.join(', ')}`);
    return { ids: r.ids, note: notes.join(' · ') || undefined };
  }

  runs(): Promise<Run[]> {
    return req<Job[]>('/jobs');
  }

  run(id: number): Promise<Run> {
    return req<Job>(`/jobs/${id}`);
  }

  async steps(id: number): Promise<Step[]> {
    const job = await req<Job>(`/jobs/${id}`);
    return [{ name: job.step, status: 'in_progress', conclusion: null, number: 1 }];
  }

  async artifacts(id: number): Promise<Artifact[]> {
    const job = await req<Job>(`/jobs/${id}`);
    if (!job.files) return [];
    return [{ id, name: 'mp3', size_in_bytes: job.size, expired: false, archive_download_url: `/__debug/jobs/${id}/zip` }];
  }

  cancel(id: number) {
    return req(`/jobs/${id}/cancel`, { method: 'POST' });
  }

  pause(id: number) {
    return req(`/jobs/${id}/pause`, { method: 'POST' });
  }

  resume(id: number) {
    return req(`/jobs/${id}/resume`, { method: 'POST' });
  }

  retry(id: number) {
    return req(`/jobs/${id}/retry`, { method: 'POST' });
  }

  /** Hides the job from the list; the MP3s stay in local-downloads/. */
  remove(id: number) {
    return req(`/jobs/${id}`, { method: 'DELETE' });
  }

  artifactPage(runId: number) {
    return `/__debug/jobs/${runId}/zip`;
  }

  async downloadArtifact(a: Artifact): Promise<Blob> {
    const res = await fetch(a.archive_download_url);
    if (!res.ok) throw new Error(`ZIP download failed (${res.status})`);
    return res.blob();
  }
}
