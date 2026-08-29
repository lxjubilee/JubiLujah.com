# Publish JubileePraise.com — Runbook

**When the user says "Publish JubileePraise.com", execute this procedure end-to-end.**

This document is the source of truth. When the procedure changes, update this file.

---

> ## 🔴 Corrected 2026-08-27 — read this before following any path below
>
> **The JubiLujah → JubileePraise rename rewrote this file's *verified production facts* into
> names that do not exist.** The facts in the tables below were probed against the live host on
> 2026-08-14, when the site was JubiLujah; the rename then rewrote them wholesale. Anyone
> following the uncorrected text would have deployed into nothing.
>
> **Production is, and remains:**
>
> | | Live value (re-verified 2026-08-27) |
> |---|---|
> | Code dir | `/var/www/jubilujah.com` — `/var/www/jubileepraise.com` **does not exist** |
> | PM2 | `jubilujah-web` (:3030) · `jubilujah-api` (:4030) — both `online` |
> | Domain | `www.jubilujah.com` (200) · `jubilujah.com` (301 → www) |
> | CDN | `cd.jubilujah.com` (200) — deliberately never renamed; no DNS for a jubileepraise CDN |
>
> Per **D-2026-08-27-9** the rebrand deploys *into* that existing deployment — same server, path,
> process and domain. The server names are **not** renamed; the rebranded code is what ships into
> them. All live references in this file have been corrected. The only `jubileepraise` server paths
> left are inside "Standing up the parallel site", which is **superseded** and kept as history.
>
> **Two further corrections, both found by running the procedure:**
>
> 1. **Step 0 does NOT require the `J:` junction.** `J:/jubileepraise.com/` is real but **empty**;
>    the ~41 GB master still lives at `J:/jubilujah.com/music/`. The junction was recorded as a
>    blocker, but `check-manifest.mjs` takes `--music=`, which resolves it with no file moves and
>    no server-side `mklink`:
>    ```bash
>    node deploy/check-manifest.mjs --music=J:/jubilujah.com/music \
>         --manifest=app/web/public/music/catalog-manifest.json
>    ```
>    Run this way on 2026-08-27: **1,464 albums on disk · 1,071 in manifest · would add: 0** —
>    the gate passes; the 142 held folders are subtracted as designed.
>
> 2. **Step 1 says the live CDN credentials "are not set anywhere". They exist — on prod.**
>    `/var/www/jubilujah.com/.env` defines `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` and
>    `R2_SECRET_ACCESS_KEY` (names only were read; values were not). They are simply absent from
>    the workstation, which is why the sync cannot run *here*. Retrieving production secrets to a
>    workstation is a Founder decision and was **not** done. The `R2_AVATARS_*` token remains
>    scoped to `jubileeverse-cdn` and still must never be pointed at the music bucket.



---

## What this does

1. **CDN sync** — incremental upload of `J:/jubileepraise.com/music/` → the Cloudflare R2 bucket behind **`cd.jubilujah.com`**. Only missing or size-mismatched files are uploaded; nothing on R2 is ever deleted by this flow. **Currently blocked — no credentials for that bucket exist on this machine; see Step 1.** Usually skippable (`--site-only`).
2. **Catalog publish** — back up the prod manifest, ship the reconciled web copy to `root@94.72.120.231:/var/www/jubilujah.com/web/public/music/catalog-manifest.json`, restart the **`jubilujah-web`** PM2 process (Next.js, **:3030**). See Step 2 — the old "tar the working tree and restart `jubileepraise` on 3119" was wrong on every count.
3. **Verify** — hit the origin on :3030, the live site, and a CDN asset; confirm 200s and check the album count moved.

---

## Prerequisites (one-time setup, already done)

