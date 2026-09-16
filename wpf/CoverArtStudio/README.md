# Jubilee Cover Art Studio (WPF + WebView2)

A Windows desktop app for making pictures: the album covers this catalogue is
missing, and anything else you need an image for.

It hosts a **real browser** (WebView2 / Edge-Chromium) so you log in to ChatGPT
yourself — the human check passes normally, because it is a genuine browser, not
an automation-flagged one — and then drives *your own logged-in session* to
generate each picture.

```
dotnet build -c Release          # or double-click Build-And-Run.cmd
bin\Release\net8.0-windows\JubileeCoverArtStudio.exe
```

Requires the **.NET 8 SDK** and the **WebView2 Runtime** (already present with
Edge on Windows 11).

---

## The window

```
+-------------------------------------------------------------------+
| ◉ Jubilee Cover Art Studio   whole catalogue    Website [ … v ]    |
+---------------------------------------+---+-----------------+-----+
|                                       | | |                 |     |
|   the real browser (ChatGPT)          |<->|  the panel:     |  🎨 |  Album Covers
|                                       | | |  one of four    |     |
+---------------------------------------+ | |  views          |  🖼 |  Image Studio
|============== splitter ===============| | |                 |     |
|  log: full pane width, no heading     | | |                 |  🎬 |  Hero Images
+---------------------------------------+---+-----------------+     |
                                                                 ⚙  |  Settings
```

The strip on the far right switches what the panel shows. Three working views at
the top, settings pinned at the bottom. Both splitters are draggable and both
positions are remembered in `coverart.config.json`.

| | View | What the panel lists | The button |
|---|---|---|---|
| 🎨 | **Album Covers** | every album on the music drive with no `artwork/<CODE>.png` | **Generate Covers** |
| 🖼 | **Image Studio** | everything in the output folder, newest first, with thumbnails | **Generate Images** |
| 🎬 | **Hero Images** | every album that HAS a cover, and whether it has a 16:9 hero yet | **Generate Hero Images** |
| ⚙ | **Settings** | repo root, music root, studio output, hero output, generation location | **Save settings** |

The application icon is the **Jubilee circle** — built from
`app/web/public/images/JubileeLogo.png` by `tools/make-icon.ps1` into seven sizes
(16 → 256, PNG-compressed) so the taskbar and the large shell views both get a
real raster rather than an upscaled 32px one. Re-run that script if the logo ever
changes; nothing rebuilds it automatically.

---

## Album Covers

Walks the music drive, lists every album whose `artwork/` folder has no picture
in it, and generates one per album — or four, from four different angles.

**The prompt is BUILT, never stored.** There is no cover `.md` to hold one, and
there should not be: `.models/model_<voice>.md` is the source of truth for how a
persona's covers look, and a copy in a second place would be free to drift from
it. Each prompt is assembled at the moment the album is sent, from:

1. the **"Generation brief"** section of that persona's model file — located by
   its heading text, not its number, because the section is §11 in some of the
   twelve files and §12 in others;
2. the album's **own content** — the title out of `album.meta.json`, the theme
   and genre out of `app/web/public/music/album-themes.json` and
   `album-genres.json`, and its song titles out of its lyrics file;
3. an **assigned angle, shot and light**, rotated per album and per draft;
4. the **register of what this persona has already done**, read out of the
   per-album table in the model file, worded as *find a different one of equal
   beauty* rather than as a bare ban;
5. the **commercial bar** — the clause that says this has to be a record sleeve
   someone would stop scrolling for, not an illustration of the title.

**Three of the persona's own released covers ride along as attachments.** One
exemplar teaches a look and gets copied; three different ones teach a range. They
are centre-cropped to 80% before being sent, which removes most of the wordmark
and the title baked into them — asking for no lettering while showing lettering
is a fight worth avoiding.

### The four drafts

