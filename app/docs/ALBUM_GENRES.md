# Album Music Genres — Requirements, Method & How-To

How every album on Jubilujah.com gets a **Primary** and **Secondary** music-style
genre, derived from the album's own source content, and how to (re)run it for any
existing or future album.

---

## 1. Business requirements

- Each album shows up to **two music-style genres**: a **Primary** and a
  **Secondary**.
- They must reflect **the album's actual music style** (e.g. *Country*,
  *Bluegrass*, *Hip-Hop*, *Praise & Worship*, *Gospel Soul*, *Honky-Tonk*,
  *Latin Pop*, *Pentecostal Shout*, *Messianic*, *Tribal*, *Hawaiian*), not the
  audience or persona brand.
- Every genre label is **≤ 20 characters**.
- **Display** (album hover card + album page):
  - **Line 2** — the **Primary** genre inside the rounded status pill, colored
    **green when the album is READY** and **yellow when STUDIO** (the color, not a
    word, conveys status).
  - **Line 3** — the **Secondary** genre in regular **white** text.
- Label spelling is standardized — always **"Praise & Worship"** (never
  "Praise-Worship" / "Praise and Worship").
- The approach must be **repeatable** for new albums and new personas.

---

## 2. Where the genre truth lives (source content)

Each album folder under `<ARTWORK_BASE>/<album.path>/` (default `J:/music/...`)
carries the authoritative style description:

1. **`blueprint.md`** (in the album folder or its `lyrics/` subfolder) — the
   album-level statement, in priority order:
   - **`Dominant Music Styles:`** — e.g. `Caribbean Praise × Contemporary Gospel`,
     `Pentecostal Shout × Traditional COGIC Organ Praise Break`,
     `Pop × Synth-pop`, `Celebration Praise & Worship × Latin Pop`. **This is the
     primary source.**
   - **`Album Type:`** and **`Genre / Sound`** — supporting style cues.
2. **`lyrics/<…>-lyrics.md`** — the **`**Fusion:**`** header + per-song
   **`Styles:`** lines (Suno style blocks). Used to corroborate, and as the
   fallback when the blueprint has no explicit style line.

The catalog DB (`catalog.albums.genre_tags`) is **empty** — it is not the source.

---

## 3. Method (how the two genres are derived)

`app/web/scripts/gen-album-genres.mjs`:

1. **Gather** the album's style prose, weighting the blueprint `Dominant Music
   Styles` / `Album Type` / `Genre / Sound` heavily (×3) over the lyrics styles.
2. **Normalize** the prose to clean labels with an ordered keyword table
   (`GENRE_RULES`, **specific → generic**), counting keyword hits per genre.
3. **Rank**: most hits wins; ties break by specificity (earlier rule), so the
   **distinctive** style (e.g. *Pentecostal Shout*, *Latin Bolero*) becomes the
   **Primary** over a generic one (*Praise & Worship*).
4. **Family-dedup**: near-duplicate relatives collapse to one label (the
   *Latin / Latin Pop / Latin Praise / Latin Bolero* family → a single Latin
   label) so a card never reads "Latin · Latin Pop". Genuinely distinct relatives
   like *Country / Bluegrass* and *Pop / Synth-Pop* are kept separate on purpose.
5. **Top 2**, each truncated to ≤ 20 chars → `[Primary, Secondary]`.
6. Writes **`app/web/public/music/album-genres.json`** = `{ genres: { CODE:[p,s] } }`.

Albums with no usable content fall back at display time to a persona-anchor +
worship-theme heuristic (`lib/genres.ts`), so they still show something sensible.

### Current label taxonomy (all ≤ 20 chars)
`Praise & Worship`, `Contemporary`, `Worship Ballad`, `Gospel`, `Gospel Soul`,
`Pentecostal Shout`, `Caribbean Praise`, `Messianic`, `Arabic Praise`,
`Latin`, `Latin Pop`, `Latin Praise`, `Latin Bolero`, `Country`, `Bluegrass`,
`Honky-Tonk`, `Hawaiian`, `Tribal`, `Celtic`, `Bollywood`, `Afrobeat`, `Reggae`,
`Hip-Hop`, `Blues`, `Jazz`, `Pop`, `Synth-Pop`, `Dance-Pop`, `Rock`,
`Electronic`, `Cinematic`, `Folk`, `Children's`. (Extend `GENRE_RULES` to add more.)

