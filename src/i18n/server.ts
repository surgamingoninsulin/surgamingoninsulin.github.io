// Build-time side of the translations: reads public/lang_support/*.json so the
// Astro pages are rendered in English, and every language can be embedded in
// the page for switching in the browser (see src/scripts/i18n.ts).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_LANG, translate, type Dict, type Dicts, type Vars } from '../../shared/i18n';

const DIR = join(process.cwd(), 'public', 'lang_support');

export const DICTS: Dicts = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const dict = JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Dict;
      return [dict._meta.code, dict];
    }),
);

/** Text in the default language, for the HTML the server renders. */
export const t = (key: string, vars?: Vars) => translate(DICTS, DEFAULT_LANG, key, vars);
