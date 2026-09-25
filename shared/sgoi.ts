// SGOI Tools: brand and tool list shared by every site in this repository.
// The YouTube → MP3 page (src/pages/index.astro) and the file converter
// (convert/src/ui/components/SiteShell) both build their side menu and footer
// from this file. Add a new tool here and it shows up everywhere.

export const HUB = {
  name: 'SGOI Tools',
  short: 'SGOI',
  /** The rest of the name; "SGOI" itself is shown as the animated badge. */
  suffix: 'Tools',
  owner: 'SurGamingOnInsulin',
  ownerUrl: 'https://github.com/surgamingoninsulin/',
  url: 'https://surgamingoninsulin.github.io/',
  tagline: 'Free tools for media, gaming and web development. No ads, no accounts.',
};

export interface Tool {
  id: string;
  name: string;
  /** Short line under the name in the side menu. */
  blurb: string;
  /** Path relative to the site root, e.g. "all-files-convert/". The root itself is the SGOI Tools home page. */
  path: string;
  /** Inline SVG markup for the icon (24×24 viewBox). */
  icon: string;
  /** Longer description for the tool card on the home page. */
  description: string;
  /** For a hub page: the tools it lists. It counts as the current page on theirs too. */
  covers?: string[];
}

export interface ToolGroup {
  /** Translation key: hub.groups.<id> in public/lang_support/*.json */
  id: string;
  title: string;
  tools: Tool[];
  /**
   * Nested dropdowns in the side menu, outermost first (e.g. ["game", "minecraft"]).
   * Texts: hub.menu.<id>. Groups without it get a plain heading.
   */
  menu?: string[];
  /**
   * A page listing this group's tools. Menus, the home page and the footer
   * show just this entry instead of every tool (e.g. Games → Minecraft).
   */
  hub?: Tool;
}

/** What menus and the home page list for a group: its hub page, or its tools. */
export const shownTools = (group: ToolGroup): Tool[] => (group.hub ? [group.hub] : group.tools);

/** Every page with an entry: all tools and hub pages. */
export const allPages = (groups: ToolGroup[] = TOOL_GROUPS): Tool[] => groups.flatMap((g) => (g.hub ? [g.hub, ...g.tools] : g.tools));

/** True when `page` (a tool id) is this entry, or one of the tools its hub page lists. */
export const isActive = (tool: Tool, page?: string): boolean => !!page && (tool.id === page || !!tool.covers?.includes(page));

/** A dropdown in the side menu: its own tools plus nested dropdowns. */
export interface MenuBranch {
  id: string;
  children: MenuBranch[];
  tools: Tool[];
}

/**
 * The side menu in order: plain groups, and dropdown trees built from the
 * groups' `menu` paths (groups sharing "game" end up in one Game dropdown).
 */
export function sideMenu(groups: ToolGroup[] = TOOL_GROUPS): Array<{ group: ToolGroup } | { branch: MenuBranch }> {
  const out: Array<{ group: ToolGroup } | { branch: MenuBranch }> = [];
  const roots = new Map<string, MenuBranch>();
  for (const group of groups) {
    if (!group.menu?.length) {
      out.push({ group });
      continue;
    }
    let node: MenuBranch | undefined;
    for (const id of group.menu) {
      const siblings = node?.children;
      let next = siblings ? siblings.find((b) => b.id === id) : roots.get(id);
      if (!next) {
        next = { id, children: [], tools: [] };
        if (siblings) siblings.push(next);
        else {
          roots.set(id, next);
          out.push({ branch: next });
        }
      }
      node = next;
    }
    node!.tools.push(...shownTools(group));
  }
  return out;
}

/** True when the tool (or any nested one) is in this dropdown. */
export const branchHas = (b: MenuBranch, toolId?: string): boolean =>
  !!toolId && (b.tools.some((t) => isActive(t, toolId)) || b.children.some((c) => branchHas(c, toolId)));

/**
 * All Files Convert logo: a file with a folded corner and a two-way "swap"
 * arrow, in the same red as the YouTube logo. (`id` is no longer used; kept so
 * existing calls keep working.)
 */
