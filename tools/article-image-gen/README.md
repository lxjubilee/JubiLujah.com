# Article Image Generator

Drives a **real Chrome window** through the ChatGPT web app to generate a hero
image for each article, then saves it into the site and wires it in.

## What it does

1. Launches Chrome with a saved profile (so your login is remembered).
2. Opens ChatGPT and checks you're logged in — if not, it **waits while you log
   in by hand**, then continues on its own.
3. Sends an article's image prompt to ChatGPT to generate the image.
4. Waits for the image to finish.
5. Downloads it to `app/web/public/articles/images/<random-12>.webp` (e.g.
   `dw3gE54WGld4j.webp`), writes that path into the article's source, and
   rebuilds `articles.json` so the site shows it.

## Run it

**Easiest:** double-click **`Generate-Article-Images.cmd`**. The first run
installs Playwright + Chrome automatically.

**From a terminal** (in this folder):

```
npm install            # first time only
node gen-article-images.mjs            # every article missing an image
node gen-article-images.mjs --all --force   # (re)generate all 30
node gen-article-images.mjs --slug the-song-you-cant-sing-yet
node gen-article-images.mjs --prompt "a quiet chapel at dawn" --name mychapel
node gen-article-images.mjs --limit 3       # just the first 3 pending
```

## Options

| Flag | Meaning |
|------|---------|
| *(none)* | Generate for every article that has no image yet. |
| `--all` | Consider every article. |
| `--force` | Regenerate even for articles that already have an image. |
| `--slug <slug>` | Only this one article. |
| `--prompt "<text>"` | Ad-hoc prompt, not tied to an article (use `--name` to set the filename). |
| `--limit <n>` | Cap how many are done this run. |

## Requirements

- **Node.js** on PATH (https://nodejs.org).
- A **ChatGPT account** with image generation. You log in once in the opened
  Chrome window; the session is remembered in `.chrome-profile/` for next time.

## ⚠ Please read — honest caveat

Automating the **ChatGPT web UI** (driving the browser, scraping the generated
image) may conflict with **OpenAI's Terms of Use**, and heavy automated use can
get an account flagged. This tool runs against **your own logged-in session at
your direction**. The compliant, more reliable alternative is OpenAI's official
**Images API** (or the **Leonardo API**) — either key is already in the repo's
`.env`, and a headless API version can be built on request.

## If ChatGPT changes its layout

The tool targets `chatgpt.com` as of this writing. If a run stops finding the
chat box or the image, update the `SELECTORS` block at the top of
`gen-article-images.mjs` — everything else stays the same.
