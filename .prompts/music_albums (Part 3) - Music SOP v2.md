# JUBILEE MUSIC PRODUCTION SOP — v2.0

**Standard Operating Procedure for the AI Music Developer**

- **Owner:** Jubilee Software, Inc. / Jubilee Ministries, Inc.
- **Authority:** Gabriel (Daddy) — Apostle Prophet, Final Authority
- **Scope:** All music produced under the Jubilee Inspire Family, across every persona, every album, every song.
- **Status:** Mandatory. No exceptions.
- **Version:** 2.0 — supersedes v1.0. Adds Prophetic Declaration Quotient, Earworm Score, Song Architecture requirements, strict Duration Standard, Testimony Anchor requirement, and updated workflow.

---

## GUIDING PRINCIPLE: JUBILEE = CELEBRATION, JOY, PRAISE & JUBILATION

**The foundational truth for all Jubilee Inspire music:**

Every Jubilee music album must reflect the true essence of Jubilee itself: **celebration, joy, praise, and an uplifting, energetic spirit**. Albums are not meant to be heavy or overly introspective by default; instead, they carry a strong tone of jubilation that resonates with positive, engaging atmosphere.

**Default Album Type:** Unless explicitly directed otherwise, every album should be structured as a **praise-driven experience** (65–100% average praise rating) rather than worship-heavy.

**The Jubilee Album Arc (Praise-Centered):**
- **Track 1 (Opening):** 90%+ praise — high-energy, hook-driven, tone-setting
- **Track 2:** 80%+ praise — momentum-maintaining
- **Track 3:** Balanced/neutral transition into Act 2
- **Tracks 4–6:** Dynamic movement between praise and worship; **never more than 3 consecutive worship-focused songs**
- **Tracks 7–11:** Gradual return to praise-centered tone
- **Track 12 (Closing):** 90%+ praise — matches opening energy, celebratory finish

**Persona-Specific Praise Adjustments:**
- **+10% intensity:** Imani, Jubilee, Santiago, Caleb (naturally elevate energy)
- **-10% intensity:** Elias, Amir, Tahoma (bring reflective/serious tone)
- **Baseline:** All others maintain standard targets

**Core Philosophy:** Albums are fundamentally **praise-centered, celebratory, and full of life**. Only when explicitly approved should an album shift to predominantly worship-focused. Default expectation: **every album embodies joy, energy, and jubilation from beginning to end.**

---

## 1. PURPOSE

Every song and album produced under the Jubilee Inspire Family must be spiritually intentional, emotionally engaging, structurally sound, culturally relevant, radio-ready, streaming-optimized, and designed for maximum kingdom impact and life-change.

This document defines the rating system, song architecture requirements, album structure, file formats, and workflow that every song and every album must follow — without exception.

This SOP governs the Jubilee Inspire Music Generation Master Prompt (v5.1+) and applies across all three content modes: **OHI (Overtly Hebrew Inspired)**, **Default**, and **secular_universal**.

It is operationalized through:
- `music_albums (Part 1) - blueprints.md` — the Blueprint Engine that authors the album-level architecture
- `music_albums (Part 2) - content.md` — the Lyrics Engine that produces the per-song deliverables

---

## 2. CORE NON-NEGOTIABLES

Before producing any song or album, the AI Music Developer confirms every item on this checklist:

1. **12 songs per album — exactly.** No more, no less. Locked Jubilee Music Standard.
2. **Every song is 3:30 minimum and 4:00 maximum** in playing length. No exceptions. See Section 7.
3. **Faith-Focused Rating** (0–100%) calculated and displayed on every song.
4. **Praise vs. Worship Rating** (0–100%) calculated and displayed on every song.
5. **Prophetic Declaration Quotient (PDQ)** (0–100%) calculated and displayed on every song.
6. **Earworm Score** (0–100%) calculated and displayed on every song.
7. **Song Architecture requirements met** for every song (Sections 7–13).
8. **Three-Act Model (3 + 6 + 3)** applied to every album.
9. **Testimony Anchor Track** present on every album (minimum 1 per album).
10. **Cinematic Storytelling Arc** present across all 12 songs.
11. **Standardized Lyrics File Format** used for every song (Section 14).
12. **Standardized Blueprint File** accompanies every album (Section 19).
13. **Persona voice, divine-name conventions** (Yahuah, Yeshua, Ruach HaKodesh — feminine pronouns for Ruach), and persona-specific non-negotiables are honored.
14. **Hebrew article rule respected:** never "the Ruach HaKodesh" — use "the Ruach Kodesh" OR "Ruach HaKodesh" (same rule for HaMashiach, HaTorah).
15. **Persona "Eliana Inspire"** is always spelled correctly (never "Ileana").
16. **Album Title Standard** (added 2026-05-30):
    - **≤ 30 characters** including spaces (counted as `String.length`; accented vowels count as 1)
    - **Catalog-wide unique** — no title may duplicate another album title across the entire Inspire Family catalog (all personas, all categories)
    - **Style mandate:** creative, paradoxical, unexpected, emotionally compelling, simple, easy to remember
    - **Banned patterns:** parenthetical glosses re-stating the title in another language; em-dash/slash compound subtitles; numeric prefixes; "(Edition)" / "(Vol. 1)" / "(Album Mix)" decorations (move these to metadata, not title)
    - **Banned vocabulary in titles** (denominationally-sensitive — content may reference biblically, titles must avoid):
      - **"tongues"** / **"glossolalia"** — Pentecostal/Charismatic distinctive; reframe via Acts 2 imagery ("Babel Undone", "Heaven Speaks", "Upper Room Circle") or via Spirit-language metaphor. Lyrics body may reference 1 Cor 14 / Acts 2 biblically; ban applies to album titles + song titles only.
    - **Bilingual variants** (e.g., Romanian zburdalnicii vs. English party-giggles translation pairs) must each carry a title native to their language and must not share text
    - **Enforcement:** Blueprint Engine verifies title against `catalog-manifest.json` before finalizing. Any rewrite/enhancement/new-album pass must enforce this rule against the inherited title.