export function afcLogo(height: number, id: string): string {
  const width = Math.round((height * 26) / 29);
  return `<svg class="afc-logo" viewBox="0 0 26 29" width="${width}" height="${height}" aria-hidden="true"><path fill="${ICON_RED}" d="M5 1h11.5L24 8.5V25a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3z"/><path fill="#fff" fill-opacity=".38" d="M16.5 1v5a2.5 2.5 0 0 0 2.5 2.5h5z"/><path fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M7 14h11m-3-3 3 3-3 3M19 21H8m3-3-3 3 3 3"/></svg>`;
}

const stroke = (d: string) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

/** The red of the YouTube logo: every tool icon uses it, so they all match. */
export const ICON_RED = '#FF0000';
const brandStroke = (d: string) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="${ICON_RED}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

/** Icons of the side-menu dropdowns, by `menu` id. */
export const MENU_ICONS: Record<string, string> = {
  // Anvil (Lucide, ISC)
  media: brandStroke('<path d="M7 10H6a4 4 0 0 1-4-4 1 1 0 0 1 1-1h4"/><path d="M7 5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1 7 7 0 0 1-7 7H8a1 1 0 0 1-1-1z"/><path d="M9 12v5"/><path d="M15 12v5"/><path d="M5 20a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3 1 1 0 0 1-1 1H6a1 1 0 0 1-1-1"/>'),
  game: brandStroke('<path d="M6 11h4M8 9v4"/><path d="M15 12h.01M18 10h.01"/><rect x="2" y="6" width="20" height="12" rx="4"/>'),
  // Pickaxe (Lucide, ISC)
  minecraft: brandStroke('<path d="M14.531 12.469 6.619 20.38a1 1 0 1 1-3-3l7.912-7.912"/><path d="M15.686 4.314A12.5 12.5 0 0 0 5.461 2.958 1 1 0 0 0 5.58 4.71a22 22 0 0 1 6.318 3.393"/><path d="M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z"/><path d="M19.686 8.314a12.501 12.501 0 0 1 1.356 10.225 1 1 0 0 1-1.751-.119 22 22 0 0 0-3.393-6.319"/>'),
};

