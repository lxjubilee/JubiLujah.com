# Jubilee Music — Romanian (RO) Translation · THE LEARNED-LESSONS LEDGER

<!-- Endonym: Limba Română · Binding addendum to translate_Romanian.md -->

**What this is.** Every correction a **native Romanian** has made to an AI-produced lyric line,
kept with its **before**, its **after**, and — the part that actually matters — the **why**.
This is the house's own body of learned Romanian, built one real correction at a time. It is
not a style guide someone wrote from theory. It is a record of where we were wrong and what a
native actually heard.

**Why it exists.** An AI is fluent in Romanian and fluency is not accuracy. The model produces
lines that parse, scan, rhyme, and are quietly wrong — and it has no internal signal telling it
so, because nothing feels wrong. The native reviewer is the only ground truth. This file is
where that ground truth is kept so it is never learned twice.

**Authority.** Binding addendum to `translate_Romanian.md`. Where a lesson here conflicts with a
general rule in the engine, **the lesson governs** — it came from a real native correction and
the engine's general rule did not. Where it conflicts with LAW #1 (Meaning-First) or LAW #2
(Contextualize-Never-Syncretize), those laws govern and the lesson is re-examined.

---

## HOW THIS FILE IS USED (mandatory)

**Read the INDEX before you translate a single line. Open the full entry before you render a
contested word, image, or rhyme.** Index first, content second — never open the whole file to
find out whether something is in it.

Three moments where it is not optional:

1. **Before drafting** — scan the index; hold the categories in view as you write.
2. **When you reach for a rhyme, an idiom, a loanword, or a cultural image** — search here first.
3. **In QA (engine §8)** — every line is checked against this ledger, by category.

**A lesson learned in one song governs every song after it.** That is the entire point.

---

## THE INTAKE PROTOCOL — how a correction becomes a lesson

**What the Founder (or a native reviewer) hands over — a pair:**

| # | Field | Required? |
|---|---|---|
| 1 | **EN source line** (or song code + section, e.g. `JEIM1069RO` · Chorus) | strongly preferred |
| 2 | **❌ BEFORE** — the line exactly as the AI produced it | **required** |
| 3 | **✅ AFTER** — the line exactly as the native corrected it | **required** |
| 4 | **Who corrected it** — the native reviewer's name | **required** |
| 5 | Their own note on why, if they gave one | optional |

A pair with no named corrector is logged as **unattributed** and never promoted to a rule.
*The one who benefits from a claim never verifies it* — the AI does not get to confirm its own
Romanian.

**What I do with it, in order:**

1. **Log the pair verbatim.** Before and after are recorded exactly as given, diacritics intact.
   The before-line is never tidied and never quietly improved — the mistake is the evidence.
2. **Establish the why.** Research the actual grammatical, idiomatic, register, doctrinal, or
   cultural fact behind the correction. Name it plainly.
3. **🔴 If the why cannot be established, say so.** The entry is logged with
   **`Why: not yet established`** and marked **DO NOT GENERALIZE**. An invented rationale is
   worse than no rationale — it propagates a guess across the whole catalog as if it were law.
   A pair with an honest blank is useful. A pair with a fabricated reason is a liability.
4. **Extract the generalization** — the rule that applies to lines we have not written yet, and
   the boundary of that rule (where it does *not* apply).
5. **Reconcile.** Does it refine, contradict, or supersede an existing lesson? Contradictions are
   surfaced to the Founder, never silently resolved.
6. **Assign the ID, update the index, set the status.**
7. **Flag propagation** — does this belong in the engine as a standing rule, and does it belong
   in `BUILD_TRANSLATION_PROMPTS.md` for the other 27 languages?

**The promotion ladder — a data point is not a law:**

| Status | Meaning |
|---|---|
| **`logged`** | The pair is recorded. The why may or may not be established. Not yet a rule. |
| **`confirmed`** | The native reviewer has affirmed that the correction **generalizes** — it is not a one-line preference. |
| **`promoted`** | Folded into `translate_Romanian.md` as a standing rule. The ledger keeps the evidence. |
| **`superseded`** | A later lesson overturned it. **The old entry stays** — a deleted mistake becomes a fabricated certainty. |

**Nothing is deleted from this file.** A correction to a lesson is a new entry that supersedes
the old one, and the old one remains with a pointer forward.

**Engine rules vs. lessons — keep the line clean.** `translate_Romanian.md` holds the *rules*.
This file holds *corrections that actually happened*, each with its pair. If an entry has no
real before/after from a real reviewer, it belongs in the engine, not here.

---

## THE INDEX — scan this first

