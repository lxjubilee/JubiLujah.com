# Image Studio — Technical Specification & Build Record

**What it is:** a Windows desktop app (WPF + WebView2) that hosts a real
browser, lets you log in to ChatGPT by hand, and then drives *your own
authenticated session* to generate a hero image for each article on
JubiLujah.com — saving each image into the site and wiring it into the article
automatically.

**Status:** working. Built and run locally against the `.NET 8` SDK.

---

## 1. Why it exists

Every article in the JubiLujah.com article system (`core/articles/*.md` →
`app/web/public/articles/articles.json` → the `/articles` route) carries an
`imagePrompt`. Image Studio turns those prompts into real `.webp` hero images.

It uses the ChatGPT **web app** on purpose — so image generation runs on the
user's existing ChatGPT subscription rather than paid API calls — while leaving
the human to pass any login / bot-check themselves in a genuine browser.

> ⚠ **Honest caveat (also in the app and its README):** automating the ChatGPT
> web UI may conflict with OpenAI's Terms of Use. Image Studio does **not**
> defeat any human/bot check — the user logs in themselves in a real browser —
> but the prompt submission afterward is automated, against the user's own
> session, at their direction. For large volumes the compliant path is an
> official image API (OpenAI Images / Leonardo / Flux); this tool is for modest,
> hands-on batches.

---

## 2. Architecture

```
┌─────────────────────────── ImageStudio.exe (WPF, net8.0-windows) ──────────────────────────┐
│                                                                                             │
│   MainWindow                                                                                 │
│   ├── WebView2 (real Edge/Chromium browser)  ── persistent profile → login/cookies persist  │
│   │      you log in to ChatGPT here; JS is injected to drive YOUR session                    │
│   └── Control panel (generate, auto, manual download, location, log)                         │
│                                                                                             │
│   Generation loop (C#)  ──ExecuteScriptAsync──▶  injected JS  ──▶  ChatGPT page              │
│                         ◀──WebMessageReceived──   (image bytes as base64)                    │
│                                                                                             │
│   On success:  write /articles/images/<random12>.webp                                        │
│                write `image: <file>` into core/articles/<slug>.md  (after imagePrompt)        │
│                set `image` on the article in articles.json (immediate display)               │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **UI framework:** WPF (`UseWPF`, `net8.0-windows`).
- **Browser control:** `Microsoft.Web.WebView2` (Evergreen WebView2 runtime, i.e.
  real Edge/Chromium). Launched with a **persistent `UserDataFolder`**
  (`tools/ArticleImageStudio/.webview2`), which is what preserves the ChatGPT
  login/cookies between runs.
- **No headless automation framework.** Because it is a genuine embedded
  browser (not Playwright/Selenium with automation fingerprints), Cloudflare's
  "verify you are human" check passes when the user solves it once, by hand.

---

## 3. The generation pipeline (step by step)

For each article that still needs an image:

1. **Open a conversation.** For the first image of a batch — and after every 10
   images — navigate to the **generation location** (default `chatgpt.com`, or
   the user's ChatGPT *Projects → Images* page). Images 2–10 of a batch reuse
   the *same* conversation (no navigation).
2. **Wait for the composer** (`#prompt-textarea` / `div[contenteditable]`), so
   we know the page is usable and the user is logged in.
3. **Snapshot existing images** on the page (baseline) so we only accept a *new*
   one.
4. **Submit the prompt.** The article's `imagePrompt` + a fixed **16:9
   landscape directive** is inserted into the composer via
   `document.execCommand('insertText', …)` and sent (send button, else Enter).
5. **Detect completion.** Poll the page; accept an image that (a) was **not** in
   the baseline and (b) holds the **same URL across two consecutive polls** (so
   it is finished, not a streaming placeholder). Detection is **by size** — any
   loaded `<img>` ≥ 400×400 that isn't in the baseline — because ChatGPT serves
   generated images from signed URLs with no fixed pattern.
