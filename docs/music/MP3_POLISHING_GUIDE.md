# MP3 Metadata Polishing Guide

**Purpose:** Standardize the ID3 metadata of every `.mp3` file in the music catalog so each track is correctly attributed to its assigned Persona and carries no leftover generation metadata before distribution.

**Applies to:** All `.mp3` files on both the **C: drive** working copy (`c:\Websites\jubilujah.com\music\albums\`) and the **J: drive** sync location (`j:\music\`).

---

## The Standard — What a Polished MP3 Looks Like

| ID3 Frame | Field (Windows label) | Polished Value |
|---|---|---|
| `TPE1` | Artist / "Contributing artists" | **The assigned Persona name** (e.g. "Radiant Stones", "Nova Inspire", "Zariah Inspire") |
| `TPE2` | Album artist | **The assigned Persona name** (same as Artist) |
| `COMM` | Comments | **Removed** — no comment frame at all |
| `TIT2` | Title | Preserved (the song title) |
| `TRCK` | Track number | Preserved if present |
| `TALB` | Album | Preserved if present |
| everything else | — | **Removed** (any Suno username, generation ID, timestamps, user-defined frames) |

### Rules

1. **Artist = Persona.** The `artist` (TPE1) tag must be the assigned Persona name — never a Suno account username (e.g. "gungureanu", "sandeepaga") or any individual contributor.
2. **Album Artist = Persona.** The `albumArtist` (TPE2) tag is set to the same Persona name for consistency.
3. **No contributing-artist credits.** Any secondary/contributing artist value is removed; the Persona is the sole credited artist.
4. **No comments.** The `comment` (COMM) frame is removed entirely. Suno files ship with a comment like `made with suno; created=...; id=...` — this generation metadata must not reach distribution.
5. **No stray frames.** Only `title`, `trackNumber`, `album`, `artist`, `albumArtist` are kept. The tag is rewritten from a clean slate so user-defined text frames, original-artist frames, etc. are dropped.

---

## How the Persona Name Is Determined

For each `.mp3`, the Persona name is resolved in this order:

1. The `artist_name` field in the album's `album.meta.json` (in the album folder).
2. If absent, the `artist_name` field in the artist's `artist.meta.json` (walking up the folder tree).
3. If still absent, the artist-slug folder name title-cased (e.g. `ron-tank` → "Ron Tank").

---

## How to Polish (Procedure)

Tooling: **Node.js** with the [`node-id3`](https://www.npmjs.com/package/node-id3) package (pure JavaScript, no native build, no ffmpeg required).

1. Install the library (no need to save it to `package.json`):
   ```
   npm install node-id3 --no-save
   ```
2. For each `.mp3` file:
   - Read the existing tags.
   - Build a clean tag object containing **only** `title`, `trackNumber`, `album` (each kept from the existing tag if present), plus `artist` and `performerInfo` (album artist) both set to the resolved Persona name.
   - Write the clean object with `NodeID3.write(cleanTags, file)` — `write()` *replaces* the entire ID3 tag, so the old comment and any stray frames are dropped automatically.
3. Run a **dry run first** (resolve every Persona, modify nothing) to confirm 0 unresolved files, then apply.
4. Apply to **both** the C: and J: drives so the two locations stay consistent.

---

## When to Apply

- After Suno audio generation, **before** distribution or upload.
- Any time new `.mp3` files are added to the catalog.
- Re-running the polish is **idempotent** — already-correct files are simply rewritten with the same values, so it is safe to run repeatedly.

---

## Verification

After polishing, spot-check a sample on each drive:

- `artist` and `albumArtist` equal the Persona name.
- `comment` is absent.
- No Suno username or `id=`/`created=` generation metadata remains anywhere in the tag.

---

*Last updated: 2026-05-20*
