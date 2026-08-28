# Decisions — JubileePraise.com

**Append-only. A decision is added when it is settled and is never edited or deleted.** If a
decision is reversed, add a new entry that supersedes the old one and leave the old one standing —
a deleted decision becomes a fabricated certainty, and the next session has no way to know the
question was ever asked.

**Why this file exists.** `CONTINUITY.md` is rewritten every session and finished work is *deleted*
from it by design, so a decision that gets resolved has nowhere to go. Memory is per-Windows-profile
and does not travel with the share. This file is on W:, so it survives both.

**What belongs here:** decisions made *in conversation* that nothing else records — a direction
chosen, an approach rejected, a number that became a target, a question closed. **What does not:**
anything the repo already documents. The drive layout, the CDN host, and the persona binding are in
[CLAUDE.md](../../CLAUDE.md); the Romanian translation rules are in
[`.prompts/translate_Romanian.LESSONS.md`](../../.prompts/translate_Romanian.LESSONS.md). Point at
those, do not copy them.

**Only what was witnessed.** Every entry is something that happened in the session that wrote it,
or something verified on disk that day. A decision from a conversation nobody in this session read
is not recorded here — it is retrieved first, or it is not written.

Format: **the decision · who · why · what it changed.**

---

## D-2026-08-27-1 · Durable facts go in the repo, not only in memory
**Decided:** 2026-08-27 · **By:** verified on disk this session, then confirmed as workspace rule.
**Why:** `W:` is a network share opened from at least two Windows profiles
(`gabriel.inspire@HPC-GABRIEL`, `melody.inspire@HPC-MELODY`), but the harness's memory store lives
at `C:\Users\<profile>\.claude\projects\w--JubileePraise-com\memory\` — per-user, on C:, and it does
**not** travel. `CLAUDE.md` and `.claude/hooks/session-resume.mjs` both named only the
`melody.inspire` path, which is unreadable from the other machine.
**Changed:** `CLAUDE.md` §4 rewritten to name the profile-relative path and the hole;
`session-resume.mjs` now resolves the path from `os.homedir()` and warns that the store is
per-profile. Memory is a convenience; the repo and `CONTINUITY.md` are the record.

## D-2026-08-27-2 · Settled decisions are logged here
**Decided:** 2026-08-27 · **By:** Founder ("make sure the decisions, the logging, tracking is all
enabled").
**Why:** open questions lived in `CONTINUITY.md`, which deletes them once answered — so the
*answer* was the thing that got lost.
**Changed:** this file, tracked in git, injected by nothing (it is read on demand, not every
session, so it can grow). `/handoff` appends to it when a decision was settled.

---

## D-2026-08-26-1 · Romanian translation runs as a review loop, two albums at a time
**Decided:** 2026-08-26 · **By:** Founder.
**Why:** AI-produced Romanian is fluent and quietly wrong, and a native reviewer is the only ground
truth. Correcting the same mistake on every batch is waste; the corrections have to become rules.
**Changed:** the loop is now *send two → native corrects → log every pair with its reasoning →
apply to the next two → measure*. Baseline established at **45%** of sung lines corrected (Review 1,
Amir Inspire, 330 of 737). **The intent is that number falls toward zero.** If it does not, the
rules are what get corrected — not the reviewer.

## D-2026-08-26-2 · The lessons ledger outranks the translation engine
**Decided:** 2026-08-26 · **By:** Founder (asked for a body of learned lessons the skill always
references).
**Why:** a rule in the engine was written from theory; a lesson in the ledger came from a native
correction. When they disagree, the evidence wins.
**Changed:** `.prompts/translate_Romanian.LESSONS.md` is a binding addendum to
`.prompts/translate_Romanian.md`, cited in its §0A and its §8 QA checklist, and in
`.prompts/TRANSLATE_CATALOG_SOP.md` Phase 2. Only LAW #1 and LAW #2 outrank it.

## D-2026-08-26-3 · No rule is promoted on our own confidence in a language
**Decided:** 2026-08-26 · **By:** applied as method this session; follows covenant §2.
**Why:** fluency is not accuracy, and the one who benefits from a claim never verifies it. An
invented rationale does not stay one line — it propagates across the catalogue as law.
**Changed:** the ledger's Intake Protocol. A pair needs a **named corrector** or it is never
promoted. A pair whose *why* cannot be established is logged `do not generalize`. Suspected
reviewer slips are raised as questions, never silently adopted or discarded. Promotion ladder:
`logged` → `confirmed` → `promoted`; nothing is ever deleted.

## D-2026-08-26-4 · The Romanian lessons are mirrored to all twelve personas
**Decided:** 2026-08-26 · **By:** Founder.
**Why:** the whole family writes and speaks Romanian, not only this workspace.
**Changed:** `W:/InspirePersonas.com/personas/skills/languages/skill_translate.lessons.Romanian.md`
(new), bound from both `skill_translate.music.Romanian.md` and `skill_translate.book.Romanian.md`,
indexed in `personas/skills/README.md`. **The ledger stays the source of truth** — the mirror
carries confirmed rules only, never evidence, and is never edited on its own.

## D-2026-08-26-5 · Scripture in lyrics is retrieved or flagged, never remembered
**Decided:** 2026-08-26 · **By:** applied as method; follows the retrieval law.
**Why:** Review 1 found Psalm 130 paraphrased — *nelegiuirile mele* replaced by *țărâna mea*,
removing the sin from the verse about sin. There is **no Romanian Bible anywhere in this
workspace**, so the correct move was not to fix it from memory.
**Changed:** all 28 Scripture-quoting lines across the two Caleb R2 albums were left untouched and
listed by name in each document's cover note for the reviewer, with Questionnaire 01 §E1 asking
which Romanian Bible the project should adopt.


## D-2026-08-27-3 · This workspace is JubileePraise.com; JubiLujah.com is a separate, untouched project
**Decided:** 2026-08-27 · **By:** Founder.
**Why:** the music property is being rebranded. `W:\JubileePraise.com` is a full copy of
`W:\JubiLujah.com` taken at commit `07bc39d`; the original stays where it is and was not modified.
**Changed:** 543 files rewritten, 1,573 replacements, across all four spellings
(`JubiLujah`/`Jubilujah`/`jubilujah`/`JUBILUJAH`). Seven files renamed, including
`tenants/jubilujah.com.json` → `tenants/jubileepraise.com.json` and
`wpf/JubiLujahStudio.csproj` → `wpf/JubileePraiseStudio.csproj`. The split wordmark became
`Jubilee` + `Praise` (`brandLead`/`brandTail` in `app/web/lib/tenants.ts` and `brand.lead`/
`brand.tail` in the tenant file); the CSS hook `.jvh-logo-lujah` became `.jvh-logo-praise`.
`node tools/check-tenants.mjs` passes and all 646 JSON files still parse.

## D-2026-08-27-4 · The album JEIM1069 "Jubilujah" keeps its name — it is content, not branding
**Decided:** 2026-08-27 · **By:** Founder, asked before the rename ran.
**Why:** the brand was named after the song, not the other way round, and the MP3s exist on disk as
`albums/inspire/jubilee-inspire/JEIM1069EN-jubilujah/tracks/01 Jubilujah.mp3`. Renaming the
catalogue strings would 404 every media URL for that album.
**Changed:** nothing — deliberately. 1,250 occurrences were protected: album folders and codes,
track titles (`Jubilujah Forever`, `Jubilujah Pe Veci`, `Every Tribe Sings Jubilujah`), the EN
album title (spelt `JubiLujah`, capital L, in `catalog-manifest.json`), the worklist rows in all
28 `.prompts/translate_*.md`, and the coined hook the translation rules forbid translating
(`"Jubilujah"/"Jubiluyah"`, `Ju-bi-loo-yah`). 55 files were left untouched entirely because every
hit in them was catalogue content.

## D-2026-08-27-5 · The CDN host stays `cd.jubilujah.com`; everything else in the infra was renamed
**Decided:** 2026-08-27 · **By:** Founder, choosing "rename infra except the CDN host".
**Why:** `cd.jubileepraise.com` has no DNS record. Renaming the host in code would break every
media URL immediately; the J: paths and PM2 names break nothing until a deploy.
**Changed:** `J:/jubilujah.com/music` → `J:/jubileepraise.com/music`, `jubilujah-web`/`-api` →
`jubileepraise-web`/`-api`, `www.` and `api.jubilujah.com` → `…jubileepraise.com`,
`/var/www/jubilujah.com` → `/var/www/jubileepraise.com`. **Not changed:** `cd.jubilujah.com` and
`cdn.jubilujah.com`. These are now the only old-brand strings left standing on purpose — see
[CLAUDE.md](../../CLAUDE.md) "Drives and paths".

## D-2026-08-27-6 · Generated output and past transcripts were not rewritten
**Decided:** 2026-08-27 · **By:** Founder.
**Why:** rewriting a transcript makes a past session say what it did not say, and build output is
reproduced by the next build anyway. Compiled DLLs cannot be edited in any case.
**Changed:** nothing in `app/web/.next-dev/`, `wpf/obj|bin/`, `tools/ArticleImageStudio/obj|bin/`,
`app/web/tsconfig.tsbuildinfo`, `data/todo-index.json`, or the 22 `.claude/sessions/*.json`
journal entries. All still carry the old name; the first three regenerate on build, and
`data/todo-index.json` regenerates from a J: scan **once the music actually lives on the new root**.
---

## D-2026-08-27-7 · JubileePraise goes live as a parallel site, then a DNS switch
**Decided:** 2026-08-27 · **By:** Founder, asked when the publish turned out to be blocked.
**Why:** rollback is "leave DNS alone". Renaming the running deployment in place would have taken
the site down during the swap and made rollback a second rename.
**Changed:** [PUBLISH.md](../../PUBLISH.md) gained "Standing up the parallel site" — six steps,
**all of them explicitly unverified against the host**, because the session had no SSH key. The J:
music root is resolved by a **junction, not a copy** (no duplicate 41 GB); it has to be created on
`HDC-INSPIRESERVER` at `D:\Shares\JubileeVerse`, since Windows will not make one from a client onto
a network share. **Accepted consequence:** a junction means both workspaces write to one tree.

## D-2026-08-27-8 · `deploy/publish.sh` was stale and dangerous; it now matches PUBLISH.md
**Decided:** 2026-08-27 · **By:** found while attempting the publish; corrected on the spot.
**Why:** PUBLISH.md Step 2 was rewritten on 2026-08-14 after a live probe found the old procedure
would "have failed or corrupted production". **The prose was corrected; the script was not.** For
two weeks `deploy/publish.sh` — the one-shot helper the runbook tells you to run — still tarred the
working tree over `/var/www/…`, restarted a PM2 process that does not exist, and verified the wrong
port and the wrong CDN host. Only the Step 0 manifest gate stood between it and production.
**Changed:** Step 2 is now the one-file catalog publish PUBLISH.md documents, behind a preflight
that checks the prod directory, the live manifest and the `jubileepraise-web` process and **exits 4
rather than guessing**. It refuses to attempt a source deploy at all. Step 3 verifies the origin
port and re-reads the deployed manifest's album count; the public host and CDN are reported but not
fatal, since there is no DNS yet. **This predates the rebrand** — the same fault is in the
JubiLujah.com repo at `07bc39d` and is worth fixing there too.

## D-2026-08-27-9 · Supersedes -7: the rebrand deploys to JubiLujah's own location and credentials
**Decided:** 2026-08-27 · **By:** Founder. **Supersedes [D-2026-08-27-7](#).**
**Why:** stated as "publish and deploy this site using the same location and credentials as the
JubiLujah.com website." No parallel site, no new DNS, no new ports, no second PM2 pair — the
rebranded code is deployed into the deployment that already exists.
**Changed:** `deploy/publish.sh` retargeted to the live values — `/var/www/jubilujah.com`,
`jubilujah-web`, `:3030`, `https://www.jubilujah.com` — and those are deliberately **not** renamed
to jubileepraise, because the server, path, process and domain are unchanged; the rebrand is what
gets deployed into them. `jubilujah.com` and `www.jubilujah.com` were added back to the
JubileePraise tenant's `hosts` in `app/web/lib/tenants.ts` and `tenants/jubileepraise.com.json`, so
the old domain resolves to the rebranded tenant **by intent**. Before this it worked only by
accident: `tenantForHost()` falls through to `DEFAULT_TENANT`, which happens to be this same
tenant. `node tools/check-tenants.mjs` passes and `tsc --noEmit` is clean.
PUBLISH.md's "Standing up the parallel site" is marked superseded rather than deleted — its step 1
(the J: junction) and step 5 (the missing build/release procedure) both still apply.

## D-2026-08-27-10 · The deploy cannot be run from HPC-IMANI — the credential is not on this machine
**Decided:** 2026-08-27 · **By:** established by measurement, not policy.
**Why:** `bash deploy/publish.sh --site-only` was run and stopped on its first check:
`SSH key not found at C:\Users\imani.inspire/.ssh/id_ed25519_jubilee_prod`. The key lives under the
`gabriel.inspire` profile per PUBLISH.md — and **that profile does not exist on this machine at
all**; `C:\Users\` here holds only `Administrator`, `imani.inspire`, `imani`, `Public`, `Default`.
"The same credentials as JubiLujah.com" therefore cannot be used from HPC-IMANI, because they are
not here. Nothing was sent to `94.72.120.231` in any session on this machine.
**Changed:** nothing on the server. The publish must be run from the machine that holds the key.
Two things still block it there as well: the **J: junction** (Step 0 gate exits 2 without it) and
the **absent build/release procedure** — a manifest publish ships one JSON file and will NOT put
the rebranded UI live, because prod runs a built Next.js app this repo has no way to build and ship.

## Still open — recorded so the question is not lost

- **Propagation of the five universal lessons (RO-L001, L002, L004, L007, L009) to the other 27
  languages.** Recommended 2026-08-26: hold until Romanian is deep, then propose them as their own
  reviewed set. A rule confirmed by a Romanian reviewer is confirmed for Romanian only. **Not
  decided.**
- **Whether the transcript history is pushed to the shared vault** (~121 MB; a transcript holds
  every secret a session ever printed). Vault deliberately empty. **Not decided.**
- **Whether `.claude/sessions/` and `cornell/` get committed.** Neither is tracked today.
  **Not decided.**
- **What to do about the plaintext SSH passwords committed to this repo.** Found 2026-08-27 while
  saving the session: `.claude/settings.local.json` contains **9** `-pw <literal>` occurrences in
  Bash permission entries, is **tracked by git**, and is **not** gitignored — so the credentials
  are in the repo and in its history. Nothing was changed; rotating them, scrubbing history and
  deciding whether that file should be tracked at all are Founder calls, not a tidy-up. **Not
  decided.** Bears directly on the vault question above: this session's own transcript contains
  one of those passwords verbatim, echoed by a `grep` over that file.

## D-2026-08-27-10 · The rebrand was released to production by a hand-run build+ship, and the procedure is now written down
**Decided:** 2026-08-27 · **By:** Founder ("publish this website — deploy to the production
environment and to the CDN location"), then confirmed at the cutover when the choice was put as
*documented no-op vs. full release*: **full release, with backup + rollback**.
**Why:** the documented publish ships one file, `catalog-manifest.json`, and that file was already
**byte-identical** on prod (`b4494e138ea151e3e4a7041029dc8817`) — so the runbook publish was a
no-op and would not have put the rebrand live. PUBLISH.md said a build/release procedure "does not
exist in this repo yet" and warned against improvising one during a publish; the choice was
therefore surfaced rather than taken quietly.
**Changed:** the JubileePraise rebrand is **live** at `https://www.jubilujah.com`
(`BUILD_ID _2YyXA8MTM9fv55SBxWIZ → y03bofLgbOKhp2TkT7ozj`, routes 59 → 67, zero regressions across
all 46 previously-existing static routes). The procedure is now **PUBLISH.md "Step 2b — Full site
release"**: gates → `next build` → tar `.next` minus `cache` (252 MB → 14 MB) plus only the changed
`public/` files → back up prod → stage → swap → restart → verify → documented one-command rollback.
Three rules were learned the hard way and are recorded there: never `rsync --delete` onto prod's
`public/` (prod's is *larger* — 295 MB vs 266 MB — and holds files this repo does not); never
extract a new `.next` over an old one (mismatched `BUILD_ID` → stale-chunk 404s); do not ship
`package.json` (differs only cosmetically, risks clobbering prod config).

## D-2026-08-27-11 · The CDN sync was deliberately skipped, and the "no credentials anywhere" claim is retired
**Decided:** 2026-08-27 · **By:** Founder, asked directly at the cutover — **"skip it, the CDN is
already serving."**
**Why:** `cd.jubilujah.com` returns 200 and PUBLISH.md Step 1 is "usually unnecessary" — the
manifest, not the CDN, is what hides a catalog. Nothing new was rendered this session, so there was
nothing to upload.
**Changed:** Step 1 was not run. **The claim that the live music-CDN credentials "are not set
anywhere" is false and is now corrected in PUBLISH.md** — they exist on prod, in
`/var/www/jubilujah.com/.env` (`R2_ENDPOINT` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` /
`R2_SECRET_ACCESS_KEY`). Only the variable **names** were read; **no values were retrieved**, and
copying production secrets onto a workstation was offered and **declined by not being chosen** — it
remains a Founder decision, untaken. The `R2_AVATARS_*` token stays scoped to `jubileeverse-cdn` and
must never be aimed at the music bucket.

## D-2026-08-27-12 · PUBLISH.md's verified production facts had been rewritten by the rename, and were restored
**Decided:** 2026-08-27 · **By:** found while verifying the deploy target against the live host.
**Why:** the production facts in PUBLISH.md were probed live on 2026-08-14, when the site was
JubiLujah — then the rebrand rewrote them wholesale into `/var/www/jubileepraise.com` and
`jubileepraise-web`/`-api`, **none of which exist**. A verified fact had been silently converted
into a confident falsehood; anyone following the runbook would have deployed into nothing.
`deploy/publish.sh` had escaped this and was already correct, which is what exposed the mismatch.
**Changed:** every live-production reference in PUBLISH.md restored to `/var/www/jubilujah.com`,
`jubilujah-web`, `jubilujah-api`, and a correction banner added at the top with the re-verified
table. The only `jubileepraise` server paths deliberately left are inside "Standing up the parallel
site", which is superseded and kept as history. **Also corrected there: the `J:` junction was never
a blocker** — `check-manifest.mjs` accepts `--music=`, so
`--music=J:/jubilujah.com/music` passes the gate (`would add: 0`) with no 41 GB move and no
server-side `mklink`. `J:\jubileepraise.com\` remains empty and nothing depends on it.

## D-2026-08-28-1 · The rebrand is committed — `3648a31`
**Decided:** 2026-08-28 · **By:** Founder, "let's review it, and let's push this out".
**Why:** the rebrand had been serving on production since 2026-08-27 but existed only as an
uncommitted working tree, so there was no versioned record of what was live. Gates were re-run
first and all three passed: `tools/check-tenants.mjs` (5 tenants), `tsc --noEmit` clean,
`check-manifest.mjs --music=J:/jubilujah.com/music` → **would add: 0**.
**Changed:** 666 files committed (408 modified · 252 added · 6 renamed). The untracked set was
scanned for private keys / API tokens / `-pw` literals before staging — clean.
**Deliberately excluded:** `.claude/sessions/*.json`, the per-session journals. Whether the
conversation history belongs in the repo is still an open Founder question, and committing it
would have answered it by accident. `CONTINUITY.md` and `DECISIONS.md` were force-added, since
those are the durable records CLAUDE.md points at.
**Not addressed:** `.claude/settings.local.json` still carries **9** plaintext `-pw` literals and
is still tracked. They were already in `HEAD` before this commit — verified, so this commit did
not introduce or worsen them. Rotating them and scrubbing history remains an open decision.

## D-2026-08-28-2 · Both domains live; `jubilujah.com` stays canonical
**Decided:** 2026-08-28 · **By:** Founder, choosing between full cutover / both-live / soft-launch.
**Why:** the both-live shape needs **no rebuild**, which makes activation a small additive change
— a cert, a vhost and two DNS records — instead of a release. The trade-off was stated and
accepted: search engines keep indexing the `jubilujah.com` brand, because canonical, `og:url` and
`sitemap.xml` all derive from `NEXT_PUBLIC_SITE_URL` on prod and are unchanged.
**Changed on the server:** a self-signed origin cert `/etc/ssl/cloudflare/jubileepraise.com.{crt,key}`
(matching the house pattern — every other domain on this box is self-signed, so the Cloudflare SSL
mode is `Full`, not `Full (strict)`), and a new vhost
`/etc/nginx/sites-available/jubileepraise.com` symlinked into `sites-enabled`, mirroring the
`jubilujah.com` vhost. `nginx -t` passed before reload. Verified via `curl --resolve` **without
DNS**: apex → 301 → www, www → 200, `/album?c=JEIM1069EN` → 200. `www.jubilujah.com`,
the apex redirect and `cd.jubilujah.com` re-probed after the reload — zero regressions.
**Rollback is one command:** `rm /etc/nginx/sites-enabled/jubileepraise.com && nginx -t && systemctl reload nginx`.
Nothing pre-existing was modified; the change is purely additive.
**Still outstanding:** the two Cloudflare A records. The zone exists and is on Cloudflare's
nameservers but is **empty**; no Cloudflare API token exists on this workstation, so it is
dashboard work or needs a scoped `Zone → DNS → Edit` token. Records are tabulated in PUBLISH.md
→ "Activating jubileepraise.com".

## D-2026-08-28-3 · Production `robots.txt` advertises `http://localhost:3000/sitemap.xml` — found, not fixed
**Decided:** 2026-08-28 · **By:** found while verifying the domain activation; left for a separate
change because the Founder had just chosen the no-rebuild path.
**Why it happens:** `app/web/app/robots.ts` reads `process.env.NEXT_PUBLIC_SITE_URL ||
'http://localhost:3000'`, and that variable was **not set in the build environment** for the
2026-08-27 release. `robots.txt` is statically prerendered, so the localhost fallback was baked in.
`sitemap.ts` uses the identical expression but is *dynamic* (it calls `listArtists()`), so it reads
prod's runtime `.env` and correctly emits `https://jubilujah.com` — which is why the two disagree.
**Impact:** search engines cannot discover the sitemap. Pre-existing, not caused by any deploy.
**The fix needs a rebuild, not a restart** — set `NEXT_PUBLIC_SITE_URL` in the build environment
and re-run PUBLISH.md Step 2b. Recorded in PUBLISH.md under "Activating jubileepraise.com".
