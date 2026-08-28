# JubileePraise Studio (WPF + WebView2)

A Windows desktop app for the three jobs this repo does by hand: putting hero
images on the article library, moving album lyrics out to Suno and the rendered
audio back in, and shipping the site.

It hosts a **real browser** (WebView2 / Edge-Chromium) so you can log in to
ChatGPT yourself — the human check passes normally, because it is a genuine
browser, not an automation-flagged one — and then drives *your own logged-in
session* to generate each piece's image.

Ported from `InspireManna.com/tools/ArticleImageStudio`, which came from an
earlier JubileePraise build by way of JubileeVerse. The browser half is unchanged.
The data half is entirely JubileePraise's — see [What changed coming
back](#what-changed-coming-back-to-jubileepraise).

```
dotnet build -c Release          # or double-click Build-And-Run.cmd
bin\Release\net8.0-windows\JubileePraiseStudio.exe
```

Requires the **.NET 8 SDK** and the **WebView2 Runtime** (already present with
Edge on Windows 11).

---

## The window

```
+--------------------------------------------------------------------+
| JubileePraise Studio   inspire…            Website [ JubileePraise.com  v ] |
+--------------------------------------+---+----------------+----+----+
|                                      | | |                | 🖼 |  Images
|   the real browser (ChatGPT)         |<->|  the panel:    |    |
|                                      | | |  one of six    | 🖽 |  Support
+--------------------------------------+ | |  views         |    |
|=============== splitter =============| | |                | ♪  |  Music
|  log: full window width, no heading  | | |                |    |
+--------------------------------------+---+----------------+ 🎨 |  Covers
                                                             |    |
                                                             | ☁  |  Deploy
                                                             |    |
                                                             | ⚙  |  Settings
```

The strip on the far right switches what the panel shows. Five views at the
top, settings pinned at the bottom.

| | View | Left pane | Right panel |
|---|---|---|---|
| 🖼 | **Article Images** | the browser | All + four section tabs, and one **Generate Images** button |
| 🖽 | **Support Images** | the browser | persona → albums **with** artwork, and one **Generate Support Images** button |
| ♪ | **Album Music** | the **lyrics reader** | voice → albums → tracks, and one drop zone |
| 🎨 | **Cover Images** | the browser | persona → albums with **no** artwork, and one **Generate Covers** button |
| ☁ | **Deploy** | the **live site** | what is live, what is waiting, and the Deploy button |
| ⚙ | **Settings** | the browser | repo root, portraits, music root, generation location |

The left pane belongs to whichever view is driving. It is **collapsed** rather
than covered when it changes, because a WebView2 is an airspace window that
draws over WPF content regardless of z-order in some compositing paths.

Both splitters are draggable and both remembered, written to
`studio.config.json` (git-ignored) on close and on **Save settings**:

```json
"layout": { "panelWidth": 344, "logHeight": 170 }
```

A close while minimised measures every element at zero. Those values are refused
rather than saved, so a minimised exit cannot reopen with the panel and the log
collapsed to nothing. Minimums (260px panel, 52px log) stop a drag doing the same.

---

## The website picker

One Next.js app serves three sites off the `Host` header — JubileePraise carries the
whole catalogue, goPartyGiggles and MyTinyTiggles carry one children's label
each. The picker in the upper right says which of them the studio is working on.
It is the same control, and the same retemplate, as the one in
`InspireManna.com/tools/ArticleImageStudio`.

**The list is read from the repo, not maintained here.** Three sources, tried in
order, and the launch log names the one it used:

| | |
|---|---|
| 1. `tenants/*.json` | **the primary.** Written for tooling, so it states the music-drive folder and the studio root outright — the studio does not have to work backwards from a manifest category key to a folder. |
| 2. `app/web/lib/tenants.ts` | the fallback for a checkout with no `tenants/` folder. It is what the site serves, but it cannot carry a disk path. |
| 3. `BuiltInTenants()` | last resort, for a copy of the exe with no repo at all. |

A tenant added to `tenants/` appears in the picker on the next launch with no
code change. `node tools/check-tenants.mjs` is what stops the first two
disagreeing — see [tenants/README.md](../tenants/README.md).

> **The fallback used to be silent, and that is worth knowing about.** The
> TypeScript reader scanned for the first `[` after the word `TENANTS`, which is
> the one in `Tenant[]`, so it matched an empty array and found nothing — every
> time. The picker looked perfectly correct because `BuiltInTenants()` names the
> same three sites. Fixed, and the launch log now states its source out loud
> precisely so a silent fallback cannot happen twice.

| Selected | Album + cover worklists read |
|---|---|
| **JubileePraise.com** | the configured music root, whole (`J:\jubileepraise.com\music\inspire`) |
| **goPartyGiggles.com** | `J:\jubileepraise.com\music\children\party-giggles` |
| **MyTinyTiggles.com** | `J:\jubileepraise.com\music\children\tiny-tiggles` |

### 🔴 What it scopes, and what it does not

**It scopes the album and cover worklists**, and it points the live-site pane at
that tenant's domain. It does **not** scope article images — `core/articles` is
JubileePraise's alone — and it does **not** scope the deploy: one pm2 process serves
all three hosts, so shipping ships them together whichever row is selected.

Saying that out loud matters more than it looks. A picker that appears to scope
everything and silently does not is worse than no picker at all, so the preflight
log says it too, every time.

### The category key is not the folder

The manifest calls the label `party-giggles`; on disk it is
`children\party-giggles`. **Declared beats derived:** each `tenants/*.json`
states `catalogue.musicDrive` and `catalogue.studioMusicRoot` outright, and when
both exist on the drive they are used as written — no manifest parse, no probing,
and no chance of the studio and the tenant file disagreeing about where a label
lives.

The derivation stays for the TypeScript fallback, which cannot carry a disk path:
the album paths already in `catalog-manifest.json` are read
(`albums/children/party-giggles/…`) and the folder taken from there. Probing the
drive — `<base>\<key>`, then `<base>\children\<key>`, then one level down — is the
last resort for a machine with no manifest. That probe is not academic: the
manifest publishes Tiny Tiggles at `albums/tiny-tiggles/…` while the drive keeps
it under `children/`, so the derived answer misses and only the probe finds it.

That manifest is 1.4 MB and lives on J:, so the **whole** key→folder map is built
in one pass the first time any key is asked for, rather than parsed once per
tenant on every launch. Changing the music root in Settings drops the cache.

The selection is remembered in `studio.config.json`:

```json
"tenant": "partygiggles"
```

An unknown key falls back to **JubileePraise**, not to nothing — the same rule
`tenantForHost` follows in the app itself. Opening the studio silently scoped to
one children's label would be the wrong failure.

The music root in Settings is **not** rewritten by a switch. That field is the
configured root and what gets saved; the tenant scope is layered over it at read
time, so switching to goPartyGiggles and back leaves the setting untouched.

---

## Article Images

**Two source shapes, and they are not interchangeable.** This is the thing to
understand before changing anything in `ScanAll` or `SaveImage`.

| | **Articles** | **Backstage** |
|---|---|---|
| Source | `core/articles/*.md` | `core/backstage/{interviews,stories,testimonies}/*.md` |
| Prompt lives in | `imagePrompt:` frontmatter | a ` ```prompt ` fenced block |
| Author named by | `personaSlug:` | `Artist:` in the leading fence |
| Image saved to | `app/web/public/images/articles/<slug>.webp` | `app/web/public/images/backstage/<slug>.webp` |
| Marked done by | an `image:` field this tool writes | **the file existing on disk** |
| Compiled by | `core/articles/gen-articles.mjs` | `app/web/scripts/gen-backstage.mjs` |

A backstage piece gets **no write-back**, and that is correct rather than an
omission: `gen-backstage.mjs` resolves its picture by looking the slug up on
disk, so the file landing *is* the record. Writing a claim into the `.md` as well
would give the piece two sources of truth that can disagree — and the one that
disagreed would mark it done forever.

Frontmatter here is **unquoted** (`title: A Blurred Note Rallies No One`), which
is why the parser is anchored differently from the InspireManna build's: that one
required `key: "value"` and would have matched no line in this repo at all.

**`image:` is inserted when absent**, directly after `imagePrompt:`. Most of the
library predates any picture and carries no `image:` line, so the inherited
behaviour — require the key, fail otherwise — would have written every picture to
disk and then reported a failure for it.

### The tabs

One tab per source folder, plus **All** to sweep every section in order. Whatever
tab is selected is the scope of the one **Generate Images** button; there is no
second control that could disagree with it.

**Stop** sits beside **Refresh** at the top, where you can reach it during a run.

**Green ticks are this session's work.** As each image finishes, its piece gets a
green `✓` and **stays on the list**, so a long run shows what it has done rather
than only what is left. Press **Refresh** and the ticked rows drop away.

That "stays on the list" half is the part that needs saying: a finished piece now
has an image, and the list hides those, so without it the row would vanish at the
instant it succeeded and the tick would never be seen at all.

| Tick | Means |
|---|---|
| green `✓` | rendered **in this session**, still listed until you Refresh |
| grey `✓` | rendered earlier, only visible with **show pieces that already have an image** |
| none | still pending |

**Refresh** and **Scan sections** are the only things that clear the session
ticks, and they also release the "already done this session" lock. That lock
stops a run looping on one piece, but it must not outlive the truth on disk:
Refresh means "re-read the drive", so the drive wins.

### The author is in every picture

Every piece is written by one of the twelve Inspire Family voices, and every
image carries that person inside the scene. The portrait at
`personas/<Name>.png` is attached to the ChatGPT turn as a likeness reference and
the prompt is extended to place the author among the people already described.

**The reference portraits are stylised, and that is the whole problem the prompt
solves.** They are neon-lit studio pieces: glowing costume, circuit background,
head-and-shoulders crop, subject looking straight down the lens. Attached without
instruction, the author walks into a country church at golden hour wearing
glowing armour, which wrecks the picture and, worse, wrecks the piece.

| Taken from the portrait | Discarded |
|---|---|
| Facial features, skin tone | The costume and its glowing trim |
| Hair colour and texture, facial hair | Headwear and jewellery |
| Approximate age, general build | The neon / circuit background |
| | The studio lighting and the crop |

The wardrobe decision goes back to the scene: **ordinary real-world clothing that
suits the setting, its climate and its season, at the same level of formality as
the other people present**, plain enough to draw no attention. The author is
placed **among** the scene, not in front of it — not centred, not posed, not
looking at the lens, never more prominent than the person the piece is about.

Not the multi-megabyte original: the portrait is cropped to its centred square
and downscaled to 768×768 JPEG, and cached, so a sweep encodes each face once.
The crop is not just compression — the sources are landscape with the head inside
the middle third, so cropping first throws away only background and spends the
same bytes on the only part being referenced.

**When the portrait is missing the piece is skipped, loudly**, and stays queued.
Generating without the reference would produce a perfectly good image of the
wrong thing and then mark the piece done, so it would never be regenerated and
the miss would be permanent and silent. Startup reports which of the twelve
portraits it can see. Untick **Put the piece's author in the image** to turn the
whole path off.

### The preview

Between the worklist and the button, at the panel's full width, in a 16:9 box
because that is the ratio every image is generated at. During a run it follows
each image as it lands.

**WebP is decoded through ImageSharp, not WPF.** `BitmapImage` cannot read WebP
here — WIC has no registered decoder, and `EndInit` fails with
`ArgumentNullException: Key cannot be null`, which is an unhelpfully generic way
of saying "no codec". ImageSharp wrote these files, so it is guaranteed to read
them.

### After a run

The pages read compiled JSON, so until the compilers run the picture is on disk
and the page still shows its fallback panel. **Rebuild articles.json +
backstage.json** in Settings runs both:

```sh
node core/articles/gen-articles.mjs
node app/web/scripts/gen-backstage.mjs
```

Shelling out to the repo's own compilers rather than writing the JSON here keeps
one source of truth.

> **You are the review gate.** Nothing this tool produces is reviewed
> automatically. Look at the images before the pieces publish, and look hardest
> at the likeness.

---

## Album Music

The workflow the album lyrics were always heading toward: read them here, render
the audio in Suno, drop the results back. **The songs themselves are not written
here** — that is the blueprint and lyrics pipeline in
`setup/generatelyrics-jubileepraise.md`. This view reads them out and files the audio
back.

1. **Pick a voice first.** The dropdown carries the folders under the music root,
   read from disk rather than hard-coded, so the corpus growing a voice does not
   need an edit here. There is deliberately **no "All"**: an album belongs to one
   voice, and a mixed list of hundreds invites filing a Caleb take against an
   Imani album.

   Reading a voice opens every album's meta file and its whole lyrics file, which
   measured **2–4 seconds for a small voice and 8.2 for Jubilee's 148 albums**,
   cold. So the scan runs **off the UI thread** — inline it locked the window
   every time the view was opened or the voice changed, long enough to look like
   a crash. A scan carries a generation number, so picking Jubilee, changing your
   mind and picking Zev cannot let the slower Jubilee read land last and fill the
   list with the wrong voice.
2. The album worklist shows **all** of that voice's albums, not only the
   unrendered ones, because a finished album has to stay reachable or its tracks
   could never be played back and checked. The mark carries the state.
3. Selecting one opens its lyrics file in the **left pane**, as raw markdown, so
   the text can be selected and pasted into Suno exactly as written. A rendered
   view would look nicer and be useless here. **Copy lyrics** takes the whole file.
   Above it sits **one Styles row per track**, lifted out of the file with a Copy
   button each — that line is what goes in Suno's Styles box, and hunting for it
   inside 900 lines of markdown is the kind of friction that gets a song rendered
   with the wrong sound.
4. The track list comes from the file's `SONG TITLE:` lines, **not from the
   folder**. An album whose audio has not been rendered has an empty `tracks/`
   folder and twelve songs; listing the folder would show it as having nothing to
   do.
5. Drop the rendered mp3s on the zone. They file into `tracks/` under the
   selected track's own name, and several at once fill consecutive songs from
   there. **Export voice as .zip** writes that voice's lyrics files, one folder
   per album, for scoring on a machine where the music drive is not mounted.

Dropped files are **copied**, never moved: the source is whatever was dragged out
of a downloads folder, and deleting it because it landed on the wrong track is not
a mistake worth making. Overwrites are confirmed one at a time, because a drop
onto a filled slot is more often the wrong slot than a deliberate re-render.

**The zone grows a play button once its file is on disk.** That is not a
convenience: the filename is *derived* from the track you picked, so nothing about
the drop itself proves the right take landed in the right slot. Hearing it does.
If the platform codecs are missing it hands the file to whatever the machine does
use rather than leaving a dead button.

### 🔴 The publish gate

| Mark | Means |
|---|---|
| `✓` | every song has its mp3 |
| `◑` | some do |
| blank | none do |
| **`!`** amber | **mp3s are present that no current SONG TITLE claims** |

That last one is the standing rule made mechanical. When an album's lyrics are
rewritten, the audio already in `tracks/` was rendered from the **old** words: the
folder still looks full, the count still reads twelve, and shipping it puts
pre-rewrite songs on the site under the new titles. A filename no current song
title claims is the trace of exactly that, and the album gets an amber banner over
its lyrics saying **HOLD**.

It discriminates rather than just firing: an album whose audio matches its lyrics
comes back with zero orphans and a clean tick.

The reader also **re-reads the file if it changed on disk** while you were away —
and re-reads the album with it, because a lyrics rewrite is precisely what turns
the audio in `tracks/` into a pre-rewrite render.

---

## Cover Images

**438 albums on the music drive have no artwork — 303 of them English.** This view
finds them, builds each one a prompt out of `.models` plus the album's own content,
and generates the picture through the same browser Article Images uses.

Pick a persona, or **All personas**. The list shows that voice's albums; the ones
with a cover already are hidden until you tick **show albums that already have
artwork**. **Generate Covers** sweeps everything still missing one.

### Display English Albums Only

**On by default**, at the top of the panel, and it governs both the list and what
Generate sweeps.

An album's language is the last two characters of its code — `MDIM1042EN`,
`AMIM1034RO`, `IMIM1034KO`. Of 940 album folders, **769 are EN**, 171 are one of
forty other languages, and four match no pattern at all: two Cantonese `YUE` codes
and two stray folders that are not albums. All four fall outside `EN`, which is the
right answer for every one of them.

It defaults on because **a translated edition is not a new picture.** The house
pattern is that the RO/JA/KO twin reuses its English original's photograph and
swaps only the title text — thirty-one covers in the catalogue are exactly that.
Generating one from scratch would produce a second, different cover for the same
album and break the pairing. Untick it only when you mean to author a localised
edition its own image.

This one **re-scans** rather than re-rendering, unlike *show albums that already
have artwork*. That switch is a display filter and Generate independently targets
only the uncovered ones, so the two cannot disagree. Language decides what is in
scope at all — filtered at render time, the list would hide the localised editions
while Generate quietly swept them anyway.

English albums still needing a cover:

| Persona | Missing | Covered |
|---|---|---|
| Caleb | 56 | 6 |
| Melody | 49 | 40 |
| Tahoma | 37 | 23 |
| Amir | 36 | 32 |
| Imani | 14 | 39 |
| Jubilee | 10 | 71 |
| Santiago | 10 | 41 |
| Nova | 7 | 50 |
| Zev | 3 | 37 |
| Eliana · Elias · Zariah | 0 | 127 |
| *kingdom-pulse · radiant-stones* | *81* | *0* |
| **Total** | **303** | **466** |

Masters land at `<album>/artwork/<CODE>.png` on the music drive. **Nothing here
publishes** — the CDN copy is WebP and is produced later by the cover pipeline.

### 🔴 Output goes to `review/`, never to the music drive

```
review/<Persona Name>/<Album Title> (CODE).png
review/Jubilee Inspire/Locust Years Repaid (JEIM1051EN).png
```

The drive holds **approved masters**; this tool produces **candidates**. A candidate
that wrote itself into `artwork/` would be indistinguishable from an approved one
the moment it landed — and would mark the album covered, so it would never be
offered again.

The worklist carries **three** states, not two:

| Mark | Means |
|---|---|
| `✓` grey | approved artwork on the music drive |
| **`◷` amber** | **a candidate is sitting in `review/` awaiting your decision** |
| none | nothing yet |

An album awaiting review is **not regenerated** — that would throw away a picture
nobody has looked at. Delete it from `review/` to ask for another.

### It learns from the covers that already exist

**Three of the persona's own released covers are attached to every turn**, taken
from the music drive, spread *across* the catalogue rather than from the front of
it, and rotated per album so consecutive albums do not learn from the same three
pictures.

That is the fix for the first build, which produced six Jubilee covers in the same
white marble hall. The text brief described the *median* cover and nothing showed
the spread around it. A real cover carries the face, the wardrobe, the throat
stone, the palette, the light quality and the craft all at once — everything the
prose was trying and failing to specify.

The clause splits it explicitly:

| Copy from the references | Do **not** copy |
|---|---|
| Face and likeness · hair · wardrobe and its cut · the throat stone · palette · quality of light · depth of field · finish | **Setting · pose · props · camera angle · composition** |

References are centre-cropped to 80% before they go, which removes most of the
wordmark and the title — handing the model lettering and then asking for none is a
fight worth avoiding.

### Build — slender, lean and fit

**Every persona is slender and lean, on every path.** Stated once, in
`BuildClause`, and appended to cover, article and supporting-image prompts alike —
a fact about the person that explicitly overrides the attached references.

It had to be added because **nothing was saying it.** The twelve `.models` briefs
describe wardrobe, palette, light and framing and say nothing at all about the
body, so the generator invented one per render. Worse, the article path's
take-list ended *"and general build"* — instructing the model to import the body
from the reference portrait — so on that path the only build instruction in the
prompt was the wrong one. Both are fixed.

> 🔴 **Do not add a "never …" to this clause.** It has been tried and it makes the
> problem worse. Measured in InspireManna's `runner/persona-image.js`: a line
> ending *"never heavy set, stocky or overweight"* produced heavy renders anyway,
> because an image model does not subtract a concept it has been shown — naming
> the heavy reading in order to forbid it plants it. `"Slender"` alone read as a
> soft preference and lost to the reference. So the build is described concretely
> and at length, and **every word of it is a word we want in the picture.**

The wording is deliberately near-identical to `persona-image.js`'s `BUILD`: the
same person has to have the same body on an article, on a cover and on a
supporting image, in this repo and in that one. Two wordings drift.

`HeightClause` used to carry its own build sentence — including that negation. It
now points at `BuildClause` instead, so the build is stated once, in one wording,
everywhere. Height itself is still supporting-images-only, by Founder scope.

### Apparent age

**Thirty for all twelve, except Elias — forty, with white hair and a white beard.**

It lives in `ApparentAgeOf` in code, not only in the twelve briefs, because twelve
copies of one fact are twelve chances for one to drift, and the code is what the
prompt actually carries.

**It has to override the references, and it says so.** A cover learns its likeness
from that persona's released covers, and those were rendered under the old ages —
Elias at sixty, Nova at late twenties. Without an explicit *"if a reference shows
an older or younger person, the age in THIS image is the one stated here"*, the
images would keep reproducing the age they were shown.

Elias's clause is careful about which half of "old" it keeps: *white-haired at
forty, not an old man — the face is unlined and firm and reads as forty, never as
sixty.* The white hair carries the authority; the face is not asked to.

The article path carries the same clause, and `AuthorClause` no longer asks the
model to take *"approximate age"* from the portrait — that would have put the two
instructions in direct contradiction.

### 🔴 The commercial bar

Every prompt ends on it, and it is the clause the first two runs did not have.
Everything else told the model what to put in the frame; nothing told it the frame
had to be one somebody would want to own.

> *…if it would not score at least 95 out of 100 as marketing artwork for a major
> release, change it… **FORBIDDEN:** empty rooms, bare corridors, hospital or
> clinical spaces, dim workshops, basements, plain walls, grey or drab palettes,
> gloom, sterile modern interiors, and any frame where the subject is alone in a
> space that looks sad, austere, institutional or abandoned. A literal-but-lifeless
> illustration of the title is a **FAILURE even when it is accurate**.*

Every item on that banned list is something an earlier run actually produced.

### Four drafts, four angles

One interpretation of a title is a coin toss. *"Named Before the Likes"* read
literally produces **an egg** — a thing named before it hatches. Clever, correct,
and a cover nobody would pick up.

So each album is attacked four ways, and you keep the one that works:

| Draft | Angle |
|---|---|
| 1 | **Celebration** — the joy as a public event, surrounded by people |
| 2 | **Majesty** — ceremony and honour, thrones, banquets, being attended |
| 3 | **Wonder** — an exotic or heavenly location worth stopping to stare at |
| 4 | **Intimacy** — close, warm, one beautiful human moment |

They land side by side as `<Title> (CODE) - 1.png` … `- 4.png`. Set **Drafts per
album** to 2 or 1 once a persona's look is settled.

### It does not repeat itself

1. **The register.** Each model file's per-album table has one row per existing
   cover describing what the picture shows — **505 compositions across the twelve**.
   A rotating window of eighteen goes into every prompt.
   **Worded as "find a different one of equal or greater beauty", not as a ban** —
   a bare ban is what walked it away from this artist's best territory (crowds,
   thrones, gardens) and into novelty for its own sake. Uniqueness is not the goal;
   a *different great cover* is.
2. **The run ledger.** Albums already asked for this run, per persona.
3. **Assigned angle, shot and light**, rotating on different cycles, so the four
   drafts of one album differ in all three — and so do consecutive albums.

**Every lighting option is beautiful.** The previous set offered *"night, most of
the frame dark"*, *"soft overcast, low contrast, no flare"* and *"hard side-raking
shadow"* — cinematography-school choices that fight this catalogue's whole look,
and precisely what produced a dim hospital corridor and an unlit workshop. Variety
has to happen **inside** beautiful, not between beautiful and drab.

### The prompt is built, never stored

There is no cover `.md` to hold one, and there should not be. What goes in:

| | Comes from |
|---|---|
| The look, the person, the craft | **three attached released covers** from the music drive |
| How this persona's covers work | `.models/model_<voice>.md`, the **Generation brief** section |
| What must not be repeated | that file's **per-album register table**, plus this run's own ledger |
| What this album is about | its `album.meta.json` title, its lyric-derived theme and genre in `app/web/public/music/`, and its own **`SONG TITLE:` lines** |
| Shot type and lighting | assigned by rotation, not left open |

The section is located **by its heading text, not its number** — it is §11 in some
model files and §12 in others, because a persona with an extra findings section
pushes it down one. The whole section is taken, not just the blockquote: the
paragraphs under it carry the arc choice, the governing instruction and the "do
not" list, which are the parts that stop a cover being generically pretty and
wrong.

**Refresh re-reads `.models`.** Edit a brief, press Refresh, and the next image
changes. No restart.

A voice with no model file is **skipped loudly and stays queued** — resolved for
the whole queue *before* the browser is touched, because finding it out per album
costs a minute each and there are eighty behind some of them. `kingdom-pulse` and
`radiant-stones` have no model file and no covers; they will list and refuse.

### 🔴 The picture comes back with no words on it

Every cover in the catalogue carries the house chrome: a border, the persona's
name in script up the left edge, the album title along the bottom. **None of it is
generated.** The prompt explicitly forbids text, and `ApplyChrome` draws all three
afterwards with WPF.

That is not a style preference, it is a correctness fix. **`AMIM1001EN` still
publishes "BRIDGE ACROSS FAITHS" today** — the album's folder, `album.meta.json`
and `catalog-manifest.json` were all renamed to *Frankincense and Glory* months
ago, and the cover was not, because the old title is *pixels*. No text search
finds it and no rename touches it. `SAIM1002EN` is the same failure with a rosary
in the picture the lyrics were rewritten to remove.

Drawing the chrome here means the title comes from the album's own meta file every
single time, and it is re-read **at save time, not scan time**, so fixing a wrong
title and regenerating actually produces the fixed title.

The proportions were measured, not guessed: the chrome was drawn over existing
masters from four personas and tuned until it landed on theirs. The wordmark is
sized to a **fraction of the cover** rather than a fixed point size, because "Zev
Inspire" and "Santiago Inspire" differ by five characters and one constant would
run one of them a third of the way up the edge and the other off the top.

Untick **Draw the house chrome** to save the bare photograph.

### What differs from Article Images

Both views drive the same browser, the same runner, the same pacing and the same
three-strikes stop. Everything below is a deliberate inversion, not a variation.

| | Article Images | Cover Images |
|---|---|---|
| Shape | 16:9 landscape | **1:1 square**, centre-cropped if it comes back otherwise |
| The persona is | **among** the scene, not its subject | **the subject** |
| Wardrobe | ordinary clothing for the setting | **prescribed by the model file** |
| Framing | not centred, not looking at the lens | **right of centre, left third kept calm** |
| Text in the image | none | none — **and the chrome is drawn locally** |
| Saved as | `.webp`, quality 82 | **`.png`**, matching the masters |
| Where | `app/web/public/images/…` | **`review/<Persona>/`** — approval first |
| Reference | one neon studio portrait | **three of the persona's own released covers** |
| The record is | an `image:` field, or the file | the file in `review/`, until you move it |

The reference **inverts** rather than carrying across. An article attaches the neon
studio portrait and spends most of its clause throwing the costume away; a cover
attaches real covers, where the costume is exactly what must be kept. See
`CoverAuthorClause` beside `AuthorClause`.

### Cost

The scan is folders and one meta file per album — it does **not** open the lyrics.
The lyrics are read once, for one album, at the moment its prompt is built. The
Album Music scan measured 8.2 seconds for Jubilee's 148 albums doing it the other
way; this view would have paid that across all twelve voices every time it opened.

> **You are the review gate.** Look at every cover before it ships, and look
> hardest at the likeness and the title.

---

## Support Images

**The wide band above an album's song list.** Not the cover — a second
photograph *derived from* the cover, at 16:9, for the page where a listener is
deciding whether to press play.

```
<album>/artwork/JEIM1051EN.png              the cover master      (Covers view)
<album>/artwork/JEIM1051EN-support-1.webp   its supporting image  (this view)
<album>/artwork/JEIM1051EN-support-2.webp   a second draft
```

### It is the Covers view inverted

Every line of it. Read this table before changing either one.

| | Cover Images | Support Images |
|---|---|---|
| Queues albums with | **no** artwork | artwork **already there** |
| Picture is | **invented** from a persona brief | **derived** from a picture that exists |
| Attached to the turn | **three** of the persona's released covers | **one** — this album's own cover |
| The setting must be | **new** — never repeat an old cover's | **the same** — it is the cover's own scene |
| Shape | 1:1 square | **16:9 landscape** |
| Saved as | `.png`, matching the masters | **`.webp`**, matching the site |
| Where | `review/<Persona>/` — approval first | **the album's `artwork/` folder** |
| House chrome | drawn on afterwards | **none** — the page renders the title in real text |
| Drafts default | 4 | **2** |

**An album with no cover is not listed at all.** There is nothing to derive from,
and it is not "pending" here — it belongs to the Covers view until it has one.
Measured on the whole catalogue, 2026-08-17: **538 English albums have artwork
and no supporting image**, 234 more were skipped for having no cover, and 171
localised editions were hidden by the language filter.

### What keeps it tied to the cover

The album's own cover master is attached to the turn, cropped to its centre 80%
by the same `CoverRefBase64` the Covers view uses — and that crop earns its place
twice over here, because it removes the border, most of the wordmark up the left
edge and most of the title along the bottom. The model sees the photograph, not
the lettering it must not reproduce.

`SupportAuthorClause` then inverts both of the other author clauses. An article
clause throws the reference's costume away; a cover clause keeps the costume and
throws the **setting** away. This one keeps **everything** — person, wardrobe,
place, palette, hour of the day — and changes only the camera position and the
moment. A supporting image that invents a new setting has stopped supporting its
album and become a second, contradictory cover.

It is **not gated on "put the piece's author in the image"**. That switch belongs
to Article Images; the person here is already in the attached cover and cannot be
left out of a picture whose whole job is to match it.

### The four angles

One album, N drafts, and all four keep the same person, place, wardrobe and
light. They differ only in where the camera stands:

| | |
|---|---|
| **Widen out** | further back than the cover, the whole location visible |
| **The moment after** | the same place a beat later, released into movement |
| **The gathering** | that location filled with people enjoying it together |
| **Come in closer** | one specific joyful detail, the location still legible behind |

**Two by default, not four.** A cover leaves the whole picture open and needs
four readings of the title. A supporting image is pinned to a photograph that
already exists, so the genuine spread is narrow.

### The look is InspireManna's, carried across verbatim

`GoldenLook` and `JoyLook` are lifted from `InspireManna.com/runner/persona-image.js`
(its `GOLDEN` and `JOY` constants) rather than paraphrased. The house look is
**warm golden light**: low raking first-light or late afternoon, warm amber and
honey tones, deep gentle shadows, nothing cold or clinical, rich cinematic film
still.

It is a **named grade, not the word "warm"**, and that was measured over there
rather than guessed: the corpus once ended `Photographic, warm, unposed, 16:9`
and produced 0% golden or amber wording across 138 prompts — a look that varied
image to image instead of being recognisable. A paraphrase here is how two
properties end up "both warm" and visibly different.

### Six feet tall

**Every member of the Inspire Family, in every supporting image.** Stated on the
same terms `AgeClause` states the age — as a fact about the person that
**overrides the attached cover**, not as something to read off it.

It is deliberately not the words "six feet tall" and nothing else. **A camera
cannot photograph a measurement.** Height exists in a picture only as *scale*:
against the people nearby, against a doorway, a railing, a table, an instrument.
A prompt that gives the number and stops has said something unphotographable, and
what comes back is an average person of unspecified height. So the number is
given once and then translated into the comparisons that carry it — eyeline high
in the group, correct against objects of known size, a long figure against the
room.

**It has to work with nobody else in the frame.** Four in five supporting images
are solitary once the crowd gate has run, so a clause that only compared the
persona to other people would do nothing across most of the catalogue. The
architecture and the furnishings are the anchor there.

**The build rides along on purpose.** "Six feet tall" drifts toward heavy set and
broad shouldered without a counterweight, and the ecosystem's standing rule is
that every persona is slender — stated once in InspireManna's `persona-image.js`
so the same person has the same body everywhere. *Tall and slender* is one
instruction; splitting it invites two different answers. Two further guards ride
with it: **statuesque, never towering or looming**, and **never a giant among
small people** — everyone else is an ordinary adult height, which is what makes
six feet read as tall rather than making the world read as small.

Support images only, by Founder scope (2026-08-18). Covers and article images are
untouched. It sits immediately after the age clause in the tail, because the two
are the same kind of instruction and read as one physical description:

```
prompt + SupportAuthorClause + AgeClause + HeightClause + SupportSuffix
```

### 🔴 Is anyone else in the frame at all?

**Asked and answered before anything else, and the default is no.** A supporting
image does not get a crowd because crowds photograph well. It gets one only when
the album's own cover already had one.

The answer is read off **§8 of the persona's model file**, the per-album register,
which carries one row per released cover and a short description of what that
picture shows:

```
| 5  | JEIM1004EN | Every Tribe Sings | Guitar in a crowd of many nations | Nations |
| 13 | JEIM1012EN | Kingdom Roars     | Cheek against a white lion        | ...     |
```

That column is a written description of the exact picture this tool is about to
derive from, which makes it the cheapest honest answer available — no extra turn,
no vision call, no guess. `CompanyFor` looks this album up and returns one of
three states:

| | When | What changes |
|---|---|---|
| **Warranted** | the description names a crowd, congregation, gathering, procession, banquet… | the gathering angle is offered; the wardrobe rule applies |
| **Solitary** | there is a row and it names none of those | **the gathering angle is removed entirely**, `NoCompanyClause` forbids inventing one, and the wardrobe rule is not issued at all |
| **Unknown** | no row for this album | the turn decides *from the attached cover*, told plainly to choose the smaller number of people |

Measured over Jubilee's 78 registered covers: **15 warranted, 63 solitary.** Four
albums in five now get no invented crowd.

**Three things had to change together**, and any one left alone would have
defeated the other two:

1. **The angle is removed, not caveated.** A solitary album never receives *"fill
   the location with people"* followed by *"but do not add people"*. Contradicting
   an instruction is weaker than never issuing it.
2. **"The moment after" was reworded.** It used to end *"others arriving into the
   frame"*, which quietly made two of the four angles crowd angles.
3. **`JoyLookSolo` exists.** The house joy register asks for *"people plainly
   enjoying themselves and enjoying each other"* — a requirement for people
   hiding inside a mood instruction, and on a solitary cover it reintroduces the
   crowd the prompt just refused. A positive description always beats a
   prohibition, so the description had to go rather than the prohibition get
   louder.

The run log states the finding and its evidence, so a wrong-looking draft is
diagnosable without re-deriving anything:

```
People: NO — the cover is recorded as "Cheek against a white lion", so none are added.
People: YES — the cover is recorded as "Guitar in a crowd of many nations in colour".
People: not recorded in .models — the turn decides from the cover, defaulting to none.
```

**Refresh re-reads the register**, so correcting a row in `.models` and pressing
Refresh changes the next image. No restart.

### Who else is in the frame, and what they wear

**Only reached when the answer above was not Solitary.** Per persona, in
`CompanyWardrobe` — a table keyed by persona slug. A voice with
no entry gets no clause and the scene dresses itself from the attached cover,
which is the right default: the cover already shows the world the album lives in.
**Adding a persona is one entry.**

**Jubilee** has one, by Founder direction (2026-08-17). When the album warrants
company at all, the people around her wear bright, glamorous colour — **purple, red and maroon, blue, green, and
yellow and gold** — mixed freely both across the crowd and *within* single
garments, in fabrics with real sheen and drape. Every person a different
combination, so the crowd reads as a mass of colour rather than a uniform.

> 🔴 **She stays in white. Every garment, shoes included, turquoise at the
> throat as her only colour.** The clause says so explicitly and absolutely,
> after the colour instruction, because "everyone in the frame is in bright
> colour" is read by a generator as including the woman it is looking at — which
> is precisely how a signature look gets quietly dismantled. InspireManna's
> `WHITE_ONLY` carries the same warning for the same reason: stated once as an
> adjective it does not hold, so it is stated again as a rule about the person.
>
> **Any future entry in this table must do the same for its persona.**

**Scope: supporting images only.** Her model file's §3.4 says the opposite for
**covers** — *"radiant white as the whole world … the crowd's clothing"* — and
that is untouched, because `BuildCoverPrompt` reads `.models` and never comes
through here. The two surfaces now differ on purpose: a white-on-white cover,
and beneath it a band where she is the still white centre of a room full of
jewel colour.

The clause also carries the house modesty line — high closed necklines, sleeves
to the elbow, hems below the knee, nothing tight, sheer, cropped or low cut —
because *glamorous* is the word most likely to drift, and the glamour is meant to
be in the colour and the craftsmanship. **Note this rides on the wardrobe entry,
so the eleven personas without one carry no modesty clause on this surface yet.**

When a rule fires, the log says so, so a wrong-looking draft is diagnosable:

```
Wardrobe rule applied for Jubilee Inspire: the people around her in colour, she stays in white.
```

### 🔴 Output goes straight to the music drive

Founder decision, 2026-08-17, and it differs from Covers deliberately. There is
no review folder. **Drafts land numbered side by side and the lowest-numbered
survivor is the one the website shows**, so deleting the drafts you do not want
*is* the approval step.

Nothing here can overwrite an approved master: the name carries `-support-` and
no other part of the system reads that suffix. The sibling sweep that removes a
superseded render is **skipped for these**, and that is not tidiness — it looks
for `<slug>.<ext>` in the folder it just wrote to, which is exactly the name of
the cover master.

### Getting them onto the site

Three steps, and the picture is invisible until all three are done:

1. Keep one draft per album, delete the rest.
2. Push the album artwork to the CDN.
3. `node app/web/scripts/gen-album-support.mjs` — probes the CDN for each
   album's surviving draft and writes `public/music/album-support.json`.

The page reads that file through `lib/support.ts`. It becomes **the backdrop of
the album page's hero**, through the same `--persona-img` custom property the
stylesheet already reads — so the gradient, the sizing and the right-edge
anchoring are unchanged and only the picture differs. **No entry means the hero
falls back to the persona banner** it has always used, which is why an un-probed
catalogue looks exactly as it does today rather than broken.

The hero is rendered by `AlbumApp`, not by the page. It has to be: its backdrop
is now per-ALBUM, and the component switches albums in place without navigating,
so a hero owned by the page would keep showing the first album's picture for the
rest of the visit.

> **You are the review gate.** Look hardest at whether it is still the same
> person, in the same place, in the same clothes. A supporting image that drifts
> off its cover is worse than none.

---

## Deploy

Three places hold the site and they drift independently: this checkout, the VPS,
and the CDN bucket. `deploy-status.mjs` measures all three and shows the gap.

**Every number is measured, none assumed.** When a probe cannot run it says so and
reports `?` rather than `0`, because "I could not reach the server" and "the
server has nothing" are different answers and only one of them means press Deploy.

```sh
node wpf/deploy-status.mjs            # human readable
node wpf/deploy-status.mjs --json     # what the Studio parses
node wpf/deploy-status.mjs --no-ssh   # skip the production round trip
```

The left pane carries the **live site**, on its own WebView2. Reusing the ChatGPT
browser would tear down whatever page a generation run is sitting on, and a deploy
check is exactly when someone is most likely to have a run in flight. Both
browsers share one profile, so the ChatGPT login is neither duplicated nor
disturbed.

**Preflight only** checks the SSH key, the repo, the music drive and the Step 0
manifest gate, and changes nothing. **Deploy** confirms first, then runs
`deploy/publish.sh` with whichever flags the checkboxes set, streaming every line
into the log. It stops at the first failure.

### ⚠ Two things the probe currently finds, and does not fix

Both predate this tool. It reports them rather than papering over them, and it
does not touch `publish.sh`, because retargeting a deploy script is not a
measurement.

**1. `publish.sh` ships to a path the box does not have.** It names
`/var/www/JubileePraise.com`; the live tree is `/var/www/jubileepraise.com`, lowercase,
with the web app under `web/` rather than `app/web/` and PM2 running it as
`jubileepraise-web`. The probe therefore *searches* both and reports which it found.

**The Deploy button REFUSES while that is true — it does not warn and proceed.**
publish.sh syncs the R2 music bucket in Step 1 and ships the site in Step 2, so a
run that is going to die on a bad destination dies *after* the CDN has already
been written: new audio live against an old site. A warning someone can click
past is not good enough for that ordering. Deploy is also blocked until Refresh
has measured something, because an unmeasured session cannot know either way.

**2. The Step 0 manifest gate cannot run.** `deploy/check-manifest.mjs` looks for
`<music>/albums/<category>/<artist>/<album>`, and neither `J:/music` nor an
`albums/` level exists — the manifest's own paths are `<category>/<artist>/<album>`
under `J:/jubileepraise.com/music`. So the gate exits 2 before comparing anything, and
`publish.sh` Step 0 fails with it.

When the gate cannot run, the probe measures the same diff itself, against the
manifest's own path shape, and **labels the number with which of the two produced
it**. The gate stays the authority; the fallback exists so the one number that
matters is not left unmeasured.

Repairing the gate needs one decision that is not a measurement — **what counts as
a category** — because the drive carries folders the manifest has never named:

| Scope | Categories | On disk | Would add |
|---|---|---|---|
| **A** — the roots the manifest already uses | children · faith-based · general · inspire · nations · tiny-tiggles | 1400 | **462** |
| **B** — every category folder on the drive | A, plus christmas · hebrew · party-giggles · prayers | 1892 | **954** |

Measured 2026-08-11 against 982 manifest albums. The difference is whether
`party-giggles` (344), `prayers` (140) and `hebrew` (8) belong to this catalogue
or to their own properties. Under either scope **`inspire` alone is missing 152
albums**, and **44 albums are in the manifest but not on disk**.

The probe uses Scope A, the conservative reading, and says so. `check-manifest.mjs`
is left untouched until the scope is settled.

---

## What changed coming back to JubileePraise

| | InspireManna | Now |
|---|---|---|
| Sections | seven category folders on the article drive | **four**: `core/articles` + three `core/backstage` folders |
| Source shapes | one (frontmatter) | **two** — frontmatter, and a ` ```prompt ` fence with no fields at all |
| Frontmatter | `key: "quoted"` | **unquoted** `key: value`, camelCase keys |
| Done marker | `image_file` field | `image:` field **or** the file on disk, per section |
| `image:` field | required to exist | **inserted after `imagePrompt:`** when absent |
| Portrait names | `persona_<Name>.png` | **`<Name>.png`** |
| Music view | an article's two songs | **the album corpus**: lyrics out, `tracks/*.mp3` back, publish gate |
| Deploy probe | `runner/deploy-status.js` | **`wpf/deploy-status.mjs`**, in this folder |
| Repo marker | `runner/article-stats.js` | `core/articles/gen-articles.mjs` |
| WebView2 profile | `%LOCALAPPDATA%\InspireManna\…` | `%LOCALAPPDATA%\JubileePraise\Studio\webview2` |
| Tool location | `tools/ArticleImageStudio` | `wpf/` |

The ChatGPT login from the older in-repo tool is migrated once on first launch
from `tools/ArticleImageStudio/.webview2`, so you do not log in again.

**No fallback repo path.** The older build defaulted its root to a hard-coded
`W:\JubileePraise.com` when it could not find its marker, which means a stray copy of
the exe anywhere on the machine would have written into that repo. An unresolved
root now says which folder it started from and refuses to scan.

`deploy/publish.sh` already excludes `./wpf` from the deploy tarball, so nothing
in this folder ships to production.

---

## ⚠ Honest caveat

Automating the ChatGPT web UI (submitting prompts, attaching files, pulling the
generated image) may conflict with **OpenAI's Terms of Use**. This app does
**not** defeat the bot / human check — *you* pass that yourself in a real browser
— but the attachment and prompt submission afterward are automated, against your
own session, at your direction.

## 🔴 The hang, and the watchdog

**Symptom:** the log sits on `…still waiting (6 image(s) on page, ~287s left)`
counting down for six minutes, the prompt is visible in the composer, and the
send button is showing as a **stop** button. Then it does it again on the next
image, and the one after, and the run stops after three.

**Cause — the submit was reporting success it could not know about.**
`SubmitScript` scheduled its click inside `setTimeout(…, 450)` and returned
`'submitted'` immediately: before the click had happened, and without ever
checking there was a send button to click. That guess is wrong in exactly one
case, and it is the case that bites — **while ChatGPT is streaming, the send
button IS the stop button.** The selector finds nothing, the synthetic Enter
fallback is ignored (ProseMirror does not act on untrusted key events), and the
prompt sits in the box unsent while the run waits out a six-minute deadline for
an image nobody asked for. On failure the run kept the same thread, so the next
two pieces went into the same wedged conversation: ~18 minutes, three pieces
burned, nothing generated.

**Four fixes, and they are a chain:**

| | |
|---|---|
| **Don't type into a streaming composer** | `WaitUntilComposerIdle` waits up to 90s for the stop button to go away first. |
| **Report what actually happened** | The submit is synchronous now and returns `clicked` · `enter` · `busy` · `disabled` · `mismatch` · `no-composer`. No more `submitted` as a guess. |
| **Verify the send landed** | The only proof a turn left the machine is the composer **emptying**. Checked for ~5s before anything waits on an image. |
| **Never reuse a failed thread** | `inThread = 0` on failure, so the next piece opens a fresh conversation instead of walking back into the wedged one. |

### 🔴 The 700ms between typing and sending is load-bearing

**Do not collapse the type and the click into one script call.** It was tried and
it broke generation outright.

The original code clicked inside a `setTimeout(…, 450)`. That reads like
defensive padding and it is not. `execCommand` puts the text in the DOM the
instant it runs, but the composer is a **React-controlled ProseMirror** and React
does not hold that content until it has processed the `input` event on a later
tick. Click send in the same tick and the turn submits what React still believes
the box holds — nothing — **with the attachment still on it.** ChatGPT then
answers:

> *"I can see the cover clearly. Tell me what you want me to do with it — create a
> wide 16:9 companion banner, edit the existing artwork…"*

Measured: three consecutive albums failed exactly that way, `0 generated, 3 failed`.

**The read-back check cannot catch this.** It reads `innerText`, which is the DOM,
and the DOM is correct — it is React that is behind. So the only defence is the
wait, and it now lives in the caller (`SubmitScript` types, `ClickSendScript`
sends) where its result can actually be inspected. That keeps both things: the
original timing, and a return value that reports what really happened.

### Every prompt ends by forbidding a conversation

All three closing suffixes — `AspectSuffix` (16:9), `SquareSuffix` (covers) and
`SupportSuffix` — end with **GENERATE THE IMAGE NOW**: no text reply, no asking
what to do with the attachment, no offering options. It goes last because the
last instruction is the one the composer honours most reliably.

This is belt and braces with the fix above, and it earns its place: the signed-in
account carries custom instructions that make ChatGPT answer conversationally
(replies come back with a persona speaker tag), so a prompt that leaves any room
to talk will get talked to.

### The stall watchdog

**Two minutes with the page completely static and the conversation is abandoned**
— the run opens a fresh thread and retries that image, rather than sitting out
the rest of the six-minute deadline.

> **"Static" is measured, and deliberately not "the stop button is missing".** A
> wedged conversation can sit there with its stop button showing and nothing
> behind it — that is the exact state this was reported in, so trusting the
> stream flag would have called a dead thread alive. `ProgressProbeScript`
> fingerprints the three things that move when work is really happening: the
> count of large loaded images, the length of the last assistant message, and the
> stream flag. **Any change resets the clock.** A genuinely slow render is
> growing one of those and keeps its full six minutes; only a frozen page is cut
> short.

The deliberate "Something went wrong" backoffs (20s / 45s / 90s) reset the
watchdog clock too — that is time spent *told* not to poll, not evidence of a
stall, and without the reset a 90s backoff would leave its retry only thirty
seconds before being declared dead.

Recovery routes through the `PageFailed` path that already existed: pause 30–60s,
open a brand-new conversation, retry the piece once. The waiting line now also
says how long the page has been idle, so a stall is visible before it fires.

---

## If ChatGPT changes its layout

The DOM selectors live in one place — the `*Script()` methods at the bottom of
`MainWindow.xaml.cs`. If a run stops finding the chat box, the attachment or the
image, adjust them there. The ones that matter most:

| Script | Breaks as |
|---|---|
| `ComposerPresentScript` | "Chat box never appeared — are you logged in?" |
| `AttachScript` | "Could not hand the author portrait to the page" |
| `AttachmentStateScript` | "The page never showed the attached portrait" |
| `ListImagesScript` | no image detected, or the wrong image saved |

`ListImagesScript` carries one filter that is easy to remove by accident and
expensive to lose: it **excludes images inside user turns and inside the
composer**. Every turn carries an attached portrait, and once sent it renders
again inside the user's own message bubble under a fresh URL. Without that filter
it is the newest unseen large image on the page for as long as the real one takes
to render, holds still across two polls, and gets saved into the piece — an
article illustrated with a neon studio portrait of its own author. The filter
fails *open*: if the attribute it keys off disappears, detection reverts to the
old behaviour rather than finding nothing at all.
