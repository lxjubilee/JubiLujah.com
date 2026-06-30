# BUILD INSTRUCTIONS — Generate `/.prompts/translate_<LANGUAGE>.md` Files

**Audience:** the AI developer/agent executing this file.
**Goal:** produce a set of stand-alone **translation-engine** prompt files — one per
target language — that each take a finished **English (EN)** music album/song and
translate it into the target language so the result is **doctrinally faithful,
natural, culturally resonant, non-offensive to that culture's faith communities,
emotionally compelling, genuinely singable, and compulsively re-listenable.**

These are *singing translations*, not literal glosses — and more than that, they are
**culturally re-contextualized** worship songs. A line can be 100% linguistically
accurate and still be *spiritually wrong* for the target culture (wrong reverence
register, an image that's warm in English but cold or offensive abroad, an emotional
frame that doesn't resonate). Each file must reach the quality bar of the
gold-standard exemplar **`translate_Romanian.md`** (the Jubilee Music RO engine) and
add the cultural-resonance and re-listenability layers below.

Follow the steps in order. **Do not skip per-language research (Step 2)** — generic
files are worthless. Where the exemplar shows a Romanian-specific catch, find the
real equivalent for the language at hand.

---

## STEP 0 — What you are building

For every language in **Step 1**, create one file at:

```
/.prompts/translate_<LANGUAGE>.md
```

Each generated file is a self-contained prompt a future user pastes into an LLM with
the English lyrics. It translates ONLY the sung text and **keeps the EXACT
Suno-compliant structure** of the EN source — section tags, production cues, the
`Style`/`Styles:` block, and metadata footers are preserved (see template §6).

Naming: English name, capitalized, spaces → underscores (`translate_Mandarin_Chinese.md`).
Portuguese → two files (`translate_Portuguese_Brazilian.md`, `translate_Portuguese_European.md`).
`Tagalog / Filipino` → one file (`translate_Tagalog.md`).

---

## STEP 1 — Target languages (one file each)

| # | Language | Code | # | Language | Code |
|---|----------|------|---|----------|------|
| 1 | Spanish | es | 15 | Thai | th |
| 2 | French | fr | 16 | Turkish | tr |
| 3 | German | de | 17 | Vietnamese | vi |
| 4 | Italian | it | 18 | Tagalog / Filipino | tl |
| 5 | Brazilian Portuguese | pt-BR | 19 | Hebrew | he |
| 6 | European Portuguese | pt-PT | 20 | Swedish | sv |
| 7 | Dutch | nl | 21 | Danish | da |
| 8 | Russian | ru | 22 | Czech | cs |
| 9 | Polish | pl | 23 | Hungarian | hu |
| 10 | Mandarin Chinese | zh | 24 | Bulgarian | bg |
| 11 | Japanese | ja | 25 | Croatian | hr |
| 12 | Korean | ko | 26 | Indonesian | id |
| 13 | Arabic | ar | 27 | Romanian | ro |
| 14 | Hindi | hi | 28 | Ukrainian | uk |

**28 files** (Romanian is the exemplar — match its depth; Ukrainian included).

---

## STEP 2 — Research each language before writing its file

Fill every item with **specifics a native faith-insider would confirm.**

### 2A. The ten craft dimensions (singability spine)
Script & orthography; syllable load vs English; stress/rhythm/prosody;
rhyme conventions (note where end-rhyme must NOT be forced — e.g. ja, ko);
register & address; grammatical gender & narrator voice (fix narrator gender first
in Slavic/Romance/Semitic/Hindi); cultural & idiomatic adaptation; heightened/sacred
register; AI-vocal/Suno pronunciation tips (tonal: zh/th/vi; add vowel diacritics:
ar/he); common pitfalls.

### 2B. Divine names & theological terms — LOCKED GLOSSARY WITH CONNOTATION NOTES
EN → target table, one chosen spelling per term, used consistently album-wide. Cover
the divine names AND the abstract terms that rarely have a clean equivalent — and for
each, note the **connotation/baggage** of the chosen word:
- Divine names/titles: God, the Lord (title + vocative), Jesus, Christ, Father
  (title + vocative), Holy Spirit, King (Christ), Lamb, Savior, **Son of God**.
- Loaded abstracts (flag the trap): **grace** (does the word also mean luck/favor?),
  **holy** (borrowed from another religion's ritual purity?), **spirit** (also
  "ghost"?), **saved/salvation** (sounds like rescue-from-drowning?), **redeemed**,
  **soul**, **glory**, **repentance**, **mercy**, **righteousness**.
- Key phrases: "It is finished" (John 19:30); "Come, Lord Jesus" (Rev 22:20);
  Hallelujah, Amen, Hosanna; Bride/Bridegroom; wedding feast / marriage supper of the Lamb.
- **Son of God / divine-titles policy (mandatory, sourced):** state the established
  *Christian* term for "Son of God" in this language and a hard rule **never to soften
  or remove divine sonship** to reduce offense (esp. Arabic, Turkish, Persian-adjacent
  contexts where this is contested) — contextualize the *form*, never deny the doctrine.
- **Never import a divine name from another religion** to fill a slot; use the standard
  Christian word for God (catalog-wide non-negotiable).

### 2C. The standard Bible to echo
Name the most broadly recognized Bible in the language (RO uses **Cornilescu**) and
the canonical phrasings for commonly-quoted lines, so Scripture echoes ring true.

### 2D. Faith-community landscape & non-offense rules
Dominant Christian traditions where the language is spoken (Orthodox, Catholic,
Greek-Catholic, neo-Protestant/Evangelical/Pentecostal/Baptist), the shared
Scripture-anchored vocabulary all own, and tradition-specific imports to AVOID
(Marian/saint/icon devotion, one-church liturgical formulas, glossolalia naming).
Also note the receptor community's norms on gender/inclusive language and family —
**defer to the target faith community's norms, never import the source culture's
current debates.**

### 2E. Loanword & register traps that misread
Words that look like easy translations but misread (RO: *ring* = boxing ring;
*public* = concert audience; *mandarină* = the fruit). Find each language's set.

### 2F. Native elisions/contractions singers use
The apostrophe-elisions real singers use to fit syllables (RO: *nu-i, într-o, s-a,
m-ai, S-a-mplinit*). These fit syllable count without padding.

### 2G. Likely banned filler/error patterns
Anticipate the language-specific versions of §0A: forced rhyme-filler nouns, invented
non-words, wrong verb/mood forms, calqued prepositions/idioms, English-calque images,
mis-agreeing line-end adjectives, stranded grammatical tails. Seed with real examples;
grow as reviews catch more.

### 2H. WORLDVIEW FRAME & CULTURAL-RESONANCE MAP  ← NEW (highest leverage)
- **Dominant salvation worldview frame.** Identify whether the culture primarily runs
  on **guilt–innocence** (most of the West), **honor–shame** (Middle East, much of
  Asia, the Mediterranean), or **fear–power** (animist-background regions, parts of
  Africa/SE Asia) — often a blend. This sets which biblical images to FOREGROUND
  (same doctrine, different emotional entry point): legal debt/freedom for
  guilt-innocence; outcast→restored-honor, the Father running to embrace, adoption and
  belonging for honor-shame; Christ's authority over every dark power and light
  swallowing darkness for fear-power.
- **Taboo / "danger" image list.** Catalog images that flip valence in this culture,
  with safe native substitutes. Common flips: buddy/"homeboy" intimacy with Jesus
  (beloved in Western evangelicalism, irreverent in Orthodox/Korean/MBB contexts);
  **dancing before the Lord** (joy in Latin/African/Pentecostal worship, "fleshly" in
  conservative Orthodox/Reformed); **wine flowing like a river** (biblical, but
  sensitive among teetotal denominations and recovery communities); **fire**
  (redemptive vs pure judgment); **father imagery** (tender vs painful where paternal
  absence is common).
- **Native "ache" word / emotional idiom.** The culture's own untranslatable word for
  sacred longing — RO *dor*, pt *saudade*, ko *han*, ru *toska*, ar *shawq* — to carry
  a redemption song's yearning. Also note the culture's worship *temperature*
  (exuberant clap-and-shout vs restrained reverence vs lament tradition).
- **Political / ethnic / conflict sensitivity (keep current).** Flag charged
  vocabulary: warfare/army/"conquering" imagery can read as propaganda in active
  conflict zones (**live for Ukrainian** — use authentic Ukrainian register, avoid
  russisms, avoid any framing echoing the aggressor's rhetoric); king/kingdom can feel
  odd in strong republics; homeland/nation/blood-and-soil phrasing is dangerous in
  several regions; chains/slavery/freedom carries specific historical weight elsewhere.
- **Native hymnody & Scripture memory.** The 1–2 most iconic worship/hymn phrases
  believers already carry, to ALLUDE to (not quote wholesale) so a new song feels
  trustworthy and "ours."

### 2I. Divine-address register & native poetic/musical form  ← NEW
- **Reverence register/honorifics.** How God must be addressed — intimate vs
  honorific, and the exact grammatical forms. In some languages reverence is
  *grammatical*: Korean honorific endings (시 -si, deferential speech levels),
  Japanese keigo, Thai sacred/royal vocabulary (ราชาศัพท์), Javanese speech levels.
  Omitting them sounds shockingly rude; the wrong level sounds cold or chummy. State
  the required forms explicitly.
- **Native poetic device & form.** Beyond syllable count: tone–melody agreement
  (tonal langs), quantitative meter and the *radif* (Arabic/Persian/Urdu), parallelism
  (Hebrew/Arabic), call-and-response (many African traditions). Hitting the culture's
  native device makes it feel like real songwriting.
- **Culturally resonant instrumentation cues** (optional) for the `Style` block, so
  the arrangement reinforces rather than fights the lyric.

---

## STEP 3 — Template every generated file must follow

Replace `<LANGUAGE>`, `<ENDONYM>`, `<CODE>`, and all bracketed research. Sections
0, 0A, 4, 5, 6, 8, 9, 10 share a spine; the **per-language gold** lives in 0A's real
examples, 1, 1A, 2, 3, 4's craft notes, and 9's real worked example.

```markdown
# <Project> Music — <LANGUAGE> (<CODE>) Lyrics Translation Engine

**Purpose:** Translate finished English (EN) song lyrics into singable, natural,
faith-appropriate, culturally resonant <LANGUAGE> (<CODE>) — not a literal gloss.
A good <CODE> translation sings as well as the original, is instantly understandable
and *relatable* to a native believer, and does not offend any faith community in the
culture. Keep the EXACT Suno-compliant structure of the EN source — only the sung
text is translated.

## 0. THE GOLDEN RULE — Singing Translation, Not Word-for-Word
Singing translation (skopos = performance). Priority order:
1. Faithful to meaning & the gospel — theology must survive intact; never alter
   doctrine to make a rhyme.
2. Singable — syllable count, stress, open vowels fit the melody.
3. Natural & culturally resonant <LANGUAGE> — sounds like a native believer wrote it;
   no calques, no English word order; uses the culture's own emotional frame (§1A).
4. Same emotional payload & imagery — keep the concrete picture; swap an image only
   if untranslatable, culturally confusing, or taboo (§1A).
5. Rhyme & hook — match the rhyme scheme ONLY with real, sensible words; always keep
   the hook's rhythmic placement.
When 2–5 conflict, meaning (1) wins, then singability (2).

> LAW #1 — MEANING-FIRST (non-negotiable): every line must make complete, natural
> sense to a native with the rhyme ignored. Rhyme is the lowest priority. Ship a clear
> unrhymed/near-rhymed true line over a forced one. Never invent a word, bend grammar,
> or append a meaningless noun to hit a rhyme. If no honest rhyme fits, DROP IT. Run
> the DROP-THE-RHYME TEST on every line (delete the final rhyme word; does the rest
> still say something true and natural, and is that word one you'd actually use?).
>
> LAW #2 — CONTEXTUALIZE, NEVER SYNCRETIZE (non-negotiable): adapt the *form,
> imagery, and emotional frame* to the culture freely — but never sand down the cross,
> repentance, judgment, sin, the blood, or Christ's exclusivity to be more relatable.
> Keep the offense of the cross; remove only the offense of bad form (1 Cor 1:23).
> Relatability that costs doctrine is a defect.

## 0A. BANNED ERROR PATTERNS (check every line)
1. No nonsense / forced rhyme-filler words. [Real <LANGUAGE> offenders.]
2. Only REAL words & correct verb forms. [<LANGUAGE> traps — wrong moods/conjugations.]
3. Correct prepositions & set phrases — no calques. [<LANGUAGE> calque traps.]
4. No English-calque or tech/telephone-metaphor images. [examples + fixes]
5. Loanwords/register that misread in <LANGUAGE> (from 2E).
6. Line-end adjectives agree in gender/number (if the language inflects).
7. No grammatically stranded tails.
8. Imagery internally consistent (no contradicting/antecedent-less image).
9. Theology over rhyme — no rhyme word distorts doctrine; luck/chance stays
   subordinate to God's sovereignty.

## 1. AUDIENCE & THE NON-OFFENSE MANDATE
[From 2D: faith-community landscape.] Must hold for the whole Body of Christ in this
language.
- Shared Scripture-anchored vocabulary (see §2); anchor Scripture echoes to
  [standard Bible from 2C], alluding to native hymnody where it strengthens trust.
- No tradition-specific imports the source lacks (Marian/saint/icon devotion,
  one-church liturgy, glossolalia naming). Christ-centered, Bible-plain.
- Reverent register toward God; capitalize divine pronouns where it aids reverence;
  use the required reverence grammar/honorifics (§1A). No vulgar/street-slang anywhere.
- No romantic/erotic God-imagery; Bride/Bridegroom kept pure.
- Gender/inclusive-language and family handling: defer to THIS community's norms;
  do not import the source culture's debates.

## 1A. CULTURAL RESONANCE & TABOO MAP  ← (the relatability layer)
[From 2H/2I — this is what makes it *theirs*.]
- **Lead with the culture's worldview frame:** [guilt–innocence / honor–shame /
  fear–power]. Foreground these images: [frame-appropriate set]. Same doctrine, the
  emotional entry point that resonates here.
- **Taboo/danger images → safe substitutes:** [list]. Check every image against this
  before shipping.
- **Native ache word / emotional idiom:** [word] — use it to carry longing. Worship
  temperature here: [exuberant / restrained / lament].
- **Charged vocabulary to handle with care:** [conflict/political/ethnic flags].
- **Reverence/honorific forms required when addressing God:** [explicit forms].
- **Native poetic device to reach for:** [tone-melody / radif / parallelism /
  call-response / etc.].

## 2. DIVINE NAMES & THEOLOGICAL TERMS — LOCKED GLOSSARY (EN → <LANGUAGE>)
[Full glossary from 2B: one spelling per term + connotation note per loaded abstract.]
Keep divine-name usage consistent album-wide. **Son of God:** [established term] —
never soften or remove divine sonship. Never use a divine name from another religion.

## 3. COINED / BRAND WORDS, PROPER NOUNS & LOANWORDS
- Coined brand hooks stay verbatim (signature earworm + any spelling-chant) — exact
  letters, stripped-syllable chants preserved.
- Greek theological terms localized in spelling where standard (kairos, chronos…).
- Language & place names in <LANGUAGE> forms; keep the multilingual sweep; flag any
  that misread (2E).
- Modern loanwords only where natives actually speak that way; prefer a clean
  <LANGUAGE> word that sings.

## 4. SINGABILITY & PROSODY ( <LANGUAGE>-specific )
[From 2A/2F/2I.]
- Match syllable count; compress with native elisions/contractions: [list]. No filler.
- Respect <LANGUAGE> stress: [rule]. Read aloud in rhythm.
- Open vowels on sustained/belted notes: [examples].
- Keep the hook's exact rhythmic slot; chorus arrives on the same bar.
- Rhyme is OPTIONAL and last; prefer recasting the OTHER line of a couplet over
  cramming a bad word. Rhyme stance for <LANGUAGE>: [force / don't-force end-rhyme].
- Reach for the native poetic device (§1A) where it fits.
- Diacritics mandatory where used (TTS/Suno pronounce from text): [list].
- **Euphony / accidental-obscenity screen:** sing the line aloud (slurred, as an AI
  vocal would) and check that blurred syllables don't form a vulgar, comic, or
  sacred-taboo word. Fix any cross-linguistic false friend.

## 5. IDIOMS, IMAGERY & CULTURAL FIT
- Translate the sense, not the words → native idioms.
- Keep concrete sensory anchors (bathroom floor at 3 AM, cage door, wedding feast),
  rendered vividly. Localize culture-bound daily-life anchors (carpool line, diner,
  prom, credit-card debt) to emotionally equivalent native scenes; do NOT localize
  away the global/heaven imagery (every-tribe, throne, Lamb, wedding feast).

## 6. WHAT STAYS IN ENGLISH (never translate) + STYLE METADATA RULE
- Suno section tags & production cues in [brackets] — never sung; leave exactly.
- **The `Style` / `Styles:` metadata block STAYS IN ENGLISH** (it is Suno production
  direction, not sung). Update it — in English — for the target-language production:
  (a) add "<LANGUAGE>-language vocal" near the front; (b) keep BPM/key/instruments/
  mood anchors; (c) fold in the addictiveness tuning from §10 (hook-forward, groove
  pocket/BPM, ear-candy, dynamic-arc, culturally resonant instrumentation from §1A).
  Translate nothing inside this block — only its English direction changes.
- The coined hook + spelling-chant (§3).
- Metadata footers (VOCAL GENDER, ratings, Song Title, Save To) — keep structure;
  Song Title lines use the <LANGUAGE> title (track-number prefix kept).

## 7. FILE, CODE & TITLE CONVENTIONS
- Album code: swap suffix EN → <CODE-UPPER> (JEIM1069EN → JEIM1069<CODE-UPPER>).
- Folder mirrors the EN album with the new code.
- Lyrics filename keeps the persona/artist brand in English; album title in <LANGUAGE>.
- Song titles → <LANGUAGE>, each with its 2-digit track-number prefix.
- Album title → native <LANGUAGE> UNLESS it IS the coined brand hook (then keep it);
  document the choice in the changelog. ≤30 chars, unique.
- `Save To:` = the <LANGUAGE> album title.
- Changelog/header note: this is the <CODE> translation of <EN code>, the divine-name
  convention, the coined-hook policy, and the worldview frame chosen (§1A).

## 8. QA CHECKLIST (run before delivering any <LANGUAGE> album)
- [ ] Sing-through: every line fits melody/meter; no rushed/padded bars.
- [ ] Syllable check on hook + chorus vs EN (±1; hook exact).
- [ ] Diacritics complete in sung text AND titles.
- [ ] Divine-name consistency; §2 glossary honored; Son-of-God intact.
- [ ] Scripture echoes match [standard Bible].
- [ ] Non-offense pass — no vulgar/slang; reverent address + correct honorifics; no
      denominational imports; no romantic-pop God-imagery; gospel intact.
- [ ] **Cultural-resonance pass (§1A)** — leads with the right worldview frame; every
      image checked against the taboo list; native ache word used; charged vocabulary
      cleared.
- [ ] Coined hook preserved verbatim.
- [ ] `Style` block English-only, updated with "<LANGUAGE>-language vocal" + §10 tuning.
- [ ] No foreign-religion divine name anywhere.
- [ ] **Back-translation + comprehension check** — back-translate the chorus
      independently; a native confirms it says what the EN meant and reads naturally.
- [ ] Drop-the-rhyme test on EVERY line; no nonsense fillers; real words + correct
      grammar; agreement; no stranded tails.
- [ ] Register/loanword check; **euphony pass** (no accidental obscene/comic word).
- [ ] Image consistency; theology-over-rhyme.
- [ ] **NATIVE FAITH-INSIDER SIGN-OFF (hard release gate)** — a believer from the
      right tradition has read it for naturalness and offense and approved it.
- [ ] **Addictiveness re-rating done (§10)** with before/after scores and report.
- [ ] Naturalness — a native reads it as original songwriting, not a translation.

## 9. WORKED EXAMPLE (chorus)
[Real <LANGUAGE> worked chorus: EN → singable <LANGUAGE>, hook kept, meaning kept,
worldview-frame-appropriate, with a "why it works" note. Then a BAD-vs-GOOD pair: a
forced-rhyme/wrong-frame/taboo-image failure vs the meaning-first, culturally-resonant
fix.]

## 10. ADDICTIVENESS / RE-LISTENABILITY PASS (after the album is produced in <LANGUAGE>)
Once the translated album is generated, do a devoted-fan listen-through and enhance
compulsive re-listenability. **This tunes the English `Style` block (§6) and any
re-generation prompts — it never alters doctrine or the locked translation.**

**Listen in three passes** to each track's sonic fingerprint — lead-vocal timbre,
warmth/brightness of instrumentation, low-end depth, high-end air/shimmer, how the mix
breathes between verse and chorus: pass 1 for the feeling, pass 2 for the craft, pass 3
for the tiny "reach-for-replay" moments. Then identify and amplify:
- **Hook & delivery** — find each song's central melodic/vocal hook; make it arrive
  sooner, sit in the most resonant part of the vocal range, and repeat at the interval
  the brain craves it back. Goal: a phrase hummed involuntarily hours later. (Confirm
  the <LANGUAGE> hook still lands on the same beat as the EN, per §4.)
- **Groove & pulse** — assess kick pattern, snare/clap snap, bass pocket, swing vs
  straight. Tighten so the body responds before the mind decides; dial tempo into the
  head-nod sweet spot (~100–128 BPM) where the genre/style allows.
- **Texture & ear-candy** — catalog small surprises (vocal chop, reversed cymbal,
  filtered sweep, sudden drop to one voice, a harmony that blooms in the last chorus);
  add/sharpen so each listen reveals something new.
- **Dynamic arc & payoff** — trace build, strip-back, swell, release; engineer tension
  so the breakdown feels like held breath and the chorus/drop feels like exhale; make
  the biggest emotional payoff impossible to leave before it lands.
- **Loop point & album flow** — smooth track-to-track transitions so the last bar pulls
  into the next, and shape the closer to loop back to track 1 almost seamlessly.
- **Emotional pull & relatability** — deepen resonance (using §1A's frame and ache
  word) so listeners return for how it makes them feel: seen, lifted, energized,
  understood.

**Re-rate and report.** Score each track and the album BEFORE and AFTER across:
hook strength, groove, replay value, dynamic payoff, emotional pull, loop-ability.
Deliver a clear summary: the specific changes made, WHY each increases compulsive
re-listening, and the measurable effect on the overall addictiveness rating.

---
**Authority:** the project owner holds final approval on all <LANGUAGE> releases. When
uncertain about a denominational or cultural sensitivity, choose the broadest, most
Scripture-plain option and flag it.
```

The shared spine is sections 0, 0A, 4–6, 8, 10 (and the structure of 9). The
**per-language gold** is §0A's real examples, §1, §1A, §2, §3, §4's craft notes, and
§9's real worked example. A file with empty/placeholder versions of those is NOT done.

---

## STEP 4 — Produce the files

1. Create `/.prompts/`.
2. Render the template per language with all Step-2 research; write
   `/.prompts/translate_<LANGUAGE>.md`. **UTF-8** required.
3. Use **`translate_Romanian.md` as the reference build** for structure, depth, tone.
   Reproduce the *kinds* of guidance with each language's real facts — never paste
   Romanian specifics into another language.
4. Treat §0A, §1A, and §9 as **living sections** — seed from research, grow as native
   reviews catch more.
5. Wire in the **native faith-insider review loop**: translate → independent
   back-translation → native comprehension check → native naturalness/offense review →
   sign-off (a hard gate in §8).

---

## STEP 5 — Acceptance criteria (verify before done)

- [ ] Exactly 28 files in `/.prompts/`, named per Step 0, Ukrainian included; Romanian
      matches/refreshes the exemplar.
- [ ] Every file contains sections 0, 0A, 1, **1A**, 2–9, **10**, and the Authority note.
- [ ] §0 carries BOTH laws verbatim: **Meaning-First** and **Contextualize-Never-Syncretize**.
- [ ] **§1A is populated** with the worldview frame, taboo/danger image list, native
      ache word, charged-vocabulary flags, and required reverence/honorific forms.
- [ ] §2 glossary is full, with **connotation notes** on loaded abstracts and an
      explicit **Son-of-God policy**; no foreign-religion divine name.
- [ ] §1 names the real faith-community landscape + standard Bible; defers to receptor
      norms on gender/family.
- [ ] §0A lists **real, language-specific** filler words, calque traps, grammar
      pitfalls, loanword misreads (no Romanian copy-paste; no placeholders).
- [ ] §4 craft notes are language-specific (rhyme stance, native elisions, native
      poetic device) and include the **euphony screen**.
- [ ] Tonal files (zh, th, vi) carry the homophone/tone-melody caveat; ar & he instruct
      vowel diacritics; uk requires authentic Ukrainian (no russisms) and conflict
      sensitivity; gender-agreement languages fix narrator gender first.
- [ ] §6 preserves Suno structure and states the **Style-metadata rule** (English-only,
      "<LANGUAGE>-language vocal" added, §10 tuning folded in); coined hooks verbatim.
- [ ] §7 conventions present (EN → <CODE> suffix swap, titles, changelog incl. frame).
- [ ] §8 includes the **native faith-insider sign-off** and **back-translation/
      comprehension** gates.
- [ ] §9 has a real worked chorus + a BAD-vs-GOOD pair in that language.
- [ ] **§10 addictiveness protocol** present, with the before/after re-rating and report
      requirement, and tied to updating the English `Style` block (not the doctrine).
- [ ] Non-Latin scripts render correctly (UTF-8); endonyms in native script.

---

## Notes for the developer

- **Linguistic accuracy ≠ cultural acceptability.** §1A and the worldview frame are the
  point of this revision: the same true doctrine, delivered through the images and
  emotional entry point that actually resonate with believers in that culture, without
  tripping a taboo. Lead with the frame; check every image against the danger list.
- **The native faith-insider is your best instrument.** No glossary catches a
  technically-correct line that sounds like a pop love song, a "grace" word that means
  "luck," or a phrase that echoes a folk-religion chant. Make the sign-off a real gate.
- **`Style` stays English; the music gets localized through §6 + §10.** Suno has no
  language dropdown — language comes from the lyrics plus the English `Style` block,
  which is why that block adds the "<LANGUAGE>-language vocal" tag and the §10
  addictiveness tuning while remaining in English and keeping full diacritics in the
  sung text.
- **Addictiveness serves the message.** §10's hook/groove/ear-candy/dynamic/loop work
  exists so believers come back — never at the cost of §0's two laws.
- **The exemplar is the bar, not a shortcut.** Copying Romanian specifics into another
  language is a defect; reproduce the depth with real per-language facts.
- **Extending later:** add a language row + per-language data entry, then regenerate.
  Keep 0/0A/4–6/8/10 as the spine; grow §0A, §1A, §9 as reviews surface new catches.