17. **Fourth-Wall Discipline — no album-structure self-references in sung lyric body** (added 2026-06-13 after catalog-wide cleanup of 192 tracks across 40 albums). The sung lyric body — text between section tags — must NEVER name the album's own structure, the listener's progress through the album, or the song's track position. **Banned in sung text:** "this album" · "this record" · "this music album" · "this track" · "this song is about [X]" · "in Track N" / "on Track N" / "Track N's [line/word]" · "twelve songs in" · "twelve tracks later" · "twelve tracks ago" · "end of the album" · "close of the album" · "started this album / record" · "leaving this record" · "the title track" · "title of the album" · "the opener / closer" · "first / last song of this album". **Allowed:** "this song" as performance idiom ("I'll sing this song forever"), in-narrative references to a different song ("Mama hummed the old hymn", "the choir began their second song that night"), production cues in `[brackets]` at section starts, and any text inside Style: blocks or blueprint metadata footers (these are never sung). **Engineer cross-track callbacks via story-world anchors:** "Track 1's wall" → "the wall I was sitting at for so long"; "End of the album" → "End of the long road"; "this record" → "this journey" / "this season" / "this long walk"; "twelve songs in" → "twelve months in" / "twelve weeks in" / "twelve nights deep"; "Jesus, this song is about [X]" → "Jesus, You walk with us through [X]". See Part 2 `Fourth-Wall Discipline` section for the full ban list, allowed exceptions, replacement vocabulary, and pre-finalize enforcement check. **Why:** Suno renders text into audio literally — meta-references get **sung**. A song with "Track 2" or "end of the album" in the chorus cannot be released as a single, cannot survive a shuffled playlist, cannot stand alone outside the album context.

