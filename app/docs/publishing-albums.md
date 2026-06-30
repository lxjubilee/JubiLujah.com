# Publishing an album to the CDN + live site

Runbook for making a new (or changed) album appear on **jubilujah.com** with audio
playing from the CDN. This is exactly the process used to publish **JEIM1069EN
"Jubilujah"** (Jubilee Inspire, 12 tracks).

Inputs live on the **J:** artwork/audio store, e.g.
`J:/music/albums/inspire/jubilee-inspire/JEIM1069EN-jubilujah/` with `tracks/*.mp3`
(and ideally `artwork/<CODE>.png`).

## 1. Add the album to the manifest

The manifest (`app/web/public/music/catalog-manifest.json`, mirrored on
`J:/music/catalog-manifest.json`) is the source of truth for what the site shows.
Add an entry under the right `category → artist`:

```json
{ "code": "JEIM1069EN", "title": "Jubilujah",
  "folder": "JEIM1069EN-jubilujah",
  "path": "albums/inspire/jubilee-inspire/JEIM1069EN-jubilujah",
  "playable": 12, "trackCount": 12,
  "tracks": [ { "n": 1, "title": "Jubilujah", "file": "01 Jubilujah.mp3",
    "url": "albums/inspire/jubilee-inspire/JEIM1069EN-jubilujah/tracks/01 Jubilujah.mp3",
    "audio": true }, ... ] }
```

Build `tracks[]` by reading the `tracks/` folder (strip the `NN ` prefix + `.mp3` for
the title). `playable` = number of tracks with audio (drives `ready` vs `studio`).
Update both manifest copies (app + J:).

## 2. Publish the audio to the CDN

Upload `tracks/*.mp3` to R2 (`cdn.jubileeverse.com`) at
`music/<path>/tracks/<file>.mp3` with `Content-Type: audio/mpeg` and a long immutable
cache. The web player builds audio URLs as `NEXT_PUBLIC_CDN_BASE + /music/ + track.url`,
so the audio **must** be on the CDN (the VPS has no J: drive). Use the R2 client in
`c:/Websites/jubileeverse.com` (same creds/SDK as `r2-sync-music.js`).

## 3. Publish the cover art

If `artwork/<CODE>.png` exists, optimize + publish it per
[cover-art.md](cover-art.md) (`node .claude/optimize-covers.js --apply`). If the
`artwork/` folder is empty, the album renders the gradient fallback tile until art is
added — that was the case for JEIM1069EN.

## 4. Deploy to the live VPS — **rebuild required**

The catalog pages (`/`, `/inspire`, category pages) are **ISR / statically prerendered
at build time** (`export const revalidate = 3600`). Updating the manifest and running
`pm2 restart` refreshes only the **dynamic** routes (`/api/albums/<code>`,
`/album?code=`) — the static catalog pages keep serving the old prerender. **You must
rebuild** for a new album to appear in the catalog rows:

```bash
# copy the updated manifest up
cat app/web/public/music/catalog-manifest.json | \
  ssh ...jubilee_prod root@94.72.120.231 'cat > /var/www/jubilujah.com/web/public/music/catalog-manifest.json'
# rebuild + restart on the VPS
ssh ...jubilee_prod root@94.72.120.231 \
  'cd /var/www/jubilujah.com && rm -rf web/.next && npm run build && pm2 restart jubilujah-web jubilujah-api'
```

Also publish the manifest to the CDN (`music/catalog-manifest.json`) for other
consumers, then **purge the jubilujah.com Cloudflare cache** (`purge_everything`,
zone `0845c114e738e3dc4e5ff6a26483adf9`) so the new pages aren't masked by edge cache.

## 5. Verify

```bash
curl -s https://jubilujah.com/api/albums/JEIM1069EN            # title + tracks (CDN urls)
curl -sI "https://cdn.jubileeverse.com/music/.../tracks/01%20Jubilujah.mp3"  # 200 audio/mpeg
curl -s https://jubilujah.com/inspire | grep -c "album?code=JEIM1069EN"      # 1 = on Inspire Family
curl -s https://jubilujah.com/        | grep -c "album?code=JEIM1069EN"      # 1 = on Home
```

See [jubilujah-prod-deploy](../../README.md) context in `seattle-vps-db.md` for the
PM2/nginx/Cloudflare layout.