> **Corrected 2026-07-23.** The paths below were stale — `C:\Websites\jubileeverse.com\` and
> `C:\jubileepraise-local\` do not exist on this machine, so the documented flow could not run at all.
> Verified-working locations are now recorded here.

| Thing | Where |
|-------|-------|
| SSH private key for prod | `%USERPROFILE%\.ssh\id_ed25519_jubilee_prod` — currently `C:\Users\gabriel.inspire\...` (the runbook previously named `zariah.inspire`; scripts use `$USERPROFILE`, so they work either way) |
| Public key installed on | `root@94.72.120.231:~/.ssh/authorized_keys` |
| R2 credentials | `W:\JubileeInspire.com\api\.env` — `R2_AVATARS_ENDPOINT / _BUCKET / _ACCESS_KEY_ID / _SECRET_ACCESS_KEY`. The sync script auto-loads this file and accepts the `R2_AVATARS_*` names. **This token is scoped to `jubileeverse-cdn` only.** No secrets live in this repo. |
| `@aws-sdk/client-s3` | Not installed at this repo root. `deploy/publish.sh` auto-detects it, currently resolving to `W:\JubileeInspire.com\api\node_modules`. To make this repo self-contained: `npm install @aws-sdk/client-s3 @aws-sdk/lib-storage` |
| Sync script | `W:\JubileePraise.com\_r2-sync-music-inspire.js` (in-repo; supports `--src= --prefix= --bucket= --env=`) |
| Manifest gate | `W:\JubileePraise.com\deploy\check-manifest.mjs` (read-only staleness check) |
| Nginx vhost | **Two** vhosts, both proxying to `127.0.0.1:3030` (web) and `127.0.0.1:4030` (api) — **not** 3119, which is JubileeVibes:<br>`/etc/nginx/sites-available/jubilujah.com` — `jubilujah.com` (301 → www) + `www.jubilujah.com`<br>`/etc/nginx/sites-available/jubileepraise.com` — `jubileepraise.com` (301 → www) + `www.jubileepraise.com` *(added 2026-08-28)* |
| PM2 processes | **`jubilujah-web`** (Next.js, cwd `/var/www/jubilujah.com/web`, :3030) and **`jubilujah-api`** (`/var/www/jubilujah.com/api/src/index.js`, :4030). Persisted via `pm2 save`. There is no process named `jubileepraise`. |
| Prod code dir | `/var/www/jubilujah.com` — **lowercase**, and **not a git checkout** (`no .git`) |
| DNS | `www.jubileepraise.com` and `jubileepraise.com` proxied through Cloudflare (TLS terminates at CF edge) |

---

## The procedure

Run from any working directory. Steps must execute in order; failure at any step stops the publish.

### Step 0 — Pre-publish QA: the catalog manifest MUST be current (MANDATORY GATE)

New albums get added under `J:/jubileepraise.com/music/` but the manifest is **not** auto-generated, so it goes stale and silently drops new albums from every page (home + category) and from covers/genres/analytics. **Never publish on a stale manifest.**

```bash
# 1. Is the manifest stale? (read-only — reports "would add: N")
node deploy/check-manifest.mjs          # exit 0 = current · exit 3 = STALE
node deploy/check-manifest.mjs --list   # every missing album path
```

If it reports **`would add: 0`**, the manifest is current — proceed to Step 1.
`deploy/publish.sh` runs this gate automatically and **refuses to publish** on exit 3.

> **✅ RESOLVED 2026-08-14 — the reconciler now exists: `deploy/rebuild-manifest.mjs`.**
>
> ```bash
> node deploy/rebuild-manifest.mjs                 # dry run (J: master)
> node deploy/rebuild-manifest.mjs --apply
> node deploy/rebuild-manifest.mjs --apply \
>      --manifest=app/web/public/music/catalog-manifest.json \
>      --out=app/web/public/music/catalog-manifest.json --prefix=albums/
> ```
>
> **It is ADD-ONLY, deliberately.** Large parts of the manifest are curated and cannot be
> regenerated from disk — album titles (`AMIM1002EN-bridge-forever` → "Cedars of Praise"),
> track titles (`01_love-was-looking-at-me.mp3` → "Open the Window"), category assignment
> (`radiant-stones` sits under `faith-based/` on disk but belongs to category `inspire`),
> `christmas: true`, and per-album `genres`. A regenerate-from-scratch tool would destroy all
> of it. New albums are placed by looking up their parent directory in the mapping the
> existing manifest already demonstrates; anything without precedent is reported, never guessed.
>
> **⚠ The old "949 albums missing / half the catalog invisible" alarm was a counting artifact.**
> It walked a fixed `albums/<category>/<artist>/<album>` shape that does not exist on disk and
> compared by path. Measured correctly on 2026-08-14: **1,373 album folders on disk, 982 in the
> manifest — but only 89 were genuinely addable.** Of the rest, **163 are the same album at a
> second disk path** (e.g. `children/party-giggles/IX401EN-…` *and* `party-giggles/IX401EN-…`);
> album *code* is the site's identity (`albumUuid`, `getAlbumByCode`), so adding the twin would
> create a phantom duplicate. **142 are held pending a curation decision** — see
> `deploy/manifest-hold.json`.
>
> Edge cases the reconciler handles: duplicate track numbers within one album (`TTX301` has two
> `01_*.mp3` — preserved and reported, because the live manifest already contains them), `.mp3`s
> misfiled under `lyrics/`, album folders at depth 1–3, and the nested `nations/romanian` category.

**Holds.** `deploy/manifest-hold.json` records folders knowingly kept out, with reasons, and
`check-manifest.mjs` subtracts them so the gate keeps its meaning — anything missing that is
*not* held is an accident and blocks the publish. Currently held: **`prayers/` (140)** and
**`hebrew/` (1)**, both of which would create a brand-new public category and need a Founder
decision on key + label; and **`faith-based/ron-tank` (1)**, a disk anomaly (a `tracks/` folder
sitting at artist level) rather than an album.

After reconciling, re-derive the dependent data (these scripts **moved into this repo**):

```bash
cd /w/JubileePraise.com/app/web
ARTWORK_BASE=J:/jubileepraise.com/music node scripts/gen-album-covers.mjs
ARTWORK_BASE=J:/jubileepraise.com/music node scripts/gen-album-genres.mjs
ARTWORK_BASE=J:/jubileepraise.com/music node scripts/merge-genres-into-manifest.mjs
```

**The two manifests are NOT byte-identical, and that is intentional** (the earlier note here was
wrong). `J:/jubileepraise.com/music/catalog-manifest.json` stores paths as `inspire/…`; the bundled
web copy at `app/web/public/music/catalog-manifest.json` stores them as `albums/inspire/…`.
`lib/cdn.ts` strips the `albums/` prefix when building CDN urls and keeps it for the local-disk
fallback. **Run the reconciler twice — once per file, with `--prefix=albums/` on the web copy.**
Re-run the check against both and confirm `would add: 0`. (Locally, restart the web dev server —
`lib/manifest.ts` caches the manifest in memory.)

### Step 1 — CDN sync (diff first, then apply)

> **🔴 CORRECTED 2026-08-14 — the target below was wrong and would have uploaded ~6.7 GB to a
> bucket the site does not read.**
>
> The "settled 2026-07-23" claim (`cdn.jubileeverse.com`, 131 references, bucket
> `jubileeverse-cdn`, source `J:/music`) is wrong on every count today:
>
> | Claim | Reality (verified by live probe, 2026-08-14) |
> |---|---|
> | site references `cdn.jubileeverse.com` 131× | **7 references total**, and `lib/cdn.ts` defaults to **`cd.jubilujah.com`** |
> | live bucket is `jubileeverse-cdn` | `https://cd.jubilujah.com/music/…` → **200**. `https://cdn.jubileeverse.com/music/…` → **404** |
> | source tree `J:/music` | **does not exist.** Real root is `J:/jubileepraise.com/music` |
>
> **The live CDN host is `cd.jubilujah.com`.** `_r2-sync-music-inspire.js`'s own defaults were
> right all along (`--src=J:/jubileepraise.com/music/inspire`, `--prefix=music/inspire/`, bucket from
> `R2_BUCKET_CDN`).
>
> **⚠ BLOCKER: there are no credentials for the live bucket on this machine.** The only R2 creds
> present are `R2_AVATARS_*` in `W:/JubileeInspire.com/api/.env`, and that token is scoped to
> `jubileeverse-cdn` only. `R2_BUCKET_CDN` / `R2_S3_ENDPOINT` for `cd.jubilujah.com` are not set
> anywhere. **Until those exist, Step 1 cannot run correctly — and must not be run with the
> avatars token, which would push gigabytes into the wrong bucket at real cost and zero effect.**
>
> **Step 1 is usually unnecessary anyway.** Spot-checked 2026-08-14: albums that were missing from
> the manifest already have their audio and artwork live on `cd.jubilujah.com`. The manifest, not
> the CDN, is what hides a catalog. Run Step 0 + Step 2 (`--site-only`) and Step 1 only when a
> genuinely new render has to reach the CDN.

