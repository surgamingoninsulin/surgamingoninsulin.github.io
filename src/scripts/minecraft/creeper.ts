// The easter egg on the Minecraft page (like Google's search easter eggs): a 3D
// creeper pops in from a random edge of the screen, hisses, swells, glows and
// explodes. Rarely a villager shows up instead, panics and drops emeralds.
// The 3D part (three.js, ./mobs3d.ts) only loads when the show plays.

/** 8×8 creeper face: G = green (a few shades), B = black. */
const FACE = ['GGGGGGGG', 'GGGGGGGG', 'GBBGGBBG', 'GBBGGBBG', 'GGGBBGGG', 'GGBBBBGG', 'GGBBBBGG', 'GGBGGBGG'];
const GREENS = ['#5dbb46', '#4ca63a', '#6fc955', '#3f8f30', '#58b243', '#67c14e'];

/** The creeper face as an SVG string (same pixels every time), for the button. */
export function creeperSvg(size = 64): string {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const px = FACE.flatMap((row, y) =>
    [...row].map((c, x) => {
      const fill = c === 'B' ? (rnd() < 0.5 ? '#0b0b0b' : '#1c1c1c') : GREENS[(rnd() * GREENS.length) | 0];
      return `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${px.join('')}</svg>`;
}

// ---------------------------------------------------------------- sound

// Real Minecraft sounds (from mcasset.cloud, in public/sounds/minecraft/).
const SOUNDS = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}sounds/minecraft/`;

/** Plays a sound; does nothing when the browser blocks audio (no click on the site yet). */
function sound(file: string, volume = 1) {
  // A bare file name is one of ours in public/sounds/minecraft/; anything with a slash is a full URL.
  const a = new Audio(file.includes('/') ? file : SOUNDS + file);
  a.volume = volume;
  a.play().catch(() => {});
}

// ---------------------------------------------------------------- 2D effects

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Flash, screen shake, flying blocks and a puff of smoke at a screen point. */
async function explode(stage: HTMLElement, cx: number, cy: number, shake?: HTMLElement | null) {
  const flash = document.createElement('div');
  flash.className = 'creeper-flash';
  stage.append(flash);
  // A soft glow around the blast, not a full-screen white flash (photosensitivity).
  flash.style.setProperty('--x', `${cx}px`);
  flash.style.setProperty('--y', `${cy}px`);
  flash.animate([{ opacity: 0 }, { opacity: 0.35 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
  shake?.animate(
    // A small wobble, not a hard shake.
    [0, -4, 3, -2, 1, 0].map((x, i) => ({ transform: `translate(${x}px, ${i % 2 ? 2 : -2}px)` })),
    { duration: 450, easing: 'ease-out' },
  );
  const blocks = Array.from({ length: 34 }, () => {
    const b = document.createElement('i');
    b.className = 'creeper-bit';
    b.style.left = `${cx}px`;
    b.style.top = `${cy}px`;
    b.style.background = Math.random() < 0.7 ? GREENS[(Math.random() * GREENS.length) | 0] : '#1c1c1c';
    const size = 8 + Math.random() * 18;
    b.style.width = b.style.height = `${size}px`;
    stage.append(b);
    const angle = Math.random() * Math.PI * 2;
    const dist = 140 + Math.random() * Math.min(innerWidth, innerHeight) * 0.45;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    return b.animate(
      [
        { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy * 0.6}px)) rotate(${Math.random() * 540 - 270}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy * 0.6 + 160}px)) rotate(${Math.random() * 720 - 360}deg)`, opacity: 0 },
      ],
      { duration: 1100 + Math.random() * 400, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)', fill: 'forwards' },
    ).finished;
  });
  await wait(700);
  await Promise.all([...blocks, puffs(stage, cx, cy)]);
}