One interpretation of a title is a coin toss. "Named Before the Likes" read
literally produces an egg: clever, correct, and a cover nobody would ever pick
up. So each album is attacked from four angles — **celebration**, **majesty**,
**wonder**, **intimacy** — and you keep the one that works.

### The chrome is drawn here, not generated

Every cover in the catalogue carries a border, the persona's name in script up
the left edge, and the album title along the bottom. **None of it is generated.**
The prompt demands a photograph with no text of any kind, and `ApplyChrome` draws
the rest afterwards in WPF, taking the title from the album's own
`album.meta.json` **every time**.

That is not tidiness. `AMIM1001EN` still publishes "BRIDGE ACROSS FAITHS" over an
album whose folder, meta and manifest were all renamed to "Frankincense and
Glory" months ago, and nothing caught it — because the words are pixels, so no
text search finds them and no rename touches them. Drawing the chrome here means
fixing a wrong title is: fix the meta, regenerate, done.

Untick **Draw the house chrome** to save the bare photograph.

### 🔴 Nothing here touches the music drive

Drafts land in **`review\<Persona>\<Album Title> (CODE) - N.png`**. The drive
holds approved masters; this produces candidates. A candidate that wrote itself
straight into `artwork/` would be indistinguishable from an approved one the
moment it landed — and would mark the album covered, so it would never be offered
again.

Moving an approved draft into the album's `artwork/` folder is a decision, and it
is made by hand. An album with a draft already waiting shows **◷ — in review**
and is not queued again; delete the draft to ask for another.

---

## The wardrobe rule — no bridal, no wedding, no groom

**Applies to both generated views**, covers and heroes. `NoBridalClause` in
[Covers.cs](Covers.cs) is the single copy; both prompt builders append it.

The signature wardrobe of several of the family is a long white or iridescent
gown, and **Jubilee's is white by definition**. A white floor-length gown
photographed in a garden, a hall or a procession is one veil away from a wedding
photograph — and the generator does not know that is a line. It will add the
veil, the bouquet and the flower arch unprompted, because that is what its
training says goes with the dress. The result reads as a marriage ceremony
involving a persona, which must never ship.

**The reverse-engineering case is the worst case**, which is why the clause
matters most in the Hero view. A hero is made by handing the model an album cover
and saying *keep the wardrobe identical* — so a cover that already reads as bridal
would be faithfully widened into a bridal **banner**, and a banner is the thing
that goes across the top of a page. The clause therefore carries its own explicit
override, and the hero prompt's identity lock names it as the one exception to
"keep everything the same".

### Positive first, then discrete nouns

The order is the whole design, and it is a deliberate reading of the lesson
`BuildClause` records — that naming a wrong reading in order to forbid it
**plants** it.

That lesson is about **attributes**: "not heavy" cannot be subtracted from a body,
because there is no body without a build. It does not hold the same way for
discrete removable **objects** — a veil, a bouquet, an altar are either in frame
or not, and this same file already forbids "empty rooms" and "text of any kind"
successfully.

So the clause does both, in this order:

1. **positively** states what the wardrobe *is* — ordinary contemporary clothing,
   day-wear, stage wear or festival clothes, in the signature colours, and where
   that signature is white it **stays** white — so the model has something to
   render rather than an absence to honour;
2. **then** names the specific objects and events that must not appear: veil,
   trailing train, carried bouquet, tiara, buttonhole, rings exchanged, altar,
   aisle, flower arch, tiered cake, matched attendants, tailcoat or tuxedo, or a
   couple posed as though being married.

The phrase "wedding dress" is **never used to describe the gown**, anywhere, for
exactly the reason above. The word "bridal" appears once in the whole assembly, in
the override sentence.

Both suffixes carry a positive reminder — *"the clothing is ordinary contemporary
wear and the occasion is an ordinary one"* — in the last clause of the turn, which
is the most strongly honoured position and therefore the worst possible place to
name the reading being avoided.

