# Where we left off — JubileePraise.com

_Updated 2026-09-17 07:43 · branch `catalog/manifest-reconciler-and-drive-corrections` · session `0e291763-3769-4b60-8bdf-940318858f1c` (HPC-CALEB / `caleb.inspire`)_

## In flight

**Nothing is mid-change.** Everything this session built is committed, pushed (branch and `main` both
at `0793748` on origin) and live. What is live, in order:

1. **Backend on `api.jubileepraise.com`** — the `jubileepraise` database (a clone of `jubilujah`, migration
   0035), its own SSO client `jubileepraise`, the Turnstile/Mailgun/SMTP credentials, its nginx vhost.
   PUBLISH.md "2026-09-17 · BACKEND release" has the rollback; `deploy/release-api.sh` is the runbook.
2. **Web `u70DMdA0x4T000wgvZ9cD`** (from `927d1d8`): hero typography/spacing matched to kjubilee.com,
   share box under the hero QR, backstage article heroes with the banner's arrows, 15px under the title,
   plus the concurrent session's evening fixes (`aabf4fc`). PUBLISH.md "2026-09-17 (night)" has the rollback.

**Suggested, not started:** the album page's *Similar Music* rail is plain `<a>` links, so switching to
another artist's album reloads the whole document and kills the footer player (diagnosed live; see
`app/web/components/AlbumApp.tsx` `SimilarRow`). The fix is Next `<Link>` on both rails plus
`key={album.code}` on `<AlbumApp>` in `app/web/app/album/page.tsx`. Appa has not said yes.

## Open questions / waiting on Appa

- **Local workstation database.** `app/.env` points the local API at the PRODUCTION `jubileepraise`
  database through the SSH tunnel on :5433 (Appa's choice today, because the local PostgreSQL 18's
  `jubilee` role cannot CREATE DATABASE). Local sign-ups write real rows. To go local: the command is in
  `app/.env` above `DATABASE_URL`.
- The QR plate no longer plays on click (it opens the share box); Play Album does. Appa was told; no
  objection yet.

## Landmines

- **Two sessions release from this one shared tree on the same day.** The other one uses worktree
  `app/.wt-door`; this one `app/.wt-hero` (both git-excluded, detached). Before any Step 2b: compare
  prod's `BUILD_ID` with the newest PUBLISH.md entry, and look for someone else's uncommitted files —
  a build that lacks them reverts their release. Refresh a worktree from the tree before every build.
- **Never `git checkout <branch>` in this tree.** This morning it half-rewrote 1,250 files and left 13
  directories in Windows delete-pending for hours. Push with `git push origin <branch>:main`.
- `next dev` does not work on the W: share (watchers fail); build with `NEXT_DIST_DIR=.next-<x>` and
  `next start`. Local web is on :3001 (PID 11292, serving `app/.wt-hero/app/web/.next-pub4`), local API on
  :4000 (PID 28268, current code). `.env.local` for the web lives in the main tree; copy it into a worktree.
- `SSO_CLIENT_ID=jubileepraise` is registered at the SSO and active on prod and locally; `jubilujah`
  is no longer used anywhere in this repo. `JI_LOGIN_SOURCE` stays `jubilujah` on purpose (JI's key).
- The kJubilee hero title has `top:15px`; ours deliberately does not (descenders). Do not "re-match" it.

## Not yet committed

- `.claude/hook-messages.json` — the prompt hook's own state; changes every turn, never commit.
- `app/web/tsconfig.tsbuildinfo` — build artifact, tracked; harmless either way.
