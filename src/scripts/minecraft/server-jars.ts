// Server Jars: lists server software and builds from the MCJars API
// (https://mcjars.app, CORS enabled, so this works on GitHub Pages).
import { plain, t, tr } from '../i18n';
import { formatBytes, locale } from './mc';

const API = 'https://versions.mcjars.app/api/v2';

interface TypeInfo {
  name: string;
  icon: string;
  homepage: string;
  deprecated: boolean;
  experimental: boolean;
  description: string;
  categories: string[];
}
interface Build {
  name: string;
  buildNumber: number;
  jarUrl: string | null;
  jarSize: number | null;
  zipUrl: string | null;
  zipSize: number | null;
  created: string | null;
  experimental: boolean;
}
interface VersionInfo {
  type: string; // RELEASE / SNAPSHOT
  supported: boolean;
  java: number;
  builds: number;
  created: string;
  latest: Build;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const typeSel = $<HTMLSelectElement>('type');
const versionSel = $<HTMLSelectElement>('version');
const download = $<HTMLAnchorElement>('download');
const status = $('status');
const rows = $('rows');
const snapshots = $<HTMLInputElement>('snapshots');

// The order of the Type list; everything else follows in MCJars' own groups.
const FAVORITES = ['PAPER', 'PURPUR', 'PUFFERFISH', 'VANILLA', 'FOLIA', 'VELOCITY', 'WATERFALL', 'FABRIC', 'NEOFORGE', 'QUILT', 'FORGE'];

let types: Record<string, TypeInfo> = {};
let versions: Array<[string, VersionInfo]> = [];
const cache = new Map<string, Promise<any>>();
const getJson = (url: string) => {
  if (!cache.has(url))
    cache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      }),
    );
  const p = cache.get(url)!;
  p.catch(() => cache.delete(url));
  return p;
};

const fileOf = (b: Build) => (b.jarUrl ? { url: b.jarUrl, size: b.jarSize } : b.zipUrl ? { url: b.zipUrl, size: b.zipSize } : null);
const date = (iso: string | null) =>
  iso ? new Date(iso.endsWith('Z') ? iso : `${iso}Z`).toLocaleDateString(locale(), { dateStyle: 'long' }) : '–';
const buildLabel = (b: Build) => (b.name.startsWith('#') ? b.name.slice(1) : b.name);

function params() {
  const p = new URLSearchParams(location.hash.slice(1));
  return { type: p.get('type')?.toUpperCase(), version: p.get('version') ?? undefined };
}
function saveParams() {
  history.replaceState(null, '', `#type=${typeSel.value}${versionSel.value ? `&version=${encodeURIComponent(versionSel.value)}` : ''}`);
}

async function loadTypes() {
  let data;
  try {
    data = await getJson(`${API}/types`);
  } catch {
    tr(status, 'mc.jars.error');
    return;
  }
  const groups = data.types as Record<string, Record<string, TypeInfo>>;
  types = Object.assign({}, ...Object.values(groups));

  typeSel.replaceChildren();
  const fav = document.createElement('optgroup');
  fav.label = t('mc.jars.groups.popular');
  fav.dataset.i18nAttr = 'label:mc.jars.groups.popular';
  for (const id of FAVORITES) if (types[id]) fav.append(new Option(types[id].name + (types[id].deprecated ? ' †' : ''), id));
  typeSel.append(fav);
  for (const [group, list] of Object.entries(groups)) {
    const rest = Object.entries(list).filter(([id]) => !FAVORITES.includes(id));
    if (!rest.length) continue;
    const og = document.createElement('optgroup');
    og.label = t(`mc.jars.groups.${group}`);
    og.dataset.i18nAttr = `label:mc.jars.groups.${group}`;
    for (const [id, info] of rest) og.append(new Option(info.name + (info.deprecated ? ' †' : ''), id));
    typeSel.append(og);
  }
  const want = params().type;
  typeSel.value = want && types[want] ? want : 'PAPER';
  typeSel.disabled = false;
  await loadVersions(params().version);
}

