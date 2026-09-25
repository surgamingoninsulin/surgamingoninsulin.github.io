// Builds a three.js model from a Bedrock entity geometry (Mojang's official
// mob models, saved to public/mobs/<id>/ by scripts/update-minecraft-mobs.mjs).
// Follows Blockbench's reading of the format: X is mirrored, bones rotate
// around their pivot in Z-Y-X order, and cubes use Minecraft's box UV layout
// (or per-face UVs).
import * as THREE from 'three';

type V3 = [number, number, number];
interface FaceUV {
  uv: [number, number];
  uv_size?: [number, number];
}
interface Cube {
  origin: V3;
  size: V3;
  uv?: [number, number] | Record<string, FaceUV>;
  inflate?: number;
  mirror?: boolean;
  pivot?: V3;
  rotation?: V3;
}
interface Bone {
  name: string;
  parent?: string;
  pivot: V3;
  rotation?: V3;
  mirror?: boolean;
  inflate?: number;
  cubes: Cube[];
}
export interface MobModel {
  w: number;
  h: number;
  bones: Bone[];
}

const deg = THREE.MathUtils.degToRad;
/** Bedrock rotation → three.js Euler (Blockbench flips X and Y). */
const euler = (r?: V3) => new THREE.Euler(deg(-(r?.[0] ?? 0)), deg(-(r?.[1] ?? 0)), deg(r?.[2] ?? 0), 'ZYX');
/** Bedrock point → our space (X mirrored). */
const flipX = (p: V3): V3 => [-p[0], p[1], p[2]];

type Rect = [number, number, number, number]; // x, y, w, h in texture pixels

/** Texture regions for the six faces, in three.js order: +x, -x, +y, -y, +z, -z. */
function faceRects(cube: Cube, mirror: boolean): (Rect | null)[] {
  const [w, h, d] = cube.size;
  if (Array.isArray(cube.uv) || !cube.uv) {
    const [u, v] = (cube.uv as [number, number]) ?? [0, 0];
    // Minecraft's box layout, named like Blockbench (the model faces north, -z).
    const east: Rect = [u, v + d, d, h];
    const west: Rect = [u + d + w, v + d, d, h];
    const up: Rect = [u + d, v, w, d];
    const down: Rect = [u + d + w, v + d, w, -d];
    const north: Rect = [u + d, v + d, w, h];
    const south: Rect = [u + d + w + d, v + d, w, h];
    return mirror ? [west, east, up, down, south, north] : [east, west, up, down, south, north];
  }
  const f = cube.uv;
  const r = (name: string): Rect | null => (f[name] ? [f[name].uv[0], f[name].uv[1], f[name].uv_size?.[0] ?? 0, f[name].uv_size?.[1] ?? 0] : null);
  return [r('east'), r('west'), r('up'), r('down'), r('south'), r('north')];
}

function cubeGeometry(cube: Cube, bone: Bone, tex: [number, number]) {
  const inflate = cube.inflate ?? bone.inflate ?? 0;
  const [w, h, d] = cube.size;
  const geo = new THREE.BoxGeometry(Math.max(w + inflate * 2, 0.001), Math.max(h + inflate * 2, 0.001), Math.max(d + inflate * 2, 0.001));
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const mirror = cube.mirror ?? bone.mirror ?? false;
  const [tw, th] = tex;
  faceRects(cube, mirror).forEach((rect, i) => {
    let [x, y, rw, rh] = rect ?? [0, 0, 0, 0];
    if (mirror) [x, rw] = [x + rw, -rw];
    const corners = [
      [x, y],
      [x + rw, y],
      [x, y + rh],
      [x + rw, y + rh],
    ];
    corners.forEach(([cx, cy], j) => uv.setXY(i * 4 + j, cx / tw, 1 - cy / th));
  });
  uv.needsUpdate = true;
  return geo;
}

/** The whole mob, facing the camera (+z), feet at y = 0. */
export function buildMob(model: MobModel, texture: THREE.Texture) {
  const material = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide });
  const root = new THREE.Group();
  const groups = new Map<string, { group: THREE.Group; pivot: V3 }>();
  // Parents first, so children can attach.
  const pending = [...model.bones];
  let guard = 0;
  while (pending.length && guard++ < 500) {
    const bone = pending.shift()!;
    const parent = bone.parent ? groups.get(bone.parent) : undefined;
    if (bone.parent && !parent && model.bones.some((b) => b.name === bone.parent)) {
      pending.push(bone);
      continue;
    }
    const pivot = flipX(bone.pivot);
    const group = new THREE.Group();
    const base = parent?.pivot ?? [0, 0, 0];
    group.position.set(pivot[0] - base[0], pivot[1] - base[1], pivot[2] - base[2]);
    group.rotation.copy(euler(bone.rotation));
    for (const cube of bone.cubes) {
      const geo = cubeGeometry(cube, bone, [model.w, model.h]);
      const mesh = new THREE.Mesh(geo, material);
      // Cube corner, mirrored: from = (-(x + w), y, z).
      const from: V3 = [-(cube.origin[0] + cube.size[0]), cube.origin[1], cube.origin[2]];
      const center: V3 = [from[0] + cube.size[0] / 2, from[1] + cube.size[1] / 2, from[2] + cube.size[2] / 2];
      if (cube.rotation) {
        const cp = flipX(cube.pivot ?? cube.origin);
        const holder = new THREE.Group();
        holder.position.set(cp[0] - pivot[0], cp[1] - pivot[1], cp[2] - pivot[2]);
        holder.rotation.copy(euler(cube.rotation));
        mesh.position.set(center[0] - cp[0], center[1] - cp[1], center[2] - cp[2]);
        holder.add(mesh);
        group.add(holder);
      } else {
        mesh.position.set(center[0] - pivot[0], center[1] - pivot[1], center[2] - pivot[2]);
        group.add(mesh);
      }
    }
    (parent?.group ?? root).add(group);
    groups.set(bone.name, { group, pivot });
  }
  // Bedrock mobs face north (-z); turn them to face the viewer.
  root.rotation.y = Math.PI;
  const holder = new THREE.Group();
  holder.add(root);
  // Stand on y = 0 and center on x/z.
  const box = new THREE.Box3().setFromObject(holder);
  root.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  const size = box.getSize(new THREE.Vector3());
  return { model: holder, height: size.y, width: Math.max(size.x, size.z), material, head: groups.get('head')?.group ?? holder };
}
