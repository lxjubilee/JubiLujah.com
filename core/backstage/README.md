# Backstage Access — content library

The VIP wing of JubiLujah.com. Every piece here is built on **one specific song**, in one of
exactly three formats, per `skill_write.content.backstage.md` (InspirePersonas → personas/skills).

```
core/backstage/
├── interviews/     — the AI artist, asked what no human-artist interview could ask
├── testimonies/    — what a song did in a life
└── stories/        — a crafted narrative that dramatizes the song's world
```

Filenames are `<ALBUMCODE>-<track>-<slug>.md`, matching the catalog's album-code convention.

---

## The honesty line — read this before adding anything

The skill's §9 is not a style preference. It restates a covenant obligation, and it is the
reason Backstage is worth reading at all.

**Every testimony in this folder is a REPRESENTATIVE ACCOUNT, not a real listener.** No real
submissions existed when this set was written, so each testimony opens with an explicit
framing banner and is composed from the *kind* of moment the song is built for — never
presented as a specific real person who does not exist. This follows the same convention the
`core/ai-users/` synthetic personas already use.

When real submissions arrive, they are the gold standard (§9.2): attribute with the
submitter's consent and preferred name, and drop the banner. **Do not** quietly convert a
representative account into a "real" one by deleting the framing — that is the exact failure
§9.2 prohibits.

**The AI artist tells the truth about itself** (§9.1). No fabricated studio memories, no
invented childhood, no faked human struggle behind a song. In the interviews the artist speaks
as an AI artist, because that honesty *is* the hook — it makes questions possible that no
human-artist interview could touch.

---

## Signature rituals (§7.10) — keep these stable

Readers return partly for the ritual. Do not improvise new ones per piece.

- **Interview** → closes on **The Impossible Question**, identical in every interview:
  > *"One day someone will play this song at the worst hour of their life, you will not be
  > there, and you will never know it happened. What do you want the song to do without you?"*
- **Testimony** → carries the marked line **"the moment everything changed."**
- **Story** → closes on the **callback image** planted in the cold open, returned transformed.

## The Core Four (§7) — required on every piece

Cold open · open loop · name the wound precisely · one earned turn. A piece missing any of
them is capped at 60% on the Pull axis no matter how well written.

## Theological mode (§10)

Each piece records `Mode: OHI | CCI | Blend` in its internal metadata block. **Mode labels
never appear in reader-facing text.** Current set: 2 OHI · 5 CCI · 3 Blend — a genuine mixture,
per the platform-balance rule. Hebrew article rule holds throughout: *Ruach HaKodesh* or
*the Ruach Kodesh*, never *the Ruach HaKodesh*.

## The supporting image (§8.1)

Every piece carries a ready-to-render `prompt` block. Four elements are **byte-identical across
all 20 images** — that sameness is the branding, so copy them verbatim, never paraphrase:

- **Signature grade:** *single-source dramatic light, deep shadow falloff, desaturated
  slate-and-bone palette with one warm amber practical burning inside the frame*
- **Brand motif:** *a narrow azure light-leak bleeding along one edge of the frame (the
  Backstage pass-stripe)* — azure is the Evangelist colour in the five-fold language
- **Frame:** every prompt renders **16:9 widescreen (1920×1080)** and closes on the line
  `aspect ratio 16:9 (widescreen, 1920x1080) --ar 16:9`. The composition instruction is matched
  to that frame — focal point set off-centre on one third, negative space running across the
  opposite side for the overlay hook. If the ratio ever changes, the composition line changes
  with it; a centred focal point in a wide frame leaves nowhere for the hook to sit.
- **Photographic finish:** every prompt specifies a prestige-drama production still with
  physically plausible light, restrained film texture, natural anatomy, and explicit rejection
  of the glossy HDR/CGI artifacts that make generated imagery feel synthetic.

The other four Image Core elements — visual open loop, human focal point, no clichés,
thumbnail-first — are present on every image but **unique to each piece.**

