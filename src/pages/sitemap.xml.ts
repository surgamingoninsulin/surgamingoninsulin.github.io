// /sitemap.xml: the home page and every tool from shared/sgoi.ts, so search
// engines find new tools automatically. Linked from /robots.txt.
import type { APIRoute } from 'astro';
import { allPages, HUB } from '../../shared/sgoi';

export const GET: APIRoute = ({ site }) => {
  const root = new URL(import.meta.env.BASE_URL.replace(/\/?$/, '/'), site ?? HUB.url);
  const paths = ['', ...allPages().map((t) => t.path)];
  const today = new Date().toISOString().slice(0, 10);
  const urls = paths
    .map((p) => `  <url><loc>${new URL(p, root).href}</loc><lastmod>${today}</lastmod></url>`)
    .join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