export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'media',
    title: 'Media Forge',
    menu: ['media'],
    tools: [
      {
        id: 'yt-mp3',
        name: 'Youtube Playlist → .mp3',
        blurb: 'Playlists to tagged MP3s',
        path: 'yt-playlist-to-mp3/',
        description: 'Drop in any file with YouTube links and get every song of every playlist back as a tagged MP3 with cover art.',
        icon: '<svg viewBox="0 0 28 20" width="18" height="13" aria-hidden="true"><path fill="#FF0000" d="M27.4 3.1A3.5 3.5 0 0 0 24.9.6C22.7 0 14 0 14 0S5.3 0 3.1.6A3.5 3.5 0 0 0 .6 3.1C0 5.3 0 10 0 10s0 4.7.6 6.9a3.5 3.5 0 0 0 2.5 2.5C5.3 20 14 20 14 20s8.7 0 10.9-.6a3.5 3.5 0 0 0 2.5-2.5c.6-2.2.6-6.9.6-6.9s0-4.7-.6-6.9z"/><path fill="#FFFFFF" d="M11.2 14.3 18.4 10l-7.2-4.3z"/></svg>',
      },
      {
        id: 'convert',
        name: 'All Files Convert',
        blurb: 'Any file, any format',
        path: 'all-files-convert/',
        description: 'Convert almost any file to almost any other format: images, video, audio, documents and more. Runs on your own device.',
        icon: afcLogo(20, 'afc-grad-icon'),
      },
    ],
  },
  {
    id: 'minecraft',
    title: 'Games',
    menu: ['game'],
    hub: {
      id: 'mc-hub',
      name: 'Minecraft',
      blurb: 'Server tools for Minecraft',
      path: 'game/minecraft/',
      description: 'Everything for your Minecraft server: status checker, server icons, server jars and MOTDs.',
      // Pickaxe (Lucide, ISC), same as the Minecraft menu icon
      icon: brandStroke('<path d="M14.531 12.469 6.619 20.38a1 1 0 1 1-3-3l7.912-7.912"/><path d="M15.686 4.314A12.5 12.5 0 0 0 5.461 2.958 1 1 0 0 0 5.58 4.71a22 22 0 0 1 6.318 3.393"/><path d="M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z"/><path d="M19.686 8.314a12.501 12.501 0 0 1 1.356 10.225 1 1 0 0 1-1.751-.119 22 22 0 0 0-3.393-6.319"/>'),
      covers: ['mc-server-info', 'mc-server-icon', 'mc-server-jars', 'mc-motd'],
    },
    tools: [
      {
        id: 'mc-server-info',
        name: 'Server Info',
        blurb: 'Is a server online?',
        path: 'game/minecraft/server-info/',
        description: 'Ping any Java or Bedrock server by address: online status, players, version, MOTD and icon, as it looks in the game.',
        icon: brandStroke('<path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M5 12.4a10 10 0 0 1 14 0"/><path d="M8.5 15.9a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>'),
      },
      {
        id: 'mc-server-icon',
        name: 'Server Icon Converter',
        blurb: 'Any image → server-icon.png',
        path: 'game/minecraft/server-icon/',
        description: 'Turn any image into a 64×64 server-icon.png, ready to drop in your server folder, with a live server-list preview.',
        icon: brandStroke('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>'),
      },
      {
        id: 'mc-server-jars',
        name: 'Server Jars',
        blurb: 'Paper, Fabric, Forge and more',
        path: 'game/minecraft/server-jars/',
        description: 'Download server jars for Paper, Purpur, Vanilla, Fabric, Forge, NeoForge, Velocity and more, for any Minecraft version.',
        icon: brandStroke('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>'),
      },
      {
        id: 'mc-motd',
        name: 'MOTD Creator',
        blurb: 'Colorful server descriptions',
        path: 'game/minecraft/motd/',
        description: 'Design a colored, formatted server description with a live preview, then copy it straight into server.properties.',
        icon: brandStroke('<path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 20.5l1.4-5.1A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.5 10h7M8.5 13.5h4.5"/>'),
      },
    ],
  },
];

/**
 * Shown as "coming soon" cards on the home page until they get real tools.
 * Texts: hub.coming.<id> in public/lang_support/*.json. Tool texts: hub.tools.<id>.
 */
export const COMING_SOON = [
  {
    id: 'webDev',
    title: 'Web development',
    text: 'Handy helpers for building websites.',
    icon: brandStroke('<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>'),
  },
  {
    id: 'random',
    title: 'Random tools',
    text: 'Everyday tools, like a music player without ads.',
    icon: brandStroke('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  },
];

// ------------------------------------------------------------------ side menu + footer
// Both are the same on every page; these lists feed both sites.

export interface Link {
  name: string;
  url: string;
  icon: string;
}

/** Bottom of the side menu, right above the tip. */
export const MENU_LINKS: Link[] = [
  {
    name: 'yt-dlp',
    url: 'https://github.com/yt-dlp/yt-dlp',
    icon: brandStroke('<path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>'),
  },
  {
    name: 'GitHub',
    url: HUB.ownerUrl,
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="#FF0000" aria-hidden="true"><path d="M12 .5C5.7.5.5 5.7.5 12a11.5 11.5 0 0 0 7.9 10.9c.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.2-1.3-5.2-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3 .7.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.1v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 23.5 12C23.5 5.7 18.3.5 12 .5z"/></svg>',
  },
];

/** "Built with" column in the footer: what the tools run on. */
export const CREDITS: Array<{ name: string; url: string }> = [
  { name: 'yt-dlp', url: 'https://github.com/yt-dlp/yt-dlp' },
  { name: 'FFmpeg', url: 'https://ffmpeg.org' },
  { name: 'ImageMagick', url: 'https://imagemagick.org' },
  { name: 'Pandoc', url: 'https://pandoc.org' },
  { name: 'GitHub Actions', url: 'https://docs.github.com/actions' },
  { name: 'Astro', url: 'https://astro.build' },
];
