# Where we left off — JubileePraise.com

_Updated 2026-08-27 22:30 · branch `catalog/manifest-reconciler-and-drive-corrections` ·
session `c5f2bc70-12c6-4a2d-a003-b7e251bb3685` (HPC-GABRIEL / `gabriel.inspire`) — **production release day**_

## In flight

**1 · The rebrand JubiLujah.com → JubileePraise.com is DONE in the repo and NOT committed.**
`W:\JubileePraise.com` is a copy of `W:\JubiLujah.com` at `07bc39d`; the original was not touched.
543 files rewritten, 7 renamed, `J:\jubileepraise.com\` created. Gates pass:
`node tools/check-tenants.mjs` ✓, `tsc --noEmit` ✓, 646 JSON files parse. What was deliberately
kept (the JEIM1069 "Jubilujah" album, `cd.jubilujah.com`) is in [DECISIONS.md](DECISIONS.md)
D-2026-08-27-3…-6. **Next action: commit it** — 408 modified / 45 untracked / 6 renamed.

**2 · The rebrand is DEPLOYED AND LIVE on production (2026-08-27, `gabriel.inspire@HPC-GABRIEL`).**
All three blockers recorded here previously are resolved or were never real. Target per
D-2026-08-27-9: `/var/www/jubilujah.com`, `jubilujah-web` on `:3030`, `www.jubilujah.com`.

- **The SSH key was the only genuine machine blocker, and it is on HPC-GABRIEL** (`gabriel.inspire`,
  `~/.ssh/id_ed25519_jubilee_prod`). The publish must be run from here, not HPC-IMANI.
- **The J: junction was never required.** `check-manifest.mjs` takes `--music=`. Run
  `node deploy/check-manifest.mjs --music=J:/jubilujah.com/music --manifest=app/web/public/music/catalog-manifest.json`
  → **1,464 on disk · 1,071 in manifest · would add: 0**, gate passes. No 41 GB move, no `mklink`.
  `J:\jubileepraise.com\` is still empty and nothing depends on it.
- **"A publish will not put the rebrand live" was true, and is now fixed.** A real build+release
  procedure exists, is written up as **PUBLISH.md "Step 2b — Full site release"**, and has been
  executed once end-to-end. `deploy/publish.sh` still only ships the manifest — use Step 2b for code.

**What went live:** `BUILD_ID _2YyXA8MTM9fv55SBxWIZ → y03bofLgbOKhp2TkT7ozj`, routes **59 → 67**,
`<title>JubileePraise.com — Feel the Spirit Move</title>` serving at `https://www.jubilujah.com`.
All **46** previously-existing static routes re-probed after the swap: **zero regressions**.
The catalog manifest was **not** part of it — local and prod were already byte-identical
(`b4494e138ea151e3e4a7041029dc8817`), so Step 2 would have been a no-op.

**Rollback is staged and one command** (in PUBLISH.md Step 2b): prod holds
`/var/www/jubilujah.com/web/.next.bak-20260827-221419` (122 MB, the previous build),
`/var/www/.backup/jubilujah-public-20260827-221419.tgz`, and
`/var/www/.backup/album-support.json.bak-20260827-221419`. **Delete these only once the release is
trusted** — they are the only way back.

**Known, accepted, and NOT a regression:** `/membership` and `/book` return **500**
(`useJubileeAccount must be used inside <JubileeAccountProvider>`). They are unlinked **Torah Sings**
tenant pages from the uncommitted fourth-tenant work; they never worked, and before this release
they 404'd because the routes did not exist. Nothing links to them. The fix is to wrap both in
`TorahSingsShell` and re-run Step 2b — a code fix in unfinished work, not a publish step.
Full detail in PUBLISH.md → Troubleshooting.