Once `R2_BUCKET_CDN` and `R2_S3_ENDPOINT` for `cd.jubilujah.com` are configured:

```bash
cd /w/JubileePraise.com
export NODE_PATH=/w/JubileeInspire.com/api/node_modules   # @aws-sdk/client-s3 lives here

# diff-only — surfaces what would upload
node _r2-sync-music-inspire.js --src=J:/jubileepraise.com/music --prefix=music/ --bucket=<live-bucket>

# actually uploads
node _r2-sync-music-inspire.js --src=J:/jubileepraise.com/music --prefix=music/ --bucket=<live-bucket> \
     --apply --concurrency=8
```

**Verify an album is actually published before marking it playable.** `rebuild-manifest.mjs` sets
`playable` from files on disk, which is not the same as files on the CDN. On 2026-08-14 exactly one
newly surfaced album (`AMIM1040HI`) had audio on disk but nothing on the CDN; it was demoted to
`playable: 0` with `cdnPending: true` so it shows as a studio draft instead of a player that 404s.
Clear that flag when its audio is uploaded.

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

### Step 2 — Deploy JubileePraise.com to prod

> **🔴 REWRITTEN 2026-08-14 — every fact in the previous Step 2 was wrong, and running it would
> have failed or corrupted production.** Verified against the live host:
>
> | Previously documented | Reality on `root@94.72.120.231` |
> |---|---|
> | deploy target `/var/www/JubileePraise.com/` | **does not exist.** It is `/var/www/jubilujah.com` (lowercase) |
> | PM2 process `jubileepraise`, script `server.js` | **no such process.** Two processes: **`jubilujah-web`** (Next.js, cwd `/var/www/jubilujah.com/web`) and **`jubilujah-api`** (`api/src/index.js`) |
> | port 3119 | 3119 is **JubileeVibes**, a different site. nginx proxies jubileepraise to **:3030** (web) and **:4030** (api) |
> | "tar the working tree, restart, done" | prod runs a **built** Next.js app, and the local layout (`app/web`, `app/api`) does not match prod (`web`, `api`). Dumping raw source over it breaks the build. |
>
> **Do not tar-and-ship the working tree.** Prod is not a checkout (`no .git`) and is not a static
> `server.js` site. A full source deploy needs a real build/release procedure that does not exist
> in this repo yet — writing one is open work, not something to improvise during a publish.

**What a catalog publish actually needs is one file.** The manifest is read at runtime by
`lib/manifest.ts` (`fs.readFileSync` + in-memory cache), so surfacing new albums is a file copy plus
a restart — no rebuild:

```bash
KEY="$USERPROFILE/.ssh/id_ed25519_jubilee_prod"
SSH="ssh -i $KEY -o IdentitiesOnly=yes"
REMOTE=/var/www/jubilujah.com/web/public/music/catalog-manifest.json

# 1. back up what is live
$SSH root@94.72.120.231 "cp -p $REMOTE ${REMOTE}.bak-\$(date +%Y%m%d-%H%M%S)"

# 2. ship the reconciled web copy (the albums/-prefixed one)
scp -i "$KEY" -o IdentitiesOnly=yes \
    app/web/public/music/catalog-manifest.json root@94.72.120.231:$REMOTE

# 3. restart the web process so the in-memory manifest cache is dropped
$SSH root@94.72.120.231 "pm2 restart jubilujah-web --update-env && pm2 save"
```

**Rollback** is the reverse copy from the newest `.bak-*` beside it, then the same restart.

Applied this way on 2026-08-14: prod went from **983 albums (generated 2026-07-07)** to **1,071**,
surfacing 88 albums that had been invisible — including the three new Jubilee crusade albums, each
verified live at `https://www.jubileepraise.com/album?c=…`.

