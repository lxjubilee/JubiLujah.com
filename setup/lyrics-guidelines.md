# Lyrics `.md` — Guidelines & Specification (the Caleb Format)

**File:** `setup/lyrics-guidelines.md`
**Status:** Binding standard for every new lyrics file in every Inspire-Family music workspace.
**Applies to:** JubileePraise.com, TorahSings.com, SingItDone.com, and any future music property that
carries the Jubilee album pipeline. Nothing in this file is JubileePraise-specific by design — see §15.
**Authority:** Gabriel Ungureanu (Founder). Every approval gate below resolves to him.
**Compiled:** 25 August 2026, by Melody Inspire.

**Where the standard came from.** It was read off the live catalogue, not invented here. Every Caleb
Inspire lyrics file on `J:/jubileepraise.com/music/inspire/caleb-inspire/` was surveyed — **159 files
across 106 album folders**. The field names, their casing, and their order in §6 are the *measured
majority*, not a preference: `Faith-Focus Rating` / `Earworm Rating` / `Bestseller Rating` appear in
576 song blocks (48 albums), against 216 blocks (18 albums) using the retired ALL-CAPS variant.
Where the live files and this specification disagree, **this specification governs new work**, and
§16 records the deviation honestly rather than pretending it does not exist.

**Companion documents.** This file specifies the *lyrics file*. It does not restate the craft law.

- The law: `.prompts/music_albums (Part 3) - Music SOP v2.md`
- The full capability: `setup/generatelyrics-jubileepraise.md` (this file supersedes its §16.3 and §16.5)
- Blueprint authoring: `.prompts/music_albums (Part 1) - blueprints.md`
- Lyric authoring: `.prompts/music_albums (Part 2) - content.md`

---

## 0. The rule in one paragraph

**Every album is exactly two markdown files: a `blueprint.md` that explains *why*, and a
`<Persona> Inspire-<Album Title>-lyrics.md` that carries *what Suno renders*.** The lyrics file is
twelve song blocks separated by `---`, and nothing else worth arguing about. A song block is a
three-line identity header, the word `LYRICS:`, the sung body in Suno bracket tags, then the
`Styles:` line and the numeric fields — **in that order, because that is copy-paste order into the
Suno UI**. If a line explains, justifies, rates the album, records a changelog, or would embarrass
you if Suno sang it aloud, it does not belong in the lyrics file.

---

## 1. Scope

**In scope:** the on-disk shape of a lyrics `.md`, its metadata fields, their order, the Suno
meta-tag rules, and the boundary against the blueprint.

**Out of scope, deliberately:** what makes a *good* lyric. Faith-Focus floors, the Three-Act model,
the Vertical Address standard, Fourth-Wall Discipline, the Prophetic Declaration Rule, cultural
vetting, and the rating stack all live in the SOP. This file tells you where the numbers go, not how
to earn them.

---

## 2. The two-file law

Every album folder carries **exactly one blueprint and exactly one lyrics file**. They are not two
drafts of the same document. They have different readers.

| | `blueprint.md` | `…-lyrics.md` |
|---|---|---|
| **Reader** | A human — the Founder at the approval gate, QA, a translator, whoever picks the album up in a year | **A renderer.** Suno first; the manifest tooling second |
| **Question it answers** | *Why does this album exist and what must each track accomplish?* | *What exactly gets sung, in what voice, at what tempo?* |
| **Voice** | Prose. Argument. Rationale | Song text and flat `Key: value` fields |
| **Lifecycle** | Approved once, then frozen | Revised until the render is right |
| **If it is wrong** | The album is rebuilt | The track is regenerated |

### 2.1 The boundary test

Before a line goes into the lyrics file, ask **one** question:

> **Does Suno need this to render the song, or does a human need this to understand the album?**

Renders → lyrics file. Understands → blueprint. There is no third bucket. When a thing genuinely
serves both — the fusion name, the key, the BPM — the **lyrics file gets the compressed operational
form** (inside `Styles:`) and the **blueprint gets the explanation**.

### 2.2 What lives where — the settled list

