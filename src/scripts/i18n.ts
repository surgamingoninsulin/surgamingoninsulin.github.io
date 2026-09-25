// Browser side of the translations for the Astro pages.
//
// The page is rendered in English; elements that can be translated carry the
// key in an attribute:
//   data-i18n="key"              text content
//   data-i18n-html="key"         HTML content (for texts with links or <kbd>)
//   data-i18n-attr="title:key;placeholder:key2"
//   data-i18n-vars='{"n":3}'     values for {placeholders}
// Switching language re-translates every such element on the page, including
// the ones app.ts creates, so nothing has to be rebuilt or reloaded.
import { nextLang, storeLang, storedLang, translate, type Dicts, type Vars } from '../../shared/i18n';

const dicts: Dicts = JSON.parse(document.getElementById('sgoi-i18n')?.textContent || '{}');

let lang = storedLang(dicts);

/** A variable written as "@some.key" is itself translated (e.g. "the pasted text"). */
const resolve = (vars?: Vars): Vars | undefined =>
  vars &&
  Object.fromEntries(
    Object.entries(vars).map(([k, v]) => [k, typeof v === 'string' && v.startsWith('@') ? translate(dicts, lang, v.slice(1)) : v]),
  );

export const t = (key: string, vars?: Vars) => translate(dicts, lang, key, resolve(vars));

const varsOf = (el: HTMLElement): Vars | undefined => (el.dataset.i18nVars ? JSON.parse(el.dataset.i18nVars) : undefined);

/** Sets an element's text to a translation and remembers the key for later switches. */
export function tr<E extends HTMLElement>(el: E, key: string, vars?: Vars): E {
  el.dataset.i18n = key;
  if (vars) el.dataset.i18nVars = JSON.stringify(vars);
  else delete el.dataset.i18nVars;
  el.textContent = t(key, vars);
  return el;
}

/** Sets text that is not translated (a title, a file name), dropping any earlier key. */
export function plain<E extends HTMLElement>(el: E, text: string): E {
  delete el.dataset.i18n;
  delete el.dataset.i18nVars;
  el.textContent = text;
  return el;
}

/** Sets a translated attribute (e.g. title) and remembers the key. */
export function trAttr<E extends HTMLElement>(el: E, attr: string, key: string): E {
  const others = (el.dataset.i18nAttr ?? '').split(';').filter((p) => p && !p.startsWith(`${attr}:`));
  el.dataset.i18nAttr = [...others, `${attr}:${key}`].join(';');
  el.setAttribute(attr, t(key));
  return el;
}

function apply() {
  const meta = dicts[lang]?._meta;
  if (meta) document.documentElement.lang = meta.html;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n!, varsOf(el))));
  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml!, varsOf(el))));
  document.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr!.split(';')) {
      const [attr, key] = pair.split(':');
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
  // Language buttons show the current language; the tooltip names the next one.
  const next = nextLang(dicts, lang);
  document.querySelectorAll<HTMLElement>('[data-lang-switch]').forEach((btn) => {
    const label = btn.querySelector('[data-lang-short]');
    if (label) label.textContent = dicts[lang]._meta.short;
    btn.title = t('common.switchLanguage', { name: next.name });
    btn.setAttribute('aria-label', btn.title);
  });
  document.documentElement.classList.remove('i18n-wait');
}

export function setLang(code: string) {
  if (!dicts[code] || code === lang) return;
  lang = code;
  storeLang(code);
  apply();
  window.dispatchEvent(new CustomEvent('sgoi:lang', { detail: code }));
}

document.querySelectorAll<HTMLElement>('[data-lang-switch]').forEach((btn) =>
  btn.addEventListener('click', () => setLang(nextLang(dicts, lang).code)),
);

apply();