### Step 2b — Full site release (build + ship) — **the gap is CLOSED**

> **✅ RESOLVED 2026-08-27. Step 2 above ships one file and cannot put code changes live.**
> The "a real build/release procedure does not exist in this repo yet" warning is now obsolete:
> the procedure below was written **and executed successfully** against production on 2026-08-27,
> putting the JubileePraise rebrand live. It is no longer improvisation — it has been run once,
> end to end, with a verified rollback path.

**When you need it:** any change to code, components, routes, styles or bundled content.
Step 2 alone is enough *only* when `catalog-manifest.json` is the sole thing that changed.

**Why it is small.** Prod already has `node_modules` and the identical Next version
(`14.2.33` both sides — **check this first; a mismatch means you must ship `node_modules` too**).

> ⚠ **Prod's `node_modules` is at `/var/www/jubilujah.com/node_modules`, NOT `web/node_modules`** —
> it is hoisted one level above the Next project root. `web/node_modules` **does not exist**, so the
> obvious version check fails with `MODULE_NOT_FOUND` and reads like a broken deploy. PM2 launches
> `/var/www/jubilujah.com/node_modules/next/dist/bin/next start -p 3030` with cwd
> `/var/www/jubilujah.com/web`. Correct check:
> ```bash
> node -e 'console.log(require("/var/www/jubilujah.com/node_modules/next/package.json").version)'
> ```
`next start` needs only `.next` + `public` + `package.json` + `next.config.mjs`. And `.next/cache`
is build-only: excluding it takes the payload from **252 MB to 14 MB**.

**Only `public/` files that actually changed are shipped, and nothing is ever deleted.**
Prod's `public/` (295 MB) is *larger* than the repo's (266 MB) — it holds files this repo does not.
A mirroring `rsync --delete` would destroy them. Overlay with `cp -a`, never sync.

```bash
cd /w/JubileePraise.com
TS=$(date +%Y%m%d-%H%M%S)
KEY="$USERPROFILE/.ssh/id_ed25519_jubilee_prod"; SSH="ssh -i $KEY -o IdentitiesOnly=yes"
PROD=root@94.72.120.231; WEB=/var/www/jubilujah.com/web

# 0. gates — all three must pass before building
node tools/check-tenants.mjs
node app/node_modules/typescript/bin/tsc --noEmit -p app/web/tsconfig.json
node deploy/check-manifest.mjs --music=J:/jubilujah.com/music \
     --manifest=app/web/public/music/catalog-manifest.json    # expect "would add: 0"

# 1. build
cd app/web && NODE_ENV=production ../node_modules/.bin/next build && cd /w/JubileePraise.com

# 2. package .next (no cache) + ONLY the changed public files (see `git status -- app/web/public`)
cd app/web
tar czf /w/.claude-scratch/release-$TS.tgz --exclude='.next/cache' .next \
  public/articles/articles.json public/backstage/backstage.json \
  public/music/album-covers.json public/music/catalog-manifest.json \
  public/music/cover-versions.json public/music/album-support.json \
  public/angels public/audio public/images/slider public/zev-circle.png
cd /w/JubileePraise.com

# 3. BACK UP prod first — .next AND every public file about to be overwritten
$SSH $PROD "cd $WEB && mkdir -p /var/www/.backup && cp -a .next .next.bak-$TS && \
  tar czf /var/www/.backup/jubilujah-public-$TS.tgz public/articles/articles.json \
    public/backstage/backstage.json public/music/album-covers.json \
    public/music/catalog-manifest.json public/music/cover-versions.json public/images/slider && \
  cp -p public/music/album-support.json /var/www/.backup/album-support.json.bak-$TS"

# 4. ship, stage, swap (staging keeps downtime to one mv, and never merges two builds)
scp -i "$KEY" -o IdentitiesOnly=yes /w/.claude-scratch/release-$TS.tgz $PROD:/tmp/
$SSH $PROD "set -e; rm -rf /tmp/rel-$TS && mkdir -p /tmp/rel-$TS && \
  tar xzf /tmp/release-$TS.tgz -C /tmp/rel-$TS && cd $WEB && \
  mv /tmp/rel-$TS/.next .next.incoming && rm -rf .next && mv .next.incoming .next && \
  cp -a /tmp/rel-$TS/public/. public/ && pm2 restart jubilujah-web --update-env"
```

> **Never extract `.next` on top of the old one.** Two builds share a directory but not a
> `BUILD_ID`; stale chunks then 404 at runtime. Swap the whole directory, as above.

**Then verify (Step 3), and roll back immediately if it fails:**

```bash
$SSH $PROD "cd $WEB && rm -rf .next && mv .next.bak-$TS .next && \
  tar xzf /var/www/.backup/jubilujah-public-$TS.tgz && \
  cp -p /var/www/.backup/album-support.json.bak-$TS public/music/album-support.json && \
  pm2 restart jubilujah-web --update-env"
```

**`package.json` is deliberately NOT shipped.** The repo's differs from prod's only in `name`
/`description` (`jubilujah-web` → `jubileepraise-web`); both are cosmetic, the PM2 process name is
set independently, and overwriting risks clobbering prod-specific config for no user-visible gain.

**Result of the 2026-08-27 run:** `BUILD_ID _2YyXA8MTM9fv55SBxWIZ → y03bofLgbOKhp2TkT7ozj`,
routes **59 → 67**, `<title>JubileePraise.com — Feel the Spirit Move</title>` live. All 46
previously-existing static routes re-probed: **zero regressions**. Two *new* routes — `/membership`
and `/book` — return **500** (`useJubileeAccount must be used inside <JubileeAccountProvider>`);
they are unlinked Torah Sings tenant pages that never worked, not a regression. See Troubleshooting.


