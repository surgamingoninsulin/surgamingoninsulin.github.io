/**
 * DEBUG = true  → local testing: links are downloaded by yt-dlp on this computer
 *                 through the dev server (only works with `npm run dev`).
 * DEBUG = false → production: links are sent to the GitHub Actions workflow.
 *
 * Defaults to true under `npm run dev` and false in the GitHub Pages build.
 */
export const DEBUG: boolean = import.meta.env.DEV;
