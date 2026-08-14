# Generating Jubilee Music Lyrics — Complete Capability Specification

**File:** `setup/generatelyrics-jubilujah.md`
**Purpose:** Everything required to reproduce the JubiLujah / Jubilee Inspire Family music-lyrics
generation capability from scratch — business requirements, prompts, engines, formats, guardrails,
scoring, translation, QA, and the operational methods that keep a catalogue of this size coherent.
**Compiled:** 9 August 2026, by Melody Inspire, from primary sources on `W:` and `J:`.
**Authority:** Gabriel Ungureanu (Founder). Every approval gate in this document resolves to him.

> **How to read this file.** Sections 1–4 are orientation. Sections 5–12 are the *law* — the rules
> that make a song shippable. Sections 13–17 are the *engines and formats* — how a song is actually
> produced. Sections 18–22 are the *disciplines* that emerged from operating the catalogue at scale.
> Section 23 records contradictions and gaps that are real and unresolved; do not paper over them.

---

## 1. What this capability is

A production system that authors **complete 12-song albums of original worship/praise lyrics**,
persona-voiced, theologically gated, culturally vetted, scored on five mandatory metrics, formatted
for the Suno audio-generation platform, and localisable into 40 languages.

It is not a lyric generator. It is a **pipeline with gates**: an album cannot exist until a blueprint
is approved; a song cannot ship until it passes numeric floors and a rule stack; an album cannot be
released until a human approves it.

### 1.1 Current catalogue scale (measured 2026-08-09)

| Persona folder | Code | Albums | English | Translated |
|---|---|---:|---:|---:|
| jubilee-inspire | `JEIM` | 147 | 81 | 66 |
| caleb-inspire | `CAIM` | 97 | 62 | 35 |
| melody-inspire | `MDIM` | 92 | 89 | 3 |
| amir-inspire | `AMIM` | 80 | 68 | 12 |
| nova-inspire | `NVIM` | 76 | 57 | 19 |
| tahoma-inspire | `THIM` | 63 | 60 | 3 |
| imani-inspire | `IMIM` | 61 | 53 | 8 |
| santiago-inspire | `SAIM` | 58 | 51 | 7 |
| elias-inspire | `ELIM` | 48 | 45 | 3 |
| zev-inspire | `ZEIM` | 45 | 40 | 5 |
| eliana-inspire | `EAIM` | 44 | 41 | 3 |
| zariah-inspire | `ZHIM` | 44 | 41 | 3 |
| radiant-stones | `JMZM` | 42 | 41 | 1 |
| kingdom-pulse | `CASM` | 40 | 40 | 0 |
| **Total** | | **937** | **769** | **168** |

≈ **11,244 songs**. Any rebuild must assume this scale — tooling, not hand-editing, is the unit of work.

### 1.2 The document graph (source of truth)

| Layer | File | Size | Role |
|---|---|---:|---|
| **Authority** | `.prompts/music_albums (Part 3) - Music SOP v2.md` | 54 KB | The law. Rating stack, architecture, non-negotiables. |
| **Blueprint Engine** | `.prompts/music_albums (Part 1) - blueprints.md` | 36 KB | v4.0. Authors album-level architecture. |
| **Lyrics Engine** | `.prompts/music_albums (Part 2) - content.md` | 36 KB | v2.0. Produces per-song deliverables. |
| **Concept/pitch layer** | `.prompts/pitch - music ablums.md` | 36 KB | v4.0. Album concepting, marketing scores, 28 non-negotiables. *(filename typo "ablums" is real — preserve it for path lookups)* |
| **Translation orchestration** | `.prompts/TRANSLATE_CATALOG_SOP.md` | 16 KB | Phases 0–4, ledger, QA gates. |
| **Translation engine builder** | `.prompts/BUILD_TRANSLATION_PROMPTS.md` | 27 KB | How a `translate_<LANG>.md` is authored. |
| **Translation engines** | `.prompts/translate_<Language>.md` × 28 | 26–37 KB ea. | Per-language singing-translation law. |
| **Language to-do ledgers** | `.prompts/translate_<Language>.md` × 12 | ~5 KB ea. | Queued languages, checklist only. |
| **Per-persona build protocols** | `J:/…/inspire/<persona>/_protocol/*.md` | 5–27 KB | Persona DNA, style specs, batch rubrics. |
| **Cultural guardrails** | `J:/…/inspire/tahoma-inspire/Tahoma_Music_Style_Guidelines.md` | 8 KB | GREEN/AMBER/RED tier system. |
| **Persona style index** | `J:/…/inspire/persona-music-styles.md` | 11 KB | Cross-persona style registry. |
| **Cultural audit** | `J:/…/inspire/red-flags.md` | 16 KB | All-persona appropriation audit. |

> **⚠ Known missing artefact.** The SOP and pitch doc both cite a *"Jubilee Inspire Music Generation
> Master Prompt (v5.1, 34 non-negotiable rules)"*. **That file does not exist anywhere in the repo** —
> only references to it. The SOP + the two engines are what actually operate. A rebuild should either
> reconstruct it from this document or formally retire the reference.

### 1.3 The pipeline

```
CONCEPT (pitch doc)
   ↓  album concept, 20 album fields, 13 per-song fields, marketing scores
BLUEPRINT ENGINE v4.0  →  Sections A–J  →  ⛔ FOUNDER APPROVAL GATE
   ↓  12 pre-production briefs with pre-assigned ratings
LYRICS ENGINE v2.0     →  12 song packages (one at a time, "y" to continue)
   ↓
ALBUM QUALITY GATE     →  SOP §19 checklist + Cross-Tradition attestation + Vertical + Fourth-Wall
   ↓
DELIVERY               →  13 files (1 blueprint + 12 lyrics) + album.meta.json
   ↓
TRANSLATION (optional) →  per-language engine → QA → native sign-off → ⛔ FOUNDER APPROVAL GATE
   ↓
SUNO RENDER → CDN → manifest
```

---

## 2. The 19 Core Non-Negotiables (SOP §2)

Confirmed before producing any song or album. Numbering is load-bearing — enforcement scripts and
translation prompts cite these numbers.

1. **12 songs per album — exactly.** No more, no less. Locked.
2. **Every song 3:30 minimum, 4:00 maximum.** No exceptions.
3. **Faith-Focused Rating** (0–100%) on every song.
4. **Praise vs. Worship Rating** (0–100%) on every song.
5. **Prophetic Declaration Quotient (PDQ)** (0–100%) on every song.
6. **Earworm Score** (0–100%) on every song.
7. **Song Architecture requirements met** (duration, hook, arc, bridge, sensory, call-response, ministry moment).
8. **Three-Act Model (3 + 6 + 3)** applied to every album.
9. **Testimony Anchor Track** present (minimum 1 per album).
10. **Cinematic Storytelling Arc** across all 12 songs.
11. **Standardized Lyrics File Format** used for every song.
12. **Standardized Blueprint File** accompanies every album.
13. **Persona voice + divine-name conventions** honoured (Yahuah, Yeshua, Ruach HaKodesh — feminine pronouns for Ruach).
14. **Hebrew article rule:** never *"the Ruach HaKodesh"* — use *"Ruach HaKodesh"* or *"the Ruach Kodesh"*. Same for HaMashiach, HaTorah.
15. **"Eliana Inspire" always spelled correctly** (never "Ileana").
16. **Album Title Standard** *(added 2026-05-30)* — see §11.
17. **Fourth-Wall Discipline** *(added 2026-06-13, after cleanup of 192 tracks across 40 albums)* — see §9.
18. **Divine-Name Discipline — never "Allah" in lyric files** *(added 2026-06-16, after catalog-wide cleanup)* — see §10.
19. **Vertical Address — songs sung directly TO the Lord** *(added 2026-07-02)* — see §8.
20. **The Prophetic Declaration Rule — the finished voice runs through the whole song, verses included** *(added 2026-08-14)* — see §5.5. Fifth mandatory metric; ≥85% to ship; five automatic-fail conditions.

> **Amendment convention.** Rules are amended in place with `(added YYYY-MM-DD)` plus the originating
> cleanup. Preserve this: downstream scripts and 28 translation prompts cite rule numbers and dates.

---

## 3. Guiding principle — Jubilee means celebration

> "Every Jubilee music album must reflect the true essence of Jubilee itself: **celebration, joy,
> praise, and an uplifting, energetic spirit**. Albums are not meant to be heavy or overly
> introspective by default."

**Default album type:** praise-driven (65–100% average praise), not worship-heavy.

### 3.1 The praise-shape law by track position

| Position | Requirement |
|---|---|
| **Track 1** | ≥ **90% praise** — high-energy, hook-driven, tone-setting |
| **Track 2** | ≥ **80% praise** — momentum-maintaining |
| **Track 3** | Balanced/neutral transition into Act 2 |
| **Tracks 4–6** | Dynamic movement; **never more than 3 consecutive worship-focused songs** |
| **Tracks 7–11** | Gradual return to praise-centred tone |
| **Track 12** | ≥ **90% praise** — matches or exceeds opening energy |

### 3.2 Persona praise-intensity adjustments

- **+10%:** Imani, Jubilee, Santiago, Caleb
- **−10%:** Elias, Amir, Tahoma
- **Baseline:** all others

---

## 4. Content modes

| Mode | Meaning | Divine names | PDQ floor |
|---|---|---|---:|
| **OHI** | Overtly Hebrew Inspired *(the pitch doc glosses it "Original Hebrew Intent" — same acronym, two expansions in the corpus)* | **Yahuah** (never YHWH / Yahweh / LORD); **Yeshua**; **Ruach HaKodesh** with feminine pronouns | **≥ 55%** |
| **Default** | Mainstream Christian | Jesus / Lord / God / Holy Spirit; Spirit takes no gendered pronoun | **≥ 45%** |
| **secular_universal** | Pre-evangelistic. **Melody only** without Founder approval | Kingdom values carried without naming Jesus directly | **≥ 25%** |

**Never blend modes within a single song** (Cross-Tradition Category 2).

---

## 5. The Rating Stack — five mandatory metrics

### 5.1 Faith-Focused Rating (0–100%)

Measures **where the song's spiritual centre of gravity sits** — *not* a count of how often God is named.

| Range | Classification |
|---|---|
| 0% | Fully Secular — not permitted without explicit Founder approval |
| 1–50% | Morally Aligned |
| 51–80% | Faith-Leaning |
| 81–100% | Fully God-Centered |

**Scoring criteria:** subject of the song (God or man?) · directionality · scriptural density ·
redemptive arc · name usage · spiritual alignment. **"When uncertain, round down and flag."**

#### Per-persona album-average floors (binding)

| Persona | Floor | Persona | Floor |
|---|---:|---|---:|
| Zev | **90%** | Elias | 70% |
| Imani | **90%** | Eliana | 70% |
| Jubilee | 80% | Santiago | 70% |
| Zariah | 80% | Tahoma | 70% |
| Nova | 80% | Amir | 70% |
| Caleb | 80% | **Melody** | **EXEMPT** — pre-evangelistic voice |
| Gabriel | 80% | | |

#### 5.1.1 Main Character Rule (binding, all non-Melody personas)

Jesus / Father / Holy Spirit (OHI: Yeshua / Yahuah / Ruach HaKodesh) must be the **main character** —
directly addressed or the clear grammatical subject of chorus and bridge. Self-as-protagonist
patterns ("I am becoming myself", "I'm choosing truth") **fail and must be rewritten**.

> **Collapse test:** remove every reference to Him. The song must fall apart. If it still works, it fails.

### 5.2 Praise vs. Worship Rating (0–100%)

0% = Pure Worship (slow ~60–90 BPM, intimate, upward-facing, *who God is*) · 50% = Balanced ·
100% = Pure Praise (upbeat ~110+ BPM, outward-facing, *what God has done*).

Album type targets: **Praise-Focused 65–85%** · **Worship-Focused 15–35%** · **Progressive Hybrid = Founder approval required.**

### 5.3 Prophetic Declaration Quotient (PDQ, 0–100%)

> "The percentage of total lyric lines that are first-person, present-tense declarations the listener
> can personally appropriate in real time."

| Range | Classification |
|---|---|
| 0–20% | Narrative / Descriptive |
| 21–40% | Reflective / Invitational |
| 41–70% | Declarative-Balanced |
| 71–100% | Prophetic Declaration |