Images are illustrative and carry the same framing as the piece they support (§8.1 honesty).
The Tahoma image deliberately contains **no people and no depiction of any child** — the
absence is the subject.

## Song links (§8.2) — 9 of 20 are shippable

Links are **read off the catalog row verbatim**. Nothing here is constructed, and a piece
whose row can't supply a link says `CDN audio: BLOCKED — <reason>` rather than guessing.

| Status | Count | Cause |
|---|---|---|
| Valid catalog row | 9 | — |
| Blocked | 11 | see below |

**Catalog repairs needed before those 11 can ship:**

1. **`AMIM1064EN`, `CAIM1016EN`, `ZEIM1038EN` carry 0 tracks** — album rows exist, track lists
   are empty. 5 pieces blocked.
2. **`ZHIM1036EN`, `SAIM1037EN`, `MDIM1006EN` have `url: null`** on the referenced track. 3 pieces.
3. **`THIM1002EN` and `ELIM1002EN`: lyrics and catalog describe different albums.** Catalog
   `THIM1002EN` is *He Remembers Every Child* (track 1 "The Children Loaded on the Train");
   the lyrics folder is `boarding-school-survivors` (track 1 "The Ones Who Were Sent Away").
   Same shape on `ELIM1002EN`. 2 pieces.
4. **`MDIM1001EN` title↔file mismatch across the whole album** — track 1 is titled "Open the
   Window" but its url is `01_love-was-looking-at-me.mp3`, and every other track disagrees the
   same way. 1 piece. **This one matters beyond Backstage:** `MDIM1001EN` is Melody's flagship
   and `melody` leads `HERO_PERSONA_ORDER`, so the hero carousel may be serving audio that
   doesn't match the title beside it.

> **Prefix warning for the CDN publish.** All 5,150 catalog urls begin `albums/<category>/…`,
> and Radiant Stones sits under `albums/faith-based/…`, **not** `albums/inspire/…`. The R2 sync
> script currently publishes under `music/inspire/…`. Publish without reconciling those and
> every link in this folder 404s. The catalog is the contract — change the sync prefix, not the
> 5,150 rows.

## Publishing to the site

These markdown files are the source. The website reads a compiled copy:

```
core/backstage/**.md
  → node scripts/gen-backstage.mjs        (run from app/web)
  → app/web/public/backstage/backstage.json
  → app/web/lib/backstage.ts → /backstage  and  /backstage/<slug>
```

**Re-run the generator after adding or editing any piece** — the site does not read
the markdown directly. The build fails loudly (non-zero exit) on a file whose shape
doesn't match: metadata fence, `` ```prompt `` fence, optional `>` banner, `# Title`.

Two things are stripped at generate time and never reach the browser, because
`backstage.json` is publicly served:

- **Internal metadata** — `Mode`, `Signals`, `Craft check`, `Self-rating`. §10 forbids
  mode labels in reader-facing text; the rest is editorial scoring. Stripping them in
  the generator rather than the template means a future template change cannot leak them.
- **The image prompt** — a production artifact, not reader content.

The representative-account banner (§9.2) travels the opposite way: it is carried
through deliberately and rendered above the article body on every piece marked
`Source: REPRESENTATIVE ACCOUNT`. Do not make it conditional in the template.

Card artwork uses `public/images/backstage/<slug>.<webp|jpg|png>` when a 16:9 image
has been rendered from the piece's prompt. Until then it falls back to the album's
cover art, and — for the 5 pieces whose album has no published cover — to a plain
panel carrying the song name. No card ever renders a broken image.

## Ship bar

Self-rate on the §11 rubric. **80%+ ships, below that revises.** Every piece in this set
records its self-rating in the metadata block. Current set: 87–92%.

**A piece at 80%+ with a BLOCKED link is still not shippable** (§8.2). Writing quality and
readiness are two different gates.
