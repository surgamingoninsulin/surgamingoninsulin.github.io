// Runs in headless Chrome (see scripts/update-minecraft-items.mjs): renders the
// inventory icon of every item with deepslate (MIT, github.com/misode/deepslate)
// into one sheet. Resource setup follows misode.github.io (MIT).
import { BlockModel, Identifier, ItemModel, ItemRenderer, ItemStack, jsonToNbt, TextureAtlas } from 'deepslate';
import type { NbtTag } from 'deepslate';

type UV = [number, number, number, number];
export interface RenderInput {
  ids: string[];
  /** "block/stone" → model json */
  models: Record<string, unknown>;
  /** "stone" → { model } */
  itemDefs: Record<string, { model: unknown }>;
  /** "stone" → default components (keys have no namespace) */
  components: Record<string, Record<string, unknown>>;
  atlasUrl: string;
  /** "block/stone" → [x, y, w, h] in pixels */
  atlasUv: Record<string, UV>;
  size: number;
  cols: number;
}

declare global {
  interface Window {
    renderItems: (input: RenderInput) => Promise<{ url: string; failed: string[] }>;
  }
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

window.renderItems = async (d) => {
  // Texture atlas
  const img = await loadImage(d.atlasUrl);
  // deepslate needs power-of-two atlas sizes: pad the sheet.
  const pow2 = (n: number) => 2 ** Math.ceil(Math.log2(n));
  const W = pow2(img.width);
  const H = pow2(img.height);
  const ac = document.createElement('canvas');
  ac.width = W;
  ac.height = H;
  const actx = ac.getContext('2d')!;
  actx.drawImage(img, 0, 0);
  const imageData = actx.getImageData(0, 0, W, H);
  const idMap: Record<string, UV> = {};
  for (const [id, [u, v, du, dv]] of Object.entries(d.atlasUv)) {
    // Animated textures are tall strips: use the first (square) frame.
    const dv2 = du !== dv && id.startsWith('block/') ? du : dv;
    idMap[Identifier.create(id).toString()] = [u / W, v / H, (u + du) / W, (v + dv2) / H];
  }
  const atlas = new TextureAtlas(imageData, idMap);

  // Models
  const blockModels: Record<string, BlockModel> = {};
  for (const [id, json] of Object.entries(d.models)) blockModels[Identifier.create(id).toString()] = BlockModel.fromJson(json);
  const itemModels: Record<string, ItemModel> = {};
  for (const [id, def] of Object.entries(d.itemDefs)) itemModels[Identifier.create(id).toString()] = ItemModel.fromJson(def.model);
  const components = new Map<string, Map<string, NbtTag>>();
  const resources = {
    getBlockModel: (id: Identifier) => blockModels[id.toString()] ?? null,
    getTextureUV: (id: Identifier) => atlas.getTextureUV(id),
    getTextureAtlas: () => atlas.getTextureAtlas(),
    getPixelSize: () => atlas.getPixelSize(),
    getItemModel: (id: Identifier) => itemModels[id.toString()] ?? null,
    getItemComponents: (id: Identifier) => {
      const key = id.toString();
      let map = components.get(key);
      if (!map) {
        map = new Map(Object.entries(d.components[id.path] ?? {}).map(([k, v]) => [k, jsonToNbt(v)]));
        components.set(key, map);
      }
      return map;
    },
  };
  for (const m of Object.values(blockModels)) m.flatten(resources);

  // Render every item into the sheet
  const { size, cols } = d;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const gl = cv.getContext('webgl', { preserveDrawingBuffer: true, alpha: true, premultipliedAlpha: false, antialias: false })!;
  const out = document.createElement('canvas');
  out.width = cols * size;
  out.height = Math.ceil(d.ids.length / cols) * size;
  const g = out.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const failed: string[] = [];
  let renderer: ItemRenderer | undefined;
  d.ids.forEach((id, i) => {
    try {
      const stack = new ItemStack(Identifier.parse(id), 1);
      if (!renderer) renderer = new ItemRenderer(gl, stack, resources, { display_context: 'gui' });
      else renderer.setItem(stack, { display_context: 'gui' });
      renderer.setViewport(0, 0, size, size);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      renderer.drawItem();
      g.drawImage(cv, (i % cols) * size, Math.floor(i / cols) * size);
    } catch {
      failed.push(id);
    }
  });
  return { url: out.toDataURL('image/png'), failed };
};
