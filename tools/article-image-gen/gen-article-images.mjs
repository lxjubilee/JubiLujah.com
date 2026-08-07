// ============================================================================
// Article image generator — drives a REAL Chrome window through the ChatGPT
// web app to generate a hero image for each article, then saves it into the
// site and wires it into the article record.
//
//   1. Launches Chrome (persistent profile, so your login is remembered).
//   2. Opens ChatGPT and verifies you are logged in — if not, it waits while
//      you log in by hand, then continues on its own.
//   3. Takes an article's image prompt and sends it to ChatGPT to generate.
//   4. Waits for the image to finish generating.
//   5. Downloads it to app/web/public/articles/images/<random-12>.webp and
//      writes that path into the article's source frontmatter, then rebuilds
//      articles.json so the site shows it.
//
// USAGE (from this folder):
//   node gen-article-images.mjs                 # every article missing an image
//   node gen-article-images.mjs --all --force   # every article, regenerate all
//   node gen-article-images.mjs --slug the-song-you-cant-sing-yet
//   node gen-article-images.mjs --prompt "a quiet chapel at dawn" --name custom
//   node gen-article-images.mjs --limit 3       # only the first 3 pending
//
// ⚠ NOTE (said plainly): automating the ChatGPT web UI may conflict with
//   OpenAI's Terms of Use and can get an account flagged. This runs against
//   YOUR logged-in session at your direction. The official Images API is the
//   compliant alternative. Selectors below target chatgpt.com as of this
//   writing; if the site changes, adjust the SELECTORS block.
// ============================================================================
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const ARTICLES_JSON = path.join(ROOT, 'app/web/public/articles/articles.json');
const IMAGES_DIR = path.join(ROOT, 'app/web/public/articles/images');
const MD_DIR = path.join(ROOT, 'core/articles');
const GEN_SCRIPT = path.join(ROOT, 'core/articles/gen-articles.mjs');
const PROFILE_DIR = path.join(HERE, '.chrome-profile');
const PUBLIC_URL_PREFIX = '/articles/images';

// --- Tunables (adjust here if ChatGPT's UI changes) -------------------------
const SELECTORS = {
  composer: '#prompt-textarea, div[contenteditable="true"]',
  sendButton: 'button[data-testid="send-button"], button[aria-label="Send prompt"]',
  assistantTurn: '[data-message-author-role="assistant"]',
  // A logged-OUT chatgpt.com still shows a composer, so the composer alone is
  // not proof of login. Treat these "log in / sign up" affordances as the real
  // signal that you are NOT yet signed in.
  loginButton:
    '[data-testid="login-button"], [data-testid="signup-button"], a[href*="auth/login"], a[href*="auth"][href*="login"]',
};
const CHATGPT_URL = 'https://chatgpt.com/';
const LOGIN_WAIT_MS = 5 * 60 * 1000; // how long to wait for a manual login
const IMAGE_WAIT_MS = 6 * 60 * 1000; // how long to wait for one image to render
const POLL_MS = 3000;
const PROMPT_PREFIX =
  'Please generate a single image from the following description. ' +
  'Output only the image, with no border, caption, watermark, or text in it, ' +
  'and do not ask any clarifying questions.\n\n';

// --- Args -------------------------------------------------------------------
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => {
  const i = args.indexOf(f);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
};
const OPT = {
  all: has('--all'),
  force: has('--force'),
  slug: val('--slug'),
  prompt: val('--prompt'),
  name: val('--name'),
  limit: val('--limit') ? Number(val('--limit')) : Infinity,
};

const log = (...m) => console.log('•', ...m);
const warn = (...m) => console.warn('⚠', ...m);

function randomName(n = 12) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < n; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

function loadArticles() {
  const data = JSON.parse(fs.readFileSync(ARTICLES_JSON, 'utf8'));
  return Array.isArray(data.articles) ? data.articles : [];
}

// Build the work list from CLI options.
function buildJobs() {
  if (OPT.prompt) {
    return [{ slug: null, imagePrompt: OPT.prompt, name: OPT.name || null, title: '(ad-hoc prompt)' }];
  }
  let list = loadArticles();
  if (OPT.slug) list = list.filter((a) => a.slug === OPT.slug);
  else if (!OPT.all && !OPT.force) list = list.filter((a) => !a.image);
  return list.filter((a) => a.imagePrompt).slice(0, OPT.limit);
}

