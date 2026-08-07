# Catalog Facts — what is actually in JubiLujah.com

Verified counts and the rules that govern them. Written because the catalog is easy to
misread: three separate filters sit between "an album exists in the manifest" and "a visitor
can see it," and reading the manifest without applying them produces confidently wrong answers.

**Source of truth for this document:** `app/web/public/music/catalog-manifest.json`
(`generated: 2026-07-07T22:35:43Z`), read under the rules in `app/web/lib/languages.ts` and
`app/web/lib/productionHistory.ts`. Verified 2026-07-22.

---

## 1. Headline numbers

| | Albums | Playable | Songs |
|---|---|---|---|
| **Manifest total** | 982 | 411 | 5,150 |
| **Live** (excludes hidden artists) | 865 | **373** | — |
| **Hidden** (`EXCLUDED_ARTISTS`) | 117 | 38 | — |

**Playable** means the album has uploaded audio (`playable > 0`). An album in the manifest with
`playable: 0` is *Studio* — it exists as metadata, lyrics and artwork, with no MP3s. Roughly
**57% of the catalog has no audio yet**, which is the single most important fact about it.

33 artists in the manifest; **14 are live** (12 Inspire Family + Party Giggles + Tiny Tiggles).

---

## 2. Language — how it works, and the trap

**An album's language is encoded in its code suffix**, after a 4-letter prefix and 4 digits:
`MDIM1005RO` → `ro`. Parsed by `albumLanguage()` in `app/web/lib/languages.ts`. The suffix can
be longer than two letters (`YUE` = Cantonese), so never `slice(-2)`.

`pt` and `br` are **distinct**: `…PT` = European Portuguese, `…BR` = Brazilian.

**41 languages are supported in the UI** (`LANGUAGES`); **22 currently have live content.**

### Live playable albums by language

| Lang | Albums | Songs | | Lang | Albums | Songs |
|---|---|---|---|---|---|---|
| **en** English | 285 | 3,560 | | de · fr · pl · ru · sv · nl · th · tr · ar · tl · vi · zh · he · pt-BR | 2 each | 24 each |
| *other* (no suffix) | 30 | 440 | | it · pt-PT · ko · hi | 1 each | 12 each |
| **ro** Romanian | **23** | **275** | | ja Japanese | 3 | 35 |

**Romanian is the largest non-English language in the catalog by a factor of eight.** Every one
of the twelve Inspire artists has Romanian releases (Zariah has one, the rest have two).
The other 19 translated languages are a two-album pilot each.

`other` = Tiny Tiggles, whose codes (`TTX301`…) carry no language suffix.

### 🔴 The trap that produces wrong answers

Three different things are easily confused:

1. **The `nations/romanian` *category*** holds only the **Zburdalnicii** children's line —
   10 albums, 8 playable. It is an *artist grouping*, not the Romanian language view.
2. **The Romanian *language* view** (🇷🇴 in the flag picker, `jv_lang` cookie) shows the
   **23 adult Inspire Family Romanian albums** — a completely different set.
3. `albumVisibleInLang()` **hides every recognized foreign-language album from the default
   English view.** So on English, the 23 Romanian albums are correctly invisible; they live on
   the Romanian Home only.

Browsing `Nations · Romanian` and concluding "the Romanian catalog is children's music" is the
natural mistake and it is wrong. The adult Romanian catalog is reached by the language picker.

### 🔴 Spanish is invisible — 17 albums misfiled as English

**Zero albums in the catalog classify as Spanish.** Not one. Verified 2026-07-22.

Meanwhile **Santiago Inspire has 17 playable Spanish-language albums** whose codes end `…EN`:

`SAIM1001EN` *Cristo Rey del Ritmo* · `SAIM1002EN` *El Rosario de Abuela* · `SAIM1003EN`
*Amor en la Lucha* · `SAIM1004EN` *La Calle Canta* · `SAIM1005EN` *Corazón Latino (Late Para Ti)*
· `SAIM1006EN` *La Cruz Que Baila* · `SAIM1007EN` *Dios en el Margen* · `SAIM1008EN` *Vivos en
Cristo* · `SAIM1009EN` *Cristo No Se Va* · `SAIM1010EN` *La Cruz Cruza* … and seven more.

Titles and tracks are in Spanish; the language suffix says English. Because `albumLanguage()`
reads only the suffix, three things follow:

1. **`languagesWithContent()` returns no Spanish**, so 🇪🇸 is hidden from the public flag bar —
   there is no Spanish home at all.
2. **All 17 appear on the English home**, since `albumVisibleInLang(code,'en')` passes anything
   classified `en`.
3. Per-language stats under-report Spanish as **0 albums / 0 songs**.

