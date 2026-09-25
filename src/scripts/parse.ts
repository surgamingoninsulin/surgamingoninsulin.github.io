export type LinkKind = 'playlist' | 'video';

export interface Link {
  kind: LinkKind;
  id: string;
  url: string;
}

// Matches anything that looks like a YouTube / YouTube Music / youtu.be URL,
// with or without a scheme, inside arbitrary text (txt, csv, json, html, m3u…).
const URL_RE =
  /(?:https?:\/\/)?(?:[\w-]+\.)*(?:youtube\.com|youtube-nocookie\.com|youtu\.be)\/[^\s"'<>\]\)\\,;]+/gi;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID = /^[A-Za-z0-9_-]{10,}$/;

function parseOne(raw: string): Link | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const list = url.searchParams.get('list');
  // "RD…" lists are auto-generated Mixes; a watch link inside one means just that video.
  const isMix = list?.startsWith('RD') && url.searchParams.has('v');
  if (list && LIST_ID.test(list) && !isMix) {
    return { kind: 'playlist', id: list, url: `https://www.youtube.com/playlist?list=${list}` };
  }

  let video = url.searchParams.get('v');
  if (!video) {
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname.endsWith('youtu.be')) video = parts[0] ?? null;
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '')) video = parts[1] ?? null;
  }
  if (video && VIDEO_ID.test(video)) {
    return { kind: 'video', id: video, url: `https://www.youtube.com/watch?v=${video}` };
  }
  return null;
}

/** Extracts unique playlist and video links from any text. */
export function extractLinks(text: string): Link[] {
  const seen = new Set<string>();
  const links: Link[] = [];
  for (const match of text.matchAll(URL_RE)) {
    const link = parseOne(match[0]);
    if (!link) continue;
    const key = `${link.kind}:${link.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(link);
  }
  return links;
}