---

## 4. Display wiring

- `app/web/lib/genres.ts` — `topGenres(code, …)` returns the album's genres from
  `album-genres.json` (heuristic fallback if absent); `genrePair(code, …)` →
  `{ primary, secondary }`.
- `components/HoverTile.tsx` (hover card) and `components/AlbumApp.tsx` (album
  page): Primary → `.status-pill` (`.ready` green / `.studio` yellow); Secondary →
  white text (`.nf-preview-genres` / `.jv-secondary-genre`).
- `next.config.mjs` already allows the CDN image host; no other config.

---

## 5. Baked into the catalog manifest

`app/web/scripts/merge-genres-into-manifest.mjs` writes the genres into the
catalog JSON so the data is self-contained:

- every album → `"genres": [Primary, Secondary]`
- every artist → `"genres": [...]` = the artist's **two most-common album genres**

…in **both** `app/web/public/music/catalog-manifest.json` **and** the J: master
`J:/music/catalog-manifest.json`.

> Note: the manifest is otherwise folder-scan generated; if it is rebuilt from
> scratch, re-run the merge step to re-bake genres.

---

## 6. How to run it (for new or changed albums)

From `app/web` (with `ARTWORK_BASE` pointing at the music store, default
`J:/music`):

```bash
# 1. Derive Primary/Secondary genres for every album from its content files.
ARTWORK_BASE=J:/music node scripts/gen-album-genres.mjs
#    (optional: a limit, or specific codes to spot-check)
ARTWORK_BASE=J:/music node scripts/gen-album-genres.mjs JEIM1069EN,SAIM1001EN

# 2. Bake the genres into both catalog manifests.
ARTWORK_BASE=J:/music node scripts/merge-genres-into-manifest.mjs

# 3. (verify) compare derived genres to each blueprint's stated style.
ARTWORK_BASE=J:/music node scripts/verify-genres.mjs
```

**Adding a new album:** drop its folder (with `blueprint.md` + lyrics) under
`J:/music/...`, ensure it's in the manifest, then run steps 1–2. Its genres are
derived automatically — no per-album hand-tagging.

**Adding/renaming a genre:** edit `GENRE_RULES` (and `FAMILY` if it has
relatives) in `gen-album-genres.mjs`, keep the label ≤ 20 chars, re-run steps 1–2.

---

## 7. Verification done

The derivation was checked against the blueprints across all 12 inspire personas;
representative results (Primary · Secondary):

| Album / Persona | Blueprint "Dominant Music Styles" | Derived |
|---|---|---|
| Jubilee — Jubilujah | CCM × Arena Worship × Praise Breaks (Contemporary Gospel) | Praise & Worship · Contemporary |
| Melody — Hearts in Bloom | Pop × Synth-pop (Bloom-Pop) | Pop · Synth-Pop |
| Zariah — Revival in My Bones | Caribbean Praise × Contemporary Gospel | Caribbean Praise · Praise & Worship |
| Eliana — The Only Name… | (country / bluegrass) | Country · Bluegrass |
| Imani — Sound of Deliverance | Pentecostal Shout × COGIC Organ Praise Break | Pentecostal Shout · Praise & Worship |
| Zev — Bridge of Yahuah's Love | MM × CCM | Messianic · Praise & Worship |
| Amir — Bridge Across Faiths | (Levantine / Arabic) | Arabic Praise · Praise & Worship |
| Santiago — Cristo Rey del Ritmo | Praise & Worship × Latin Pop | Latin Pop · Pop |
| Santiago — El Rosario de Abuela | Praise & Worship × Latin Bolero | Latin Bolero · Praise & Worship |
| Tahoma — Boarding School Survivors | (Native / Tribal) | Tribal · Gospel |

**578 / 732** albums derive genres from content; the rest use the heuristic
fallback. All labels are ≤ 20 characters.
