# Publish Jubilujah.com — Runbook

**When the user says "Publish Jubilujah.com", execute this procedure end-to-end.**

This document is the source of truth. When the procedure changes, update this file.

---

## What this does

1. **CDN sync** — incremental upload of `J:/music/` → Cloudflare R2 bucket `jubileeverse-cdn` (public host `cdn.jubileeverse.com`). Only missing or size-mismatched files are uploaded; nothing on R2 is ever deleted by this flow.
2. **Site deploy** — tar+ship `W:/Jubilujah.com/` → `root@94.72.120.231:/var/www/Jubilujah.com/` and restart the `jubilujah` PM2 process on port 3119.
3. **Verify** — sample a CDN MP3, hit the live site, confirm 200s.

---

## Prerequisites (one-time setup, already done)

> **Corrected 2026-07-23.** The paths below were stale — `C:\Websites\jubileeverse.com\` and
> `C:\jubilujah-local\` do not exist on this machine, so the documented flow could not run at all.
> Verified-working locations are now recorded here.

| Thing | Where |
|-------|-------|
| SSH private key for prod | `%USERPROFILE%\.ssh\id_ed25519_jubilee_prod` — currently `C:\Users\gabriel.inspire\...` (the runbook previously named `zariah.inspire`; scripts use `$USERPROFILE`, so they work either way) |
| Public key installed on | `root@94.72.120.231:~/.ssh/authorized_keys` |
| R2 credentials | `W:\JubileeInspire.com\api\.env` — `R2_AVATARS_ENDPOINT / _BUCKET / _ACCESS_KEY_ID / _SECRET_ACCESS_KEY`. The sync script auto-loads this file and accepts the `R2_AVATARS_*` names. **This token is scoped to `jubileeverse-cdn` only.** No secrets live in this repo. |
| `@aws-sdk/client-s3` | Not installed at this repo root. `deploy/publish.sh` auto-detects it, currently resolving to `W:\JubileeInspire.com\api\node_modules`. To make this repo self-contained: `npm install @aws-sdk/client-s3 @aws-sdk/lib-storage` |
| Sync script | `W:\JubiLujah.com\_r2-sync-music-inspire.js` (in-repo; supports `--src= --prefix= --bucket= --env=`) |
| Manifest gate | `W:\JubiLujah.com\deploy\check-manifest.mjs` (read-only staleness check) |
| Nginx vhost | `/etc/nginx/sites-available/jubilujah.com` on prod (proxies `:80` → `127.0.0.1:3119`) |
| PM2 process | `jubilujah` (managed by PM2 on prod, persisted via `pm2 save`) |
| DNS | `www.jubilujah.com` and `jubilujah.com` proxied through Cloudflare (TLS terminates at CF edge) |

---

## The procedure

Run from any working directory. Steps must execute in order; failure at any step stops the publish.

### Step 0 — Pre-publish QA: the catalog manifest MUST be current (MANDATORY GATE)

New albums get added to `J:/music/albums` but the manifest is **not** auto-generated, so it goes stale and silently drops new albums from every page (home + category) and from covers/genres/analytics. **Never publish on a stale manifest.**

```bash
# 1. Is the manifest stale? (read-only — reports "would add: N")
node deploy/check-manifest.mjs          # exit 0 = current · exit 3 = STALE
node deploy/check-manifest.mjs --list   # every missing album path
```

If it reports **`would add: 0`**, the manifest is current — proceed to Step 1.
`deploy/publish.sh` runs this gate automatically and **refuses to publish** on exit 3.

> **⚠ OPEN ISSUE (2026-07-23): the reconciler is missing.**
> `C:/jubilujah-local/rebuild-manifest.js` does not exist on this machine and no copy exists
> anywhere on `W:`. `check-manifest.mjs` restores the *detection* half of this gate, but there
> is currently **no tool that writes the manifest**. As of 2026-07-23 the gate reports
> **949 albums on disk missing from the manifest** (982 recorded vs 1,889 on disk, generated
> 2026-07-07), plus 42 manifest entries whose folders are gone.
> **Until a reconciler exists, publishing renders roughly half the catalog invisible.**
> Known edge cases any reconciler must handle: duplicate track numbers within one album
> (e.g. `TTX301` has two `01_*.mp3`), and albums whose `.mp3`s are misfiled under `lyrics/`
> (documented in `_r2-sync-music-inspire.js`).

Once a reconciler exists, re-derive the dependent data (these scripts **moved into this repo**):

```bash
cd /w/JubiLujah.com/app/web
ARTWORK_BASE=J:/music node scripts/gen-album-covers.mjs
ARTWORK_BASE=J:/music node scripts/gen-album-genres.mjs
ARTWORK_BASE=J:/music node scripts/merge-genres-into-manifest.mjs
```

The canonical web copy is already `app/web/public/music/` (no cross-drive copy step needed —
`catalog-manifest.json` there is byte-identical to the `J:/music` master). Re-run the check and
confirm `would add: 0`. (Locally, restart the web dev server — `lib/manifest.ts` caches the
manifest in memory.)

### Step 1 — CDN sync (diff first, then apply)

**Canonical target** (settled 2026-07-23 by evidence): the site references `cdn.jubileeverse.com`
131 times across `app/web` and `cdn.jubilujah.com` zero times, so the live bucket is
**`jubileeverse-cdn`**, prefix `music/`, source tree `J:/music`. (`_r2-sync-music-inspire.js`'s
own defaults target `J:/jubilujah.com/music/inspire` → `cdn.jubilujah.com`, a *different* bucket
the site does not currently use — hence the explicit flags below.)

```bash
cd /w/JubiLujah.com
export NODE_PATH=/w/JubileeInspire.com/api/node_modules   # @aws-sdk/client-s3 lives here

