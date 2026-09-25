// Every Minecraft item with its icon (public/mc-items/, made by
// `npm run items:update`) and a misode-style item picker, shared by the
// Minecraft tools and games.
import { t } from '../i18n';

const BASE = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}mc-items/`;

export interface Item {
  id: string;
  /** Position in the icon sheet. */
  i: number;
  en: string;
  nl: string;
  stack: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic';
  durability: number;
  block?: boolean;
  food?: boolean;
  tool?: boolean;
  weapon?: boolean;
  armor?: string;
  fireproof?: boolean;
  enchantable: number;
}

interface ItemData {
  version: string;
  size: number;
  cols: number;
  items: Item[];
}

let data: Promise<ItemData> | undefined;
/** All items (loaded once). */
export function loadItems(): Promise<ItemData> {
  data ??= fetch(`${BASE}items.json`).then((r) => r.json());
  return data;
}

/** The item's name in the page language. */
export const itemName = (item: Item) => (document.documentElement.lang === 'nl' ? item.nl : item.en);

/** An element showing the item's icon at `px` pixels (CSS sprite from the sheet). */
export function itemIcon(item: Item, sheet: { size: number; cols: number; items: Item[] }, px = 32): HTMLElement {
  const el = document.createElement('span');
  el.className = 'mc-item-icon';
  const k = px / sheet.size;
  const rows = Math.ceil(sheet.items.length / sheet.cols);
  Object.assign(el.style, {
    width: `${px}px`,
    height: `${px}px`,
    backgroundImage: `url(${BASE}items.png)`,
    backgroundSize: `${sheet.cols * sheet.size * k}px ${rows * sheet.size * k}px`,
    backgroundPosition: `-${(item.i % sheet.cols) * px}px -${Math.floor(item.i / sheet.cols) * px}px`,
  });
  el.title = itemName(item);
  return el;
}

/** Lower-case, accent-free text for searching. */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Items whose name (either language) or id matches the search, best first:
 * exact name, then names starting with the search, then the rest.
 */
export function searchItems(items: Item[], query: string): Item[] {
  const q = norm(query).trim();
  const words = q.split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  const rank = (it: Item) => {
    const names = [norm(it.en), norm(it.nl), it.id.replace(/_/g, ' ')];
    if (names.includes(q)) return 0;
    if (names.some((n) => n.startsWith(q))) return 1;
    return 2;
  };
  return items
    .filter((it) => {
      const hay = norm(`${it.en} ${it.nl} ${it.id}`);
      return words.every((w) => hay.includes(w));
    })
    .map((it) => ({ it, r: rank(it) }))
    .sort((a, b) => a.r - b.r || a.it.en.length - b.it.en.length)
    .map((x) => x.it);
}

/**
 * A misode-style item picker: a search box above a grid of item icons.
 * Calls onPick with the chosen item.
 */
export async function itemPicker(container: HTMLElement, onPick: (item: Item) => void, opts: { filter?: (i: Item) => boolean } = {}) {
  const sheet = await loadItems();
  const all = opts.filter ? sheet.items.filter(opts.filter) : sheet.items;
  container.classList.add('mc-picker');
  container.replaceChildren();
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'input input-sm w-full';
  search.placeholder = t('mc.items.search');
  search.dataset.i18nAttr = 'placeholder:mc.items.search';
  const grid = document.createElement('div');
  grid.className = 'mc-picker-grid';
  const count = document.createElement('p');
  count.className = 'text-xs opacity-60';
  container.append(search, grid, count);

  const show = () => {
    const list = searchItems(all, search.value);
    // Enough to scroll through; a very long list only while searching.
    const shown = list.slice(0, search.value ? 400 : 240);
    grid.replaceChildren(
      ...shown.map((item) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mc-slot';
        b.append(itemIcon(item, sheet, 32));
        b.title = itemName(item);
        b.addEventListener('click', () => onPick(item));
        return b;
      }),
    );
    count.textContent = t('mc.items.count', { n: list.length });
  };
  search.addEventListener('input', show);
  show();
  return { focus: () => search.focus() };
}
