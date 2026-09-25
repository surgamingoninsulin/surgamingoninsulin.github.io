// Downloads the mobs for the Minecraft pages' "mob visits" into public/mobs/:
// Mojang's official Bedrock models and textures (github.com/Mojang/bedrock-samples)
// and the Java sounds and item textures (assets.mcasset.cloud).
// Run again after a Minecraft update:  npm run mobs:update
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BEDROCK = 'https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack';
const JAVA = 'https://assets.mcasset.cloud/latest/assets/minecraft';
const OUT = join(process.cwd(), 'public', 'mobs');

/**
 * id: our id (and the Bedrock entity file, unless `entity` says otherwise).
 * drop: Java item shown when it poofs. react: what a click does (poof is the
 * default). sound: Java sound event(s) to try. javaTexture: Java texture to use
 * when the Bedrock one is not a PNG.
 */
// Left out for now: their resting pose comes from Bedrock animation files, which
// the loader does not read yet, so they look wrong: polar bear, panda, sniffer,
// turtle, parrot, armadillo, frog, spider, cave spider, cat, ocelot, blaze, endermite, breeze.
const MOBS = [
  { id: 'pig', name: 'Pig', drop: 'porkchop', react: 'run' },
  { id: 'cow', name: 'Cow', drop: 'leather' },
  { id: 'chicken', name: 'Chicken', drop: 'feather', react: 'egg' },
  { id: 'sheep', name: 'Sheep', drop: 'mutton' },
  { id: 'rabbit', name: 'Rabbit', drop: 'rabbit_hide', react: 'run' },
  { id: 'fox', name: 'Fox', drop: 'sweet_berries', react: 'run' },
  { id: 'wolf', name: 'Wolf', drop: 'bone', sound: ['entity.wolf.ambient', 'entity.wolf.pant'] },
  { id: 'goat', name: 'Goat', drop: 'milk_bucket' },
  { id: 'llama', name: 'Llama', drop: 'leather' },
  { id: 'camel', name: 'Camel', drop: 'cactus' },
  { id: 'bee', name: 'Bee', drop: 'honeycomb' },
  { id: 'axolotl', name: 'Axolotl', drop: 'tropical_fish_bucket' },
  { id: 'allay', name: 'Allay', drop: 'amethyst_shard' },
  { id: 'iron_golem', name: 'Iron Golem', drop: 'iron_ingot', sound: ['entity.iron_golem.hurt'] },
  { id: 'snow_golem', name: 'Snow Golem', drop: 'snowball' },
  { id: 'villager_v2', name: 'Villager', drop: 'emerald', sound: ['entity.villager.ambient'] },
  { id: 'wandering_trader', name: 'Wandering Trader', drop: 'emerald' },
  { id: 'zombie', name: 'Zombie', drop: 'rotten_flesh' },
  { id: 'husk', name: 'Husk', drop: 'rotten_flesh' },
  { id: 'drowned', name: 'Drowned', drop: 'trident' },
  { id: 'skeleton', name: 'Skeleton', drop: 'bone', react: 'arrow' },
  { id: 'stray', name: 'Stray', drop: 'arrow', react: 'arrow' },
  { id: 'creeper', name: 'Creeper', drop: 'gunpowder', react: 'explode', sound: ['entity.creeper.primed'] },
  { id: 'enderman', name: 'Enderman', drop: 'ender_pearl', react: 'teleport' },
  { id: 'witch', name: 'Witch', drop: 'glass_bottle' },
  { id: 'slime', name: 'Slime', drop: 'slime_ball', sound: ['entity.slime.squish'] },
  { id: 'magma_cube', name: 'Magma Cube', drop: 'magma_cream', javaTexture: 'entity/slime/magmacube', sound: ['entity.magma_cube.squish'] },
  { id: 'piglin', name: 'Piglin', drop: 'gold_ingot' },
  { id: 'zombified_piglin', entity: 'zombie_pigman', name: 'Zombified Piglin', drop: 'gold_nugget', sound: ['entity.zombified_piglin.ambient'] },
  { id: 'hoglin', name: 'Hoglin', drop: 'porkchop' },
  { id: 'strider', name: 'Strider', drop: 'string' },
  { id: 'pillager', name: 'Pillager', drop: 'crossbow', react: 'arrow' },
  { id: 'vindicator', name: 'Vindicator', drop: 'iron_axe' },
  { id: 'evoker', entity: 'evocation_illager', name: 'Evoker', drop: 'totem_of_undying' },
  { id: 'phantom', name: 'Phantom', javaTexture: 'entity/phantom/phantom', drop: 'phantom_membrane' },
  { id: 'bat', name: 'Bat', drop: 'string' },
  { id: 'squid', name: 'Squid', drop: 'ink_sac' },
  { id: 'glow_squid', name: 'Glow Squid', javaTexture: 'entity/squid/glow_squid', drop: 'glow_ink_sac' },
  { id: 'dolphin', name: 'Dolphin', drop: 'cod' },
  { id: 'cod', name: 'Cod', drop: 'cod', sound: ['entity.cod.flop'] },
  { id: 'salmon', name: 'Salmon', drop: 'salmon', sound: ['entity.salmon.flop'] },
  { id: 'pufferfish', name: 'Pufferfish', drop: 'pufferfish', sound: ['entity.puffer_fish.blow_up'] },
  { id: 'shulker', name: 'Shulker', drop: 'shulker_shell' },
  { id: 'silverfish', name: 'Silverfish', drop: 'stone' },
  { id: 'bogged', name: 'Bogged', drop: 'bone', react: 'arrow' },
  { id: 'warden', name: 'Warden', drop: 'sculk_catalyst', sound: ['entity.warden.ambient'] },
];

