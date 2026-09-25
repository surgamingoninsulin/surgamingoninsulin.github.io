// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import debugDownloader from './integrations/debug-downloader.ts';
import convertDev from './integrations/convert-dev.ts';

// GitHub Actions sets GITHUB_REPOSITORY ("owner/repo"), so the site and base
// path are derived automatically. Project pages live under /<repo>/, while a
// "<owner>.github.io" repository is served from the root.
const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
const isUserSite = !!repo && repo.toLowerCase() === `${owner.toLowerCase()}.github.io`;

export default defineConfig({
  site: owner ? `https://${owner.toLowerCase()}.github.io` : undefined,
  base: repo && !isUserSite ? `/${repo}` : '/',
  // Adds /__debug/* routes to `npm run dev` only (see src/config.ts → DEBUG).
  // convertDev serves ./all-files-convert at /all-files-convert/ under `npm run dev`.
  integrations: [debugDownloader(), convertDev()],
  vite: { plugins: [tailwindcss()] },
  // Start loading a page as soon as a link to it is hovered (or tapped), so moving
  // between tools feels instant.
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  // Hides the Astro dev toolbar at the bottom of the page in `npm run dev`.
  devToolbar: { enabled: false },
});
