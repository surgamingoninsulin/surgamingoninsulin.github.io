import { signal } from "@preact/signals";

// Same theme names and storage key as the YouTube → MP3 site, so switching
// the theme on one site also switches it on the other.
export type Theme = "ytlight" | "ytdark";

const STORAGE_KEY = "ytmp3.theme";

function getStoredTheme(): Theme {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    if (t === "ytlight" || t === "ytdark") return t;
  } catch {}
  return "ytdark";
}

export const theme = signal<Theme>(getStoredTheme());

theme.subscribe((value) => {
  document.documentElement.dataset.theme = value;
});

export function toggleTheme() {
  theme.value = theme.value === "ytlight" ? "ytdark" : "ytlight";
  try {
    localStorage.setItem(STORAGE_KEY, theme.value);
  } catch {}
}

export function initTheme() {
  document.documentElement.dataset.theme = theme.value;
}
