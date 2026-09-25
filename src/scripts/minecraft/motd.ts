// MOTD Creator: write a server description with & codes, see it as in the
// server list, and copy it for server.properties, plugins or MiniMessage.
import { t } from '../i18n';
import { COLORS, copyWithFeedback, DEFAULT_ICON, initLook, renderFormatted, stripCodes } from './mc';

/** Roughly how many characters fit on one MOTD line in the server list. */
const LINE_WIDTH = 45;
const STORE = 'sgoi.mc.motd';

interface Style {
  color: string; // #rrggbb
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
}
interface Segment {
  text: string;
  style: Style;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const line1 = $<HTMLInputElement>('line1');
const line2 = $<HTMLInputElement>('line2');
const nameInput = $<HTMLInputElement>('name');
const card = $('card');
const motdEl = card.querySelector<HTMLElement>('[data-mc-motd]')!;
const nameEl = card.querySelector<HTMLElement>('[data-mc-name]')!;
let focused = line1;

const GRAY = COLORS['7'].hex;
const FORMAT_KEYS: Record<string, keyof Style> = { l: 'bold', o: 'italic', n: 'underlined', m: 'strikethrough', k: 'obfuscated' };

/** Splits "&aHello &lworld" into styled segments. A color code resets formatting, like the game. */
function parse(text: string): Segment[] {
  const out: Segment[] = [];
  let style: Style = { color: GRAY };
  let buf = '';
  const flush = () => {
    if (buf) out.push({ text: buf, style: { ...style } });
    buf = '';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') {
      flush();
      out.push({ text: '\n', style: { ...style } });
      continue;
    }
    if (c !== '&' && c !== '§') {
      buf += c;
      continue;
    }
    const hash = text.slice(i + 1, i + 8).match(/^#([0-9a-f]{6})/i);
    if (hash) {
      flush();
      style = { color: `#${hash[1].toUpperCase()}` };
      i += 7;
      continue;
    }
    const code = text[i + 1]?.toLowerCase();
    if (code && code in COLORS) {
      flush();
      style = { color: COLORS[code].hex };
      i++;
    } else if (code && code in FORMAT_KEYS) {
      flush();
      style = { ...style, [FORMAT_KEYS[code]]: true };
      i++;
    } else if (code === 'r') {
      flush();
      style = { color: GRAY };
      i++;
    } else {
      buf += c;
    }
  }
  flush();
  return out;
}

const legacyCode = (hex: string) => Object.entries(COLORS).find(([, c]) => c.hex.toUpperCase() === hex.toUpperCase())?.[0];

/** Nearest of the 16 standard colors, for outputs that can't do hex. */
function nearestCode(hex: string): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = rgb(hex);
  let best = 'f';
  let dist = Infinity;
  for (const [code, c] of Object.entries(COLORS)) {
    const [r2, g2, b2] = rgb(c.hex);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < dist) [best, dist] = [code, d];
  }
  return best;
}

const formatCodes = (s: Style) =>
  (Object.entries(FORMAT_KEYS) as Array<[string, keyof Style]>).filter(([, k]) => s[k]).map(([c]) => c);

/** Codes (with the given marker) for a list of segments; hex → &#rrggbb or the nearest color. */
function toCodes(segments: Segment[], marker: string, hex: boolean): string {
  let out = '';
  let prev: Style | null = null;
  for (const seg of segments) {
    if (seg.text === '\n') {
      out += '\n';
      prev = null;
      continue;
    }
    const s = seg.style;
    if (!prev || JSON.stringify(prev) !== JSON.stringify(s)) {
      const legacy = legacyCode(s.color);
      out += legacy ? `${marker}${legacy}` : hex ? `${marker}#${s.color.slice(1).toLowerCase()}` : `${marker}${nearestCode(s.color)}`;
      for (const f of formatCodes(s)) out += `${marker}${f}`;
      prev = s;
    }
    out += seg.text;
  }
  return out;
}

/** server.properties: § as §, a new line as \n, everything non-ASCII escaped. */
function toProperties(segments: Segment[]): string {
  const text = toCodes(segments, '§', false);
  // Per UTF-16 code unit, so emoji become the surrogate pair 😀 that Java expects.
  const escaped = text
    .split('')
    .map((ch) => {
      if (ch === '\n') return '\\n';
      if (ch === '\\') return '\\\\';
      const code = ch.charCodeAt(0);
      return code < 0x20 || code > 0x7e ? `\\u${code.toString(16).toUpperCase().padStart(4, '0')}` : ch;
    })
    .join('');
  return `motd=${escaped}`;
}

/** MiniMessage (Velocity, Paper plugins). */
function toMiniMessage(segments: Segment[]): string {
  const tags: Record<string, string> = { bold: 'b', italic: 'i', underlined: 'u', strikethrough: 'st', obfuscated: 'obf' };
  return segments
    .map((seg) => {
      if (seg.text === '\n') return '<newline>';
      const s = seg.style;
      const legacy = legacyCode(s.color);
      const open = [legacy ? `<${COLORS[legacy].name}>` : `<color:${s.color.toLowerCase()}>`];
      const close = [legacy ? `</${COLORS[legacy].name}>` : '</color>'];
      for (const [k, tag] of Object.entries(tags))
        if (s[k as keyof Style]) {
          open.push(`<${tag}>`);
          close.unshift(`</${tag}>`);
        }
      return open.join('') + seg.text.replace(/[<\\]/g, (m) => `\\${m}`) + close.join('');
    })
    .join('');
}