const get = async (url, as = 'json') => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return as === 'json' ? r.json() : Buffer.from(await r.arrayBuffer());
};

// ---------------------------------------------------------------- geometry index

/** Every geometry in bedrock-samples, by id, with parents resolved. */
async function geometryIndex() {
  const tree = await get('https://api.github.com/repos/Mojang/bedrock-samples/git/trees/main?recursive=1');
  const files = tree.tree.map((t) => t.path).filter((p) => p.startsWith('resource_pack/models/entity/') && p.endsWith('.json'));
  const raw = new Map(); // id -> { parent, texW, texH, bones }
  await Promise.all(
    files.map(async (path) => {
      let json;
      try {
        // Some files have comments; strip them before parsing.
        const text = (await get(`${BEDROCK}/${path.slice('resource_pack/'.length)}`, 'buffer')).toString('utf8');
        json = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
      } catch {
        return;
      }
      if (Array.isArray(json['minecraft:geometry'])) {
        for (const g of json['minecraft:geometry']) {
          const d = g.description ?? {};
          raw.set(d.identifier, { texW: d.texture_width ?? 64, texH: d.texture_height ?? 64, bones: g.bones ?? [] });
        }
      } else {
        for (const [key, g] of Object.entries(json)) {
          if (!key.startsWith('geometry.')) continue;
          const [id, parent] = key.split(':');
          raw.set(id, { parent, texW: g.texturewidth, texH: g.textureheight, bones: g.bones });
        }
      }
    }),
  );
  const resolve = (id, seen = new Set()) => {
    const g = raw.get(id);
    if (!g || seen.has(id)) return null;
    seen.add(id);
    if (!g.parent) return { texW: g.texW ?? 64, texH: g.texH ?? 64, bones: g.bones ?? [] };
    const p = resolve(g.parent, seen);
    if (!p) return null;
    // A child bone with the same name replaces the parent's.
    const bones = [...p.bones.filter((b) => !(g.bones ?? []).some((c) => c.name === b.name)), ...(g.bones ?? [])];
    return { texW: g.texW ?? p.texW, texH: g.texH ?? p.texH, bones };
  };
  return { resolve };
}