### Step 3 — Verify

```bash
ssh -i "$USERPROFILE/.ssh/id_ed25519_jubilee_prod" root@94.72.120.231 \
  'curl -sS -o /dev/null -w "origin:%{http_code}\n" http://127.0.0.1:3030/'
curl -sS -o /dev/null -w "public:%{http_code}\n" https://www.jubileepraise.com/
```

Both should return `200`. Then confirm the catalog actually moved — this is the check that
matters, because a healthy 200 proves nothing about whether the manifest landed:

```bash
ssh -i "$USERPROFILE/.ssh/id_ed25519_jubilee_prod" root@94.72.120.231 \
  'node -e "const m=require(\"/var/www/jubilujah.com/web/public/music/catalog-manifest.json\");
            let n=0; for(const c of m.categories||[]) for(const a of c.artists||[]) n+=(a.albums||[]).length;
            console.log(m.generated, n+\" albums\");"'

# and spot-check a newly surfaced album end-to-end
curl -sS -o /dev/null -w "album:%{http_code}\n" 'https://www.jubileepraise.com/album?c=JEIM1082EN'
```

Spot-check a CDN asset on the **live** host (`cd.jubilujah.com` — `cdn.jubileeverse.com` 404s for music):

```bash
curl -sS -I 'https://cd.jubilujah.com/music/inspire/jubilee-inspire/JEIM1001EN-sky-splits-open/artwork/JEIM1001EN.png' | head -3
```

Should return `HTTP/2 200`.

---

## Activating jubileepraise.com (started 2026-08-28)

> **Founder decision, 2026-08-28: BOTH domains live; `jubilujah.com` stays canonical.**
> `jubileepraise.com` serves the same app, on the same box, port and PM2 process. The HTML
> `<link rel="canonical">`, `og:url` and `sitemap.xml` continue to point at `jubilujah.com`.
> **No rebuild is required**, which is what makes this a small change — see the SEO note below
> for what a *full* cutover would additionally need.

### Done on the server (2026-08-28) — origin is ready, DNS is not

**1. Origin TLS certificate.** The house pattern on this host is a **self-signed** origin cert
per domain in `/etc/ssl/cloudflare/`, with SANs for apex + www (verified against
`jubilujah.com`, `cornellkay.com`, `beforedenominations.com` — all `subject == issuer`). That
implies the Cloudflare SSL mode is **Full**, not Full (strict). Created to match:

```bash
cd /etc/ssl/cloudflare
openssl req -x509 -nodes -newkey rsa:2048 -days 3650   -keyout jubileepraise.com.key -out jubileepraise.com.crt   -subj "/CN=jubileepraise.com"   -addext "subjectAltName=DNS:jubileepraise.com,DNS:www.jubileepraise.com"
chmod 600 jubileepraise.com.key; chmod 644 jubileepraise.com.crt
```

**2. Nginx vhost** `/etc/nginx/sites-available/jubileepraise.com`, symlinked into `sites-enabled`.
It is a copy of the `jubilujah.com` vhost with the names and cert paths swapped: apex 301s to www,
www proxies `/api/` → `:4030` and `/` → `:3030`. `nginx -t` passed, `systemctl reload nginx` applied.

> ⚠ **This host serves ~100 sites off one nginx.** Always `nginx -t` before reloading, and remove
> the symlink again if it fails — a bad vhost takes every site down, not just this one.

**3. Verified without DNS.** Because `--resolve` bypasses name resolution, the origin can be proved
correct *before* any record exists. This is the check to run after any vhost change here:

```bash
curl -sS -k -o /dev/null -w "%{http_code} %{redirect_url}
"   --resolve jubileepraise.com:443:94.72.120.231 https://jubileepraise.com/       # 301 -> www
curl -sS -k -o /dev/null -w "%{http_code}
"   --resolve www.jubileepraise.com:443:94.72.120.231 https://www.jubileepraise.com/  # 200
```

Result on 2026-08-28: **301 → `https://www.jubileepraise.com/`** and **200**, serving
`<title>JubileePraise.com — Feel the Spirit Move</title>`, `og:site_name` `JubileePraise.com`,
and `/album?c=JEIM1069EN` → **200** (so tenant resolution and the manifest both work on the new
host). `www.jubilujah.com` 200, apex 301 and `cd.jubilujah.com` 200 were all re-probed after the
reload: **zero regressions**.

### ✅ DNS — DONE 2026-08-28, the site is LIVE

**`https://www.jubileepraise.com` is live and serving.** The Founder added the two records in the
Cloudflare dashboard on 2026-08-28; no API token was ever available on the workstation (see below).
The records now in the `jubileepraise.com` zone:

| Type | Name | Content | Proxy | TTL |
|---|---|---|---|---|
| `A` | `@` (`jubileepraise.com`) | `94.72.120.231` | **Proxied** (orange) | Auto |
| `A` | `www` | `94.72.120.231` | **Proxied** (orange) | Auto |

The zone's **SSL/TLS mode must stay `Full`** (not `Full (strict)`) — the origin cert is
self-signed, exactly like every other site on this box, and `Full (strict)` would 526.

