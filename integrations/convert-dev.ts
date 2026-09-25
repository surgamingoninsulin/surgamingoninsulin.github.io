// Serves the file converter (./all-files-convert) at /all-files-convert/ from the same `npm run dev`
// server, so all SGOI tools run together on one port like they do on GitHub Pages.
//
// The converter is its own Vite app with its own dependencies, so it is
// started with its own copy of Vite in middleware mode and mounted on the
// Astro dev server. If it can't start (usually: `bun install` hasn't been run
// in all-files-convert/), /all-files-convert/ shows a page explaining why instead of a bare 404.
// Only active under `npm run dev`.

import type { AstroIntegration } from 'astro';
import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CONVERT = join(process.cwd(), 'all-files-convert');
/** URL the converter is served at (same as on GitHub Pages). */
const MOUNT = '/all-files-convert/';
const CONVERT_VITE = join(CONVERT, 'node_modules', 'vite', 'dist', 'node', 'index.js');

const escape = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

function problemPage(res: ServerResponse, problem: string) {
  res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>File converter not running</title>
<style>body{font:16px/1.6 system-ui,sans-serif;background:#0e0e11;color:#ececf1;max-width:44rem;margin:4rem auto;padding:0 1rem}
code,pre{background:#16161b;border:1px solid #25252d;border-radius:.4rem;padding:.1rem .35rem}pre{padding:1rem;overflow:auto;white-space:pre-wrap}</style></head>
<body><h1>The file converter isn't running</h1>
<p>${problem}</p>
<p>Install its packages, then restart <code>npm run dev</code>:</p>
<pre>cd all-files-convert
bun install</pre>
<p><a href="/" style="color:#ff4d6d">← Back to SGOI Tools</a></p></body></html>`);
}

export default function convertDev(): AstroIntegration {
  return {
    name: 'convert-dev',
    hooks: {
      'astro:config:setup': ({ command, updateConfig }) => {
        if (command !== 'dev') return;
        // Don't let Astro's own watcher crawl the converter.
        updateConfig({ vite: { server: { watch: { ignored: ['**/all-files-convert/**'] } } } });
      },

      'astro:server:setup': async ({ server, logger }) => {
        let convert: { middlewares: (req: unknown, res: unknown, next: () => void) => void; close(): Promise<void> } | undefined;
        let problem = '';

        if (!existsSync(CONVERT_VITE)) {
          problem = 'Its packages are not installed: <code>all-files-convert/node_modules</code> has no Vite.';
        } else {
          try {
            const { createServer } = await import(pathToFileURL(CONVERT_VITE).href);
            convert = await createServer({
              root: CONVERT,
              configFile: join(CONVERT, 'vite.config.js'),
              base: MOUNT,
              server: { middlewareMode: true, ws: { port: 24690 } },
              appType: 'spa',
            });
            server.httpServer?.once('close', () => convert?.close());
          } catch (e) {
            problem = `It failed to start. Its packages are probably incomplete.<pre>${escape(String((e as Error)?.stack ?? e))}</pre>`;
          }
        }

        if (convert) logger.info(`File converter available at ${MOUNT}`);
        else logger.warn(`File converter not available at ${MOUNT}. Run \`bun install\` in all-files-convert/ and restart.`);

        server.middlewares.use((req, res, next) => {
          const url = req.url ?? '';
          const bare = MOUNT.slice(0, -1);
          if (url === bare || url.startsWith(bare + '?')) {
            res.writeHead(301, { Location: MOUNT + url.slice(bare.length) }).end();
            return;
          }
          // Old address of the converter.
          if (url === '/convert' || url.startsWith('/convert/') || url.startsWith('/convert?')) {
            res.writeHead(301, { Location: MOUNT + url.replace(/^\/convert\/?/, '') }).end();
            return;
          }
          if (!url.startsWith(MOUNT)) return next();
          if (convert) convert.middlewares(req, res, next);
          else problemPage(res, problem);
        });
      },
    },
  };
}
