# Jubilujah.com — Operational Requirements & Single Source of Truth

**Project:** Jubilujah.com
**Owner:** Gabriel Ungureanu, Jubilee Software, Inc.
**Status:** Living document — supersedes scattered notes; complements `Jubilujah-Build-Spec.md`
**Last Updated:** 2026-06-04

This document captures every operational requirement the owner has stated, every architectural decision currently in force, and every rule the engineering pipeline must honor. When `Jubilujah-Build-Spec.md` describes *what is being built*, **this document describes *how the catalog actually runs day-to-day*.** If the two disagree, this document wins for operational behavior — the spec wins for the v1 build target.

---

## Table of Contents

1. [Project identity & purpose](#1-project-identity--purpose)
2. [Three-drive architecture](#2-three-drive-architecture)
3. [The Inspire Family — locked roster](#3-the-inspire-family--locked-roster)
4. [Catalog taxonomy](#4-catalog-taxonomy)
5. [Lyrics file format — Caleb-exemplar Suno-compliant](#5-lyrics-file-format--caleb-exemplar-suno-compliant)
6. [Rating system & display format](#6-rating-system--display-format)
7. [Album production status — Ready vs Studio](#7-album-production-status--ready-vs-studio)
8. [Audio playback architecture](#8-audio-playback-architecture)
9. [Sticky-footer player & turbo navigation](#9-sticky-footer-player--turbo-navigation)
10. [CDN architecture & cache strategy](#10-cdn-architecture--cache-strategy)
11. [Site navigation & page chrome](#11-site-navigation--page-chrome)
12. [Catalog manifest — schema & rebuild process](#12-catalog-manifest--schema--rebuild-process)
13. [The blueprint enhancement pipeline](#13-the-blueprint-enhancement-pipeline)
14. [Honesty rules](#14-honesty-rules)
15. [Operational checklists](#15-operational-checklists)
16. [Open work / follow-ups](#16-open-work--follow-ups)

---

## 1. Project identity & purpose

Jubilujah.com is the **internal catalog + operations console** for every musical asset produced under Jubilee Software, Inc. It is the workshop floor — not a public listening platform. Public listeners reach the music through Jubilee Radio (101 HM-band stations), streaming distribution (Spotify/Apple/YouTube), and future consumer surfaces that read `cdn.jubileeverse.com`.

The site itself must:

- Display every persona, album, and song in the catalog with up-to-date ratings.
- Let editors play any album that has uploaded audio, with **continuous playback that survives navigation** as long as the user stays on the site.
- Mark each album as **Ready** (has mp3 files) or **Studio** (still being worked on).
- Roll up Ready/Studio counts at every aggregation level (catalog, family, category, persona).

---

## 2. Three-drive architecture

| Drive | Role | Path conventions |
|---|---|---|
| **C:** | Workshop / authoring environment | `c:\Websites\jubilujah.com\` — where lyrics are edited, manifests are rebuilt, audio files are imported. Source of truth for in-progress edits. |
| **J:** | Production CDN backing store | `J:\music\` — what `cdn.jubileeverse.com` serves. Authoritative for what's live to consumers. **NEVER** use `J:\jubilujah.com\` — that path is forbidden (caused multi-phase sync confusion previously). |
| **W:** | Web serving (workshop server) | `W:\jubilujah.com\public\` — the local web server (port 3119) serves HTML + a copy of the manifest from here. Audio comes from the CDN, not from W:. |
| **G:** | Legacy Google Drive — being retired | `G:\My Drive\02 Melody Inspire\Websites\cdn.JubileeVerse.com` was the prior store; content was moved to J: on 2026-05-20. Re-uploads to G: are not part of the workflow. |

**Sync rule (memory-locked):** `C:\Websites\jubilujah.com\music\` → `J:\music\` is **additive only** (`robocopy /E`). **Never `/MIR`** — that previously deleted ~100+ MP3 audio assets.

---

## 3. The Inspire Family — locked roster

Twelve rated personas + one apostolic-covering tier:

| # | Persona | Vocal lane | Sonic identity |
|---|---|---|---|
| 1 | Imani Inspire | Female lead | Afrobeats × Gospel-house |
| 2 | Zev Inspire | Male baritone | Hebraic / Messianic |
| 3 | Santiago Inspire | Bilingual male baritone | Latin Worship (20 distinct traditions) |
| 4 | Jubilee Inspire | Female mezzo-soprano C5–F5 | Modern Worship — arena-anthem doctrinal floor |
| 5 | Amir Inspire | Male tenor | Middle-Eastern / Ghazal |
| 6 | Melody Inspire | Female warm alto | Contemplative pop |
| 7 | Nova Inspire | Mixed voice | Electronic / Modern cinematic |
| 8 | Tahoma Inspire | Male baritone-tenor | Indigenous + Pacific bridge |
| 9 | Caleb Inspire | Male warm baritone | Pastoral indie folk |
| 10 | Zariah Inspire | Female alto | Prophetic-intercession |
| 11 | Eliana Inspire | Female warm soprano *(never "Ileana")* | Acoustic hospitality |
| 12 | Elias Inspire | Male warm baritone | Singer-songwriter |
| — | Gabriel Inspire | Apostolic covering tier | Missions-focused — lives under `music/albums/faith-based/` |

Plus two collaborative projects under faith-based: **Kingdom Pulse** (Caleb + Amir + Santiago trio) and **Radiant Stones** (Jubilee + Melody + Zariah trio).

**Persona ordering rule:** Persona cards on `inspire.html` and any other ranked surface **must be sorted by composite rating descending**. As of 2026-06-04: Imani · Zev · Santiago · Jubilee · Amir · Melody · Nova · Tahoma · Caleb · Zariah · Eliana · Elias.

---

## 4. Catalog taxonomy

Top-level categories under `c:\…\music\albums\`:

- **inspire/** — the twelve Inspire Family personas + 3 collaborative trios that nominally live here in older listings (Kingdom Pulse, Radiant Stones, Gabriel Inspire actually live under `faith-based/`)
- **faith-based/** — Gabriel Inspire, Kingdom Pulse, Radiant Stones
- **children/** — Party Giggles (ages 6–13), Tiny Tiggles (ages 3–5)
- **general/** — partner artists (Allan Hassan, Cornell Kay, Daisy Wylder, Gage Darron, Ruthie Bolton, etc.)
- **nations/** — international/translation projects (e.g. Romanian releases)
- **playlists/** — curated playlist definitions

Each album lives in a folder shaped like `XXIMNNNNen-album-slug/` where `XX` is the persona-code prefix (e.g. JEIM for Jubilee, CAIM for Caleb, NVIM for Nova) and `NNNN` is the catalog number.

Inside each album folder:

```
ABCD1234EN-album-slug/
├── album.meta.json          ← canonical metadata: title, code, tracks, ratings
├── artwork/                 ← cover art (cover-3000.png et al)
├── lyrics/
│   ├── blueprint.md         ← per-album production blueprint
│   └── Artist Name-Album Title-lyrics.md   ← Suno-ready lyrics (or lyrics_full.md)
└── tracks/
    └── 01 Song Title.mp3    ← audio assets (when uploaded)
```

---

## 5. Lyrics file format — Caleb-exemplar Suno-compliant

The canonical exemplar is `Caleb-Inspire-Breakthrough-lyrics.md`. Every lyrics file must conform to that format. The format is also captured in memory `[Lyrics .md format: Caleb plain-text standard]`.

**Rules:**

- Plain text only. **No fenced code blocks** anywhere (triple backticks). No SOP Section 14 wrappers. No separate Suno appendix.
- Per-song header: `SONG TITLE: NN Title`, `ARTIST: Persona Name`, optional `ARCHETYPE:`, then `LYRICS:`.
- Section tags from the Suno whitelist ONLY: `[Intro]`, `[Verse]`, `[Verse 1]`, `[Verse 2]`, `[Verse 3]`, `[Pre-Chorus]`, `[Chorus]`, `[Post-Chorus]`, `[Bridge]`, `[Final Chorus]`, `[Outro]`, `[Tag]`, `[Hook]`. `[Verse 1 — short description]` is tolerated. No timestamps, composer notes, or multi-segment metadata inside section-tag brackets.
- Production cues (e.g. `[Hammond swirl]`, `[brass fanfare]`, `[stop-time hit]`) on **separate bracketed lines** — never inline with lyrics.
- Voice-routing tags like `[Caleb]`, `[Amir]`, `[Santiago]` for Kingdom Pulse are preserved inside the lyric body.
- Per-song trailer: `Styles:` paragraph + `VOCAL GENDER:`, `Weirdness:`, `Style Influence:`, `Faith-Focus:`, `Praise vs. Worship:`, `Earworm:`, `Bestseller:`, `Estimated Length:`, `Song Title:`, `Save To:`.
- `Styles:` paragraph **≤ 800 characters total**, **first ~200 characters load-bearing** (Suno's effective limit). Front-load: genre + vocal type + key instruments + BPM + key signature + first signature ear-candy moment.
- **NO artist names anywhere** in Styles or Identity DNA — no "Hillsong-style", "Bethel-style", "Mahalia-tradition", "Carter-family", "Stanley-Brothers", etc. Use vivid auditory descriptions (atmosphere + emotional payload + texture + dynamic shape) instead. The 2026-06-03 audit pass scrubbed ~900+ artist-name tokens across the catalog (Mahalia ×437 in Zariah alone).
- Three-act narrative arc per album: `## ACT I — Title` between tracks 3/4 and `## ACT II → III` between tracks 8/9 (canonical).
- Tempo sweet spot for addictiveness: **100–128 BPM** head-nod range.
- Per-album hook should land within **0:08–0:12** of song start and recur every **30–45 seconds** (brain's "give me that again" window).

---

## 6. Rating system & display format

### Two rating systems in play

1. **Per-song blueprint ratings** in each lyrics file — Faith-Focus, Praise vs. Worship, Earworm, Bestseller. Used by the executive summary generator. Labeled **blueprint-based, not audio-tested** — derived from text/style craft, not listening tests.
2. **Sonic Craft v3.0 six-dimension ratings** for personas — Hook, Groove, Replay Value, Dynamic Payoff, Emotional Pull, Loop-ability. Shown in dashboards and persona executive summaries.

### Display format — IRONCLAD RULE

**Always show ratings as `94%` or `94.4%`. NEVER `94.00 / 100`, `94 / 100`, or `94 out of 100`.**

This rule lives in memory as `[Rating display format: always % never "/100"]`. It applies to:

- HTML dashboards (`inspire.html`, `inspire-family-dashboard.html`, `catalog-summary.html`)
- Persona executive summaries (`music/albums/inspire/*/executive-summary.html`)
- Album pages (`web/album.html` — both static text and the JS-generated stats block)
- Prose paragraphs (`<p class="section-sub">`, `<p class="lead">`)
- Footer summaries, hero stats, table cells, dimension cards, KPI score boxes

When generating new HTML or modifying existing pages, always emit `94.44%`, never `94.44 / 100`. The earlier full-catalog sweep applied ~4,658 such conversions; the rule keeps the catalog clean going forward.

### Decimal precision

- Whole-percent for high-level summaries (`Family composite 94%`)
- One or two decimals where ranking precision matters (`94.44% composite`)

---

## 7. Album production status — Ready vs Studio

Every album has a binary production state:

- **Ready** — has at least one playable mp3 file (`album.playable > 0` in the catalog manifest). Rendered with a green pill: **Ready**.
- **Studio** — no mp3 files yet (`album.playable === 0`). Rendered with an amber pill: **Studio** (still being worked on).

These badges appear:

- Inline next to every `<a href="…album.html?code=XXX">` link site-wide
- In the album.html page hero (larger pill)
- As aggregate count rollups on every key page

**Aggregate count rollups** are placed by inserting a marker `<div data-album-status-counts="SCOPE"></div>`. The decorator script (`album-status.js`) populates it with two pills:

> **Ready** 38 albums · 481 songs &nbsp; **Studio** 26 albums · 323 songs

Supported scope values:

| Scope string | Meaning |
|---|---|
| `all` | Entire catalog (every category) |
| `family` | Inspire Family category only |
| `children` | Party Giggles + Tiny Tiggles combined |
| `category:KEY` | Single named category (e.g. `category:faith-based`) |
| `artist:SLUG` | Single artist/persona (e.g. `artist:jubilee-inspire`) |

Counts auto-update whenever `node music/_quick-manifest.js` rebuilds the manifest. No per-page HTML edit needed.

---

## 8. Audio playback architecture

| Layer | What lives where |
|---|---|
| HTML pages | W: drive, served by `node server.js` on port 3119 |
| Catalog manifest | W: locally (`/music/catalog-manifest.json`) for fresh, plus J: → CDN for reference |
| Audio assets (`.mp3`) | CDN: `https://cdn.jubileeverse.com/music/albums/…/tracks/*.mp3` (backed by J:\music\) |
| Album-page artwork & metadata | W: locally |

**Why the split:** Pushing the manifest to R2/Cloudflare requires a cache purge or new R2 upload to take effect. Serving the manifest locally from W: keeps `playable` flags fresh the moment the manifest is rebuilt. The mp3 binaries rarely change once uploaded, so they cache happily at the CDN edge.

**Player config** (`/web/_assets/player.js`):

```js
const MANIFEST_URL = '/music/catalog-manifest.json';                    // local — always fresh
const MUSIC_BASE   = 'https://cdn.jubileeverse.com/music/';             // CDN — for audio
const MANIFEST_CACHE_KEY = 'jv_manifest_v2';                            // sessionStorage cache key
```

`MANIFEST_CACHE_KEY` is bumped (`v1` → `v2` → …) any time the manifest format changes or the prior cache must be invalidated for all live sessions.

**Server MIME types** must include `.mp3`, `.m4a`, `.aac`, `.wav`, `.flac`, `.ogg`, `.webp` — already added to `W:\jubilujah.com\server.js`.

---

## 9. Sticky-footer player & turbo navigation

**Stated requirement (verbatim from owner):**

> *"I want a sticky footer that will continue to play the music while navigating the rest of the website. As long as the user stays on this website, then the music should continue to play."*

This is achieved by **two cooperating scripts**:

### `player.js` — the sticky footer player

- Renders `#jv-player` at `document.body` level (always pinned to the viewport bottom via `position: fixed`)
- Holds the singleton `<audio>` element
- Caches manifest in `sessionStorage` (5-min TTL); reads local manifest first
- **Idempotent init** — early-returns if `#jv-player` already exists in DOM (so re-execution after a soft nav does nothing harmful)
- Exposes `window.jvPlayer.play(albumCode, trackNum)` for external callers
- Persists playback state (track, position, volume, continue-mode) in `localStorage`

### `turbo-nav.js` — soft navigation that preserves the audio element

- Intercepts every internal `<a>` click site-wide
- Fetches the destination URL, parses HTML, **swaps `document.body.innerHTML`** while *first removing and then re-appending* the existing `#jv-player`
- The `<audio>` element is never detached from its `#jv-player` parent → **playback continues seamlessly across the navigation**
- Updates `document.title` and pushes `history.pushState()` for proper back/forward
- Pulls in any new `<link rel="stylesheet">` from the destination's `<head>` (album.html has its own large style block)
- Re-executes inline `<script>` tags in the new content so per-page logic (e.g. album.html's album-fetch script) still runs
- Skips re-executing `player.js`, `turbo-nav.js`, `album-status.js` (singletons — handled idempotently)
- Calls `window.jvAlbumStatus.decorate()` after swap to re-apply Ready/Studio badges to the new content
- Falls back to a regular full-page navigation on any error (4xx, 5xx, parse failure)
- Opt-out per-link: add `data-no-turbo` attribute to force a full reload

**Effect:** The footer player is now *truly* sticky. Playing track keeps streaming as the user clicks through Home → Inspire Family → Jubilee summary → an individual album page → and back. Audio only stops if the user closes the tab, navigates to an external domain, or hits the pause button.

---

## 10. CDN architecture & cache strategy

- `cdn.jubileeverse.com` is a Cloudflare-fronted endpoint backed by R2 / J:\music\
- Audio paths: `https://cdn.jubileeverse.com/music/albums/<category>/<artist>/<ABCD1234EN-slug>/tracks/<file>.mp3`
- The CDN serves mp3s with `Content-Type: audio/mpeg`, supports range requests, caches at edge with a long TTL
- The manifest at the CDN may lag behind J:\ — **prefer the local W: copy for freshness**
- If a versioned manifest fetch is ever needed, append `?v=YYYYMMDD-HHMM` to bypass edge cache

---

## 11. Site navigation & page chrome

Every visitor-facing HTML page must include the **standard site header**:

```html
<header class="site-header">
  <div class="container">
    <div class="topbar">
      <a href="/index.html" class="site-logo">Jubilujah.com</a>
      <div class="site-tools">
        <a href="/playlists.html">Playlists</a>
        <span class="sep">|</span>
        <a href="/auth/login.html" class="login">Login</a>
      </div>
    </div>
    <nav class="site-nav">
      <a href="/index.html">Home</a>
      <a href="/inspire.html">Inspire Family</a>
      <a href="/children.html">Children Music</a>
      <a href="/faith-based.html">Faith-Based Believers</a>
      <a href="/general.html">General Audiences</a>
      <a href="/admin/index.html" class="admin-only" style="display:none;">Admin</a>
    </nav>
  </div>
</header>
```

**The Home button must be present on every page**, including `web/album.html`. The 2026-06-04 fix added it to the album detail page (previously had only a breadcrumb). Any new page must include this header.

`turbo-nav.js` sets the `.active` class on the current nav link automatically based on path.

---

## 12. Catalog manifest — schema & rebuild process

**File:** `c:\Websites\jubilujah.com\music\catalog-manifest.json` (authoritative) → copied to `W:\jubilujah.com\public\music\catalog-manifest.json` (served) → optionally pushed to `J:\music\catalog-manifest.json` for CDN.

**Generator:** `c:\Websites\jubilujah.com\music\_quick-manifest.js` — scans every album folder, reads `album.meta.json`, walks the `tracks/` subfolder, and emits per-track `{ n, title, file, url, audio }` plus per-album `{ playable, trackCount }`.

**Schema (relevant fields):**

```jsonc
{
  "generated": "2026-06-03T22:02:26.249Z",
  "totalAlbums": 736,
  "totalPlayableAlbums": 264,
  "totalPlayableTracks": 3303,
  "categories": [
    {
      "key": "inspire",
      "label": "Inspire Family",
      "artists": [
        {
          "slug": "jubilee-inspire",
          "name": "Jubilee Inspire",
          "albums": [
            {
              "code": "JEIM1002EN",
              "title": "Sunday Rolled Back",
              "folder": "JEIM1002EN-sunday-rolled-back",
              "path": "albums/inspire/jubilee-inspire/JEIM1002EN-sunday-rolled-back",
              "playable": 12,
              "trackCount": 12,
              "tracks": [
                {
                  "n": 1,
                  "title": "Stone Rolled Back",
                  "file": "01 Stone Rolled Back.mp3",
                  "url": "albums/inspire/jubilee-inspire/JEIM1002EN-sunday-rolled-back/tracks/01 Stone Rolled Back.mp3",
                  "audio": true
                }
                /* ... */
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

**Rebuild workflow:**

```bash
# 1. Rebuild manifest on C: after adding mp3s or updating album metadata
cd c:\Websites\jubilujah.com
node music/_quick-manifest.js

# 2. Copy to W: so the served pages immediately reflect new state
cp music/catalog-manifest.json W:/jubilujah.com/public/music/

# 3. (Optional) Push to J: for CDN backing if R2 sync is hooked up
cp music/catalog-manifest.json J:/music/
```

After the rebuild, all Ready/Studio badges and aggregate counts site-wide refresh on the next page load (with the 5-minute `sessionStorage` TTL on stale sessions).

---

## 13. The blueprint enhancement pipeline

When refreshing a persona's catalog for the 97%+ tier:

1. **Plan a unique fusion style** for the persona (e.g. Jubilee × *Cinematic Post-Rock × Sacred Indie-Folk*)
2. **Plan a three-act narrative arc** spanning the album set
3. **For each album**, apply the 8 enhancement principles:
   1. Hook positioning — chorus phrase tease at 0:08–0:12, repeat every 30–45 s
   2. Styles block sharpening — ≤ 800 chars, first ~200 load-bearing, NO artist names
   3. Three-act arc verification — preserve or insert `## ACT I/II/III` dividers
   4. Ear-candy textures — on separate bracketed lines
   5. Dynamic arc + payoff — strip-back markers, full band slam, double-time drops
   6. Loop point smoothing — hook-callback at outro
   7. Suno compliance audit — no fenced blocks, whitelist tags only, separate cue lines
   8. Rating uplift — blueprint-based, labeled honestly (NOT audio-tested)

4. **Always label** rating changes as "blueprint-based, not audio-tested" in the lyrics-file VERSION CONTROL changelog. Do not pretend to have listened to mp3 audio.
5. **Append a changelog entry** with today's date inside the `<!-- VERSION CONTROL -->` block.

The 2026-06-03 Jubilee pass moved family composite **93.53% → 94.44%** (`+0.91`) and grew the strict-97%+-all-four-dims track count **35 → 57**.

---

## 14. Honesty rules

These are non-negotiable when generating any analysis or ratings:

- **Never claim to have listened to audio.** No phrases like *"on first pass for the feeling, on second pass for the craft."* All sonic analysis from this AI assistant is text/blueprint-based.
- **Label blueprint-based ratings** as such in changelogs and surface text where space permits.
- **Don't auto-bump** a track's rating to 97%+ unless the actual lyric/style craft supports it. Realistic blueprint uplift is 1–4% per dimension.
- **Preserve testimony-anchor and tender-zone tracks** at their lower Praise vs. Worship ratings — those dips are intentional.
- **Preserve theological anchors, Identity DNA Preserved lines, ARCHETYPE labels, song titles, and ACT dividers** in any lyrics edit.

---

## 15. Operational checklists

### Daily — when a worker uploads new audio

1. Drop the new `.mp3` files into the album's `tracks/` folder (proper `NN Song Title.mp3` naming)
2. Run `node music/_quick-manifest.js` to rebuild the manifest
3. Copy the rebuilt manifest to W: (`W:\jubilujah.com\public\music\catalog-manifest.json`)
4. The album's Ready/Studio badge will auto-flip green on next page load
5. Aggregate counts on dashboards refresh automatically

### Weekly — sync to J: / CDN

1. Robocopy `C:\Websites\jubilujah.com\music\*` → `J:\music\` with `/E` (additive only — **never /MIR**)
2. The fresh manifest and any new mp3s propagate to the CDN backing store
3. If a manifest cache-bust is required, bump `MANIFEST_CACHE_KEY` in `/web/_assets/player.js`

### When generating new HTML

- Include the standard site header (Home link, full nav)
- Include `<script src="/web/_assets/turbo-nav.js" defer></script>` so soft-nav works site-wide
- Include `<script src="/web/_assets/album-status.js" defer></script>` so Ready/Studio badges decorate
- Include `<script src="/web/_assets/player.js" defer></script>` so the sticky footer appears
- Use `%` format for all ratings, never `/ 100`
- Add a `<div data-album-status-counts="…"></div>` marker where aggregate counts belong

---

## 16. Open work / follow-ups

Tracked since the 2026-06-03 / 2026-06-04 sessions:

- **Caleb CAIM1021–1030** — 10 albums outside the original Suno-audit scope; need a quick pass
- **JMZM1041 (Radiant Stones · Cry Out)** — 11 Styles fields still exceed 800 chars
- **IMIM1017 (Imani Inspire)** — embedded `[STYLES]...[/STYLES]` blocks inside the lyric body need a structural cleanup pass
- **Other-persona executive summaries with the new 97%+ structure** — only Jubilee's was rebuilt by parser; the other 11 personas' summaries are hand-authored historical artifacts. A consistent regeneration would normalize them.
- **R2 / CDN manifest sync** — currently the CDN manifest can drift behind J:\. Either automate the J: → R2 push or accept the local W: manifest as authoritative (current approach).
- **The "metric" and prose paragraph format pass on non-Inspire pages** — the 2026-06-04 percentage sweep covered all 19 indexed pages; if new persona pages are added later, apply the same patterns.

---

## Appendix — Files this document covers

- All HTML pages under `W:\jubilujah.com\public\` (~19 pages site-wide as of 2026-06-04)
- Three JS assets under `W:\jubilujah.com\public\web\_assets\`:
  - `player.js` — sticky footer player + manifest cache
  - `album-status.js` — Ready/Studio badge decorator + count rollups
  - `turbo-nav.js` — soft-navigation interceptor that preserves audio playback
- Generator: `c:\Websites\jubilujah.com\music\_quick-manifest.js`
- Server: `W:\jubilujah.com\server.js` (port 3119)
- Companion spec: `Jubilujah-Build-Spec.md` (v1 engineering target — describes the future Postgres + FastAPI + Next.js system; this document describes what's running today)
- Memory rules (Claude assistant's persistent memory):
  - `feedback_j_sync_additive_only` — J: sync rules
  - `feedback_suno_copy_paste_format` — lyrics format
  - `feedback_rating_display_format` — % format rule

---

**End of operational source-of-truth document — 2026-06-04**
