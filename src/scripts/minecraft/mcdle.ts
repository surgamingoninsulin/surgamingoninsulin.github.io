// MCdle: guess the Minecraft item of the day (or a random one in practice
// mode) from clues about its properties, like Wordle.
import { t, tr } from '../i18n';
import { copyWithFeedback } from './mc';
import { itemIcon, itemName, loadItems, searchItems, type Item } from './items';

const MAX_TRIES = 8;
const STORE = 'sgoi.mcdle';
const RARITY = ['common', 'uncommon', 'rare', 'epic'];
/** Items that are not fun (or not obtainable) as an answer. */
const NOT_AN_ANSWER = /(_spawn_egg|^command_block|_command_block$|^structure_|^jigsaw$|^barrier$|^light$|^debug_stick$|^knowledge_book$|^test_|^petrified_oak_slab$|^player_head$|^bundle$)/;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = $<HTMLInputElement>('guess');
const suggest = $('suggest');
const rows = $('rows');

let sheet: Awaited<ReturnType<typeof loadItems>>;
let answers: Item[] = [];
let target: Item;
let guesses: Item[] = [];
let mode: 'daily' | 'practice' = 'daily';
let hintShown = false;

// ---------------------------------------------------------------- the item of the day

const today = () => new Date().toISOString().slice(0, 10);
/** Same item for everyone on the same (UTC) day. */
function dailyItem(): Item {
  let h = 2166136261;
  for (const ch of `${today()}·mcdle`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return answers[(h >>> 0) % answers.length];
}

const category = (it: Item) =>
  it.armor ? 'armor' : it.weapon ? 'weapon' : it.tool ? 'tool' : it.food ? 'food' : it.block ? 'block' : 'other';

// ---------------------------------------------------------------- clues

type Verdict = 'good' | 'bad' | 'up' | 'down';
const compare = (a: number, b: number): Verdict => (a === b ? 'good' : b > a ? 'up' : 'down');

function clueRow(guess: Item): { row: HTMLTableRowElement; verdicts: Verdict[] } {
  const verdicts: Verdict[] = [];
  const row = document.createElement('tr');
  row.className = 'mcdle-row';
  const cell = (verdict: Verdict | null, content: Node | string) => {
    const td = document.createElement('td');
    if (verdict) {
      verdicts.push(verdict);
      td.className = `mcdle-cell ${verdict}`;
      if (verdict === 'up' || verdict === 'down') {
        const arrow = document.createElement('span');
        arrow.className = 'mcdle-arrow';
        arrow.textContent = verdict === 'up' ? '▲' : '▼';
        td.append(arrow);
      }
    }
    td.append(content);
    row.append(td);
  };
  const name = document.createElement('span');
  name.className = 'flex items-center gap-2 text-left';
  name.append(itemIcon(guess, sheet, 32), itemName(guess));
  cell(guess.id === target.id ? 'good' : 'bad', name);
  cell((guess.block ?? false) === (target.block ?? false) ? 'good' : 'bad', t(guess.block ? 'mc.mcdle.block' : 'mc.mcdle.item'));
  cell(category(guess) === category(target) ? 'good' : 'bad', t(`mc.mcdle.cat.${category(guess)}`));
  cell(compare(guess.stack, target.stack), String(guess.stack));
  cell(compare(RARITY.indexOf(guess.rarity), RARITY.indexOf(target.rarity)), t(`mc.mcdle.rarity.${guess.rarity}`));
  cell(compare(guess.durability, target.durability), guess.durability ? String(guess.durability) : '–');
  cell(!!guess.fireproof === !!target.fireproof ? 'good' : 'bad', guess.fireproof ? '✓' : '✗');
  cell(compare(guess.enchantable, target.enchantable), guess.enchantable ? String(guess.enchantable) : '–');
  return { row, verdicts };
}

// ---------------------------------------------------------------- state

function save() {
  if (mode !== 'daily') return;
  try {
    localStorage.setItem(STORE, JSON.stringify({ date: today(), guesses: guesses.map((g) => g.id) }));
  } catch {}
}

function render() {
  rows.replaceChildren(...guesses.map((g) => clueRow(g).row).reverse());
  tr($('tries'), 'mc.mcdle.tries', { n: MAX_TRIES - guesses.length });
  const won = guesses.at(-1)?.id === target.id;
  const over = won || guesses.length >= MAX_TRIES;
  input.disabled = over;
  $<HTMLButtonElement>('hint').disabled = over || guesses.length < 3 || hintShown;
  const hint = $('hint-text');
  hint.hidden = !hintShown;
  if (hintShown) tr(hint, 'mc.mcdle.hintText', { letter: itemName(target)[0].toUpperCase(), n: itemName(target).length });
  $('result').hidden = !over;
  if (over) showResult(won);
}

function showResult(won: boolean) {
  const answer = $('answer');
  answer.replaceChildren(itemIcon(target, sheet, 48), itemName(target));
  tr($('result-text'), won ? 'mc.mcdle.won' : 'mc.mcdle.lost', { n: guesses.length });
  const emoji: Record<Verdict, string> = { good: '🟩', bad: '🟥', up: '🔼', down: '🔽' };
  const lines = guesses.map((g) => clueRow(g).verdicts.map((v) => emoji[v]).join(''));
  const title = `MCdle ${mode === 'daily' ? today() : '🎲'} ${won ? guesses.length : 'X'}/${MAX_TRIES}`;
  $('share-text').textContent = [title, ...lines].join('\n');
  $('again').hidden = mode === 'daily';
  $('next').hidden = mode !== 'daily';
}

function start(m: typeof mode) {
  mode = m;
  hintShown = false;
  guesses = [];
  $('mode-daily').classList.toggle('btn-active', m === 'daily');
  $('mode-practice').classList.toggle('btn-active', m === 'practice');
  if (m === 'daily') {
    target = dailyItem();
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null');
      if (saved?.date === today()) guesses = saved.guesses.map((id: string) => sheet.items.find((i) => i.id === id)).filter(Boolean);
    } catch {}
  } else {
    target = answers[(Math.random() * answers.length) | 0];
  }
  input.value = '';
  suggest.hidden = true;
  render();
  if (!input.disabled) input.focus();
}

