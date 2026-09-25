// Tic-tac-toe ("boter, kaas en eieren") with Minecraft items as pieces: each
// player picks any item. Play against a friend or the computer.
import { t, tr } from '../i18n';
import { itemIcon, itemName, itemPicker, loadItems, type Item } from './items';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const STORE = 'sgoi.ttt';
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

type Mode = 'pvp' | 'easy' | 'hard';
type Cell = 0 | 1 | null;

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const cells = [...document.querySelectorAll<HTMLButtonElement>('.ttt-cell')];
const status = $('#status');
const dialog = $<HTMLDialogElement>('#picker-dialog');

const sheet = await loadItems();
const byId = (id: string) => sheet.items.find((i) => i.id === id);

let pieces: [Item, Item] = [byId('diamond')!, byId('emerald')!];
let board: Cell[] = Array(9).fill(null);
let turn: 0 | 1 = 0;
let starter: 0 | 1 = 0;
let mode: Mode = 'pvp';
let over = false;
const score = [0, 0];

try {
  const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null');
  if (saved) {
    pieces = [byId(saved.p0) ?? pieces[0], byId(saved.p1) ?? pieces[1]];
    if (['pvp', 'easy', 'hard'].includes(saved.mode)) mode = saved.mode;
  }
} catch {}
const save = () => {
  try {
    localStorage.setItem(STORE, JSON.stringify({ p0: pieces[0].id, p1: pieces[1].id, mode }));
  } catch {}
};

const play = (file: string, volume = 0.4) => {
  const a = new Audio(`${BASE}sounds/minecraft/${file}`);
  a.volume = volume;
  a.play().catch(() => {});
};

// ---------------------------------------------------------------- game rules

function winner(b: Cell[]): { who: 0 | 1; line: number[] } | 'draw' | null {
  for (const line of LINES) {
    const [a, c, d] = line;
    if (b[a] !== null && b[a] === b[c] && b[a] === b[d]) return { who: b[a] as 0 | 1, line };
  }
  return b.every((c) => c !== null) ? 'draw' : null;
}

/** Perfect play (minimax): the computer never loses on hard. */
function bestMove(b: Cell[], me: 0 | 1): number {
  const other = (me ^ 1) as 0 | 1;
  const score = (bb: Cell[], player: 0 | 1, depth: number): number => {
    const w = winner(bb);
    if (w === 'draw') return 0;
    if (w) return w.who === me ? 10 - depth : depth - 10;
    const scores = bb.flatMap((c, i) => {
      if (c !== null) return [];
      bb[i] = player;
      const s = score(bb, (player ^ 1) as 0 | 1, depth + 1);
      bb[i] = null;
      return [s];
    });
    return player === me ? Math.max(...scores) : Math.min(...scores);
  };
  let best = -Infinity;
  let move = b.indexOf(null);
  b.forEach((c, i) => {
    if (c !== null) return;
    b[i] = me;
    const s = score(b, other, 1);
    b[i] = null;
    if (s > best) [best, move] = [s, i];
  });
  return move;
}

function computerMove() {
  const free = board.flatMap((c, i) => (c === null ? [i] : []));
  // Easy: mostly random, but it takes a win when it sees one.
  const move = mode === 'hard' ? bestMove([...board], 1) : (free.find((i) => { const b = [...board]; b[i] = 1; return (winner(b) as { who: number } | null)?.who === 1; }) ?? free[(Math.random() * free.length) | 0]);
  setTimeout(() => place(move), 450);
}

// ---------------------------------------------------------------- drawing

const playerName = (p: 0 | 1) => (mode !== 'pvp' && p === 1 ? t('mc.ttt.computer') : itemName(pieces[p]));

function renderPlayers() {
  document.querySelectorAll<HTMLElement>('.ttt-player').forEach((el) => {
    const p = Number(el.dataset.player) as 0 | 1;
    $('.ttt-pick', el).replaceChildren(itemIcon(pieces[p], sheet, 32));
    $('.ttt-name', el).textContent = playerName(p);
    $('.ttt-score', el).textContent = String(score[p]);
    el.classList.toggle('ttt-turn', !over && turn === p);
  });
}

function renderBoard(line?: number[]) {
  cells.forEach((btn, i) => {
    const who = board[i];
    btn.classList.toggle('ttt-win', !!line?.includes(i));
    if (who === null) btn.replaceChildren();
    else if (!btn.firstChild) btn.append(itemIcon(pieces[who], sheet, 56));
  });
}

function renderStatus() {
  const w = winner(board);
  if (w === 'draw') tr(status, 'mc.ttt.draw');
  else if (w) tr(status, 'mc.ttt.won', { name: playerName(w.who) });
  else tr(status, 'mc.ttt.turn', { name: playerName(turn) });
}

// ---------------------------------------------------------------- moves

function place(i: number) {
  if (over || board[i] !== null) return;
  board[i] = turn;
  play('pop.ogg', 0.35);
  renderBoard();
  cells[i].firstElementChild?.animate([{ transform: 'scale(0.2) rotate(-20deg)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  const w = winner(board);
  if (w) {
    over = true;
    if (w !== 'draw') {
      score[w.who]++;
      play('levelup.ogg', 0.3);
      renderBoard(w.line);
    }
  } else {
    turn = (turn ^ 1) as 0 | 1;
  }
  renderStatus();
  renderPlayers();
  if (!over && mode !== 'pvp' && turn === 1) computerMove();
}

function restart() {
  board = Array(9).fill(null);
  over = false;
  // Take turns starting.
  starter = (starter ^ 1) as 0 | 1;
  turn = starter;
  renderBoard();
  renderStatus();
  renderPlayers();
  if (mode !== 'pvp' && turn === 1) computerMove();
}

cells.forEach((btn, i) =>
  btn.addEventListener('click', () => {
    if (mode !== 'pvp' && turn === 1) return;
    place(i);
  }),
);
$('#restart').addEventListener('click', restart);

document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
  btn.classList.toggle('btn-active', btn.dataset.mode === mode);
  btn.addEventListener('click', () => {
    mode = btn.dataset.mode as Mode;
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('btn-active', b === btn));
    score[0] = score[1] = 0;
    save();
    starter = 1; // so restart() lets player 1 begin
    restart();
  });
});

// ---------------------------------------------------------------- choosing items

let picking: 0 | 1 = 0;
const picker = await itemPicker($('#picker'), (item) => {
  // The two players need different items.
  if (item.id === pieces[(picking ^ 1) as 0 | 1].id) return;
  pieces[picking] = item;
  save();
  dialog.close();
  renderBoard();
  cells.forEach((btn, i) => board[i] !== null && btn.replaceChildren(itemIcon(pieces[board[i] as 0 | 1], sheet, 56)));
  renderPlayers();
  renderStatus();
});
document.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((btn) =>
  btn.addEventListener('click', () => {
    picking = Number(btn.dataset.pick) as 0 | 1;
    tr($('#picker-title'), 'mc.ttt.choose', { n: picking + 1 });
    dialog.showModal();
    picker.focus();
  }),
);

window.addEventListener('sgoi:lang', () => {
  renderPlayers();
  renderStatus();
});

renderBoard();
renderStatus();
renderPlayers();