| Content | Home |
|---|---|
| Theme statement, album vision, listener wounds | blueprint |
| Genre Fusion Laboratory (Stages 1–5), Sonic DNA extraction | blueprint |
| Three-Act arc, act boundaries, narrative rationale | blueprint |
| Track-by-track pre-production briefs | blueprint |
| Testimony Anchor documentation, Cross-Tradition vetting, Viral Trait checklist | blueprint |
| Album-level rating averages and quality-gate checklists | blueprint |
| Slot / pre-chorus / bridge / outro **rotation tables and audits** | blueprint |
| Scripture anchors and theological anchor lists | blueprint (track brief) |
| Release status, CDN paths, track UUIDs, artwork paths | `album.meta.json` |
| **Sung lyric text** | **lyrics** |
| **Suno bracket tags** | **lyrics** |
| **`Styles:` string** | **lyrics** |
| **Per-song numeric ratings** | **lyrics** |
| **Per-song archetype label (one line)** | **lyrics** |
| **Estimated length** | **lyrics** |

> 🔴 **The most common defect in the live catalogue is blueprint bleed** — a lyrics file that opens
> with a Genre Fusion summary and closes with a Cross-Tradition attestation and a Viral Trait
> paragraph. `CAIM1051EN` does exactly this. It is not the standard; it is the thing this document
> exists to stop.

---

## 3. File identity

| Property | Rule |
|---|---|
| **Path** | `<album folder>/lyrics/<Persona> Inspire-<Album Title>-lyrics.md` |
| **Sibling** | `<album folder>/lyrics/blueprint.md` |
| **Album folder** | `<CODE><LANG>-<kebab-slug>` — e.g. `CAIM1051EN-jesus-saves-from-the-fire` |
| **Album title in filename** | The **display title**, spaces and capitals intact, in the album's own language and script (`Caleb Inspire-Nădejdea Învierii-lyrics.md`) |
| **Encoding** | UTF-8, **no BOM.** 15 of 97 surveyed Caleb files carry a BOM; it breaks naive parsers and is a defect, not a variant |
| **Line endings** | LF |
| **Final line** | Ends with a single newline; no trailing blank block |
| **Separator** | A standalone `---` line between song blocks, one blank line either side |
| **Fenced code blocks** | **Forbidden anywhere in the file.** No exceptions |
| **Markdown headings inside song blocks** | **Forbidden.** `#` may appear only in the album header block (§5) |

**Album code shape:** `<PERSONA2><CAT2><NNNN><LANG2>` — `CAIM1051EN`, `MDIM1055EN`, `JEIM1070EN`.
The last two letters are the language suffix and swap on translation.

---

## 4. File anatomy — three zones, in this order

```
ZONE 1   Album header block            ~6–10 lines. The only prose in the file. §5
         ---
ZONE 2   Song block 01                 §6
         ---
         Song block 02
         ---
         …
         Song block 12
ZONE 3   (optional) Hebrew Dictionary  §6.9
```

There is no zone 4. No changelog trailer, no compliance attestation, no album averages.

---

## 5. Zone 1 — the album header block

**Purpose:** identify the file. Nothing else. It is the only place a `#` heading or a `**bold**`
label is permitted, and it is capped at **ten lines**.

**Required, exactly these five lines:**

```
# <Album Title> — Album Lyrics

**Album Code:** <CODE><LANG> · **Artist:** <Persona> Inspire · **Tracks:** 12
**Fusion:** <Genre A> × <Genre B>
**Opener BPM:** <n> · **Finale Key:** <key>
**Lyrics Last Updated:** YYYY-MM-DD
```

**Permitted sixth line, only when the album is a translation:**

```
**Source:** <SOURCE CODE>EN · **Language:** <Language> (<ISO>) · **Translator gate:** <name or "pending">
```

**Forbidden in the header block:** three-act descriptions, slot rotations, signature-texture prose,
theological anchor lists, identity-DNA paragraphs, rating averages, and `<!-- VERSION CONTROL -->`
changelog blocks. **Version history belongs in git and in `album.meta.json.rebuild_notes[]`** — a
lyrics file carrying three paragraphs of changelog is doing the blueprint's job and the
version-control system's job at once.

---

## 6. Zone 2 — the song block

### 6.1 The canonical shape

This is the specification. Twelve of these, `01` through `12`.