> One known and accepted degradation: pass 5 of `SanitizeForFilter`, the
> last-resort content-filter rewrite, strips every `This OVERRIDES the attached
> reference images…` sentence — the age and build overrides as well as this one.
> The positive prescription and the object list survive it; only the override does
> not. Pass 5 exists to get *anything* through, and it is reached only after four
> earlier rewrites have failed.

### Jubilee: a skirt below the knee, in two pieces (2026-09-11)

A Founder direction after complaints — see `.claude/sessions/DECISIONS.md`
D-2026-09-11-1. `ModestWardrobeClause` in [Covers.cs](Covers.cs), read **after**
`NoBridalClause`, which it narrows:

- a **long skirt, hem well below the knee** — mid-calf to ankle — in every pose;
- **two separate pieces**: the skirt in white, cream or pearl, and a separate top or
  jacket in a **second colour** (turquoise, soft gold, sky blue, silver-grey). A long
  white skirt under a white bodice *is* the gown that read as bridal; lengthening
  the hem alone makes that worse. Separates in two colours cannot read as one gown;
- it is phrased as a **change** — *if the attached image shows trousers, jeans,
  shorts … replace them* — because a hero copies its cover's wardrobe unless told,
  in so many words, to change it.

It applies to the personas in `SkirtOnlyPersonas`, which is `Jubilee` alone. One
word widens it. Nobody decided it for anyone else.

Two more clauses ride with it, on covers and heroes both: **`ProportionClause`**
(true adult proportions, full size in the scene — every persona) and
**`SelfCheckClause`** (check the hem, the ceremony list and the proportions before
returning, and fix what fails). The suffix, the last and most honoured clause,
repeats the hem and the proportions in one positive sentence. None of these
sentences begins `This OVERRIDES the attached reference images`, so pass 5 of
`SanitizeForFilter` cannot strip them.

**The Image Studio deliberately does not carry this clause.** It has no persona
and no album — everything it sends is what was typed, by design. A silent ban
there would be the app overriding an explicit instruction from the person using
it.

---

## Image Studio

A prompt box, a shape, a draft count, an output folder, and optional reference
images you can drop straight onto the panel. Same browser, same runner, same save
path — no album.

It deliberately does **not** append the persona clauses. No age, no build, no
wardrobe, no "the subject is the artist". Those exist because a cover has to sit
beside eighty other covers of the same person; a free generation has no such
obligation and the clauses would fight whatever was actually asked for.
Everything it sends is what you typed, plus the shape and a *return the picture,
do not chat about it*.

- **Shape** is appended as the prompt's last clause, which is the instruction the
  web UI honours most reliably.
- **References** are attached uncropped — you picked those files, and trimming a
  fifth off them without saying so would be the app quietly discarding part of
  what it was given. Four is the limit: past that the attach step takes longer
  than the generation does.
- **Output** defaults to `review\_studio`, outside every album's artwork folder
  and outside the per-persona review folders, on purpose.
- **Nothing is ever overwritten.** A name already in use gets `(2)`, `(3)` …
  A generated picture is a GPU render and a two-minute wait; silently replacing
  one is the single failure that cannot be undone from inside the app.
- **The gallery is read off disk**, not remembered, so it survives a restart and
  a file deleted in Explorer disappears from it on the next Refresh.

---

## Hero Images

A cover is 1:1 and carries the house chrome — the inset border, the persona's
name in script up the left edge, the title along the bottom. That is the
signature, and it is exactly what makes a cover unusable as a page banner. A
website hero needs the opposite: **wide, quiet, no lettering**, with somewhere for
a headline to sit.

So this view takes the cover that **already exists** and asks for the same
photograph **widened**. Pick a persona; every album of theirs that has artwork
becomes a job whose one reference is its own cover.

### It widens, it does not crop