**Verified live 2026-08-28**, immediately after the records were added:
`https://jubileepraise.com/` → **301** → `https://www.jubileepraise.com/` → **200**, serving
`<title>JubileePraise.com — Feel the Spirit Move</title>`. Twelve routes probed on **both**
domains — `/`, `/inspire`, `/children`, `/faith-based`, `/general`, `/playlists`, `/backstage`,
`/privacy`, `/terms`, `/album?c=JEIM1069EN`, `/artist/jubilee-inspire`, `/sitemap.xml` — **all 200**.

> ⚠ **Public resolvers lag by up to 30 minutes.** Right after adding the records, `1.1.1.1` still
> returned `NO RECORD` — the zone's SOA sets a 1800 s negative-cache TTL, so the *absence* was
> cached. Query the authoritative nameserver to confirm immediately, and don't mistake a cached
> negative for a failed change:
> ```bash
> nslookup jubileepraise.com denver.ns.cloudflare.com
> ```

**No Cloudflare API credentials exist on this workstation** and none were found on the VPS. `.env`
has `ZONEID_API` / `ACCOUNTID_API` but no token, and the `$CLOUDFLARE_GLOBAL_API_KEY` the
Troubleshooting purge example expects is unset. **DNS work here is dashboard work**, unless someone
provisions a scoped `Zone → DNS → Edit` token. Note also that a VPS password or SSH key does *not*
help: Cloudflare is a separate control plane, and the records do not live on the server.

Do **not** add a `cd.jubileepraise.com` record. Media deliberately stays on `cd.jubilujah.com`;
see D-2026-08-27-3…-6.

### ✅ FIXED 2026-08-28 — `robots.txt` pointed at localhost

Live right now on production:

```
$ curl -s https://www.jubilujah.com/robots.txt
...
Sitemap: http://localhost:3000/sitemap.xml
```

**Search engines cannot discover the sitemap at all.** Cause: `app/web/app/robots.ts` reads
`process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'`, and that variable was **not set in
the build environment** for the 2026-08-27 release. `robots.txt` is statically prerendered, so it
baked in the localhost fallback. `sitemap.ts` uses the identical expression but is *dynamic*
(it calls `listArtists()` / `backstageSlugs()`), so it reads prod's runtime `.env` and correctly
emits `https://jubilujah.com`. `og:url` is likewise correct on every page probed.

**The fix required a rebuild** — a `pm2 restart` cannot change a prerendered file. Done
2026-08-28 via Step 2b:

```bash
cd app/web && NODE_ENV=production NEXT_PUBLIC_SITE_URL=https://jubilujah.com   ../node_modules/.bin/next build
```

`BUILD_ID y03bofLgbOKhp2TkT7ozj → WGNANpoNycDYGJjhw519V`. Production robots.txt now reads
`Sitemap: https://jubilujah.com/sitemap.xml`, matching what `sitemap.ts` emits at runtime.

**The release shipped `.next` only — 3.6 MB.** Nothing under `public/` had changed since the
2026-08-27 release, so the public-overlay half of Step 2b was correctly skipped. Verify with
`git status --porcelain -- app/web/public` before packaging; if it is empty, ship `.next` alone.

> ⚠ **`app/web/.env.local` is loaded by `next build` and its values are inlined.** It sets
> `NEXT_PUBLIC_API_BASE=http://localhost:4000`, which therefore lands in every production build.
> It is **harmless today** only because `lib/api.ts:25` gates it behind
> `process.env.NODE_ENV === 'development' ? … : ''`, so production uses relative URLs. But the
> server-side redirector routes (`app/r/[token]`, `app/rp/[token]`, `app/qr/[file]`) fall back to
> that same inlined value, and they rely on `REDIRECTOR_API_BASE` being set in prod's `.env` to
> override it — prod's API is on **:4030**, not :4000. **Do not remove that override without
> checking the redirector.** Flagged 2026-08-28, not changed.

### If the decision later changes to a full cutover

Making `jubileepraise.com` the canonical brand is **not** a DNS change. `NEXT_PUBLIC_SITE_URL`
drives canonical, `og:url`, `robots.txt` and `sitemap.xml`, so a full cutover needs:

1. `NEXT_PUBLIC_SITE_URL=https://www.jubileepraise.com` in prod's `/var/www/jubilujah.com/.env`
   **and in the build environment**, then a full **Step 2b** rebuild+release.
2. Flip the `jubilujah.com` vhost from serving to `return 301 https://www.jubileepraise.com$request_uri`.
3. Drop `jubilujah.com` / `www.jubilujah.com` from `hosts` in `tenants/jubileepraise.com.json` and
   `app/web/lib/tenants.ts` — they are documented there as deliberate and removable at exactly this point.
4. Leave `cd.jubilujah.com` alone regardless.

Until then, two domains serve identical content and the old one is canonical — which is correct
and intended, not an oversight.

---

## Standing up the parallel site (JubileePraise cutover)

> **⛔ SUPERSEDED the same day, 2026-08-27, by a Founder decision to deploy the rebrand to the
> SAME location and credentials as JubiLujah.com** — the existing `/var/www/jubilujah.com`,
> `jubilujah-web`/`-api`, and the `www.jubilujah.com` domain. No parallel site is being built, and
> `deploy/publish.sh` now targets the live jubilujah deployment. **Steps 2, 3 and 4 below no longer
> apply.** Kept because step 1 (the J: junction) is still required and still outstanding, step 5 is
> still the blocking gap, and because a reversed decision is recorded, not deleted.
>
> Under the new decision the tenant answers to **both** domains: `jubilujah.com` and
> `www.jubilujah.com` were added back to the JubileePraise tenant's `hosts` in
> `app/web/lib/tenants.ts` and `tenants/jubileepraise.com.json`, so the rebranded site serves at
> the old domain by intent rather than by falling through to `DEFAULT_TENANT`.