function guess(item: Item) {
  if (guesses.some((g) => g.id === item.id) || input.disabled) return;
  guesses.push(item);
  input.value = '';
  suggest.hidden = true;
  save();
  render();
  // Pop in the newest row.
  rows.firstElementChild?.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 300 });
}

// ---------------------------------------------------------------- autocomplete

let active = 0;
function showSuggestions() {
  const q = input.value.trim();
  if (!q) {
    suggest.hidden = true;
    return;
  }
  const list = searchItems(sheet.items, q)
    .filter((it) => !guesses.some((g) => g.id === it.id))
    .slice(0, 8);
  active = 0;
  suggest.replaceChildren(
    ...list.map((it, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = i === 0 ? 'menu-active' : '';
      b.append(itemIcon(it, sheet, 28), itemName(it));
      b.addEventListener('mousedown', (e) => {
        e.preventDefault();
        guess(it);
      });
      li.append(b);
      return li;
    }),
  );
  suggest.hidden = !list.length;
}
input.addEventListener('input', showSuggestions);
input.addEventListener('keydown', (e) => {
  const buttons = [...suggest.querySelectorAll('button')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % Math.max(1, buttons.length);
    buttons.forEach((b, i) => b.classList.toggle('menu-active', i === active));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    buttons[active]?.dispatchEvent(new MouseEvent('mousedown'));
  } else if (e.key === 'Escape') {
    suggest.hidden = true;
  }
});
input.addEventListener('blur', () => setTimeout(() => (suggest.hidden = true), 150));

// ---------------------------------------------------------------- buttons

$('mode-daily').addEventListener('click', () => start('daily'));
$('mode-practice').addEventListener('click', () => start('practice'));
$('again').addEventListener('click', () => start('practice'));
$('hint').addEventListener('click', () => {
  hintShown = true;
  render();
});
$('share').addEventListener('click', (e) => copyWithFeedback(e.currentTarget as HTMLElement, $('share-text').textContent ?? '', t('mc.common.copied')));

// Countdown to the next item of the day (midnight UTC).
setInterval(() => {
  if (mode !== 'daily' || $('result').hidden) return;
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const s = Math.max(0, Math.floor((next - now.getTime()) / 1000));
  const hms = [s / 3600, (s % 3600) / 60, s % 60].map((n) => String(Math.floor(n)).padStart(2, '0')).join(':');
  tr($('next'), 'mc.mcdle.next', { time: hms });
}, 1000);

// Names follow the language switch.
window.addEventListener('sgoi:lang', () => sheet && render());

sheet = await loadItems();
answers = sheet.items.filter((it) => !NOT_AN_ANSWER.test(it.id));
start('daily');
