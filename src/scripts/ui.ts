// Page chrome: entrance animations, side menu, theme toggle.
import { animate, stagger } from 'motion';
import { t } from './i18n';
import { hoverDropdowns } from '../../shared/sideHover';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = [0.22, 1, 0.36, 1] as const;

/** Springs a freshly added list row into place (used by app.ts). */
export function reveal(el: Element) {
  if (reduce) return;
  animate(el, { opacity: [0, 1], y: [10, 0], scale: [0.98, 1] }, { type: 'spring', bounce: 0.35, duration: 0.55 });
}

/** Slides a list row out, then removes it (used by app.ts). */
export async function dismiss(el: Element) {
  if (!reduce) await animate(el, { opacity: [1, 0], x: [0, 32] }, { duration: 0.28, ease });
  el.remove();
}

// ---------------------------------------------------------------- entrance

if (!reduce) {
  animate('.yt-logo', { rotate: [-12, 0], scale: [0.6, 1] }, { type: 'spring', bounce: 0.5, duration: 0.9, delay: 0.15 });
  animate('.side-menu .menu li', { opacity: [0, 1], x: [-16, 0] }, { delay: stagger(0.06, { startDelay: 0.25 }), duration: 0.45, ease });

  // Sections fade in with pure CSS (html.motion [data-reveal] in global.css), so
  // content shows on first paint instead of waiting for this script.
}

// ---------------------------------------------------------------- side menu

const drawer = document.getElementById('nav') as HTMLInputElement | null;
const menuLinks = [...document.querySelectorAll<HTMLAnchorElement>('.side-menu .menu a')];

// "<" / ">" button on the menu's edge: opens and closes the drawer on phones.
// On desktop the menu is always shown (and the button hidden, see global.css).
const root = document.documentElement;
const sideToggle = document.getElementById('side-toggle') as HTMLButtonElement | null;
const desktop = matchMedia('(min-width: 1024px)');

function showSide(open: boolean) {
  root.dataset.side = open ? 'open' : 'closed';
  if (sideToggle) sideToggle.title = sideToggle.ariaLabel = t(open ? 'common.closeMenu' : 'common.openMenu');
  sideToggle?.setAttribute('aria-expanded', String(open));
}

const syncSide = () => showSide(desktop.matches || !!drawer?.checked);

sideToggle?.addEventListener('click', () => {
  if (desktop.matches || !drawer) return;
  drawer.checked = !drawer.checked;
  syncSide();
});
drawer?.addEventListener('change', syncSide);
hoverDropdowns();
desktop.addEventListener('change', syncSide);
syncSide();
window.addEventListener('sgoi:lang', syncSide);

// Close the mobile drawer after picking a menu entry. The entry for the page
// you're on doesn't reload it (that would throw away added links and downloads).
menuLinks.forEach((a) =>
  a.addEventListener('click', (e) => {
    if (a.getAttribute('aria-current') === 'page') e.preventDefault();
    if (drawer && !desktop.matches) {
      drawer.checked = false;
      syncSide();
    }
  }),
);

// ---------------------------------------------------------------- theme

const toggle = document.getElementById('theme-toggle') as HTMLInputElement | null;
if (toggle) {
  toggle.checked = document.documentElement.dataset.theme === 'ytlight';
  toggle.addEventListener('change', () => {
    const theme = toggle.checked ? 'ytlight' : 'ytdark';
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('ytmp3.theme', theme);
    } catch {}
  });
}
