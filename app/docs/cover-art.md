# Cover Art — optimization & publishing (STANDARD PROCESS)

**Album cover art must always be optimized before it is published to the CDN.**
Source masters are large PNGs (~1.5–3 MB each); served unoptimized they make the
catalog pages slow. We deliver them as **WebP, resized to ≤ 800 px, quality 80** —
typically a **~97% size reduction** (e.g. 1.8 MB → ~80 KB).

## How covers are served

- The web `/cover/<CODE>.png` route ([app/web/app/cover/[code]/route.ts](../web/app/cover/[code]/route.ts))
  tries the **CDN first** (`cdn.jubileeverse.com/music/<album.path>/artwork/<CODE>.png`)
  and falls back to the local `J:/music` master only in dev.
- Production (the Seattle VPS) has **no J: drive**, so covers MUST be on the CDN or
  they won't display. See [[jubilujah-prod-deploy]].
- We keep the `<CODE>.png` **URL** but store **WebP bytes** with
  `Content-Type: image/webp`. Browsers render by content-type, so no route/manifest/
  component changes are needed.

## The standing rule

Whenever cover art is added or changed (e.g. after the
[album cover workflow](album-cover-workflow) places new `<CODE>.png` masters under
`J:/music/albums/**/artwork/`):

1. **Keep the full-res PNG master on J:** (lossless source — never deleted).
2. **Optimize + publish to the CDN** with the script below. Never upload raw PNGs.

## Tool

`c:/Websites/jubileeverse.com/.claude/optimize-covers.js` (uses `sharp` + the R2
credentials in that project's `.env`; lives next to `r2-sync-music.js`).

```bash
cd /c/Websites/jubileeverse.com
node .claude/optimize-covers.js                  # dry run — counts + size reduction
node .claude/optimize-covers.js --apply          # optimize all covers and upload to R2
node .claude/optimize-covers.js --apply --only=TTX3   # only matching paths (e.g. a label)
```

It walks `J:/music/albums/**/artwork/*.png`, resizes to ≤ 800 px, encodes WebP q80,
and uploads to R2 key `music/<relpath>` with `Content-Type: image/webp` and
`Cache-Control: public, max-age=31536000, immutable`.

## After publishing — purge stale 404s

If a cover URL was ever requested while missing, Cloudflare may have edge-cached the
404. After uploading new covers, purge the relevant zone so the new images appear:

```bash
# jubilujah.com zone (id 0845c114e738e3dc4e5ff6a26483adf9) — clears cached /cover 404s
curl -X POST "https://api.cloudflare.com/client/v4/zones/<zone>/purge_cache" \
  -H "X-Auth-Email: <email>" -H "X-Auth-Key: <global-key>" \
  -H "Content-Type: application/json" --data '{"purge_everything":true}'
```

The `/cover` route also keeps a 10-minute in-memory negative cache; `pm2 restart
jubilujah-web` clears it immediately if needed.