Santiago's own two Brazilian albums (`SAIM1005BR`, `SAIM1036BR`) and two Romanian ones
(`SAIM1022RO`, `SAIM1025RO`) *are* suffixed correctly, which is what makes the `…EN` block look
like an oversight rather than a convention.

**Spanish is plausibly the largest untapped audience for this catalog** — `JUBILUJAH-REQUIREMENTS.md`
§3 describes Santiago's lane as *Latin Worship (20 distinct traditions)*. The content exists and
is finished. Only the suffix is wrong.

**Fix is a re-code, not a re-record** (`SAIM…EN` → `SAIM…ES`) — but the code is the album's
identity across `album.meta.json`, the CDN path, the DB, and any existing links, so this is not a
find-and-replace. Scope it before touching it.

---

## 3. Hidden artists (`EXCLUDED_ARTISTS`)

Defined in `app/web/lib/productionHistory.ts`. 20 slugs — non-family artists kept out of the
official counts:

`gabriel-inspire` · `kingdom-pulse` · `radiant-stones` · `children-evangelism` ·
`gospel-by-music` · `judah-boone` · `mercy-belle-hayes` · `mihaiela-norica` · `ron-tank` ·
`allan-hassan` · `animals-blue-symbols` · `cornell-kay` · `daisy-wylder` · `gage-darron` ·
`happy-rumbles` · `my-tiny-tumbles` · `ruthie-bolton` · `wolf-ladybug-butterfly` ·
`veselia-copiilor` · **`zburdalnicii`**

**Note that `zburdalnicii` is on this list** — so the 8 playable Romanian *children's* albums do
not count toward the Romanian language totals above, and do not appear in Production History or
Media Analytics.

⚠️ **Unresolved inconsistency.** The comment on `EXCLUDED_ARTISTS` says these artists are hidden
from "the website browse, the mobile app, and the analytics counts." `productionHistory.ts` and
`languageStats.ts` do apply it — but `app/web/lib/manifest.ts` (the browse layer) never
references it. Either the browse exclusion happens elsewhere or the comment overstates it.
**Worth confirming before trusting either reading.**

---

## 4. Live artists — playable / total, and languages carried

| Artist | Playable | Total | Languages |
|---|---|---|---|
| Jubilee Inspire | 74 | 96 | en, hi, ja, ro, ru |
| Caleb Inspire | 46 | 95 | en, de, fr, it, pl, pt-PT, ro, tl, vi, zh |
| Nova Inspire | 30 | 75 | en, ja, nl, ro, sv, th |
| Party Giggles | 30 | 43 | en |
| Tiny Tiggles | 30 | 32 | *(none — `other`)* |
| Zev Inspire | 29 | 44 | en, he, ro |
| Imani Inspire | 28 | 58 | en, ko, ro |
| Elias Inspire | 24 | 47 | en, ro |
| Eliana Inspire | 22 | 43 | en, ro |
| Santiago Inspire | 21 | 57 | en, pt-BR, ro |
| Zariah Inspire | 17 | 44 | en, ro |
| Tahoma Inspire | 10 | 62 | en, ro |
| Amir Inspire | 7 | 78 | en, ar, ro, tr |
| **Melody Inspire** | **5** | **91** | en, ro |

**Caleb carries ten languages** — far more than anyone else; the translation pilots were run
through his catalog. **Melody has 91 registered albums and 5 with audio**, the widest gap between
written and playable of any artist in the family.

---

## 5. Two manifest copies — they are not the same

| Path | Generated | Albums | Playable | Read by |
|---|---|---|---|---|
| `app/web/public/music/catalog-manifest.json` | 2026-07-07 | 982 | 411 | **The Next.js app** (`process.cwd()` = `app/web`) |
| `public/music/catalog-manifest.json` | 2026-06-03 | 736 | 264 | The legacy static site (`public/web/_assets/player.js`, `album-status.js`) |

The legacy copy is **246 albums and 147 playable albums behind**. Whether that is deliberate
(a frozen legacy surface) or drift has not been established — **do not sync them without
deciding which it is.**

---

## 6. What cannot be done from this repository

**There is no manifest generator here.** `app/web/scripts/` contains only *mutators* —
`gen-album-genres`, `merge-genres-into-manifest`, `gen-album-covers`, `gen-completion-dates`,
`build-album-themes`, `verify-genres`. Nothing writes `catalog-manifest.json` from scratch.

Per `JUBILUJAH-REQUIREMENTS.md` §2, the catalog is authored on the **C: workshop** drive and the
audio lives on **J: / `cdn.jubileeverse.com`**. Neither is reachable from this checkout, so the
manifest **cannot be regenerated or freshness-checked against real audio from here**. The counts
above are accurate *as of the 2026-07-07 manifest*, and any album that gained audio after that
date is undercounted.

---

*Regenerate this document by re-running the survey against the manifest; do not hand-edit the
numbers.*
