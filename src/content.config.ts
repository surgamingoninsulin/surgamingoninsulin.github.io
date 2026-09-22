// defineCollection: tells Astro "this folder of files is a group of content" (here: my projects).
// z (renamed `zod` below): Zod, a schema-validation library re-exported by Astro.
//   It lets us describe what each project's frontmatter must look like, e.g.
//   `zod.string()` = must be text, `zod.array(...)` = must be a list, `.default(x)` = use x if missing,
//   `.optional()` = may be left out. If a project file breaks these rules, the build fails with a clear error
//   instead of publishing a broken page.
import { defineCollection, z as zod } from 'astro:content';
import { glob } from 'astro/loaders';

// A link that may be left blank (`source:` with nothing after it) or omitted entirely.
const optionalUrl = zod.preprocess((v) => (v ? v : undefined), zod.string().url().optional());

const projects = defineCollection({
  // Every project lives beside its icon in public/downloads/<type>/<project>/<project>.md.
  loader: glob({ pattern: '**/*.md', base: './public/downloads' }),
  schema: zod.object({
    title: zod.string(),
    summary: zod.string(),
    author: zod.string().default('SurGamingOnInsulin'),
    // Images can be a filename beside the Markdown, a site-relative path, or an http(s) URL.
    // Keep the older names as compatibility aliases while new files use the explicit names.
    'logo-image': zod.string().optional(),
    'header-image': zod.string().optional(),
    icon: zod.string().optional(),
    header: zod.string().optional(),
    categories: zod.array(zod.string()).default([]),
    resolution: zod.string().optional(),         // resource packs only, e.g. 16x
    loaders: zod.array(zod.string()).default([]), // plugins / mods only, e.g. [Fabric, NeoForge]
    featured: zod.boolean().default(false),
    features: zod.boolean().optional(),          // accepted alias for featured
    // All-in-one projects: the folder is the main type; list the extra sections here, e.g. alsoIn: [datapacks]
    alsoIn: zod.array(zod.enum(['resourcepacks', 'datapacks', 'plugins', 'mods'])).default([]),
    links: zod.object({
      source: optionalUrl,
      issues: optionalUrl,
      discord: optionalUrl,
      donate: optionalUrl,
    }).nullish().transform((l) => l ?? {}),
    gallery: zod.array(zod.object({ src: zod.string(), caption: zod.string().optional() })).default([]),
    versions: zod.array(zod.object({
      version: zod.string(),
      mc: zod.array(zod.string()).default([]),   // supported Minecraft versions (leave out for non-Minecraft downloads)
      file: zod.string(),                        // GitHub release URL (recommended) or a path under public/
      date: zod.coerce.date(),                   // "2026-09-01" is converted into a real Date
      changelog: zod.string().default(''),
    })).min(1),                                  // every project needs at least one download
  }),
});

export const collections = { projects };
