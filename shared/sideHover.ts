// Side-menu dropdowns (details.side-tree) open when the mouse is over them and
// close shortly after it leaves, except the one holding the current page.
// Touch screens keep tap-to-open. Used by src/scripts/ui.ts and the converter's
// SiteShell, so both menus behave the same.

const CLOSE_DELAY = 250;

export function hoverDropdowns(root: Document = document) {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const timers = new WeakMap<Element, number>();

  const trees = (el: Element | null) => {
    const out: HTMLDetailsElement[] = [];
    for (let d = el?.closest<HTMLDetailsElement>('details.side-tree'); d; d = d.parentElement?.closest<HTMLDetailsElement>('details.side-tree'))
      out.push(d);
    return out;
  };

  root.addEventListener('pointerover', (e) => {
    for (const d of trees(e.target as Element)) {
      clearTimeout(timers.get(d));
      d.open = true;
    }
  });

  root.addEventListener('pointerout', (e) => {
    const to = e.relatedTarget as Element | null;
    for (const d of trees(e.target as Element)) {
      if (to && d.contains(to)) break; // still inside this one (and so its parents)
      if (d.querySelector('.menu-active')) continue; // the current page's branch stays open
      timers.set(d, window.setTimeout(() => (d.open = false), CLOSE_DELAY));
    }
  });

  // A mouse click on a heading would close what hovering just opened; keyboard
  // (Enter / Space, detail 0) still toggles.
  root.addEventListener('click', (e) => {
    const summary = (e.target as Element).closest('summary.side-branch');
    if (summary && (e as MouseEvent).detail > 0) e.preventDefault();
  });
}