function update() {
  const text = `${line1.value}\n${line2.value}`;
  delete motdEl.dataset.i18n;
  renderFormatted(motdEl, text, GRAY, '&');
  delete nameEl.dataset.i18n;
  nameEl.textContent = nameInput.value || ' ';

  for (const [i, input] of [line1, line2].entries()) {
    const len = [...stripCodes(input.value)].length;
    const el = $(`count${i + 1}`);
    el.textContent = `${len}/${LINE_WIDTH}`;
    el.classList.toggle('text-warning', len > LINE_WIDTH);
  }

  const segments = parse(line2.value ? text : line1.value);
  $('out-props').textContent = toProperties(segments);
  $('out-amp').textContent = toCodes(segments, '&', true);
  $('out-mini').textContent = toMiniMessage(segments);
  $('hex-note').hidden = !segments.some((s) => s.text !== '\n' && !legacyCode(s.style.color));

  try {
    localStorage.setItem(STORE, JSON.stringify({ name: nameInput.value, l1: line1.value, l2: line2.value }));
  } catch {}
}

/** Inserts text at the cursor of the last focused line. */
function insert(code: string) {
  const el = focused;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  el.setRangeText(code, start, end, 'end');
  el.focus();
  update();
}

function applyGradient() {
  const el = focused;
  let start = el.selectionStart ?? 0;
  let end = el.selectionEnd ?? 0;
  if (start === end) [start, end] = [0, el.value.length]; // nothing selected: the whole line
  const chars = [...stripCodes(el.value.slice(start, end))];
  if (!chars.length) return;
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [rgb($<HTMLInputElement>('g1').value), rgb($<HTMLInputElement>('g2').value)];
  const out = chars
    .map((ch, i) => {
      if (ch === ' ') return ' ';
      const k = chars.length === 1 ? 0 : i / (chars.length - 1);
      const hex = a.map((v, j) => Math.round(v + (b[j] - v) * k).toString(16).padStart(2, '0')).join('');
      return `&#${hex}${ch}`;
    })
    .join('');
  el.setRangeText(out, start, end, 'end');
  el.focus();
  update();
}

function center() {
  for (const el of [line1, line2]) {
    const trimmed = el.value.replace(/^ +/, '');
    const len = [...stripCodes(trimmed)].length;
    el.value = ' '.repeat(Math.max(0, Math.floor((LINE_WIDTH - len) / 2))) + trimmed;
  }
  update();
}

const EXAMPLES = [
  ['&6&l⚔ &e&lSGOI Survival &6&l⚔', '&7Fresh map · &aPlay now &7on &b1.21'],
  ['&#ff5555C&#ff6f4ar&#ff893fa&#ffa334f&#ffbd29t &#ffd71eR&#fff113e&#e6ff08a&#ccff00l&#b3ff00m', '&7Skyblock · Prison · &dEvents every weekend'],
  ['&b&l❄ Winter Network &b&l❄', '&f&kxx&r &eSnowball fights are back! &f&kxx'],
  ['&a&lSkyIslands &8| &7Season &a5', '&8» &fNew islands, &cboss fights &fand &6quests'],
];
let example = 0;

for (const el of [line1, line2]) {
  el.addEventListener('focus', () => (focused = el));
  el.addEventListener('input', update);
}
nameInput.addEventListener('input', update);
document.querySelectorAll<HTMLElement>('[data-code]').forEach((btn) =>
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault(); // keep the cursor in the line
    insert(`&${btn.dataset.code}`);
  }),
);
document.querySelectorAll<HTMLElement>('[data-code]').forEach((btn) =>
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      insert(`&${btn.dataset.code}`);
    }
  }),
);
$('apply-gradient').addEventListener('mousedown', (e) => {
  e.preventDefault();
  applyGradient();
});
$('center').addEventListener('click', center);
$('example').addEventListener('click', () => {
  [line1.value, line2.value] = EXAMPLES[example++ % EXAMPLES.length];
  update();
});
$('clear').addEventListener('click', () => {
  line1.value = line2.value = '';
  update();
  line1.focus();
});
document.querySelectorAll<HTMLElement>('[data-copy]').forEach((btn) =>
  btn.addEventListener('click', () => copyWithFeedback(btn, $(`out-${btn.dataset.copy}`).textContent ?? '', t('mc.common.copied'))),
);

initLook();
card.querySelector<HTMLImageElement>('[data-mc-icon]')!.src = DEFAULT_ICON;
try {
  const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null');
  if (saved) {
    nameInput.value = saved.name ?? nameInput.value;
    line1.value = saved.l1 ?? '';
    line2.value = saved.l2 ?? '';
  }
} catch {}
if (!line1.value && !line2.value) [line1.value, line2.value] = EXAMPLES[example++];
update();
