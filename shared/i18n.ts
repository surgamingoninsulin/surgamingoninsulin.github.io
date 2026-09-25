// Translation core shared by every SGOI tool. The texts live in
// public/lang_support/<code>.json (e.g. en_US.json, nl_NL.json); every file
// has a "_meta" block and the same keys. Adding a language = adding a file.
//
// Keys are dotted paths ("yt.add.title"). Values can use {placeholders}, and a
// value that is an object with "one"/"other" is picked by the {n} variable.
// A key missing in a language falls back to English.

export interface LangMeta {
  code: string;
  /** Value for <html lang>. */
  html: string;
  name: string;
  short: string;
}

export type Dict = { _meta: LangMeta } & Record<string, unknown>;
export type Dicts = Record<string, Dict>;
export type Vars = Record<string, string | number>;

export const DEFAULT_LANG = 'en_US';
/** Shared by all tools (same origin), so the choice carries over between them. */
export const LANG_STORAGE_KEY = 'sgoi.lang';

function lookup(dict: Dict | undefined, key: string): unknown {
  let v: unknown = dict;
  for (const part of key.split('.')) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return v;
}

export function translate(dicts: Dicts, lang: string, key: string, vars?: Vars): string {
  let v = lookup(dicts[lang], key);
  if (v === undefined) v = lookup(dicts[DEFAULT_LANG], key);
  if (v && typeof v === 'object' && vars && 'n' in vars) {
    const forms = v as Record<string, unknown>;
    v = Number(vars.n) === 1 ? forms.one : forms.other;
  }
  if (typeof v !== 'string') return key;
  return vars ? v.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : v;
}

/** Languages sorted with the default first. */
export function languages(dicts: Dicts): LangMeta[] {
  return Object.values(dicts)
    .map((d) => d._meta)
    .sort((a, b) => (a.code === DEFAULT_LANG ? -1 : b.code === DEFAULT_LANG ? 1 : a.name.localeCompare(b.name)));
}

export function storedLang(dicts: Dicts): string {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved && dicts[saved]) return saved;
  } catch {}
  return DEFAULT_LANG;
}

export function storeLang(code: string) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, code);
  } catch {}
}

/** The language after `current` (the header button cycles through them). */
export function nextLang(dicts: Dicts, current: string): LangMeta {
  const list = languages(dicts);
  const i = list.findIndex((l) => l.code === current);
  return list[(i + 1) % list.length];
}