# diff-only — surfaces what would upload
node _r2-sync-music-inspire.js --src=J:/music --prefix=music/ --bucket=jubileeverse-cdn

# actually uploads
node _r2-sync-music-inspire.js --src=J:/music --prefix=music/ --bucket=jubileeverse-cdn \
     --apply --concurrency=8
```

The script:
- Lists all keys under `music/` in the R2 bucket
- Walks the source tree, uploading only files that are missing or size-mismatched
- Skips `_artwork-backup*` directories
- Sets immutable cache headers for media
- Filters **by file type, never by folder** — deliberately, because at least one album has all 12
  of its `.mp3`s misfiled inside its `lyrics/` folder and a directory-level rule would silently
  drop the whole album

> **⚠ Filter gap vs. the original flow.** The publishable set is `mp3|png|jpg|jpeg|webp` only.
> The retired script also uploaded `catalog*.json`, `catalog*.html` and `index*.html`, so
> **`catalog-manifest.json` on the CDN is no longer refreshed by this step.** Step 3 still
> verifies that URL returns 200 (the old copy is present), but it will go stale. Either extend
> the whitelist or upload the catalog files separately once the manifest is reconciled.

Status as of 2026-07-23 (verified live diff): `publishable: 8849 · held back: 11856 ·
remote keys: 18920 · PLAN: upload 1679 files (6.74 GB)`.

### Step 2 — Deploy Jubilujah.com to prod

```bash
cd /w/Jubilujah.com && tar \
  --exclude='./.claude' \
  --exclude='./wpf' \
  --exclude='./node_modules' \
  --exclude='*.log' \
  -czf - . | ssh -i "$USERPROFILE/.ssh/id_ed25519_jubilee_prod" -o IdentitiesOnly=yes root@94.72.120.231 \
  "tar -xzf - -C /var/www/Jubilujah.com && pm2 restart jubilujah --update-env && pm2 save"
```

This:
- Tars the local project (excluding session-local `.claude/`, Windows-only `wpf/`, any `node_modules`, logs)
- Streams it over SSH; remote `tar -xzf -` extracts into `/var/www/Jubilujah.com/`
- Restarts the `jubilujah` PM2 process (it'll pick up any changed `server.js` or static files)

### Step 3 — Verify

```bash
ssh -i "$USERPROFILE/.ssh/id_ed25519_jubilee_prod" root@94.72.120.231 \
  'curl -sS -o /dev/null -w "origin:%{http_code} " http://127.0.0.1:3119/ && \
   curl -sS -o /dev/null -w "public:%{http_code}\n" https://www.jubilujah.com/'