| ID | Category | The rule in one line | Status |
|---|---|---|---|
| [RO-L001](#ro-l001) | Rhyme filler | A line-final word that exists only to rhyme is cut, and the line is recast meaning-first. | promoted |
| [RO-L002](#ro-l002) | Real words / verb forms | Every word must be real Romanian; the subjunctive after *să* must take the subjunctive form. | promoted |
| [RO-L003](#ro-l003) | Prepositions & idioms | Prepositions and set phrases are memorized, never derived from English. | promoted |
| [RO-L004](#ro-l004) | Calque imagery | English image-grammar (into a ceiling, on the line to heaven, hyphen-compounds) does not survive translation. | promoted |
| [RO-L005](#ro-l005) | Loanword register | A loanword's *first* meaning in Romanian governs — not its English one. | promoted |
| [RO-L006](#ro-l006) | Gender agreement | Narrator gender is fixed before the first line; every self-referential adjective agrees. | promoted |
| [RO-L007](#ro-l007) | Stranded tails | Every word needs a grammatical home; no genitive left attached to nothing. | promoted |
| [RO-L008](#ro-l008) | Image consistency | No image is appended that contradicts the scene or has no antecedent in it. | promoted |
| [RO-L009](#ro-l009) | Theology over rhyme | A rhyme word never becomes the subject of a doctrinal claim. | promoted |
| [RO-L010](#ro-l010) | Cultural taboo | "Dancing" reads *fleshly* to conservative Orthodox ears; reverent-joy verbs carry it instead. | promoted |
| [RO-L011](#ro-l011) | Vocative case | Addressing Jesus is **Isuse**, not *Isus*. Romanian has a true vocative and it is not optional. | confirmed |
| [RO-L012](#ro-l012) | Relative pronoun | A direct-object relative is **pe care**, never *ce*. The meter does not get to shorten a pronoun. | confirmed |
| [RO-L013](#ro-l013) | Over-elision | 🔴 Elide only where Romanian speech actually elides. Manufactured elisions are the single largest error source — **and the engine told the model to make them.** | confirmed |
| [RO-L014](#ro-l014) | Punctuation | Commas before subordinate clauses, appositions and vocatives are grammar, not decoration — and Suno phrases from them. | confirmed |
| [RO-L015](#ro-l015) | Possessives | Postposed *fața Ta*, not preposed *a Ta față*; **Său/Sale** when the possessor is the subject. | confirmed |
| [RO-L016](#ro-l016) | Scripture echo | A psalm paraphrased is a psalm lost. Echo Cornilescu word-for-word where the line quotes Scripture. | confirmed |
| [RO-L017](#ro-l017) | Doctrine | 🔴 The rhyme rewrote the claim — a negation flipped, and the Father was made incarnate. | confirmed |
| [RO-L018](#ro-l018) | Double localization | A source album already saturated in another culture's idiom must cross **two** cultures, not one. | confirmed |
| [RO-L019](#ro-l019) | Truncation for meter | Words clipped or invented to fit a bar: *niciodat'*, *cu măsur*, *aleargă-ndatăl*. | confirmed |
| [RO-L020](#ro-l020) | Diacritics in titles | Titles and filenames carry full diacritics. Ours shipped bare. | confirmed |

**Open questions awaiting a native ruling:** [Q1 — the `-î` artifact](#q1) · [Q2 — three suspected reviewer slips](#q2)
**Superseded:** none yet.

---

## SOURCE · Review 1 — Amir Inspire, two albums (2026-08-25)

| | AMIM1034RO | AMIM1036RO |
|---|---|---|
| Album | *Alergând Acasă la Tatăl* | *Nouă-n Fiecare Dimineață* |
| Tracks reviewed | 12 | 12 |
| Sung lines | 378 | 359 |
| **Corrections** | **151** | **179** |
| Rewritten / cut | 134 / 17 | 159 / 20 |
| Share of song touched | **40%** | **50%** |
| Tracks untouched | 2 (T02, T06) | 0 |
| Correction style | mixed: whole-song, section-scoped, and silent inline | whole-song rewrite on all 12 |

**330 corrections across 737 sung lines — 45% of everything we shipped.** Entries RO-L011
through RO-L020 are drawn from this review. Method and pair-by-pair evidence:
`cornell/fixes/` and the correction corpus filed beside it.

**Questionnaire 01** went back with these findings —
`cornell/questionnaire/Questionnaire 01 - Romanian Translation Rules.docx`. Nine sections, 45
questions, every one with an *Other* line. Sections A and B are blocking: they hold [Q1](#q1),
[Q2](#q2), and the ruling that decides how the whole catalogue handles the syllable problem.

---

## ROUND 2 — Caleb Inspire, two albums (sent 2026-08-26)

**The loop turns here.** Two albums revised *before* the reviewer sees them, with every confirmed
lesson applied, so his time goes to what we still cannot hear rather than to correcting the same
mistake a third time.

| | CAIM1014RO | CAIM1035RO |
|---|---|---|
| Album | *Nădejdea Învierii* | *Harul Care M-a Găsit* |
| Tracks | 12 | 12 |
| **Lines revised** | **143** | **165** |
| Of which, hand-rewritten | 70 | 101 |
| Sent as | `cornell/round-2/…(R2).docx` | `cornell/round-2/…(R2).docx` |

**308 lines revised across 24 songs.** What was applied: RO-L012 (relative pronoun — the largest
category again), RO-L013 (contractions unwound), RO-L014 (punctuation), RO-L019 (truncations and
invented forms), RO-L020 (three song titles), and one RO-L017 doctrinal fix — the album had Yeshua
raising **Himself** in the reflexive (*nu Te-ai înviat* → *n-ai înviat*).

**What was deliberately NOT touched, and why it matters.** Fourteen lines per album quote or echo
Scripture or a hymn. **We have no Romanian Bible in the workspace**, and RO-L016's own discipline
forbids writing Scripture from memory — so every one of them was left exactly as it stood and
listed for the reviewer in the document's cover note. A flagged line is honest. A remembered
psalm is not.

**The measure to watch.** Review 1 came back at **45%** of sung lines corrected. If Round 2 comes
back materially lower, the ledger is doing its work; if it does not, the rules are wrong and this
file is what gets corrected, not the reviewer.

---

# THE LESSONS

Each entry: **the pair · why · how it generalizes · status.**

---

<a id="ro-l001"></a>
## RO-L001 · Rhyme-filler nouns at line end
**Category:** Rhyme filler · **Logged:** 2026-08-25 (back-filled from the first native review) ·
**Corrector:** native review, pre-ledger · **Status:** `promoted` → engine §0A.1

**❌ BEFORE (AI) — every one of these shipped and had to be pulled:**

| Filler that shipped | What it actually means | Why it was there |
|---|---|---|
| **livadă** | orchard | rhyme only |
| **tumul** | a burial mound | rhyme only |
| **sub ceață** | under fog | rhyme only |
| **n-are saț** | has no satiety | rhyme only |
| **fără bani** | without money — *in a heaven climax* | rhyme only |
| **văpaie / o văpaie** | a blaze — *beside a cold floor* | rhyme only |
| **feerie** | secular fairy-tale word — *in a Gospel line* | rhyme only |
| **fărâmie** | not a real word | rhyme only |
| **comori** | treasures, dangling | rhyme only |
| **bătătură** | farmyard | rhyme only |
| **semnături-mplinite** | fulfilled signatures | rhyme only |

**✅ AFTER:** each line recast meaning-first, with the rhyme dropped where a real word would not
come. See RO-L009 for the paired doctrinal fix on the same lines.

**Why.** Romanian rhymes richly and easily — which is precisely the trap. The model finds a
rhyme first and reverse-engineers a sentence to reach it, and because the result scans and the
word is (usually) real, nothing in the output signals failure. A native does not hear a clever
rhyme. A native hears a sentence that ends in a word nobody would say, and concludes instantly
that a machine wrote it. **"Fără bani" in a heaven climax is the clearest case:** grammatical,
rhyming, and theologically embarrassing.

**Generalizes.** Run the **drop-the-rhyme test on every line**: silently delete the final rhyme
word. Does the rest still say something true and natural? Is that final word one you would
actually use in that sentence? If no — the line is forced. Recast it, and prefer recasting the
**other** line of the couplet to a new sensible rhyme-word over cramming this one.
**Boundary:** rhyme is not banned. Romanian rhyme that arrives with words that genuinely belong
in the line is welcome and native. The rule is against *reaching*.

---

<a id="ro-l002"></a>
## RO-L002 · Invented words and wrong verb forms
**Category:** Real words / verb forms · **Logged:** 2026-08-25 (back-filled) ·
**Corrector:** native review, pre-ledger · **Status:** `promoted` → engine §0A.2

| ❌ BEFORE (AI) | ✅ AFTER | What was wrong |
|---|---|---|
| **amânți** | *amâna / amâni* | not a word |
| **să prinde** | **să prindă** | indicative used after *să* |
| **se string** | **se strâng** | English-looking non-word |
| **unde stea** | **să stea** | wrong mood |

**Why.** Two distinct failures wearing the same coat. First, the model will **manufacture
morphology** when it needs a shape it does not have — *amânți* and *se string* are English
spelling-instincts pushed through a Romanian stem. Second, the **subjunctive after *să*** is a
real form, not an indicative with *să* in front of it: *să prindă*, *să stea*, *să vină*,
*să fie*. Romanian marks it and a native cannot un-hear it missing.

**Generalizes.** Every word in a delivered line must be a word you can point to in a Romanian
dictionary. Every *să* is followed by a checked subjunctive. **Never invent a form to fit a
meter** — recast the line instead.

---

<a id="ro-l003"></a>
## RO-L003 · Prepositions and set phrases — no calques
**Category:** Prepositions & idioms · **Logged:** 2026-08-25 (back-filled) ·
**Corrector:** native review, pre-ledger · **Status:** `promoted` → engine §0A.3

| ❌ BEFORE (AI) | ✅ AFTER | What was wrong |
|---|---|---|
| *prea mare **de** galaxii* | *prea mare **pentru** galaxii* | wrong preposition |
| *motivul **că** […]* | *de-aceea / motivul pentru care* | Anglicism, "the reason that" |
| *izvorul nu **se-apucă*** | *izvorul nu **se usucă*** | means "doesn't grab" — nonsense; the real idiom is "doesn't run dry" |

**Why.** Prepositions and idioms are **memorized, not derived.** There is no rule that gets you
from English *too big for* to Romanian *pentru*; you either know it or you calque it. The
*se-apucă* case is the most instructive of the three — the model reached for an idiom-shaped
phrase, produced something that is real Romanian and means something completely different, and
the line stayed grammatical the whole way down. Grammaticality is not a check on this failure.

**Generalizes.** Verify **every** preposition and **every** set phrase against how a native
actually says it. If you cannot confirm the idiom, do not use an idiom — say the thing plainly.
A plain true line beats an idiom you half-remember.

---

<a id="ro-l004"></a>
## RO-L004 · English-calque images and tech metaphors
**Category:** Calque imagery · **Logged:** 2026-08-25 (back-filled) ·
**Corrector:** native review, pre-ledger · **Status:** `promoted` → engine §0A.4

| ❌ BEFORE (AI) | ✅ AFTER | What a Romanian hears |
|---|---|---|
| *Plângeam **într-un** tavan* | *Strigam spre-un tavan gol* | "cried *into* a ceiling" |
| *pe **linia** spre cer* | *pe care-l trimitem spre cer* | a **telephone** line to heaven |
| *"nu-pot"-ul* | *orice "nu pot"* | an English nominalization, "the I-can't" |
| *prăjituri-după-tunet*, *răspuns-în-întuneric* | de-hyphenated into a natural clause | English hyphen-stacking; Romanian does not build compounds this way |

**Why.** English builds images with prepositions and hyphens that Romanian builds with clauses.
The picture survives the translation; the **grammar of the picture** does not. *Pe linia spre
cer* is the sharpest example: in English "on the line to heaven" is a faint telephone metaphor
and mostly reads as *route*; in Romanian *linia* lands on the telephone first, and the worship
line acquires a switchboard.

**Generalizes.** Translate the **image**, then build it with Romanian's own grammar. If the
English image depends on an English preposition or a stacked compound, it needs a new
construction, not a new word. Never carry a hyphen-compound across.

---

<a id="ro-l005"></a>
## RO-L005 · Loanwords and register that misread in Romanian
**Category:** Loanword register · **Logged:** 2026-08-25 (back-filled) ·
**Corrector:** native review, pre-ledger · **Status:** `promoted` → engine §0A.5

| ❌ BEFORE (AI) | ✅ AFTER | What a Romanian hears |
|---|---|---|
| *Ringul cerului* | *podea / pistă de dans* | **ring** in Romanian is a **boxing ring** first — "heaven's boxing ring" |
| *public* (for "audience", in a throne-room line) | *ascultător* | reads like a concert review |
| *mandarină* (for the language) | *chineza* | the **fruit** — a tangerine |
| *mișto, nașpa* | cut entirely | street slang in a reverent line |

**Why.** A loanword does not import its English sense-ranking. **The word's first meaning in
Romanian governs**, and for *ring* that meaning is a boxing ring — the sacred line becomes
comic instantly and irreversibly. Register is the same failure at a different level: *public*
is a real word for audience and it drags a secular performance frame into a throne room.

**Generalizes.** For every loanword and every borrowed-looking word, ask what a Romanian hears
**first** — not what it can also mean. If the first meaning is wrong, comic, or secular, use the
native word. Never allow slang into a reverent line, in any register, for any reason.

---

<a id="ro-l006"></a>
## RO-L006 · Line-end adjective agreement — and narrator gender first
**Category:** Gender agreement · **Logged:** 2026-08-25 (back-filled) ·
**Corrector:** native review, pre-ledger · **Status:** `promoted` → engine §0A.6, §4

**❌ BEFORE:** *a alergat la tine, **ne-nvinsă*** — a **feminine** adjective describing **Tatăl**
(masculine).
**✅ AFTER:** **neînvins** — and the rhyme partner was rewritten, not the grammar.

**Why.** Romanian inflects adjectives and participles for gender and number, so the rhyme
position — the most contested slot in the line — is also the slot most likely to break
agreement. The model picks the word that rhymes and takes whatever ending comes with it. A
native hears the mismatch before they hear the meaning; on a self-referential line it is the
single most jarring error in the language.

**Generalizes.** Two rules, in this order. **(1) Fix narrator gender before the first line is
written** — decide the singer's gender (or commit to neutral) and make every self-referential
adjective agree throughout: *obosit/obosită, pierdut/pierdută, mântuit/mântuită*. **(2) When a
line-end adjective breaks agreement, fix the rhyme, never the grammar.** Changing the ending to
save a rhyme is how the error shipped in the first place.

---

<a id="ro-l007"></a>
## RO-L007 · Grammatically stranded tails
**Category:** Stranded tails · **Logged:** 2026-08-25 (back-filled) ·
**Corrector:** native review, pre-ledger · **Status:** `promoted` → engine §0A.7

**❌ BEFORE:** *veșnicia sună-n cer, **a cântului*** — a genitive attached to nothing.
**✅ AFTER:** recast so every word has a grammatical home.

**Why.** Romanian's case-marking makes a dangling genitive audible in a way English's *of*-phrase
is not. The model appended a poetic-sounding tail for meter and left it governing no noun. It
reads as an unfinished thought, not as a flourish.

**Generalizes.** Every word in the line must attach to something. Read the line and name what
each phrase modifies; if a phrase modifies nothing, it is not ornament — it is debris. Recast.

---

<a id="ro-l008"></a>
## RO-L008 · Internal image consistency
**Category:** Image consistency · **Logged:** 2026-08-25 (back-filled) ·
**Corrector:** native review, pre-ledger · **Status:** `promoted` → engine §0A.8

| ❌ BEFORE (AI) | ✅ AFTER | What broke |
|---|---|---|
| cold bathroom tile + *o **văpaie*** ("a blaze") | image cut, line recast | the appended image contradicts the scene |
| *"before the **flower** came"* | *zorii* (the dawn) | no flower exists anywhere in the song |

**Why.** Both are RO-L001 (rhyme filler) arriving as *pictures* rather than as nouns, which makes
them harder to catch — a blaze is evocative, so it survives a read-through that a farmyard would
not. But the verse had already established a cold floor, and a song cannot be cold and ablaze in
the same breath. The "flower" case is worse: it introduces an object with no antecedent, and the
listener spends the next line looking for it.

**Generalizes.** Every image must be **already present in the verse or newly and deliberately
introduced.** Before adding an image, name the one already on the page and check they can
coexist. When you need a picture for the meter, reach for the picture the verse already gave you
— the dawn was right there.

---

<a id="ro-l009"></a>
## RO-L009 · Theology is never bent to reach a rhyme
**Category:** Theology over rhyme · **Logged:** 2026-08-25 (back-filled) ·
**Corrector:** native review, pre-ledger · **Status:** `promoted` → engine §0A.9

| ❌ BEFORE (AI) | ✅ AFTER | The doctrine that broke |
|---|---|---|
| ***războiul** ne-a dat har* | ***Isus** ne-a dat har* | "the war gave us grace" — grace comes from Christ |
| *sfințenia nu **poposește*** | *slava nu **contenește*** | reads "holiness never settles" — backwards |
| *noroc / coincidență* left standing | predicated explicitly to *Tatăl* | luck/chance made sovereign |

**Why.** **This is the most serious category in the ledger and the least likely to be caught by a
native fluency check** — every one of these lines is natural, singable Romanian. Nothing is
wrong with the language. What is wrong is the claim. The rhyme word arrived first and quietly
became the **subject** of a doctrinal sentence, and *war* became the giver of grace.

And a song does not persuade — it **installs**. It goes around the argument and writes straight
to memory. A slightly-wrong line in a good melody will be sung correctly, from memory, for
decades, by people who trusted us.

**Generalizes.** After the language check, run a separate **claim check**: state each line's
proposition in flat prose and ask whether it is true. Watch the **subject** of every sentence the
rhyme built — that is where the error hides. Grace, salvation, victory, and holiness have one
source, and the meter does not get a vote. Luck and chance are always subordinated to the
Father, explicitly, in the line itself.

---

<a id="ro-l010"></a>
## RO-L010 · "Dancing" reads as *fleshly* — use reverent-joy verbs
**Category:** Cultural taboo · **Logged:** 2026-08-25 (back-filled) ·
**Corrector:** native review, pre-ledger · **Status:** `promoted` → engine §1A, §9

**EN source:** *Jesus is the reason we are dancing now!* (Jubilujah, T1 chorus)
**❌ BEFORE:** *Isus e motivul **că** noi **dansăm** acum!* — two errors in one line (see also RO-L003).
**✅ AFTER:** *Isus e motivul, **de-aceea ne bucurăm** acum!*

**Why.** To conservative Orthodox ears, exuberant dancing carries the association of the
discotheque and the secular party — *trupesc / lumesc*, fleshly and worldly — not of worship.
Romania's worship temperature is **reverent, contemplative, and deeply marked by lament**; the
*doină* is in the culture's bones. Joy is real and it is expressed with dignity. Under-do
exuberance rather than over-do it.

**Generalizes.** Where the EN says *dance*, reach first for the reverent-joy verbs —
*ne bucurăm, tresăltăm de bucurie, înălțăm laude, cântăm*. **Boundary:** literal *dansăm* is
permitted on a clearly celebratory neo-Protestant album — and when it is kept, **say so and say
why** in the album changelog. This is contextualization of form (LAW #2), never a softening of
content: the celebration survives in full.

**The wider principle this case teaches:** the *taboo map* in engine §1A is not decoration. An
image can be doctrinally perfect, grammatically flawless, and still close a Romanian listener's
heart in one bar.

---

<a id="ro-l011"></a>
## RO-L011 · The vocative — you address Him as *Isuse*
**Category:** Vocative case · **Logged:** 2026-08-25 · **Source:** Review 1 (AMIM1034RO, AMIM1036RO) ·
**Occurrences:** 14 · **Status:** `confirmed` — engine §2 glossary defect

| ❌ BEFORE (AI) | ✅ AFTER |
|---|---|
| **Isus**, am luat ce mi-ai dat și-am zis că-i al meu, | **Isuse**, am luat ce mi-ai dat… |
| **Isus**, sunt departe de curtea Ta-nsorată, | **Isuse**, sunt departe… |
| **Isus**, eu merg, dar nu singur pe calea aceasta, | **Isuse**, nu merg singur… |
| îndurare, îndurare, **Isus**, e tot ce strâng. | …**Isuse**, e tot ce strâng. |
| **Isus**, haina și inelul, | **Isuse**, haina și inelul, |

**Why.** Romanian has a live vocative case, and for *Isus* it is **Isuse**. Using the nominative
to address someone is not a stylistic softness — it is the wrong case, and in a prayer line it is
the most conspicuous place to get a case wrong. The engine's own §2 glossary caused this: it
listed *the Lord → Domnul / (address) Doamne* but gave **Jesus → Isus** with **no vocative at
all**, so the model had a form for addressing the Lord and none for addressing Jesus.

**Generalizes.** **Direct address → `Isuse`. Reference → `Isus`.**
*Isuse, du-mă acasă* (address) vs. *mila lui Isus e nouă* (reference). The same discipline applies
to every name that can be addressed: *Tată* (address) vs. *Tatăl* (reference); *Doamne* vs.
*Domnul*. Note the paired correction in Review 1: *Doamne-al meu* → **Domnul meu** — the vocative
was used where the referential form belonged, the same error running the other direction.
**The glossary must carry the vocative for every addressable divine name, or this recurs.**

---

<a id="ro-l012"></a>
## RO-L012 · The relative pronoun — *ce* is not *pe care*
**Category:** Relative pronoun · **Logged:** 2026-08-25 · **Source:** Review 1 ·
**Occurrences:** 29 (the second-largest category) · **Status:** `confirmed`

| ❌ BEFORE (AI) | ✅ AFTER |
|---|---|
| forma **ce** n-o văzusem în anii de praf — | forma **pe care** n-o văzusem… |
| proaspătă ca pâinea caldă **ce**-o frâng acum în mâini. | …**pe care**-o frâng acum în mâini. |
| Îmi amintesc de masa **ce**-a-ntins-o când eram gol, | …masa **pe care** mi-a întins-o… |
| Isus e zorii **ce**-i așteptam jelind, | Isus e zorii **pe care**-i așteptam plângând, |
| și Cel **ce**-L așteptam a pășit blând afară din noapte. | și Cel **pe care**-L așteptam… |
| crucea **ce**-a purtat-o și biruința **ce**-a câștigat-o. | crucea **pe care** a purtat-o și biruința **pe care** a câștigat-o. |
| Fiecare bob de șofran al anilor **ce** i-am umblat, | …al anilor **pe care** i-am umblat, |

**Why — and this is the diagnosis, not the symptom.** *Ce* is **one syllable**; *pe care* is
**three**. The model was under an explicit instruction to compress Romanian into English
syllable counts (engine §4), and the relative pronoun is the cheapest thing in the sentence to
shorten. So it shortened it — everywhere — and produced a construction that is not Romanian.
When the relative is the **direct object** of its clause, Romanian requires **pe care** with the
resumptive clitic (*pâinea pe care o frâng*). *Ce* survives only in fixed and elevated
subject-position uses (*Cel ce nicicând nu doarme* — correct, and the reviewer left it standing).

**Generalizes.** Decide the relative by **grammar first, syllables never.** Direct object →
*pe care* + clitic. Subject → *care*, or *ce* in the elevated register. If the correct pronoun
does not fit the bar, **the line's syllable budget is wrong — recast the line**, exactly as
RO-L001 says for rhyme. A pronoun is not a place to save room.

---

<a id="ro-l013"></a>
## RO-L013 · 🔴 Over-elision — the engine's own compression rule was the largest single source of error
**Category:** Over-elision · **Logged:** 2026-08-25 · **Source:** Review 1 ·
**Occurrences:** ~93 of 293 substitutions (~32%) · **Status:** `confirmed` — **engine §4 must be amended**

| ❌ BEFORE (AI) | ✅ AFTER |
|---|---|
| și mila lui Isus **s-a-nălțat** ca flacăra de zori. | …**s-a înălțat** ca flacăra zorilor. |
| Dar cenușiul **a-nceput** să crape… | Dar cenușiul **a început** să crape… |
| **am-nvățat** ce roșcovele lumii nu țin **niciodat'**. | **am învățat** ce roșcovele lumii nu țin **niciodată**. |
| Vântul pustiei **se-ntorcea** și **dunele-ncet** se mutau, | Vântul pustiei **se întorcea**… |
| **Așteptarea n-a fost-n zadar**, vegherea n-a fost deșartă, | Așteptarea **n-a fost în zadar**, **veghea** n-a fost deșartă, |
| **Și-mi voi ridica mâinile-nainte** de-a ridica apa, | …**mâinile înainte** de-a ridica apa, |
| Doamne, masa cea **lungă-i deschisă-n prag**. | Doamne, masa cea **lungă e deschisă în prag**. |

**Why.** Engine §4 reads: *"Romanian words are often longer than English. Compress with natural
elisions and contractions."* The model obeyed — and could not tell the difference between the
elisions Romanian **actually makes in speech** (*nu-i, mi-e, s-a, într-o, ți-a, ne-a*) and
elisions it **manufactured to save a beat** (*s-a-nălțat, a-nceput, am-nvățat, fost-n, lungă-i
deschisă-n*). Every syllable it saved, it took out of a word's own body. A native reads these as
mangled, not as folk-poetic — and a TTS or Suno vocal will sing them mangled too, which is the
whole reason the diacritics rule exists.

**This is the most important entry in the ledger so far, because the engine caused it.** Roughly
one in three corrections in Review 1 was unwinding an instruction we gave the model.

**Generalizes.**
- **Permitted** — the closed set Romanian singers actually use: *nu-i, mi-e, s-a, m-ai, ne-a,
  ți-a, într-o, de-al, să-i,* and the standard *S-a-mplinit* type on a genuinely set phrase.
- **Forbidden** — clipping the initial *î-* off a verb or adverb to gain a syllable
  (*înălțat, început, învățat, întors, înainte, închide, îndoaie* keep their *î*), truncating a
  word (*niciodat'*, *cu măsur*), or hyphen-welding two words that are not a contraction
  (*lungă-i deschisă-n*, *fost-n*, *dunele-ncet*).
- **When the syllables do not fit, the line is too long. Recast the line.** Same law as RO-L001
  and RO-L012 — the meter never gets to damage a word.

> **See [Q1](#q1).** The reviewer's un-elision produced 14 lines carrying `-î` after a hyphen
> (*se-întinde*, *mi-a-întors*, *n-a-împrumutat-o*). That is not standard orthography and looks
> like a mechanical `-n` → `-în` replacement. **The direction is confirmed; the spelling is
> not.** Do not copy the `-î` form until the reviewer rules.

---

<a id="ro-l014"></a>
## RO-L014 · Punctuation is grammar, and Suno sings from it
**Category:** Punctuation · **Logged:** 2026-08-25 · **Source:** Review 1 ·
**Occurrences:** 16 corrections that changed **nothing but punctuation** · **Status:** `confirmed`

| ❌ BEFORE (AI) | ✅ AFTER |
|---|---|
| Stăteam printre porci **unde** valea seacă-i, | Stăteam printre porci**,** unde valea era seacă, |
| prin arșiță și praf **unde** curmalii se-nalță — | prin arșiță și praf**,** unde curmalii se-nalță — |
| mare e credincioșia Ta **azi** și mâine. | mare e credincioșia Ta**,** azi și mâine. |
| N-aveam nimic în noapte **decât** o șoaptă-a Numelui — | N-aveam nimic în noapte**,** decât o șoaptă a Numelui — |
| Și-acolo **la marginea** șirului de măslini | Și-acolo**,** la marginea șirului de măslini**,** |
| a fost căldura Mântuitorului**,** e mila ce-o cunosc. | a fost căldura Mântuitorului **—** e mila pe care-o cunosc. |

**Why.** Romanian marks subordinate clauses, appositions, and vocatives with commas, and a native
reader stumbles without them — the clause boundary lands in the wrong place and has to be
re-read. Sixteen corrections in this review changed **only** punctuation, which means the words
were already right and we still shipped a line that read wrong.

**And it is not only orthography: Suno and TTS phrase from the punctuation.** A missing comma
before a subordinate clause is a missing breath in the vocal. This sits alongside the diacritics
rule (engine §4) for the same reason — the text is a performance instruction, not just prose.

**Generalizes.** Comma before *unde, care, pe care, decât, iar, ci* opening a clause; commas
around appositions and around a vocative (*Doamne, ...*; *..., Isuse, ...*). Em dash where the
second half turns on the first. Punctuate the line as you would punctuate the sentence, then
sing it.

---

<a id="ro-l015"></a>
## RO-L015 · Possessives — postposed, and *Său* when the possessor is the subject
**Category:** Possessives · **Logged:** 2026-08-25 · **Source:** Review 1 ·
**Occurrences:** 6 word-order + 3 *Lui*→*Său* · **Status:** `confirmed`

| ❌ BEFORE (AI) | ✅ AFTER |
|---|---|
| țara e pustie, dar văd **a Ta zâmbire** blândă. | …dar văd **zâmbirea Ta** cea blândă. |
| Tată, **a Ta față**, primirea. | Tată, **fața Ta**, primirea. |
| Datorită marii **Lui** iubiri nu sunt mistuit în pară, | Datorită marii **Sale** iubiri… |
| El a dus în adâncul cel mai adânc **al Lui**. | …adâncul cel mai adânc **al Său**. |
| a acoperit rușinea mea cu aurul **credinței Lui dânsă**. | …cu aurul **credincioșiei Sale**. |

**Why.** Two separate errors that both come from translating English possessive *word order*
rather than Romanian possessive *grammar*.
**(1) Position.** English puts the possessive first (*Your smile*); Romanian's neutral form puts
it after the noun with the definite article on the noun (*zâmbirea Ta*). The preposed *a Ta
zâmbire* is not wrong Romanian — it is **archaic and liturgical**, and used as the default it
makes every line sound like a nineteenth-century hymn translation rather than something written
now. Keep it for deliberate elevation, once, not as the house pattern.
**(2) Reflexive.** When the possessor is the **subject of the clause**, Romanian prefers
**Său/Sa/Sale** over *Lui/Ei*. *Datorită marii Sale iubiri* — the love is His own, and *Sale*
says so. This distinction does not exist in English, so the model has no signal for it.

**Generalizes.** Default to the postposed possessive. Use **Său/Sale** when the possessor is the
clause subject, **Lui** when it is not. And note the third-person marker on the divine pronoun
stays capitalized either way (engine §1A).

---

<a id="ro-l016"></a>
## RO-L016 · A psalm paraphrased is a psalm lost
**Category:** Scripture echo · **Logged:** 2026-08-25 · **Source:** Review 1 (AMIM1036RO T05,
*Sufletul Meu Așteaptă Zorii* — Psalm 130) · **Status:** `confirmed` — engine §1A gate failure

| ❌ BEFORE (AI) | ✅ AFTER | The text |
|---|---|---|
| De-ai lua seama la **țărâna mea**, atunci cine-ar sta-nainte — | De-ai ține seama de **nelegiuirile mele**, atunci cine-ar putea sta înainte — | Ps 130:3 |
| la El e dragostea statornică și **răsplata**-mbelșugată. | la El e dragostea statornică și **răscumpărarea**-îmbelșugată. | Ps 130:7 |
| Doamne, **pleacă-Ți** urechea și m-ascultă… | Doamne, **apleacă-Ți** urechea și ascultă-mă… | Ps 130:2 |

**Why.** The song is Psalm 130 and a Romanian believer knows it by heart in Cornilescu's wording.
*Nelegiuirile* — iniquities — is the whole hinge of verse 3: *if You kept a record of sins, who
could stand?* The model replaced it with *țărâna mea*, "my dust," which is evocative, singable,
and **removes the sin from the verse about sin**. Verse 7 went the same way: *belșug de
răscumpărare*, abundant **redemption**, became *răsplata*, **reward** — a different doctrine,
one syllable cheaper.

**This is not a language failure. It is a QA failure.** Engine §1A and the §8 checklist already
require Scripture echoes to match Cornilescu. Nobody ran the check.

**Generalizes.** **Identify the Scripture before translating the song, not after.** Where a line
quotes or echoes a passage, retrieve Cornilescu's actual wording and carry the load-bearing nouns
across intact — *nelegiuire, răscumpărare, neprihănire, îndurare* are doctrine, not vocabulary.
A near-synonym that scans better is still a different verse. When the exact word will not fit the
bar, keep the word and rebuild the bar.

---

<a id="ro-l017"></a>
## RO-L017 · 🔴 The rhyme rewrote the claim
**Category:** Doctrine · **Logged:** 2026-08-25 · **Source:** Review 1 ·
**Status:** `confirmed` — the most serious category in this review

| ❌ BEFORE (AI) | ✅ AFTER | What the line actually claimed |
|---|---|---|
| nu un poem, nu un psalm, **nu** un lucru sfânt, | nu un poem, nu un psalm, **ci** un lucru sfânt, | **A negation flipped.** The line denied that it was a holy thing. |
| și Și-a ridicat veșmântul și **Tatăl s-a-ntrupat** în avânt. | și-a ridicat veșmântul, și **Tatăl s-a avântat** spre mine. | **The Father was made incarnate.** *A se întrupa* is the Incarnation. It belongs to the Son. |
| Isus, am rătăcit și știu că **sunt blestemat**, | Isuse, am rătăcit și știu că **nu sunt vrednic**, | The prodigal says *I am no longer worthy* (Lk 15:19), not *I am cursed*. |
| Cel ce-a **spart** mormântul a sfărâmat orice teamă. | Cel ce-a **biruit** mormântul… | He conquered the tomb; He did not smash it open. |
| Credincioșia lui Dumnezeu **în fața** Fiului Său, | Credincioșia lui Dumnezeu, **arătată prin** Fiul Său, | "before His Son" makes the Son a spectator of the Father's faithfulness. |
| Tatăl aleargă, El aleargă **unde locuiesc**. | …El aleargă **spre locul unde sunt**. | "where I dwell" reads as a permanent address; the prodigal is in the far country. |

**Why.** Every one of these is fluent, singable Romanian. Nothing is wrong with the language —
what is wrong is the **claim**, and a fluency review passes all six. *Nu* for *ci* is a single
letter and it inverts the sentence. *S-a-ntrupat* was reached for because it fit the bar and
carried grandeur; it also happens to name the Incarnation and attach it to the wrong Person of
the Trinity.

And a song does not persuade — **it installs.** It goes around the argument and writes straight
to memory. A slightly-wrong line in a good melody is sung correctly, from memory, for decades, by
people who trusted us. Six lines in twenty-four songs is not a small number when each one is a
hook.

**Generalizes.** Run the **claim check** as a separate pass from the language check, on every
line: state the proposition in flat prose and ask whether it is true. Three specific traps this
review exposed — **(1)** watch every *nu / ci / nici*, because a negation is one letter and
inverts the whole sentence; **(2)** never predicate of one Person of the Trinity what belongs to
another — *întrupare* is the Son's, and grandeur is not a reason; **(3)** where the lyric puts
words in a biblical speaker's mouth, use what they actually said. Extends RO-L009.

---

<a id="ro-l018"></a>
## RO-L018 · Double localization — an Arab-idiom album into Romanian
**Category:** Double localization · **Logged:** 2026-08-25 · **Source:** Review 1 (Amir Inspire) ·
**Status:** `confirmed` — **new rule; the engine has no clause for this**

| ❌ BEFORE (AI) | ✅ AFTER |
|---|---|
| e un **dabke** în curte, nimeni singur nu mai lasă. | e o **bucurie** în curte, nimeni nu mai rămâne singur. |
| Curtea e luminată de **fanous**-ul arzând aur, | Curtea e luminată de **flacăra** arzând auriu, |
| E **petrecere** în cer când unul vine acasă, | E **sărbătoare** în cer când unul vine acasă, |
| muzicanții ridică **oud**-ul și **daful** începe să bată, | *(reviewer rewrote — see [Q2](#q2))* |

**Why.** Amir Inspire's catalogue is Arab Christian worship, and the English source is
deliberately saturated with Levantine markers — oud, ney, qanun, daf, dabke, fanous, za'atar,
caravan, courtyard. Those are load-bearing in English, where they read as *authentically
somewhere*. In Romanian they read as **nowhere**: *dabke* and *fanous* have no foothold in the
language, so the listener meets an untranslated foreign noun in a worship line and stops.

**This is a translation problem the engine never anticipated.** §3 rules on coined brand hooks
(keep) and Greek theological terms (keep, Romanianized) — both cases where the foreign word is
*the point*. Here the foreign word is **local colour belonging to the source culture**, and it
does not survive a second crossing. The album is being asked to cross two cultures, not one.

**Generalizes.** Sort every culture-bound noun in the source into three bins **before drafting**:

| Bin | Treatment | Examples here |
|---|---|---|
| **Brand / coined** | keep verbatim, always | *Jubilujah*, the spelling-chant |
| **Biblical / universal** | keep — it belongs to Scripture, not to a culture | smochin, curmal, măslin, fântână, curte, caravană |
| **Source-culture colour** | render the **function**, not the word | *dabke* → the joy it expresses; *fanous* → *flacăra* |

Note the reviewer also lowered *petrecere* → *sărbătoare* in the same album: not a foreign-word
problem, the same instinct one level down — *petrecere* is a secular party, *sărbătoare* is a
feast, and the courtyard scene is a feast. **Instrument names in the `Style` block stay in
English and are untouched by this** (engine §6) — this rule governs sung text only.

---

<a id="ro-l019"></a>
## RO-L019 · Words clipped or invented to fit a bar
**Category:** Truncation for meter · **Logged:** 2026-08-25 · **Source:** Review 1 ·
**Status:** `confirmed` — extends RO-L002

| ❌ BEFORE (AI) | ✅ AFTER | What it was |
|---|---|---|
| Doamne, Doamne, Tatăl **aleargă-ndatăl!** | Tatăl **aleargă îndată!** | *îndatăl* is not a word — invented to rhyme with *Tatăl* |
| și povestea harului Împăratului se spune **cu măsur**. | …se spune **cu măsură**. | the final vowel clipped off to fit |
| am-nvățat ce roșcovele lumii nu țin **niciodat'**. | …nu țin **niciodată**. | apostrophe-truncation, not a Romanian device |
| iar roșcovele porcilor nu-mi umplu **golul din care**. | …nu-mi umplu **golul din stomac**… | a relative pronoun left dangling as a rhyme word |
| e o siluetă ce privește-ncoace, **de data din vis**, | …**parcă ruptă dintr-un vis**, | meaningless — assembled from fragments |
| stând în curte, acum mergând, **acum cu pas**, | …**acum cu pas grăbit**, | the adjective dropped to save a beat; the phrase says nothing |

**Why.** RO-L001 catches the rhyme-filler *noun*. This is the same pressure attacking the **word
itself** — clipping a syllable off the end, inventing a form that rhymes, or leaving a function
word stranded where a meaning should be. *Aleargă-ndatăl* is the clearest: the model needed a
rhyme for *Tatăl*, and manufactured one letter-by-letter.

**Generalizes.** A word is delivered whole or it is not delivered. No apostrophe-truncation, no
clipped final vowels, no invented forms, no function word left holding a rhyme position.
**Every one of these is a syllable-budget failure — the diagnosis is always the same, and so is
the fix: the line is too long, recast the line.** (RO-L012, RO-L013, and this entry are three
faces of one problem.)

---

<a id="ro-l020"></a>
## RO-L020 · Titles carry full diacritics
**Category:** Diacritics in titles · **Logged:** 2026-08-25 · **Source:** Review 1 ·
**Status:** `confirmed` — engine §4 and §7 gate failure

| ❌ BEFORE | ✅ AFTER |
|---|---|
| Alergand Acasa La Tatal | **Alergând Acasă La Tatăl** |
| Noua In Fiecare Dimineata | **Nouă în Fiecare Dimineață** *(see [Q2](#q2))* |

**Why.** Engine §4 already says diacritics are mandatory "in the sung body **and in titles**,"
and §7 governs filenames — and both documents shipped with bare-ASCII titles anyway, which is
how the reviewer's very first correction came to be a title. The sung text inside was fully
diacriticked, so this was not a competence gap; it was a **surface nobody checked.** Document
titles, headings, filenames, `Song Title:` and `Save To:` are all sung-adjacent metadata and all
of them render somewhere a person will read.

**Generalizes.** Diacritics everywhere Romanian appears — sung text, song titles, album titles,
document headings, filenames, and both metadata footer lines. Add it to the §8 QA sweep as a
grep, not as a reading task.

---

## PENDING — logged, not yet a rule

*(Pairs whose reason is not yet established, or which a native has not yet confirmed as
generalizing. Nothing here may be applied to new lines.)*

<a id="q1"></a>
### Q1 · The `-î` artifact in the un-elided forms — **do not copy until ruled**
**Raised:** 2026-08-25 · **Blocks:** the spelling half of [RO-L013](#ro-l013)

Fourteen corrected lines in Review 1 place **î immediately after a hyphen**:

> *se-**î**ntinde* · *mi-a-**î**ntors* · *n-a-**î**mprumutat-o* · *dunele-**î**ncet* ·
> *A-**î**mbrăcat* · *le-**î**nvățasem* · *și-a-**î**mplinit* · *răscumpărarea-**î**mbelșugată*

To my reading this is not standard Romanian orthography — the un-elided forms should separate
into two words (*se întinde*, *mi-a întors*, *n-a împrumutat-o*) rather than keep the hyphen and
restore the vowel behind it. The pattern looks like a mechanical `-n` → `-în` replacement applied
across the file while unwinding our elisions.

**What is confirmed:** the direction. Our manufactured elisions were wrong and must go.
**What is not:** the resulting spelling.
**Needed:** the reviewer's ruling on whether these should be written as two words.
**Until then:** apply RO-L013 by *separating* the words, and never reproduce the `-î` form.

<a id="q2"></a>
### Q2 · Three corrections that look like reviewer slips
**Raised:** 2026-08-25

These three "After" lines read as less correct than the "Before," which usually means a typing
slip rather than a ruling. Logged, not applied, and not counted against the engine.

| Where | ❌ BEFORE (AI) | ✅ AFTER (as received) | The doubt |
|---|---|---|---|
| 1034 T11 | muzicanții ridică **oud-ul** și **daful** începe să bată | muzicanții ridică **auzul**, iar **vintul** începe să bată | *auzul* = "the hearing"; *vintul* appears to be *vântul* mistyped. The instruments seem to have been lost rather than localized. |
| 1034 T11 | **za'atarul** și untdelemnul și pâinea caldă | **zădărâtul** și untdelemnul și pâinea caldă | *zădărâtul* is not a Romanian word for the herb. RO-L018 says render the function — likely *cimbrul* or *ierburile*. |
| 1036 title | Noua In Fiecare Dimineata | **Nou în Fiecăre Dimineața** | *Nou* (masc.) where the sung hook is *Nouă*; *Fiecăre* appears to be *Fiecare* mistyped. The ledger records the title as **Nouă în Fiecare Dimineață** pending confirmation. |

**Needed:** a yes/no from the reviewer on each. If any is deliberate, it becomes a lesson and the
reasoning goes with it.

---

## SUPERSEDED

*(Kept permanently. A correction is a new entry; the old one stays with a pointer forward.)*

**None yet.**

---

## PROPAGATION — what this ledger owes the rest of the catalog

When a lesson reaches `confirmed`, ask two questions and record the answers:

1. **Does it belong in `translate_Romanian.md`?** If it is a standing rule and not a one-line
   preference, fold it into the engine and mark the lesson `promoted`. The engine gets the rule;
   the ledger keeps the evidence and the *why*.
2. **Is it Romanian-specific, or is it a translation failure that every language will hit?**
   RO-L001 (rhyme filler), RO-L002 (invented forms), RO-L004 (calque imagery), RO-L007 (stranded
   tails), and RO-L009 (theology over rhyme) are **not Romanian problems** — they are how this
   model translates *any* language, and they should be carried into
   `BUILD_TRANSLATION_PROMPTS.md` for all 28. RO-L003, RO-L005, RO-L006, and RO-L010 are
   Romanian-specific in their content, though each has a shape the other languages will need
   their own version of.

**Propagation to other languages is proposed, never applied unilaterally** — a rule confirmed by
a Romanian reviewer is confirmed for Romanian. It becomes a rule for Polish when a Polish
reviewer says so.

### The Inspire Personas mirror — all twelve learn from this

The confirmed rules are mirrored into the personas repository so that every member of the Inspire
Family writes, sings, and **speaks** Romanian by them, not only this workspace:

| File | Role |
|---|---|
| `personas/skills/languages/skill_translate.lessons.Romanian.md` | The mirror. Carries only rules at `confirmed`; points back here for the pairs. Adds a spoken-Romanian section (diacritics decide pronunciation; a manufactured contraction is unsayable; the vocative is audible). |
| `personas/skills/languages/skill_translate.music.Romanian.md` | Binds the mirror at the top — **and is the file whose §4 caused RO-L013.** |
| `personas/skills/languages/skill_translate.book.Romanian.md` | Binds the mirror at the top. |
| `personas/skills/README.md` | New `skill_translate.lessons.*` row in the skill table. |

**This ledger stays the source of truth.** The mirror carries rules; the evidence — every pair,
every reviewer, every promotion status — lives only here. When a lesson is promoted or superseded
here, the mirror is updated to match; it is never edited on its own.

---

**Authority:** Gabriel (Founder) holds final approval. The native reviewer holds authority on
what Romanian actually says; nothing in this file overrides a native correction, and no entry is
promoted to a rule on the AI's own confidence in its Romanian.

*Fiecare neam, în limba lui.*
