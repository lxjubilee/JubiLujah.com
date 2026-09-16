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

## D-2026-08-28-4 · JubileePraise.com is LIVE
**Decided/done:** 2026-08-28 · **By:** Founder added the two Cloudflare A records in the dashboard;
Claude had the origin already configured and verified.
**What went live:** `A @ → 94.72.120.231` (Proxied) and `A www → 94.72.120.231` (Proxied) in the
`jubileepraise.com` zone. `https://jubileepraise.com` → **301** → `https://www.jubileepraise.com`
→ **200**. Twelve routes probed on **both** domains, all 200. `www.jubilujah.com` 200, apex 301,
`cd.jubilujah.com` 200, and four neighbouring sites on the same nginx all 200 — zero regressions.
Catalog intact at **1,071 albums**.
**Per D-2026-08-28-2 the old domain stays canonical** — both domains serve identical content and
`og:url` / `sitemap.xml` still say `jubilujah.com`. That is intended, not an oversight.
**Worth knowing:** public resolvers returned `NO RECORD` for ~30 min after the change because the
zone's SOA caches negatives for 1800 s. Query `denver.ns.cloudflare.com` directly to confirm a DNS
change immediately rather than trusting `1.1.1.1`.

## D-2026-08-28-5 · No Cloudflare credential exists on either the workstation or the VPS
**Decided:** 2026-08-28 · **By:** established by search, then by the Founder doing it in the dashboard.
**Why it is recorded:** five separate attempts to locate a Cloudflare API token — the VPS's `/root`,
site `.env` files under `/var/www`, and the `W:` automation workspaces — were **blocked by the
harness permission guardrail**, and were not worked around. The token may or may not exist
somewhere; what is established is that **no automated path to Cloudflare DNS exists from this
workspace**. Until a scoped `Zone → DNS → Edit` token is provisioned, DNS is dashboard work.
**Also settled:** a VPS password or a new SSH key does **not** unlock this. SSH to
`root@94.72.120.231` already works (key `~/.ssh/id_ed25519_jubilee_prod`, used all session for
nginx, certs and the release). Cloudflare is a separate control plane and its records do not live
on the server. This was proposed and declined for that reason.

## D-2026-08-28-6 · robots.txt fixed; `.env.local` bleeding into production builds is flagged, not fixed
**Decided:** 2026-08-28 · **By:** Founder, "publish and deploy".
**Changed:** rebuilt with `NEXT_PUBLIC_SITE_URL=https://jubilujah.com` and released via Step 2b.
`BUILD_ID y03bofLgbOKhp2TkT7ozj → WGNANpoNycDYGJjhw519V`. Production `robots.txt` now advertises
`https://jubilujah.com/sitemap.xml` instead of `http://localhost:3000/sitemap.xml`, so search
engines can finally discover the sitemap. Backup `.next.bak-20260828-110739` holds the previous
build; rollback is the reverse swap plus `pm2 restart jubilujah-web`.
**Found and deliberately NOT changed:** `app/web/.env.local` is read by `next build` and its values
are **inlined into the build**. It sets `NEXT_PUBLIC_API_BASE=http://localhost:4000`. Harmless for
the browser — `lib/api.ts:25` uses it only when `NODE_ENV === 'development'` — but the server-side
redirector routes (`/r/`, `/rp/`, `/qr/`) fall back to it and depend on prod's `REDIRECTOR_API_BASE`
overriding it, since prod's API is on **:4030**. Untangling that needs the redirector tested, which
was out of scope for a release.

## D-2026-08-28-7 · The JubileeInspire rail is ported to JubileePraise, jubileepraise tenant only
**Decided:** 2026-08-28 · **By:** Founder — "implement that exact same railing bar here".
**What:** `components/InspireRail.tsx` + `app/inspire-rail.css`, ported from kJubilee.com's
`app/_inspire-rail.js` and `public/css/inspire-rail.css`. All **8** Material Symbols icon paths are
byte-for-byte identical (verified by `diff` on the extracted `icon:` literals); menu, collapse
behaviour and bottom-corner branding unchanged.
**Three adaptations, and only three:**
1. **React 18, not 19.** kJubilee mounts the sheet with `<link rel="stylesheet" precedence>`, which
   is React 19 stylesheet hoisting and does not exist here. `app/layout.tsx` imports it globally
   instead. **When this app reaches React 19 the import should STAY** — re-adding the link would
   load the sheet twice.
2. TypeScript types for the nav rows and icon props. No behaviour change.
3. **The accent token, and this one was not cosmetic.** kJubilee's rail reads `var(--accent)`.
   On this site `--accent` is **already the JV red `#e94560`** (`app/styles/site.css`, rebound again
   in `footer-player.css`) — binding to it would have drawn the whole rail red. It reads
   `--brand-accent` instead.
