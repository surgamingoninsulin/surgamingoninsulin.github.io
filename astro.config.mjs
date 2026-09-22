import { defineConfig } from 'astro/config';

// For GitHub Pages the deploy workflow sets SITE and BASE automatically.
// Project site:  SITE=https://<user>.github.io  BASE=/<repo>
// User site:     SITE=https://<user>.github.io  BASE=/
export default defineConfig({
  site: process.env.SITE || 'http://localhost:4321',
  base: process.env.BASE || '/',
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false }, // hides the Astro toolbar at the bottom of the page in `npm run dev`
});