/** Only what the site needs, rounded. */
function compact(geo) {
  const r = (a) => a?.map((n) => Math.round(n * 1000) / 1000);
  return {
    w: geo.texW,
    h: geo.texH,
    bones: geo.bones
      .filter((b) => !b.neverRender)
      .map((b) => ({
        name: b.name,
        parent: b.parent,
        pivot: r(b.pivot ?? [0, 0, 0]),
        rotation: r(b.rotation ?? b.bind_pose_rotation),
        mirror: b.mirror || undefined,
        inflate: b.inflate || undefined,
        cubes: (b.cubes ?? []).map((c) => ({
          origin: r(c.origin),
          size: r(c.size),
          uv: c.uv,
          inflate: c.inflate ?? undefined,
          mirror: c.mirror ?? undefined,
          pivot: r(c.pivot),
          rotation: r(c.rotation),
        })),
      })),
  };
}

// ---------------------------------------------------------------- run

const sounds = await get(`${JAVA}/sounds.json`);
const firstSound = (events) => {
  for (const e of events) {
    const s = sounds[e]?.sounds?.[0];
    if (s) return typeof s === 'string' ? s : s.name;
  }
};

const { resolve } = await geometryIndex();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const index = [];

for (const mob of MOBS) {
  try {
    const entity = await get(`${BEDROCK}/entity/${mob.entity ?? mob.id}.entity.json`);
    const desc = entity['minecraft:client_entity'].description;
    const geoId = desc.geometry.default ?? Object.values(desc.geometry)[0];
    const texPath = desc.textures.default ?? Object.values(desc.textures)[0];
    const geo = resolve(geoId);
    if (!geo || !geo.bones.some((b) => b.cubes?.length)) throw new Error(`no geometry ${geoId}`);
    // Some Bedrock textures are .tga; the Java one (same layout) is a PNG.
    const texture = await get(`${BEDROCK}/${texPath}.png`, 'buffer').catch(() =>
      get(`${JAVA}/textures/${mob.javaTexture ?? texPath.replace(/^textures\//, '')}.png`, 'buffer'),
    );

    const dir = join(OUT, mob.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'model.json'), JSON.stringify(compact(geo)));
    writeFileSync(join(dir, 'texture.png'), texture);

    const soundFile = firstSound(mob.sound ?? [`entity.${mob.id.replace(/_v2$/, '')}.ambient`]);
    if (soundFile) writeFileSync(join(dir, 'sound.ogg'), await get(`${JAVA}/sounds/${soundFile}.ogg`, 'buffer'));
    let drop = mob.drop;
    try {
      writeFileSync(join(dir, 'drop.png'), await get(`${JAVA}/textures/item/${mob.drop}.png`, 'buffer'));
    } catch {
      drop = undefined;
    }
    index.push({ id: mob.id, name: mob.name, react: mob.react ?? 'poof', sound: !!soundFile, drop: !!drop });
    console.log(`ok   ${mob.id}`);
  } catch (e) {
    console.log(`skip ${mob.id}: ${e.message}`);
  }
}

// Extras used by the reactions.
for (const item of ['egg', 'arrow']) writeFileSync(join(OUT, `${item}.png`), await get(`${JAVA}/textures/item/${item}.png`, 'buffer'));
for (const [file, event] of [
  ['egg.ogg', 'entity.chicken.egg'],
  ['bow.ogg', 'entity.skeleton.shoot'],
  ['poof.ogg', 'entity.generic.extinguish_fire'],
  ['teleport.ogg', 'entity.enderman.teleport'],
  ['explode.ogg', 'entity.generic.explode'],
]) {
  const s = firstSound([event]);
  if (s) writeFileSync(join(OUT, file), await get(`${JAVA}/sounds/${s}.ogg`, 'buffer'));
}

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
console.log(`\n${index.length} of ${MOBS.length} mobs saved to public/mobs/`);
