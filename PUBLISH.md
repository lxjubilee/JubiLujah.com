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

| Thing | Where |
|-------|-------|
| SSH private key for prod | `C:\Users\zariah.inspire\.ssh\id_ed25519_jubilee_prod` |
| Public key installed on | `root@94.72.120.231:~/.ssh/authorized_keys` |
| R2 credentials | `c:\Websites\jubileeverse.com\.env` (`R2_S3_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_CDN`) |
| `@aws-sdk/client-s3` + `@aws-sdk/lib-storage` | `c:\Websites\jubileeverse.com\node_modules\` |
| Sync script | `c:\Websites\jubileeverse.com\.claude\r2-sync-music.js` |
| Nginx vhost | `/etc/nginx/sites-available/jubilujah.com` on prod (proxies `:80` → `127.0.0.1:3119`) |
| PM2 process | `jubilujah` (managed by PM2 on prod, persisted via `pm2 save`) |
| DNS | `www.jubilujah.com` and `jubilujah.com` proxied through Cloudflare (TLS terminates at CF edge) |

---

## The procedure

Run from any working directory. Steps must execute in order; failure at any step stops the publish.

### Step 0 — Pre-publish QA: the catalog manifest MUST be current (MANDATORY GATE)

New albums get added to `J:/music/albums` but the manifest is **not** auto-generated, so it goes stale and silently drops new albums from every page (home + category) and from covers/genres/analytics. **Never publish on a stale manifest.**

```bash
# 1. Is the manifest stale? (dry run — reports "would add: N")
node C:/jubilujah-local/rebuild-manifest.js
```

If it reports **`would add: 0`**, the manifest is current — proceed to Step 1. Otherwise it is STALE; sync it and refresh the derived data:

```bash
# 2. Reconcile the manifest (appends new J: albums; backs up + writes web copy AND J: master)
node C:/jubilujah-local/rebuild-manifest.js --apply

# 3. Re-derive covers + genres for the new albums, then re-bake into the manifest
cd /c/jubilujah-local/web
ARTWORK_BASE=J:/music node scripts/gen-album-covers.mjs
ARTWORK_BASE=J:/music node scripts/gen-album-genres.mjs
ARTWORK_BASE=J:/music node scripts/merge-genres-into-manifest.mjs

# 4. Copy the regenerated data to the canonical W: web copy
cp public/music/catalog-manifest.json public/music/album-covers.json public/music/album-genres.json \
   /w/JubiLujah.com/app/web/public/music/
```

Re-run the dry run (step 1) and confirm `would add: 0` before continuing. (Locally, restart the web dev server — `lib/manifest.ts` caches the manifest in memory.)

### Step 1 — CDN sync (diff first, then apply)

```bash
cd /c/Websites/jubileeverse.com
node .claude/r2-sync-music.js                       # diff-only, surfaces what would upload
node .claude/r2-sync-music.js --apply --concurrency=8   # actually uploads
```

The script:
- Lists all keys under `music/` in the R2 bucket
- Walks `J:/music/` applying the filter from `.claude/r2-upload.filter` (include `albums/**`, `videos/**`, `catalog*.json`, `catalog*.html`, `index*.html`; exclude status reports, desktop.ini, etc.)
- Uploads only files that are missing or size-mismatched
- Sets `Cache-Control: public, max-age=31536000, immutable` for media; `max-age=60` for catalog JSON/HTML
- Writes failures (if any) to `.claude/r2-sync-failures.txt`

Expected: most runs upload a handful of files. First run after a big change can be many GB.

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
1. Run the CDN sync diff and prompt for `y` before applying if there's anything to upload.
2. Deploy to prod.
3. Verify origin + public URL.
4. Exit non-zero on any failure.

To skip the CDN sync (e.g. quick site-only redeploy): `bash deploy/publish.sh --site-only`.

---

## Troubleshooting

**`Permission denied (publickey)` on SSH** — the private key at `C:\Users\zariah.inspire\.ssh\id_ed25519_jubilee_prod` is missing or its public counterpart is no longer in `root@prod:~/.ssh/authorized_keys`. Regenerate and reinstall per the original session.

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

**Need to roll back the site** — the prior code is not snapshotted automatically. If you need rollback, before deploying tar the current `/var/www/Jubilujah.com` into `/var/www/.backup/Jubilujah.com.$(date +%Y%m%d-%H%M%S).tgz` first.

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
