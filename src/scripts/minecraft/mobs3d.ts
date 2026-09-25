// 3D mobs for the Minecraft page's easter egg (loaded only when it plays):
// a creeper or, rarely, a villager built from Minecraft-style boxes with the
// real textures, popping in from a random edge of the screen.
import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const TEX = `${BASE}textures/minecraft/`;

// ---------------------------------------------------------------- models

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** One pixel-sharp texture from one or more layers drawn on top of each other. */
async function texture(files: string[]): Promise<THREE.Texture> {
  const imgs = await Promise.all(files.map((f) => loadImage(TEX + f)));
  const c = document.createElement('canvas');
  c.width = imgs[0].width;
  c.height = imgs[0].height;
  const g = c.getContext('2d')!;
  for (const img of imgs) g.drawImage(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A box of w×h×d model pixels whose faces use the texture region at (u, v),
 * laid out the way Minecraft's entity models are. `inflate` grows the box
 * without changing its texture (for the villager's robe).
 */
function mcBox(w: number, h: number, d: number, u: number, v: number, texSize: [number, number], mat: THREE.Material, inflate = 0) {
  const [tw, th] = texSize;
  const geo = new THREE.BoxGeometry(w + inflate * 2, h + inflate * 2, d + inflate * 2);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const rect = (x: number, y: number, rw: number, rh: number) => [
    [x, y],
    [x + rw, y],
    [x, y + rh],
    [x + rw, y + rh],
  ];
  // three.js face order: +x, -x, +y, -y, +z (front), -z (back)
  const faces = [
    rect(u + d + w, v + d, d, h),
    rect(u, v + d, d, h),
    rect(u + d, v, w, d),
    rect(u + d + w, v, w, d),
    rect(u + d, v + d, w, h),
    rect(u + d + w + d, v + d, w, h),
  ];
  faces.forEach((face, i) => face.forEach(([x, y], j) => uv.setXY(i * 4 + j, x / tw, 1 - y / th)));
  uv.needsUpdate = true;
  return new THREE.Mesh(geo, mat);
}

export interface Mob {
  model: THREE.Group;
  head: THREE.Object3D;
  /** Height in model pixels (feet at y = 0). */
  height: number;
  materials: THREE.Material[];
}

function creeper(tex: THREE.Texture): Mob {
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.1 });
  const T: [number, number] = [64, 32];
  const model = new THREE.Group();
  const head = mcBox(8, 8, 8, 0, 0, T, mat);
  head.position.set(0, 22, 0);
  const body = mcBox(8, 12, 4, 16, 16, T, mat);
  body.position.set(0, 12, 0);
  model.add(head, body);
  for (const [x, z] of [[-2, 4], [2, 4], [-2, -4], [2, -4]]) {
    const leg = mcBox(4, 6, 4, 0, 16, T, mat);
    leg.position.set(x, 3, z);
    model.add(leg);
  }
  return { model, head, height: 26, materials: [mat] };
}

function villager(tex: THREE.Texture): Mob {
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.1 });
  const T: [number, number] = [64, 64];
  const model = new THREE.Group();
  const head = mcBox(8, 10, 8, 0, 0, T, mat);
  head.position.set(0, 29, 0);
  const nose = mcBox(2, 4, 2, 24, 0, T, mat);
  nose.position.set(0, 26, 5);
  const body = mcBox(8, 12, 6, 16, 20, T, mat);
  body.position.set(0, 18, 0);
  const robe = mcBox(8, 20, 6, 0, 38, T, mat, 0.5);
  robe.position.set(0, 14, 0);
  // Arms crossed in front, tilted forward.
  const arms = new THREE.Group();
  arms.position.set(0, 21, 1);
  arms.rotation.x = -0.75;
  const left = mcBox(4, 8, 4, 44, 22, T, mat);
  left.position.set(-6, -2, 0);
  const right = mcBox(4, 8, 4, 44, 22, T, mat);
  right.position.set(6, -2, 0);
  const middle = mcBox(8, 4, 4, 40, 38, T, mat);
  middle.position.set(0, -4, 0);
  arms.add(left, right, middle);
  model.add(head, nose, body, robe, arms);
  for (const x of [-2, 2]) {
    const leg = mcBox(4, 12, 4, 0, 22, T, mat);
    leg.position.set(x, 6, 0);
    model.add(leg);
  }
  return { model, head, height: 34, materials: [mat] };
}

// ---------------------------------------------------------------- scene

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const easeOutBack = (k: number) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;
const easeIn = (k: number) => k * k;

interface Particle {
  sprite: THREE.Sprite;
  vel: THREE.Vector2;
  spin: number;
  age: number;
  life: number;
}

