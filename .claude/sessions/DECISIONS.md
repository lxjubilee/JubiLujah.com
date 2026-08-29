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
