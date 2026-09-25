// Before first paint: restore the theme shared with the YouTube → MP3 site
// (same origin, same localStorage key) and enable entrance animations.
try {
  const t = localStorage.getItem("ytmp3.theme");
  if (t === "ytlight" || t === "ytdark") document.documentElement.dataset.theme = t;
  // The side menu is always shown on desktop.
  if (matchMedia("(min-width: 1024px)").matches) document.documentElement.dataset.side = "open";
} catch {}
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.documentElement.classList.add("motion");
}