A 16:9 crop of a square cover throws away the top and bottom of the composition
and lands on the subject's chin. What a hero needs is the frame *opened* — the
scene continuing past the left and right edges of the square, which is what the
square was cut out of in the first place. The prompt says so explicitly, and it
locks everything else down: the same person and likeness, the same hair, the same
wardrobe and its exact colours, the same location, the same props, the same hour,
the same weather, the same palette, the same light. It has to read as another
frame from the same shoot taken seconds apart with a wider lens — not as a new
picture inspired by it.

### 🔴 The chrome must not survive

The attached reference is a finished sleeve, covered in text. A model handed that
picture will faithfully reproduce the border, the wordmark and the title, because
they are part of what it was shown. Saying "no text" once is not enough when the
reference *is* text, so it is defended three times over:

1. the reference is **centre-cropped to 80%** before it is sent, which removes
   most of the wordmark and the title (the same crop the covers view uses);
2. `HeroChromeClause` names each element and says the photograph *underneath* the
   sleeve design is the subject, not the sleeve design;
3. the suffix says it again as the **last clause of the turn**, which is the
   instruction the web UI honours most reliably.

### The three framings

Fewer and calmer than the covers' four angles, on purpose: a cover has to stop a
scroll and is allowed to be dramatic, but a hero sits *under* a headline and above
body text, and a dramatic one fights the page it is on.

| | |
|---|---|
| **The establishing wide** | Camera well back, subject smaller and off-centre. The calmest reading, and the one that works under a headline. |
| **The cinematic two-thirds** | Subject roughly where the cover had them, world running out to both sides with real depth — an anamorphic film still. |
| **The moment either side** | One beat before or after the cover's instant, so the hero reads as a companion frame rather than a stretched copy. |

The **text-safe third** alternates left/right per draft, so a persona's heroes do
not all reserve the same corner.

### 🔴 These are written INTO the website

Covers go to `review/` because a cover that wrote itself into `artwork/` would be
indistinguishable from an approved master and would mark the album covered. **A
hero has no such hazard** — nothing reads this folder to decide whether an album
is finished, and no publish step promotes it. So it lands where the site serves
static files from:

```
app/web/public/images/heroes/<persona-folder>/<CODE>.webp
    ->  /images/heroes/melody-inspire/MDIM1043EN.webp
```

By **persona folder**, because that is how the music drive is organised and how a
person looking for "Melody's heroes" would look for them. By **album CODE**, not
title, because the code is what every other part of this system keys on — a
title-keyed filename orphans its picture the moment an album is renamed, which is
the same failure that left `AMIM1001EN` publishing "BRIDGE ACROSS FAITHS" for
months.

**Nothing is ever overwritten.** A second generation lands as `<CODE> (2).webp`.
The site reads `<CODE>.webp`, so a new draft never silently replaces the one
already in use — promoting a better draft is a decision, made by deleting the
first. For the same reason **Regenerate is off by default**: the picture it would
add alongside is one the live site may already be serving.

### ↻ Marking a hero for regeneration

**Mark for regeneration** moves the selected album's hero — never deletes it — to

```
review\_heroes-rejected\<persona-folder>\<CODE>.webp
```

