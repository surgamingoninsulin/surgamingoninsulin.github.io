// Server Info: pings a Java or Bedrock server through the public mcstatus.io
// API (CORS enabled, so this works on a static GitHub Pages site).
import { t } from '../i18n';
import { copyWithFeedback, DEFAULT_ICON, initLook, locale, renderFormatted } from './mc';

const API = 'https://api.mcstatus.io/v2/status';

type Edition = 'java' | 'bedrock';
interface Result {
  edition: Edition;
  address: string;
  data: any;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('ping-form');
const input = $<HTMLInputElement>('address');
const status = $('status');
const card = $('card');
const icon = card.querySelector<HTMLImageElement>('[data-mc-icon]')!;
const nameEl = card.querySelector<HTMLElement>('[data-mc-name]')!;
const motdEl = card.querySelector<HTMLElement>('[data-mc-motd]')!;
const playersEl = card.querySelector<HTMLElement>('[data-mc-players]')!;
const details = $('details');
const facts = $('facts');
const share = $<HTMLInputElement>('share');

let last: Result | null = null;
let request = 0;

initLook();
icon.src = DEFAULT_ICON;

const edition = (): Edition => (form.querySelector<HTMLInputElement>('input[name=edition]:checked')?.value as Edition) ?? 'java';
const setEdition = (e: Edition) => {
  const radio = form.querySelector<HTMLInputElement>(`input[name=edition][value=${e}]`);
  if (radio) radio.checked = true;
};

/** Accepts "host", "host:port", "[ipv6]:port"; strips a pasted scheme or path. */
function cleanAddress(raw: string): string | null {
  const a = raw.trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
  return /^[\w.\-:[\]]{1,253}$/.test(a) && /[\w\]]/.test(a) ? a : null;
}

function shareUrl(address = '', ed: Edition = edition()) {
  const hash = address ? `#ip=${encodeURIComponent(address)}${ed === 'bedrock' ? '&edition=bedrock' : ''}` : '#ip=';
  return `${location.origin}${location.pathname}${hash}`;
}

function setMotd(text: string, color?: string) {
  delete motdEl.dataset.i18n;
  renderFormatted(motdEl, text, color);
}

async function ping(address: string, ed: Edition) {
  const id = ++request;
  card.dataset.state = 'loading';
  status.textContent = t('mc.info.pinging', { address });
  delete nameEl.dataset.i18n;
  nameEl.textContent = address;
  share.value = shareUrl(address, ed);
  history.replaceState(null, '', share.value);

  let data: any;
  try {
    const res = await fetch(`${API}/${ed}/${encodeURIComponent(address)}`);
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch {
    if (id !== request) return;
    card.dataset.state = 'offline';
    status.textContent = t('mc.info.apiError');
    return;
  }
  if (id !== request) return;
  last = { edition: ed, address, data };
  render();
}

function render() {
  if (!last) return;
  const { edition: ed, address, data } = last;
  const online = !!data.online;

  card.dataset.state = online ? 'online' : 'offline';
  icon.src = (ed === 'java' && data.icon) || DEFAULT_ICON;
  if (online) {
    setMotd(data.motd?.raw ?? '');
    playersEl.textContent = `${data.players?.online ?? 0}/${data.players?.max ?? 0}`;
  } else {
    // Same as the game: dark red text, no player count.
    setMotd(`§4${t('mc.info.offline')}`);
    playersEl.textContent = '';
  }

  const time = data.retrieved_at ? new Date(data.retrieved_at).toLocaleTimeString(locale(), { timeStyle: 'short' }) : '';
  status.textContent = online ? t('mc.info.online', { time }) : t('mc.info.offlineStatus', { address });

  // ---- details
  facts.replaceChildren();
  const fact = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    const dt = document.createElement('dt');
    dt.textContent = t(`mc.info.fact.${key}`);
    const dd = document.createElement('dd');
    dd.textContent = String(value);
    facts.append(dt, dd);
  };
  fact('status', online ? t('mc.info.statusOnline') : t('mc.info.statusOffline'));
  fact('address', `${data.host}:${data.port}`);
  fact('ip', data.ip_address);
  if (data.srv_record) fact('srv', `${data.srv_record.host}:${data.srv_record.port}`);
  if (online) {
    fact('version', ed === 'java' ? data.version?.name_clean : data.version?.name);
    fact('protocol', data.version?.protocol);
    fact('players', `${(data.players?.online ?? 0).toLocaleString(locale())} / ${(data.players?.max ?? 0).toLocaleString(locale())}`);
    fact('software', data.software);
    if (ed === 'bedrock') {
      fact('gamemode', data.gamemode);
      fact('edition', data.edition);
    }
  }
  fact('eula', data.eula_blocked ? t('mc.info.eulaBlocked') : undefined);
  details.hidden = false;

  // ---- players online (only sent by some servers)
  const list: Array<{ uuid: string; name_clean: string }> = online && ed === 'java' ? data.players?.list ?? [] : [];
  $('players-wrap').hidden = !list.length;
  $('players').replaceChildren(
    ...list.map((p) => {
      const chip = document.createElement('span');
      chip.className = 'badge badge-lg gap-2 bg-base-300';
      const head = Object.assign(document.createElement('img'), {
        src: `https://mc-heads.net/avatar/${p.uuid}/16`,
        width: 16,
        height: 16,
        alt: '',
        loading: 'lazy',
      });
      head.style.imageRendering = 'pixelated';
      chip.append(head, p.name_clean);
      return chip;
    }),
  );

  // ---- mods or plugins (only sent by some servers)
  const extras: Array<{ name: string; version: string }> = online && ed === 'java' ? (data.mods?.length ? data.mods : data.plugins) ?? [] : [];
  $('extras-wrap').hidden = !extras.length;
  $('extras-title').textContent = t(data.mods?.length ? 'mc.info.mods' : 'mc.info.plugins', { n: extras.length });
  $('extras').replaceChildren(
    ...extras.map((m) => {
      const chip = document.createElement('span');
      chip.className = 'badge badge-lg bg-base-300';
      chip.textContent = m.version ? `${m.name} ${m.version}` : m.name;
      return chip;
    }),
  );
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const address = cleanAddress(input.value);
  if (!address) {
    status.textContent = t('mc.info.invalid');
    input.focus();
    return;
  }
  input.value = address;
  ping(address, edition());
});

// Switching edition re-pings the same address.
form.querySelectorAll<HTMLInputElement>('input[name=edition]').forEach((r) =>
  r.addEventListener('change', () => {
    const address = cleanAddress(input.value);
    if (address) ping(address, edition());
    else share.value = shareUrl('', edition());
  }),
);

$('copy').addEventListener('click', (e) => copyWithFeedback(e.currentTarget as HTMLElement, share.value, t('mc.common.copied')));
window.addEventListener('sgoi:lang', render);

function fromHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const address = cleanAddress(params.get('ip') ?? '');
  setEdition(params.get('edition') === 'bedrock' ? 'bedrock' : 'java');
  share.value = shareUrl(address ?? '');
  if (address) {
    input.value = address;
    ping(address, edition());
  }
}
window.addEventListener('hashchange', fromHash);
fromHash();