6. **Download the bytes.** An injected `fetch(src)` runs *inside the page*
   (keeping the auth session), converts the bytes to base64, and posts them back
   to C# via `window.chrome.webview.postMessage` → `WebMessageReceived`.
7. **Save & wire in.** Write
   `app/web/public/articles/images/<random-12-char>.webp`; write
   `image: <filename>` into the article's `.md` frontmatter (immediately after
   `imagePrompt:`); set the full `/articles/images/<file>` path on that article
   in `articles.json` so the live site shows it at once.
8. **Pause** a random **1–10 seconds**, then continue to the next.

### Duplicate protection
- **Durable:** an article that already has an `image` (in `articles.json` /
  `.md`) is skipped — across restarts.
- **Session guard:** an in-memory set of completed slugs prevents a run from ever
  re-processing one it just finished.

---

## 4. Features / controls

| Control | Behaviour |
|---|---|
| **Generation location** + *Use current page as location* | Locks the URL new conversations are started at. Point it at ChatGPT **Projects → Images** so every generation thread lives in that project. Normalizes a project-chat URL back to the project's new-chat page. |
| **Refresh list** / **Show all** | Lists articles needing an image (or all) from `articles.json`. |
| **Generate Next** | Generates the next article still missing an image, then stops. |
| **Generate all pending** | Runs through every pending article once. |
| **Generate All Images (auto)** checkbox | Same as "all pending" but hands-off — check it and walk away; uncheck (or Stop) to halt. |
| **Download current image (manual)** | Fallback — grabs the image currently shown and wires it to the selected/next article. |
| **Stop** | Cancels after the current image. |
| **Log** | Step-by-step trace (submit result, image counts, pauses, saves, ✗ failures). |

### Tunable constants (in `MainWindow.xaml.cs`)
- `AspectSuffix` — the 16:9 landscape instruction appended to every prompt.
- Per-thread image count — `if (++inThread >= 10)` in `RunBatch`.
- Random pause — `_rng.Next(1000, 10001)` (1–10 s) in `RunBatch`.
- Timeouts — login wait, image wait (6 min), navigation (25 s).
- DOM selectors — the `*Script()` methods at the bottom of `MainWindow.xaml.cs`
  (`ComposerPresentScript`, `SubmitScript`, `ListImagesScript`, `FetchScript`).
  **If ChatGPT changes its layout, adjust these — nothing else.**

---

## 5. Integration with the article system

- **Source of truth:** `core/articles/<slug>.md` (frontmatter + body).
- **Compiler:** `core/articles/gen-articles.mjs` reads the `.md` files and writes
  `app/web/public/articles/articles.json`. It resolves the `image` field: a bare
  filename → `/articles/images/<file>`; an already-rooted path or URL → as-is;
  otherwise a slug-named file under `/images/articles`, else `null` (titled
  fallback panel).
- **Read side:** `app/web/lib/articles.ts`; rendered by
  `app/web/app/articles/page.tsx` (grid) and `app/web/app/articles/[slug]/page.tsx`
  (single), with `app/web/components/ArticleProse.tsx`.
- Image Studio writes the `.md` frontmatter **and** `articles.json` so the image
  is durable (survives a `gen-articles` rebuild) and visible immediately.

---

## 6. File layout

```
setup/image-studio/
  Install-Image-Studio.cmd      ← installer (this folder)
  SPECIFICATION.md              ← this document

tools/ArticleImageStudio/       ← the app source (folder name predates the rename)
  ArticleImageStudio.csproj     ← net8.0-windows, WPF, WebView2; AssemblyName = ImageStudio
  App.xaml / App.xaml.cs
  MainWindow.xaml               ← the UI
  MainWindow.xaml.cs            ← all logic + injected JS
  Build-And-Run.cmd             ← dev build+launch
  README.md
  .gitignore                    ← ignores bin/ obj/ .webview2/ cookies.json
  bin/Release/net8.0-windows/ImageStudio.exe   ← the built executable
  .webview2/                    ← persistent browser profile (login/cookies) — gitignored
```

---

## 7. Build & run