function showTypeInfo(id: string) {
  const info = types[id];
  $('type-info').hidden = !info;
  if (!info) return;
  $<HTMLImageElement>('type-icon').src = info.icon;
  const home = $<HTMLAnchorElement>('type-home');
  home.textContent = `${info.name} ↗`;
  home.href = info.homepage;
  // Descriptions come from MCJars in English only.
  $('type-desc').textContent = info.description;
  const tags = $('type-tags');
  tags.replaceChildren();
  const tag = (key: string, cls: string) => tags.append(tr(Object.assign(document.createElement('span'), { className: `badge badge-sm ${cls}` }), key));
  if (info.deprecated) tag('mc.jars.deprecated', 'badge-warning');
  if (info.experimental) tag('mc.jars.experimental', 'badge-info');
  for (const c of info.categories ?? []) {
    const b = document.createElement('span');
    b.className = 'badge badge-sm badge-ghost';
    b.textContent = c;
    tags.append(b);
  }
}

async function loadVersions(preferred?: string) {
  const type = typeSel.value;
  showTypeInfo(type);
  versionSel.disabled = true;
  rows.replaceChildren();
  tr(status, 'mc.jars.loading');
  let data;
  try {
    data = await getJson(`${API}/builds/${type}`);
  } catch {
    tr(status, 'mc.jars.error');
    return;
  }
  if (type !== typeSel.value) return; // the user switched again meanwhile
  // Newest version first, by when its first build came out (old versions still get the odd new build).
  versions = Object.entries(data.builds as Record<string, VersionInfo>).sort(
    (a, b) => new Date(b[1].created).getTime() - new Date(a[1].created).getTime(),
  );
  // A snapshot was asked for: show snapshots.
  if (preferred && versions.find(([v, i]) => v === preferred && i.type !== 'RELEASE')) snapshots.checked = true;
  render(preferred);
}

const visible = () => versions.filter(([, v]) => snapshots.checked || v.type === 'RELEASE');

function render(preferred = versionSel.value) {
  const list = visible();
  versionSel.replaceChildren(...list.map(([v]) => new Option(v, v)));
  versionSel.value = list.some(([v]) => v === preferred) ? preferred : list[0]?.[0] ?? '';
  versionSel.disabled = !list.length;
  $('type-zip').hidden = !list.some(([, v]) => !v.latest?.jarUrl && v.latest?.zipUrl);

  rows.replaceChildren(...list.map(([v, info]) => versionRow(v, info)));
  if (list.length) tr(status, 'mc.jars.count', { n: list.length });
  else tr(status, 'mc.jars.empty');
  updateDownload();
  saveParams();
}

function downloadLink(b: Build, compact = false) {
  const file = fileOf(b);
  const a = document.createElement('a');
  a.className = `btn btn-ghost ${compact ? 'btn-xs' : 'btn-sm'} gap-1`;
  if (!file) {
    a.classList.add('btn-disabled');
    return a;
  }
  a.href = file.url;
  a.rel = 'noopener';
  a.title = file.size ? formatBytes(file.size) : '';
  a.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>';
  a.setAttribute('aria-label', t('mc.jars.download'));
  if (file.url.endsWith('.zip')) a.append(' .zip');
  return a;
}

function versionRow(version: string, info: VersionInfo) {
  const tr_ = document.createElement('tr');
  tr_.className = 'hover:bg-base-300/40';
  const b = info.latest;
  const cells = [document.createElement('td'), document.createElement('td'), document.createElement('td'), document.createElement('td'), document.createElement('td')];
  cells[0].className = 'font-semibold';
  cells[0].textContent = version;
  if (info.type !== 'RELEASE') cells[0].append(' ', Object.assign(document.createElement('span'), { className: 'badge badge-xs badge-info', textContent: info.type.toLowerCase() }));
  if (!info.supported) cells[0].append(' ', tr(Object.assign(document.createElement('span'), { className: 'badge badge-xs badge-ghost' }), 'mc.jars.unsupported'));

  // Build: latest, and a button that expands every build of this version.
  cells[1].className = 'whitespace-nowrap';
  if (info.builds > 1) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'btn btn-ghost btn-xs';
    more.setAttribute('aria-expanded', 'false');
    tr(more, 'mc.jars.buildsOf', { name: buildLabel(b), n: info.builds });
    more.addEventListener('click', () => toggleBuilds(tr_, version, more));
    cells[1].append(more);
  } else {
    cells[1].textContent = buildLabel(b);
  }
  cells[2].className = 'hidden sm:table-cell opacity-70';
  cells[2].textContent = info.java ? `Java ${info.java}+` : '–';
  cells[3].className = 'whitespace-nowrap';
  cells[3].textContent = date(b.created ?? info.created);
  cells[4].className = 'text-right';
  cells[4].append(downloadLink(b));
  tr_.append(...cells);
  return tr_;
}

