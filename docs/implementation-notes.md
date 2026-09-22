# Implementation notes

## 2026-09-22

- Added a Projects navigation link with a Music Converter tool and a full-width project browse page with multiple horizontal card rails and arrow controls.
- Extended the navigation flex layout so About stays at the far right, and added per-project card/detail metadata, image fallback, truncation, and detail pages.
- Added `public/project-placeholder.svg` as the editable fallback for missing card and header images.
- Changed the header to use a direct Projects link and renamed the Minecraft dropdown to Games.
- Moved Minecraft project Markdown from `src/content` to `public/downloads/<type>/<project>/<project>.md`; each project keeps its `icon.png` beside the Markdown.
- Reworked About with a personal bio, a mailto contact action, and friendlier installation guidance.
- Broadened Pixelith's tagline and homepage language beyond Minecraft so the site can represent games, tools and creative projects.
- Added a back-to-Other-Projects link beneath the main header on every Other Project detail page.
- Replaced the visible back text with a larger overlay arrow and centralized the interface icons in a themed SVG component.
- Fixed Projects card thumbnails to a consistent 16:9 frame with centered cropping.
- Projects shelves and detail pages now read their metadata and Markdown body from the uploaded project `.md` files; corrected and reformatted the OpenRCT2 Universal USB Launcher Markdown.
- Featured shelves accept both `featured: true` and `features: true`; icon and header images support local PNG/WebP/JPG/JPEG/GIF/SVG files and full HTTPS URLs.
- Homepage featured slides now combine Minecraft projects and general Projects from the Markdown loader; explicit `icon:` and `header:` frontmatter values are supported for local files or HTTPS URLs.
- Moved the About link to the flexible far-right area of the main navigation, before the GitHub and theme controls.
- The Music Converter page documents a future, rights-respecting workflow. It intentionally does not implement Spotify/YouTube stream ripping or access-control bypasses.
- Homepage featured data now comes from one path-aware project collection, so non-Minecraft projects appear in the carousel. All project Markdown files declare `logo-image` and `header-image`; each accepts a project-local filename, site-relative path, or HTTP(S) URL, with legacy `icon`/`header` aliases retained.
- Homepage carousel focus is cleared on browser back/forward restoration so a restored card focus cannot leave the animation paused permanently.

### Follow-up

- A functional converter will need a separate backend or local application, official API credentials, timeout/retry handling, and an authorized download source.
