# Article Image Studio (WPF + WebView2)

A small Windows app that hosts a **real browser** (WebView2 / Edge-Chromium) so
you can log in to ChatGPT by hand — the human check passes normally, because it
is a genuine browser, not an automation-flagged one — and then it drives *your
own logged-in session* to generate each article's hero image.

## What it does

- Embeds a real browser. **You** log in to ChatGPT (and pass any Cloudflare
  "verify you are human" check yourself).
- **Saves your cookies / session** in `.webview2/` next to the app, so you stay
  logged in between runs. `Export cookies` / `Import cookies` back the session
  up to `cookies.json`.
- Lists the articles that still need an image (from `articles.json`).
- For each: sends the article's image prompt to ChatGPT, waits for the image,
  downloads it to `app/web/public/articles/images/<random-12>.webp`, and writes
  that path into both the article's source (`core/articles/<slug>.md`) and
  `articles.json` so the site shows it immediately.

## Build & run

Double-click **`Build-And-Run.cmd`**, or:

```
dotnet build -c Release
bin\Release\net8.0-windows\ArticleImageStudio.exe
```

Requires the **.NET 8 SDK** and the **WebView2 Runtime** (already present with
Edge on Windows 11).

## Use it

1. Launch. The browser opens to ChatGPT.
2. **Log in** (click `Open ChatGPT / Log in` if needed). Solve the human check
   once — your session is then remembered.
3. Click **Refresh list** to see articles needing an image.
4. **Generate selected** (pick one) or **Generate all pending**. Or type a
   **custom prompt** and generate that.
5. Watch the log. Images land in `app/web/public/articles/images/` and are wired
   into the articles automatically.

## ⚠ Honest caveat

Automating the ChatGPT web UI (submitting prompts, pulling the generated image)
may conflict with **OpenAI's Terms of Use**. This app does **not** defeat the
bot / human check — *you* pass that yourself in a real browser — but the prompt
submission afterward is automated, against your own session, at your direction.
The fully compliant alternative remains the official **Images API** (key already
in the repo `.env`).

## If ChatGPT changes its layout

The DOM selectors live in one place — the `*Script()` methods at the bottom of
`MainWindow.xaml.cs`. If a run stops finding the chat box or the image, adjust
them there.