/** A cloud of square smoke puffs (gray, or any color) rising from a point. */
function puffs(stage: HTMLElement, cx: number, cy: number, color = '#d9d9d9', count = 14, spread = 70) {
  const all = Array.from({ length: count }, (_, i) => {
    const p = document.createElement('i');
    p.className = 'creeper-puff';
    const a = (i / count) * Math.PI * 2;
    const r = 20 + Math.random() * spread;
    p.style.left = `${cx + Math.cos(a) * r}px`;
    p.style.top = `${cy + Math.sin(a) * r}px`;
    const size = 26 + Math.random() * 34;
    p.style.width = p.style.height = `${size}px`;
    p.style.background = color;
    stage.append(p);
    return p.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0.9 },
        { transform: `translate(-50%, calc(-50% - ${40 + Math.random() * 50}px)) scale(1.6)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 400, easing: 'ease-out', fill: 'forwards' },
    ).finished;
  });
  return Promise.all(all);
}

/** An item (its texture) pops out of a point, bounces and fades. */
function drop(stage: HTMLElement, x: number, y: number, src: string) {
  const img = Object.assign(document.createElement('img'), { src, className: 'mob-item', alt: '' });
  img.style.left = `${x}px`;
  img.style.top = `${y}px`;
  stage.append(img);
  const dx = (Math.random() - 0.5) * 160;
  img
    .animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
        { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% - 110px)) scale(1)`, opacity: 1, offset: 0.35 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + 30px)) scale(1)`, opacity: 1, offset: 0.7 },
        { transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + 10px)) scale(1)`, opacity: 1, offset: 0.82 },
        { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + 30px)) scale(1)`, opacity: 0 },
      ],
      { duration: 1400, easing: 'ease-out', fill: 'forwards' },
    )
    .finished.then(() => img.remove());
}

/** An item (e.g. an arrow) flies from a point across the screen. */
function fly(stage: HTMLElement, x: number, y: number, src: string) {
  const img = Object.assign(document.createElement('img'), { src, className: 'mob-item', alt: '' });
  img.style.left = `${x}px`;
  img.style.top = `${y}px`;
  stage.append(img);
  // Towards the middle of the screen and beyond.
  const tx = innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.4 - x;
  const ty = innerHeight / 2 + (Math.random() - 0.5) * innerHeight * 0.4 - y;
  const k = Math.max(innerWidth, innerHeight) / Math.hypot(tx, ty);
  // The arrow texture points up-right (45°).
  const angle = (Math.atan2(ty, tx) * 180) / Math.PI + 45;
  img
    .animate(
      [
        { transform: `translate(-50%, -50%) rotate(${angle}deg)`, opacity: 1 },
        { transform: `translate(calc(-50% + ${tx * k}px), calc(-50% + ${ty * k}px)) rotate(${angle}deg)`, opacity: 1 },
      ],
      { duration: 900, easing: 'linear', fill: 'forwards' },
    )
    .finished.then(() => img.remove());
}

// ---------------------------------------------------------------- the show

/** How often the villager shows up instead of the creeper. */
const VILLAGER_CHANCE = 0.15;
let playing = false;

/**
 * Plays the show once. `shake` is the element that shakes on BOOM. `mob` picks
 * one (the secret pickaxe click asks for the villager); otherwise #villager or
 * #creeper in the address, else mostly the creeper.
 */
export async function playCreeper(shake: HTMLElement | null, texts: { huh: string; ahh: string }, mob?: 'creeper' | 'villager') {
  if (playing || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  playing = true;
  const stage = document.createElement('div');
  stage.className = 'creeper-stage';
  stage.setAttribute('aria-hidden', 'true');
  document.body.append(stage);
  try {
    const mobs = await import('./mobs3d');
    const wanted = mob ?? (location.hash === '#villager' ? 'villager' : location.hash === '#creeper' ? 'creeper' : undefined);
    const pick = wanted ? wanted === 'villager' : Math.random() < VILLAGER_CHANCE;
    const hooks = { sound, texts, explode: (x: number, y: number) => explode(stage, x, y, shake) };
    await (pick ? mobs.villagerShow(stage, hooks) : mobs.creeperShow(stage, hooks));
  } catch (e) {
    // No WebGL or the models could not load: skip the show quietly.
    console.warn('Easter egg skipped:', e);
  } finally {
    stage.remove();
    playing = false;
  }
}

// ---------------------------------------------------------------- mob visits

const MOBS = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}mobs/`;
let lastMob = '';

/**
 * A random mob (from public/mobs/index.json) peeks in, and reacts when clicked.
 * `id` picks one (for testing: add #mob=pig to the address).
 */
export async function playVisit(shake: HTMLElement | null, id?: string) {
  if (playing || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  playing = true;
  const stage = document.createElement('div');
  stage.className = 'creeper-stage';
  document.body.append(stage);
  try {
    const [mobs, index] = await Promise.all([import('./mobs3d'), fetch(`${MOBS}index.json`).then((r) => r.json())]);
    const list = index as import('./mobs3d').MobInfo[];
    const choices = list.filter((m) => m.id !== lastMob);
    const info = list.find((m) => m.id === id) ?? choices[(Math.random() * choices.length) | 0];
    lastMob = info.id;
    await mobs.mobVisit(
      stage,
      info,
      {
        sound,
        poof: (x, y) => void puffs(stage, x, y),
        drop: (x, y, src) => drop(stage, x, y, src),
        fly: (x, y, src) => fly(stage, x, y, src),
        teleport: (x, y) => void puffs(stage, x, y, '#b04cff', 22, 50),
        explode: (x, y) => explode(stage, x, y, shake),
      },
      MOBS,
    );
  } catch (e) {
    console.warn('Mob visit skipped:', e);
  } finally {
    stage.remove();
    playing = false;
  }
}

/**
 * Starts the mob visits on a Minecraft page: every minute or so a random mob
 * peeks in. The first one waits a bit, so it does not clash with the creeper.
 */
export function startMobVisits(shake: HTMLElement | null) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const forced = location.hash.match(/^#mob=([\w-]+)/)?.[1];
  const next = (ms: number) => setTimeout(async () => {
    await playVisit(shake);
    next(40_000 + Math.random() * 40_000);
  }, ms);
  if (forced) setTimeout(() => playVisit(shake, forced), 800);
  next(25_000 + Math.random() * 20_000);
}