export class Scene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  W = innerWidth;
  H = innerHeight;
  particles: Particle[] = [];
  /** Extra work to do every frame (e.g. keep a click target on a mob). */
  frame: Array<() => void> = [];
  gravity = new THREE.Vector2();
  private raf = 0;
  private last = performance.now();

  constructor(stage: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(this.W, this.H);
    this.renderer.domElement.className = 'creeper-canvas';
    stage.append(this.renderer.domElement);
    // One unit is one CSS pixel, (0, 0) is the middle of the screen.
    this.camera = new THREE.OrthographicCamera(-this.W / 2, this.W / 2, this.H / 2, -this.H / 2, -4000, 4000);
    this.camera.position.z = 1000;
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.5, 1, 0.9);
    this.scene.add(sun);
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      for (const f of this.frame) f();
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Runs fn(k) every frame for ms milliseconds, k going 0 → 1. */
  tween(ms: number, fn: (k: number) => void) {
    return new Promise<void>((resolve) => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / ms);
        fn(k);
        if (k < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  /** Screen rectangle (CSS pixels) around an object. */
  toScreenBox(obj: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(obj);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const v = new THREE.Vector3(x, y, z).project(this.camera);
          const sx = ((v.x + 1) / 2) * this.W;
          const sy = ((1 - v.y) / 2) * this.H;
          x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
        }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  /** Screen position (CSS pixels) of an object. */
  toScreen(obj: THREE.Object3D) {
    const v = obj.getWorldPosition(new THREE.Vector3()).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.W, y: ((1 - v.y) / 2) * this.H };
  }

  private step(dt: number) {
    for (const p of this.particles) {
      p.age += dt;
      p.vel.addScaledVector(this.gravity, dt);
      p.sprite.position.x += p.vel.x * dt;
      p.sprite.position.y += p.vel.y * dt;
      p.sprite.material.rotation += p.spin * dt;
      p.sprite.material.opacity = Math.max(0, 1 - Math.max(0, p.age - p.life * 0.6) / (p.life * 0.4));
    }
    for (const p of this.particles.filter((p) => p.age >= p.life)) {
      this.scene.remove(p.sprite);
      p.sprite.material.dispose();
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/**
 * Where a mob pops in: a random spot on a random screen edge, with its feet on
 * the edge and its head pointing into the screen (upside down from the top).
 */
export function placeOnEdge(s: Scene, mob: Mob, heightPx: number) {
  const edge = (Math.random() * 4) | 0; // 0 bottom, 1 top, 2 left, 3 right
  const along = 0.2 + Math.random() * 0.6;
  const pos = [
    [(along - 0.5) * s.W, -s.H / 2],
    [(along - 0.5) * s.W, s.H / 2],
    [-s.W / 2, (along - 0.5) * s.H],
    [s.W / 2, (along - 0.5) * s.H],
  ][edge];
  const angle = [0, Math.PI, -Math.PI / 2, Math.PI / 2][edge] + (Math.random() - 0.5) * 0.5;
  const pivot = new THREE.Group();
  pivot.position.set(pos[0], pos[1], 0);
  pivot.rotation.z = angle;
  const lift = new THREE.Group();
  const k = heightPx / mob.height;
  mob.model.scale.setScalar(k);
  // Turned a little, so it looks 3D.
  mob.model.rotation.y = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.35);
  mob.model.rotation.x = 0.12;
  lift.add(mob.model);
  pivot.add(lift);
  s.scene.add(pivot);
  /** Direction from the edge into the screen. */
  const up = new THREE.Vector2(-Math.sin(angle), Math.cos(angle));
  return { pivot, lift, k, up, hidden: -heightPx * 1.15, shown: -heightPx * 0.03 };
}

const mobHeight = () => Math.min(innerHeight * 0.55, innerWidth * 0.6, 440);

// ---------------------------------------------------------------- shows

export interface ShowHooks {
  /** Plays a sound from public/sounds/minecraft (no-op when audio is blocked). */
  sound: (file: string, volume?: number) => void;
  /** The 2D explosion (flash, shake, flying blocks, smoke) at a screen point. */
  explode: (x: number, y: number) => Promise<void>;
  texts: { huh: string; ahh: string };
}

/** The creeper: pops in, hisses, swells and glows, then explodes. */
export async function creeperShow(stage: HTMLElement, hooks: ShowHooks) {
  const s = new Scene(stage);
  try {
    const mob = creeper(await texture(['creeper.png']));
    const px = mobHeight();
    const at = placeOnEdge(s, mob, px);
    at.lift.position.y = at.hidden;

    await s.tween(750, (k) => (at.lift.position.y = at.hidden + (at.shown - at.hidden) * easeOutBack(k)));

    // Sssss: swell, jitter and glow, like in the game but gentle on the eyes
    // (photosensitivity): a smooth pulse at most ~2.5 times a second, never
    // switching hard to white.
    hooks.sound('fuse.ogg', 0.35);
    const skin = mob.materials[0] as THREE.MeshLambertMaterial;
    skin.emissive.set(0xffffff);
    await s.tween(1700, (k) => {
      mob.model.scale.setScalar(at.k * (1 + 0.3 * easeIn(k)));
      at.lift.position.x = Math.sin(k * 40) * 2 * k;
      const t = k * 1.7; // seconds
      skin.emissiveIntensity = 0.28 * k * (0.5 - 0.5 * Math.cos(2 * Math.PI * (1.2 + 1.3 * k) * t));
    });

    const center = s.toScreen(mob.model.children[1]); // the body
    hooks.sound(Math.random() < 0.5 ? 'explode1.ogg' : 'explode2.ogg', 0.35);
    s.scene.remove(at.pivot);
    await hooks.explode(center.x, center.y);
  } finally {
    s.dispose();
  }
}

/** The rare one: a villager pops up ("Huh?"), panics ("Ahhhh!"), ducks away and drops emeralds. */
export async function villagerShow(stage: HTMLElement, hooks: ShowHooks) {
  const s = new Scene(stage);
  const bubble = document.createElement('div');
  bubble.className = 'mc-bubble';
  stage.append(bubble);
  try {
    const [skin, emerald] = await Promise.all([texture(['villager.png', 'plains.png']), texture(['emerald.png'])]);
    const mob = villager(skin);
    const px = mobHeight() * 0.9;
    const at = placeOnEdge(s, mob, px);
    at.lift.position.y = at.hidden;

    const say = (text: string) => {
      const head = s.toScreen(mob.head);
      // Next to the head, on the side towards the middle of the screen.
      bubble.style.left = `${head.x + at.up.x * px * 0.28}px`;
      bubble.style.top = `${head.y - at.up.y * px * 0.28}px`;
      bubble.textContent = text;
      bubble.classList.remove('show');
      void bubble.offsetWidth;
      bubble.classList.add('show');
    };

    await s.tween(700, (k) => (at.lift.position.y = at.hidden + (at.shown - at.hidden) * easeOutBack(k)));

    // Huh? A curious head tilt.
    hooks.sound('villager-idle1.ogg', 0.5);
    say(hooks.texts.huh);
    await s.tween(1200, (k) => (mob.head.rotation.z = Math.sin(k * Math.PI) * 0.35));
    await wait(150);

    // Ahhhh! Shake, duck back down and throw emeralds everywhere.
    hooks.sound('villager-hit1.ogg', 0.5);
    say(hooks.texts.ahh);
    s.gravity.set(-at.up.x, -at.up.y).multiplyScalar(px * 2.6);
    const origin = new THREE.Vector2(at.pivot.position.x, at.pivot.position.y).addScaledVector(at.up, px * 0.25);
    let thrown = 0;
    await s.tween(900, (k) => {
      at.lift.position.x = Math.sin(k * 70) * 6 * (1 - k);
      if (k > 0.25) at.lift.position.y = at.shown + (at.hidden - at.shown) * easeIn((k - 0.25) / 0.75);
      // A fountain: a few emeralds every frame for most of the way down.
      while (thrown < 40 * Math.min(1, k * 1.3)) {
        thrown++;
        const mat = new THREE.SpriteMaterial({ map: emerald, transparent: true });
        const sprite = new THREE.Sprite(mat);
        const size = px * (0.07 + Math.random() * 0.04);
        sprite.scale.set(size, size, 1);
        sprite.position.set(origin.x, origin.y, 50);
        s.scene.add(sprite);
        const spread = (Math.random() - 0.5) * 1.3;
        const speed = px * (1.5 + Math.random() * 1.1);
        const dir = at.up.clone().rotateAround(new THREE.Vector2(), spread);
        s.particles.push({ sprite, vel: dir.multiplyScalar(speed), spin: (Math.random() - 0.5) * 8, age: 0, life: 1.6 + Math.random() * 0.6 });
      }
    });
    bubble.classList.remove('show');
    while (s.particles.length) await wait(100);
    emerald.dispose();
  } finally {
    bubble.remove();
    s.dispose();
  }
}

// ---------------------------------------------------------------- mob visits

/** One entry of public/mobs/index.json. */
export interface MobInfo {
  id: string;
  name: string;
  /** What a click does: poof, run, egg, arrow, teleport or explode. */
  react: string;
  sound: boolean;
  drop: boolean;
}

export interface VisitHooks {
  /** Plays a sound file (full URL); no-op when audio is blocked. */
  sound: (url: string, volume?: number) => void;
  poof: (x: number, y: number) => void;
  drop: (x: number, y: number, src: string) => void;
  fly: (x: number, y: number, src: string) => void;
  teleport: (x: number, y: number) => void;
  explode: (x: number, y: number) => Promise<void>;
}

/**
 * A random mob peeks in from an edge of the screen, makes its sound and hangs
 * around for a few seconds. Click it and it reacts; otherwise it ducks away.
 */
export async function mobVisit(stage: HTMLElement, info: MobInfo, hooks: VisitHooks, mobsUrl: string) {
  const { buildMob } = await import('./bedrock');
  const s = new Scene(stage);
  const hit = document.createElement('button');
  hit.type = 'button';
  hit.className = 'mob-hit';
  hit.title = hit.ariaLabel = info.name;
  stage.append(hit);
  // Listen right away: a click while it is still rising counts too.
  const clickedEarly = new Promise<boolean>((r) => hit.addEventListener('click', () => r(true), { once: true }));
  try {
    const dir = `${mobsUrl}${info.id}/`;
    const [model, skin] = await Promise.all([fetch(`${dir}model.json`).then((r) => r.json()), loadTexture(`${dir}texture.png`)]);
    const built = buildMob(model, skin);
    const mob: Mob = { model: built.model, head: built.head, height: built.height, materials: [built.material] };
    const px = Math.min(Math.max(built.height * 9, 150), 330, innerHeight * 0.5);
    const at = placeOnEdge(s, mob, px);
    const turn = mob.model.rotation.y;
    const peek = -px * 0.2;
    at.lift.position.y = at.hidden;

    // Keep the click target on the mob.
    s.frame.push(() => {
      const b = s.toScreenBox(mob.model);
      Object.assign(hit.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
    });

    await s.tween(700, (k) => (at.lift.position.y = at.hidden + (peek - at.hidden) * easeOutBack(k)));
    if (info.sound) hooks.sound(`${dir}sound.ogg`, 0.4);

    // Idle: bob a little and look around.
    const t0 = performance.now();
    const idle = () => {
      const t = (performance.now() - t0) / 1000;
      at.lift.position.y = peek + Math.sin(t * 2.2) * 4;
      mob.model.rotation.y = turn + Math.sin(t * 0.9) * 0.35;
    };
    s.frame.push(idle);
    const clicked = await Promise.race([
      clickedEarly,
      wait(7000).then(() => false),
    ]);
    s.frame.splice(s.frame.indexOf(idle), 1);
    hit.remove();

    const sink = (ms = 450) => {
      const from = at.lift.position.y;
      return s.tween(ms, (k) => (at.lift.position.y = from + (at.hidden - from) * easeIn(k)));
    };
    if (!clicked) {
      await sink(600);
      return;
    }

    const c = s.toScreenBox(mob.model);
    switch (info.react) {
      case 'run': {
        // Turn around and scurry off.
        if (info.sound) hooks.sound(`${dir}sound.ogg`, 0.4);
        await s.tween(220, (k) => (mob.model.rotation.y = turn + Math.PI * k));
        await sink(350);
        break;
      }
      case 'egg':
        hooks.sound(`${mobsUrl}egg.ogg`, 0.5);
        hooks.drop(c.cx, c.cy, `${mobsUrl}egg.png`);
        await wait(500);
        await sink();
        break;
      case 'arrow':
        hooks.sound(`${mobsUrl}bow.ogg`, 0.4);
        hooks.fly(c.cx, c.cy, `${mobsUrl}arrow.png`);
        await wait(400);
        await sink();
        break;
      case 'teleport':
        hooks.sound(`${mobsUrl}teleport.ogg`, 0.4);
        s.scene.remove(at.pivot);
        hooks.teleport(c.cx, c.cy);
        await wait(900);
        break;
      case 'explode': {
        // Swell with a soft glow (photosensitivity-safe), then boom.
        const mat = built.material;
        mat.emissive.set(0xffffff);
        await s.tween(900, (k) => {
          mob.model.scale.setScalar(at.k * (1 + 0.25 * k));
          mat.emissiveIntensity = 0.25 * k * (0.5 - 0.5 * Math.cos(2 * Math.PI * 2 * k * 0.9));
        });
        const b = s.toScreenBox(mob.model);
        s.scene.remove(at.pivot);
        hooks.sound(`${mobsUrl}explode.ogg`, 0.3);
        await hooks.explode(b.cx, b.cy);
        break;
      }
      default:
        // Poof! A puff of smoke and its drop.
        hooks.sound(`${mobsUrl}poof.ogg`, 0.4);
        s.scene.remove(at.pivot);
        hooks.poof(c.cx, c.cy);
        if (info.drop) hooks.drop(c.cx, c.cy, `${dir}drop.png`);
        await wait(1300);
    }
  } finally {
    hit.remove();
    s.dispose();
  }
}

/** A pixel-sharp texture from a URL. */
async function loadTexture(url: string): Promise<THREE.Texture> {
  const img = await loadImage(url);
  const t = new THREE.Texture(img);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
