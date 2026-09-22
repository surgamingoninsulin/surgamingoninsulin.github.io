export const site = {
  name: 'Pixelith',
  tagline: 'Pixelith is the home for the projects I build, experiment with and share — from games and tools to creative ideas and everything in between.',
  github: 'https://github.com/surgamingoninsulin',
  email: 'GamingOnInsulin@gmail.com',
  copyright: '© 2026 SurGamingOnInsulin',
  licenses: [
    { label: 'Site code: MIT', href: 'https://choosealicense.com/licenses/mit/' },
    //{ label: 'Content: CC BY 4.0', href: 'https://creativecommons.org/licenses/by/4.0/' },
  ],
  disclaimer: 'Minecraft projects are not official Minecraft products and are not approved by or associated with Mojang Studios.',
};

// Groups sit above types in the nav (e.g. "Minecraft" holds resourcepacks/datapacks/plugins/mods).
// Add a new group here + give a type that `group` key to open up a new top-level section later.
export type GroupKey = 'minecraft';

export interface GroupInfo {
  key: GroupKey;
  label: string;
}

export const groups: Record<GroupKey, GroupInfo> = {
  minecraft: { key: 'minecraft', label: 'Games' },
};

export const groupList = Object.values(groups);

// The first folder inside public/downloads/ decides which section a project belongs to.
export type TypeKey = 'resourcepacks' | 'datapacks' | 'plugins' | 'mods';

export interface TypeInfo {
  key: TypeKey;
  group: GroupKey;
  label: string;      // plural, used in nav and headings
  singular: string;
  description: string;
  categories: string[];
  loaders: string[];  // platforms; empty = not applicable
  resolutions: string[]; // empty = not applicable
}

export const types: Record<TypeKey, TypeInfo> = {
  resourcepacks: {
    key: 'resourcepacks', group: 'minecraft', label: 'Resource Packs', singular: 'Resource Pack',
    description: 'Textures, models, sounds and fonts that change how Minecraft looks.',
    categories: ['Vanilla-like', 'Cursed', 'Decoration', 'GUI', 'Fonts', 'Models', 'Audio', 'Utility', 'Themed'],
    loaders: [], resolutions: ['8x', '16x', '32x', '64x', '128x+'],
  },
  datapacks: {
    key: 'datapacks', group: 'minecraft', label: 'Data Packs', singular: 'Data Pack',
    description: 'Vanilla-friendly gameplay changes: recipes, advancements, functions and more.',
    categories: ['Gameplay', 'Recipes', 'Worldgen', 'Utility', 'Tweaks', 'Library'],
    loaders: [], resolutions: [],
  },
  plugins: {
    key: 'plugins', group: 'minecraft', label: 'Plugins', singular: 'Plugin',
    description: 'Server-side plugins for Paper, Spigot and friends.',
    categories: ['Admin', 'Economy', 'Gameplay', 'Chat', 'Utility', 'Library'],
    loaders: ['Paper', 'Spigot', 'Purpur', 'Folia', 'Velocity'], resolutions: [],
  },
  mods: {
    key: 'mods', group: 'minecraft', label: 'Mods', singular: 'Mod',
    description: 'Client and server mods for Fabric, Forge, NeoForge and Quilt.',
    categories: ['Adventure', 'Decoration', 'Equipment', 'Library', 'Optimization', 'Technology', 'Utility'],
    loaders: ['Fabric', 'Forge', 'NeoForge', 'Quilt'], resolutions: [],
  },
};

// Where each type is installed (used by the all-in-one warning).
export const installFolder: Record<TypeKey, string> = {
  resourcepacks: '.minecraft/resourcepacks',
  datapacks: 'saves/<world>/datapacks',
  plugins: 'the server plugins folder',
  mods: '.minecraft/mods',
};

export const typeList = Object.values(types);

// All types belonging to a given group, in declared order.
export const typesInGroup = (g: GroupKey) => typeList.filter((t) => t.group === g);

export const isExternal = (p = '') => /^https?:\/\//i.test(p);

// Prefix a site-relative path with the configured base (GitHub Pages sub-path safe).
// Full http(s) URLs (e.g. GitHub release assets) are returned untouched.
export const url = (p = '') =>
  isExternal(p) ? p : (import.meta.env.BASE_URL.replace(/\/$/, '') + '/' + p.replace(/^\//, ''));