> **Status 2026-08-27: NOT DONE. Nothing in this section has been run, and none of it has been
> verified against the host** — the rebrand session had no SSH key on the machine, so every fact
> below is derived from "Production facts" and from the existing jubilujah deployment, not from a
> live probe. Treat it as a plan to check, not a procedure that is known to work.

The shape originally chosen was **a parallel site, then a DNS switch**: bring `jubileepraise.com`
up alongside the running `jubilujah.com` deployment, verify it on its own port, and only then move
DNS. Rollback would have been "leave DNS alone".

**1. The music master (blocks Step 0 of every publish).** `J:` is the network share
`\\HDC-INSPIRESERVER\JubileeVerse`, so a junction cannot be made from a client — Windows returns
*"Local NTFS volumes are required"*. It has to be created **on the file server**, where the share
is local at `D:\Shares\JubileeVerse`:

```cmd
mklink /J "D:\Shares\JubileeVerse\jubileepraise.com\music" "D:\Shares\JubileeVerse\jubilujah.com\music"
```

Until that exists, `node deploy/check-manifest.mjs` exits 2 with `manifest not found`, and the
publish cannot start. Removing it later is `rmdir` on the link (which does **not** touch the
target). ⚠️ **A junction means the two workspaces share one tree**: anything that writes under
`J:\jubileepraise.com\music\` — the reconciler's `catalog-manifest.json`, the CDN sync — writes
into JubiLujah's 41 GB master. That is inherent to not copying it.

**2. DNS.** `jubileepraise.com` and `www` (and `api`, if the API moves too) at Cloudflare, proxied,
pointing at `94.72.120.231`. Confirmed absent on 2026-08-27: both return `NO RECORD`, while
`jubilujah.com`, `www.jubilujah.com` and `cd.jubilujah.com` all resolve to Cloudflare.

**3. Ports.** `:3030`/`:4030` are the running jubilujah processes and `:3119` is JubileeVibes, so
the parallel site needs its own pair. `publish.sh` defaults to `WEB_PORT=3031`; **confirm with
`ss -lntp` before using it** — that number was picked, not observed.

**4. Server-side, on `root@94.72.120.231`:** create `/var/www/jubileepraise.com` (lowercase, not a
git checkout), an nginx vhost at `/etc/nginx/sites-available/jubileepraise.com` proxying to the
ports from step 3, an origin TLS cert, and PM2 processes `jubileepraise-web` / `jubileepraise-api`
persisted with `pm2 save`.

**5. The build/release procedure that still does not exist.** This is the real gap, and it is
unchanged by the rebrand: prod runs a **built** Next.js app laid out as `web/` + `api/`, while this
repo is `app/web` + `app/api`. There is no script here that builds and ships that, and Step 2
refuses to improvise one. Writing it is open work. Until it exists, the only thing that can be
published to a live site is the catalog manifest.

**6. Then, and only then, the DNS switch** — and note the rebrand deliberately left
`cd.jubilujah.com` alone, so the CDN keeps serving media throughout and is not part of this cutover.

---

## One-shot helper

`w:/JubileePraise.com/deploy/publish.sh` wraps all three steps. Run it from Git Bash:

```bash
bash /w/JubileePraise.com/deploy/publish.sh
```

It will:
0. **Run the manifest gate and refuse to publish if the manifest is stale** (exit 3).
1. Run the CDN sync diff and prompt for `y` before applying if there's anything to upload.
2. **Preflight the target and refuse to publish if it is not there** (exit 4) — checks the prod
   directory, the live manifest and the `jubilujah-web` process all exist. Then backs up the
   live manifest beside itself, ships the reconciled web copy, and restarts the web process.
3. Verify the origin and re-read the deployed manifest's album count. The public host and the CDN
   are reported but **not** fatal, because `www.jubileepraise.com` has no DNS yet.
4. Exit non-zero on any failure.

> **🔴 CORRECTED 2026-08-27 — until today this script did not implement the Step 2 above.** It
> still carried the pre-2026-08-14 procedure that Step 2 was rewritten to replace: it tarred the
> working tree over `/var/www/JubileePraise.com` (capitalised, does not exist), restarted a bare
> `jubileepraise` process (does not exist), and verified `127.0.0.1:3119` (JubileeVibes) and
> `cdn.jubileeverse.com` (404s for music). The prose here was fixed on 2026-08-14; the script was
> not, so for two weeks the documented one-shot helper would have dumped raw source onto a
> production path. It now does the one-file catalog publish this document describes, and refuses
> to attempt a source deploy at all.

Flags:

| Flag | Effect |
|------|--------|
| `--site-only` | Skip the CDN sync (quick site redeploy) |
| `--yes` / `-y` | Don't prompt before uploading to R2 |
| `--skip-manifest-check` | Override the Step 0 gate — **not recommended** |
| `--no-backup` | Skip the prod rollback snapshot |

---

## Troubleshooting

**`/membership` and `/book` return 500 — `useJubileeAccount must be used inside
<JubileeAccountProvider>`.** Known, pre-existing, and **not** caused by a deploy. Both are
**Torah Sings** tenant pages (the uncommitted fourth-tenant work). They render
`components/torahsings/*` which call `useJubileeAccount()`, but the provider is mounted only by
`components/torahsings/TorahSingsShell.tsx`, and neither page is wrapped in that shell — so the
hook throws during SSR. The pages have therefore never worked in any build; the 2026-08-27 release
merely made the routes reachable (they 404'd before, because they did not exist).

- **Blast radius is small:** nothing links to either page — `grep -rn "href=[\"'](/membership|/book)"`
  over `app/web/components` and `app/web/app` returns nothing. They are reachable only by typing
  the URL, and they are Torah Sings content sitting on the music tenant, which is its own problem.
- **The fix** is to wrap both pages in `TorahSingsShell` (or mount `JubileeAccountProvider` in a
  layout that covers them), then re-run Step 2b. It is a **code** fix in unfinished, uncommitted
  work — not a publish step, and deliberately not improvised during a release.
- **Do not** "fix" this by rolling back: the rollback removes the rebrand and does not repair the
  pages, which were broken before and would simply return to 404.

`/support` returning 404 is **correct** — the route is `/support/[code]`; there is no index page.
Likewise `/album`, `/album/reviews` and `/playlist` 404 without their required query params
(`?code=` / `?id=`) because each calls `notFound()`, and `/revalidate` and
`/backstage/hero-position` return 405 to GET because they export only `POST`. None of these are
regressions; all six behave identically in the previous build.


**`Permission denied (publickey)` on SSH** — the private key at `%USERPROFILE%\.ssh\id_ed25519_jubilee_prod` (currently `C:\Users\gabriel.inspire\...`) is missing or its public counterpart is no longer in `root@prod:~/.ssh/authorized_keys`. Regenerate and reinstall per the original session.

**`502 Bad Gateway` after deploy** — the Node process didn't come back up. Check:
```bash
ssh -i "$USERPROFILE/.ssh/id_ed25519_jubilee_prod" root@94.72.120.231 \
  "pm2 logs jubileepraise --lines 30 --nostream"
```

**R2 upload failures** — see `.claude/r2-sync-failures.txt`. Common cause is a transient network blip; re-run `node .claude/r2-sync-music.js --apply` and only the still-missing files will upload.

**CDN not reflecting a freshly uploaded file** — Cloudflare may have cached a 404. Purge by URL in the Cloudflare dashboard, or via API:
```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/5a4817eed553c36db47e8b7b3390120b/purge_cache" \
  -H "X-Auth-Email: gabe.ungureanu@outlook.com" \
  -H "X-Auth-Key: $CLOUDFLARE_GLOBAL_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{"files":["https://cd.jubilujah.com/music/PATH/TO/FILE.mp3"]}'
```

**Roll back a catalog publish** — every publish backs the manifest up beside itself first. Restore
the newest snapshot and restart:

```bash
ssh -i "$USERPROFILE/.ssh/id_ed25519_jubilee_prod" root@94.72.120.231 '
  M=/var/www/jubilujah.com/web/public/music/catalog-manifest.json
  latest=$(ls -1t $M.bak-* | head -1)
  echo "restoring $latest"
  cp -p "$latest" "$M" && pm2 restart jubilujah-web --update-env'
```

**The `/var/www/.backup/JubileePraise.com.*.tgz` snapshots referenced by the old rollback do not apply**
— they belonged to the tar-based deploy that never matched this host. A full source rollback has no
procedure yet, for the same reason a full source deploy does not (see Step 2).

**Publishing the manifest ships whatever is in the working tree**, not a commit. Run `git status`
and `node deploy/check-manifest.mjs` before publishing and make it a deliberate choice.

---

## Production facts (for reference)

| | |
|---|---|
*(Table re-verified against the live host 2026-08-14 — most rows were wrong.)*

| | |
|---|---|
| Host | `root@94.72.120.231` (hostname `SEAIIS01SERVER`, Ubuntu, nginx 1.24, Node 20.20.0, PM2 6.0.14) |
| Code dir | **`/var/www/jubilujah.com/`** — lowercase; **not a git checkout**. Layout is `web/` + `api/`, which does **not** match the repo's `app/web` + `app/api`. |
| Nginx vhost | `/etc/nginx/sites-available/jubilujah.com` **and** `/etc/nginx/sites-available/jubileepraise.com` → both proxy to `127.0.0.1:3030` (web) and `127.0.0.1:4030` (api). *Corrected 2026-08-28: only the jubilujah vhost existed; the runbook named a jubileepraise file that had never been created.* |
| PM2 processes | **`jubilujah-web`** — Next.js, cwd `/var/www/jubilujah.com/web`, **:3030**<br>**`jubilujah-api`** — `/var/www/jubilujah.com/api/src/index.js`, **:4030**<br>*(there is no process named `jubileepraise`)* |
| Live manifest | `/var/www/jubilujah.com/web/public/music/catalog-manifest.json` (read at runtime by `lib/manifest.ts`, cached in memory — restart `jubilujah-web` after replacing it) |
| Public URL | `https://www.jubilujah.com` (apex 301 → www) — **serving today**.<br>`https://www.jubileepraise.com` — origin is configured and verified, but **DNS does not exist yet**, so it is not reachable publicly. See "Activating jubileepraise.com". |
| CDN | public host **`cd.jubilujah.com`**, prefix `music/`, no `albums/` segment. Backed by R2 and staged from `J:\jubileepraise.com\music\`. **No credentials for this bucket exist on this machine** — see Step 1. |
| ⚠ Not this site | **port 3119 is `jubileevibes`** (`/var/www/JubileeVibes.com/server.js`). `cdn.jubileeverse.com` is the **avatars** bucket and 404s for music. Both appeared in this runbook as if they were JubileePraise's. |