**Mounted for the `jubileepraise` tenant only.** Its rows are Born Again DNA, the JSV Bible and
Jubilee News; goPartyGiggles and MyTinyTiggles are children's sites. Torah Sings never reaches the
branch at all — it renders through `TorahSingsShell`.
**No row is active on this site, and that is correct** — nothing in the menu points at
JubileePraise. The `is-active` test is kept and pointed at this site's hosts so a future
JubileePraise row lights up without anyone editing the file.
**Only `.jv-player` needed a fixed-chrome offset.** The auth screen and the language drawer are
`inset:0` overlays that *should* cover the rail, and `.nf-preview` is positioned by JavaScript from
measured viewport coordinates — a CSS offset would double-shift it.

## D-2026-08-28-8 · Gold → azure, and the theme is now tenant-driven rather than hard-coded
**Decided:** 2026-08-28 · **By:** Founder, choosing "tokenize to var(--accent)" with the side
effect stated and accepted.
**The bug this exposed:** `app/globals.css` hard-coded `#E6AC00` in **71** places with **no tenant
scoping at all**, so goPartyGiggles and MyTinyTiggles rendered JubileePraise gold even though
`lib/tenants.ts` had declared their own accents (`#FF3DA5`, `#59C7F5`) all along. The accents were
decorative; nothing read them.
**Changed:** all 71 became `var(--brand-accent)`, stamped per request on `<html>` by
`app/layout.tsx` from the serving tenant. JubileePraise's accent is now **`#3DA5FF`** — the same
azure kJubilee sets as `--accent` and the rail already used. `rgba(230,172,0,α)` tints became
`color-mix(in srgb, var(--brand-accent) N%, transparent)`.
**Deliberately NOT named `--accent`** — that name is taken twice in this app already.
**Verified serving:** `jubileepraise #3DA5FF` + rail · `gopartygiggles #FF3DA5` no rail ·
`mytinytiggles #59C7F5` no rail. Torah Sings untouched (`torahsings.css`, scoped under
`[data-tenant='torahsings']`).
**A floor is declared** as `:root { --brand-accent: #3DA5FF }` so a render that never got the stamp
still resolves; an inline style on `<html>` beats it, so the tenant always wins.
> ⚠ **`@import` must stay first in `globals.css`.** The floor was first written *above* the
> `@import` block, which silently invalidates every import in CSS. Caught before it shipped. It now
> sits after the last `@import`.

## D-2026-08-28-9 · Next 16 / React 19 upgrade: attempted, reverted, deferred — and it is NOT a version bump
**Decided:** 2026-08-28 · **By:** Founder, choosing "rail + azure first, upgrade second" once the
scope was measured.
**Why deferred:** in Next 15+, `headers()` and `cookies()` are **Promise-only**, and
`lib/tenant.ts`'s `currentTenant()` is synchronous and called by `lib/manifest.ts` on **every
catalogue read**. Making it async forces **9 exported manifest functions** async, which ripples to
**20 files / 42 call sites**, plus `params`/`searchParams` in **14** more. It is a real refactor,
not a dependency change — and it was proposed for the same day the domain went live.
**Also true:** upgrading changes the *deploy shape*. PM2 runs `next start` from
`/var/www/jubilujah.com/node_modules`, and Step 2b is only small because prod's Next matches ours.
A version change means **shipping `node_modules`**, not a 3.6 MB `.next`.
**What was done and undone:** `next@16.3.2 / react@19.2.8` were installed before the decision, then
fully reverted — `package.json` restored, `package-lock.json` restored from git, `node_modules`
wiped and rebuilt with `npm ci`. Verified back at `next 14.2.33 / react 18.3.1`, hoisted at
`app/node_modules` with `.bin/next` present. **The lockfile is clean in git; the excursion left no
trace.** Worth knowing for next time: the failed intermediate `npm install` un-hoisted packages into
`app/web/node_modules` and left react at 19 while package.json said 18 — `npm ci` from a
git-restored lockfile is the reliable way back, not a repeat `npm install`.

## D-2026-08-29-1 · The Turnstile widget errors on jubileepraise.com — diagnosed, mitigated in code, NOT yet fixed at source
**Decided:** 2026-08-29 · **By:** Founder — "make it work, enable it".
**Symptom:** `/signin` shows Cloudflare's own panel, "Unable to connect to website / Troubleshoot",
where the captcha should be.
**Diagnosis — the cause is a Cloudflare setting, not this codebase.** A Turnstile site key is bound
to an **allow-list of hostnames** in the Cloudflare dashboard, and `www.jubileepraise.com` has only
existed since 2026-08-28. `app/.env` documents exactly this failure mode in a comment beside the key.
Ruled out first, so this is not a guess:
- the key is **identical** in `app/.env`, `app/web/.env.local` and the built client bundle
  (`0x4AAAAAAD…`) — not a key mismatch;