```

Both should return `200`. Also spot-check a CDN MP3:

```bash
curl -sS -I 'https://cdn.jubileeverse.com/music/catalog-manifest.json' | head -3
```

Should return `HTTP/2 200` with a recent `last-modified`.

---

## One-shot helper

`w:/Jubilujah.com/deploy/publish.sh` wraps all three steps. Run it from Git Bash:

```bash
bash /w/Jubilujah.com/deploy/publish.sh
```

It will:
0. **Run the manifest gate and refuse to publish if the manifest is stale** (exit 3).
1. Run the CDN sync diff and prompt for `y` before applying if there's anything to upload.
2. **Snapshot prod to `/var/www/.backup/` for rollback**, then deploy.
3. Verify origin + public + CDN URLs.
4. Exit non-zero on any failure.

Flags:

| Flag | Effect |
|------|--------|
| `--site-only` | Skip the CDN sync (quick site redeploy) |
| `--yes` / `-y` | Don't prompt before uploading to R2 |
| `--skip-manifest-check` | Override the Step 0 gate — **not recommended** |
| `--no-backup` | Skip the prod rollback snapshot |

---

## Troubleshooting

**`Permission denied (publickey)` on SSH** — the private key at `%USERPROFILE%\.ssh\id_ed25519_jubilee_prod` (currently `C:\Users\gabriel.inspire\...`) is missing or its public counterpart is no longer in `root@prod:~/.ssh/authorized_keys`. Regenerate and reinstall per the original session.

**`502 Bad Gateway` after deploy** — the Node process didn't come back up. Check:
```bash
ssh -i "$USERPROFILE/.ssh/id_ed25519_jubilee_prod" root@94.72.120.231 \
  "pm2 logs jubilujah --lines 30 --nostream"
```

**R2 upload failures** — see `.claude/r2-sync-failures.txt`. Common cause is a transient network blip; re-run `node .claude/r2-sync-music.js --apply` and only the still-missing files will upload.

**CDN not reflecting a freshly uploaded file** — Cloudflare may have cached a 404. Purge by URL in the Cloudflare dashboard, or via API:
```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/5a4817eed553c36db47e8b7b3390120b/purge_cache" \
  -H "X-Auth-Email: gabe.ungureanu@outlook.com" \
  -H "X-Auth-Key: $CLOUDFLARE_GLOBAL_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{"files":["https://cdn.jubileeverse.com/music/PATH/TO/FILE.mp3"]}'
```

**Need to roll back the site** — as of 2026-07-23 `deploy/publish.sh` snapshots prod automatically
before every deploy (disable with `--no-backup`). To restore the most recent snapshot:

```bash
ssh -i "$USERPROFILE/.ssh/id_ed25519_jubilee_prod" root@94.72.120.231 '
  latest=$(ls -1t /var/www/.backup/Jubilujah.com.*.tgz | head -1);
  echo "restoring $latest";
  tar -xzf "$latest" -C /var/www/Jubilujah.com && pm2 restart jubilujah --update-env'
```

**A deploy ships the working tree, not a commit** — `tar` packs the live directory (minus
`.git`, `.claude`, `node_modules`, `wpf`, logs), so any uncommitted edits go to production.
Run `git status` before publishing and make that a deliberate choice.

---

## Production facts (for reference)

| | |
|---|---|
| Host | `root@94.72.120.231` (hostname `SEAIIS01SERVER`, Ubuntu, nginx 1.24, Node 20.20.0, PM2 6.0.14) |
| Code dir | `/var/www/Jubilujah.com/` |
| Nginx vhost | `/etc/nginx/sites-available/jubilujah.com` |
| Nginx logs | `/var/log/nginx/Jubilujah.com_{access,error}.log` |
| PM2 process | name `jubilujah`, script `/var/www/Jubilujah.com/server.js`, port 3119 |
| PM2 logs | `/root/.pm2/logs/jubilujah-{out,error}.log` |
| Public URL | https://www.jubilujah.com (also responds at apex https://jubilujah.com) |
| CDN bucket | R2 bucket `jubileeverse-cdn`, prefix `music/`, public host `cdn.jubileeverse.com` |