**Prerequisites**
- **.NET 8 SDK** (`dotnet`). The installer auto-installs it via
  `winget install Microsoft.DotNet.SDK.8` if missing.
- **WebView2 Runtime** — ships with Microsoft Edge on Windows 10/11.
- A **ChatGPT account** with image generation.

**Install (turnkey):** double-click `setup/image-studio/Install-Image-Studio.cmd`.
It locates/installs the SDK, builds Release, drops a desktop shortcut, and
launches.

**Dev build/run:**
```
dotnet build tools/ArticleImageStudio/ArticleImageStudio.csproj -c Release
tools/ArticleImageStudio/bin/Release/net8.0-windows/ImageStudio.exe
```

**Use:** log in → open *Projects → Images* → *Use current page as location* →
check **Generate All Images** → walk away.

---

## 8. Exactly what was done to build it (chronological record)

1. **Project scaffold** — SDK-style WPF project (`net8.0-windows`, `UseWPF`,
   `Nullable`, `ImplicitUsings`), one `PackageReference` to
   `Microsoft.Web.WebView2` (floating `1.0.*`). `AssemblyName = ImageStudio`.
2. **Shell** — `App.xaml`/`.cs` + `MainWindow.xaml`: a two-column layout, WebView2
   on the left, a control panel on the right.
3. **WebView2 init** — `CoreWebView2Environment.CreateAsync(userDataFolder: …/.webview2)`
   then `EnsureCoreWebView2Async`, navigate to `chatgpt.com`. The persistent
   folder is the cookie/login store.
4. **Article wiring** — resolve the repo root by walking up from the exe until
   `app/web/public/articles/articles.json` is found; read pending articles;
   write images to `app/web/public/articles/images/`; update `.md` + `articles.json`.
   Extended `gen-articles.mjs` to honour a frontmatter `image:` (bare filename →
   `/articles/images/<file>`).
5. **Generation flow** — inject JS to place the prompt and submit; poll for the
   result; fetch the bytes inside the page and return them via `postMessage`.
6. **Robustness fixes discovered in testing:**
   - `chromiumSandbox: true` — Playwright/WebView launches were adding
     `--no-sandbox`, which showed Chrome's "stability/security will suffer"
     banner and crashed the tab mid-generation. (An earlier Playwright-based
     prototype was abandoned because Cloudflare blocked its automation
     fingerprint; WebView2 with a human login solved that.)
   - Login detection that checks for the **absence of a login/sign-up button**,
     not merely the presence of a composer (a logged-out page shows a composer).
   - **Size-based image detection** — the original URL-pattern match never saw
     ChatGPT's signed image URLs, so it "waited forever" while the image sat on
     screen. Switched to "the big loaded image that wasn't there before."
   - Navigation no longer hangs — a 25 s cap replaced an open-ended wait that
     was freezing the run (and disabling the buttons).
   - Detailed logging at every step for field debugging.
7. **Feature requests, in order added:** 16:9 directive on every prompt; a
   *Generate Next* button; a *Download current image* manual fallback; the
   *Generate All Images* auto checkbox; durable + session duplicate tracking; a
   random 1–10 s pause between images; a **generation location** for the
   ChatGPT *Images* project; **10 images per conversation thread** before a new
   thread.
8. **Rename & cleanup** — renamed the app to **Image Studio** (window title,
   header, and `AssemblyName` → `ImageStudio.exe`); removed the *Open ChatGPT /
   Log in*, *Export cookies*, *Import cookies* buttons and the *Custom prompt*
   box as unnecessary.
9. **Prerequisite install** — the machine had no .NET SDK; the .NET 8 SDK was
   installed via winget and the app built clean (0 warnings, 0 errors).

---

## 9. Known limitations

- **Depends on ChatGPT's live DOM.** If OpenAI changes the page, the selectors
  in the `*Script()` methods need updating. That is the single maintenance point.
- **Not for high volume.** Fine for tens or a few hundred images. For thousands+
  use an official image API or a self-hosted Flux/SDXL pipeline.
- **ToS.** See the caveat in §1. Runs against the user's own session at their
  direction.