**The CDN was deliberately NOT synced** (Founder call this session). `cd.jubilujah.com` serves 200s
and PUBLISH.md Step 1 is "usually unnecessary" — the manifest, not the CDN, is what hides a catalog.
Worth knowing: the live music-CDN credentials **do exist**, in `/var/www/jubilujah.com/.env` on prod
(`R2_ENDPOINT` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`) — PUBLISH.md claimed they
existed nowhere. Only the **names** were read; no values were retrieved. Bringing production secrets
onto a workstation is a Founder decision and was not taken.

**Still true and still the next action: the rebrand is NOT committed.** What is live on prod was
built from an uncommitted working tree — 408 modified / 45 untracked / 6 renamed. Until it is
committed there is no versioned record of what is serving. **Commit it.**


**3 · Romanian translation — carried forward from session `20e8e037`, NOT touched today.** The
ledger `.prompts/translate_Romanian.LESSONS.md` and all of `cornell/` are on disk as described
there. Awaiting Cornel: the questionnaire and the two R2 Caleb albums. Unverified today whether
they were actually sent.

**4 · Torah Sings as a fourth tenant — from 2026-08-17, untouched since.** Code-only, not
committed, not deployed. `app/web/lib/torahsings` and `components/torahsings` confirmed on disk.

## Open questions / waiting on Appa

- **Plaintext SSH passwords are committed to this repo.** `.claude/settings.local.json` holds
  **9** `-pw <literal>` occurrences, is **tracked by git**, and is **not** gitignored. Found today,
  not acted on — rotating those credentials and scrubbing history is a decision, not a cleanup.
- **Should the transcript history be pushed to the shared vault?** Still empty by design. Note
  this session's transcript contains one of those passwords verbatim, echoed by a grep.
- **Persona binding is broken by the rename** — `personas/registry/workspaces.json` (another
  project) has no `JubileePraise.com` entry, so Melody no longer auto-activates. One-line fix +
  API redeploy, spelt out in [CLAUDE.md](../../CLAUDE.md). Not done: it is another project's file.
- **`.claude/sessions/` has never been committed** — `git ls-files .claude/sessions` is empty.
- Carried forward, not revisited: the two RO rulings blocked on Cornel; whether to propagate the
  five universal lessons to the other 27 languages; the Torah Sings naming/pricing decisions.

## Landmines

- **The rename split this machine's transcript store in two.** The harness keys its project dir on
  the folder name, so it moved from `w--JubiLujah-com` to `w--JubileePraise-com`. Each now holds
  **1** `.jsonl` on HPC-IMANI. `/resume` here sees only the new one; the older thread is in the old
  directory and needs `.claude/tools/transcripts.mjs` to travel. The memory store moved with it.
- **`cd.jubilujah.com` was kept on purpose** and is the only old-brand host left. Do not "finish
  the job" — there is no DNS for `cd.jubileepraise.com`, and renaming it 404s every media URL.
- **`deploy/publish.sh` STILL has never been run against the host.** The 2026-08-27 release did
  **not** use it — it followed PUBLISH.md Step 2b by hand (build → tar → backup → swap → restart),
  because publish.sh ships only `catalog-manifest.json` and that file was already identical on prod.
  Its targets were verified correct by hand this session (`/var/www/jubilujah.com`, `jubilujah-web`),
  but the script itself is still unexercised. First real run needs eyes on it.
- **`next dev -p 3000` runs from `C:\jubilujah-local\web`** — that folder still has its old name;
  only *references* were renamed, so docs saying `C:\jubileepraise-local` name nothing. Building
  there clobbers the dev server's `.next` → `MODULE_NOT_FOUND`.
- **Memory and transcripts are per-Windows-profile and do not travel with W:.** This session is
  `imani.inspire@HPC-IMANI` — earlier notes said HPC-GABRIEL and that is no longer true.
- Two files describe every tenant and a gate enforces it: `app/web/lib/tenants.ts` and
  `tenants/<host>.json`. Editing one without the other fails `node tools/check-tenants.mjs`.
- **There is no Romanian Bible in this workspace.** Scripture-quoting lyric lines are never
  restored from memory — left as-is and flagged for Cornel.
- `content/torahsings/angels-catalog.ts` and `app/torahsings.css` are **generated**. `categories:
  []` for Torah Sings is load-bearing and is not `null`.

## Not yet committed

- **Today (the rebrand + deploy prep):** the 543-file rename; `PUBLISH.md`, `deploy/publish.sh`,
  `CLAUDE.md`, `app/web/lib/tenants.ts`, `tenants/jubileepraise.com.json`,
  `.claude/sessions/{CONTINUITY,DECISIONS}.md`; the 6 renames listed by `git status`.
- **From session `20e8e037` (RO):** `.prompts/translate_Romanian.LESSONS.md`, the two binding
  edits, all of `cornell/`. Outside the repo: four files in `W:/InspirePersonas.com/personas/skills/`.
- **From 2026-08-24:** `.claude/hooks/{session-journal,session-resume}.mjs`, `.claude/tools/`,
  `.claude/commands/`, `.claude/sessions/`, `.gitignore`.
- **From 2026-08-17:** the Torah Sings port. Backup at `W:\Backups\TorahSings.com-2026-08-17\`.
- **Older, untouched:** the multi-tenant slice, `tools/cdn-sync-music.mjs`,
  `deploy/{check,rebuild}-manifest.mjs`, the three `app/web/public/music/*.json`, WPF changes.