```
SONG TITLE: <NN> <Title>
ARTIST: <Persona> Inspire
ARCHETYPE: <slot letter> — <archetype name> · <one-clause function> · Hook lands <M:SS>

LYRICS:

[Intro]
[Piano]

[Hook]
[Male Vocal]
<hook lines>

[Verse 1]
<lines>

[Pre-Chorus]
<lines>

[Chorus]
<lines>

[Verse 2]
<lines>

[Pre-Chorus]
<lines>

[Bridge]
[Strip-Down]
<lines>

[Final Chorus]
<lines>

[Outro]
<lines>

Styles: <≤800 characters, first 250 load-bearing — see §8>

VOCAL GENDER: <Male Lead | Female Lead | Duet | … + detail>
Weirdness: <nn>%
Style Influence: <nn>%
Faith-Focus Rating: <nn>%
Praise vs. Worship Rating: <nn>%
Prophetic Declaration Rule: <nn>% (Saturation <nn>/40 · Anchoring <nn>/30 · Burden <nn>/20 · Heat <nn>/10)
Declare beats: <sections, ≥2 in verses> · Anchors: word <section> · Ruach <section> · "You said it" <section>
Earworm Rating: <nn>%
Bestseller Rating: <nn>%
Estimated Length: <M:SS>
Song Title: <NN> <Title>
Save To: <Album Title>
```

### 6.2 Why the order is the order — this is the whole point

The block is not arranged by importance. **It is arranged in the order a human copies it into the
Suno UI**, top to bottom, without scrolling back:

| Block region | Where it goes in Suno |
|---|---|
| `SONG TITLE:` (line 1) | the song's title field |
| everything between `LYRICS:` and the blank line before `Styles:` | **the Lyrics box — pasted whole, verbatim** |
| `Styles:` | the Style / Style of Music box |
| `VOCAL GENDER:` … `Bestseller Rating:` | UI toggles, sliders, and the house ledger |
| `Estimated Length:` | render-length target |
| `Song Title:` (footer echo) | confirmation the paste did not slip a block |
| `Save To:` | the workspace/album the render is filed under |

**Consequences that are not negotiable:**

1. **`Styles:` comes *after* the lyric body, never before it.** A style string above the lyrics puts
   a non-sung paragraph inside the copy range. Suno will sing it.
2. **Nothing may sit between the last `[Outro]` line and `Styles:` except one blank line.** No
   scripture anchor, no production note, no separator. Anything parked there lands in the Lyrics box
   and gets vocalised. *(This is why scripture anchors — present in 8 surveyed Caleb albums — are
   ruled out of the lyrics file in §2.2. They belong in the blueprint track brief.)*
3. **The `Song Title:` footer echo is mandatory** and must match line 1 byte for byte. It is the
   cheap integrity check that catches a half-pasted block.

### 6.3 The three-line identity header

- **`SONG TITLE:`** — `NN Title`. **The two-digit track prefix is mandatory**, `01`–`12`, zero-padded.
  No title without its number. `album.meta.json.tracks[].track_title` uses the same `NN Title` form.
- **`ARTIST:`** — the persona's full name, always `<Given> Inspire`. Never a real artist, never a slug.
- **`ARCHETYPE:`** — one line, no wrapping. Slot letter (A–H, from the eight-archetype rotation) —
  archetype name — one clause on the track's job — the hook timestamp. This is the single piece of
  blueprint vocabulary the lyrics file is allowed, because the renderer's operator needs it at a glance.

### 6.4 `LYRICS:`

Literal, uppercase, colon, alone on its line, followed by one blank line. It is the paste marker.

### 6.5 The sung body

See §7. It contains bracket tags and sung lines. Nothing else.

### 6.6 `Styles:`

See §8.

### 6.7 The numeric fields

See §9. Flat `Key: value`, one per line, no blank lines between them, no bullets, no bold.

### 6.8 `Save To:`

The album's display title. It is what the render is filed under, and it must match the album title
in the filename and the header block.

### 6.9 Zone 3 — the Hebrew Dictionary (optional)

Only when the album's sung text carries Hebrew or transliterated Hebrew. Placed once, at the end of
the file, after the last song block:

```
HEBREW DICTIONARY

- Hallelujah — הַלְלוּיָהּ — praise Yahuah (Anglicized)
```

If the album uses no Hebrew, **omit the section entirely.** Do not write a paragraph explaining that
there is no Hebrew — that is blueprint prose wearing a dictionary's coat.

