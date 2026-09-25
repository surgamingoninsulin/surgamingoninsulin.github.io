# Youtube Playlist → MP3

A static site on GitHub Pages. You drop in any text file that contains YouTube playlist or video links, and every song comes back as a tagged MP3 with cover art.

YouTube blocks direct downloads from the browser, so this site doesn't download anything itself. It sends the links to a **GitHub Actions** workflow in this repository. The workflow runs [ yt-dlp](https://github.com/ yt-dlp/ yt-dlp) and ffmpeg and uploads the MP3s as a ZIP artifact. The page then follows the run and gives you a **Download ZIP** button when it's done.

```
text file ──▶ page finds links ──▶ GitHub API: start "Download MP3" workflow
                                               │
                          yt-dlp + ffmpeg on GitHub's runner
                                               │
            Download ZIP ◀── page polls the run ◀── MP3s uploaded as artifact
```

## Setup (one time)

1. **Push this project** to a GitHub repository, for example `yt-mp3`.
2. **Turn on Pages:** Settings → Pages → Source: **GitHub Actions**. Each push to `main` then builds and deploys the site (`.github/workflows/deploy.yml`) to `https://<you>.github.io/<repo>/`.
3. **Add YouTube cookies.** GitHub's servers get YouTube's "confirm you're not a bot" check, so the workflow has to sign in with cookies:
   - Sign in to YouTube in your browser. A spare Google account is safer than your main one.
   - Export `cookies.txt` from a logged-in YouTube tab with the **Get cookies.txt LOCALLY** browser extension.
   - Base64-encode the file. On Linux or Git Bash: `base64 -w0 cookies.txt`. In PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cookies.txt"))`.
   - Go to Settings → Secrets and variables → Actions → New repository secret. Name it `YT_COOKIES_B64` and paste the encoded output.
   - YouTube cookies expire, so export and replace `YT_COOKIES_B64` every few weeks or when runs start failing with the bot-check error.
   - Existing `YT_COOKIES` secrets are still accepted as a fallback, but `YT_COOKIES_B64` is recommended because it preserves line breaks and tabs when pasted.
4. **Create a token for the website.** Go to [Fine-grained tokens](https://github.com/settings/personal-access-tokens/new) and set:
   - Repository access: only this repository
   - Permissions: **Actions → Read and write**

   Open the site, click **Connect GitHub**, and paste the token. It's stored only in your browser's localStorage.

## Using it

1. Click the drop zone, drag a file onto the page, or paste text with **Ctrl+V**. Any text format works (`.txt`, `.csv`, `.json`, `.md`, `.html`, `.m3u`…). The page finds every `youtube.com`, `music.youtube.com` and `youtu.be` link in it.
2. The page checks each link and shows its title. Private or broken links are marked and skipped.
3. Pick a quality and click **Convert**. Each playlist ends up in its own folder inside the ZIP.

You can also start a download without the website: Actions → **Download MP3** → Run workflow, then paste the URLs.

## Good to know

- **Artifacts are kept for 1 day.** Change `retention-days` in `download.yml` if you want them longer.
- **In a public repository, anyone with a GitHub account can see the run logs and download the artifacts** until they expire. Make the repository private if that's a problem. Pages on a private repo needs a paid plan, and private repos get 2,000 free Actions minutes a month; public repos get unlimited minutes.
- A job can run for up to 3 hours, which is plenty for a few hundred songs.
- Only download content you have the rights to.

## Development

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # type-check + static build into dist/
```

### Debug mode (local testing)

`DEBUG` in `src/config.ts` is `true` during `npm run dev`. In debug mode the page doesn't use GitHub at all:

- A dev-only server runs yt-dlp on your own computer, with the same `yt-dlp.conf` as the workflow.
- If yt-dlp isn't installed, the standalone build is downloaded into `.tools/` on the first run. ffmpeg must be on your PATH.
- MP3s are saved to `local-downloads/<playlist name>/`, one folder per playlist. Loose video links go to `local-downloads/Singles/`. The page offers each playlist as a ZIP.
- Adding a playlist that's already on disk updates that folder instead of creating a new one. Each run lists the playlist on YouTube and checks every MP3's link and length with ffprobe. Complete songs are skipped, too-short or broken files are replaced, and missing songs are downloaded, until the playlist is complete. **Update** runs the same check again.
- Bookkeeping (links, file checks, download archives) is kept in `.state/`, so the playlist folders contain only MP3s.
- An optional `cookies.txt` in the project root is used if present. It's git-ignored.

The production build (`npm run build`) contains none of this code.

| Path | What it does |
| --- | --- |
| `src/pages/index.astro` | Page markup |
| `src/scripts/parse.ts` | Finds YouTube links in any text |
| `src/scripts/github.ts` | GitHub API: start the workflow, follow runs, download artifacts |
| `src/scripts/app.ts` | UI logic |
| `.github/workflows/download.yml` |  yt-dlp → MP3 → artifact |
| `.github/workflows/deploy.yml` | Build and deploy to GitHub Pages |
