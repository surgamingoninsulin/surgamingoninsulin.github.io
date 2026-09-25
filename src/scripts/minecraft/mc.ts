// Shared by the Minecraft tools (src/pages/game/minecraft/*): the server-list
// look (font, dirt background, default icon) and rendering of § formatting codes.

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

/** § color codes → text color, as in Java Edition. */
export const COLORS: Record<string, { name: string; hex: string }> = {
  '0': { name: 'black', hex: '#000000' },
  '1': { name: 'dark_blue', hex: '#0000AA' },
  '2': { name: 'dark_green', hex: '#00AA00' },
  '3': { name: 'dark_aqua', hex: '#00AAAA' },
  '4': { name: 'dark_red', hex: '#AA0000' },
  '5': { name: 'dark_purple', hex: '#AA00AA' },
  '6': { name: 'gold', hex: '#FFAA00' },
  '7': { name: 'gray', hex: '#AAAAAA' },
  '8': { name: 'dark_gray', hex: '#555555' },
  '9': { name: 'blue', hex: '#5555FF' },
  a: { name: 'green', hex: '#55FF55' },
  b: { name: 'aqua', hex: '#55FFFF' },
  c: { name: 'red', hex: '#FF5555' },
  d: { name: 'light_purple', hex: '#FF55FF' },
  e: { name: 'yellow', hex: '#FFFF55' },
  f: { name: 'white', hex: '#FFFFFF' },
};

/** § format codes. */
export const FORMATS: Record<string, string> = {
  l: 'bold',
  o: 'italic',
  n: 'underlined',
  m: 'strikethrough',
  k: 'obfuscated',
  r: 'reset',
};

interface Style {
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
}

/**
 * Renders text with § (or &) codes into `el` as styled spans. `defaultColor`
 * is what §r resets to: gray for a MOTD, white for a server name.
 * Hex colors (§x§r§r§g§g§b§b, or &#rrggbb) are supported too.
 */
export function renderFormatted(el: HTMLElement, text: string, defaultColor = COLORS['7'].hex, marker = '§') {
  el.replaceChildren();
  let style: Style = { color: defaultColor };
  let buf = '';
  const flush = () => {
    if (!buf) return;
    const span = document.createElement('span');
    span.textContent = buf;
    span.style.color = style.color ?? defaultColor;
    if (style.bold) span.style.fontWeight = '700';
    if (style.italic) span.style.fontStyle = 'italic';
    const deco = [style.underlined && 'underline', style.strikethrough && 'line-through'].filter(Boolean).join(' ');
    if (deco) span.style.textDecoration = deco;
    if (style.obfuscated) span.dataset.mcObf = buf;
    el.append(span);
    buf = '';
  };
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (i > 0) {
      flush();
      el.append(document.createElement('br'));
    }
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c !== marker && !(marker === '&' && c === '§')) {
        buf += c;
        continue;
      }
      // &#rrggbb (plugin style hex color)
      const hash = line.slice(j + 1, j + 8).match(/^#([0-9a-f]{6})/i);
      if (hash) {
        flush();
        style = { color: `#${hash[1]}` };
        j += 7;
        continue;
      }
      // §x§r§r§g§g§b§b (vanilla-style hex color)
      const hex = line.slice(j + 1, j + 14).match(/^[xX](?:[§&]([0-9a-fA-F])){6}/);
      if (hex) {
        flush();
        style = { color: `#${hex[0].replace(/[xX§&]/g, '')}` };
        j += 13;
        continue;
      }
      const code = line[j + 1]?.toLowerCase();
      if (code && (code in COLORS || code in FORMATS)) {
        flush();
        if (code in COLORS) style = { color: COLORS[code].hex };
        else if (code === 'r') style = { color: defaultColor };
        else style = { ...style, [FORMATS[code]]: true };
        j++;
      } else {
        buf += c;
      }
    }
  });
  flush();
  startObfuscation();
}

// Obfuscated (§k) text: swap each character for a random one, like the game.
const OBF_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*?';
let obfTimer: number | undefined;
function startObfuscation() {
  if (obfTimer !== undefined || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  obfTimer = window.setInterval(() => {
    const spans = document.querySelectorAll<HTMLElement>('[data-mc-obf]');
    if (!spans.length) {
      clearInterval(obfTimer);
      obfTimer = undefined;
      return;
    }
    spans.forEach((s) => {
      s.textContent = [...s.dataset.mcObf!].map((ch) => (ch === ' ' ? ' ' : OBF_CHARS[(Math.random() * OBF_CHARS.length) | 0])).join('');
    });
  }, 60);
}

/** Removes all § / & codes. */
export const stripCodes = (text: string) => text.replace(/[§&](#[0-9a-f]{6}|x(?:[§&][0-9a-f]){6}|[0-9a-fk-or])/gi, '');

// ---------------------------------------------------------------- look

/** A dark 16×16 dirt texture, drawn once and scaled up without smoothing. */
function dirtTexture(): string {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  const shades = ['#2b1f16', '#33251a', '#3a2a1e', '#261b13', '#402f22', '#2f2218'];
  // Small deterministic PRNG so the pattern is the same on every load.
  let seed = 1337;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      g.fillStyle = shades[(rnd() * shades.length) | 0];
      g.fillRect(x, y, 1, 1);
    }
  return c.toDataURL();
}

/** Default icon for servers without one: a grass block on a gray tile. */
export const DEFAULT_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="#5a5a5a"/><rect x="1" y="1" width="14" height="14" fill="#6f6f6f"/><path fill="#5d9c3a" d="M3 5h10v3H3z"/><path fill="#79c05a" d="M3 5h3v1H3zm5 0h2v1H8zm3 1h2v1h-2z"/><path fill="#8a5a3b" d="M3 8h10v5H3z"/><path fill="#6b4329" d="M4 9h2v1H4zm5 1h2v1H9zm-3 2h2v1H6zm5-3h1v1h-1z"/></svg>`,
  );

let lookReady = false;
/** Loads the Minecraft-style font and the dirt background (once per page). */
export function initLook() {
  if (lookReady) return;
  lookReady = true;
  document.documentElement.style.setProperty('--mc-dirt', `url(${dirtTexture()})`);
  for (const [file, weight] of [
    ['Monocraft.woff2', '400'],
    ['Monocraft-Bold.woff2', '700'],
  ]) {
    const face = new FontFace('Monocraft', `url(${BASE}fonts/monocraft/${file}) format('woff2')`, { weight, display: 'swap' });
    face.load().then((f) => document.fonts.add(f)).catch(() => {});
  }
}

// ---------------------------------------------------------------- helpers

/** Current page language for dates and numbers ("en", "nl"). */
export const locale = () => document.documentElement.lang || 'en';

export function formatBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toLocaleString(locale(), { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`;
}

/** Copies text and briefly swaps the button label to a confirmation. */
export async function copyWithFeedback(btn: HTMLElement, text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const old = btn.textContent;
  btn.textContent = done;
  setTimeout(() => (btn.textContent = old), 1400);
}