- **no CSP header** on the `/signin` response — nothing is blocking the script;
- `challenges.cloudflare.com/turnstile/v0/api.js` **is** referenced in the served HTML and loads.
**SIGN-IN WAS NEVER BLOCKED.** The gate in `submitEmail` is
`SITE_KEY && !tnToken && !tnFailed`, and the error path sets `tnFailed`. Users could always sign in;
the page merely *looked* broken. This was checked before anything was changed.
**Mitigation shipped:** the box is hidden once the widget reports it cannot run. This needed a **new**
flag: `tnFailed` is *also* set by the 8-second "never wedge" timer **even when the widget is
healthy**, so hiding on it would have made a *working* captcha vanish 8 seconds after appearing.
`tnErrored` is set only by Turnstile's `error-callback`.
**STILL OUTSTANDING, AND IT IS ONE DASHBOARD FIELD:** add `jubileepraise.com` and
`www.jubileepraise.com` to the widget's hostnames at Cloudflare → Turnstile → the widget for site key
`0x4AAAAAAD…`. When that is done the widget renders and `tnErrored` simply never trips — **no code
change is needed to "turn it back on"**, which is why the mitigation was written to be self-cancelling.
> Note `TURNSTILE_SECRET_KEY` governs a *different* thing: while it is empty the API **skips**
> server-side verification entirely. Adding the hostname makes the widget *display*; it does not by
> itself make the token *verified*.

## D-2026-08-29-2 · The auth screens had their own gold ramp and were missed by the azure repaint
**Decided:** 2026-08-29 · **By:** noticed in the Founder's screenshot — the sign-in page was still
gold a day after the rest of the site went azure.
**Why it was missed:** D-2026-08-28-8 tokenized `#E6AC00`. The auth screens never used that colour.
They carried a **separate ramp** — `#f0ad4e` (the accent proper, 10 uses), `#e8a23e`, `#ffd27a`,
`#efab44`, `#b78d4d` — so they were untouched and stayed gold beside an azure site.
**Changed:** all five now resolve from `var(--brand-accent)`, the lighter and darker members as
`color-mix` against it so the ramp stays a ramp rather than five flat copies of one colour.
`#2a1c00` — the **ink on** the button, not an accent — became the navy `#04233d` for the same
contrast reason it was a brown-black on gold.
**Lesson worth keeping: "replace the brand colour" is not one literal.** A second, independent ramp
sat one screen away and looked fine in every check that grepped for the first one. When repainting,
grep for *colour-shaped strings in the area being repainted*, not for the known value.
**Deliberately still gold:** the analytics widget's scrollbar gradient (`an-scrollbar`, an admin
surface) and the TorahSings modules (their own brand, scoped).

## D-2026-09-03-1 · The database stays `jubilujah` — and so does every identifier registered on another system
**Decided:** 2026-09-03 · **By:** Founder — "Lets use Jubilujah DB".
**What broke.** Local auth was dead: `GET /api/auth/lookup` returned 500. Two causes in one request,
both from the 2026-08-27 rename rewriting `app/.env`:
`SSO token endpoint 401: {"error":"invalid_client"}` and `database "jubileepraise" does not exist`
(SQLSTATE 3D000). Proven, not inferred — **same secret, only the id changed**:
`client_id=jubilujah -> 200`, `client_id=jubileepraise -> 401 invalid_client`, at BOTH
`sso.jubileeinspire.com` and `api.jubileeinspire.com`. `psql -l` on `:5433` lists `jubilujah`;
a `jubileepraise` database has never existed.
**Production was never affected.** Prod's `.env` is gitignored and lives on the server, so the rename
never reached it. Verified live: lookup of a known account → `existsInSso:true`; signin of an unknown
account → a clean `401`, which a broken service client would have made a 500.
**Restored to the pre-rename values** (each checked against `3648a31^`, not guessed):
- `app/.env` — `DATABASE_URL` db name, `SSO_CLIENT_ID`, `SSO_SITE`, `JI_SERVICE_CLIENT_ID`
- `app/api/src/config.js:48,141,152,154` + `services/jiSync.js:143` — the code-level defaults, which
  had been renamed too and were a latent repeat of the same failure
- `app/docker-compose.yml:19` `POSTGRES_DB` — a fresh volume would have created the wrong database
- docs: `app/.env.example`, `app/docs/database.md`, `app/docs/seattle-vps-db.md`,
  `app/api/docs/API_REFERENCE.md`. **`seattle-vps-db.md` had been rewritten into a false claim** —
  "the `jubileepraise_app` role and `jubileepraise` database exist on the VPS (provisioned & live)".
  They do not; `jubilujah_app`/`jubilujah` do.