and the move *is* the mark. The site stops serving the rejected picture (nothing
under `review\` is public, and `review/` is git-ignored); the album has no hero
again, so it is back in the queue and shows **↻ — marked for regeneration**; and the
next generation lands as `<CODE>.webp`, the name the site reads, instead of as a
`(2)` beside the picture that was rejected. Moving the file back undoes it. Once a
new hero exists the mark is gone on its own.

Tick **Only albums marked for regeneration** to queue just those, and not albums
that have simply never had a hero.

WebP rather than PNG, because these are browser assets — the one place in this
repo where WebP is the right archive format rather than a lossy step away from
one. `app/web/public/images/backstage` is already WebP throughout.

> These are **not** pushed to `cd.jubilujah.com`. The CDN carries the music and
> the album artwork; a hero is a page asset and is served by the site itself, so
> making one *is* publishing one — it needs a commit and a deploy, nothing more.

---

## What it is doing to the browser

All of it lives in [ChatGpt.cs](ChatGpt.cs), ported unchanged from
`wpf/JubileePraiseStudio` and, before that, from
`InspireManna.com/tools/ArticleImageStudio`.

> 🔴 **The comments in that file are the most valuable thing in it.** Almost every
> delay, read-back and check-it-twice is a measured fix for a failure that
> actually happened. Do not tidy them away, and do not remove a wait because it
> looks like padding.

The sequence, per image:

1. **Open a conversation** at the generation location, and let the page settle
   3.5–6s. The composer exists well before the page has wired up its session, and
   a prompt submitted into that gap is the most reliable way to earn "Something
   went wrong" on the first image of a run.
2. **Attach the references** and wait for the composer to show each thumbnail
   twice in a row, then settle. The file input accepts instantly; the upload
   behind it does not, and a turn sent mid-upload arrives with nothing attached.
3. **Wait for the composer to go idle.** While ChatGPT is mid-turn its send button
   *is* the stop button, so a submit into that window cannot land — and the prompt
   then sits in the box unsent while the run waits out a six-minute deadline for
   an image that was never requested. That is the hang.
4. **Type, read back, wait 700ms, then click send.** The read-back refuses to send
   a mangled prompt. The 700ms is React: the text is in the DOM the instant
   `execCommand` runs, but the composer is a React-controlled ProseMirror and does
   not hold it until the input event has been processed on a later tick. Sending
   inside that gap submits an *empty* message with the attachment still on it, and
   ChatGPT replies asking what it is supposed to do with the picture.
5. **Confirm the send landed** by watching the composer empty. A click on a button
   that is present but inert leaves the prompt sitting there.
6. **Watch for a new, large, fully-loaded image** that holds still across two
   polls — while also watching for the failure banner, the content-policy refusal,
   and a two-minute stall fingerprint that says the conversation is wedged.
7. **Fetch the bytes inside the page**, so the request carries the logged-in
   session's cookies, and post them back over `postMessage`.

### When a run goes wrong

| What happens | What it does |
|---|---|
| "Something went wrong" | Backs off 20s, 45s, 90s, pressing the page's own Retry each time |
| Content filter refuses | Rewrites the prompt in five escalating passes and resubmits — a fresh thread cannot help, because the prompt is what was rejected |
| Conversation wedged (2 min with nothing moving) | Abandons it and opens a fresh one |
| Three failures in a row | Stops the run. That is a quota or capacity wall, and grinding on would burn every remaining job against it |

Between images it pauses 20–45s at random. Image generation is far heavier than a
text turn, and hammering it is what earns the failure banner in the first place.

---

## Settings

| Field | Default | Notes |
|---|---|---|
| Repo root | walked up from the exe | Found by the marker `core/articles/gen-articles.mjs`. **No hard-coded fallback** — a stray copy of the exe must not write into this repo from somewhere unexpected |
| Music root | `J:\jubileepraise.com\music\inspire` | 🔴 See the warning below |
| Studio output | `review\_studio` | Where free generations land |
| Hero output | `app\web\public\images\heroes` | Inside the website on purpose — moving it outside `app/web/public` means the heroes stop being servable |
| Generation location | `https://chatgpt.com/` | Point it at a ChatGPT Project and every generation is created inside that project |

Saved to `coverart.config.json` beside the project, which is git-ignored.

> 🔴 **`J:\jubileepraise.com\` was created EMPTY by the 2026-08-27 rename.** The
> ~41 GB of music and the master manifest are still at `J:\jubilujah.com\music\`.
> If the covers view reports "Music root not found" or lists nothing, that is why:
> point Music root at the old path, or junction the folder. See
> [CLAUDE.md](../../CLAUDE.md) → "Drives and paths".

### What the window remembers

Written to `coverart.config.json` when the window closes, and again on **Save
settings**:

| | |
|---|---|
| `window.left` / `top` | Position on the **virtual desktop**. Legitimately negative — a monitor left of the primary one has negative X, and this machine's desktop runs from x = -3843 to 3840 |
| `window.width` / `height` | The **normal** (restore-down) size |
| `window.maximized` | Whether it was maximised |
| `layout.panelWidth` | The right-hand panel, i.e. how much room the browser gets |
| `layout.logHeight` | The log pane at the bottom |

**🔴 The size saved is `RestoreBounds`, never `Left`/`Top`/`Width`/`Height`.**
While a window is maximised those four properties report the *maximised*
rectangle, so saving them would record the full-screen size as the normal size —
and the window could then never be restored to the size actually chosen.
`RestoreBounds` is the framework's own record of the normal rectangle and is
correct in every state.

**🔴 The saved rectangle is validated against the monitors that exist now.** A
window last closed on a second monitor that is no longer attached would otherwise
be restored completely off-screen: present in Alt-Tab, unreachable with the mouse,
and indistinguishable from the app failing to launch. The restored rectangle has
to *intersect* the current virtual screen by at least 160 × 40 px, or the position
is dropped and only the size is kept. Intersection rather than containment — a
window deliberately left hanging off the edge of a screen is a legitimate thing to
want back, and demanding the whole rectangle fit would move it every time.

The startup banner says which happened (`window  restored to …`, or `saved
position … is off every current monitor`), because on a nine-monitor rig "why did
it come back there" is not answerable by looking at the window.

A **minimised** window reopens normally rather than minimised. Its placement is
still saved correctly — `RestoreBounds` survives minimising — but a window that
reopens straight to the taskbar is indistinguishable from a launch that failed.

### The browser profile

Its own folder, at
`%LOCALAPPDATA%\JubileePraise\CoverArtStudio\webview2` — **not** the one
JubileePraise Studio uses.

Two Chromium processes cannot share a user data folder; the second to start fails
outright. Sharing the profile would mean the two studios could never be open at
the same time, which is exactly when you want both — covers generating in one
while the other deploys. The cost is one extra ChatGPT login, once.

It is on **C:** and that is deliberate, as an exception to this workspace's
drives rule. Chromium does not support a user data folder on a network path: the
browser process faults with `STATUS_IN_PAGE_ERROR` (0xc0000006) the moment the
share goes stale, which kills the pane and then the app.

---

## The website picker

Scopes the **Album Covers** worklist to one tenant's catalogue. The list is read
from `tenants/*.json`, which is the repo's own source of truth — a tenant added
there appears in this picker without a code change.

It does **not** scope the Image Studio. That view has no album, so there is
nothing for a tenant to narrow; it writes wherever its output folder points.

---

## ⚠ Honest caveats

- **Nothing here is reviewed automatically.** Look at every picture before it
  ships, and look hardest at the likeness.
- **This automates the ChatGPT web UI**, which may conflict with OpenAI's Terms
  of Use. It runs against your own logged-in session, at your direction.
- **If ChatGPT changes its layout**, [ChatGpt.cs](ChatGpt.cs) is where it breaks
  and where it is fixed. The selectors are deliberately loose and fail *open*: a
  missing attribute makes a filter stop matching rather than match nothing.

---

## Relationship to the other studios

| | |
|---|---|
| `wpf/` — **JubileePraise Studio** | The full publishing workflow: article images, support images, album lyrics ↔ Suno, the deploy, **and** a Cover Images view. |
| `wpf/CoverArtStudio/` — **this** | Cover art on its own, plus a general-purpose image bench. No deploy machinery in the window. |
| `tools/ArticleImageStudio/` | The older in-repo article-image tool this line descends from. |

The two studios share a lineage and a look, not code: this is a port, and the
copies can drift. When a fix lands in `ChatGpt.cs` here that also matters there —
a changed ChatGPT selector, say — it has to be made in both.