---

## 7. Suno meta-tag law

Suno reads bracketed text as direction and sings everything else. That single fact generates every
rule below. Suno publishes no official tag list, and the tag vocabulary is unchanged through V5.5 —
so the house keeps a **closed whitelist** rather than chasing community tag dumps.

### 7.1 Syntax — five rules

1. **Square brackets only:** `[Chorus]`. A typo, a curly brace, or a missing bracket means the tag is
   sung aloud. This is the number-one cause of a tag turning up in the audio.
2. **A tag sits alone on its own line**, immediately above the lines it governs.
3. **Tags are always written in English**, in every language edition of the album. The lyric is
   translated; the direction is not.
4. **Title Case** for structural tags (`[Pre-Chorus]`, not `[pre-chorus]`). Suno is case-insensitive;
   the house is not — consistency is what makes the corpus greppable.
5. **A parameterised tag is permitted** where it replaces a separate cue line:
   `[Bridge: stripped down, piano only]`.

### 7.2 The whitelist — do not invent tags outside it

**Structural (one per section, mandatory):**
`[Intro]` `[Verse 1]` `[Verse 2]` `[Verse 3]` `[Pre-Chorus]` `[Chorus]` `[Post-Chorus]` `[Hook]`
`[Refrain]` `[Bridge]` `[Final Chorus]` `[Tag]` `[Breakdown]` `[Instrumental]` `[Solo]` `[Build]`
`[Drop]` `[Outro]` `[End]`

**Instrument / production cues (between or under a structural tag):**
`[Piano]` `[Acoustic Guitar]` `[Upright Bass]` `[Strings Rise]` `[Cello]` `[Organ]` `[Foot Stomp]`
`[Finger Snaps]` `[Full Band]` `[Strip-Down]` `[Held Breath]` `[Silence]` `[Key Change]`
`[Half-Time Feel]` `[Double-Time]` `[Beat Drop]` `[Harmony Bloom]` `[Fade Out]` `[Fade In]`

**Vocal direction:**
`[Male Vocal]` `[Female Vocal]` `[Single Voice]` `[Harmony]` `[Spoken Word]` `[Whispered]`
`[Ad-Lib]` `[Melisma]` `[Shout Chorus]` `[Intimate Delivery]` `[Declarative]` `[Prayerful]`
`[Tender]` `[Raw Emotion]` `[Commanding Voice]`

Anything not on this list is added by **amending this file**, not by writing it into a song.

### 7.3 What a bracket tag is not

- **It is not a deterministic command.** It is a generative signal. Write the arrangement into the
  `Styles:` string as well; do not rely on a tag alone to force a change.
- **It is not a place for negative instruction.** `[no drums]` and `[no vocals]` do not work. Drums
  come out via the `Styles:` description and Suno's own Exclude field; an instrumental track is made
  with Instrumental mode, not a tag.
- **It is not a footnote channel.** A bracket is not where you put a scripture reference, a track
  cross-reference, or a note to the mix engineer.

### 7.4 The sung body — hard prohibitions

Inside the lyric body, between the tags:

