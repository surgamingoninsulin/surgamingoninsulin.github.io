// Server Icon Converter: any image the browser can open → 64×64 PNG named
// server-icon.png. Everything happens on this device; nothing is uploaded.
import { plain, t, tr } from '../i18n';
import { DEFAULT_ICON, initLook } from './mc';

const SIZE = 64;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const drop = $('drop');
const fileInput = $<HTMLInputElement>('file');
const fileName = $('file-name');
const fit = $<HTMLSelectElement>('fit');
const scaling = $<HTMLSelectElement>('scaling');
const out = $<HTMLCanvasElement>('out');
const download = $<HTMLButtonElement>('download');
const cardIcon = $('card').querySelector<HTMLImageElement>('[data-mc-icon]')!;

let source: ImageBitmap | HTMLCanvasElement | null = null;

initLook();
cardIcon.src = DEFAULT_ICON;

async function decode(file: Blob): Promise<ImageBitmap | HTMLCanvasElement> {
  try {
    return await createImageBitmap(file);
  } catch {
    // SVG and a few other formats only decode through an <img>. An SVG may have
    // no size of its own, so draw it whole onto a canvas at a known size first.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const w = img.naturalWidth || 512;
      const h = img.naturalHeight || 512;
      const k = Math.max(1, 512 / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.round(w * k);
      c.height = Math.round(h * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function draw() {
  const g = out.getContext('2d')!;
  g.clearRect(0, 0, SIZE, SIZE);
  if (!source) return;
  const w = source.width || SIZE;
  const h = source.height || SIZE;
  let sx = 0, sy = 0, sw = w, sh = h, dx = 0, dy = 0, dw = SIZE, dh = SIZE;
  if (fit.value === 'cover') {
    const s = Math.min(w, h);
    sx = (w - s) / 2;
    sy = (h - s) / 2;
    sw = sh = s;
  } else if (fit.value === 'contain') {
    const k = SIZE / Math.max(w, h);
    dw = Math.round(w * k);
    dh = Math.round(h * k);
    dx = Math.floor((SIZE - dw) / 2);
    dy = Math.floor((SIZE - dh) / 2);
  }
  const pixel = scaling.value === 'pixel';
  // Big photos get a much cleaner result when halved step by step first.
  let img: CanvasImageSource = source;
  if (!pixel) {
    let cw = sw, ch = sh;
    let step: HTMLCanvasElement | null = null;
    while (cw / 2 >= dw && ch / 2 >= dh) {
      const c = document.createElement('canvas');
      c.width = Math.round(cw / 2);
      c.height = Math.round(ch / 2);
      const cg = c.getContext('2d')!;
      cg.imageSmoothingQuality = 'high';
      if (step) cg.drawImage(step, 0, 0, c.width, c.height);
      else cg.drawImage(source, sx, sy, sw, sh, 0, 0, c.width, c.height);
      step = c;
      cw = c.width;
      ch = c.height;
    }
    if (step) {
      img = step;
      sx = sy = 0;
      sw = step.width;
      sh = step.height;
    }
  }
  g.imageSmoothingEnabled = !pixel;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  cardIcon.src = out.toDataURL('image/png');
  download.disabled = false;
}

async function load(file: File | Blob | null | undefined, name?: string) {
  if (!file || !file.type.startsWith('image/')) {
    tr(fileName, 'mc.icon.notImage');
    return;
  }
  try {
    source = await decode(file);
  } catch {
    tr(fileName, 'mc.icon.decodeError');
    return;
  }
  plain(fileName, `${name ?? (file as File).name ?? 'image'} · ${source.width} × ${source.height}`);
  // Pixel art (small images) looks best without smoothing.
  if (Math.max(source.width, source.height) <= SIZE * 2) scaling.value = 'pixel';
  draw();
}

fileInput.addEventListener('change', () => load(fileInput.files?.[0]));
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
for (const type of ['dragenter', 'dragover'] as const)
  drop.addEventListener(type, (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
for (const type of ['dragleave', 'drop'] as const) drop.addEventListener(type, () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  load(e.dataTransfer?.files?.[0]);
});
// Paste an image from the clipboard anywhere on the page.
document.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
  if (item) load(item.getAsFile(), t('mc.icon.pasted'));
});

fit.addEventListener('change', draw);
scaling.addEventListener('change', draw);

download.addEventListener('click', () => {
  out.toBlob((blob) => {
    if (!blob) return;
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'server-icon.png' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
});