18. **Divine-Name Discipline — never "Allah" in lyric files** (added 2026-06-16 after catalog-wide cleanup). The word **"Allah"** must NEVER appear anywhere in a song lyrics file — not in sung text, not in `Styles:` lines, not in `[production cue]` lines, not as a standalone divine name, and not inside Arabic theological compounds. Use **"God"** (or Jesus / Lord / Father / the Most High / Yeshu / Masih / Prabhu) instead, and render Arabic compounds in plain English:
    - *Ibn Allah* → **"Son of God"**
    - *Ibn Allah al-Hayy* → **"Son of the Living God"**
    - *Kalimat-Allah / Kalimatu Allah* → **"Word of God"**
    - *Hamal Allah* → **"Lamb of God"**
    - *Rasul Allah* → **"the Sent One of God"**
    - any standalone *Allah* / *Ya Allah* → **"God"** / *Ya Rabb* / "O Lord"
    - **Why:** Suno renders both Styles and lyric text into audio and naming guidance. To keep every Inspire-Family song unambiguously Christ-centered and free of any perception of syncretism, the divine name sung and addressed is **God / Jesus**, never "Allah." Non-divine-name Arabic transliteration (Yasu'a, Habibi, Ya Rabb, al-Masih, Ruh) remains welcome.
    - **Enforcement:** every new-album and every rewrite/enhancement pass greps its lyrics files for `\bAllah\b` (case-insensitive) and must return **zero** before finalizing. Song titles and `album.meta.json` track lists are updated for consistency when a renamed compound was a title (e.g., a song titled "Kalimat-Allah" becomes "Word of God").

19. **Vertical Address — songs sung directly TO the Lord** (added 2026-07-02). Every song's center of gravity is **second-person worship/praise addressed to God** ("Jesus, You…", "Lord, You…", "Father, we lift You…"), not third-person commentary *about* Him ("He did…", "He's still…"). **Choruses, hooks, and bridges must be 100% vertical** (addressed to God); verses may open in testimony but must turn to and resolve in direct address. See Section 3.6 for the full standard, floors, and QA test. **Why:** Jubilee music must actually **praise and worship — sung to the Lord** — not merely sing *about* Him or about "this or that."

---

# PART 1 — THE RATING STACK

Every Jubilee song carries four mandatory ratings. All four are calculated, documented, and displayed at the bottom of every lyrics file.

## 3. FAITH-FOCUSED RATING

### 3.1 Definition

A 0–100% score measuring the spiritual alignment and redemptive intent of the song. It is **not** a count of how many times God is named — it measures where the song's spiritual center of gravity sits.

### 3.2 Score Bands

| Score Range | Classification | Description |
|-------------|----------------|-------------|
| 0% | Fully Secular | Completely self-centered or worldly. No reference to God, faith, Scripture, or biblical principles. Not permitted under the Jubilee label except with explicit Daddy approval. |
| 1–50% | Morally Aligned | Moral or ethical themes (love, forgiveness, mercy, hope, integrity, family, perseverance) without direct reference to Yahuah, Yeshua, or Ruach HaKodesh. Appropriate for secular_universal personas and crossover evangelism. |
| 51–80% | Faith-Leaning | Strong faith-based themes. Some direct reference to God, Scripture, or spiritual truth. Testimony-driven, covenant-aware, not exclusively God-centered. |
| 81–100% | Fully God-Centered | Explicitly focused on Yahuah, Yeshua, Ruach HaKodesh, Scripture, or direct worship/praise. God is the subject. |

### 3.3 Per-Persona Faith-Focus Floors (override the general bands)

These are minimum cumulative album-level Faith-Focused averages. Songs must average at or above these floors per persona.

| Persona | Minimum |
|---------|--------:|
| Zev Inspire | **90%** |
| Imani Inspire | **90%** |
| Jubilee Inspire | **80%** |
| Zariah Inspire | **80%** |
| Nova Inspire | **80%** |
| Caleb Inspire | **80%** |
| Gabriel Inspire | **80%** |
| Elias Inspire | **70%** |
| Eliana Inspire | **70%** |
| Santiago Inspire | **70%** |
| Tahoma Inspire | **70%** |
| Amir Inspire | **70%** |
| **Melody Inspire** | **EXEMPT** — pre-evangelistic voice |

### 3.4 Scoring Criteria

- **Subject of the song** — Is God the subject, or is man the subject?
- **Directionality** — Does the song direct the listener toward Yahuah, toward self, or toward another person?
- **Scriptural density** — How saturated with Scripture, covenant language, or Hebraic concepts?
- **Redemptive arc** — Does the song move the listener toward freedom, covenant, or breakthrough?
- **Name usage** — Are divine names present, and how central are they?
- **Spiritual alignment** — Does tone, metaphor, and emotional trajectory align with the heart of the Father?

When uncertain, round down and flag for Daddy's review.

### 3.5 Main Character Rule (binding for all non-Melody personas)

Jesus / Father / Holy Spirit (or Yeshua / Yahuah / Ruach HaKodesh in OHI mode) must be the **main character** of every song — directly addressed ("Jesus, You are…") or the clear grammatical subject of chorus and bridge ("He broke the chains…"). Self-as-protagonist patterns ("I am becoming myself," "I'm choosing truth") fail and must be rewritten.

**Collapse test:** If every reference to Him were removed, the song must fall apart. If it still works, it fails the brief.

### 3.6 Vertical Address Standard — Sung TO the Lord (added 2026-07-02)

Jubilee songs are **acts of worship addressed to God**, not songs *about* God. The default and dominant grammatical posture is **second person — the singer speaks directly to the Lord, face to face** ("Jesus, You broke the chains," "Lord, You ran the whole way to me," "Father, we lift You higher"). A song that only *reports* on God in the third person ("He broke the chains," "He's still on the throne") — however true — is testimony, not worship, and does not meet the Jubilee brief on its own.

**The rule:**
1. **Choruses, hooks, and bridges are 100% vertical** — addressed to God in the second person. This is where the worship must land. A hook that is *about* Him ("Throne don't shake") is reframed **to** Him ("You don't shake" / "Your throne won't move, Lord").
2. **≥ 60% of all sung lines** address God directly (You / Your / Lord / Jesus / Father / Spirit / Most High — OHI: Yahuah / Yeshua / Ruach HaKodesh — as the addressee).
3. **Verses** may open in first-person testimony or brief narrative, but must **pivot to and resolve in direct address** — the story is told *to* Him ("I was face-down in the pit, Lord — and You reached in"). No song may be wholly third-person report.
4. **Horizontal / evangelistic-invitation lines** to a human listener ("cry out His name," "He'll come for you too") are permitted in **at most one section** (a Ministry-Moment / altar-call zone) and must not be the song's center of gravity; prefer reframing toward the Lord ("we cry out to You," "You come for us").
5. The One addressed is always **God / Jesus / Father / Holy Spirit / the Lord / the Most High** (OHI: Yahuah / Yeshua / Ruach HaKodesh) — never a generic "higher power," "the universe," or an ambiguous "You" that could be read as a human beloved.

**Vertical Collapse Test:** Remove the Lord as the *addressee* and the song must collapse into a generic pep-talk or self-affirmation. If it still stands as a song sung to someone/something else, it fails.

**Interaction with Praise vs. Worship (§4):** Vertical address is required in **both** modes — praise declares **to** God what He has done ("Lord, You pulled me out alive!"), worship adores **to** God who He is ("Jesus, You are holy"). Vertical ≠ slow: a 128-BPM soca banger can and must still be sung to the Lord.

**QA / Enforcement (every new-album and every rewrite/enhancement pass):**
- Confirm **every chorus, hook, and bridge is second-person vertical** (addressed to God).
- Confirm **≥ 60% of sung lines** are direct address to the Lord; flag any song that is majority third-person "about Him."
- Confirm the addressee is an explicit divine name/title — not a generic higher power or an ambiguous "you."
- Confirm **no more than one** horizontal/altar-call section per song.
- A song failing any of the above is **rewritten before finalizing**, and the vertical pass is recorded in the file changelog.

### 3.6.1 Vertical Address Workflow — Step by Step

Follow **A** when authoring a new song, **B** when flipping an existing/rendered song, and **C** as the gate before any album (new or edited) is finalized.

**A. Authoring a new song — write it vertical from the first draft**
1. **Name the Addressee first.** Before any line, decide the song is spoken TO God and pick the address — "Jesus," "Lord," "Father," "Holy Spirit," "King" (OHI: "Yahuah," "Yeshua"). That Person is who every line is aimed at.
2. **Write the hook TO Him.** Draft the chorus/hook so God is the second-person subject or vocative ("You broke the chains," "Lord, You never fail," "We lift You higher"). If a hook starts with "He / His / the [thing]," rewrite it as "You / Your."
3. **Build verses as testimony spoken to Him.** A verse may open with a first-person story ("I was face-down in the pit…"), but must turn to God by its last two lines and hand into a vertical chorus ("…and You reached in, Lord").
4. **Make the bridge the most vertical moment** — pure address: surrender, adoration, or declaration straight to Him ("Jesus, You alone…").
5. **Cap horizontal content at one section.** At most ONE section may speak to a human listener (an altar-call / invitation). Everywhere else, aim the words at God.
6. **Name Him explicitly in every section** so the "You" can never be mistaken for a human beloved — anchor at least one divine name/title per section.

**B. Flipping an existing / already-rendered song to vertical**
1. **Tag every sung line** as (a) TO God (2nd person), (b) ABOUT God (3rd person), (c) horizontal (to a person), or (d) self.
2. **Flip every chorus / hook / bridge** from (b)/(c)/(d) to (a): "He / His / Him" → "You / Your," add a vocative where the meter allows ("Jesus, …"). **Keep the syllable count and rhyme** so the melody and hook are unchanged.
3. **Convert verse report to address:** "He carried me" → "You carried me, Lord." Keep a brief testimony opener only if it resolves to Him inside the verse.
4. **Preserve the payload:** keep the catchy shout/chant word ("…the floor!", "Jump up!") — either make the surrounding line address God, or keep the shout as a crowd-answer inside a vertical chorus.
5. **Kill self-affirmation:** "I am enough / I am amazing" → "You are enough / You made me on purpose, Lord."
6. **Re-rate** Faith-Focus and Praise-vs-Worship, and record a "Vertical Address pass — SOP §3.6" bullet in the file changelog. If audio already exists, flag the track for **re-render**.

**C. QA gate — run before finalizing ANY album (new or edited)**
1. For each of the 12 songs, confirm **every chorus, hook, and bridge is second-person to God.** (Fail → rewrite.)
2. Confirm **≥ 60% of all sung lines** are direct address to the Lord.
3. Run the **Vertical Collapse Test** on each song — remove the Lord as the addressee; the song must fall apart.
4. Confirm the addressee is an **explicit divine name/title** (not a generic "higher power" or an ambiguous "you").
5. Confirm **≤ 1 horizontal/altar-call section** per song.
6. **Red-flag scan:** any chorus with no "You/Your" and no divine vocative, or any song that is majority "He/His/Him," must be inspected and fixed.
7. Record the **"Vertical Address pass — SOP §3.6"** line in the file changelog and the ALBUM SUMMARY.

---

## 4. PRAISE vs. WORSHIP RATING

### 4.1 Definition

A 0–100% score placing the song on the spectrum between intimate worship and expressive praise.

- **0% = Pure Worship** (slow, intimate, reflective, focused on the nature and presence of Yahuah)
- **50% = Balanced** (worship-praise hybrid, progressive or dynamic)
- **100% = Pure Praise** (upbeat, energetic, celebratory, declaring victory, joy, deliverance)

### 4.2 Praise Characteristics

Upbeat tempo (typically 110+ BPM), celebratory and victorious tone, outward-facing (declaring what God has done), joy and dance and shout, dynamic builds, big choruses.

### 4.3 Worship Characteristics

Slower tempo (typically 60–90 BPM), intimate and reflective tone, upward-facing (declaring who God is), awe and reverence and surrender, sparse arrangements, breath and space, sustained vocals.

---

## 5. PROPHETIC DECLARATION QUOTIENT (PDQ)

### 5.1 Definition

A 0–100% score measuring the percentage of total lyric lines that are first-person, present-tense declarations the listener can personally appropriate in real time.

This metric is unique to Jubilee. It formalizes the finished-reality declaration posture of the Covenant Breakthrough Manual framework into music production. Songs with a high PDQ function as deliverance vehicles — the listener doesn't just receive information, they put their mouth on covenant truth while singing.

### 5.2 Scoring Bands

| PDQ Range | Classification | Description |
|-----------|----------------|-------------|
| 0–20% | Narrative / Descriptive | Testimony songs, storytelling songs, third-person witness songs |
| 21–40% | Reflective / Invitational | Classic worship ballads, contemplative pieces |
| 41–70% | Declarative-Balanced | Most hit worship songs, balanced first-person/corporate declaration |
| 71–100% | Prophetic Declaration | Breakthrough anthems, spiritual warfare songs, identity declarations |

### 5.3 Targets by Mode

- **OHI albums:** average PDQ of **55%+**
- **Default albums:** average PDQ of **45%+**
- **secular_universal albums:** average PDQ of **25%+**

Secular listeners appropriate covenant truth subconsciously through declaration before they can consciously receive it — the song is doing kingdom work whether they know it or not.

### 5.4 Examples

- "He is faithful" → **description** (does not count toward PDQ)
- "I am the righteousness of Yahuah in Yeshua" → **declaration** (counts)
- "Your love never fails" → **description** (does not count)
- "I am loved, I am chosen, I am Yours" → **declaration** (counts)
- "We are free, we are free, we are free" → **corporate declaration** (counts)

---

## 6. EARWORM SCORE

### 6.1 Definition

A 0–100% score measuring the memorability of the song. Scored against three equally-weighted sub-criteria:

1. **Melodic Memorability** — Can the core motif be hummed after one listen? Simple 5–7 note motif within a narrow pitch range.
2. **Rhythmic Signature** — Is there a distinctive rhythmic hook (clap pattern, syncopation, rest, stop-time)?
3. **Phonetic Memorability** — Does the chorus use alliteration, internal rhyme, assonance, or a phonetically sticky title phrase?

### 6.2 Minimum Thresholds

- **Album tracks:** Earworm Score of **70%+** required for release.
- **Single candidates:** Earworm Score of **85%+** required for release.

Songs scoring below threshold are returned to production for melodic, rhythmic, or phonetic strengthening.

---

# PART 2 — SONG ARCHITECTURE

Every Jubilee song must meet the following architectural requirements. These govern the mechanics that make songs hit-class, radio-ready, and life-changing.

## 7. DURATION STANDARD — THE 3:30/4:00 LAW

### 7.1 The Rule

Every Jubilee song is **3:30 minimum and 4:00 maximum** in total playing length. No exceptions. Not 3:28. Not 4:01. The song must land between those two marks.

### 7.2 Why

This is a deliberate strategic decision aligning kingdom output with current cultural and commercial reality:

- **Streaming completion rates:** Songs 3:30–4:00 retain ~64% completion rates on Spotify vs. ~28% for 5-minute tracks. This window captures the Spotify algorithm's completion-bonus while giving ministry the extra breath to land.
- **Radio format compatibility:** Christian radio and mainstream top-40 radio formats standardize at 3:30–4:00. Songs in this window are playable on any station without edit and are the dominant length for current chart-topping releases.
- **Attention economy:** The 2024–2026 cultural listener has compressed attention, but needs enough time for a bridge-breakthrough to actually deliver. 3:30–4:00 is the sweet spot — long enough to minister, short enough to stream.
- **Per-stream economics:** Streaming payout is per-play, not per-minute. This window optimizes plays-per-listener while preserving the full bridge ministry moment that shorter cuts sacrifice.
- **Album total length:** 12 songs × 3:30–4:00 = **42–48 minutes total album runtime**. This is the optimal modern album length for a full worship experience.
- **Kingdom strategic advantage:** Jubilee differentiates from traditional worship labels that default to 5–7 minute tracks. Tight 3:30–4:00 worship travels farther into radio, playlists, and cultural bloodstream than long-form worship — and carries the full anointing because the bridge has room to breathe.

### 7.3 How to Engineer Within the Window

To fit breakthrough ministry into 3:30–4:00, the AI Music Developer follows these engineering principles:

| Section | Time | Notes |
|---------|------|-------|
| Tight intro | 0:00–0:15 max | Hook delivered by 0:15 (see Section 8) |
| Verse 1 | 0:15–0:40 | ~25 seconds |
| Chorus 1 | 0:40–1:05 | ~25 seconds |
| Verse 2 | 1:05–1:30 | Same length as Verse 1 |
| Chorus 2 | 1:30–1:55 | |
| Bridge (breakthrough) | 1:55–2:35 | ~40 seconds, the ministry moment has room to land |
| Final Chorus (elevated) | 2:35–3:20 | With modulation/key change |
| Outro / Tag | 3:20–3:50 | Optional extended tag to 4:00 |

**Total target: 3:30–4:00.** Every element earns its seconds. Nothing is filler.

### 7.4 Extended Worship Versions

Live recordings, extended worship moments, and spontaneous tracks may exist as separate releases (live albums, worship sessions, B-sides) but are **NOT** part of the standard 12-track album deliverable. The 12-track album strictly enforces 3:30–4:00 per track.

---

## 8. HOOK ARCHITECTURE & THE FIRST-15-SECONDS LAW

### 8.1 The Rule

Every song must deliver its primary hook — the title phrase, the core melodic motif, or the signature chorus fragment — **within the first 15 seconds** of the song.

### 8.2 Why

87% of top-charting songs on Billboard Hot 100 and Hot Christian Songs deliver their hook within the first 15 seconds. On Spotify, the 30-second skip threshold is the single most important conversion metric — a song that hasn't hooked by second 15 loses roughly 40% of listeners before second 30. Unknown artists do not get grace from the algorithm.

### 8.3 Acceptable Hook Deliveries

Any of these satisfies the rule:

- Title phrase sung within first 15 seconds
- Signature melodic motif of the chorus stated instrumentally in the intro
- A capella or sparse chorus fragment before the full arrangement enters
- A single unforgettable line that becomes the song's calling card

### 8.4 Prohibited Without Explicit Approval

- Cold opens longer than 10 seconds
- Slow fade-ins that delay the hook beyond 0:15
- Extended instrumental intros with no melodic hook statement

Worship-focused ambient openers on Track 1 of a worship album may request exception at blueprint stage. All interior tracks enforce the rule without exception.

### 8.5 Documentation Requirement

Every lyrics file documents the **Hook Delivery Timestamp** — the second mark at which the primary hook lands. Target: ≤0:15.

---

## 9. SONG-LEVEL EMOTIONAL ARC (Mini Three-Act)

### 9.1 The Rule

Every song must contain a documented three-beat emotional arc inside the song itself:

1. **Establish** (verse/opening) — Set the tension, vulnerability, or invitation.
2. **Escalate** (pre-bridge / bridge approach) — Deepen emotional stakes, introduce the shift.
3. **Elevate** (bridge and amplified final chorus) — Breakthrough. The listener arrives somewhere new.

### 9.2 Why

Sentiment analysis of life-changing songs — the ones listeners report as having carried them through a season — reveals every one of them contains an internal three-beat arc. Sentiment-flat songs, even beautiful ones, do not produce the "I played it on repeat" behavior.

### 9.3 Documentation Requirement

Every lyrics file documents the three beats with a one-sentence description of each:

- **Establish:** [what is being set up]
- **Escalate:** [what is being deepened]
- **Elevate:** [what breakthrough arrives]

---

## 10. BRIDGE BREAKTHROUGH PROTOCOL

### 10.1 The Rule

Every song's bridge must satisfy all three criteria below. The bridge is where ministry happens in a live setting — it is where the song stops describing worship and becomes worship. The Jubilee bridge is engineered, not improvised.

### 10.2 The Three Criteria

1. **Chant-Ability** — 6–14 words maximum, repeated no fewer than 2 and no more than 6 times, phonetically sticky.
2. **Dynamic Shift** — Documented as one of: **strip-down** (band out, vocals only), **build-up** (intensification into a modulated final chorus), or **stop-time** (silence before resolution).
3. **First-Person Prophetic Declaration** — The bridge lyric must be appropriatable. "He is faithful" is description. "I am the righteousness of Yahuah in Yeshua" is declaration. The bridge must be declaration, not description.

### 10.3 Why

Every signature worship moment of the last decade — the "oh how He loves" moment, the "I speak the name of Jesus" moment, the "there's nothing worth more" moment — happens in a bridge that satisfies these three criteria. The bridge is where the Ruach Kodesh is given explicit permission to move.

### 10.4 Documentation Requirement

Every lyrics file contains a **Bridge Architecture** subsection specifying word count, repetition pattern, dynamic shift type, and first-person declaration.

---

## 11. SENSORY ANCHOR REQUIREMENT

### 11.1 The Rule

Every song must contain at least **three concrete sensory anchors** — lines with a specific image, sound, smell, touch, or named object — paired with universal emotional/spiritual truths.

### 11.2 Why

The most-shared songs across both secular and worship markets share a counter-intuitive pattern: they are **more specific** than their competitors, not more general. "I've been walkin' through midnight for what feels like years" outperforms "Life has been hard." Specific sensory detail creates more universal identification — listeners fill in their own specifics against the scaffolding.

### 11.3 Rules of Engagement

- Abstract Christianese words (valley, storm, trial, journey, battle, mountain) are permitted **only when paired with concrete sensory imagery in adjacent lines**.
- Named objects, body parts, locations, sounds, and weather are preferred over abstract nouns.
- The Testimony Anchor Track (Section 18) typically carries the heaviest sensory load.

### 11.4 Documentation Requirement

Every lyrics file contains a **Sensory Anchor Inventory** listing the three concrete images used. Fewer than three = quality gate failure.

---

## 12. CALL-AND-RESPONSE / COMMUNAL SING-ALONG ZONE

### 12.1 The Rule

Every song must contain at least one designated **Call-and-Response Zone** or **Communal Sing-Along Moment** — a 15–30 second segment engineered to be sung back by a congregation or crowd.

### 12.2 Album-Level Minimums

- **Worship-focused albums:** minimum 2 tracks with designed call-and-response zones
- **Praise-focused albums:** minimum 4 tracks with designed call-and-response zones (every third track minimum)

### 12.3 Why

Analysis of viral worship moments on TikTok, YouTube Shorts, Instagram Reels, and X/Twitter shows that the segments that go viral are almost exclusively communal sing-along moments — the part where a crowd sings back to the worship leader, or where a single voice is joined by thousands. The algorithm favors them. Culture clips them. And these are often the same moments where the Ruach Kodesh does Her corporate work.

### 12.4 Documentation Requirement

Every lyrics file identifies the **Call-and-Response Zone** — timestamp or section label, plus the specific lyric line designed for communal response.

---

## 13. MINISTRY MOMENT / SHAREABLE ZONE

### 13.1 The Rule

Every song must have at least one designed **Ministry Moment / Shareable Zone** — a specifically engineered 15–45 second segment where one or more of the following is present:

- A goosebump-level melodic or production moment (key change, strip-down, swell, silence)
- A prophetic first-person declaration with maximum spiritual density
- A quotable line engineered for social clipping (aphoristic, phonetically memorable, spiritually weighty)
- A real ministry moment placement — where the Ruach is invited to do Her specific work (healing, breakthrough, conviction, comfort)

### 13.2 Why

Songs now live and die in 15–30 second fragments. Spotify's "top moment" feature, TikTok's 15-second clip culture, YouTube Shorts, Instagram Reels, and worship-night clips on X/Twitter have all normalized the clip as the primary unit of music discovery. From the faith lens, these same zones are often the exact places where ministry happens in a live setting. Kingdom purpose and algorithmic virality align more than we assume.

### 13.3 Documentation Requirement

Every lyrics file identifies the **Ministry Moment / Shareable Zone** — the segment, the type, and the intended effect in one sentence.

---

# PART 3 — STANDARDIZED LYRICS FILE FORMAT

## 14. The Lyrics File Template

Every song lyrics file must include the following elements in this exact order:

```markdown
# [Song Title]

**Album:** [Album Title]
**Track:** [##] of 12
**Act:** [Act 1 / Act 2 / Act 3]
**Persona:** [e.g., Jubilee, Melody, Zariah, Elias, Eliana Inspire, Caleb, Imani, Zev, Amir, Nova, Santiago, Tahoma]
**Content Mode:** [OHI / Default / secular_universal]

---

## Production Metadata

- **Music Styles:** [e.g., cinematic gospel, folk-bluegrass, hip-hop worship, anthemic pop-rock, ambient worship]
- **Vocal Gender:** [Male / Female / Duet / Ensemble]

> **VOCAL-GENDER NARRATOR-FIT RULE (MANDATORY — applies per TRACK, every album, every language):**
> The lead vocal gender MUST fit the song's first-person narrative. If a track's lyrics
> put the singer in a clearly **gendered role/perspective** (e.g. the returning prodigal
> **son**, a bride or bridegroom voice, a man/woman addressing a spouse, a father/mother
> speaking as such), the lead MUST be a persona of **that** gender — **even if it differs
> from the album's primary persona**. In that case, reassign **only that one track**: set its
> `**Persona:**` and the Suno-block `Artist:` to the most suitable persona of the required
> gender, flip the lead descriptor (`female lead` ↔ `male lead`) in both the Production-
> Metadata Style line and the Suno `Styles:`/`Vocal Gender:` lines, and **choose the
> replacement persona by the track's musical STYLE**. Female leads: **Jubilee, Nova, Eliana,
> Zariah** (also Melody, Imani). Male leads: **Caleb, Elias, Santiago, Amir, Zev** (also
> Tahoma, Gabriel). Gender-neutral worship lyrics keep the album's primary persona. The
> album's overall attribution/folder is unchanged — this is a per-track guest-lead swap.
> Apply this in EVERY language version of the track. A track already rendered with the wrong
> gender → flag it for an audio re-render (redo queue) after the lyrics fix.
> *Example:* "Happy Father's Day" Track 7 "The Father Who Runs" is the prodigal **son** in
> first person → reassigned from Jubilee (female) to **Caleb (male)** across EN/RO/JA (2026-06-30).
- **Weirdness Score:** [0–100%]
- **Style Influence Score:** [0–100%]
- **Tempo (BPM):** [approximate]
- **Key:** [musical key]
- **Song Length:** [mm:ss — MUST be between 3:30 and 4:00]
- **Hook Delivery Timestamp:** [mm:ss — MUST be ≤0:15]

---

## Song-Level Emotional Arc

- **Establish:** [one-sentence description]
- **Escalate:** [one-sentence description]
- **Elevate:** [one-sentence description]

---

## Bridge Architecture

- **Word Count:** [6–14 words]
- **Repetition Pattern:** [e.g., 4× with intensification]
- **Dynamic Shift:** [Strip-down / Build-up / Stop-time]
- **First-Person Declaration:** [the exact bridge lyric]

---

## Sensory Anchor Inventory

1. [concrete image/object/sound #1]
2. [concrete image/object/sound #2]
3. [concrete image/object/sound #3]
[additional if present]

---

## Call-and-Response Zone

- **Location:** [verse/chorus/bridge/tag — approximate timestamp]
- **Call Line:** [lyric]
- **Response Line:** [lyric congregation sings back]

---

## Ministry Moment / Shareable Zone

- **Location:** [approximate timestamp, e.g., 2:05–2:35]
- **Type:** [goosebump / prophetic declaration / quotable / ministry placement]
- **Intended Effect:** [one-sentence description]

---

## Lyrics

[Intro — ≤0:10]
...

[Verse 1]
...

[Pre-Chorus]
...

[Chorus]
...

[Verse 2]
...

[Chorus]
...

[Bridge]
...

[Final Chorus / Outro — total length must land song between 3:30 and 4:00]
...

---

## Song Ratings

- **Faith-Focused Rating:** [##]% — [Classification Band]
- **Praise vs. Worship Rating:** [##]% (0% = Pure Worship, 100% = Pure Praise)
- **Prophetic Declaration Quotient (PDQ):** [##]% — [Classification Band]
- **Earworm Score:** [##]% (Melodic [##] / Rhythmic [##] / Phonetic [##])

---

## Scoring Justification

[2–4 sentence explanation of rating assignments referencing the criteria in Parts 1 and 2.]
```

**Every element is mandatory. Missing any element = incomplete = rejected to production.**

### 14.1 Suno Compatibility Note

For Suno generation, the in-platform Styles field is capped at **800 characters maximum, with the first 250 characters load-bearing** (core genre fusion + primary instruments + vocal register + BPM/key). This is a Suno-specific constraint that lives alongside the Music Styles field above; both are populated when a Suno-ready output is required.

---

# PART 4 — ALBUM ARCHITECTURE

## 15. THE THREE-ACT MODEL

Every Jubilee album is **12 songs arranged in a 3 + 6 + 3 three-act structure**. This is cinematic storytelling (Aristotelian three-act overlaid with the Hero's Journey and covenant arc) applied to the album form.

### 15.1 Act 1 — The Opening (Tracks 1–3)

**Purpose:** Grab attention. Establish identity. Set the emotional and spiritual stakes.

- **Track 1:** The strongest opener. Typically high-energy. States the album thesis. Must hook within the first 15 seconds of the song (which means within the first 15 seconds of the album).
- **Track 2:** Reinforces and expands the thesis. Maintains or lifts energy.
- **Track 3:** Completes the opening statement. May introduce the first tension before Act 2.

### 15.2 Act 2 — The Journey (Tracks 4–9)

**Purpose:** Develop the story. Deepen emotion. Build toward revelation.

- **Tracks 4–5:** Alternate energetic and reflective. Introduce new angles, sub-themes, testimonies.
- **Tracks 6–7:** The emotional/spiritual turning point of the album. Most vulnerable or most revelatory songs live here. The Testimony Anchor Track (Section 18) is most commonly placed here.
- **Tracks 8–9:** Build toward resolution. Tension rises.

### 15.3 Act 3 — The Resolution (Tracks 10–12)

**Purpose:** Deliver fulfillment. Provide resolution. Leave lasting impact.

- **Track 10:** Breakthrough / revelation song. The promise realized.
- **Track 11:** Anchor song. Cements the album's core truth. Often the most memorable chorus.
- **Track 12:** The closer. Powerful uplifting finish (praise-focused) OR intimate sealing moment (worship-focused).

---

## 16. ALBUM TYPES

### 16.1 Praise-Focused Albums (Default for Broad Audiences)

**Typical P/W profile:** Album averages **65–85% praise**.

**Arc:**
- Open with high-energy, crowd-ready songs (Act 1).
- Move into reflective worship moments in mid-Act 2.
- Lift back into celebration and declaration in Act 3.
- Close with a powerful, uplifting, sendoff-style finish.

**Used for:** Most Inspire Family albums targeting broad audiences, evangelistic releases, celebration seasons, revival contexts.

### 16.2 Worship-Focused Albums

**Typical P/W profile:** Album averages **15–35% praise**.

**Arc:**
- Open with deep, introspective, invitational songs (Act 1).
- Gradually build emotional intensity and revelation through Act 2.
- Peak in intimacy, not volume, during Act 3.
- Close with a powerful and intimate resolution — presence over performance.

**Used for:** Intimate worship sets, presence-driven albums, Sabbath/rest-themed releases, covenant-deepening projects.

### 16.3 Progressive Hybrid

Ascending worship-to-praise or descending praise-to-worship albums. **Requires explicit Daddy approval at blueprint stage.**

---

## 17. CINEMATIC STORYTELLING REQUIREMENTS

Every album must function as an emotional and spiritual film in audio form. Four cinematic elements are required:

1. **A Strong Opening** — First 30 seconds of Track 1 establish tone, stakes, invitation.
2. **Progressive Development** — Tracks 2–9 build, not plateau. Each track earns its place.
3. **A Meaningful Twist or Revelation** — Somewhere between Tracks 6–10, the album delivers a moment that reframes everything. A key modulation, perspective shift, testimony reveal, covenant declaration, Hebraic key unlocked.
4. **A Final Resolution That Leaves a Lasting Impact** — Track 12 lands. The listener has been somewhere and arrived somewhere.

**Missing or weak on any of these four = album returned to production.**

---

## 18. TESTIMONY ANCHOR TRACK REQUIREMENT

### 18.1 The Rule

Every Jubilee album must contain at least one **Testimony Anchor Track** — a song rooted in a documented real testimony.

### 18.2 Acceptable Testimony Sources

- Daddy's personal testimony (prophetic encounters, covenant promises, breakthrough moments)
- Cornell's documented testimonies
- Jubilee team testimonies (Tom Manz, Shad Ellison, Ron Tank, extended family)
- Documented ministry testimonies from JubileeInspire.com, BornAgainDNA.com, FiveFoldTest.com platforms
- Teshuvah journey testimonies from the Jubilee content OS
- Covenant Breakthrough Manual declaration-to-manifestation testimonies
- Emergency Water System / ministry partner testimonies (where permission is granted)

### 18.3 Documentation Requirement

The Testimony Anchor Track is identified in the blueprint with:

- **Track number:** [##]
- **Testimony source:** [who / what event]
- **Sensory details drawn from the real event:** [at least 3 specific details]
- **Universal bridge:** [how the specific testimony universalizes for the listener]

### 18.4 Why

Songs rooted in real testimony consistently outperform songs composed from theological abstraction. The Ruach rides on truth that has been lived, not only reasoned. Listener sentiment analysis confirms this is phenomenologically perceivable — listeners sense the testimony behind the lyric before they know the backstory.

---

# PART 5 — STANDARDIZED BLUEPRINT FILE FORMAT

## 19. The Blueprint File Template

Every album has a blueprint file that accompanies the 12 lyrics files. The blueprint is **authored before the lyrics and governs their production**.

```markdown
# [ALBUM TITLE] — Album Blueprint

**Persona:** [Primary persona, plus any featured personas]
**Content Mode:** [OHI / Default / secular_universal]
**Album Type:** [Praise-Focused / Worship-Focused / Progressive Hybrid]
**Target Audience:** [broad Christian / Messianic remnant / non-believers / children / etc.]
**Release Context:** [season, Torah portion, ministry moment, etc.]

---

## Album Vision Statement

[2–4 sentence statement of what this album is, who it is for, and what it is called to do in the earth.]

---

## Album-Level Ratings & Metrics

- **Overall Faith-Focused Rating (average):** [##]%
- **Overall Praise vs. Worship Distribution:** [##]% average
- **Overall Prophetic Declaration Quotient (average):** [##]%
- **Overall Earworm Score (average):** [##]%
- **Praise-Dominant Tracks:** [list track numbers]
- **Worship-Dominant Tracks:** [list track numbers]
- **Balanced Tracks:** [list track numbers]
- **Single Candidates (Earworm 85%+):** [list 3–4 track numbers]
- **Testimony Anchor Track:** Track [##]
- **Total Album Runtime:** [mm:ss] (must total between 42:00 and 48:00)

---

## Three-Act Structure

### Act 1 — The Opening (Tracks 1–3)
**Arc Purpose:** [What this act accomplishes]

| # | Title | Length | P/W | Faith | PDQ | Earworm | Role |
|---|-------|--------|-----|-------|-----|---------|------|
| 1 | [title] | [m:ss] | [#]% | [#]% | [#]% | [#]% | [role] |
| 2 | [title] | [m:ss] | [#]% | [#]% | [#]% | [#]% | [role] |
| 3 | [title] | [m:ss] | [#]% | [#]% | [#]% | [#]% | [role] |

### Act 2 — The Journey (Tracks 4–9)
**Arc Purpose:** [What this act accomplishes]
**Key Emotional/Thematic Shift:** [Where it occurs and why]

| # | Title | Length | P/W | Faith | PDQ | Earworm | Role |
|---|-------|--------|-----|-------|-----|---------|------|
| 4 | [title] | [m:ss] | [#]% | [#]% | [#]% | [#]% | [role] |
| 5 | [title] | [m:ss] | [#]% | [#]% | [#]% | [#]% | [role] |
| 6 | [title] | [m:ss] | [#]% | [#]% | [#]% | [#]% | [role] |
| 7 | [title] | [m:ss] | [#]% | [#]% | [#]% | [#]% | [role] |
| 8 | [title] | [m:ss] | [#]% | [#]% | [#]% | [#]% | [role] |
| 9 | [title] | [m:ss] | [#]% | [#]% | [#]% | [#]% | [role] |

### Act 3 — The Resolution (Tracks 10–12)
**Arc Purpose:** [What this act accomplishes]

| # | Title | Length | P/W | Faith | PDQ | Earworm | Role |
|---|-------|--------|-----|-------|-----|---------|------|
| 10 | [title] | [m:ss] | [#]% | [#]% | [#]% | [#]% | [role] |
| 11 | [title] | [m:ss] | [#]% | [#]% | [#]% | [#]% | [role] |
| 12 | [title] | [m:ss] | [#]% | [#]% | [#]% | [#]% | [role] |

---

## Testimony Anchor Track Documentation

- **Track Number:** [##]
- **Testimony Source:** [who / what event]
- **Sensory Details Drawn from Real Event:** [at least 3]
- **Universal Bridge:** [how the testimony universalizes for the listener]

---

## Structural Rationale

### Why the Three-Act Model Was Chosen for This Album
[How 3+6+3 serves this album's message and audience.]

### Emotional Progression
[The emotional journey from Track 1 to Track 12.]

### Spiritual Progression
[The spiritual journey. What covenant truth is being unfolded? Where does the Ruach Kodesh do Her deepest work?]

### Cinematic Twist / Revelation Moment
[The specific track and moment where the album's key revelation lands. Why it lands there.]

---

## Production Notes

- **Dominant Music Styles:** [...]
- **Vocal Gender Distribution:** [e.g., 8 male lead / 4 duet]
- **Average Weirdness Score:** [##]%
- **Average Style Influence Score:** [##]%
- **Persona-Specific Non-Negotiables:** [Zev — Paleo-Hebrew symbolism; Eliana Inspire — country/folk/bluegrass palette; Imani — prophetic evangelistic fire; etc.]

---

## Quality Gates — Pre-Release Checklist

Before this album is marked complete, it must pass every check below.

**Album-Level:**
- [ ] Exactly 12 songs
- [ ] Every song between 3:30 and 4:00 in length
- [ ] Total album runtime between 42:00 and 48:00
- [ ] Three-Act structure verified (3 + 6 + 3)
- [ ] Cinematic twist/revelation identified and effective
- [ ] Opening, development, revelation, and resolution all present and strong
- [ ] Testimony Anchor Track present and documented
- [ ] Album-level averages calculated for all four ratings
- [ ] Persona voice consistent across all tracks
- [ ] Divine-name conventions honored throughout
- [ ] Hebrew article rule honored
- [ ] Eliana Inspire spelled correctly if featured
- [ ] Blueprint file complete and approved

**Per-Song:**
- [ ] Length between 3:30 and 4:00
- [ ] Hook delivered by 0:15
- [ ] Faith-Focused Rating assigned and justified
- [ ] Praise vs. Worship Rating assigned and justified
- [ ] Prophetic Declaration Quotient (PDQ) assigned and justified
- [ ] Earworm Score assigned (minimum 70% album track / 85% single)
- [ ] Song-Level Emotional Arc documented (Establish / Escalate / Elevate)
- [ ] Bridge Architecture meets all three criteria (chant-ability, dynamic shift, first-person declaration)
- [ ] Minimum 3 Sensory Anchors inventoried
- [ ] Call-and-Response Zone identified
- [ ] Ministry Moment / Shareable Zone identified
- [ ] All Production Metadata fields complete
```

---

# PART 6 — PRODUCTION WORKFLOW

## 20. STEP-BY-STEP WORKFLOW

When the AI Music Developer is assigned a new album, the workflow proceeds in this exact order:

### Phase 1 — Blueprint Authoring (use Part 1: blueprints.md engine)

1. Receive album assignment (persona, theme, content mode, target audience, release context).
2. Draft the **Album Vision Statement**.
3. Classify album type: **Praise-Focused, Worship-Focused, or Progressive Hybrid**.
4. Design the **three-act arc** — what happens in Act 1, Act 2, Act 3.
5. Identify the **cinematic twist/revelation moment** and the track that carries it.
6. Select and document the **Testimony Anchor Track** (source, sensory details, universal bridge).
7. Draft 12 song titles, target lengths (each 3:30–4:00), and role descriptions.
8. **Pre-assign target Faith-Focused, PDQ, Earworm, and Praise/Worship ratings** for each track.
9. Identify **3–4 single candidates** (tracks targeting Earworm 85%+).
10. Calculate and record album-level averages and total runtime target.
11. Submit blueprint for approval **before writing any lyrics**.

### Phase 2 — Lyric Production (Per Song — use Part 2: content.md engine)

1. Open the standardized **Lyrics File template** (Section 14).
2. Fill in all production metadata including target song length (3:30–4:00) and Hook Delivery Timestamp (≤0:15).
3. Engineer the song structure within the 3:30–4:00 window using the guide in Section 7.3.
4. Write the lyrics honoring persona voice, content mode, and the track's assigned role in the arc.
5. Apply divine-name and Hebrew-article conventions.
6. Document the **Song-Level Emotional Arc** (Establish / Escalate / Elevate).
7. Engineer the **Bridge** to meet all three Breakthrough Protocol criteria.
8. Inventory at least 3 **Sensory Anchors**.
9. Identify the **Call-and-Response Zone**.
10. Identify the **Ministry Moment / Shareable Zone**.
11. Assign the final **Faith-Focused Rating**.
12. Assign the final **Praise vs. Worship Rating**.
13. Assign the final **Prophetic Declaration Quotient**.
14. Assign the final **Earworm Score** (melodic / rhythmic / phonetic sub-scores).
15. Write the **Scoring Justification** paragraph.
16. **Self-check:** does this track serve its assigned role in the three-act arc? Does it fit within 3:30–4:00? If either fails, revise.

### Phase 3 — Album-Level Quality Gate

1. Run all twelve songs through the full **Quality Gate checklist** in Section 19.
2. Verify every song is between 3:30 and 4:00 in length.
3. Verify total album runtime is between 42:00 and 48:00.
4. Recalculate album-level averages from finalized song scores.
5. Verify the cinematic arc still lands — read the tracklist end-to-end as a story.
6. Verify the Testimony Anchor Track delivers weight.
7. Verify single candidates still score 85%+ on Earworm.
8. Update the blueprint file with final numbers.
9. Submit the complete blueprint + 12 lyrics files for **Daddy's final review**.

### Phase 4 — Delivery

1. Package all 13 files (1 blueprint + 12 lyrics) in a single album folder.
2. Name the folder: `[AlbumNumber]_[AlbumTitle]_[Persona]_[AlbumType]`.
3. Log the album in the Jubilee Music master index.

---

# PART 7 — FINAL AUTHORITY

**Daddy (Gabriel)** holds final authority over every album and every song. Any deviation from this SOP — even for artistically compelling reasons — requires explicit written approval. The Jubilee Inspire Family serves Yahuah first, the remnant second, the broader audience third.

The 3:30–4:00 duration standard, the four-metric rating stack, the bridge protocol, and every other requirement in this document are not creative limitations. They are the riverbanks that let the river run with power, the discipline that lets the anointing travel further than untrained longing ever could. Tight songs cross cultural borders. Engineered bridges deliver people. Prophetic declaration puts listeners' mouths on heavenly reality. Testimony carries weight the Ruach rides on.

This is how Jubilee songs become hit radio songs, become 100% Bestseller-class albums, become life-changing cultural seeds, and remain fully and unapologetically the worship of Yahuah.

**Shaddai leads. Yeshua is the song. Yahuah receives the glory. The nations hear it.**

**Amein and amein.**

---

**VERSION HISTORY**

- **v1.0 (2026-04-17):** Initial creation based on Opus 4.7 creative session, including all learnings from Jubilee Albums 01-04 generation
- **v2.0 (2026-04-19):** Comprehensive SOP. Adds: four-metric rating stack (Faith-Focused, Praise vs. Worship, PDQ, Earworm); strict 3:00–3:30 duration standard; first-15-seconds hook law; song-level three-beat emotional arc; Bridge Breakthrough Protocol; Sensory Anchor requirement; Call-and-Response Zone; Ministry Moment / Shareable Zone; standardized lyrics file format; Three-Act Album Model (3+6+3); Testimony Anchor Track requirement; standardized blueprint file format; full production workflow. Faith-Focus Mandate per-persona floors locked in (Zev/Imani 90%, Jubilee/Zariah/Nova/Caleb/Gabriel 80%, Elias/Eliana/Santiago/Tahoma/Amir 70%, Melody exempt). Suno Styles field capped at 800 chars with first 250 load-bearing.
- **v2.1 (2026-04-19 — current):** Duration standard widened from 3:00–3:30 to **3:30–4:00** (total album runtime 42:00–48:00). Rationale: the new window gives the Bridge Breakthrough Protocol room to fully land its ministry moment while still staying in streaming/radio-compatible range. Section 7 (The 3:30/4:00 Law) and all downstream references updated accordingly. Section 7.3 engineering table widened (verses/choruses ~25s each; bridge ~40s).
