# CATALOG TRANSLATION ORCHESTRATION — Standard Operating Procedure (SOP)

**Audience:** the AI developer/agent running the JubiLujah.com catalog-translation pipeline.
**Scope:** review the entire **English (EN)** music catalog on the **J: drive**, pick the
most suitable album/artist for each target language, skip anything already translated,
translate it using the correct `translate_<LANGUAGE>.md` engine, then quality-check and
verify every output.
**Output of this run:** new foreign-language album **lyrics `.md` files** (EN → target
code), plus a verification report and an updated translation ledger.

> **This document is instructions only.** Do not write code or move files yet — produce
> the plan and the per-album/per-language work exactly as specified here when executed.

---

## 0. INPUTS & PREREQUISITES (confirm before starting)

1. **The EN catalog root** on the J: drive (confirm the actual path), e.g.
   `J:\JubiLujah\Catalog\` containing per-artist/per-album folders.
2. **The translation engines:** the `/.prompts/translate_<LANGUAGE>.md` files (one per
   language). If any are missing, generate them first via `BUILD_TRANSLATION_PROMPTS.md`.
   Do NOT translate without the matching engine file.
3. **The approved language list** (28 target languages / 29 prompt files; Portuguese split
   into Brazilian + European). See §1.
4. **The translation ledger** (see §6). If none exists, create it during Phase 0.
5. **Reference standards:** `BUILD_TRANSLATION_PROMPTS.md` (engine spec) and the canonical
   Suno lyrics format / Music SOP. The exemplar `translate_Romanian.md` is the quality bar.

**Hard rules for the whole run:**
- Never alter the EN source files. Work read-only against the catalog; write only new files.
- One album = one artist = one target language per translation unit.
- Doctrine and the §0 laws of the engine files (Meaning-First; Contextualize-Never-Syncretize)
  outrank everything. A translation that fails QA is not shipped.
- Every selection, skip, and output is logged to the ledger.

---

## 1. TARGET LANGUAGES & CODES

| # | Language | Code | # | Language | Code |
|---|----------|------|---|----------|------|
| 1 | Spanish | ES | 15 | Thai | TH |
| 2 | French | FR | 16 | Turkish | TR |
| 3 | German | DE | 17 | Vietnamese | VI |
| 4 | Italian | IT | 18 | Tagalog / Filipino | TL |
| 5 | Brazilian Portuguese | PT-BR | 19 | Hebrew | HE |
| 6 | European Portuguese | PT-PT | 20 | Swedish | SV |
| 7 | Dutch | NL | 21 | Danish | DA |
| 8 | Russian | RU | 22 | Czech | CS |
| 9 | Polish | PL | 23 | Hungarian | HU |
| 10 | Mandarin Chinese | ZH | 24 | Bulgarian | BG |
| 11 | Japanese | JA | 25 | Croatian | HR |
| 12 | Korean | KO | 26 | Indonesian | ID |
| 13 | Arabic | AR | 27 | Romanian | RO |
| 14 | Hindi | HI | 28 | Ukrainian | UK |

The album code suffix swaps **EN → <CODE>** (e.g. `JEIM1069EN` → `JEIM1069ES`). Use the
exact uppercase code above (keep the hyphen for `PT-BR` / `PT-PT` or the project's adopted
form — confirm and stay consistent).

---

## PHASE 0 — Catalog inventory & ledger build

1. **Recursively scan the EN catalog root.** Identify every English album. For each, record
   a manifest row:
   - Artist/persona (the brand name, kept in English).
   - Album title and album **base code** (the code minus the `EN` suffix, e.g. `JEIM1069`).
   - Album folder path; lyrics folder path.
   - Track count and each track's title, track number, and lyrics `.md` filename.
   - Genre/style, BPM/key (from the `Style` block), vocal gender, and any existing
     addictiveness ratings (hook/groove/replay/payoff/emotional pull/loop-ability).
   - Core themes / lyrical content summary (for suitability scoring in Phase 1).
   - Completeness flag: are all expected tracks + metadata present and Suno-compliant?
2. **Detect existing translations.** For every album, scan for sibling folders/codes with a
   non-EN suffix (e.g. `JEIM1069RO`) anywhere in the catalog, and record which languages
   each album already exists in.
3. **Write/refresh the translation ledger** (§6) from this manifest so the rest of the run
   reads from one source of truth.
4. **Flag and exclude** any EN album that is itself incomplete or not Suno-compliant — it is
   not eligible as a translation source until fixed. Log these for the project owner.

> Output of Phase 0: a complete EN catalog manifest + an up-to-date ledger of album ×
> language translation status.

---

## PHASE 1 — Select the most suitable album & artist for a target language

Run this per target language. Goal: pick the **single best EN album** (and its artist) to
translate **into this language next**, given cultural fit and what's already done.

### 1A. Build the eligible pool
Start from all **complete** EN albums NOT yet translated into this language (per the ledger).
If the pool is empty, mark the language "catalog exhausted" and move on.

### 1B. Score each eligible album for this language (suitability score)
Rank the pool with these weighted criteria. Higher = more suitable to translate into THIS
language first.

1. **Cultural/worldview resonance (highest weight).** Using the target language engine's
   §1A (worldview frame, taboo map, ache word), favor albums whose themes and imagery map
   cleanly onto the culture's dominant frame:
   - honor–shame cultures → albums centered on belonging, the Father's embrace, restored
     honor, adoption;
   - guilt–innocence cultures → albums centered on forgiveness, debt paid, freedom;
   - fear–power cultures → albums centered on Christ's authority, light over darkness.
   Penalize albums heavy with **taboo or untranslatable** imagery for this culture (e.g.
   war/"conquering" framing for Ukrainian; wine-as-river for teetotal-majority contexts) —
   unless the imagery is cleanly adaptable per the engine.
2. **Flagship strength / proven appeal.** Favor the strongest albums first (highest existing
   addictiveness ratings, most streamed/most complete) — the best ambassadors for a new
   language market.
3. **Artist/persona fit.** Favor a persona whose genre, vocal style, and vocal gender travel
   well to this culture's listening market.
4. **Translation tractability.** Slightly favor albums whose lyrics carry less culture-bound
   wordplay (coined brand hooks are kept verbatim and are not a penalty).
5. **Catalog balance.** Mild preference to spread languages across different artists/albums
   rather than translating the same album into everything first (unless the owner wants a
   specific flagship localized everywhere — confirm priority).

### 1C. Pick the winner
Choose the top-scored album. Record the **why** (the deciding criteria) in the ledger and the
run report. If two are tied, prefer the flagship (criterion 2), then artist spread (5).

### 1D. Redundancy re-check (belt and suspenders)
Before committing, re-verify in the live catalog (not just the ledger) that
`<base code><CODE>` does **not** already exist as a complete translated album. If it does,
mark this album "already translated → skip," return to 1B, and **select the next best**.
Repeat until you have a winner that is genuinely untranslated for this language.

> Output of Phase 1 (per language): one selected EN album + artist, logged, confirmed not
> already translated.

---

## PHASE 2 — Translate the selected album (EN → target)

For the selected album and target language:

1. **Load the correct engine:** `/.prompts/translate_<LANGUAGE>.md`. Use it verbatim as the
   controlling instruction set. If it is missing or a placeholder, STOP and generate/fix it
   first (`BUILD_TRANSLATION_PROMPTS.md`).
2. **Translate track by track, sung text only.** Follow the engine's workflow and laws:
   meaning-first; contextualize-never-syncretize; the worldview frame (§1A); the locked
   divine-names glossary (§2); the banned-error patterns and drop-the-rhyme test (§0A);
   singability/prosody (§4) including the euphony screen.
3. **Preserve Suno structure exactly.** Keep all `[bracketed]` section tags and production
   cues unchanged. Keep coined brand hooks + spelling-chants verbatim.
4. **Update the `Style` metadata block — in English.** Do not translate it. Add
   "<LANGUAGE>-language vocal" near the front; keep BPM/key/instruments/mood anchors; fold in
   any addictiveness tuning. (The post-production addictiveness re-rating per engine §10 runs
   after the album is generated in Suno — flag it as a follow-up, it is not part of writing
   the lyrics files.)
5. **Apply file/code/title conventions (engine §7):**
   - New album code: `<base code><CODE>` (e.g. `JEIM1069ES`).
   - Mirror the EN album's folder structure under the new code; create the `lyrics/` folder.
   - Lyrics filename keeps the persona/artist brand in English; album title in the target
     language (unless the title IS the coined brand hook — then keep it; document the choice).
   - Each song title translated, keeping its 2-digit track-number prefix; `Song Title:` /
     `SONG TITLE:` and `Save To:` updated accordingly.
   - Add the changelog/header note: target translation of `<base code>EN`, divine-name
     convention chosen, coined-hook policy, worldview frame used.
6. **Write each track's lyrics `.md` file** in the new album's `lyrics/` folder. **UTF-8**
   encoding (mandatory for non-Latin scripts and diacritics).
7. **Log** the created album, its code, path, and track files to the ledger as
   "translated — pending QA."

> Output of Phase 2: a complete set of target-language lyrics `.md` files for the new album,
> structurally mirroring the EN source.

---

## PHASE 3 — Quality check & verification

Do not mark an album done until every gate passes. Run two layers.

### 3A. Per-track / per-album QA (from the engine's §8 checklist)
- [ ] Sing-through: every line fits melody/meter; no rushed or padded bars.
- [ ] Syllable check on hook + chorus vs EN (±1; hook exact).
- [ ] Diacritics complete in all sung text AND titles (UTF-8 intact, non-Latin scripts render).
- [ ] Divine-name consistency; glossary honored; Son-of-God doctrine intact.
- [ ] Scripture echoes match the language's standard Bible.
- [ ] Non-offense pass: no vulgar/slang; reverent address + correct honorifics; no
      denominational imports; no romantic-pop God-imagery; gospel intact.
- [ ] Cultural-resonance pass: leads with the right worldview frame; every image cleared
      against the taboo list; native ache word used; charged vocabulary handled.
- [ ] Coined hook preserved verbatim.
- [ ] `Style` block English-only, updated with "<LANGUAGE>-language vocal" + tuning.
- [ ] No foreign-religion divine name anywhere.
- [ ] Back-translation + comprehension check on the chorus.
- [ ] Drop-the-rhyme test on every line; no nonsense fillers; real words + correct grammar;
      agreement; no stranded tails; euphony screen passed (no accidental obscene/comic word).
- [ ] Image consistency; theology-over-rhyme.

### 3B. Structural / pipeline verification
- [ ] **Code correctness:** new album code = `<base code><CODE>` exactly; EN suffix fully
      replaced everywhere (folder name, file headers, footers, `Save To:`).
- [ ] **Track parity:** translated album has the SAME number of tracks as the EN source, with
      matching track numbers; no track skipped or duplicated.
- [ ] **Section parity:** each translated track has the same `[bracketed]` section structure
      as its EN source (same verse/chorus/bridge layout).
- [ ] **Folder/file conventions:** folder mirrors EN; `lyrics/` present; filenames follow §7;
      persona/brand kept in English; album + song titles localized (or coined hook kept).
- [ ] **Metadata footers** present and correctly structured (vocal gender, ratings, titles).
- [ ] **No EN leftovers** in sung text (grep for untranslated English lines that aren't tags,
      cues, the `Style` block, or coined hooks).
- [ ] **Encoding:** files are valid UTF-8; spot-check rendering of the language's special
      characters/script.
- [ ] **Ledger updated** to "translated — QA passed" with date and the QA summary.

### 3C. Approval gates (release blockers)
- [ ] **Native faith-insider sign-off** for the language/tradition (naturalness + non-offense).
- [ ] **Project owner approval** on the release.
Until both are recorded, the album stays "QA passed — awaiting approval," not "released."

> Any failed gate → fix and re-run 3A/3B for that track/album. Do not partial-ship.

---

## PHASE 4 — Loop across the catalog & languages

1. Repeat Phases 1–3 for **every** target language in §1.
2. When a language is finished, optionally continue selecting the **next** most suitable
   untranslated album for that language (Phase 1 again) if the owner wants more than one album
   per language this run — otherwise advance to the next language.
3. Stop a language when its eligible pool is exhausted (log "catalog exhausted for <LANGUAGE>").
4. Continue until all languages are processed or the run's scope/quota is met.

**Selection integrity across the loop:** always re-read the ledger before each selection so an
album just translated into a language in this same run is not re-selected for it.

---

## 5. RUN REPORT (deliver at the end)

Produce a single summary report containing:
- **Per language:** the album(s) selected, the artist, the deciding suitability reasons, the
  new album code/path, track count, QA result, and approval status.
- **Skips:** albums skipped because already translated (with the existing code), and languages
  with an exhausted pool.
- **Exceptions:** any EN source albums excluded as incomplete/non-compliant.
- **Totals:** number of albums translated this run, by language; cumulative catalog coverage
  per language (e.g. "ES: 4/40 albums localized").
- **Follow-ups:** albums awaiting native sign-off, owner approval, or the Suno-side
  addictiveness re-rating (engine §10).

---

## 6. THE TRANSLATION LEDGER (single source of truth)

Maintain one ledger (e.g. a `.md` table or `.csv`) keyed by **album base code × language**.
Each row records at minimum:

| Field | Example |
|---|---|
| base_code | JEIM1069 |
| album_title_en | Jubilujah |
| artist / persona | (brand name) |
| language | Spanish |
| code | ES |
| status | not_started / selected / translated / qa_passed / approved / released / skipped_exists / pool_exhausted |
| new_album_code | JEIM1069ES |
| output_path | (folder path) |
| selected_reason | honor-shame-frame fit; flagship; persona genre fit |
| qa_summary | passed 3A/3B on (date) |
| native_signoff | yes/no + reviewer |
| owner_approval | yes/no + date |
| notes | coined hook kept; frame = honor–shame |

Rules:
- The "already translated?" check in Phase 1 reads this ledger first, then re-verifies the
  live catalog (Phase 1D).
- Every phase updates the relevant row. The ledger is what makes "skip if done → pick the next
  best" reliable across runs.

---

## 7. DECISION SUMMARY (quick reference for the agent)

1. Inventory the EN catalog → manifest + ledger (Phase 0).
2. For a language: build eligible pool (untranslated, complete) → score by cultural fit,
   flagship strength, artist fit, tractability, balance → pick the top (Phase 1).
3. Re-verify it isn't already translated; if it is, pick the next best (Phase 1D).
4. Translate with `/.prompts/translate_<LANGUAGE>.md`, sung text only, Suno structure intact,
   `Style` block English + "<LANGUAGE>-language vocal," code suffix EN → <CODE> (Phase 2).
5. QA (engine §8) + structural verification + approvals (Phase 3).
6. Update the ledger; loop to the next album/language (Phase 4); deliver the run report (§5).

**Authority:** the project owner holds final approval on all releases. When uncertain about a
cultural or denominational sensitivity, choose the broadest, most Scripture-plain option and
flag it rather than guessing.
