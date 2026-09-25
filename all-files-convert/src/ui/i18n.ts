import { signal } from "@preact/signals";
import {
  nextLang,
  storeLang,
  storedLang,
  translate,
  type Dict,
  type Dicts,
  type Vars,
} from "../../../shared/i18n.ts";

/**
 * Translations for the converter UI. The texts are the same language files the
 * other SGOI tools use (../public/lang_support/*.json), bundled in at build
 * time. Components that call t() re-render by themselves when `lang` changes,
 * because reading the signal subscribes them to it.
 */
const files = import.meta.glob("../../../public/lang_support/*.json", {
  eager: true,
  import: "default",
});

const dicts: Dicts = Object.fromEntries(
  Object.values(files).map((d) => [(d as Dict)._meta.code, d as Dict]),
);

export const lang = signal(storedLang(dicts));

lang.subscribe((code) => {
  document.documentElement.lang = dicts[code]?._meta.html ?? "en";
});

export const t = (key: string, vars?: Vars) => translate(dicts, lang.value, key, vars);

/** Short code of the current language, e.g. "EN". */
export const langShort = () => dicts[lang.value]?._meta.short ?? "EN";

/** Name of the language the switch button changes to. */
export const nextLangName = () => nextLang(dicts, lang.value).name;

export function switchLang() {
  const next = nextLang(dicts, lang.value);
  lang.value = next.code;
  storeLang(next.code);
}
