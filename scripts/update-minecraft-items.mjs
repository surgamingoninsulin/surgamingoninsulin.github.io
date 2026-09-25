// Builds public/mc-items/: one sheet with the inventory icon of every
// Minecraft item (rendered with deepslate in headless Chrome) and items.json
// with names (English, Dutch) and the properties the Minecraft tools use.
// Data: misode's mcmeta (github.com/misode/mcmeta), always the latest release
// (snapshots are skipped, so no unreleased items show up).
// Run again after a Minecraft update:  npm run items:update
// Needs Chrome or Edge; set CHROME_PATH if it is not in the usual place.
import { build } from 'esbuild';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const MCMETA = 'https://raw.githubusercontent.com/misode/mcmeta';
const OUT = join(process.cwd(), 'public', 'mc-items');
const SIZE = 48; // icon size in pixels
const COLS = 32;

const get = async (url, as = 'json') => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return as === 'json' ? r.json() : Buffer.from(await r.arrayBuffer());
};

const chrome =
  process.env.CHROME_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find(existsSync);
if (!chrome) throw new Error('Chrome not found: set CHROME_PATH');

console.log('Downloading data from misode/mcmeta…');
const versions = await get(`${MCMETA}/summary/versions/data.min.json`);
const release = versions.find((v) => v.type === 'release').id;
const ref = (branch) => `${MCMETA}/${release}-${branch}`;
const [version, registries, components, models, itemDefs, atlasUv, atlasPng, en, nl] = await Promise.all([
  get(`${ref('summary')}/version.json`),
  get(`${ref('summary')}/registries/data.min.json`),
  get(`${ref('summary')}/item_components/data.min.json`),
  get(`${ref('summary')}/assets/model/data.min.json`),
  get(`${ref('summary')}/assets/item_definition/data.min.json`),
  get(`${ref('atlas')}/all/data.min.json`),
  get(`${ref('atlas')}/all/atlas.png`, 'buffer'),
  get(`${ref('assets')}/assets/minecraft/lang/en_us.json`),
  get(`${ref('assets')}/assets/minecraft/lang/nl_nl.json`),
]);
const ids = registries.item.filter((id) => id !== 'air').map((id) => `minecraft:${id}`);
console.log(`Minecraft ${version.id}: ${ids.length} items`);

console.log('Rendering icons…');
const bundle = await build({
  entryPoints: [join(process.cwd(), 'scripts', 'items-render.entry.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
});
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  protocolTimeout: 600_000,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ content: bundle.outputFiles[0].text });
const { url, failed } = await page.evaluate(
  (input) => window.renderItems(input),
  {
    ids,
    models,
    itemDefs,
    components,
    atlasUv,
    atlasUrl: `data:image/png;base64,${atlasPng.toString('base64')}`,
    size: SIZE,
    cols: COLS,
  },
);
await browser.close();
if (failed.length) console.log(`Could not render ${failed.length}: ${failed.slice(0, 20).join(', ')}`);

// Names and properties
const nameOf = (lang, id) => {
  const short = id.replace('minecraft:', '');
  const key = components[short]?.['minecraft:item_name']?.translate;
  return lang[key] ?? lang[`item.minecraft.${short}`] ?? lang[`block.minecraft.${short}`] ?? short;
};
const blocks = new Set(registries.block);
const SLOTS = { head: 'helmet', chest: 'chestplate', legs: 'leggings', feet: 'boots' };
const items = ids.map((id, i) => {
  const short = id.replace('minecraft:', '');
  // misode's component data uses ids without the namespace.
  const c = components[short] ?? {};
  const slot = c['minecraft:equippable']?.slot;
  return {
    id: short,
    i,
    en: nameOf(en, id),
    nl: nameOf(nl, id),
    stack: c['minecraft:max_stack_size'] ?? 64,
    rarity: c['minecraft:rarity'] ?? 'common',
    durability: c['minecraft:max_damage'] ?? 0,
    block: blocks.has(short) || undefined,
    food: 'minecraft:food' in c || undefined,
    tool: 'minecraft:tool' in c || undefined,
    weapon: 'minecraft:weapon' in c || undefined,
    armor: (slot && SLOTS[slot]) || undefined,
    fireproof: 'minecraft:damage_resistant' in c || undefined,
    enchantable: c['minecraft:enchantable']?.value ?? 0,
  };
});

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'items.png'), Buffer.from(url.split(',')[1], 'base64'));
writeFileSync(join(OUT, 'items.json'), JSON.stringify({ version: version.id, size: SIZE, cols: COLS, items }));
console.log(`Saved ${items.length} items (Minecraft ${version.id}) to public/mc-items/`);
