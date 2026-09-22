import { getCollection } from 'astro:content';
import fs from 'node:fs';
import path from 'node:path';
import { types as typesInfo, type TypeKey } from './site';

export interface Project {
  slug: string;   // file name without .md
  type: TypeKey | 'projects';  // main type, or the general Projects shelf
  types: (TypeKey | 'projects')[]; // main type + any alsoIn sections
  icon?: string;  // site-relative path (or full URL); falls back to default-icon.svg when unset
  header?: string; // wide hero image beside the project Markdown; falls back to project-placeholder.svg
  data: any;      // validated frontmatter (see src/content.config.ts)
  entry: any;     // raw content entry, needed to render the Markdown body
}

export interface ProjectTool {
  slug: string;
  type: 'projects';
  types: ['projects'];
  icon?: string;
  header?: string;
  data: any;
  entry: any;
}

export const latestVersion = (d: any) => [...d.versions].sort((a: any, b: any) => +b.date - +a.date)[0];
export const updated = (p: Project) => +latestVersion(p.data).date;

const ICON_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];

function entryParts(entry: any): string[] {
  return entry.id.replace(/\\/g, '/').split('/').filter(Boolean);
}

function imageValue(value: string | undefined, type: string, slug: string): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  const clean = value.replace(/^\.\//, '');
  const projectDir = path.join(process.cwd(), 'public', 'downloads', type, slug);
  if (fs.existsSync(path.join(projectDir, clean))) return `downloads/${type}/${slug}/${clean}`;
  return clean.startsWith('downloads/') ? clean : `downloads/${clean}`;
}

// No `icon:` in the frontmatter? Look for public/downloads/<type>/<slug>/icon.<ext> so adding a
// project is just "drop the .md file + an icon file next to it" — no path to type out by hand.
function autoIcon(type: string, slug: string): string | undefined {
  const dir = path.join(process.cwd(), 'public', 'downloads', type, slug);
  for (const ext of ICON_EXTS) {
    if (fs.existsSync(path.join(dir, `icon.${ext}`))) return `downloads/${type}/${slug}/icon.${ext}`;
  }
  return undefined;
}

function autoHeader(type: string, slug: string): string | undefined {
  for (const ext of ICON_EXTS) {
    const file = path.join(process.cwd(), 'public', 'downloads', type, slug, `header.${ext}`);
    if (fs.existsSync(file)) return `downloads/${type}/${slug}/header.${ext}`;
  }
  return undefined;
}

function projectFromEntry(entry: any): Project | undefined {
  const parts = entryParts(entry);
  const projectsIndex = parts.indexOf('projects');
  const type = (projectsIndex >= 0 ? 'projects' : parts[0]) as TypeKey | 'projects';
  const slug = projectsIndex >= 0 ? parts[projectsIndex + 1] : parts[1];
  if (!slug) return undefined;
  const data = entry.data;
  const iconValue = data['logo-image'] ?? data.icon;
  const headerValue = data['header-image'] ?? data.header;
  return {
    slug,
    type,
    types: type === 'projects' ? ['projects'] : [type, ...data.alsoIn.filter((x: TypeKey) => x !== type)],
    icon: imageValue(iconValue, type, slug) || autoIcon(type, slug),
    header: imageValue(headerValue, type, slug) || autoHeader(type, slug),
    data,
    entry,
  } as Project;
}

export async function getAllProjects(): Promise<Project[]> {
  const entries = await getCollection('projects');
  return entries.map(projectFromEntry).filter((p): p is Project => Boolean(p)).sort((a, b) => updated(b) - updated(a));
}

export async function getProjectTools(): Promise<ProjectTool[]> {
  return (await getAllProjects())
    .filter((project): project is Project & { type: 'projects' } => project.type === 'projects')
    .sort((a, b) => +latestVersion(b.data).date - +latestVersion(a.data).date);
}

// Every project, optionally only one type, newest first.
export async function getProjects(type?: TypeKey): Promise<Project[]> {
  return (await getAllProjects())
    .filter((p) => p.type in typesInfo && (!type || p.types.includes(type)))
    .sort((a, b) => updated(b) - updated(a));
}