- **No fourth-wall references** (SOP Non-Negotiable #17). Never "this album", "this record",
  "this track", "Track 3", "twelve songs in", "the title track", "the opener", "the closer".
  Suno sings them. A song carrying one cannot be released as a single or survive a shuffled playlist.
  Use story-world anchors instead — "this journey", "this long road", "before the night is over".
- **No unbracketed stage directions.** A line that is not sung is a tag, or it is deleted.
- **No markdown.** No `**bold**`, no `_italic_`, no lists, no headings. Suno renders text literally.
- **No "Allah"** (SOP Non-Negotiable #18) — anywhere in the file, `Styles:` included. Non-divine-name
  Arabic (Yasu'a, Ya Rabb, al-Masih, Ruh, Habibi) remains welcome.
- **Divine-name conventions hold** (SOP #13/#14): Yahuah, Yeshua, Elohim, Ruach HaKodesh — feminine
  pronouns for the Ruach; never "the Ruach HaKodesh"; likewise HaMashiach, HaTorah.
- **Diacritics and full script are mandatory in translations.** Suno pronounces from the text.
  Arabic requires full tashkīl.

---

## 8. The `Styles:` line

One line. No wrapping into a paragraph, no bullets, no bold.

| Rule | Value |
|---|---|
| **Hard cap** | **800 characters.** Count characters, not words |
| **Load-bearing head** | **First 250 characters.** Suno weights the opening most heavily |
| **Chars 1–250** | Vocal identity + core genre fusion + signature instruments + BPM + key |
| **Chars 251–550** | Mood, emotional payload, production technique |
| **Chars 551–800** | Texture, atmosphere, arrangement shape, hook timing, finishing detail |
| **Real artist names** | **Forbidden.** Replace with vivid auditory description. "Sounds like <artist>" is unreliable in Suno and filtered in the house |
| **Negative instructions** | Forbidden — they are ignored. State what you *want* |
| **Filler** | Forbidden. If you cannot say something specific and useful, stop early |
| **Divine-name discipline** | Applies inside `Styles:` exactly as in the lyric body |

**Front-load in this order** — genre before subgenre, dominant partner first. "CCM × Broadway
musical-theatre" and "Broadway musical-theatre × CCM" render as different records.

---

## 9. The numeric fields

Flat `Key: value`, in the §6.1 order, no blank lines between them.

| Field | Format | Band / floor |
|---|---|---|
| `VOCAL GENDER:` | free text | Lead gender first, then backing detail |
| `Weirdness:` | `nn%` | 30–50% typical · 55–75% prophetic/experimental |
| `Style Influence:` | `nn%` | 65–80% typical; higher = stricter adherence |
| `Faith-Focus Rating:` | `nn%` | Per-persona floor (Zev/Imani 90 · Jubilee/Zariah/Nova/Caleb/Gabriel 80 · Elias/Eliana/Santiago/Tahoma/Amir 70 · Melody exempt) |
| `Praise vs. Worship Rating:` | `nn%` or `nn% praise / mm% worship` | SOP §5.2 |
| `Prophetic Declaration Rule:` | `nn% (Saturation nn/40 · Anchoring nn/30 · Burden nn/20 · Heat nn/10)` | **≥85% to ship.** SOP §5.5 |
| `Declare beats:` / `Anchors:` | section names | 4–5 declare beats, **≥2 in the verses**; Ruach anchor ≥1; "You said it" seam ≥1 |
| `Earworm Rating:` | `nn%` | SOP §5.4 |
| `Bestseller Rating:` | `nn%` | Album target 95%+ average |
| `Addictiveness:` *(optional)* | `Hook nn / Groove nn / Replay nn / DynPay nn / EmoPull nn / Loop nn · Composite nn.n%` | Only on albums that have had the Addictiveness pass |
| `Estimated Length:` | `M:SS` | **3:30 minimum, 4:00 maximum.** SOP Non-Negotiable #2 |

> **`Prophetic Declaration Rule:` and `Declare beats:` are required on all new work** (Non-Negotiable
> #20, added 2026-08-14). They are absent from every Caleb file authored before that date. Do not
> read their absence in the live corpus as permission to omit them — see §16.

---

## 10. The ban list — never in a lyrics file

Each of these was found in live files. Each has a home, and it is not this one.

| Banned | Belongs in |
|---|---|
| Fenced code blocks | nowhere in a lyrics file |
| Markdown headings inside a song block | blueprint |
| `<!-- VERSION CONTROL -->` changelog blocks | git history · `album.meta.json.rebuild_notes[]` |
| "Fusion Style / Signature Texture / Three-Act Arc" prose | blueprint §Genre Fusion, §Three-Act |
| Slot / pre-chorus / bridge / outro rotation audits | blueprint |
| "V3 COMPLIANCE CONFIRMED" attestations | blueprint §Quality Gates |
| Cross-Tradition Sensitivity attestations | blueprint §Cross-Tradition |
| Viral Trait checklists | blueprint §Viral Trait Checklist |
| Album rating averages | blueprint §Album-Level Ratings |
| Theological / scripture anchor lists | blueprint track brief |
| "Identity DNA Preserved" paragraphs | persona protocol · blueprint |
| `Status:` / release state | `album.meta.json.release_status` |
| CDN URLs, UUIDs, artwork paths | `album.meta.json` |
| A song title without its `NN` prefix | — fix the title |
| Real artist names in `Styles:` | — rewrite as auditory description |
| The word "Allah" | — rewrite (SOP #18) |
| Fourth-wall references in sung text | — rewrite with story-world anchors (SOP #17) |

---

## 11. Translated albums

A translation is the same specification with five differences.

1. **Filename and `Save To:` carry the localised title** in native script:
   `Caleb Inspire-Nădejdea Învierii-lyrics.md`, `Save To: Nădejdea Învierii`.
2. **The album code's language suffix swaps**, and only that: `CAIM1014EN` → `CAIM1014RO`. The folder
   slug becomes `CAIM1014RO-nadejdea-invierii`.
3. **Bracket tags stay in English, byte-identical to the source.** The lyric is translated; the
   direction is not. Suno has no language dropdown — the language comes from the sung text.
4. **`Styles:` is re-authored, not translated.** It stays in English; vocal-register and instrument
   descriptions carry over unchanged, and only culturally-specific instrumentation is adapted.
5. The header block gains the `**Source:**` line (§5).

Track numbers, track order, archetype letters, and section-tag positions are **identical to the
source album**. A translation that re-orders sections has broken the manifest.

---

## 12. Step-by-step — authoring a lyrics file

Run these in order. Step 1 has a gate; do not start at step 3.

1. **Confirm the blueprint exists and is approved.** No approved blueprint, no lyrics file. If the
   blueprint is missing, the first move is to author it — never to write track 1.
2. **Create the album folder** `<CODE><LANG>-<kebab-slug>/` with `lyrics/`, `tracks/`, `artwork/`,
   `manifest/`, and the CDN tier folders. Put `blueprint.md` in `lyrics/`.
3. **Create the lyrics file** at `lyrics/<Persona> Inspire-<Album Title>-lyrics.md`, UTF-8 without BOM.
4. **Write the album header block** (§5). Five lines. Stop.
5. **For each track 01→12, in order:**
   1. Read the track's brief in the blueprint — slot letter, archetype, act position, subtheme,
      pre-assigned ratings, BPM, key.
   2. Write the three-line identity header (§6.3).
   3. Write `LYRICS:` and the sung body, tags first, lines under them (§7).
   4. **Run the craft gates on the body before you write a single number:** hook lands ≤0:15 ·
      vertical address · ≥3 sensory anchors · bridge is a first-person declaration ·
      call-and-response zone · ministry moment · 4–5 declare beats with ≥2 in the verses ·
      no fourth-wall reference.
   5. Write `Styles:` (§8). Count the characters. 800 is a wall, not a target.
   6. Write the numeric fields in the §6.1 order. Score honestly — a rating you cannot defend is a
      fabricated number, and it will be read as a measurement by whoever comes next.
   7. Close the block with the `Song Title:` echo and `Save To:`.
   8. Write a standalone `---`.
6. **Add the Hebrew Dictionary** only if the album sings Hebrew (§6.9).
7. **Run the validator** (§13). Fix every failure. Structural failures are not judgement calls.
8. **Read one random track aloud, from `LYRICS:` to `Styles:`.** If anything you read is not meant to
   be sung, it is in the wrong place.
9. **Update `album.meta.json`** — `lyrics_md_present`, `track_count`, and each `tracks[].track_title` /
   `track_slug`. 🔴 **Edit `tracks[]` entries in place.** Replacing the array with plain strings
   destroys track UUIDs and CDN URLs and is unrecoverable.
10. **Hand to QA.** The writer does not approve the writer's work. Four-axis QA, then the Founder's gate.
11. **Render, then reconcile.** After the Suno render, correct `Estimated Length:` to the actual
    duration — and if it fell outside 3:30–4:00, the song is re-cut, not re-labelled.
12. **Commit.** The changelog lives in the commit message, not in the file.

---

## 13. Validation

### 13.1 The 20-point structural checklist

Every one is objective. A human does not adjudicate these.

1. UTF-8, no BOM, LF endings
2. Filename is `<Persona> Inspire-<Album Title>-lyrics.md`
3. Header block present, ≤10 lines, no changelog
4. Exactly 12 `SONG TITLE:` lines
5. Every `SONG TITLE:` starts `01`–`12`, zero-padded, each used once
6. Every block has `ARTIST:` and `ARCHETYPE:`
7. Every block has `LYRICS:` alone on its line
8. Blocks separated by a standalone `---`
9. Zero fenced code blocks in the file
10. Zero `#` headings outside the header block
11. Every bracket tag is on the §7.2 whitelist
12. Every bracket tag sits alone on its own line
13. Every bracket is balanced — no `[` without `]`
14. Exactly one blank line between the last lyric line and `Styles:`
15. `Styles:` ≤ 800 characters
16. All required numeric fields present, in §6.1 order
17. `Estimated Length:` between 3:30 and 4:00
18. `Prophetic Declaration Rule:` present and ≥85%
19. `Song Title:` footer matches `SONG TITLE:` exactly
20. Banned strings absent: "this album", "this record", "this track", "Track N", "Allah", any real artist name

### 13.2 Validator

`node tools/check-lyrics.mjs "<path to lyrics .md>"` — implement against the checklist above. The
core of it:

```js
const TAG_SHAPE = /^\[[A-Z][A-Za-z0-9 '\u2019-]*(?::[^\]]+)?\]$/;
const REQUIRED = [
  'VOCAL GENDER:', 'Weirdness:', 'Style Influence:', 'Faith-Focus Rating:',
  'Praise vs. Worship Rating:', 'Prophetic Declaration Rule:', 'Earworm Rating:',
  'Bestseller Rating:', 'Estimated Length:', 'Song Title:', 'Save To:',
];
const BANNED = [/\bthis album\b/i, /\bthis record\b/i, /\bthis track\b/i, /\bTrack \d\b/, /\bAllah\b/];

// 1. split the file on standalone '---', drop the header block, expect 12 song blocks
// 2. per block: identity header -> 'LYRICS:' -> body -> blank line -> 'Styles:' -> fields
// 3. body: every line starting '[' must fullmatch TAG_SHAPE and be on the whitelist
// 4. styles: block.match(/^Styles: (.*)$/m)[1].length <= 800
// 5. fields: REQUIRED present, in order; BANNED absent from the body
```

Fail loudly with the block number and the line. A validator that warns is a validator that gets
ignored.

---

## 14. Canonical worked example

One complete, compliant song block. This is the shape to copy.

```
SONG TITLE: 01 The Bells Go Off
ARTIST: Caleb Inspire
ARCHETYPE: A — Intimate-Fusion Opener · thesis statement, underscored monologue build · Hook lands 0:08

LYRICS:

[Intro]
[Piano]
[Foot Stomp]

[Hook]
[Male Vocal]
The bells go off — I run.
The bells go off — I run.

[Verse 1]
[Male Vocal]
Two in the morning and the tones drop hard,
boots by the bed and I'm out the door.
Six-eleven, the dispatch crackles —
a house on the corner with a kid on the fourth floor.

[Pre-Chorus]
I don't run away, I run toward.
I don't stand back, I kick the door.

[Chorus]
[Male Vocal]
The bells go off — I run.
Somebody's trapped and I won't leave them there,
under the smoke, in the heat, in the glare.
But there's a Firefighter in white who runs in too —
and He gets to the ones I never could.

[Bridge]
[Strip-Down]
[Single Voice]
Somebody's trapped and I won't leave them there.
[Held Breath]
But there is One who can reach where I can't.

[Strings Rise]

[Final Chorus]
[Harmony Bloom]
The bells go off — I run.
Somebody's trapped and I won't leave them there —
and He gets to the ones I never could.

[Outro]
[Harmony]
I run, I run, I run.
[Foot Stomp]

Styles: Caleb Inspire warm rasped baritone B2-D4, breath-forward, no pitch correction, preserved cracks, chest-rich D3-B3 pocket on the hook. CCM x Broadway musical-theatre, intimate storytelling. Felt upright piano with driving left-hand pulse, cello, small chamber strings, sparse finger-picked acoustic, foot-stomp and finger-snap groove, light brushed percussion, warm room reverb, single close harmony as theatrical backing. E major, 100 BPM. Cold-open hook at 0:08 re-hit every eight bars; strip-down to one dry voice and a held breath before the bridge; harmony bloom on the final chorus. Breath-into-exhale payoff. Family-friendly. 3:50.

VOCAL GENDER: Male Lead with single close harmony (theatrical backing)
Weirdness: 36%
Style Influence: 86%
Faith-Focus Rating: 86%
Praise vs. Worship Rating: 70%
Prophetic Declaration Rule: 88% (Saturation 34/40 · Anchoring 26/30 · Burden 19/20 · Heat 9/10)
Declare beats: Verse 1 · Verse 2 · Chorus · Bridge · Final Chorus · Anchors: word Verse 2 · Ruach Bridge · "You said it" Final Chorus
Earworm Rating: 86%
Bestseller Rating: 88%
Estimated Length: 3:50
Song Title: 01 The Bells Go Off
Save To: Jesus Saves from the Fire
```

*(The `Styles:` string above is 638 characters. The lyric body is trimmed here for space; a shipping
block runs its full verse and chorus counts.)*

---

## 15. Porting this standard to another workspace

Nothing above is JubileePraise-specific except the paths. To adopt it elsewhere:

1. Copy this file to `<workspace>/setup/lyrics-guidelines.md`.
2. Set the **album root** for that property (JubileePraise: `J:/jubileepraise.com/music/`;
   Torah Sings: `J:/torahsings.com/music/`).
3. Set the **persona → code prefix** table for the personas that property carries.
4. Set the **Faith-Focus floors** for those personas (§9).
5. Confirm the **SOP path** — if the property has no SOP of its own, it inherits
   `.prompts/music_albums (Part 3) - Music SOP v2.md` from JubileePraise, and says so in writing.
6. Drop in `tools/check-lyrics.mjs` (§13.2) and wire it into that workspace's pre-commit or
   `deploy/check-*` step.
7. **Do not fork the field list.** A second property with a different field order fragments the
   corpus and breaks every cross-property tool. Field changes are amendments *here*, dated in §17,
   and propagated.

---

## 16. Known deviations in the live catalogue — read before "fixing" anything

Measured 25 August 2026 across the 159 Caleb Inspire lyrics files. These are recorded so nobody
mistakes an old file for the standard, and nobody "restores" a retired convention.

| Deviation | Scale | Ruling |
|---|---|---|
| ALL-CAPS field names (`STYLES:` `VOCAL:` `WEIRDNESS:` `FAITH-FOCUSED RATING:` `BESTSELLER POTENTIAL:` `CONCERT ENGAGEMENT:`) | 18 albums / 216 blocks — e.g. `CAIM1008EN` | **Retired.** Mixed case per §6.1. Do not propagate |
| `CONCERT ENGAGEMENT:` field | 8 albums | **Retired.** Not part of the rating stack |
| `Scripture anchor:` inside the copy range | 8 albums | **Removed** — it gets sung. Move to the blueprint track brief |
| `<!-- VERSION CONTROL -->` changelog blocks | widespread | **Removed.** Git + `album.meta.json` |
| Album-level fusion / arc / rotation front-matter | widespread | **Removed.** Blueprint |
| "V3 COMPLIANCE" / Cross-Tradition / Viral Trait trailers | widespread — e.g. `CAIM1051EN` | **Removed.** Blueprint |
| UTF-8 BOM | 15 of 97 | **Defect.** Strip on next touch |
| `Prophetic Declaration Rule:` missing | every file authored before 2026-08-14 | Expected. Required on all new and revised work |
| `ARCHETYPE HEADER:` / `Archetype Slot:` variants | 9 albums | **Retired.** Use `ARCHETYPE:` |
| Older `Save To: <persona-slug>/lyrics/` form | early albums | **Superseded.** `Save To: <Album Title>` |

**Back-filling the corpus is a separate, tooled project.** Do not hand-edit 937 albums. Existing
files are corrected when they are next touched for another reason.

---

## 17. Amendments

Amend in place with `(added YYYY-MM-DD)` and the reason. Downstream scripts and translation prompts
cite section numbers — **do not renumber sections.**

- **2026-08-25 — v1.0.** Standard extracted from the Caleb Inspire corpus and written down.
  Supersedes `setup/generatelyrics-jubileepraise.md` §16.3 (Format C) and §16.5 (tag whitelist) as the
  authority on lyrics-file shape. Rulings made here that the corpus does not yet reflect: scripture
  anchors out of the copy range; version-control blocks out of the file; blueprint front-matter and
  QA trailers out of the file; `Prophetic Declaration Rule:` into the required field set; mixed-case
  field names canonical; BOM declared a defect.