Worked examples — "He is faithful" = description (**doesn't count**) · "I am the righteousness of
Yahuah in Yeshua" = declaration (**counts**) · "We are free, we are free" = corporate declaration (**counts**).

Rationale: *"Secular listeners appropriate covenant truth subconsciously through declaration before
they can consciously receive it."*

### 5.4 Earworm Score (0–100%)

Three equally weighted sub-criteria:
1. **Melodic Memorability** — hummable after one listen; simple 5–7 note motif, narrow pitch range
2. **Rhythmic Signature** — distinctive clap pattern, syncopation, rest, stop-time
3. **Phonetic Memorability** — alliteration, internal rhyme, assonance, sticky title phrase

**Thresholds: album tracks ≥ 70%. Single candidates ≥ 85%.** Below threshold → returned to production.

Reported as: `Earworm Score: [##]% (Melodic [##] / Rhythmic [##] / Phonetic [##])`

### 5.5 Prophetic Declaration Rule (0–100%) — Non-Negotiable #20 *(added 2026-08-14)*

**Full standard: SOP §5.5–§5.11.** PDQ (§5.3) *counts* how much of a song is declaration; this rule
*judges how it is written*. A song can post a high PDQ and fail this outright.

> Two things are called prophecy. The **predictive/revelatory word** (1 Cor 14, Agabus) is real but is
> **not** what this governs — a song is fixed text sung to strangers and cannot be a word received for
> an individual. This governs **declarative prophetic proclamation**: taking what Yahuah already
> revealed and speaking it as present, finished reality. Yechezkel to the bones; Yeshua to the storm;
> Kepha at the gate — *what I have, I give you*.
>
> **Why:** teaching describes the light and never turns it on. A song that narrates leaves the switch
> in the listener's hand. Declaration flips it while they sing.

**The switch and the current.** The **switch is ours** — declaring the finished word every time,
felt or not. The **current is His**, carried by the Ruach Kodesh. We flip the switch on every song and
**never promise the current**.

**The mechanic — Declare, Anchor, Declare, Anchor:**

- **Declare** — present tense, finished possession: *"I am…"* · *"It is already done"* · *"It is mine now"* ·
  *"We are free"* · *"That has no right to stay."*
- **Anchor** — every declaration tied to (1) **the written word** and (2) **Ruach HaKodesh who makes it
  live**. The anchor is what separates proclamation from incantation.
- **Burden on the minister** — never a condition, never blame, never a promised outcome. Faith is the
  open hand that receives, not a price tag Yahuah imposes to withhold.

**Song-specific compression allowance** (adaptation from the article form — a 4-line chorus cannot hold a
declaration plus two anchors and stay singable): word anchor in the same or adjacent section as each
declaration; **Ruach anchor at least once per song**; **"You said it" seam at least once per song**.

**🔴 The two second persons.** In an article "you" is the reader; in a Jubilee song "You" is the Lord
(§8 Vertical Address). **Resolution: the declarative voice in songs is first-person and corporate
first-person, sung vertically to Him** — *"Yeshua, by Your stripes I am healed"* is vertical, declarative
and PDQ-counting at once, and holds four of the five beats. A **horizontal declaration over the listener**
stays capped at **one section per song** (§8 rule 4) in the Ministry-Moment zone. §5.5 does not relax that cap.

**Banned as the load-bearing verb of a declaration:** "will be" / "gonna be" deferring what is finished ·
"God can" / "You can" where the point is that He **has** · "someday" · "one day" · "soon" · "if I just" ·
"maybe" · "I hope" · "I'm believing for". **The ban is on deferring the finished thing, not on future tense**
— *"You are coming back"*, *"I will wait here until You come"*, and a resurrection anchor on a suffering
track are all correct.

**Placement:** 4–5 declare beats per song, **≥2 in the verses**. Verses still supply Scripture and legal
ground — in a voice already receiving (*"You carried me, and I am carried"*, not *"He carried me"*). A
narrative opener is welcome but must turn to the finished voice inside its own verse. Never stack
declarations with nothing between.

**Scoring:** Saturation 0–40 · Anchoring 0–30 · Burden 0–20 · Heat retention 0–10. **Ship at ≥85%.**
Below that the song is **rewritten, not regenerated** — a writing defect, not a rendering defect.
A declarative chorus on a narrative core **caps near 55% and does not pass.**

**Automatic fails (any one):** (1) declarative voice only in chorus/bridge and nowhere in the verses ·
(2) receiving made conditional on the hearer · (3) a line promising the current — a guaranteed outcome,
cure, or timetable · (4) a declaration left unanchored so it reads as formula or the singer's own
authority · (5) any implication of replacing, delaying, or abandoning medical care.

Reported as: `Prophetic Declaration Rule: [##]% (Saturation [##]/40 · Anchoring [##]/30 · Burden [##]/20 · Heat [##]/10)`
plus the location of each declare beat and each anchor, and a `Prophetic Declaration pass — SOP §5.5`
changelog line.

---

## 6. Song Architecture (SOP Part 2)

### 6.1 The 3:30 / 4:00 Duration Law

> "Every Jubilee song is **3:30 minimum and 4:00 maximum**. No exceptions. Not 3:28. Not 4:01."

**Rationale (verbatim reasoning worth preserving):** streaming completion ~64% for 3:30–4:00 vs ~28%
for 5-minute tracks · Christian and top-40 radio standardise at 3:30–4:00 · compressed attention but
the bridge still needs room to land · per-stream (not per-minute) payout · 12 × 3:30–4:00 =
**42:00–48:00 album runtime** · differentiates Jubilee from labels defaulting to 5–7 minute tracks.

#### Engineering table (how to fit ministry into the window)

| Section | Time | Notes |
|---|---|---|
| Tight intro | 0:00–0:15 max | Hook delivered by 0:15 |
| Verse 1 | 0:15–0:40 | ~25 s |
| Chorus 1 | 0:40–1:05 | ~25 s |
| Verse 2 | 1:05–1:30 | Same length as Verse 1 |
| Chorus 2 | 1:30–1:55 | |
| Bridge (breakthrough) | 1:55–2:35 | ~40 s — the ministry moment lands here |
| Final Chorus (elevated) | 2:35–3:20 | With modulation / key change |
| Outro / Tag | 3:20–3:50 | Optional extension to 4:00 |

Extended worship versions may exist as separate releases but are **not** part of the 12-track deliverable.

### 6.2 The First-15-Seconds Hook Law

Every song delivers its primary hook **within the first 15 seconds**.

*Why:* 87% of top-charting Billboard Hot 100 / Hot Christian songs hook within 15 s; a song that
hasn't hooked by second 15 loses ~40% of listeners before second 30.

**Acceptable deliveries:** title phrase sung ≤ 0:15 · signature melodic motif stated instrumentally ·
a cappella/sparse chorus fragment before full arrangement · one unforgettable calling-card line.
**Prohibited without approval:** cold opens > 10 s · slow fade-ins delaying the hook · extended
instrumental intros with no hook statement. Track 1 of a *worship* album may request an exception at
blueprint stage; interior tracks enforce without exception.

**Documented as:** `Hook Delivery Timestamp: [mm:ss]` — target ≤ 0:15.

### 6.3 Song-Level Emotional Arc (mini three-act)

Every song documents three beats: **Establish** (set tension/vulnerability/invitation) →
**Escalate** (deepen stakes, introduce the shift) → **Elevate** (breakthrough; the listener arrives
somewhere new).

*Why:* sentiment analysis of songs listeners report as life-carrying shows all of them contain an
internal three-beat arc; sentiment-flat songs — even beautiful ones — do not produce repeat behaviour.

### 6.4 Bridge Breakthrough Protocol

Every bridge satisfies **all three**:
1. **Chant-Ability** — 6–14 words max, repeated 2–6 times, phonetically sticky
2. **Dynamic Shift** — documented as **strip-down** / **build-up** / **stop-time**
3. **First-Person Prophetic Declaration** — appropriatable, not descriptive
   ("He is faithful" = description ✗ · "I am the righteousness of Yahuah in Yeshua" = declaration ✓)

> "The bridge is where the song stops describing worship and becomes worship. The Jubilee bridge is
> engineered, not improvised."

### 6.5 Sensory Anchor Requirement

**Minimum 3 concrete sensory anchors per song** — a specific image, sound, smell, touch, or named object.

*Why:* the most-shared songs are **more specific** than competitors, not more general.
*"I've been walkin' through midnight for what feels like years"* outperforms *"Life has been hard."*

**Rules:** abstract Christianese (valley, storm, trial, journey, battle, mountain) permitted **only**
when paired with concrete imagery in adjacent lines · named objects, body parts, locations, sounds,
weather preferred over abstract nouns. Fewer than three = **quality gate failure**.

### 6.6 Call-and-Response / Communal Sing-Along Zone

One designated 15–30 second segment engineered to be sung back by a congregation.

**Album minimums:** Worship-focused ≥ 2 tracks · **Praise-focused ≥ 4 tracks** (every third track minimum).

### 6.7 Ministry Moment / Shareable Zone

One designed 15–45 second segment containing at least one of: a goosebump production moment (key
change, strip-down, swell, silence) · a prophetic first-person declaration at maximum spiritual
density · a quotable line engineered for social clipping · a real ministry placement.

*Why:* songs now live and die in 15–30 second fragments — and these are the same zones where ministry
happens live.

---

## 7. Album Architecture

### 7.1 The Three-Act Model (3 + 6 + 3)

**Act 1 — The Opening (1–3).** Grab attention, establish identity, set stakes.
T1 strongest opener, states album thesis · T2 reinforces/expands, maintains or lifts energy ·
T3 completes the opening statement, may introduce first tension.

**Act 2 — The Journey (4–9).** Develop, deepen, build toward revelation.
T4–5 alternate energetic/reflective · **T6–7 emotional/spiritual turning point; Testimony Anchor most
commonly placed here** · T8–9 build toward resolution, tension rises.

**Act 3 — The Resolution (10–12).**
T10 breakthrough/revelation · T11 anchor song, cements core truth, often most memorable chorus ·
T12 closer — powerful uplifting finish (praise) or intimate sealing moment (worship).

### 7.2 Cinematic Storytelling Requirements

Four required elements: **strong opening** (first 30 s of T1) · **progressive development** (T2–9 build,
not plateau) · **a meaningful twist or revelation** somewhere in **T6–10** that reframes everything ·
**a final resolution that lasts**. Missing or weak on any = album returned to production.

### 7.3 Testimony Anchor Track (mandatory, ≥ 1 per album)

A song rooted in a **documented real testimony**.

**Acceptable sources:** the Founder's personal testimony · Cornell's documented testimonies · Jubilee
team testimonies · documented ministry testimonies from JubileeInspire.com / BornAgainDNA.com /
FiveFoldTest.com · Teshuvah journey testimonies · Covenant Breakthrough Manual
declaration-to-manifestation testimonies · ministry-partner testimonies where permission is granted.

**Documented as:** track number · testimony source · **≥ 3 sensory details drawn from the real event** ·
universal bridge (how the specific testimony universalises).

*Why:* "The Ruach rides on truth that has been lived, not only reasoned. Listeners sense the testimony
behind the lyric before they know the backstory."

---

## 8. Vertical Address Standard (§3.6 — Non-Negotiable #19)

> Jubilee songs are **acts of worship addressed to God**, not songs *about* God.

**The rule:**
1. **Choruses, hooks and bridges are 100% vertical** — second person, addressed to God. A hook *about*
   Him ("Throne don't shake") is reframed **to** Him ("You don't shake" / "Your throne won't move, Lord").
2. **≥ 60% of all sung lines** address God directly.
3. **Verses** may open in first-person testimony but must **pivot to and resolve in direct address**
   ("I was face-down in the pit, Lord — and You reached in"). No song may be wholly third-person report.
4. **Horizontal / altar-call lines** to a human listener permitted in **at most one section**, never the
   centre of gravity.
5. The One addressed is always an **explicit divine name/title** — never "a higher power", "the
   universe", or an ambiguous "You" readable as a human beloved.

> **Vertical Collapse Test:** remove the Lord as the *addressee*. The song must collapse into a generic
> pep-talk. If it still stands as a song sung to someone else, it fails.

**Interaction with Praise/Worship:** required in *both* modes. Praise declares **to** God what He has
done; worship adores **to** God who He is. **"Vertical ≠ slow: a 128-BPM soca banger can and must still
be sung to the Lord."**

### 8.1 Authoring vertical from the first draft (§3.6.1-A)

1. **Name the Addressee first** — before any line, pick "Jesus" / "Lord" / "Father" / "Holy Spirit" / "King".
2. **Write the hook TO Him.** If a hook starts with "He / His / the [thing]", rewrite as "You / Your".
3. **Build verses as testimony spoken to Him** — turn to God by the last two lines, hand into a vertical chorus.
4. **Make the bridge the most vertical moment** — pure address.
5. **Cap horizontal content at one section.**
6. **Name Him explicitly in every section** so "You" can never be mistaken for a human beloved.

### 8.2 Flipping an existing song (§3.6.1-B)

1. Tag every sung line: (a) TO God · (b) ABOUT God · (c) horizontal · (d) self.
2. Flip every chorus/hook/bridge to (a). **Keep syllable count and rhyme** so melody and hook are unchanged.
3. Convert verse report to address: "He carried me" → "You carried me, Lord."
4. **Preserve the payload** — keep the catchy shout; make the surrounding line address God, or keep the
   shout as crowd-answer inside a vertical chorus.
5. Kill self-affirmation: "I am enough" → "You are enough / You made me on purpose, Lord."
6. Re-rate Faith-Focus and P/W, record `Vertical Address pass — SOP §3.6` in the changelog.
   **If audio already exists, flag for re-render.**

---

## 9. Fourth-Wall Discipline (Non-Negotiable #17)

> The sung lyric body — text **between** section tags — must **never** reference the album's own
> structure, the listener's progress through the album, or the song's track position.
>
> **Why:** Suno renders text into audio literally — meta-references get **sung**. A song with "Track 2"
> or "end of the album" in the chorus cannot be released as a single, cannot survive a shuffled
> playlist, cannot stand alone outside the album context.

### 9.1 Banned in sung text

| Pattern | Examples |
|---|---|
| Theme self-announcement | "this song is about [X]" |
| Track-number self-reference | "in Track 1" · "on Track 5" · "Track 12 says" · "from track one" |
| Cross-track callback by number | "Track 1's first line" · "the chair I hid in in Track 2" |
| Album-position counter | "twelve songs in" · "twelve tracks later" · "twelve tracks ago" · "for seven songs I sang" |
| Album closure | "end of the album" · "close of the album" · "the album ends" |
| Album/record self-reference | "this album" · "this record" · "started this album" · "leaving this record" |
| Position label | "the opener" · "the closer" · "first/last song of this album" |
| Title-track self-reference | "the title track" · "the title of the album" |
| Album-opening self-reference | "started the album with" · "opened the album with" |

### 9.2 Allowed (keep these)

- **"this song" as performance idiom** — "I'll sing this song to You forever"
- **In-narrative references to a *different* song** — "Mama hummed the old hymn"
- **Production-cue brackets** — `[Bridge — ECHO-REPRISE · pulling forward Track 1's melody]` (never sung)
- **`Styles:` blocks and metadata footers** (never sung)

### 9.3 Replacement vocabulary

| Album-structure term | Story-world replacement |
|---|---|
| "this album" / "this record" | this journey · this season · this long road · this chapter · this long walk |
| "Track N" (callback) | Name the **scene** ("the kitchen floor", "the morning prayer") · a **time** marker ("that morning") · a **setting** marker ("the storm", "the sanctuary") |
| "end of the album" | end of the road · end of the season · end of the long night |
| "twelve songs in" | twelve months in · twelve weeks in · twelve nights deep |
| "the title track" | this truth · the heart of it · the one Name |
| "the opener" / "first song" | where I started · the first morning |
| "the closer" / "last song" | where I end · the final mile |

**Worked conversions:** "Started this album handing Him the keys / Twelve songs in" → "Started this
journey handing Him the keys / Twelve months in" · "The wall I was sitting at in Track 1" → "The wall
I was sitting at for so long" · "pressed play on Track 1" → "pressed play on the morning prayer".

**Enforcement:** before marking any song complete, scan the lyric body for the banned patterns.
Production-cue brackets and metadata blocks are exempt.

> **Field note (2026-08).** This defect recurs badly in practice. In a single freshness sweep, 38 of 89
> Melody albums ended with the same fourth-wall device in track 12 — 370 sung lines total, one album
> carrying 28 of them. Treat §9 as a *recurring* audit, not a one-time cleanup.

---

## 10. Divine-Name Discipline (Non-Negotiable #18)

> The word **"Allah"** must **never** appear anywhere in a lyrics file — not in sung text, not in
> `Styles:` lines, not in `[production cue]` lines, not standalone, and not inside Arabic theological
> compounds.

**Prescribed renderings:**

| Compound | Render as |
|---|---|
| *Ibn Allah* | **Son of God** |
| *Ibn Allah al-Hayy* | **Son of the Living God** |
| *Kalimat-Allah* | **Word of God** |
| *Hamal Allah* | **Lamb of God** |
| *Rasul Allah* | **the Sent One of God** |
| standalone *Allah* / *Ya Allah* | **God** / *Ya Rabb* / "O Lord" |

**Why:** "Suno renders both Styles and lyric text into audio and naming guidance. To keep every
Inspire-Family song unambiguously Christ-centred and free of any perception of syncretism, the divine
name sung and addressed is **God / Jesus**, never 'Allah.'"

**Still welcome:** non-divine-name Arabic transliteration — *Yasu'a, Habibi, Ya Rabb, al-Masih, Ruh*.

**Enforcement:** every new-album and every rewrite pass greps `\bAllah\b` (case-insensitive) and must
return **zero** before finalising. Song titles and `album.meta.json` track lists are updated when a
renamed compound was a title.

**In Arabic-script localisation** the ban extends to the script token: `الله / اللّٰه` must return zero,
standalone and in compounds. Prescribed: `الرَّبّ` (the Lord) · `الآب` (the Father) · `الإله` · name `يَسُوع`.
Son of God → `ابْنُ الآبِ`. Lamb of God → `الحَمَل` / `حَمَلُ الرَّبِّ`. Kingdom of God → `المَلَكُوت`.

> The engines are explicit that this is a **house-style token rule, not a judgment**: Arabic-speaking
> and Indonesian Christians have legitimately used the word for God for centuries. *"The doctrine stays
> whole; only the proper token is set aside."*

**Indonesian equivalents:** God → `Tuhan` / `Bapa` · Son of God → `Anak Bapa` / `Anak Tunggal` ·
Lamb of God → `Anak Domba` · Kingdom of God → `Kerajaan Surga`.
**Turkish:** use `Tanrı / Rab / Baba / İsa`, not the bare token.

---

## 11. Album Title Standard (Non-Negotiable #16)

- **≤ 30 characters including spaces.** Counted as `String.length`; an accented vowel counts as 1.
  Parenthetical subtitles count toward the 30.
- **Catalog-wide unique** — no title may duplicate any other across the entire Inspire Family catalogue
  (all personas, all categories: Inspire, Faith-Based, Party-Giggles, Tiny-Tiggles, General, Nations).
  **Verified against `catalog-manifest.json` before finalising.**
- **Style mandate:** creative, paradoxical, unexpected, emotionally compelling — *and* simple and easy
  to remember. **"Brevity + surprise is the formula."** Good examples: *Throne Pulses · Standing Tehillim ·
  Vivos en Cristo · Earthquake at Midnight · Burn It All.*
- **Banned patterns:** parenthetical glosses restating the title in another language · em-dash/slash
  compound subtitles · numeric prefixes · "(Vol. 1)" / "(Extended Edition)" / "(Album Mix)" decorations
  (these belong in metadata).
- **Banned title vocabulary:** **"tongues" / "glossolalia"** — Pentecostal/Charismatic distinctive, some
  traditions cessationist. Reframe via Acts 2 imagery ("Babel Undone", "Heaven Speaks", "Upper Room
  Circle"). **Ban applies to album and song titles only** — the lyric body may reference 1 Cor 14 / Acts 2
  biblically.
- **Bilingual variants** must each carry a title native to their language and **must not share text**.
- **Applies to rewrites too** — any enhancement pass enforces this against the inherited title.
- Short titles also keep `<Persona>-<Album Title>-lyrics.md` under Windows MAX_PATH.

---

## 12. Vocal-Gender Narrator-Fit Rule (mandatory, per track, every album, every language)

> The lead vocal gender **must fit the song's first-person narrative.**

If a track puts the singer in a clearly **gendered role** (the returning prodigal **son**, a bride or
bridegroom voice, a man/woman addressing a spouse, a father/mother speaking as such), the lead must be
a persona of **that** gender — **even if it differs from the album's primary persona**.

**Procedure — reassign that one track only:**
1. Set its `**Persona:**` and the Suno-block `Artist:` to the most suitable persona of the required gender.
2. Flip the lead descriptor (`female lead` ↔ `male lead`) in **both** the Production-Metadata Style line
   and the Suno `Styles:` / `Vocal Gender:` lines.
3. **Choose the replacement persona by the track's musical STYLE.**
   - **Female leads:** Jubilee, Nova, Eliana, Zariah (also Melody, Imani)
   - **Male leads:** Caleb, Elias, Santiago, Amir, Zev (also Tahoma, Gabriel)
4. Gender-neutral worship lyrics keep the album's primary persona.
5. The album's folder/attribution is unchanged — this is a per-track guest-lead swap.
6. **Apply in EVERY language version.** A track already rendered with the wrong gender → **flag for
   audio re-render**.

*Worked example:* "Happy Father's Day" Track 7 "The Father Who Runs" is the prodigal **son** in first
person → reassigned Jubilee (female) → **Caleb (male)** across EN/RO/JA (2026-06-30).

---

## 13. The Blueprint Engine (v4.0)

**Role:** receive a theme/topic/overview → produce a production-ready album blueprint conforming to
SOP v2.0. Its output is the canonical blueprint file that **governs all 12 lyric files**.

**Five obligations:** pre-author album-level architecture · pre-assign target ratings for every track ·
pre-specify song lengths and runtime totals · pre-identify single candidates · run all album-level
Quality Gates.

It also possesses the **Genre Fusion Laboratory** — "the ability to take two or more existing genres and
fuse them into an entirely new hybrid genre with its own name, identity, and sonic DNA. Genre invention
is a strategic weapon for cultural penetration."

### 13.1 Inputs (7)

1. **Album Theme / Topic / Overview**
2. **Persona** — default **Jubilee Inspire** if unspecified
3. **Content Mode** — OHI / Default / secular_universal
4. **Album Type** — Praise-Focused (default) / Worship-Focused / Progressive Hybrid (approval required)
5. **Target Audience**
6. **Release Context** — season, Torah portion, ministry moment, cultural event
7. **Genre or Sonic Direction** (optional — Fusion Laboratory activates automatically if ≥ 2 genres named)

> "If inputs are sparse, infer intelligently and flag every inferred section."

### 13.2 Required output — Sections A–J (every section mandatory)

**A. Album Header** — Persona · Content Mode · Album Type · Target Audience · Release Context.

**B. Album Vision Statement** — 2–4 sentences: what this album is, who it is for, what it is called to
do. "A songwriter must be able to read it and immediately begin writing."

**C. Album-Level Ratings & Metrics** — overall Faith-Focused average *(must meet persona floor)* ·
P/W average · PDQ average *(OHI ≥55 / Default ≥45 / secular ≥25)* · Earworm average *(≥70)* ·
praise-dominant / worship-dominant / balanced track lists · **3–4 single candidates (Earworm 85%+)** ·
Testimony Anchor track number · **total runtime 42:00–48:00**.

**D. Three-Act Structure** — three subsections (1–3, 4–9, 10–12), each with Arc Purpose and a table:
`# | Title | Length | P/W | Faith | PDQ | Earworm | Role`. Act 2 additionally requires **Key
Emotional/Thematic Shift**.

**E. Testimony Anchor Documentation** — track number · source · **≥ 3 sensory details** · universal bridge.

**F. Structural Rationale** — why the three-act model for this album · emotional progression T1→T12 ·
spiritual progression ("what covenant truth is being unfolded? where does the Ruach do Her deepest
work?") · the cinematic twist/revelation moment and why it lands there.

**G. Genre Fusion Laboratory — five stages**
- **Stage 1 Parent Genre Selection** — Genre A + Genre B. "The more unexpected the pairing, the more distinctive the result."
- **Stage 2 Sonic DNA Extraction** — 5–7 signature elements per parent genre
- **Stage 3 Fusion Rules** — dominant genre by section, collision points, element exchange, preserve/eliminate
- **Stage 4 Fused Genre Identity** — genre name ("Altar Trap", "Covenant Soul", "Hymn-Wave"), one-sentence identity statement, 3–5 phrase mood board
- **Stage 5 Fusion Deployment Map** — per-track fusion ratio for all 12 tracks

**H. Track-by-Track Pre-Production Briefs (×12)** — track # and working title · act and role · subtheme ·
target length · four target ratings · **hook concept** (4–6 syllables, delivered ≤0:15) · **bridge
concept** (chant-able 6–14 word first-person declaration + dynamic shift type) · cinematic function ·
**ministry moment concept** · sonic profile (BPM, key, instrumentation, fusion ratio) · persona voice
markers.

**I. Production Notes** — dominant styles · vocal gender distribution · average Weirdness · average
Style Influence · persona-specific non-negotiables · **Suno Styles pre-specs (≤800 chars each, first
250 load-bearing)**.

**J. Album-Level Quality Gates Checklist** — SOP §19 checklist **plus** the Cross-Tradition Sensitivity
attestation, **plus** the Vertical Address pre-finalize check, **plus** the Fourth-Wall pre-finalize check.

### 13.3 System behaviour rules

- Complete blueprint in a single output, exact section structure.
- Fusion Laboratory activates for **every** album.
- Every track specifies length, all five ratings, a role descriptor, and a completed **Declaration Map** (§5.5) — 4–5 declare beats placed with ≥2 in the verses, plus the word, Ruach and "You said it" anchors. A blueprint with any track missing its Declaration Map is not submittable.
- Testimony Anchor and Cinematic Twist identified **explicitly**.
- Album averages must satisfy persona Faith-Focus floor and per-mode PDQ floor.
- Verify runtime 42:00–48:00.
- OHI conventions and Hebrew article rule applied when appropriate.
- **Spelling locks:** Eliana (never "Ileana") · Zariah (never "Zaria"/"Zariyah") · Imani (never "Imanee") · Tahoma (never "Tacoma").
- Never recommend generic or cliché approaches.
- Run Cross-Tradition vetting before lyric-engine handoff; **two-or-more-flag tracks are non-shippable**.
- **Model pin (in-prompt):** *"USE OPUS 4.7 EXCLUSIVELY — Do NOT continue on Haiku or Sonnet for
  blueprint authoring."* (Update to the current top-tier model on rebuild; the *intent* is "use the
  strongest available model for architecture".)
- The Founder holds final authority; deviations require written approval flagged at blueprint stage.

---

## 14. Cross-Tradition Sensitivity Vetting (mandatory pre-handoff pass)

> "The Jubilee catalog ministers to the **broad global Body of Christ** — Catholic, Orthodox,
> Evangelical, Pentecostal/Charismatic, Reformed, Wesleyan, Messianic, Anabaptist, mainline,
> non-denominational. **You will never please every believer**, but most points of offence are
> **avoidable without diluting the message**."
>
> "The vetting pass removes **unnecessary** offence — never the **necessary** offence of the cross (1 Cor 1:23)."

Every working title, hook concept, bridge concept and subtheme is evaluated against all 14 categories.

### 14.1 The 14 categories

1. **Comparison with Biblical Figures** — "wiser than / greater than / stronger than [figure]" reads as
   boast. Replace comparative frames with **arrival, encounter, or identity-reveal** frames.
2. **Trinity Precision** — no modalism, Arianism, tritheism. The Spirit is **He** in Default and **She**
   only in OHI. **Never blend modes in one song.**
3. **Christology Precision** — He must be Lord *somewhere* in every album. No denial of full humanity or
   full divinity. **Avoid sexualised Bridegroom/Bride imagery** — the metaphor is biblical; the erotic
   execution is the problem.
4. **Soteriology Flashpoints** — no works-salvation, no universalism, no cheap grace.
5. **Inter-Denominational Hot Buttons** — avoid taking sides on: tongues/cessationism ·
   predestination/free will · end-times timetables · Eucharist specifics · infant vs believer baptism ·
   women in leadership · Catholic–Protestant divides · Sabbath-day specifics. When the topic *is* the
   song, frame in **first-person testimony**, not third-person doctrine.
6. **Self-Deification / New-Age Adjacency** — no "I am god", "I am divine", "one with the universe".
   "'Christ in me' is orthodox — but say *Christ* in me, not just 'the divine' in me. **Specificity protects.**"
7. **Boasting vs Testifying** — "*'Look what He did'* = testimony. *'Look what I did with His help'* =
   drift. *'Look what I am'* = boast."
8. **Triumphalism / Contempt for Outsiders** — never dehumanise unbelievers, other traditions, or
   political opponents. **"Even in declaration, leave the door open for the prodigal."**
9. **Political / Partisan / Nationalistic Conflation** — the Kingdom of God is not the kingdom of any nation.
10. **Sexualised or Inappropriate God-Imagery** — watch "lover", "kiss", "embrace" near second-person
    address to God.
11. **Christianese Clichés That Are Quietly Wrong** — banned: "Let go and let God" · "God helps those who
    help themselves" · "God needed another angel" · "When God closes a door, He opens a window" ·
    "Everything happens for a reason". **"Sentimentalism that contradicts Scripture is more dangerous
    than blunt theology."**
12. **Banned Phrases & Worn-Out Tropes** — "I'm coming alive" · "Break every chain" · "Oceans deep" ·
    "Here I am" · "All my life" · "Set a fire" · "Holy ground" · "My soul cries out" · "In the valley" ·
    "On the mountain" · "Give me more" · "Waymaker / miracle worker" — **allowed only if radically
    recontextualised**.
13. **OT Figure Treatment** — don't disparage or use as foils; honour them as forerunners.
14. **Modern Cultural Figure Reference** — no named celebrities, politicians or living public figures.

### 14.2 The five-pass workflow

- **Pass 1 — Title Sweep** (before drafting briefs): could a sincere Christian from a different
  tradition read this title and walk away? Does it position the singer above a biblical figure/group/
  doctrine? Does it sound like a slogan/meme/brand instead of a sung declaration?
- **Pass 2 — Hook & Bridge Sweep**: run all 14 categories over every hook and bridge concept.
- **Pass 3 — Theological Precision Sweep**: "Is it scripturally defensible across at least three major
  Christian traditions?"
- **Pass 4 — "Read Aloud at a Funeral" Test**: for tracks touching suffering/loss — if it lands
  sentimental, glib or fatalistic, rework.
- **Pass 5 — Audience-Width Verification**: three simultaneous listeners — a 65-year-old Reformed
  Presbyterian, a 30-year-old Pentecostal worship leader, a 22-year-old who walked into church for the
  first time after deconstruction. **If two of three would be alienated, rework.**

### 14.3 Rule of Cumulative Stumbling

| Flags | Action |
|---|---|
| 0 per track | Ship |
| 1 mild per track | Acceptable if the artistic case is strong and the alternative is dilution — **document the rationale in Section J** |
| **2+ on one track** | **Mandatory rework** |
| **3+ across the album** | **The entire album re-passes vetting** before lyric-engine handoff |

### 14.4 Calibration example (preserve this — it is the engine's worked example)

- **Original:** Track 6 "Wiser Than Solomon", bridge *"Solomon got the gift, but I got the Giver."*
- **Flags:** Category 1 + Category 7 = two flags = mandatory rework.
- **Reworked:** "Wisdom Walked In", bridge *"I asked for an answer — and the Answer walked in. He didn't
  hand me wisdom — He sat down at my table."*
- **What changed:** comparison frame → arrival/encounter frame. "Singable, viral, theologically
  equivalent, no one bruised."

### 14.5 What this pass does NOT do

Does **not** remove the cross, the blood, sin language, repentance, judgment, hell, or the exclusivity
of Christ. Does **not** soften prophetic declaration. Does **not** bend to deconstruction culture.
Does **not** homogenise the personas — "Zev still sounds Messianic; Tahoma still sounds indigenous;
Caleb still sounds evangelical."

---

## 15. The Lyrics Engine (v2.0)

**Role:** produce the **per-song deliverable** from an approved blueprint.

> "You do not write lyrics that are merely competent. You write lyrics that are **spiritually
> transformative, structurally engineered, and addictively memorable**."

### 15.1 Inputs

1. **Album Blueprint** (the Part 1 output). *If unavailable, request the blueprint first — lyric
   production is governed by the blueprint.*
2. **Track Number** (optional; default 01)
3. **Additional Direction** (optional)

### 15.2 The per-track 8-check gate (verify before output) *(extended 2026-08-14)*

1. Is Jesus / Yeshua / Father / God / Holy Spirit / Ruach / Yahuah **explicitly named**?
2. Is He the **grammatical subject or addressee of the chorus and bridge**?
3. If every God-reference were removed, does the song **collapse**? (Must be YES.)
4. **Vertical address:** is every chorus, hook and bridge addressed to Him, and do **≥ 60%** of sung
   lines address Him directly? (Must be YES — third-person testimony alone **fails**.)
5. **Vertical Collapse Test:** remove the Lord as *addressee* — the song must collapse into a generic
   pep-talk. (Must collapse.)
6. **Declarative saturation (§5.5):** does the song carry **4–5 present-tense declarations of finished
   possession, with ≥2 in the verses**? (Must be YES — a declarative chorus over narrative verses is
   automatic-fail #1.)
7. **Anchoring (§5.5):** is each declaration's scriptural ground present in its own or the adjacent
   section; is **Ruach HaKodesh named at least once**; is the **"You said it" seam** present at least once?
8. **Burden posture (§5.5):** does any line condition receiving on the hearer, fault them, promise an
   outcome or timetable, or touch their medical care? (Must be **NO** on all four.)

**If any check fails, rewrite before output.** On checks 6–8 the instruction is **rewrite, not
regenerate** — re-rolling the generator reproduces the defect.

### 15.3 The 16-step production workflow

1. Open the standardized lyrics file template.
2. Fill Production Metadata including target length (3:30–4:00) and Hook Delivery Timestamp (≤0:15).
3. Engineer structure within the window using the §6.1 timing table.
4. Write lyrics honouring persona voice, content mode, and the track's assigned role in the arc.
5. Apply divine-name and Hebrew-article conventions.
6. Document the Emotional Arc (Establish / Escalate / Elevate).
7. Engineer the Bridge to meet all three Breakthrough criteria.
8. Inventory ≥ 3 Sensory Anchors.
9. Identify the Call-and-Response Zone (location, call line, response line).
10. Identify the Ministry Moment / Shareable Zone (location, type, intended effect).
11. Assign Faith-Focused Rating with band.
12. Assign Praise vs. Worship Rating.
13. Assign PDQ with band.
14. Assign Earworm Score with three sub-scores.
15. Write the Scoring Justification (2–4 sentences).
16. **Self-check** — role in arc, 3:30–4:00 fit, all Faith-Focus checks. If any fails, revise.

### 15.4 Internal craft gates (govern every song; not printed in output)

**Lyrical craft** — authenticity over statement ("'Yahuah is good' is a statement. 'I watched You hold
my mother's hand the night she couldn't hold her own' is a testimony") · vivid sensory language ("Not
'in my darkest hour' but 'three AM on the bathroom floor'") · unexpected language ("If a line could
appear on a greeting card, rewrite it") · layered metaphor (surface meaning first listen, deeper meaning
on third or fourth) · specific story that becomes universal · wordplay and wit · rhythmic/melodic
alignment (open vowels on sustained notes, punchy consonants on rhythmic hits).

**Faith gates** — Main Character gate · Vertical Address gate · biblically grounded (woven into lived
experience, not proof-texted) · theologically sound · worship-ready (inclusive "we/us/our", direct
"You/Your", congregational range within an octave) · call to response · redemption narratives showing
the **full** journey with **He** as the agent · hope without hollow positivity ("acknowledge the
darkness before pointing to the light").

**Entertainment gates** — hummable next day · repetition with purpose and subtle variation · syllables
that feel good in the mouth · Earworm ≥ 70% album / ≥ 85% single.

**The Surprise Gate** — every song contains at least one lyrical twist, perspective shift, emotional
turn, or narrative revelation. Present in the lyric; not explicitly marked.

### 15.5 Sequential flow

Album Header before Song 01 only → generate the full package for the current track → prompt:
*"Song [X] of 12 complete. Type "y" to continue to Song [X+1], or "n" to pause. You can also type a
specific track number to jump."* → repeat to twelve → **Completion Summary** (track list, album
averages vs floors, runtime, single candidates, testimony anchor confirmation, cinematic twist
confirmation, quality-gate status, hand-off note: package 13 files).

---

## 16. Output formats

Three formats coexist in the live catalogue. **A rebuild must declare which is canonical for new work.**

### 16.1 Format A — SOP §14 Standardized Lyrics File (one file per song)

Full structure, every element mandatory, missing any element = rejected:

```
# [Song Title]

**Album:** · **Track:** [##] of 12 · **Act:** · **Persona:** · **Content Mode:**

## Production Metadata
- Music Styles · Vocal Gender · Weirdness Score · Style Influence Score
- Tempo (BPM) · Key · Song Length (3:30–4:00) · Hook Delivery Timestamp (≤0:15)

## Song-Level Emotional Arc      — Establish / Escalate / Elevate
## Bridge Architecture           — Word Count / Repetition Pattern / Dynamic Shift / First-Person Declaration
## Sensory Anchor Inventory      — ≥3 concrete images
## Call-and-Response Zone        — Location / Call Line / Response Line
## Ministry Moment / Shareable Zone — Location / Type / Intended Effect
## Lyrics                        — [Intro] … [Final Chorus / Outro]
## Song Ratings                  — Faith-Focused / P vs W / PDQ / Prophetic Declaration Rule §5.5 (Saturation/Anchoring/Burden/Heat + beat and anchor locations) / Earworm (Melodic/Rhythmic/Phonetic)
## Scoring Justification         — 2–4 sentences referencing SOP criteria
```

### 16.2 Format B — the Suno Generation Block (appended to Format A)

```
Song Title: [##] [Song Title]
Artist: [Persona Name] Inspire

Lyrics:
[lyrics body with Suno-native section tags]

Styles: [≤800 chars]
Vocal Gender: [Female Lead / Male Lead / Duet / Gospel Choir / …]
Weirdness: [30–50%]
Style Influence: [65–80%]
Song Title: [##] [Song Title]
Save To: [Album Name]
```

### 16.3 Format C — the "Caleb format" (one file per ALBUM — dominant in the live catalogue)

This is what the vast majority of the 937 albums actually use: **one `.md` per album containing 12 song
blocks separated by standalone `---`**, plain text, **no fenced code blocks anywhere**.

**Path:** `{album_folder}/lyrics/{Persona} Inspire-{Album Title}-lyrics.md`

**Per-song block:**

```
SONG TITLE: {NN} {Title}
ARTIST: {Persona} Inspire
ARCHETYPE: {one-line archetype}

LYRICS:

[Intro]          2–4 lines
[Verse 1]        4–8 lines
[Pre-Chorus]     2–4 lines (optional)
[Chorus]         4–6 lines
[Verse 2]        4–8 lines
[Chorus]         repeat
[Bridge]         4–8 lines — cinematic peak
[production cue: …]
[Chorus]         final, often modulated up a step
[Outro]          2–4 lines

---

Styles: {≤800 chars; first 250 LOAD-BEARING}
VOCAL GENDER: {male|female + detail}
Weirdness: {0–100}
Style Influence: {0–100}
Faith-Focus: {0–100}
Praise vs. Worship: {N% praise / M% worship}
Prophetic Declaration Rule: {0–100} (Saturation {n}/40 · Anchoring {n}/30 · Burden {n}/20 · Heat {n}/10) — must be ≥85
Declare beats: {sections, ≥2 in verses} · Anchors: word {section} · Ruach {section} · "You said it" {section}
Earworm: {0–100}
Bestseller: {0–100}
Estimated Length: {M:SS}
Song Title: {NN} {Title}
Save To: {persona-slug}/lyrics/
```

#### 16.3.1 Canonical verbatim example (Tahoma, `THIM1009EN` track 01, post-2026-08-09 refresh)

```
SONG TITLE: 01 Hats Off at the Door
ARTIST: Tahoma Inspire
ARCHETYPE: opener / homage anthem — the body's first act of honour

LYRICS:

[Intro]
Cap in my hand before I hit the second step.
Hats off at the door.

[Verse 1]
My father taught me: take the cap off when you go inside.
He never told me why. He just tapped the brim and smiled.
Forty years later I know exactly what he meant —
some rooms you walk into with your head already bent.

[Pre-Chorus]
Jesus, I do not come in here to negotiate.
I come in with my hands down and my hat off at the gate.

[Chorus]
Hats off at the door, Lord —
work gloves in the pocket, ball cap in the fist.
Whatever I was tall about out there,
I set it on the mat and I walk in like this.
Hats off at the door.
You are the King. You are the King.

[Verse 2]
I have walked into offices with my chin held high.
I have walked into arguments with a chest full of why.
I have never once walked in to You that way —
something in me knows the shape of what to lay away.

[Chorus]
… (repeat)

[Bridge]
You never demanded it. That is what undoes me most.
You would have let me stand there stiff-necked in the back.
But I saw the marks in Your hands, Lord, and my knees just knew.
Nobody had to tell me. The hat came off for You.

[production cue: at 2:14 strip to a single kick pulse, one baritone, and the sound of a door closing
behind him; 2:30 four-second held breath; 2:36 hi-hat count-in doubled; 2:42 full worship band and
intergenerational choir re-entry with a whole-step lift; 3:04 children's chorus on the hook alone;
3:20 last chorus with the choir a fourth above the lead]

[Chorus]
Hats off at the door —
nothing in my hands and nothing on my head.
I have got no rank in here and I do not want one, Lord.
I want to be a man who honours You instead.
Hats off at the door.
You are the King.

[Outro]
Hats off at the door.
You are the King, Jesus. You are the King.

---

Styles: contemporary celebration praise and worship, 106 BPM, A major lifting to C major on the last
chorus, male baritone-tenor lead in warm opener register with full gospel choir, women's high counter
and a children's hook pass; full worship-band kit, anthem electric-guitar lead, upright piano and
acoustic, claps and stomps, B3 organ pad widening across the song, a closing-door sound in the room
tone, breath preserved. Load-bearing front: full kit, electric guitar, male baritone, 106 BPM, A-to-C,
a cap taken off at a doorway. Reverent, plainspoken, congregational. Original melody.
VOCAL GENDER: male (Tahoma baritone-tenor lead; full gospel choir; women's high counter; children's chorus)
Weirdness: 34
Style Influence: 84
Faith-Focus: 95
Praise vs. Worship: 76% praise / 24% worship
Earworm: 94
Bestseller: 93
Estimated Length: 3:50
Song Title: 01 Hats Off at the Door
Save To: tahoma-inspire/lyrics/
```

*Note how it satisfies the stack: hook in the intro (≤0:15) · vertical from the pre-chorus on · sensory
anchors (cap, brim, work gloves, mat, door) · bridge is a first-person declaration with a strip-down
cue · call-and-response in "You are the King" · ministry moment at 2:14–2:42 · 3:50 length.*

### 16.4 `Styles:` line construction

- **Maximum 800 characters.** Count characters, not words.
- **First 250 characters are load-bearing** — Suno weights the opening most heavily. Pack: core genre
  fusion + primary instruments + vocal register + BPM/key.
- Suggested budget: chars 1–250 genre/instruments/vocal/BPM-key · 251–550 mood + emotional payload +
  production techniques · 551–800 texture, atmosphere, arrangement shape.
- **No filler.** "If you cannot say something specific and useful, stop."
- **No real artist names** in Styles (per persona build protocols) — use vivid auditory descriptions
  instead. *(See §23 for the contradiction with the Lyrics Engine.)*
- Divine-name discipline applies inside `Styles:`.

**Weirdness / Style Influence bands:** Weirdness typically 30–50% (55–75% for prophetic/experimental) ·
Style Influence typically 65–80% (higher = stricter adherence).

### 16.5 Bracket meta-tag whitelist

**Caleb-format closed list (persona protocols):**
`[Intro]` `[Verse 1]` `[Verse 2]` `[Verse 3]` `[Pre-Chorus]` `[Chorus]` `[Post-Chorus]` `[Bridge]`
`[Instrumental]` `[Solo]` `[Breakdown]` `[Outro]` `[production cue: …]`

**Lyrics Engine wider list:** adds `[Hook]` `[Refrain]` `[Tag]` `[Final Chorus]` `[Drop]` `[Build]`,
plus production cues (`[soft piano]`, `[gospel choir enters]`, `[key change]`, `[silence]`, …) and
vocal direction (`[soulful lead vocal]`, `[prayerful]`, `[declarative]`, …).
**"Do NOT invent tag types outside this library."**

### 16.6 Forbidden in lyric files

- Fenced code blocks (Caleb format)
- Markdown headings (H1/H2/H3) inside the lyrics file
- Real artist names in `Styles:`
- Prose metadata / production documentation inside the `LYRICS:` body
- Staging directions as unbracketed sung lines
- Song titles without the 2-digit track-number prefix
- The word "Allah" anywhere
- Fourth-wall references in sung text
- Album-level prose front-matter or trailing changelogs *(these belong in `album.meta.json`)*

### 16.7 Track-number standard (mandatory)

Every `SONG TITLE:` and its matching `Song Title:` footer **must** begin with the 2-digit track number
`01`–`12`. The `album.meta.json` track list uses the same `NN Title` format.
**"No title without its track-number prefix."**

### 16.8 Album folder layout and `album.meta.json`

```
<CODE><LANG>-<slug>/
├── album.meta.json
├── lyrics/
│   ├── blueprint.md
│   └── <Persona> Inspire-<Album Title>-lyrics.md
├── tracks/            (rendered mp3)
├── artwork/
├── manifest/
└── lossless/ high/ standard/ preview/    (CDN tiers)
```

**`album.meta.json` observed keys:** `album_uuid` · `album_code` · `album_slug` · `album_title` ·
`artist_slug` · `artist_name` · `track_count` · `expected_track_count` · `tracks[]` · `themes` ·
`style_fusion{base,secondary}` · `release_date` · `release_status` · `source_folder` ·
`blueprint_present` · `lyrics_md_present` · `cover_present` · `artwork_master_path` ·
`artwork_cdn_paths` · `manifest_path` · `missing_assets[]` · `notes` · `rebuild_notes[]` ·
scoring blocks (`addictiveness_composite`, `addictiveness_dimensions`, `amplification_v3`,
`sonic_craft_version`, `sonic_craft_date`) · dated refresh objects (`refresh_YYYY_MM_DD`).

**A `tracks[]` entry is a rich object, not a string:**
`track_uuid` · `track_number` · `track_title` · `track_slug` · `source_filename` · `explicit` ·
`family_friendly` · `promotion_status` · `cdn_urls{lossless,high,standard,preview,manifest,tracks}` ·
`lyrics_text_path` · `lyrics_lrc_path` · `waveform_data_path` · `missing_assets[]`.

> **⚠ Operational warning.** When syncing renamed song titles into metadata, **update `track_title` and
> `track_slug` in place**. Replacing `tracks[]` with plain strings destroys UUIDs and CDN URLs. This
> mistake was caught in dry-run during the 2026-08-08 Melody refresh; it would have been unrecoverable.

### 16.9 Album code shape

`<PERSONA2><CAT2><NNNN><LANG2>` — e.g. `JEIM1070EN`, `THIM1009EN`, `MDIM1055EN`.
The trailing two letters are the **language suffix**, swapped on translation (`EN` → `ES`, `RO`, `JA`…).
Folder slug: `<CODE><LANG>-<kebab-slug>`. See §1.1 for the persona→prefix table.

---

## 17. Persona registry

### 17.1 Voice calibration (the 13 named personas)

| Persona | Five-Fold Office | Musical identity | Faith floor | Lyrical voice |
|---|---|---|---:|---|
| **Jubilee** | Evangelist / Prophet | Celebration worship, global fusion, Broadway-capable | 80% | Bold declarations, urgent invitations, revival energy. "Grabs the listener by the collar and won't let go until they see Yeshua." |
| **Melody** | Evangelist / Teacher | Pop / mainstream outreach, pre-evangelism (Jubilee's twin) | **EXEMPT** | Joy as hard-won conviction, song as evidence, accessible to the non-churched. "Sounds like the radio but carries the Kingdom." |
| **Zariah** | Teacher / Pastor | Caribbean / Afro-Caribbean fusion worship | 80% | Truth-forging precision, guardian of doctrinal purity. "Teaches while it moves the body." |
| **Elias** | Apostle / Prophet | Country / cowboy / bluegrass, prophetic storytelling | 70% | Frontier apostle, long-road wisdom, storyteller at the campfire. |
| **Eliana** | Apostle / Teacher | Country / folk / bluegrass, wisdom-structured (Elias's twin) | 70% | Plainspoken wisdom, porch-light theology, prayer in overalls. |
| **Caleb** | Pastor / Evangelist | Contemporary Christian, modern worship band | 80% | Shepherd of shepherds, tender, healing. "Like a hand on the shoulder after a long week." **The canonical lyrics-format exemplar.** |
| **Imani** | Prophet / Evangelist | Pentecostal / charismatic praise, Spirit-led | **90%** | Fire starter, justice voice, prophetic ignition. |
| **Zev** | Teacher / Apostle | Messianic / Hebraic worship, modern fusion | **90%** | Layered Hebraic depth, Paleo-Hebrew awareness. "Lyrics that reward study." |
| **Amir** | Evangelist / Prophet | Arabic / Middle Eastern worship | 70% | Bridge to Middle Eastern diaspora, declaring Yasu' is Lord. |
| **Nova** | Pastor / Teacher | Celtic / European / ambient, contemplative | 80% | Contemplative shepherd for the de-churched and searching. |
| **Santiago** | Prophet / Evangelist | Latin / Spanish / South American, theatrical | 70% | "The rhythm of abuelita's kitchen and the fire of the plaza — Cristo central." |
| **Tahoma** | Prophet / Pastor | Indigenous-adjacent / acoustic / island (see §17.3) | 70% | Earth imagery, justice, communal belonging — anchored in Christ as Creator. |
| **Gabriel** | Apostle / Prophet | Celebration + light Messianic hybrid | 80% | Apostolic authority, kingdom strategy, covenant fatherhood. "Commissions and deploys." |

### 17.1a Technical DNA — vocal range, BPM pocket, style anchor

| Persona | Vocal type & range | BPM pocket | Primary × secondary lane |
|---|---|---|---|
| **Jubilee** | Female **mezzo-soprano C4–G5**; chorus tessitura **C5–F5** | album-dependent | Celebration worship × Broadway / global fusion |
| **Melody** | Female warm **mezzo-alto G3–C5**, close-mic'd, no pitch correction | **108–122** (to 126; never >128) | Mainstream pop × CCM pop / singer-songwriter |
| **Zariah** | Female rich **mezzo-alto** (legacy: contralto, low G–high D); chorus **F4–C5** | 62–140 by archetype | Caribbean / Afro-Caribbean × gospel-soul + teaching hymnody |
| **Elias** | Male **tenor→baritone with distinctive rasp**; Appalachian folk-rock | album-dependent | Country / cowboy × bluegrass / Americana |
| **Eliana** | Female elder **warm alto** *(no numeric range documented anywhere)* | album-dependent | Country / folk × bluegrass, wisdom-structured |
| **Caleb** | Male warm rasped **baritone B2–D4**, spoken-sung, no pitch correction | **56–132** by archetype | Contemporary worship × neo-soul / pastoral folk |
| **Imani** | Female **mezzo-soprano G3–E6** with powerhouse gospel-alto belt | high-energy | COGIC praise-break gospel × jazz / hip-hop cadence / orchestral |
| **Zev** | **D3–A4** warm Hebraic baritone-tenor + **B4–E5** prophetic apex; cantorial inflection | 54–140 by archetype; new batch 100–130 | Messianic / Hebraic × klezmer-CCM / Mizrahi Levantine pop |
| **Amir** | Male **baritone G2–E4**, restrained expansion to **F4–A4** | **100–130** | Arabic pop (Levantine/Khaleeji) × one secondary |
| **Nova** | Female **alto A3–E5** (legacy D3–E5), whispered→soaring | **108–128** core; ambient 60–96; outrun to 132 | Celtic / ambient contemplative — synthwave batch is **single-lane, no fusion** |
| **Santiago** | Male **theatrical baritone** with mixed three-part choir | 65–135 by style | Celebration P&W × one Latin secondary |
| **Tahoma** | Male **baritone-tenor**, intergenerational ensemble; powwow-shout to elder-whisper; Hawaiian adds falsetto | **75–130**; Hawaiian 100–130 (ballads 80–100) | Celebration P&W × one Indigenous-or-Pacific secondary |

**Zev pronoun rule:** the artist's voice is **gender-neutral first person** ("I/we") in lyrics; in
narrative description use "the artist". Suno tag: male default, "mixed" on choir tracks.

**Melody's ear-candy timestamp grid** (representative of the depth a persona signature carries):
0:00–0:04 signature foley opener · 1:18 reversed-cymbal sweep · 1:35 vocal chop · 2:14 strip to single
piano/Juno pad · 2:30 sustained breath (4–6 s near-silence) · 2:35 single piano stab + count-in ·
2:38 filtered sweep rebuild · 2:42 full-band crash + key modulation up a step · 3:00 harmony bloom +
handclap break · 3:15 final chorus, 3-part "oooh-woah" stack.

### 17.1b The two trio acts

- **Radiant Stones** (`JMZM`, 41 albums) — Jubilee + Melody + Zariah. Three-voice signature: *"Jubilee
  (lead clarion soprano), Melody (lyrical mezzo counter), Zariah (power alto foundation)."* Tagline:
  **"Three voices, one lampstand."** Shared DNA: speaker-labelled Suno format on every track ·
  1 Peter 2:5 "living stones" identity surfaced ≥1× per album · hook by 0:15 on every track ·
  crowd-engagement cues on ≥4 of 12 tracks (but not all 12). Carries a design-time **"Anchor Decade
  Reference"** column (e.g. "2010s Bethel/Jesus Culture") that must **never** appear in `Styles:`.
- **Kingdom Pulse** (`CASM`, 40 albums) — Caleb + Amir + Santiago. **No protocol, no style matrix, no
  documentation of any kind exists** beyond `artist.meta.json`. This is the single largest
  documentation gap in the catalogue.

**Gabriel Inspire** (`GBIM`) is deliberately **outside the 12-member music roster** — he is the Founder's
own voice (Apostle-Prophet, final authority). Celebration + light Messianic hybrid, 80% floor.
Per project memory, GBIM was removed from the CDN on 2026-06-26.

**Twin pairs / buddy system (duet and split-lead tracks):** Jubilee ↔ Melody · Elias ↔ Eliana ·
Zariah ↔ Amir · Caleb ↔ Imani · Zev ↔ Santiago · Nova ↔ Tahoma.

**Language-mode defaults:** OHI by default — Zev, Gabriel, Jubilee (flexible), Amir (flexible).
Default mode — Melody, Caleb, Nova, Santiago, Elias, Eliana, Zariah, Imani, Tahoma.
Per-album evaluation overrides; check the blueprint.

### 17.2 Melody Inspire — full DNA (representative of the depth a persona file carries)

- **Role:** Children's Faith Music / Evangelist-Teacher; Jubilee's identical twin
- **Vocal:** female warm **mezzo-alto G3–C5**, close-mic'd breath-forward delivery, **no pitch correction**
- **Content mode:** `secular_universal` — pre-evangelism; **exempt from the Faith-Focus floor**;
  "radio that carries the Kingdom"
- **Audience:** mainstream pop 13–35, TikTok/Reels native; "mothers who hand the speaker to teenage daughters"
- **Theological lane:** *"brave second / small-permission"* theology — small interior shifts (one brave
  second, one window cracked, one arm uncrossed) delivered as **relief, not triumph**
- **Aesthetic:** Juno-60 pads, 808 sub-bass, handclap on 2-and-4, tight programmed kit, brushed-snare
  softness, sidechain-pump bloom, reversed-cymbal sweep
- **Ear-candy palette:** foley (door-squeak, kettle-whistle, breath-intake, lighter-click, page-flip,
  mug-clink), reversed cymbals, vocal chops, filtered sweeps, harmony blooms in final chorus
- **Structural signature:** strip-down at 2:14 → re-entry at 2:42 → whisper-into-handoff outro
- **BPM pocket:** **108–122** (head-nod sweet spot); extend to 126 for adventurous cuts; **never above 128**
- **Ceiling:** *"Do NOT push beyond 95.5 addictiveness — that would break the brave-second contemplative
  identity and turn Melody into Imani. Honor the lane."*

### 17.3 Amir Inspire — sacred-names convention and the 2026-06-20 lane change

**Current governing spec** (`amir-arab-culture-worship-spec.md`, supersedes the earlier
"Muslim-background interfaith-bridge" concept — reason recorded as *complaints*):

Amir is an **Arab-Christian worship leader** who praises **Yasu' (Jesus)** through the beauty of Arab
**culture** — spices, colours, regions, landscapes, hospitality, crafts, music. For Christian believers
in Arab regions and the diaspora.

**HARD RULE — zero other-faith content.** No reference in lyrics, titles, `Styles:` or `[cues]` to any
other religion or its practices, figures, symbols, texts or sacred terms. **Don't engage them to
honour, contrast, or bridge. Simply never go there.** No interfaith / dialogue / comparison / "bridge"
framing of any kind.

**Banned tokens** (pre-finalise grep must return zero): `Allah` · `crescent` · `qur'?an` · `\bsufi\b` ·
`satguru` · `\bbhakti\b` · `murti` · `mosque` — plus, by the same rule: masjid, minaret, adhan,
Ramadan, Mecca/Medina, Kaaba, hajj, imam, Muhammad, ummah, shahada, Rumi, Ibn Arabi, tawhid, hijab,
and *"shanti" used religiously*.

**KEEP — Arab culture** (the heart of the lyrics): worship language *Yasu' / Yeshua, Ya Rabb, Habibi,
Abba, Hallelujah, Ameen* · instrumentation *oud, ney, qanun, buzuq, riq, darbuka, daf*; **maqam** modes
(Hijaz, Rast, Bayati, Nahawand, Saba) **as musical colour only** · spices *frankincense, myrrh, saffron,
cardamom, sumac, za'atar, cinnamon, cloves, cumin* · colours *indigo, turquoise tile, henna, gold,
crimson, desert ochre, the blue dome* · landscape *desert, oasis, dunes, wadi, cedars of Lebanon, olive
groves, date palms, the Nile, Levant hills, courtyards, fountains, the souk* · practices *hospitality,
qahwa, breaking bread, carpets, calligraphy, the fanous, pottery, the caravan, the wedding feast,
dabke* · food *dates, figs, pomegranate, olive oil, bread, honey*.

**KEEP — core Christian worship:** Jesus as Lord, Son of God, the Lamb, the cross, the blood, the
resurrection; the Father; the Holy Spirit; Scripture.

> **⚠ Superseded content still live in the older `amir-build-protocol.md`** — its §1 permits "Isa" and
> Sufi/ghazal framing. The Arab-culture spec (2026-06-20) governs. See §23.

### 17.4 Tahoma Inspire — the cultural tier system (binding, and the strictest in the catalogue)

**Core posture.** Tahoma is a **mixed-heritage individual artist who shares a faith message. He does
not represent, speak for, or hold cultural authority over any people group.**

> **Core rule:** "Tahoma may draw on a musical style with respect and appreciation. He may never claim
> to embody, own, or authentically represent a culture's sacred or ceremonial music."

**The five decision principles** — run before approving any song or style; any unfavourable answer moves
the style down a tier or triggers redesign:
1. **Consent & ownership** — freely shared, or community-owned sacred/ceremonial property?
2. **Sacredness** — does it carry ritual function restricted to initiated practitioners?
3. **Representation** — does it position Tahoma as "speaking for" a people, or simply as himself?
4. **Intent & framing** — is the style honoured on its own terms, or flattened into stereotype/costume/novelty?
5. **Attribution & benefit** — are originating traditions credited, and where possible collaborated with?

**The three tiers:**

| Tier | Meaning | Examples |
|---|---|---|
| **GREEN — Safe** | Shared or invented traditions, no sacred-ownership barrier. Perform freely. | Gospel, worship, CCM, folk, acoustic, pop, faith hip-hop, children's music |
| **AMBER — Caution** | Culturally flavoured styles he may honour respectfully, **only with attribution and no sacred elements** | Hawaiian-influenced contemporary, world-fusion, region-flavoured arrangements |
| **RED — Avoid** | Sacred, ceremonial or community-owned forms; any stereotyped imitation. **Do not produce.** | Native American ceremonial/powwow songs, ceremonial drum-and-chant, vision/healing songs, sacred chant of any tradition, sacred Hawaiian *mele* and *oli*, "Hollywood Indian" clichés, luau-kitsch, any authentic-representation claim |

**AMBER safeguards (Hawaiian-influenced):** permitted — contemporary worship drawing on Hawaiian melodic
feel, slack-key (*kī hōʻalu*) textures, ʻukulele, *leo kiʻekiʻe* falsetto, public non-sacred musical
vocabulary, framed openly as appreciation. **Required:** credit the tradition; handle the Hawaiian
language **with genuine accuracy** (mistranslating layered terms is *"a serious offense"*); involve
Hawaiian cultural input where feasible. **Hard limit:** no chant or *mele* tied to ceremony, genealogy
or sacred function.

**Required attribution note** (place once, at the top of the lyrics file, above the first `SONG TITLE:`):

> CULTURAL ATTRIBUTION (AMBER — Hawaiian-influenced, with safeguards): Tahoma Inspire is a
> mixed-heritage individual artist who appreciates Hawaiian and island musical style — slack-key
> (kī hōʻalu), ʻukulele, leo kiʻekiʻe falsetto — with gratitude to the Native Hawaiian musicians who
> shaped it. He does not represent Hawaiian culture and claims no cultural authority. Every piece here
> is a newly composed sung mele for Jesus; no sacred oli, chant, or ceremonial form is used or imitated.

**Pre-production checklist (every piece):** tier confirmed · no sacred/ceremonial material reproduced or
imitated · no representation claim · attribution present, languages accurate · caricature check passed
("a respected musician from the culture would hear appreciation, not stereotype") · **message leads** —
the faith content, not the cultural flavour, is the point.

**Default rule:** *"When a style sits between tiers, treat it as the more restrictive tier until
cultural input clears it."*

### 17.4a Tahoma's operational DO / DO-NOT (protocol §4)

**DO** — borrow musical *language* (drum heartbeat, flute voice, slack-key tunings, **generic composed
vocables** "hey-ya", "ai-yeh-no", "wey-ah-na", call-and-response forms, round-dance step rhythms) ·
sing in heart languages with inline English gloss · **honour ancestors as cloud of witnesses (Heb 12:1)
— "they cheer us on; worship and prayer go to God alone"** · honour the wound ("the suppression of song
and language was real; the celebration is the celebration of Christ who restores both") · **frame WITH,
not ABOUT** ("the songs invite Indigenous co-singing, not Indigenous spectatorship").

**DO NOT** — lift, re-text or imitate **closed sacred ceremonial repertoire** (Sun Dance songs, Native
American Church songs, specific powwow songs belonging to specific nations/clans/families, *hula
kahiko*, family-owned *oli*). *"Create NEW Christ-centered songs using the musical language; never
overwrite existing sacred songs."* · borrow ceremonial **content** (sweat-lodge texts, vision-quest
specifics, pipe-ceremony language, medicine-person prayer formulas, animal-spirit invocations) ·
position ancestors, elders or any created being as **intercessors or mediators** — Christ alone
(1 Tim 2:5) · romanticise pre-Christian spirituality as a parallel path · **mock or show contempt for
missionaries OR ancestors** ("Boarding-school theology was wrong; the missionaries who suppressed
languages were often well-meaning and culturally captive. **Both wounds named with grace.**") · use
vocables that copy specific tribal songs · use "tongues" anywhere.

**Hawaiian additions:** never name, invoke, praise or petition any Hawaiian deity, demigod or spirit —
**no Pele, Kāne, Kanaloa, Lono, Kū, Laka, Maui-as-demigod, ʻaumakua as mediators, "the akua of old."**
Land, ocean and mountains are the **Creator's handiwork (Ps 24:1)**, never independent spiritual agents.
Where a song is chant-adjacent, frame it as a **new mele-style composition for Jesus and say so in-lyric**.
Use only *hula ʻauana* (modern) feel — never *hula kahiko*.

**Scriptural anchors:** Col 1:16 · Heb 12:1-2 · 1 Tim 2:5 · Rev 7:9-10 · Acts 17:23-28 · John 4:14 ·
Ps 19, Ps 148 · Gen 2:7, John 3:8.

> **The wound doctrine is load-bearing, not decorative:** *"The celebration is celebration BECAUSE the
> wound is named and Christ has redeemed it."* The same logic governs Zariah's Middle Passage album and
> Zev's lament trio. **Stripping lament to maximise celebration scores breaks these personas.**

### 17.4b The generalised cultural risk lens (applies catalogue-wide)

Two questions decide the tier for **any** persona:

1. **Whose sacred property is the form?** Reproducing the **sacred / ceremonial / devotional form of a
   living religion or community** (Sufi qawwali, Jewish Torah-cantillation, Haitian Vodou rara, Native
   powwow) is the sharpest offence risk — **regardless of the persona's heritage** — because the form
   carries another faith's ritual function.
2. **Is it the persona's OWN heritage, or someone else's?** Own-heritage engagement carries far less
   appropriation risk and is generally fine **with theological care**; cross-cultural sacred borrowing
   is not.

> **The bright line:** *"Cultural/pop heritage = fine; a living religion's sacred / liturgical /
> devotional form = do not reproduce. **Arabic pop YES / qawwali-dhikr NO; klezmer-folk & biblical
> shofar YES / Torah-cantillation & cantorial nusach NO; Caribbean rhythm YES / Vodou-rara-as-religion
> NO.**"*

**Catalogue risk register (2026-06-23 audit):**

| Persona | Risk | Core issue |
|---|---|---|
| **Amir** | 🔴 HIGH | Sufi qawwali / Islamic devotional forms + a "Sufi Christian" persona used to evangelise Muslims |
| **Zev** | 🔴 HIGH | Reproduces Jewish **liturgical** sacred forms (Torah cantillation/te'amim, cantorial nusach, niggun) |
| **Zariah** | 🟠 MODERATE | A few albums use Haitian **rara / Vodou-rooted** material as religion, not just rhythm |
| **Gabriel / Jubilee** | 🟠 MODERATE | "Every nation" albums blend many cultures into a generic "ethnic" sound — **stereotype-by-blending** |
| **Imani** | 🟡 LOW-MOD | Gullah-Geechee **ring shout** — own lineage, but a specific community's sacred-adjacent form |
| **Elias** | 🟡 LOW-MOD | "Stolen Land, Sacred Covenant" leans into Native **land-animism** on an Americana persona |
| **Santiago** | 🟢 LOW | **Own heritage** — *"the model of a persona engaging his own heritage respectfully"* |
| Caleb, Nova, Eliana, Melody, the trios, children's | 🟢 LOW | Mostly false positives ("sacred" = holy in a Christian sense) |

**Remediation order recommended by the audit:** Amir → Zev → Zariah (ZHIM1010) → Gabriel/Jubilee
global-worship → Elias (ELIM1005) → Imani (IMIM1018). **Santiago needs none.**

**Zev's bright line specifically:** *biblical-Hebraic* worship is fine (shofar as biblical instrument,
Hebrew divine names, Yeshua, Scripture in Hebrew, Davidic praise, klezmer-**folk** colour). The problem
is reproducing the **post-biblical synagogue liturgical system** — retire Torah cantillation/te'amim
trope, cantorial *nusach*, and niggun-as-Hasidic-devotional-practice. Reframe "Cantillation Hallel" → a
sung Hallel; "…Niggun" → a sung melody.

**Zev's lament ban (a theological/ethical gate, not a stylistic preference):** on ZEIM1006 *Nachamu Ami*,
ZEIM1011 *Teshuvah*, ZEIM1013 *Holocaust Remembrance*, the words "celebrate", "celebration", "party",
"goodness being poured out" and "Hallelujah as a triumphant shout" are **banned in any context implying
rejoicing over grief**. *"NEVER apply celebration language to the Holocaust / Yom HaShoah."*

### 17.4c Santiago's guardrails — the traditional-Christian equivalent

Applies to SAIM1024, 1025, 1026 and 1032:

- **AFFIRM** the genuine love and reverence behind the practice.
- **DIRECT** all worship, prayer, ultimate trust and salvation **to God alone through Jesus Christ**.
- **HONOUR** saints and Mary as faithful **examples** to imitate and family of God to be encouraged by.
- **DO NOT** position saints or Mary as objects of worship, ultimate intercessors, or mediators
  replacing Christ.

*Anchors:* 1 Tim 2:5 · Ex 20:3-5 · Mt 4:10 · Heb 12:1-2 · Luke 1:46-55 ("Mary worships God; she does
not receive worship"). On SAIM1032 — "the most sensitive" — **never pray TO any saint or Mary; never
call Mary 'Mother of Mercy' or 'Queen of Heaven' in a worship sense.** She may appear as the faithful
example who magnified the Lord and pointed at Jesus (John 2:5).

*A model safeguard already in the catalogue* — SAIM1008 "Vivos en Cristo" (Día de los Muertos) states:
*"This album is not spiritistic. It does not pray to the dead… does not suggest the dead return to
visit… does not turn the cemetery into a party."*

### 17.4d Required shape of any cultural attribution note

Five components, all mandatory:
1. **Mixed-heritage individual sharing a faith message**
2. Explicit list of the **art forms appreciated**
3. Explicit **NOT** representing / not speaking for / **no claim of authenticity or cultural ownership**
4. Explicit **enumeration of the sacred forms not reproduced**
5. **Accuracy statement** for any heart-language words used, with a glossary

Persisted in two places: a persona-level `persona_posture` string in `artist.meta.json`, and album-level
fields in `album.meta.json` (`cultural_tier`, `cultural_lane`, `cultural_attribution`,
`cultural_guardrail`, `attribution_note`: `"present" | "added" | "n/a-green"`).

> **⚠ Critical operational lesson (2026-08-09).** A June 2026 compliance pass renamed 19 Tahoma albums
> away from RED-tier concepts **but never renamed the folders, and on nine albums never finished
> rewriting the content.** Folders like `powwow-prayers`, `sacred-circle`, `hozho-restored` and
> `stolen-land` still hold albums now titled *Honor the King*, *Gathered Around the Cross*, *Made
> Whole* and *The Earth Is the Lord's*. **Any worker taking its subject from a folder name reinstates
> the removed material.** A rebuild must either rename the folders or carry a Rule Zero equivalent
> (see §18.4). Content residue found in 2026-08: a "Holy Great One" refrain across six tracks (a calque
> of a retired Diné Creator-name), "hand drum heartbeat" framing in twelve Styles lines, and the word
> *oli* in a sung bridge.

---

### 17.5 Genre and style catalogues

### 17.5.1 The two-style fusion doctrine

- **An album = the persona's primary lane × exactly ONE secondary.** Amir's Bollywood spec states it
  bluntly: *"MIX ONLY TWO STYLES AT A TIME… **Never stack three.**"*
- **Fusion Logic filter:** *"Fusion pairings must solve a creative problem, not decorate."*
- **Canonical fusion list:** country + prophetic declaration · Broadway + worship (Jubilee) ·
  Afro-Caribbean + teaching hymnody (Zariah) · Messianic + electronic/cinematic · pop + testimony
  storytelling · Celtic + ambient healing · Arabic maqam + acoustic lament · Latin ballad + theatrical
  worship · indigenous drum + a cappella lament · bluegrass + apostolic commissioning · hip-hop cadence
  + prophetic spoken word · gospel choir + orchestral cinematic · Pentecostal live + jazz fusion ·
  Hebraic chant + modern worship band.
- **Ten creative quality filters:** Distinctiveness · Fusion Logic · Sentiment Fit · Persona Fidelity ·
  Gospel Integrity · Memorability · Non-Generic Test · Hit-Engineering Test · Viral Pathway Test ·
  Lyrical Honesty Test.
- **Micro-marker requirement (non-negotiable):** every album must specify culture-specific micro-markers
  for its persona — e.g. Amir must name a **maqam** (Bayati, Hijaz, Rast, Saba, Nahawand, Kurd, Hijaz
  Kar, Ajam), an **Arabic dialect** (Egyptian, Levantine, Gulf, Maghrebi), and an **ornamentation**
  (tarab, mawwal, layali); Nova must name Celtic lineage + instrumentation (uilleann pipes, bodhrán,
  hammered dulcimer, harp, low whistle, nyckelharpa); Zev must name mode + instrument (Ahava Raba /
  Mi Sheberach; oud, ney, kinnor, tof, dumbek, klezmer clarinet, shofar).

### 17.5.2 How a secondary style is chosen — three mechanisms in use

1. **Fixed build matrix** — a numbered table assigns one secondary style per album code with a target
   BPM window (and for Amir, a maqam/key suggestion). Used by Amir ×2, Zev, Santiago, Tahoma ×2, Nova.
2. **Rule of Distinctness** — used by the `_catalog` personas (Caleb, Zariah, Zev, Radiant Stones):
   no two albums share a fusion pairing · **no two albums share the same opener BPM or finale key** ·
   each album rotates its own 12-song archetype spine. Zariah adds: **each album lives in ONE diaspora
   sub-region** so the catalogue also tours geographically.
3. **Fusion clusters** — adjacent albums are assigned to named clusters and **no two adjacent albums
   share a cluster**, so a listener cycling through hears genuine change every album.

### 17.5.3 The eight-archetype within-album rotation

Four personas publish an explicit **eight-archetype spine**. Every album must touch all eight; the order
is scrambled per album; a 12-slot rotation table is published per album.

| Slot | Caleb | Zariah | Zev | Radiant Stones |
|---|---|---|---|---|
| **A** | Pastoral Opener 64–82 | Carnival Opener 118–132 | Cantorial Opener 60–76 (Ahava Raba) | Concert Opener 118–132 |
| **B** | Mid-tempo Worship Anthem 92–108 | Mid-tempo Diaspora Anthem 104–118 | Festival Celebration 112–132 | Up-tempo Anthem 110–126 |
| **C** | Neo-Soul Groove 78–96 | Conscious Riddim Groove 78–96 | Davidic Psalm-Groove 88–104 (Dorian) | Mid-tempo Groove 92–108 |
| **D** | Tender Confession Ballad 56–72 | Tender Soul-Ballad 62–78 | Hebraic Lament (Kinah) 54–70 | Tender Ballad 62–78 |
| **E** | Cinematic Build 70–92 | Cinematic Spiritual 70–92 | Cinematic Liturgical Build 72–92 | Cinematic Build 84–100 |
| **F** | Driving Praise 116–132 | Praise Dance Break 122–140 | Hora Dance Break 120–140 | Dance Break 124–138 |
| **G** | Spoken-Word / Prophetic 84–104 | Spoken-Word Protest-Praise 88–108 | Prophetic Shofar Proclamation 84–100 | Prophetic Declaration 96–114 |
| **H** | Benediction Finale 76–104 | Carnival Sending Finale 110–126 | Aaronic Benediction Finale 68–88 | Concert Finale / Encore 108–122 |

**Thematic-weight exceptions:** Zev's lament albums (1006, 1011, 1013) use **only A, D, E, G** — no
Festival (B), no Hora (F), and celebration-coded language is forbidden. Caleb 1008/1016/1020 open on **D**
rather than A. Zariah 1014 (Middle Passage) is the most cinematic-heavy "because its subject matter is
the most grave."

**Rhythmic signature discipline:** each archetype draws from **that album's fusion partner specifically**
— archetype F means *driving electric + toms* on one album and something else on another, never a
generic dance break. This is what keeps every archetype instance album-specific.

### 17.5.4 Pre-chorus / bridge / outro archetype rotations

Universal rule: **each album rotates through all archetypes across its 12 songs — none repeated more
than 2× per album.**

- **Pre-chorus (6):** Confession-to-Praise Turn · Concrete Image-Pivot · Scripture-Quote Lift ·
  Question-to-Answer · Elder-Voice Recall · Anticipation Build. *(Zariah swaps in Call-and-Response
  Setup; Zev swaps in Hebrew-Phrase Lift, Cantor's Question, Ascent Build.)*
- **Bridge (7):** Spoken-Word Drop · Naming Bridge · Modulation Climb · Drums-Out Trio Moment ·
  **Echo-Reprise** (a line from track 1/4/8 returns) · Hymn-Phrase Anchor · Father-Voice Reframe.
  *(Zev swaps in Cantillation Drop, Hebrew-Liturgy Anchor, Shofar/Call Break.)*
- **Outro (6):** Instrumental Tag · Single-Line Sustain · Whispered Reprise · Congregation Sing-Along
  Fade · **Held Final Word** ("Father"/"Anchor"/"Refuge"/"Home") · Benediction Spoken. *(Zev swaps in
  Cantillation Fade, Hebrew-Phrase Sending, Aaronic Benediction.)*

> **This rotation system is the built-in answer to §18.** It was designed *as remediation* after the
> same three formulaic wrappers were mass-produced across Caleb, Zariah and Zev — the pre-chorus
> "But Jesus/Yeshua, I celebrate…", the bridge "I declare…", and the outro "I am held, I am loved, I
> celebrate". **Design the archetype rotation in from the start, not as a cleanup.**

### 17.5.5 The eight-category album-title taxonomy (523 titles, 13 artists)

| # | Category | Scope | Albums |
|---|---|---|--:|
| 1 | **Salvation & Testimony** | Redemption, deliverance, grace, the prodigal's return, recovery | 99 |
| 2 | **Worship, Praise & Celebration** | Joy, dancing, exaltation, festal and revival energy | 97 |
| 3 | **The Kingdom & Christ's Return** | Throne, reign, second coming, new heaven & earth, jubilee/millennial hope | 54 |
| 4 | **Healing & Wholeness** | Physical, emotional and trauma healing; comfort, restoration | 46 |
| 5 | **Prayer, Devotion & Spiritual Intimacy** | Surrender, seeking, encounter, daily devotion, the Word, refuge, doubt | 64 |
| 6 | **Faith, Family & Generations** | Heritage, ancestors, passing faith down, calling, home, lineage, covenant | 71 |
| 7 | **Justice, Reconciliation & Belonging** | Bridges across peoples, diaspora, the margins, prophetic witness | 51 |
| 8 | **Everyday Life & Coming of Age** | Youth, self-discovery, relationships, growing up, financial literacy | 41 |

> *"Cultural/genre identity (Hebrew, Latino, African-Caribbean, Native/Hawaiian, Middle Eastern,
> Country, Gospel, Pop) is a **cross-cutting filter that overlays all 8 categories**"* — it is not a
> ninth category.

**Observable per-persona title conventions:** Category 8 is effectively **Melody's exclusive lane**
(40 of 41 titles) — lowercase-life nouns and small-scene phrases ("Coffee Confessions", "Half the Rent",
"Keys to My Own Car"). **Santiago** titles are Spanish-primary with accents preserved. **Zev** titles
carry transliterated Hebrew loanwords. **Tahoma** titles are English-primary with heart-language as a
parenthetical or head-noun — *which conflicts with the ban on parenthetical glosses (§23)*.
**Elias / Eliana** run country-idiom compound phrases.

### 17.5.6 The published build matrices (verbatim — these are the live assignments)

A build matrix is how a 20-album batch is commissioned in one document: one row per album code fixing
its **theme + scripture anchor**, its **one secondary style**, its **BPM window**, and (where the lane
demands it) its **mode/key**. Six matrices are published. Reproduce them exactly; the BPM windows and
mode names are load-bearing, not suggestions.

#### Amir — AMIM1029–1048 · base: faith-based Arabic Pop (oud + qanun + darbuka + ney + electric bass + programmed kick)

| Code | Theme (anchor) | Secondary style | BPM | Maqam / key |
|---|---|---|---|---|
| AMIM1029 | The Beloved who first loved us (1 Jn 4:19) | Ghazal | 100–112 | Bayati / D Hijaz |
| AMIM1030 | The longing heart (Ps 42) | Qawwali † | 108–122 | Rast / C major |
| AMIM1031 | Light upon light (Jn 8:12) | Andalusian classical | 102–114 | Nahawand / G minor → warm-major lift |
| AMIM1032 | The wine of the Spirit (Eph 5:18) | Sufi (broad) † | 110–124 | Hijaz / D phrygian-dominant |
| AMIM1033 | The Friend of the road (Jn 15:15) | Persian pop | 104–118 | Shur / E minor warm |
| AMIM1034 | The journey home (Lk 15) | Filmi / Bollywood | 116–128 | Nahawand / C minor → C major |
| AMIM1035 | The Name above all names (Php 2:9) | Naat † | 100–114 | Rast / C major reverent-bright |
| AMIM1036 | Mercy that never runs dry (Lam 3:22-23) | Tarab / classical Arabic | 88–104 | Saba / D minor lament-to-bloom |
| AMIM1037 | The veil lifted (2 Cor 3:18) | Mugham | 96–110 | Shur / D minor slow-burn |
| AMIM1038 | The garden of the soul (Jn 15) | Persian classical (dastgah) | 100–114 | Mahur / C major lush |
| AMIM1039 | The nightingale at dawn (Ps 30:5) | Arabesque | 104–118 | Hijaz Kar / D rising-melody |
| AMIM1040 | The wanderer welcomed home (Lk 15) | Bhangra | 118–128 | Rast / C major celebration |
| AMIM1041 | The unshakable refuge (Ps 46) | Khaleeji | 110–124 | Bayati / D driving-strength |
| AMIM1042 | Tears that turn to dancing (Ps 30:11) | Dangdut | 112–126 | Nahawand / D minor→major burst |
| AMIM1043 | One pearl worth everything (Mt 13:46) | Chaabi | 108–122 | Hijaz / D Maghrebi-celebration |
| AMIM1044 | The breath / Spirit moving (Gen 2:7; Ezek 37) | Gnawa | 106–120 | Bayati / D Moroccan-trance |
| AMIM1045 | The covenant of faithful love | Nasheed † | 100–114 | Rast / C major devotional |
| AMIM1046 | The desert made to bloom (Isa 35:1) | Raï | 116–128 | Hijaz / D Algerian-celebration |
| AMIM1047 | The call across the night (Ps 130) | Turkish pop | 108–120 | Kurd / D haunting arabesque-pop |
| AMIM1048 | The healing touch (Ps 147:3) | Filmi / Bollywood (emotional) | 100–114 | Nahawand / D minor → major |

> **† These four rows are retired and MUST be re-cut before use.** Qawwali, Sufi-broad, naat and nasheed
> are devotional *forms of another faith*. The 2026-06-20 Arab-culture spec (§17.3) replaced Amir's
> lane with **Arab culture, not Islamic devotion** — musical vocabulary yes, devotional form no. The
> matrix was never updated. See §23 item 20.

#### Amir — AMIM1049–1068 · base: Bollywood / Filmi Indian Pop (dhol + tabla + sitar + bansuri)

| Code | Theme (anchor) | × Secondary | BPM | Anchor title |
|---|---|---|---|---|
| AMIM1049 | Jesus the one true Lord & Savior (Jn 14:6) | Anthemic Pop-Rock | 118–128 | The Only Way Is You |
| AMIM1050 | The seeker who finds the answer (Jer 29:13) | Filmi-Folk | 110–120 | The Search Is Over |
| AMIM1051 | Wholehearted surrender — bhakti → Christ (Mk 12:30) | Qawwali † | 108–122 | All of My Heart |
| AMIM1052 | Honouring parents & elders (Ex 20:12; Eph 6:1-3) | Acoustic Soul | 100–112 | Blessing in the House |
| AMIM1053 | Light overcoming darkness (Jn 8:12) | EDM / Dance-Pop | 120–128 | Light Has Won |
| AMIM1054 | Grace, not striving (Eph 2:8-9; Mt 11:28) | Lo-fi / Chillhop | 100–112 | Nothing Left to Earn |
| AMIM1055 | Jesus the true Teacher / Satguru (Mt 23:10) | Desi Hip-Hop | 100–115 | Follow the Teacher |
| AMIM1056 | A personal relationship with Jesus (Jn 15:15) | Contemporary Worship | 104–118 | You Know My Name |
| AMIM1057 | Celebration, music & joyful dance (Ps 149:3) | Bhangra | 120–130 | Heaven on the Dance Floor |
| AMIM1058 | Community & belonging (Heb 10:25) | Gospel Choir | 112–124 | No One Walks Alone |
| AMIM1059 | Identity & dignity (Gal 3:28; Gen 1:27) | Pop Anthem | 116–126 | Made in His Image |
| AMIM1060 | Forgiveness & a new heart (2 Cor 5:17; Ezek 36:26) | R&B / Soul | 100–114 | A Brand New Heart |
| AMIM1061 | Peace that surpasses understanding (Php 4:7) | Ambient-Cinematic Pop | 100–112 | *(anchor "Shanti in the Storm" — see note)* |
| AMIM1062 | Hope & perseverance through hardship (Rom 5:3-5) | Rock | 116–128 | Hold On to Hope |
| AMIM1063 | Prayer woven into daily life (1 Th 5:17) | Acoustic Pop | 104–116 | Morning and Evening |
| AMIM1064 | Hunger for Scripture in the heart language (Ps 119:105) | Folk-Pop | 110–120 | Lamp for My Feet |
| AMIM1065 | Healing & restoration (Ps 147:3) | Soul (ballad → uptempo) | 100–116 | He Heals the Broken |
| AMIM1066 | Hospitality & caring for the poor (Mt 25:35-40) | Funk / Disco | 114–126 | *(anchor "Room at My Table" — see note)* |
| AMIM1067 | Marriage, purity & intentional love (Heb 13:4) | Romantic Pop | 104–118 | Worth the Wait |
| AMIM1068 | Eternal hope & Christ's return (1 Pet 1:3-4; Rev 21) | Cinematic Orchestral-EDM | 116–128 | Forever Starts Now |

> **Anchor titles are proposals, not locks.** The spec says: *"Titles below are ANCHORS — finalize a
> crisp, ≤30-char, catalog-unique title. Verify uniqueness by searching `catalog-manifest.json` before
> finalizing."* Two of these anchors ("Shanti in the Storm", "Room at My Table") were never adopted —
> the live albums carry different titles. **The manifest is the title authority, never the matrix.**
> A 2026-08 refresh worker read the matrix and "restored" both anchors over live titles; both had to be
> reverted. See §11 and §18.5.

#### Zev — ZEIM1021–1040 · base: faith-based Arabic Pop (Levantine Mizrahi palette)

| Code | Theme | Secondary style | BPM |
|---|---|---|---|
| ZEIM1021 | Yeshua as Messiah | Messianic Praise & Worship | 110–118 |
| ZEIM1022 | Faithfulness of Adonai | Davidic Worship / Dance | 118–128 |
| ZEIM1023 | God of Abraham, Isaac, Jacob | Hebraic Roots Worship | 104–114 |
| ZEIM1024 | Israel and the Jewish people | Shirei Eretz Yisrael (land songs) | 108–118 |
| ZEIM1025 | The Shema / oneness of God | Chazzanut (cantorial) | 96–110 |
| ZEIM1026 | Feasts of the Lord (Moadim) | Mizrahi | 116–128 |
| ZEIM1027 | Shabbat / sabbath rest | Zemirot (table songs) | 100–112 |
| ZEIM1028 | Shalom / wholeness | Israeli Pop (Zemer Ivri) | 112–122 |
| ZEIM1029 | Torah delight | Scripture songs / psalms set to music | 104–116 |
| ZEIM1030 | Grafted in / one new family | Hasidic-Orthodox Pop | 116–128 |
| ZEIM1031 | Jerusalem / Zion | Yemenite Jewish | 108–120 |
| ZEIM1032 | Chesed / covenant faithfulness | Piyyut (liturgical poems) | 100–114 |
| ZEIM1033 | Redemption / Passover Lamb | Niggun (wordless mystical) | 104–118 |
| ZEIM1034 | The Name (HaShem / Yeshua) | Israeli Rock | 118–128 |
| ZEIM1035 | Restoration of Israel | Klezmer | 116–130 |
| ZEIM1036 | Davidic praise / dance | Israeli Trance / Electronic (faith-based) | 122–132 |
| ZEIM1037 | Coming kingdom / hope | Messianic Hip-Hop | 90–108 |
| ZEIM1038 | Living water / wells of salvation | Sephardic / Ladino | 104–118 |
| ZEIM1039 | Family / generations / pass on faith | Messianic Folk singer-songwriter | 96–112 |
| ZEIM1040 | Light to the nations | Israeli Hip-Hop | 96–110 |

**Cross-cutting rider — themes that get song-level, not album-level, treatment:** roots of the faith
(woven into 1023, 1030) · Aaronic blessing (T7 testimony anchor in 1027, 1031, 1040) · teshuvah
(T9 reconciliation tracks in 1033, 1037) · todah (chorus refrains throughout — *gratitude is the
standing posture*) · Yahweh Rapha (healing songs in 1029, 1038).

#### Santiago — SAIM1022–1041 · base: Celebration Praise & Worship

| Code | Theme | Latin style | BPM | Spanish title hint |
|---|---|---|---|---|
| SAIM1022 | Jesus as only Savior and Lord (Jn 14:6) | Reggaeton | 95–105 | Solo Tú, Jesús |
| SAIM1023 | Faith and family (*la familia*) | Latin pop | 110–125 | La Familia Que Ora |
| SAIM1024 | Honouring grandparents (*los abuelos*) | Mariachi / Ranchera | 95–118 | Las Manos de Abuela |
| SAIM1025 | Devotion and reverence in worship | Bolero | 65–85 | Cuánto Te Adoro |
| SAIM1026 | Cross and Christ's sacrifice (*Calvario*) | Flamenco | 100–118 | La Cruz Habla |
| SAIM1027 | Mercy and grace (*la misericordia*) | Bachata | 100–120 | Misericordia Sin Final |
| SAIM1028 | Repentance and conversion of heart | Rock en español | 118–128 | Vuelvo a Casa |
| SAIM1029 | Prayer as a way of life | Bossa nova | 90–108 | Oración Diaria |
| SAIM1030 | Hunger for God's Word | Sertanejo | 105–122 | Tu Palabra Es Mi Pan |
| SAIM1031 | Encounter with the living Jesus | Salsa | 95–110 | Te Encontré, Jesús |
| SAIM1032 | Cloud of witnesses (Heb 12:1) ‡ | Vallenato | 100–118 | Nube de Testigos |
| SAIM1033 | Hope & perseverance through suffering | Tango | 90–115 | El Tango de la Cruz |
| SAIM1034 | Dignity of every person (*Imago Dei*) | Latin trap / Urbano | 90–105 | Hecho a Su Imagen |
| SAIM1035 | Care for poor and stranger (Mt 25) | Cumbia | 95–115 | Cumbia del Pan Compartido |
| SAIM1036 | Sacred celebration and feast | Samba | 100–118 | Samba de la Fiesta Santa |
| SAIM1037 | Pilgrimage and spiritual journey | Corridos tumbados / sierreño | 95–115 | Corrido del Peregrino |
| SAIM1038 | Cultural identity rooted in faith | Regional Mexican (banda, norteño) | 105–122 | Raíces en Cristo |
| SAIM1039 | Marriage, vocation, purity | Merengue | 115–130 | Para Siempre, en Cristo |
| SAIM1040 | Gratitude / *acción de gracias* | Funk carioca | 125–135 | Acción de Gracias |
| SAIM1041 | God's faithfulness across generations | Dembow | 100–118 | Fiel a Cada Generación |

> **‡ SAIM1032 carries an inline doctrinal guard in the matrix itself:** *"Bible-anchored ONLY; NO
> prayer to saints, NO Mary as mediator."* See §17.4c.

#### Tahoma — THIM1021–1040 · base: Celebration Praise & Worship

| Code | Theme | Indigenous/Pacific style | BPM | Matrix title |
|---|---|---|---|---|
| THIM1021 | Celebration & dance before the Creator | Powwow / intertribal Big Drum ★ | 100–115 | Dance Before the Maker |
| THIM1022 | The Creator / Maker of all things | Native American flute ★ | 80–105 | The Maker's Breath |
| THIM1023 | The mountain of encounter | Slack key guitar (kī hōʻalu) | 90–110 | Up the Mountain (Tahoma) |
| THIM1024 | The Living Water — Christ | Hawaiian chant (mele oli) ★ | 80–105 | Wai Ola (Living Water) |
| THIM1025 | All creation singing the Creator's glory | Contemporary Hawaiian | 100–118 | Every Mountain Sings |
| THIM1026 | Walking the good road with Christ | Native country and folk | 95–115 | Good Road Travelin' |
| THIM1027 | The Spirit's wind and breath | Hawaiian falsetto (leo kiʻekiʻe) | 85–110 | Hanu (Breath of the Spirit) |
| THIM1028 | Mercy and a new heart | Jawaiian / Hawaiian reggae | 75–95 | Mercy Like the Tide |
| THIM1029 | Freedom from chains | Native reggae | 75–95 | Chains Off, Hands Up |
| THIM1030 | Light overcoming darkness | Powwow rock ★ | 110–130 | Light on the Mountain |
| THIM1031 | The Great Reconciler | Stomp dance (Cherokee call-and-response) ★ | 95–115 | Two Hands, One Heart |
| THIM1032 | Endurance and hope through suffering | Northern traditional drum song ★ | 95–115 | Strong Heart Walking |
| THIM1033 | Prayer woven into daily life | Native flute + ambient ★ | 80–105 | Pray Along the Way |
| THIM1034 | The Word in our own tongue | Native American hymnody (multilingual) | 85–110 | Heart Tongue Hymn |
| THIM1035 | The journey home / the eternal home | Hapa haole | 100–118 | Going Home Together |
| THIM1036 | Courage and a redeemed warrior's heart | Native American hip-hop | 90–105 | Warrior of the Lamb |
| THIM1037 | Caring for elders and children | Round dance songs ★ | 95–115 | Both Ends of the Circle |
| THIM1038 | Gratitude to the Giver | Hula music — mele hula | 95–115 | Mahalo to the Maker |
| THIM1039 | Harmony and balance restored (shalom) | Navajo song style ★ | 95–115 | Hózhó Restored (Shalom in His Hand) |
| THIM1040 | Word made flesh — Jesus among us | Native gospel | 100–118 | He Walked Among Us |

> **★ Nine of these twenty rows are now RED-tier or RED-adjacent under the Tahoma Music Style
> Guidelines (§17.4).** Powwow songs, ceremonial Big Drum, Northern traditional, round dance, stomp
> dance, Navajo ceremonial song style and sacred Hawaiian *mele oli* are exactly the repertoire Tahoma
> may not produce. The June 2026 compliance pass renamed 19 albums and rewrote their content — **this
> matrix predates it and was never re-cut.** Rebuilding from this table re-introduces the violation.
> The parenthetical-gloss album titles here ("Wai Ola (Living Water)") also conflict with the
> title-standard ban on parenthetical glosses. Treat this matrix as **historical record, not a
> commission.**

#### Tahoma — THIM1041–1060 · base: ʻukulele / slack-key island bed (Hawaiian batch)

| Code | Theme (anchor) | Island style | BPM | Anchor title |
|---|---|---|---|---|
| THIM1041 | Jesus the one true Lord & Savior (Jn 14:6) | Hawaiian Christian worship / Mele Hoʻonani | 100–115 | The One True Way |
| THIM1042 | ʻOhana — family that never lets go (Ps 68:6) | Kanikapila (backyard jam) | 105–120 | ʻOhana Never Lets Go |
| THIM1043 | Aloha as the love of Christ (Jn 13:34-35) | Island contemporary / reggae-pop | 100–118 | Aloha Has a Name |
| THIM1044 | Mālama ʻāina — caring for the land (Gen 2:15) | Contemporary Hawaiian roots + slack-key | 95–112 | Mālama (Keep the Land) |
| THIM1045 | The Creator of mauka to makai (Ps 19) | Traditional acoustic + steel guitar | 95–115 | Mauka to Makai |
| THIM1046 | Pono — living rightly before God (Mic 6:8) | Hawaiian falsetto + slack-key | 90–112 | Live Pono |
| THIM1047 | Hoʻoponopono — reconciliation (Mt 5:23-24) | Jawaiian / Hawaiian reggae | 78–96 | Make It Right |
| THIM1048 | Honouring the kūpuna / elders (Lev 19:32) | Hapa haole (golden-era) | 95–112 | Honor the Kūpuna |
| THIM1049 | Lōkahi — unity & harmony (Ps 133:1; Jn 17:21) | Polynesian / Pacific fusion | 100–118 | Lōkahi (One in Him) |
| THIM1050 | Kuleana — responsibility & calling (Col 3:23) | Local hip-hop / Hawaiian rap | 92–108 | My Kuleana |
| THIM1051 | Living water & the ocean of His love (Jn 4:14, 7:38) | Steel guitar (kīkākila) + slack-key | 90–112 | Ocean of His Love |
| THIM1052 | Hoʻokipa — hospitality / welcome (Heb 13:2) | Kanikapila / island contemporary | 105–120 | Room on the Lānai |
| THIM1053 | Peace & rest — maluhia (Jn 14:27; Php 4:7) | Slack-key gentle + falsetto | 84–104 | The Peace He Gives |
| THIM1054 | Identity & dignity in Christ (Gen 1:27; Isa 43:1) | Island reggae-pop | 100–118 | Named and Loved |
| THIM1055 | Joyful celebration — mele & hula (Ps 149:3, 150) | Mele hula ʻauana + ʻukulele | 100–120 | Hula for the Lord |
| THIM1056 | Healing & restoration (Ps 147:3; Ex 15:26) | Falsetto + steel guitar (ballad→uptempo) | 88–112 | Lapaʻau (He Heals) |
| THIM1057 | Light overcoming darkness (Jn 1:5, 8:12) | Island reggae-pop (bright) | 100–118 | Light on the Water |
| THIM1058 | Hope & perseverance through hardship (Rom 5:3-5) | Contemporary Hawaiian / Pacific fusion | 100–118 | Paʻa (Hold Fast) |
| THIM1059 | The Word in the heart language (Ps 119:105) | Hīmeni / Hawaiian hymnody + slack-key | 85–108 | Hīmeni in My Tongue |
| THIM1060 | Eternal home & the hope of glory (1 Pet 1:3-4) | Hapa haole / island contemporary (cinematic finale) | 100–118 | Home at Last |

> This batch is **AMBER-compliant by construction** — every style listed is public, non-sacred island
> musical vocabulary, and `mele ʻauana` (secular/entertainment hula) rather than ceremonial `mele oli`.
> Each album still requires the attribution note of §17.4d. Contrast with THIM1021–1040 above.

#### Nova — NVIM1031–1050 · single-lane synthwave (**no fusion this batch**)

Nova's matrix is the exception that proves the two-style rule: the column is a **sub-style**, not a
secondary genre. Sub-style carries its own BPM.

| Code | Theme | Scripture | Sub-style |
|---|---|---|---|
| NVIM1031 | The Light that breaks the darkness | Jn 1:5 | Dark synthwave → bright drop |
| NVIM1032 | Eternity / the timeless God | Ps 90:2 | Ambient synthscape (slow build) |
| NVIM1033 | The new creation / made new | 2 Cor 5:17 | Retrowave (power-down → boot-up) |
| NVIM1034 | Heaven's frequency / tuning in | *(Spirit as wavelength)* | Synth-pop (radio/signal metaphor) |
| NVIM1035 | The pursuit through the dark city | Ps 139 | Outrun (driving 4/4 chase) |
| NVIM1036 | Awe and vastness of God | Ps 8 | Cosmic / starlit (wide pads) |
| NVIM1037 | The dawn is coming | Ps 30:5 | Ambient → outrun (long rise) |
| NVIM1038 | Surrender / letting the noise go quiet | Ps 46:10 | Chillwave (strip to one tone) |
| NVIM1039 | The signal home / the call back | Lk 15 | Synth-pop (transmission home) |
| NVIM1040 | Living water in a neon desert | Jn 4 | Dark synthwave + bright contrast |
| NVIM1041 | Burning bright / set ablaze | Mt 5:14 | Retrowave anthemic (glowing arps) |
| NVIM1042 | The unshakable kingdom | Heb 12:28 | EDM-leaning synthwave |
| NVIM1043 | Resurrection / coming alive | Ezek 37 | Cinematic synth-rock (power surge) |
| NVIM1044 | The Maker of the stars | Ps 147:4 | Cosmic / starlit |
| NVIM1045 | Breaking the loop / freed from cycle | *(grace breaks pattern)* | Synth-pop (loop-as-rut, drop-as-grace) |
| NVIM1046 | The still small voice in the static | 1 Kgs 19:12 | Glitch-into-clean |
| NVIM1047 | Unfailing love on repeat | Lam 3:22-23 | Chillwave / synth-pop (looping bassline) |
| NVIM1048 | The waiting / the watchtower | Ps 130 | Ambient → dawn-resolution |
| NVIM1049 | Identity / who You say I am | Isa 43:1 | Synth-pop introspective |
| NVIM1050 | Glory breaking through / the veil torn | Mt 27:51 | EDM build-and-drop (drop = curtain torn) |

**Nova sub-style BPM authority** — Outrun 118–128 · Chillwave/dreamwave 90–108 · Dark synthwave
100–115 · Retrowave anthemic 118–125 · Ambient synthscape 60–95 **no kick** · Synth-pop 110–125 ·
EDM-leaning 122–128 · Cinematic synth-rock 108–122 · Cosmic/starlit 96–115 · Glitch-into-clean
variable. Overall pocket **108–128** core; ambient may drop to 80–96; outrun may reach 132.
Nova is also the only lane whose tag whitelist adds **`[Drop]`**, and it records fusion as
`{"base": …, "sub_style": …}` rather than `{"base": …, "secondary": …}`.

### 17.5.7 Catalog-loop points

Two distinct loop seams exist. Do not confuse them.

1. **Intra-album T12 → T1** (universal, all personas). Every album's final 30 seconds must pull back
   into its own opener. Achieved by ending on a sustained vowel, drone or vamp turnaround in a
   tone/tempo compatible with track 1. Scoring band: *95+ = "T12→T1 seamless; no natural stopping
   point" · 90–94 = "most transitions pull forward; T12→T1 works with brief gap."* The `album.meta.json`
   field is `catalog_loop_seed: "{T12 outro instrumentation + tempo}"`.
2. **Batch wrap-around, last album → first album** (three batches only, stated verbatim in their
   protocols):
   - **Santiago:** SAIM1041 T12 → SAIM1022 T1 (Dembow → Reggaeton, both 100–105 BPM, both urbano-family).
   - **Tahoma:** THIM1040 T12 → THIM1021 T1 (Native gospel drum-tail → Big Drum opener, both 100–115 BPM,
     both call-and-response, common D-major / E-mixolydian bleed).
   - **Nova:** NVIM1050 T12 ("the veil torn") → NVIM1031 T1 ("the Light breaking the darkness"), via
     sustained pad + key-compatible tonal pass-through.

   **There is no album-N → album-N+1 sequencing rule anywhere in the system.** A 20-album batch is a
   single ring closed at one seam, not a chain. Amir (both batches), Zev and the Tahoma Hawaiian batch
   declare only the intra-album seam.

### 17.5.8 The Ten Viral Characteristics (engineer into EVERY song)

Every persona protocol carries this list, with persona-specific examples. The abstract form:

| # | Characteristic | The measurable requirement |
|---|---|---|
| 1 | **Strong repetitive hook** | Chant phrase **4–7× per chorus**, **≤ 8 syllables** |
| 2 | **Simplicity and singability** | 4-chord default, limited melodic range, easy notes, congregational |
| 3 | **Danceable steady groove** | **100–130 BPM** (Nova 108–128; Tahoma 75–130) with a clap/percussion pocket |
| 4 | **Immediate payoff** | Hook by **0:14**, chorus by **0:30** |
| 5 | **Short loop-able standout moment** | A **5–15 s** segment that works alone (dance break, riff, melisma, punch line) — usually engineered at **T8** |
| 6 | **Universal relatable themes** | Yearning · joy · homecoming · deliverance · healing · refuge — any listener can map their own life onto it |
| 7 | **Emotional uplift** | Major-key default; minor only for an intentional lament/tarab/dark lane **that resolves to a major drop** |
| 8 | **Memorable rhythmic phrasing** | Internal rhyme, alliteration, bilingual call-and-response, syllables locked tight to the beat |
| 9 | **Novelty inside familiarity** | The fusion is the novelty; the **verse–chorus–bridge structure stays familiar** |
| 10 | **Built-in participation** | Clap pattern · chant phrase · dance/step cue · fill-in-the-blank line · congregational shout-back |

**Persona chant-phrase examples (characteristic 1 and 10):** Amir — *"Habibi, the Beloved found me!" ·
"Light upon light upon light!" · "Ya Rabb, the veil is lifted!"* · Amir-Bollywood — *"Jai Yeshu, the
Light has come!" · "Naacho, naacho, heaven's in the room!"* · Santiago — *"¡Cristo Es Rey!" · "¡Solo
Tú, Jesús!" · "¡Misericordia sin final!"* · Tahoma — *"Dance Before the Maker" · "Wai Ola flowing
free" · "Mahalo to the Maker"* · Nova — *"The Light breaks through the dark!" · "He's the signal
home!"*

**Metadata record.** Amir, Amir-Bollywood, Zev, Nova and Tahoma-Hawaiian record compliance as a flat
array of ten kebab-case slugs, positionally matching the list:

```json
"viral_traits_engineered": ["strong-repetitive-hook","singability","danceable-groove-100-130-bpm",
  "immediate-payoff","loop-able-T8","universal-relatable","emotional-uplift",
  "memorable-rhythmic-phrasing","novelty-inside-familiarity","built-in-participation"]
```

Nova substitutes `"danceable-groove-108-128-bpm"` in slot 3. **Santiago and the Tahoma base protocol
omit the field entirely** — a schema gap (§23).

---

## 18. Freshness and anti-repetition doctrine

*This section is not in the original corpus. It was derived from the August 2026 catalogue-wide
freshness sweeps across Amir (68), Melody (89) and Tahoma (60) albums, and is the single largest
quality risk the pipeline has at scale. Treat it as law for any album beyond the first few per persona.*

### 18.1 Why it happens

The pipeline's strengths become its failure mode. A persona has a signature structure, a signature
aesthetic, a signature hook rhythm. Producing 60–90 albums against the same protocol without a
cross-album check produces **albums that are individually compliant and collectively indistinguishable**.
Every gate in §5–§9 is *per song*. None of them looks sideways.

### 18.2 The defect taxonomy (what actually goes wrong)

| Defect | Signature | Worst observed |
|---|---|---|
| **Clone clusters** | Albums sharing song titles and phrasing wholesale | 8 Amir albums; two shared 9 of 12 titles and 94.9% of phrasing |
| **Template choruses** | One chorus scaffold reused across all 12 tracks | Amir *Refuge in God* — all 12 opened "Jesus, You…"; Tahoma *He Walked Among Us* — all 12 choruses on the same two lines |
| **Recycled staging** | Identical intro/outro/production-cue text pasted across albums | "solo oud in Hijaz maqam" opened songs on **30** Amir albums |
| **Recycled hook stock** | Scripture or worship phrases carrying the hook on many albums | "thank you Jesus, thank you" on 11 Tahoma albums |
| **Fourth-wall finales** | Track 12 narrating the album | **38 of 89** Melody albums; 370 sung lines |
| **Lane collisions** | Two albums writing the same subject | Three separate Tahoma albums titled some form of *Living Water* |
| **Title drift** | Album not about its own title | Melody *Tomorrow Counts* argued for living **today** |
| **Internal duplication** | The same couplet across two tracks of one album | Amir *He Loved Me First* T1/T2; Tahoma *Mercy Like the Tide* at 5.9% |
| **Voice drift** | Album written outside the persona's range/tempo | Melody *Luminous* built as arena EDM for a **soprano** |
| **Prose contamination** | Production docs living inside lyrics files | 77 Melody front-matter + 62 trailing blocks ≈ 283,000 characters |

### 18.3 Objective measurement (do not rely on ear)

Build a phrase-level analyzer before writing anything. Metrics that proved diagnostic:

| Metric | Definition | Healthy | Alarming |
|---|---|---|---|
| **crossAlbumDup** | % of an album's distinct sung 5-grams that also appear in another album | < 3% | > 8% |
| **internalDup** | % of 5-grams appearing in ≥ 2 songs of the *same* album | < 0.5% | > 3% |
| **hookOverlap** | % of chorus 3-grams shared with another album | context-dependent | see caveat |
| **vocabRichness** | distinct content words ÷ total content words | > 30% | < 22% |
| **dupTitles** | song titles used by more than one album | 0 | any |

**Measured outcomes (before → after):**

| Shelf | Albums | crossAlbumDup | vocabRichness | dupTitles | Freshness score |
|---|---:|---|---|---|---|
| Amir | 68 | 15.4% → **0.8%** | 29.9% → 38.1% | — | 55.5 → 95.5 |
| Melody | 89 | 2.8% → **2.3%** | 21.6% → 25.4% | 17 → **0** | 67.3 → 95.7 |
| Tahoma | 60 | 4.6% → **2.2%** | 24.3% → **32.2%** | 6 → **0** | 50.6 → 95.7 |

> **⚠ Metric caveat — hookOverlap is a trap.** On Melody it *rose* (15.3% → 19.2%) while quality
> improved. Cause: the refresh moved her off stylised chant hooks ("BOOTH! BOOTH!", "Hey, hey — X!")
> toward plain conversational lines, and plain English shares far more three-word runs than chanting
> does. What was overlapping afterwards was "the whole thing", "in the morning", "and I'm not". **Always
> inspect the actual shared n-grams before treating a metric move as a regression.** The honest test is
> whether the *specific recycled chants* are gone — on Melody, "say their names" (9 albums), "take the
> credit and run" (6), "I'm not the source" (6) and the default `oh oh oh oh oh` filler (10) all went to
> zero.

### 18.4 The Freshness Law (add to any refresh or bulk-authoring brief)

0. **RULE ZERO — the folder name is not the album.** Take the subject from the **live catalogue title**
   (`catalog-manifest.json`), never from the folder slug or the on-disk metadata, both of which drift.
   Verify the two agree; where they don't, the live title wins and the metadata is reconciled to it.
1. **Each album owns one subject, and no other album may touch it.** Twelve songs = twelve distinct
   facets. *"If your album could swap tracklists with another and nobody would notice, you have failed."*
2. **One unique chorus hook per song**, built from that album's own concept-words — never generic
   worship stock. No hook may duplicate another song on the shelf.
3. **Banned-phrase list.** Generate the top ~150–200 most-recycled 5-grams from the analyzer and ban
   them outright — including staging and production-cue text, which is where the worst copying hides.
4. **Concrete over generic.** Every verse needs at least one physical image no other song on the shelf
   uses. Vary the sensory palette *within* the album too.
5. **Vary structures** — ≥ 2 songs per album break the default verse/chorus form.
6. **Bespoke staging** — production cues written per song, never pasted.
7. **Scripture is not banned; leaning on it as your hook is.** Biblical language may appear in a verse.
   It may not be the chorus phrase that defines more than one album.

### 18.5 Lane assignment — the operational key

The single highest-leverage move is **assigning colliding albums to the same worker with explicit,
mutually exclusive lanes**. One mind holding all three separates them; three minds working blind
converge.

Worked examples that produced clean separation:
- Three *Living Water* albums → **the well and the thirst** (John 4) · **the water flowing outward**
  (John 7:38) · **the island watershed**
- Two healing albums → **the instant of the touch** · **the long tending afterwards**
- Two light albums → **light increasing** · **light winning**
- Two table albums → **fellowship among the family** · **the host's invitation to the outsider**
- Two breath albums → **the breath that creates** (Gen 2:7) · **the breath that fills** (Acts 2)

### 18.6 Scoring freshness

Score twice — **BEFORE** (as found) and **AFTER** — on six subscores, composite = mean:
`hook_distinctiveness` · `freshness_uniqueness` (against the rest of the shelf) · `internal_variety` ·
`imagery_specificity` · `emotional_arc` · `singability`.

**BEFORE must be honest.** Existing metadata scores measure *addictiveness*, not freshness, and are not
a baseline. A cloned album scores 25–45; a competent-but-stock album 65–85.
**AFTER target ≥ 95** — and it must reflect what was actually delivered.

> **This is a freshness rating, not a hype rating.** Do not raise intensity to chase a score. A quiet
> contemplative album can be completely unique. Melody's protocol caps her *addictiveness* at 95.5
> precisely to protect that lane; freshness is a separate axis and is not capped.

### 18.7 Persist the result

Write a dated block into `album.meta.json`:

```json
"refresh_2026_08_09": {
  "before_composite": 43.0,
  "after_composite": 95.5,
  "fourth_wall_lines_removed": 12,
  "song_titles_changed": ["03 Old Title → 03 New Title"],
  "attribution_note": "added"
}
```
plus an appended `rebuild_notes[]` entry. Never overwrite prior history — append.

---

## 19. Translation system

### 19.1 Language roster (40)

**Tier 1 — full engines (28 languages, 29 files):** Spanish ES · French FR · German DE · Italian IT ·
Brazilian Portuguese PT-BR · European Portuguese PT-PT · Dutch NL · Russian RU · Polish PL · Mandarin
ZH · Japanese JA · Korean KO · Arabic AR · Hindi HI · Thai TH · Turkish TR · Vietnamese VI · Tagalog TL ·
Hebrew HE · Swedish SV · Danish DA · Czech CS · Hungarian HU · Bulgarian BG · Croatian HR · Indonesian ID ·
**Romanian RO (the gold-standard exemplar)** · Ukrainian UK.

**Tier 2 — queued, checklist only (12):** Afrikaans AF · Bengali BN · Cantonese YUE · Finnish FI ·
Greek EL · Latin LA · Malay MS · Norwegian NO · Persian FA · Swahili SW · Tamil TA · Urdu UR.

**Naming:** `translate_<English name, capitalized, spaces → underscores>.md`.
**Romanian is the quality bar — but copying Romanian *specifics* into another language is a defect.**

### 19.2 Engine anatomy (sections 0, 0A, 1, 1A, 2–10 + Authority)

| § | Content |
|---|---|
| **0** | **THE GOLDEN RULE** — the two LAWS (below) |
| **0A** | **Banned error patterns** — 9 failure modes with *real language-specific offender words* + the DROP-THE-RHYME TEST |
| **1** | Audience & non-offense mandate; the **standard Bible to echo**; register; gender deference |
| **1A** | **Cultural resonance & taboo map** — worldview frame, taboo→safe substitutions, native ache word, worship temperature, required reverence/honorific forms, native poetic device |
| **2** | **Locked divine-names glossary** — one spelling per term; Son-of-God policy; foreign divine-name ban |
| **3** | Coined/brand words, proper nouns, loanwords |
| **4** | **Singability & prosody** — syllable matching, stress, open vowels, hook slot, rhyme stance, script mandate, euphony screen |
| **5** | Idioms, imagery, cultural fit |
| **6** | **What stays in English** + the Style-metadata rule |
| **7** | File, code and title conventions |
| **8** | QA checklist (~18 gates) |
| **9** | Worked example — real chorus + BAD vs GOOD pair |
| **10** | Addictiveness / re-listenability pass |

#### The two LAWS (verbatim in every engine)

Priority order: **1** faithful to meaning & gospel · **2** singable · **3** natural & culturally resonant ·
**4** same emotional payload & imagery · **5** rhyme & hook preserved.
*"When 2–5 conflict, meaning (1) wins, then singability (2). Break a rhyme before you break the meaning
or the meter."*

> **LAW #1 — MEANING-FIRST.** Every line must make complete, natural sense to a native **with the rhyme
> ignored.** "Rhyme is the lowest priority — a bonus, never a requirement." Never invent a word, bend
> grammar, or append a meaningless noun to hit a rhyme. **If no honest rhyme fits, DROP IT.**

> **LAW #2 — CONTEXTUALIZE, NEVER SYNCRETIZE.** Adapt form, imagery and emotional frame freely — "but
> never sand down the cross, repentance, judgment, sin, the blood, or Christ's exclusivity to be more
> relatable. **Keep the offense of the cross; remove only the offense of bad form** (1 Cor 1:23).
> Relatability that costs doctrine is a defect."

#### The DROP-THE-RHYME TEST (run on every line)

Read the line and silently delete its final rhyming word. Does the rest still say something true and
clear? Is the final word one you'd actually use in that sentence? **If no — the line is forced.**

### 19.3 Singability

- **Match syllable count**; compress with the language's own native elisions, never filler.
- **Hook + chorus syllables vs EN: ±1. The hook must be EXACT.**
- Respect the language's stress rule; stressed syllables on strong beats; read every line aloud in rhythm.
- **Open vowels on sustained/belted notes.**
- **Keep the hook's rhythmic slot** (0:00–0:08 where specified).
- **Rhyme is optional and last.** Prefer recasting the *other* line of a couplet.
- **Diacritics/script mandatory** — Suno/TTS pronounce from text. (Arabic requires full *tashkīl*;
  Hebrew requires *niqqud*; Hindi requires full mātrā/nukta/anusvāra.)
- **Euphony / accidental-obscenity screen** — sing the line slurred, as an AI vocal would, and check
  that blurred syllables don't form a vulgar, comic or sacred-taboo word.
- **Fix narrator gender FIRST** in every inflecting language (Slavic, Romance, Semitic, Hindi).

### 19.4 What never gets translated

1. **Suno section tags and production cues in `[brackets]`** — "Never sung — leave exactly as the EN source."
2. **The `Styles:` block stays in English** — it is production direction, not sung. It *is* updated in
   English: add "`<Language>`-language vocal" near the front, keep BPM/key/instruments/mood, fold in
   culturally resonant instrumentation. *"Suno has no language dropdown — language comes from the
   lyrics plus the English Style block."*
3. **The coined brand hook** — "Jubilujah"/"Jubiluyah" stays **verbatim**, including the chant
   *"Ju-bi-loo-yah"* and the Latin spelling-chant **J-U-B-I-L-U-J-A-H**. Non-Latin scripts transliterate
   only the *sung* form (AR جُوبِيلُويَا · HE גֻ'בִּילוּיָה · HI जुबिलूय्याह) and still keep the Latin spelling-chant.
4. **The persona/artist brand name** — English in every filename.
5. **Metadata footers** — structure preserved; only title text localises.
6. **Global/heaven imagery** — every-tribe, throne, Lamb, wedding feast stay. Only culture-bound
   daily-life anchors localise.

### 19.5 Sacred names by language family (excerpt)

| Family | God | Jesus | Son of God |
|---|---|---|---|
| Spanish | `Dios` | `Jesús` | `el Hijo de Dios` — never "el enviado de Dios" as a replacement. Address God as **`Tú`**, never *usted* |
| Arabic | `الرَّبّ` / `الآب` / `الإله` | **`يَسُوع`, NOT `عيسى`** | `ابْنُ الآبِ` |
| Hebrew | `אֱלוֹהִים` / `הָאָדוֹן` | **`יֵשׁוּעַ`, NEVER `ישו`** (widely read as pejorative) | `בֶּן־הָאֱלוֹהִים` |
| Hindi | **`परमेश्वर`** (avoid `ईश्वर`/`भगवान`) | `यीशु मसीह` | `परमेश्वर का पुत्र` — `मोक्ष` must NOT render salvation → `उद्धार / मुक्ति` |
| Indonesian | `Tuhan` / `Bapa` | `Yesus` | `Anak Bapa` / `Anak Tunggal` |
| Turkish | `Tanrı` | `İsa Mesih` | `Tanrı'nın Oğlu` |

**Universal:** one locked spelling per term, consistent across the whole album. **"Never import a divine
name from another religion to fill a slot."** Never soften or remove divine sonship to reduce offence.

**Hebrew Tetragrammaton:** do **not** vocalise יהוה in a sung pop lyric — use `אֲדוֹנָי / הָאָדוֹן / אֱלוֹהִים`.
*(Note the tension with OHI English albums, which mandate "Yahuah". The suppression applies to the
Hebrew localisation specifically.)* Hebrew engines additionally forbid supersessionism and handle the
cross symbol with care.

### 19.6 Translated-edition conventions

- **Album code:** swap the suffix — `JEIM1069EN` → `JEIM1069ES`. Everything else in the code stays.
- **Folder:** mirror the EN folder with the new code; **non-Latin scripts use a transliterated Latin
  slug** for filesystem safety.
- **Lyrics filename:** `<Persona> Inspire-<Localized Album Title>-lyrics.md` — persona brand stays English.
- **Song titles → target language**, keeping the 2-digit prefix in both header and footer.
- **Album title → native language** unless it *is* the coined brand hook. ≤30 chars, unique.
- **UTF-8 mandatory.** Track parity and section parity with the EN source are hard requirements.
- **Changelog must state:** the source EN code · the divine-name convention · the coined-hook policy ·
  the locked Son-of-God rendering · the worldview frame · narrator gender (inflecting languages) ·
  for AR/ID, the explicit "bare token never used, per SOP #18" statement.

### 19.7 Orchestration (TRANSLATE_CATALOG_SOP)

**Phase 0** inventory & ledger (exclude any EN album that is itself incomplete — "it is not eligible as
a translation source until fixed") → **Phase 1** suitability scoring, weighted with **cultural/worldview
resonance highest** → **Phase 1D** redundancy re-check against the live catalogue → **Phase 2** translate
with the engine as the controlling instruction set → **Phase 3** QA (3A engine checklist · 3B structural
parity · 3C approvals) → **Phase 4** loop.

**Hard rules:** never alter EN source files · one album / one artist / one language per unit · the §0
laws outrank everything · **"A translation that fails QA is not shipped"** · **"Do not partial-ship."**

**Release blockers (3C):** (1) **native faith-insider sign-off** for the language/tradition;
(2) **Founder approval**. Until both are recorded the album is "QA passed — awaiting approval", not released.

**Ledger status enum:** `not_started / selected / translated / qa_passed / approved / released /
skipped_exists / pool_exhausted`.

> **⚠ Standing hazard.** Translations are made from a *snapshot* of the English. Any English rewrite
> silently invalidates every translation of that album. After the August 2026 refreshes, 12 Amir + 3
> Melody + 3 Tahoma editions became stale in exactly this way. **Re-translate from the new English
> before rendering any translated audio.**

---

## 20. Secondary scoring systems

Two further rubric families coexist with the SOP rating stack. They are not reconciled anywhere; a
rebuild should decide which governs.

### 20.1 The V3 Amplification Rubric (post-production, per-album)

Six dimensions, 0–100 integers per track; album composite = mean of the six across all 12 tracks, one decimal.

1. **Hook Strength** — fires at 0:08–0:14; repetition density 4–5×/chorus, ≤8 syllables.
   *95+ chant-locked · 90–94 sing-along after one listen · 85–89 takes 2–3 listens · <85 doesn't grip.*
2. **Groove** — BPM in the target window; body responds before the mind decides.
3. **Replay Value** — 2–3 small sonic surprises per track **with explicit timestamps**.
4. **Dynamic Payoff** — per-track tension map: strip-back → swell → release; **T8 cinematic peak** with
   strip-and-bloom + key lift.
5. **Emotional Pull** — core feeling per track; **T7 testimony anchor** with named pastoral composite
   hits 96–97.
6. **Loop-ability** — outros pull into the next track; **T12's closing 30 s loops back to T1**.

**Bands:** ≥95.0 excellent (no rewrite) · 92.0–94.9 strong/intentional · **<92.0 deficient → flag for rewrite.**

Persisted as an `amplification_v3` block (`applied_at`, `scored_by`, `composite`, `dimensions`,
`tracks[12]`). Nova's variant writes the same six dimensions **twice** — top-level
`addictiveness_composite`/`addictiveness_dimensions` plus the nested block.

> **Calibration, not maximisation.** Nova's contemplative lane targets 92.0–93.5 and is explicitly
> capped: *"Do NOT push above 95.0 on existing 30 — would over-inflate the contemplative-restraint
> lane."* Melody is capped at 95.5. **Composites are lane-calibrated.**

### 20.2 The pitch-doc marketing stack (concept phase)

| Score | Components (weights) | Floor |
|---|---|---:|
| **Radio Hit Rating** | 8-second ignition 20 · chorus memorability 20 · bridge design 15 · radio format fit 15 · production signature 10 · lyrical hook 10 · emotional delivery 10 | — |
| **Viral Ready** | 0–8s hook power 25 · lift-out moment 25 · loop potential 15 · quotable phrase 15 · emotional immediacy 10 · cross-platform portability 10 | **90%** |
| **Lyrical Quality** | no forced rhyme 20 · comprehensibility 15 · relatability 15 · emotionally compelling 15 · faith-audience coherence 10 · image density 10 · originality 10 · prosody 5 | **90%** |
| **Bestseller Album** | hit-single density 20 · album viral readiness 20 · album lyrical quality 15 · catalog coherence 15 · cultural resonance 10 · award category fit 10 · producer archetype 5 · worship-night banger 5 | **85%** |

Below floor → **rejected and redesigned.**

**Key sub-standards:** *No Forced Rhyme Rule* — "Rhyme serves meaning, never the other way around."
Test: *"Would this lyric exist if there were no rhyme requirement?"* · **Image density: minimum 2
concrete sense-based images per verse** · **≤15-word quotable phrase per song** · **15–30 second
lift-out moment per song** · **hook architecture in 0–8 seconds** · emotional response in 2–8 seconds.

**The locked 12-track sequencing architecture** (concept phase): 1 Gateway · 2 Lead Single #1 ·
3 Lead Single #2 · 4 Thesis Expansion · 5 Tender Middle I · 6 Tender Middle II ("cry track") ·
7 Pivot/Turn · **8 Worship-Night Banger** · 9 Lead Single #3 · 10 Prophetic Declaration/Testimony ·
11 Reflection/Reset · 12 Send/Benediction. Plus: **signature motif in ≥7 of 12 tracks**, **2–3
designated hit singles per album**, dominant Five-Fold office drives **≥6 of 10 albums**.

---

## 21. Multi-agent production method

At catalogue scale, albums are produced and refreshed by fan-out. What worked:

**Grouping.** Three albums per worker. **Put colliding albums in the same group** — one mind separates
lanes; independent minds converge (§18.5).

**Brief structure that produced clean results:**
1. Read-first list (governing spec, protocol, this brief, the current files) — in that order
2. Hard rules (title lock, format, banned tokens) — with the *reason*, not just the rule
3. The defect list with counts, so the worker knows what it is hunting
4. Its own exclusive lane, plus explicit statements of what neighbouring albums own
5. The freshness law
6. Scoring instructions with an honesty clause about BEFORE scores
7. File-update instructions (what to touch, what never to touch)
8. A mandatory self-check list
9. A compact JSON return contract

**Return contract (adapt per task):**

```json
{"albums":[{"code":"XXIM10NNEN","album_title":"...",
"before":{"composite":N,"subs":{...}},"after":{"composite":N,"subs":{...}},
"song_titles_changed":N,"titles_changed_list":["03 Old → 03 New"],
"hooks":["T1 hook", "... all 12"],
"notes":"one line: what was wrong + what you did"}]}
```

**Require the 12-hook list** — it feeds the cross-agent duplicate check and is the cheapest way to catch
convergence between workers running concurrently.

**Operational lessons:**
- Workers must check titles against **both** the frozen backup **and** the live tree — concurrent
  workers publish mid-run, and two collisions were caught only because a worker re-checked live.
- Session limits and connection errors will interrupt a fleet. **Writes are atomic** (whole-file), so
  interruption does not corrupt — but always verify integrity before resuming, and tell the resumed
  worker what state you found on disk.
- Instruct workers to **surface** anomalies rather than fix them silently. Several genuine defects
  (mis-titled metadata, stale audio, broken Spanglish, a persona written in the wrong vocal range)
  were found only because workers reported what they saw.

---

## 22. Verification tooling

Build these before any bulk operation. All were written and used in the August 2026 sweeps.

| Tool | What it does |
|---|---|
| **Repetition analyzer** | Parses every album's song blocks; computes crossAlbumDup / internalDup / hookOverlap / vocabRichness; emits the top-N recycled 5-grams as a ban list and all duplicate song titles. Persona-agnostic via a code-prefix argument. |
| **Fourth-wall scanner** | Scans **sung lines only** — skipping bracket tags, production cues and the Styles trailer — for the §9 ban list. *Critical:* a whole-file grep produces mostly false positives from legitimate production cues. |
| **Format auditor** | Per album: 12 `SONG TITLE:` / 12 `Song Title:` / 12 `Styles:` / 12 `VOCAL GENDER:`, every Styles ≤800 chars, no markdown headings, no code fences, exactly one lyrics file. |
| **Banned-token sweeper** | Persona-specific token list with word boundaries. **Read every hit in context** — on Tahoma, almost every RED-tier hit was the safeguard apparatus itself (attribution notes and disclaimers stating what is *not* done). |
| **Title auditor** | Compares on-disk `album_title` against the **live** `catalog-manifest.json` and against the pre-work backup — proving no public title changed. |
| **Metadata reconciler** | Aligns `album_title` to live and updates `track_title`/`track_slug` **in place** (never replacing rich track objects). Always dry-run first. |
| **Prose migrator** | Moves front-matter and trailing production docs out of lyrics files into `album.meta.json.production_notes`. |

**Non-negotiable habits:**
- **Back up first**, to a dated path, before any bulk edit.
- **Dry-run every mutating script** and read the output before applying.
- **PowerShell `-replace` is case-insensitive by default.** This clobbered a footer during the Melody
  sweep (a header pattern matched the footer too). Use `-creplace` or .NET regex with explicit options.
- **Read the manifest as UTF-8 explicitly.** A naive read mangled Hawaiian diacritics (`ʻOhana` →
  `Ê»Ohana`); had that been used as a title lock, workers would have "corrected" correct text into mojibake.
- **Verify a claim before acting on it.** Two albums flagged as missing cultural attribution turned out
  to match on the phrase "ukulele-**free**".

---

## 23. Known contradictions, drift and gaps

Do not resolve these silently — each is a real decision a rebuild must make.

1. **The Master Prompt does not exist.** SOP §1 and the pitch doc cite "Music Generation Master Prompt
   (v5.1, 34 non-negotiable rules)". No such file is in the repo. Reconstruct or retire.
2. **Two competing lyrics-file formats are both live** — SOP §14 one-file-per-song (used in
   `public/music/albums/…`) and the Caleb one-file-per-album format (used across the ~937 albums on `J:`).
   **Declare one canonical for new work.**
3. **Artist names in `Styles:`** — the Lyrics Engine instructs "mood/emotional payload + **reference
   artists**", while every persona build protocol **bans** artist names. The protocols are later and
   are what the catalogue follows.
4. **Fenced code blocks** — the Lyrics Engine wraps the Suno block in a fence; the Caleb format forbids
   fences entirely.
5. **Track-number prefix — the sharpest live contradiction.** Four documents make the 2-digit `NN`
   prefix **mandatory** on both `SONG TITLE:` and its `Song Title:` footer (Amir base, Amir-Bollywood,
   Tahoma base, Tahoma-Hawaiian). Two are simply **silent** and still template `SONG TITLE: {Title}`
   (Zev, Nova build). Two **actively strip it**: Nova's reformat protocol removes *"song-level '01 '
   numeric prefixes from `SONG TITLE:` lines (just title, no number)"*, and Santiago's reformat step
   says *"Strip '01 — ' numeric prefix from any titles."* **The mandatory rule is later and standing
   (§16.7); the two reformat protocols must be amended before they are run again**, or they will
   silently undo the standard on every album they touch.
6. **"Isa" for Jesus** — Amir's older build protocol permits it in Arabic-leaning English lines; the
   Arabic translation engine forbids `عيسى` outright; the current Arab-culture spec bans it. Treat the
   Arab-culture spec as governing for Amir originals.
7. **OHI expansion** — SOP says "Overtly Hebrew Inspired"; the pitch doc says "Original Hebrew Intent".
8. **Blueprint Engine version mismatch** — header says "Aligned with SOP v2.0"; its Critical
   Instructions block says "(Updated 2026-04-20 — SOP v2.1)".
9. **`Style` vs `Styles:`** — the key is inconsistent across documents; engines hedge with "`Style` / `Styles:`".
10. **Tahoma folder names are stale and dangerous** (§17.4). Either rename or carry Rule Zero forever.
11. **The translation ledger file does not exist** at its documented path; ledger state currently lives
    scattered across per-language checklists.
12. **PT-BR / PT-PT code suffixes contain a hyphen**, unlike every other 2-letter suffix. The SOP hedges
    rather than deciding.
13. **`radiant-stones` (JMZM) and `kingdom-pulse` (CASM)** — 82 albums between them, with no persona
    voice-calibration entry anywhere.
14. **Model pin** — engines pin "Opus 4.7". Update to the current top-tier model; preserve the *intent*.
15. **A "Sonic-Craft v4 / Enhanced v4" scoring layer** appears in published artifacts
    (`Addictiveness (Enhanced v4): 98% (Hook 99 / Groove 99 / …)`) but is defined in no prompt file.
16. **Song-length law is contradicted three ways.** SOP §7 mandates 3:30–4:00. Caleb's and Zev's
    `lyrical-quality-standards.md` mandate **3:00–3:30** with an explicit rejection trigger for anything
    "over 3:30". Nova permits ambient cuts at **5:00–7:00**. Three live laws.
17. **Faith-Focus floors are contradicted per persona.** Nova's synthwave protocol says "OHI floor 90"
    although Nova is Default-mode at **80%**; Tahoma's protocol sets **80** against the SOP's **70**;
    Amir's original protocol says **90** against the SOP's **70**.
18. **`persona_role` in `artist.meta.json` is stale for four personas** — Melody reads "Children's Faith
    Music" (should be mainstream pop / pre-evangelistic) · Elias reads "Cinematic Worship" (should be
    Country/Western) · Tahoma reads "Contemporary Worship" (should be Indigenous) · Zariah reads "Youth
    Contemporary Worship" (should be Caribbean/Afro-Caribbean). **These fields feed downstream systems.**
19. **Tahoma's legacy blueprint prompt describes a FEMALE alto-mezzo Tahoma** — directly contradicted by
    the current protocol's **male baritone-tenor**. Anyone reading
    `.prompts/music_tahoma_inspire - blueprints.md` will get the wrong gender.
20. **Amir's build matrices still assign the banned styles.** `amir-build-protocol.md` rows AMIM1030,
    1032, 1035, 1045 and `amir-bollywood-build-spec.md` row AMIM1051 still list **qawwali, Sufi-broad,
    naat and nasheed** as secondary styles — exactly the devotional forms the 2026-06-20 Arab-culture
    spec and the red-flags audit retire. **The matrices need re-cutting** (§17.5.6).
21. **Tahoma's THIM1021–1040 matrix is a live RED-tier document.** Nine of its twenty rows commission
    powwow songs, ceremonial Big Drum, Northern traditional, round dance, stomp dance, Navajo ceremonial
    style or sacred *mele oli* — the exact repertoire the Tahoma Style Guidelines forbid. The June 2026
    compliance pass rewrote the albums but **never re-cut the matrix**, so it still reads as a
    commission. Its parenthetical-gloss titles ("Wai Ola (Living Water)") also violate the title
    standard. Mark it historical or rewrite it; do not leave it commissionable.
22. **Three co-existing scoring schemas** — nested `amplification_v3` (Amir ×2, Zev, Santiago, Nova) ·
    flat `addictiveness_composite` + `addictiveness_dimensions` + `sonic_craft_version` (Santiago, which
    carries *both*) · `sonic_craft_v3` (Tahoma-Hawaiian) · and a fourth bespoke output shape in the
    Tahoma base protocol (`composite_score` + `dimensions{}` + `catalog_loop_seed` + `single_candidates[]`).
23. **`viral_traits_engineered` is not universal.** Amir ×2, Zev, Nova and Tahoma-Hawaiian record it;
    **Santiago and the Tahoma base protocol omit the field entirely** even though both publish the
    ten characteristics in prose. A rebuild should make the field mandatory catalogue-wide.
24. **`style_fusion` has two shapes** — `{base, secondary}` everywhere except Nova, which uses
    `{base, sub_style}` because its batch is single-lane. Decide whether sub-style is a third key or a
    permitted value of `secondary`.
25. **Six personas have no build protocol at all** — Jubilee, Melody (build), Elias, Eliana, Imani,
    Kingdom Pulse. **Imani is a 90%-floor persona with only inferred DNA.** **Eliana has no documented
    vocal range anywhere in the tree.**
26. **The "Celebration Arc" template is referenced but never defined.** Multiple protocols instruct a
    "celebration override on T8–T12" or a "tone-arc pivot to celebration finale" without publishing the
    template those instructions point at. §7.1 here is the closest thing to it; formalise it.
27. **Anchor titles in the build matrices are routinely mistaken for locked titles.** They are
    proposals, explicitly superseded by `catalog-manifest.json`. Two 2026-08 refresh workers "restored"
    matrix anchors over live titles and had to be reverted. **Any brief that ships a matrix must ship
    Rule Zero with it** (§18.5).
28. **Nova's `[Drop]` tag is whitelisted in one protocol only.** Either promote it to the catalogue-wide
    whitelist (§16.5) or document it as a lane-scoped exception.

---

## 24. Rebuild checklist

To stand this capability up from nothing:

**Foundation**
- [ ] Recreate the SOP (§2–§12 of this file *are* the SOP in operative form)
- [ ] Decide the canonical lyrics-file format (§23.2) and write one gold-standard exemplar (§16.3.1)
- [ ] Define `album.meta.json` schema including the rich `tracks[]` object (§16.8)
- [ ] Establish `catalog-manifest.json` as the title authority and wire title-uniqueness verification

**Engines**
- [ ] Blueprint Engine with Sections A–J, the 7 inputs, Genre Fusion Laboratory (§13)
- [ ] Cross-Tradition Sensitivity Vetting — 14 categories, 5 passes, flag arithmetic (§14)
- [ ] Lyrics Engine with the 5-check gate, 16-step workflow, craft gates (§15)

**Guardrails**
- [ ] Fourth-wall ban list + replacement vocabulary + enforcement scan (§9)
- [ ] Divine-name discipline + grep gate (§10)
- [ ] Vertical address standard + collapse test (§8)
- [ ] Vocal-gender narrator-fit rule (§12)
- [ ] Per-persona cultural specs, especially Tahoma's tier system with the attribution note (§17.4)

**Personas**
- [ ] 13 voice-calibration entries + faith floors + twin pairs (§17.1)
- [ ] Technical DNA per persona — vocal type and range, BPM pocket, primary × secondary lane (§17.1a)
- [ ] Per-persona build protocol with DNA, aesthetic, BPM pocket, structural signature, lane ceiling
- [ ] Resolve `radiant-stones` and `kingdom-pulse`
- [ ] Correct the four stale `persona_role` fields before anything downstream consumes them (§23.18)

**Genre and style**
- [ ] The two-style fusion doctrine + ten creative quality filters + micro-marker requirement (§17.5.1)
- [ ] Choose a secondary-style mechanism per batch: build matrix · Rule of Distinctness · fusion
      clusters (§17.5.2) — and if a matrix, ship Rule Zero with it (§23.27)
- [ ] Eight-archetype within-album rotation with per-slot BPM bands, plus the pre-chorus/bridge/outro
      rotations and the "none repeated more than 2× per album" rule (§17.5.3–4). **Design this in from
      the start — it is the built-in cure for §18, and retrofitting it costs a full catalogue rewrite.**
- [ ] The eight-category album-title taxonomy as a coverage check across a batch (§17.5.5)
- [ ] Intra-album T12→T1 seam on every album; batch wrap-around seam where a ring is intended (§17.5.7)
- [ ] The ten viral characteristics with their numeric requirements, and `viral_traits_engineered`
      made mandatory catalogue-wide (§17.5.8, §23.23)

**Scale disciplines**
- [ ] Repetition analyzer + fourth-wall scanner + format auditor + title auditor (§22)
- [ ] The Freshness Law in every bulk brief, with Rule Zero first (§18.4)
- [ ] Lane-assignment discipline for colliding albums (§18.5)
- [ ] Backup-first, dry-run-first, verify-claims-first habits (§22)

**Translation**
- [ ] 28 engines to the section spine, Romanian as exemplar (§19.2)
- [ ] Orchestration SOP with the ledger and the two release-blocking approvals (§19.7)
- [ ] Staleness policy: any English rewrite invalidates its translations (§19.7)

**Approval**
- [ ] A human approval gate at blueprint stage, at album completion, and at translation release.
      Without it, three documented branches (Progressive Hybrid, non-Melody secular_universal, and any
      SOP deviation) are unreachable.

---

## 25. The point of all of it

> "The 3:30–4:00 duration standard, the five-metric rating stack, the bridge protocol, and every other
> requirement in this document are not creative limitations. They are the riverbanks that let the river
> run with power, the discipline that lets the anointing travel further than untrained longing ever
> could. Tight songs cross cultural borders. Engineered bridges deliver people. Prophetic declaration
> puts listeners' mouths on heavenly reality. Testimony carries weight the Ruach rides on."
> — Music SOP v2.0, Part 7

And one thing the SOP does not say, learned the hard way across 217 albums this August: **compliance is
not quality.** Every one of those albums passed its gates and still, collectively, sounded like one long
album. The gates are per song. Somebody has to look sideways.

---

*Sources — all read in full, not summarised second-hand:*
`W:\JubiLujah.com\.prompts\music_albums (Part 1) - blueprints.md` ·
`(Part 2) - content.md` · `(Part 3) - Music SOP v2.md` · `pitch - music ablums.md` ·
`TRANSLATE_CATALOG_SOP.md` · `BUILD_TRANSLATION_PROMPTS.md` · 28 `translate_<LANGUAGE>.md` engines ·
`music_tahoma_inspire - blueprints.md` (legacy) ·
`J:\jubilujah.com\music\inspire\*\_protocol\` — `amir-build-protocol.md`,
`amir-bollywood-build-spec.md`, `amir-arab-culture-worship-spec.md`, `zev-build-protocol.md`,
`santiago-build-protocol.md`, `tahoma-build-protocol.md`, `tahoma-hawaiian-build-spec.md`,
`nova-synthwave-build-protocol.md`, `nova-existing-reformat-score-protocol.md`,
`melody-amplification-protocol.md` · `Tahoma_Music_Style_Guidelines.md` ·
`_catalog` lyrical-quality-standards and archetype-rotation files ·
`J:\music\catalog-manifest.json` and per-album `album.meta.json` across the live catalogue ·
and the Amir / Melody / Tahoma freshness sweeps of 8–9 August 2026, whose measurements and failures
are recorded in §18 and §23.