async function toggleBuilds(row: HTMLTableRowElement, version: string, btn: HTMLButtonElement) {
  const open = btn.getAttribute('aria-expanded') === 'true';
  // Close: remove the sub-rows under this row.
  let next = row.nextElementSibling;
  while (next?.classList.contains('sub')) {
    const n = next.nextElementSibling;
    next.remove();
    next = n;
  }
  btn.setAttribute('aria-expanded', String(!open));
  if (open) return;

  const loading = document.createElement('tr');
  loading.className = 'sub';
  loading.innerHTML = '<td colspan="5" class="text-center"><span class="loading loading-dots loading-sm"></span></td>';
  row.after(loading);
  let data;
  try {
    data = await getJson(`${API}/builds/${typeSel.value}/${encodeURIComponent(version)}`);
  } catch {
    tr(loading.firstElementChild as HTMLElement, 'mc.jars.error');
    return;
  }
  const builds = (data.builds as Build[]).slice().sort((a, b) => (b.created ?? '').localeCompare(a.created ?? '') || b.buildNumber - a.buildNumber);
  loading.replaceWith(
    ...builds.map((b) => {
      const sub = document.createElement('tr');
      sub.className = 'sub text-xs opacity-80';
      const c = [0, 1, 2, 3, 4].map(() => document.createElement('td'));
      c[1].textContent = buildLabel(b);
      if (b.experimental) c[1].append(' ', tr(Object.assign(document.createElement('span'), { className: 'badge badge-xs badge-info' }), 'mc.jars.experimental'));
      c[2].className = 'hidden sm:table-cell';
      const f = fileOf(b);
      c[2].textContent = f?.size ? formatBytes(f.size) : '';
      c[3].textContent = date(b.created);
      c[4].className = 'text-right';
      c[4].append(downloadLink(b, true));
      sub.append(...c);
      return sub;
    }),
  );
}

function updateDownload() {
  const info = versions.find(([v]) => v === versionSel.value)?.[1];
  const file = info && fileOf(info.latest);
  download.classList.toggle('btn-disabled', !file);
  download.setAttribute('aria-disabled', String(!file));
  download.href = file?.url ?? '#';
  download.title = file?.size ? formatBytes(file.size) : '';
}

typeSel.addEventListener('change', () => loadVersions());
versionSel.addEventListener('change', () => {
  updateDownload();
  saveParams();
  // Point at the chosen version in the table.
  const row = [...rows.querySelectorAll('tr:not(.sub)')].find((r) => r.firstElementChild?.firstChild?.textContent === versionSel.value);
  row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  row?.animate([{ background: 'color-mix(in oklab, var(--color-primary) 25%, transparent)' }, { background: 'transparent' }], 1200);
});
snapshots.addEventListener('change', () => render());
download.addEventListener('click', (e) => {
  if (download.getAttribute('aria-disabled') === 'true') e.preventDefault();
});
// A shared link opened in the same tab (only the #type=…&version=… part changes).
window.addEventListener('hashchange', () => {
  const { type, version } = params();
  if (type && types[type] && type !== typeSel.value) {
    typeSel.value = type;
    loadVersions(version);
  } else if (version && version !== versionSel.value) {
    render(version);
  }
});
// Dates and labels follow the language.
window.addEventListener('sgoi:lang', () => versions.length && render());

plain(status, '');
tr(status, 'mc.jars.loading');
loadTypes();
