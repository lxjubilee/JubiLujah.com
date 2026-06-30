# mobile/ → tracks/ Folder Rename Report

**Generated:** 2026-04-29
**Operation:** Rename `mobile/` folder to `tracks/` across all CDN album folders for compliance.
**Scope:** Both local C:\Data\cdn.JubileeVerse.com\music\ and G:\My Drive\Websites\cdn.JubileeVerse.com\music\

---

## Why this rename

The `mobile/` folder name was inherited from the Universal Music Library Architecture v1.0 spec where it represented the 128 kbps AAC bandwidth tier (one of five encoding tiers: lossless / high / standard / mobile / preview). Since the catalog currently has only one audio tier populated (the legacy MP3 source), `tracks/` is a clearer, compliance-friendly folder name that accurately describes what's inside.

---

## What changed

### Folder rename (both drives)

```
{artist}/{album}/mobile/    →    {artist}/{album}/tracks/
```

| Drive | Folders renamed |
|---|---:|
| Local C: | **493** |
| G: drive | **493** |

The G: drive rename was a metadata-only operation (rename within the same Drive volume — no re-upload of MP3 content).

### album.meta.json updates

For each album with at least one track, the per-track `cdn_urls` dict had:
- Field name `mobile` renamed to `tracks`
- URL value rewritten from `/mobile/` to `/tracks/`

| | Before | After |
|---|---|---|
| **Field** | `cdn_urls.mobile` | `cdn_urls.tracks` |
| **Example value** | `https://cdn.jubileeverse.com/music/jubilee-inspire/JEIM1001en-the-kings-return/mobile/01_angelic-anthem.mp3` | `https://cdn.jubileeverse.com/music/jubilee-inspire/JEIM1001en-the-kings-return/tracks/01_angelic-anthem.mp3` |

| | Count |
|---|---:|
| album.meta.json files updated | **121** |
| Tracks (per-track entries) updated | 1,713 |
| Albums with empty `tracks: []` (no meta change needed) | 372 |

The 372 albums without metadata changes are ones whose source folders have only blueprints + lyrics but no audio yet — their `tracks: []` array is empty so there's nothing to rewrite. The folder rename still happened structurally.

### What was NOT changed

- `cdn_urls.lossless`, `cdn_urls.high`, `cdn_urls.standard`, `cdn_urls.preview`, `cdn_urls.manifest` field names — these tiers are still null (no encoding pipeline yet) and remain spec-compliant in their original naming
- `missing_assets` descriptive strings (e.g. `"mobile_128k_aac (currently legacy mp3)"`) — these describe audio-encoding-tier specifications, not folder paths, and remain accurate per the v1.0 spec
- `lossless/`, `high/`, `standard/`, `preview/`, `manifest/`, `artwork/`, `lyrics/` sibling folders — preserved as-is (will be populated when the encoding pipeline lands)

---

## Final state verification

| | Local C: | G: drive |
|---|---:|---:|
| `mobile/` folders | **0** | **0** |
| `tracks/` folders | **493** | **493** |
| MP3s under `tracks/` | 1,713 | 1,713 |
| `album.meta.json` files | 493 | 493 |
| Errors | 0 | 0 |

**Spot-check** ([jubilee-inspire/JEIM1001en-the-kings-return/album.meta.json](jubilee-inspire/JEIM1001en-the-kings-return/album.meta.json)):

```json
{
  "tracks": [{
    "track_number": 1,
    "track_title": "Angelic Anthem",
    "cdn_urls": {
      "lossless": null,
      "high": null,
      "standard": null,
      "preview": null,
      "manifest": null,
      "tracks": "https://cdn.jubileeverse.com/music/jubilee-inspire/JEIM1001en-the-kings-return/tracks/01_angelic-anthem.mp3"
    }
  }]
}
```

---

## Logs and artifacts

- [scripts/rename_mobile_to_tracks.py](../scripts/rename_mobile_to_tracks.py) — idempotent rename + meta.json updater (safe to re-run)
- [scripts/rename_mobile_to_tracks.log](../scripts/rename_mobile_to_tracks.log) — full rename log
- [scripts/robocopy_push_tracks_metadata.log](../scripts/robocopy_push_tracks_metadata.log) — meta.json push to G:

---

## Idempotency

The rename script is safe to re-run. On a second run it will detect that `tracks/` already exists and `mobile/` is gone, then skip without error. Future albums added to the catalog will follow the new `tracks/` convention via updated staging tooling.
