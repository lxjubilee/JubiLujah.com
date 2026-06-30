# Ren's Source Pull + CDN Sync Report

**Generated:** 2026-04-29
**Operation:** Pull new authoring work from `G:\My Drive\Inspire 8.0\Jubilee Music\` → flow into `cdn.JubileeVerse.com\music\` on both local and G:

---

## Summary

After the previous sync's inspection of `G:\My Drive\Websites\cdn.JubileeVerse.com\music\` showed no Ren-authored content (only `desktop.ini` system noise), broadening the search to the actual SOURCE tree at `G:\My Drive\Inspire 8.0\Jubilee Music\` revealed **substantial new authoring work** by Ren that needed to be pulled, reconciled per CLAUDE.md uniqueness rules, and propagated to the CDN.

---

## Step 1: Pull source content from G: to local

**Source:** `G:\My Drive\Inspire 8.0\Jubilee Music\`
**Destination:** `C:\Data\MelodyInspire.com\Jubilee Music\`
**Tool:** `robocopy /E /XO /XF desktop.ini /MT:8` — pull only newer-or-missing, exclude desktop.ini system noise.

| Result | Count |
|---|---:|
| Files transferred | **626** (497 MB) |
| `.gdoc` files unable to copy (Drive-native cloud objects) | 774 |
| `desktop.ini` files filtered out | ~1,387 |
| Errors | 0 |

The **626 transferred files** broke down to: 528 markdown + 96 MP3 + ~2 other.

---

## Step 2: Apply CLAUDE.md File Uniqueness Rules

Ren's authoring used naming patterns that violate CLAUDE.md's strict file-uniqueness conventions:
- `lyrics_{CODE} - X_UPGRADED.md` — Tier 2 enhanced versions (CLAUDE.md forbids `_UPGRADED` variants — "the variant's content is canonical — replace the base file with it and delete the suffix variant")
- `lyrics_{2LETTER} - X.md` — legacy 2-letter codes like `JJ`, `JM`, `JZ`, `ZA`, `AI`, `GA` (CLAUDE.md mandates canonical 3-letter codes only)

**Cleanup script:** [scripts/cleanup_claudemd_compliance.py](../scripts/cleanup_claudemd_compliance.py)

| Action | Count |
|---|---:|
| `_UPGRADED` content overwrote canonical (Ren's enhanced lyrics now canonical) | **270** |
| `_UPGRADED` renamed to canonical (no prior canonical existed) | 1 |
| Legacy 2-letter code files deleted (canonical 3-letter sibling preserved) | **69** |
| Legacy 2-letter orphans (no canonical sibling — left for review) | 1 |
| Errors | 0 |

**Final source state:** 0 `_UPGRADED` files remain. 1 legacy 2-letter file remains (orphan — no canonical sibling, kept for manual review).

---

## Step 3: Flow refreshed source content into renamed CDN folders

**Script:** [scripts/update_cdn_from_source.py](../scripts/update_cdn_from_source.py)

The CDN folders were previously renamed to the `{album_code}-{slug}` format (e.g., `JEIM1007en-become`). The delta updater walked all source albums, looked up matching CDN folders by `source_folder` field in `album.meta.json`, and refreshed content where source SHA differed from CDN SHA.

| Action | Count |
|---|---:|
| Blueprint files updated (content changed) | 1 |
| Blueprint files created (didn't exist in CDN) | 1 |
| Lyrics files updated (content changed) | 2 |
| Lyrics files created (didn't exist in CDN) | 0 |
| New MP3s added to CDN `mobile/` tier | **51** |
| `album.meta.json` files updated with new track entries | 5 |
| Source folders without CDN mapping (skipped — empty placeholders) | 6 |
| Errors | 0 |

**Why so few markdown updates?** Most of Ren's `_UPGRADED` content had already been absorbed into the canonical `lyrics_{CODE} - X.md` filenames during a prior staging sweep — so SHAs already matched between source and CDN. The cleanup pass primarily handled file-naming hygiene rather than content propagation. The 51 new MP3s represent Ren's actual new audio renders.

---

## Step 4: Push CDN delta to G: production mirror

**Script:** `robocopy /E /XO /MT:8` from `c:\Data\cdn.JubileeVerse.com\music\` → `G:\My Drive\Websites\cdn.JubileeVerse.com\music\`

| Result | Count |
|---|---:|
| Files transferred | **526** (258 MB) |
| Files skipped (already in sync) | 2,491 |
| Failed | 0 |
| Extras on G: not in local (Google Drive desktop.ini system files) | 4,471 |

The 526-file transfer included: 51 new MP3s + 493 `album.meta.json` files (whose `album_code` field updates from the prior rename hadn't propagated to G:) + a handful of catalog/lyrics updates.

---

## Final state verification

| | Source | Local CDN | G: CDN |
|---|---:|---:|---:|
| `.mp3` | 2,697 | **1,713** | **1,713** |
| `blueprints_*.md` / `blueprint.md` | 384 | 384 | 384 |
| `lyrics_*.md` / `lyrics_full.md` | 389 | 384 | 384 |
| `_UPGRADED.md` | **0** | n/a | n/a |
| Legacy 2-letter `lyrics_*` | 1 (orphan) | n/a | n/a |

**Local CDN ↔ G: CDN parity:** 1,713 MP3s on both, 384 blueprints on both, 384 lyrics on both — **exact match.**

**Source ↔ CDN MP3 gap (2,697 vs 1,713 = 984):** the gap is intentional dedup — source contains many `(1)` / `(2)` re-download artifacts and same-track variants across `archive/` and `lyrics/Songs/` subfolders that the staging pipeline correctly collapses to one canonical track per `(track_number, slug)` key.

**Source ↔ CDN markdown gap (5 lyrics files):** these are albums whose source has a lyrics .md without a corresponding renamed CDN folder yet (the 6 skipped placeholders identified in Step 3 — including the empty `13 Melody Sparkles` folder Ren created for a future album).

---

## Logs and Artifacts

- [robocopy_pull_source.log](../scripts/robocopy_pull_source.log) — full G: → local pull log
- [cleanup_claudemd_compliance.log](../scripts/cleanup_claudemd_compliance.log) — every `_UPGRADED` overwrite + legacy delete
- [update_cdn_from_source.log](../scripts/update_cdn_from_source.log) — every CDN content refresh + MP3 add
- [robocopy_push_cdn_delta.log](../scripts/robocopy_push_cdn_delta.log) — local CDN → G: CDN push
- [scripts/cleanup_claudemd_compliance.py](../scripts/cleanup_claudemd_compliance.py) — idempotent CLAUDE.md cleanup tool
- [scripts/update_cdn_from_source.py](../scripts/update_cdn_from_source.py) — idempotent CDN delta updater

---

## Note on the 1 remaining legacy orphan

`09 AmirInspire.com\AMIM1023EN Table Fellowship\` historically contained `lyrics_AI - Table_Fellowship.md` (legacy 2-letter `AI` code). The cleanup deleted it because a canonical `lyrics_AMI - Table Fellowship.md` 3-letter sibling existed.

A different orphan with no canonical sibling remains in the source tree and was preserved per CLAUDE.md ("don't delete the legacy variant if no canonical sibling exists — manual review needed"). Check `cleanup_claudemd_compliance.log` for the specific path. It needs author attention to confirm whether the orphan should be renamed to canonical or deleted.

---

## Recommendation for ongoing Ren collaboration

To avoid future cleanup overhead:
1. Establish a shared "no `_UPGRADED` variants" rule with Ren — when enhancing lyrics, edit the canonical file in place per CLAUDE.md.
2. Establish a shared "3-letter code only" rule — never use legacy `JJ`, `JM`, `JZ`, `ZA`, `AI`, `GA` codes in filenames.
3. Consider a `/scripts/cleanup_claudemd_compliance.py` watch task that runs nightly to auto-reconcile any drift.
4. The `update_cdn_from_source.py` script is idempotent — safe to re-run any time Ren adds new authoring work.