// Write `image: <webPath>` into an article's markdown frontmatter, then rebuild.
function recordImage(slug, webPath) {
  if (!slug) return;
  const file = path.join(MD_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return warn('No source file for', slug, '- skipped frontmatter update');
  let raw = fs.readFileSync(file, 'utf8');
  const m = /^(---\s*\n)([\s\S]*?)(\n---\s*\n)/.exec(raw);
  if (!m) return warn('No frontmatter in', slug);
  let front = m[2];
  if (/^image:.*$/m.test(front)) front = front.replace(/^image:.*$/m, `image: ${webPath}`);
  else front = `${front}\nimage: ${webPath}`;
  raw = raw.slice(0, m.index) + m[1] + front + m[3] + raw.slice(m.index + m[0].length);
  fs.writeFileSync(file, raw);
}

function rebuild() {
  log('Rebuilding articles.json …');
  const r = spawnSync(process.execPath, [GEN_SCRIPT], { stdio: 'inherit' });
  if (r.status !== 0) warn('gen-articles.mjs exited with status', r.status);
}

// --- ChatGPT interaction ----------------------------------------------------
// Logged-out chatgpt.com still shows a composer, so "composer visible" is not
// proof of login. Require the composer AND the absence of a login/sign-up
// affordance.
async function isLoggedIn(page) {
  const composerVisible = await page
    .locator(SELECTORS.composer)
    .first()
    .isVisible()
    .catch(() => false);
  if (!composerVisible) return false;
  const loginVisible = await page
    .locator(SELECTORS.loginButton)
    .first()
    .isVisible()
    .catch(() => false);
  return !loginVisible;
}

async function ensureLoggedIn(page) {
  await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  if (await isLoggedIn(page)) {
    log('Already logged in.');
    return;
  }
  console.log('\n────────────────────────────────────────────────────────');
  console.log('  Please LOG IN to ChatGPT in the Chrome window that opened.');
  console.log('  I will continue automatically once you are signed in.');
  console.log('────────────────────────────────────────────────────────\n');
  const deadline = Date.now() + LOGIN_WAIT_MS;
  while (Date.now() < deadline) {
    if (await isLoggedIn(page)) {
      log('Login detected — continuing.');
      return;
    }
    await page.waitForTimeout(POLL_MS);
  }
  throw new Error('Timed out waiting for login.');
}

async function startNewChat(page) {
  await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded' });
  await page.locator(SELECTORS.composer).first().waitFor({ state: 'visible', timeout: 30000 });
}

async function submitPrompt(page, prompt) {
  const composer = page.locator(SELECTORS.composer).first();
  await composer.click();
  await page.keyboard.insertText(PROMPT_PREFIX + prompt);
  const send = page.locator(SELECTORS.sendButton).first();
  if (await send.isVisible().catch(() => false)) await send.click();
  else await page.keyboard.press('Enter');
}

// Poll the newest assistant turn for a finished, generated image.
async function waitForImage(page) {
  const deadline = Date.now() + IMAGE_WAIT_MS;
  while (Date.now() < deadline) {
    const src = await page.evaluate((sel) => {
      const turns = document.querySelectorAll(sel.assistantTurn);
      const turn = turns[turns.length - 1];
      if (!turn) return null;
      const imgs = [...turn.querySelectorAll('img')].filter((im) => {
        const s = im.currentSrc || im.src || '';
        const big = (im.naturalWidth || 0) >= 256 && (im.naturalHeight || 0) >= 256;
        const looksGenerated = /oaiusercontent|files\.|blob:|\.webp|\.png|\.jpg/i.test(s);
        const isChrome = /avatar|icon|emoji|favicon/i.test(s);
        return s && big && looksGenerated && !isChrome && im.complete;
      });
      if (!imgs.length) return null;
      imgs.sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight);
      return imgs[0].currentSrc || imgs[0].src;
    }, SELECTORS);
    if (src) return src;
    process.stdout.write('.');
    await page.waitForTimeout(POLL_MS);
  }
  process.stdout.write('\n');
  return null;
}

// Fetch the image inside the page (keeps the auth session) and return bytes.
async function downloadImage(page, src) {
  const { b64, type } = await page.evaluate(async (url) => {
    const res = await fetch(url);
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
    }
    return { b64: btoa(bin), type: res.headers.get('content-type') || '' };
  }, src);
  return { bytes: Buffer.from(b64, 'base64'), type };
}

async function run() {
  const jobs = buildJobs();
  if (!jobs.length) {
    log('Nothing to do. (All articles already have images, or no match.) Use --all --force to redo.');
    return;
  }
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  log(`${jobs.length} image(s) to generate.`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: 'chrome',
    // Keep Chrome's own sandbox ON. Playwright disables it by default, which
    // adds the "--no-sandbox" flag and triggers Chrome's "stability and
    // security will suffer" banner — and the instability was crashing the tab
    // mid-generation.
    chromiumSandbox: true,
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  const page = context.pages()[0] || (await context.newPage());

  let done = 0;
  try {
    await ensureLoggedIn(page);
    for (const job of jobs) {
      log(`\n[${done + 1}/${jobs.length}] ${job.title || job.slug}`);
      try {
        await startNewChat(page);
        await submitPrompt(page, job.imagePrompt);
        log('Prompt sent — waiting for the image to generate');
        const src = await waitForImage(page);
        if (!src) {
          warn('No image appeared in time — skipping. (ChatGPT may have asked a question or refused.)');
          continue;
        }
        const { bytes, type } = await downloadImage(page, src);
        const name = `${job.name || randomName(12)}.webp`;
        const dest = path.join(IMAGES_DIR, name);
        fs.writeFileSync(dest, bytes);
        const webPath = `${PUBLIC_URL_PREFIX}/${name}`;
        recordImage(job.slug, webPath);
        log(`Saved ${webPath}  (${bytes.length.toLocaleString()} bytes, source type: ${type || 'unknown'})`);
        done++;
      } catch (err) {
        warn(`Failed on "${job.title || job.slug}":`, err.message);
      }
    }
  } finally {
    await context.close();
  }

  if (done > 0) rebuild();
  log(`\nFinished. ${done}/${jobs.length} image(s) generated and wired in.`);
}

run().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