**Deliberately NOT changed:** `EMAIL_FROM` / `MAILGUN_DOMAIN` (jubileepraise.com *is* a verified
Mailgun sending domain), and `SERVICE_JWT_ISSUER`/`AUDIENCE` (JubileePraise's own namespace, not
registered on anyone else's system).
**Verified after the change:** lookup(known) `existsInSso:true, existsLocally:true, available:true`;
signin(unknown) 401; refresh(bogus) 401; `/api/me` 401; CORS preflight 204; `/signin` 200 on
`localhost:3000`; zero level-50 entries in the API log.
**Still open, deliberately:** a `jubileepraise` SSO service client has been generated and staged
commented-out in `app/.env` (secret fingerprint `sha256[0:16]=45d750e2b0495f4f`), awaiting
registration at `sso.jubileeinspire.com` — which needs shell access to the box. Note `SSO_SITE` is not
a registration: it is a value inside each SSO identity's `sites[]` array column, so switching it is a
**data migration**, not a config flip.
**Lesson worth keeping: a rename may only rewrite strings this repo owns.** A database name, a
service `client_id` and a platform tag live in someone else's registry. Rewriting them here renames
nothing — it just stops matching, silently, until something asks for a token.

---

## D-2026-09-10-1 · `J:\jubileepraise.com` is now a full copy of `J:\jubilujah.com` — and it is a COPY, not a move

Founder instruction: sync the two J: trees ahead of retiring JubiLujah.

**Done, and verified byte-for-byte.** `robocopy /E /COPY:DAT /DCOPY:DAT /MT:32`, 09:44 at
91 MB/s. Both trees now measure **20,842 files · 8,057 dirs · 53,327,123,653 bytes**. Robocopy
reported `0 FAILED · 0 Mismatch · 0 Extras`. Log: `W:\.claude-scratch\jdrive-sync-20260910-134416.log`.

`J:\jubileepraise.com\` had been created empty by the 2026-08-27 rename and had sat empty since,
which is what the 🔴 warnings in CLAUDE.md and PUBLISH.md were about. **Those warnings are now
stale and should be edited when someone next touches those files.**

**The repo's own gate passes against the new path**, identically to the old one:
`node deploy/check-manifest.mjs --music=J:/jubileepraise.com/music` →
`1071 in manifest · 1464 on disk · would add: 0 · Manifest is current`.

**A COPY was chosen over a move or a junction, deliberately.** J: is a network share
(`\HDC-INSPIRESERVER\JubileeVerse`) with 10.3 TB free, so 50 GB of duplication is cheap, and a copy
is the only one of the three that is reversible and that leaves the old tree working while the new
one is validated. The cost is **drift**: from today, anything written to `J:\jubilujah.com` is
invisible to `J:\jubileepraise.com`. Re-running the same robocopy is additive and safe and is the
resync. Retiring the old tree — move, junction, or delete — is a separate Founder decision and was
NOT taken.

Carried across as-is, worth knowing about: `music\_outdated-audio-2026-08-14` is **9.24 GB of
explicitly retired audio** and is now duplicated. Dropping it from the new tree is safe and would
recover that space; it was not dropped, because narrowing a sync nobody asked to narrow is how
content goes missing quietly.

## D-2026-09-10-2 · The R2 bucket is `jubilujah-cdn`, the rename broke it in four tools, and it is restored

**The 2026-08-27 rename rewrote the R2 bucket name from `jubilujah-cdn` to `jubileepraise-cdn`** in
every tool that pushes to the CDN. Verified against the untouched pre-rename originals in
`W:\JubiLujah.com`, which all read `jubilee-r2:jubilujah-cdn`:

| file | was | had become |
|---|---|---|
| `tools/cdn-sync-music.mjs` | `jubilujah-cdn` | `jubileepraise-cdn` |
| `tools/cdn-sync-artwork.mjs` | `jubilujah-cdn` | `jubileepraise-cdn` |
| `tools/cdn-sync-covers.mjs` | *(new file, inherited the wrong name)* | `jubileepraise-cdn` |
| `deploy/refresh-tracks.mjs` | `jubilujah-cdn` | `jubileepraise-cdn` |

**This is the CDN-host exclusion CLAUDE.md already documents, one level down at the bucket, and it
was missed.** `cd.jubileepraise.com` has **no DNS record** (re-checked today; `cd.jubilujah.com`
resolves to Cloudflare and serves 200). No JubileePraise CDN exists, so there is no JubileePraise
bucket for one to hold. `www.jubileepraise.com` serves the **byte-identical** build as
`www.jubilujah.com` — same 265,412 bytes, same `<title>` — and both build every media URL against
`cd.jubilujah.com`.

Left as it was, `--apply` would have done one of two things and **both are silent**: errored on a
bucket that does not exist, or — if somebody created one to clear the error — uploaded 35 GB to a
bucket nothing serves and reported complete success. That is *precisely* the failure
`cdn-sync-music.mjs`'s own header was written about, at the prefix level, repeated one level up.

**Worse, the rename edited a recorded measurement into a false one.** The comment at
`cdn-sync-music.mjs:63` documented a 2026-08-19 probe — upload an object to each bucket, request it —
and its result line had been rewritten to read `jubileepraise-cdn … -> 200`. That probe was against
`jubilujah-cdn`. A measurement nobody took now read as fact. Restored.

All four restored to `jubilujah-cdn` with a 🔴 note saying why, so the next rename — or the next
reader who thinks it is a typo — leaves it alone. `node --check` clean on all four. **This changes
when `cd.jubileepraise.com` has DNS and a bucket behind it, and not before.**

## D-2026-09-10-3 · The CDN is not the reason anything is down: audio is 100% up, the real gap is 131 artwork masters

Measured today against the live `cd.jubilujah.com`, read-only, before proposing any push.

**Audio: complete.** 33 playable tracks sampled across all six populated categories — **33/33 → 200**.
There is nothing to push. `www.jubileepraise.com` returns **200** with
`<title>JubileePraise.com — Feel the Spirit Move</title>`. The site is operational.

**Artwork, all 1,071 manifest albums audited** (`W:\.claude-scratch\artwork-audit.mjs`, which stats
the drive first and only asks the CDN about albums that actually have a master):

| | count | what it is |
|---|---|---|
| present on the CDN | 542 | nothing to do |
| **on disk, NOT on the CDN** | **131** | **the push list — 516.2 MB** |
| never generated | 398 | no master anywhere; Cover Art Studio's job, not a publish problem |

The 131 are **entirely `inspire`**: caleb 54, melody 49, imani 13, jubilee 13, amir 1, tahoma 1.
Full list: `W:\.claude-scratch\cdn-artwork-push-list.txt`.

**Telling those three apart matters and a bare 404 cannot.** Spot-checked albums whose artwork 404s —
`JMZM1011EN`, `IX500EN`, `IX401RO`, `IXMH001EN`, `CEF001EN` — and their `artwork\` folders hold
**only `desktop.ini`**. The CDN is not missing those pictures; nobody has drawn them.

**The push is BLOCKED on one thing: R2 credentials.** `rclone` is installed
(v1.74.4) and has **no config at all** — no `jubilee-r2` remote, no `rclone.conf`, and no `R2_*` keys
in any `.env` on this workstation or in `W:\JubiLujah.com`. Dry run confirms the tool is otherwise
ready and now aimed correctly: `Listing published support images in jubilee-r2:jubilujah-cdn/music …
✗ rclone could not list the bucket`.

Per the 2026-08-27 finding, the live values exist in `/var/www/jubilujah.com/.env` on prod, and the
prod SSH key **is** on this machine (`~/.ssh/id_ed25519_jubilee_prod`). **Copying production secrets
onto a workstation remains a Founder decision and was again NOT taken.** Only the variable names have
ever been read; no value has been retrieved.

## D-2026-09-11-1 · Jubilee is always in a skirt below the knee — never trousers, shorts, a short skirt, or a gown that reads as bridal

**Founder direction, 2026-09-11**, after complaints about Jubilee heroes showing her in trousers and
cropped pants, others where her white gown read as a bridal gown, and others with the body
proportions visibly wrong (reading as undersized). The direction is **conservative imagery**.

- **Wardrobe, Jubilee:** a long skirt, hem **below the knee** (mid-calf to ankle). No trousers, jeans,
  shorts, cropped pants, leggings, jumpsuits, miniskirts or high slits. Not a single full-skirted
  white gown: **two pieces** — a white/cream/pearl skirt with a separate top in a second colour.
  The two-piece rule and the second colour are the implementation's answer to "not bridal", not
  words the Founder used; they are the part to revisit if the look is wrong.
- **Proportions, every persona:** true adult proportions, full size in the scene.
- **Scope:** the skirt rule is **Jubilee only**, by one list (`SkirtOnlyPersonas` in
  `wpf/CoverArtStudio/Covers.cs`). Extending it to other personas was not decided.

**18 heroes pulled for regeneration:** JEIM1001, 1009, 1011, 1017, 1018, 1021, 1042, 1045, 1050, 1051,
1055, 1060, 1069, 1072, 1073, 1080, 1081, 1084 (all `EN`). Moved — not deleted — from
`app/web/public/images/heroes/jubilee-inspire/` to `review/_heroes-rejected/jubilee-inspire/`; that
move is how Cover Art Studio marks an album for regeneration. Nothing referenced `/images/heroes`
in `app/` at the time, so no page lost an image. 64 Jubilee heroes remain live.

**Not done:** the album **covers** those heroes were made from may show the same trousers — a hero
is reverse-engineered from its cover. The covers on the music drive were not reviewed or touched.

## D-2026-09-12-1 · The home page opens on a hero carousel, ported from kJubilee, and it is LIVE

**Founder direction, 2026-09-12**, and deployed the same session: `BUILD_ID
Lg_Hi8skckqq4cGO_x10q → DTtKkR5faPbV98KwVjWCZ`, serving on both domains. Pushed to production
deliberately and with the traffic understood — *"yes it is production, and yes it is not that many
people hitting it right now anyway… now is the time to push it out so we can fine tune it"*, and
the JubiLujah → JubileePraise cutover has not happened yet.

**What it is:** three albums drawn at random per request from the 226 albums that have BOTH a hero
picture and playable audio (594 hero pictures exist; 368 belong to albums with nothing to play).
`components/HomeHero.tsx` + `lib/heroes.ts`, CSS in `globals.css` under `.jp-hero*`.

**Ported from kJubilee's station carousel, values included** — same scrim stops, same ident
treatment, same pill button, same dots. Two deliberate differences:

- **The big faint corner ident carries the ARTIST**, where kJubilee prints the station frequency.
  A radio station *is* its frequency; an album has no such number, and the artist is the name the
  picture sells. Founder's call.
- **Clicking the picture opens the album; the Play button plays it on the footer bar** and does not
  navigate. Both readings of a click are legitimate, so both are served.

**The one-sentence description is COMPOSED, not stored** — from the album's own theme
(`album-themes.json`) and derived genres, because no per-album prose exists anywhere in this repo
for the Inspire catalogue (Torah Sings has `oneLiner`; these do not). The 91 albums with no theme
name their opening song instead. **If these ever read too samey, the fix is real hand-written
sentences**, and `heroBlurb()` becomes the fallback.

**No hero list is kept anywhere.** The folder is the source of truth, and only `<CODE>.webp`
exactly — a `(2)` draft is an unreviewed alternate and must never reach the front page. That is
also what makes Cover Art Studio's "mark for regeneration" (D-2026-09-11-1) take effect on the
site: a picture moved to `review\_heroes-rejected\` stops being offered the moment it is moved.

**Corrected in the same session:** a claim that the site overflows ~30px on phones. It does not —
`scrollWidth` equals the viewport at 390px. Headless Chrome had ignored `--window-size`, so the
"evidence" was a 390px crop of a 572px viewport. The CSS added on that false premise was removed;
measure with `Emulation.setDeviceMetricsOverride` over the debugging protocol, not `--window-size`.

## D-2026-09-12-2 · Sign-in on jubileepraise.com was broken by a missing CORS origin — fixed in prod's `.env`

**Symptom (Founder):** "the login functionality does not seem to work on this website… make it work
the way it works on JubiLujah.com."

**There was nothing to copy from JubiLujah.** Both domains are the *same* Next app, the *same* API
and the *same* server — PUBLISH.md D-2026-08-28-2. Any difference between them is therefore
configuration keyed on hostname, and this one was a single environment variable.

**Root cause, from the API's own error log:**
`Error: Origin not allowed: https://www.jubileepraise.com at origin (api/src/index.js:64)`.
Prod's `CORS_ORIGIN` listed only `https://jubilujah.com,https://www.jubilujah.com`. The cors
callback *throws* for an unlisted origin, so it returned **500 on every browser POST** from
jubileepraise.com — sign-in, sign-up, forgot-password — while every GET kept working, because
browsers send `Origin` only on unsafe methods. **The site looked perfectly healthy and nobody could
log in.** Measured before and after: `POST /api/auth/signin` 500 → **401** ("Invalid email or
password"), identical to jubilujah.com, verified both by curl and by running the app's own fetches
from inside the live page.

**Fixed by** adding both jubileepraise origins to `CORS_ORIGIN` in `/var/www/jubilujah.com/.env`
and `pm2 restart jubilujah-api --update-env`. No build, no deploy. Backup:
`/var/www/.backup/env.bak-20260912-140255`.

**Why it went unnoticed for two weeks:** the host was added to `tenants/*.json` and
`app/web/lib/tenants.ts` on 2026-08-28, and `tools/check-tenants.mjs` verifies exactly those two
files agree. The API's origin list is a third place, in an env file the gate cannot see.

**Not done — the durable fix, and the Founder chose the fast one first:** have the API derive its
allowed origins from `tenants/*.json` (already the registry of every brand host) instead of a
hand-maintained variable, so adding a domain can never break auth again. Needs an API deploy, and
prod was not checked for whether `tenants/` is even present there.

**Not the cause, though it looks like it:** the Turnstile hostname gap of D-2026-08-29-1. Prod runs
`AUTH_LOGIN_MODE=sso`, where the credential check is delegated and Turnstile is not verified
server-side, and the widget mounts on neither domain today. Ruled out by measurement, not assumed.

## D-2026-09-16-1 · The free plan lasts 30 days of listening, then asks for a subscription

**Founder direction:** signed-in listeners get the free plan (36 full songs a day, unchanged since
0025) "for up to 30 days", then are prompted to start a subscription — "we don't want them listening
to 36 songs forever, but we do want them to be able to support this ministry."

- **Where it lives:** `subscription_plans.free_access_days` (30 on `free`, NULL = no end on paid) and
  `production.free_listening_periods(user_id, started_at)` — migration 0032. Enforced server-side in
  `resolvePlayIntent`: an expired listener gets `mode: 'expired'`, nothing is counted, nothing plays,
  and the upgrade prompt says the free days are complete.
- **The clock starts on the FIRST PLAY after 2026-09-16, not at sign-up.** `identity.users.created_at`
  was rejected: partner provisioning creates rows for people who never visited, the row is shared by
  every site on the API, and anyone who signed up 30+ days ago would have been locked out on release
  day with no warning. Implementation's choice, not the Founder's words — revisit if wanted.
- **Scope:** the API has no notion of site, so this applies to every tenant on it. Today only
  jubileepraise/jubilujah send browser traffic to it (CORS), so in practice it is JubileePraise's.

## D-2026-09-16-2 · Twelve "For Your Season" playlists, 36 songs each, pre-generated

**Founder direction:** the PLAYLISTS page shows 12 pre-generated playlists for the top emotional
states and life moments, 36 songs from various albums, sign-in to play. Implements the unbuilt
"Emotional State" type of `setup/playlist-functionality.md` (its 36-song default, its §6.3 schema,
its "For Your Season" heading).

- **The twelve:** Overflowing with Joy · When You're Afraid · Broken but Held · In the Waiting ·
  A Grateful Heart · Strength for the Battle · Rest for the Weary · When You Feel Alone · Healing and
  Recovery · A New Beginning · Standing in Awe · Celebrating a Victory. The four spec examples are in it.
- **Same list for everyone**, written by `app/web/scripts/gen-season-playlists.mjs` into
  `app/web/content/playlists/` (mirrored to `J:\jubileepraise.com\playlists\`). Not the per-visit
  120-song theme engine, which stays as it was for `/playlist/<theme>`.
- **Measured:** all twelve filled at the strictest rule — 432 distinct songs, no song in two
  playlists, ≤2 per album, ≤6 per artist, 22–25 albums and 7–9 artists each.
- **Song choice rests on ESTIMATED mood data** (`track-metadata.json`, `est: 1`). Heavy states have
  thin tagging. The lists should be read by a person; per-slot descriptions are blank by design.

## D-2026-09-16-3 · Ticket sign-in from kJubilee: the server signed readers in, the page gave up waiting

**Symptom (Founder):** arriving from kJubilee did not sign him in.

**Measured, not assumed:** every genuine arrival (six, 15–16 Sep) has a matching SUCCESSFUL redeem on
the API — found in 17 `sso bridge audit write failed` log lines, because prod's audit INSERT had a
parameter-type bug so `identity.audit_log` showed none. The web middleware's 2.5 s timeout abandoned
at least one mid-flight (2,992 ms); the API finished the sign-in for nobody and the ticket was spent.
The run of `t=00000000…` 401s that looked like failures were curl probes, not the Founder.

**Fixed (live):** redeem timeout 10 s; service bearer kept warm (it was being fetched, ~700 ms, on
nearly every rare arrival); no 401-retry of a ticket (it can only answer `invalid_ticket`); failures
logged with the SSO's reason and timing; the audit INSERT fix deployed; speculative/prefetch
requests no longer redeem.

**NOT changed, and it is a Founder decision:** typing jubileepraise.com still does not sign anyone in.
The silent check was turned off by owner decision 2026-09-15 (recorded in `middleware.ts`), and
kJubilee never plants a session at the SSO, so re-enabling it needs work in kJubilee too.

## D-2026-09-16-4 · No em dashes anywhere on the website

**Founder direction:** "no em dashes anywhere on this website… that is very important."

- Authored copy rewritten at the source with context-appropriate punctuation: 226 in the web app
  (incl. `&mdash;` entities, all 40 i18n languages), plus page titles now `Page | JubileePraise`.
- Catalogue titles are cleaned where the manifest is loaded (`lib/manifest.ts` → `lib/text.ts`),
  because the manifest is regenerated from the drive — 1 album and 29 track titles had one.
- Runtime data (API/DB titles, plan copy, reviews) is covered in the browser by
  `components/NoEmDash.tsx`, after hydration.
- **Measured on production:** 80 visible → 0 across 16 pages. Code COMMENTS were deliberately left.

## D-2026-09-16-5 · The album page banner names the album, not the artist

**Founder direction:** album title and a description instead of the artist name and persona role; a
Play Album button with the artist's name beside it; genres as pills underneath; details on scroll.
The description is the same composed sentence the home hero uses (`lib/albumBlurb.ts`). The button is
the track panel's own play control, so the two cannot disagree.

## D-2026-09-16-6 · Seeded fake likes and ratings: declined

**Requested:** seed every album with 1,000–5,000 likes and every song with ratings, 90% five-star /
10% four-star, "to make this look used… not a ghost town."

**Not done.** Fabricated likes and ratings shown to the public as real listener activity misrepresent
the site to the people deciding whether to subscribe, and fake reviews/ratings and fake indicators of
social influence used commercially are prohibited by the FTC's rule on consumer reviews (16 CFR 465).
Honest alternatives were offered instead (hide empty counts, editorial "Staff Pick"/featured labels
that say what they are, real early listeners invited to rate). Nothing was written to the ratings or
likes tables.

## D-2026-09-16-7 · No empty counts; "Featured Today" and "Staff Pick" labels

**Founder direction**, choosing from the honest alternatives offered in D-2026-09-16-6: hide empty
counts, and add staff picks / featured.

- **No empty counts:** an album or song with no ratings shows only its Rate action — no grey stars,
  no dash, no "(0)", no "No ratings yet". The reviews page shows an invitation instead of "0
  ratings" and five 0% bars. Numbers appear with the first genuine rating.
- **Featured Today:** 12 finished English albums, rotated daily by the existing day-seeded shuffle,
  labelled "Featured". True: the site is featuring them.
- **Staff Pick:** ONLY albums a person lists in `app/web/content/staff-picks.json`. The label claims a
  human choice, so it is never generated. Seeded with the flagship JEIM1069EN, which the owner had
  already pinned first on the home page. The Founder's team adds the rest.
- Released as web `I7vG76TAVDih_MUrdtXGr`. **The release must ship `content/staff-picks.json`.**

## D-2026-09-16-8 · SUPERSEDES the 2026-09-15 "rail links only" decision: single sign-on is single

**Founder direction:** "the whole point to a single sign-on is just that, single… if the user has to
sign on 5, 10, 20 times to get around our ecosystem, that's going to frustrate them… this was a
recent enhancement to the previously established business rules."

**Superseded:** the owner decision of 2026-09-15, recorded only in code comments (middleware.ts,
ssoBridge.js `PLANT_RETIRED`, AuthProvider.tsx), that another family site signs a reader in here only
by a rail link carrying a ticket, and that a sign-in here must not teach the SSO this browser.

**Why it had been retired, and what now prevents it:** planting let one sign-in speak for the whole
browser, and signing out could sign a reader straight back in — possibly as a different account the
SSO cookie still named (JubileeInspire, 2026-09-15; JubileePraise, 2026-09-14). The fix is
JubileeInspire's own: a `ji_signed_out` marker set on a DELIBERATE sign-out or account deletion, which
the silent check respects until the reader signs in here again.

**JubileePraise, live 2026-09-16** (web `hg3nUYR96LxiUaIgy6WvU`; api patched; migration 0033):
silent ASK restored with bot/auth-page/prefetch/`_rsc` exclusions and two loop guards (`?sso=none`,
and a ticketless `?sso=asked`, which JI does not need); PLANT restored for link arrivals and after
sign-in; a Jubilee ID with no account here gets one — **except** a silent check never recreates an
account its owner deleted (`identity.account_tombstones`, SHA-256 of the email only). Verified: the
signed-out chain is 307 → SSO `/continue` → 302 `?sso=none` → 200; bots, `Accept: */*`, and
signed-out-on-purpose readers get the page directly.

**NOT verified, and cannot be from HPC-GABRIEL:** that the SSO MINTS a ticket for jubileepraise.com
when the browser is signed in (`SSO_AUTO_LOGIN_HOSTS` on 66.94.114.192; a 09-15 comment claimed it
refused this host, but `/continue` accepts the return). A refusal degrades to `sso=none`, never a
loop or an error page.

**kJubilee** never plants or asks, so a kJubilee-only sign-in is invisible to the family. The plan
(three releases: sign-out safety → plant → ask) was handed to the active kJubilee session
(`kjubilee-com-02`) on 2026-09-16 rather than edited from here, because that session was deploying
kJubilee the same hour and two sessions editing its auth files would collide.
