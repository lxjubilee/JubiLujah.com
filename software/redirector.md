# Redirector Engine and QR Code System
## Build Instructions for AI Developer
**Version:** 2.0 — **Part A** is the specification (the *why* and *what*); **Part B** (appended 2026-08-06) is the **as-built Implementation & Installation Guide** — what actually exists in this repo and how to stand it up on any other website.
**Status:** Built and verified on the pilot domain (JubiLujah.com). MVP phases (1,2,4,5,7) plus phases 3,6,8,9,11 are implemented and offline-verified; Phase 10 (IPX handler) and a handful of items remain deferred — see **Part B §B0** for the exact done/deferred ledger.
**Architecture:** Distributed, per domain, no shared runtime.
**Reference stack (as built):** Node.js / Express (ESM) API · PostgreSQL (schema `redirector.*`, via `pg`) · Next.js (App Router) web. No shared runtime service; no central token DB.

**Changes from v1.0:** Added vanity aliases, device-aware routing, landing page mode, resume tokens, ephemeral persona tokens, per-artifact campaign tokens, two additional DQR strategies, flat-file failover, the asset health watcher service, and per-domain branded QR rendering. All additions are per domain and introduce no cross-site dependency.

> **Reading guide.** Part A below (§1–§21) is the original design contract and is preserved verbatim. Where the shipped code deliberately diverges from it, the code is authoritative for *what runs today* and Part A is authoritative for *intent*; every such divergence is listed in **Part B §B9 — Known deviations**. If you are installing this on a new site, you can read Part A for understanding and then work straight from **Part B §B10 (runbook)** and **§B11 (portability checklist)**.

---

## 1. Purpose

Every public link to a downloadable or streamable asset in the Jubilee ecosystem must be masked behind a short, opaque, domain local redirect token. No end user, scraper, or scanner should ever see a raw CDN path, storage bucket name, folder convention, or file naming scheme.

The system delivers four things:

1. **A redirector runtime** that resolves a short token to a real asset and issues a redirect.
2. **A QR generation layer** that produces a scannable, branded code for every token, automatically.
3. **An arrival experience** that turns a scan into something better than a blind file download.
4. **An admin console** scoped to a single domain, with a drill down hierarchy that mirrors that domain's product model.

---

## 2. Non Negotiable Architectural Principles

Read this section twice. It overrides any instinct toward centralization.

### 2.1 Fully distributed

Each website in the ecosystem (JubileeVerse.com, JubiLujah.com, TorahSings.com, KJubilee.com, InspirePrayers.com, JubileeInspire.com, and any future domain) runs its **own complete, self contained instance** of the redirector engine.

That means each domain owns:

- Its own token table, alias table, and asset registry
- Its own dynamic resolution rules
- Its own QR image cache and brand style profile
- Its own landing page templates
- Its own scan and click logs
- Its own admin console
- Its own failover snapshot and health watcher service

There is **no shared runtime service**. There is **no central token database**. There is **no cross domain API dependency in the request path**. If JubiLujah goes down, TorahSings redirects keep working, and vice versa.

### 2.2 What IS shared

Only a **versioned code library**, distributed as a package (NuGet, npm, or Composer depending on each site's stack). Sites pull the library, pin a version, and upgrade on their own schedule. Upgrading one site never forces an upgrade elsewhere.

The library ships: token generator, redirect resolver, QR renderer, landing page engine, admin console components, database migrations, profile loaders, health watcher service.

### 2.3 No central admin, for now

A future read only aggregator that polls each domain and displays a combined view is permitted as a **separate, optional, non blocking** project. It must never be required for a redirect to resolve, for a token to be created, or for the admin console to function. Do not build it in this phase. Do not design dependencies that assume it.

### 2.4 Why this matters

Prior attempts at a centralized model produced operator confusion, high training cost, and degraded AI performance across a monolithic dataset. Locality of data is a feature here, not a compromise.

---

## 3. URL, Token, and Alias Specification

### 3.1 URL shape

```
https://<domain>/r/<TOKEN>
```

Examples:

```
https://jubilujah.com/r/K7M9P2XR4TWB
https://torahsings.com/r/H3NQ8FVJ5CDY
https://jubileeverse.com/r/9RTBM4KXWP7H
```

The `/r/` prefix is fixed across all domains. Do not vary it per site.

### 3.2 Token format

| Property | Value |
|---|---|
| Length | Exactly 12 characters |
| Character set | `ABCDEFGHJKMNPQRSTVWXYZ23456789` (30 characters) |
| Case | Uppercase only |
| Excluded characters | `I`, `L`, `O`, `U`, `0`, `1` |
| Generation | Cryptographically secure RNG. Never `Random()`, never sequential, never timestamp derived. |
| Keyspace | 30^12, approximately 5.3 x 10^17 |

**Why uppercase only:** QR codes encode uppercase alphanumeric in a denser mode than mixed case. Uppercase only tokens produce visibly simpler, faster scanning codes, which matters on printed material.

**Why those exclusions:** `I/L/1` and `O/0/U` are the characters people misread when typing a short link from a printed page.

**URL matching must be case insensitive.** Accept `k7m9p2xr4twb`, normalize to uppercase, resolve. Always canonicalize to uppercase in storage and in generated QR payloads.

> ⚠ **As-built deviation (see Part B §B9).** The shipped `tokens.js` generates **mixed-case, case-SENSITIVE Base58** tokens (58-char alphabet), not the uppercase-only 30-char alphabet specified here, and token matching is therefore case-sensitive. Only the QR *payload host* is uppercased; the token is preserved verbatim, and `next.config.mjs` maps the uppercase QR path prefixes `/R/…`→`/r/…` and `/RP/…`→`/rp/…`. **Aliases** are uppercase and case-insensitive as specified. A new-site installer who wants the spec's uppercase-only behavior must change the alphabet/normalization in `app/api/src/redirector/tokens.js` and re-decide the payload/casing rules together.

### 3.3 Tokens are opaque

Do **not** encode type, domain, product line, date, or any other metadata inside the token string. Every character is random. Embedding metadata leaks exactly the structural information the system exists to hide, and it shrinks the effective keyspace. Type and ownership live in the local database row, never in the visible string.

Collisions across domains are irrelevant because tokens are only ever resolved by the domain that issued them. Uniqueness is enforced per domain by a unique index, with retry on collision (maximum 5 attempts, then error).

### 3.4 Token blocklist

Before a generated token is accepted, screen it against a profanity and reserved word list in English and Romanian, checked as a substring match. Regenerate on a hit. Also reserve these paths and never issue them as tokens: `ADMIN`, `LOGIN`, `HEALTH`, `ROBOTS`, `SITEMAP`, `API`, `QR`.

### 3.5 Vanity aliases

A token may additionally answer to one or more human readable aliases on the same path.

```
https://kjubilee.com/r/DANIEL7        (alias)
https://kjubilee.com/r/K7M9P2XR4TWB   (canonical token)
```

Both resolve to the identical asset record. This exists because spoken and printed contexts cannot use a random string. A radio host, a speaker at a conference, a pulpit announcement, and a banner headline all need something a person can hear once and remember.

| Property | Value |
|---|---|
| Length | 4 to 20 characters |
| Character set | `A-Z`, `0-9`, and hyphen. No leading or trailing hyphen. |
| Case | Stored uppercase, matched case insensitively |
| Namespace | Shared with tokens. An alias can never collide with an existing token or alias. |
| Approval | Manual. Aliases are created by a `manager` role only, never by automation. |
| Screening | Same profanity and reserved word blocklist as tokens |
| Limit | Maximum 5 aliases per token |

**Aliases inherit every immutability rule in section 5.** Once an alias is spoken on air or printed on a banner it is permanent. It is never deleted, never reused, and never repointed to unrelated content.

**Resolution order:** exact token match first, then alias match. Tokens always win.

---

## 4. The Indirection Model

This is the single most important design decision in the system.

A token **never** points at a file path. A token points at a **canonical asset ID**. The asset record holds the current path.

```
TOKEN or ALIAS  ->  ASSET_ID  ->  current storage location
```

Consequences:

- A file can be moved, renamed, re encoded, versioned, or migrated to a new CDN with zero effect on any printed QR code.
- A song can be reassigned to a different album without breaking its link.
- A chapter can be renumbered without breaking its link.
- A CDN provider can be swapped wholesale by updating asset rows only.

**Rule: no code path anywhere may write a storage URL into the token table.**

---

## 5. Token Immutability and Lifecycle

### 5.1 Permanence guarantee

Once issued, a token is permanent. It is never deleted, never reused, never reassigned to unrelated content. QR codes get printed on physical books, album inserts, pamphlets, and banners. Those artifacts outlive any software release.

### 5.2 Allowed states

| State | Behavior |
|---|---|
| `active` | Resolves normally. |
| `retired` | Serves a branded landing page (HTTP 200) explaining the item is no longer available, with navigation to related content. Never a bare 404. |
| `superseded` | Resolves to a replacement asset. Original asset ID retained in the row for audit. |
| `suspended` | Temporarily disabled by an admin. Serves a branded "temporarily unavailable" page. Reversible. |

### 5.3 Prohibited operations

- Hard deleting a token or alias row
- Recycling a retired token or alias string
- Repointing a token to content unrelated in kind (a song token must never become a book token)

Enforce the last rule with a `content_kind` field checked on every update.

**Exception:** ephemeral persona tokens (section 6.7) live in a separate namespace and are exempt, because they are never printed and never enter the permanent catalog.

---

## 6. Token Types and Resolution Modes

Two token types. Both look identical to the end user. Both use the same URL shape. On top of the type sits a resolution mode that shapes what actually happens on a scan.

### 6.1 Static QR (type `QR`)

Resolves to one fixed asset, always. Use for: an album, a track, a book, a chapter, an app download, an article.

The target may be updated by an admin (for example, a remastered audio file), but the **identity** of what it points to never changes.

### 6.2 Dynamic QR (type `DQR`)

Resolves through a **rule** evaluated at request time that returns a different asset depending on context. Use for: Daily Bread pamphlets, song of the day, devotional of the week, seasonal campaigns, rotating featured content.

The printed code is generated once and never reprinted. The content behind it rotates indefinitely.

### 6.3 Type is fixed at creation

A token cannot be converted from `QR` to `DQR` or back. If the need changes, issue a new token and mark the old one `superseded`. This keeps the resolution contract stable for anything already in print.

### 6.4 Device aware routing

Any token, static or dynamic, may carry a device route map. The resolver inspects the user agent and selects a destination accordingly.

```json
{
  "ios":     "asset-id-or-url",
  "android": "asset-id-or-url",
  "desktop": "asset-id-or-url",
  "tablet":  "asset-id-or-url",
  "default": "asset-id-or-url"
}
```

This is why a single code on the back of an album insert can send an iPhone to the App Store, an Android to Play, and a laptop to the web player. Without it you would print three codes and lose the design.

Rules:

- `default` is mandatory whenever a route map exists. Unknown or spoofed agents get the default.
- Device detection uses a maintained user agent library, not hand written regular expressions.
- The route map is evaluated **after** DQR rule resolution, so a dynamic token can also be device aware.
- Bots always receive the `default` route so link previews stay correct.

### 6.5 Landing page mode

Each token carries a boolean `landing_enabled`. When false the resolver issues a direct 302, which is correct for a file download. When true the resolver serves a branded arrival page instead, described in full in section 11.

Recommended defaults by content kind:

| Content kind | Landing page |
|---|---|
| `album`, `book`, `app`, `video` | On |
| `track`, `chapter`, `article`, `devotional` | On |
| `pdf`, `image`, direct file downloads | Off |

Operators toggle this per token from the admin console. A hard redirect into a raw audio file wastes the one moment where someone is actually paying attention to the product.

### 6.6 Resume tokens

A token bound to a **taxonomy node** rather than a single asset, which resolves to the next unconsumed item in that node's ordered children for the specific person scanning.

A single QR printed once on the back of a book resolves to chapter one for a new reader and chapter seven for a returning one. The same applies to an album, a sermon series, or a devotional collection.

Implementation:

- Progress for anonymous scanners is stored in a first party cookie scoped to that domain, with a 2 year expiry.
- Progress for SSO authenticated users is stored server side against the linked site account, and takes precedence over the cookie.
- A cookie and an account that disagree resolve to the further position, never backward.
- Every resume token exposes a "start over" control on its landing page. Resume mode requires `landing_enabled` to be true so that control has somewhere to live.
- If progress data is unreadable, resolve to the first child. Never error.

This is the single most interesting thing a printed code can do that a plain link cannot.

### 6.7 Ephemeral persona tokens

When a persona recommends an item in conversation, it may mint a short lived token carrying recommendation context, so the landing page can open with the persona's name and the reason the item was suggested.

| Property | Value |
|---|---|
| Namespace | Separate table, separate prefix path `/rp/` |
| Lifetime | 30 days from creation, then hard expiry |
| Printing | Never. These must not enter the permanent catalog or any QR export. |
| Immutability | Exempt. These are the only tokens in the system that expire. |
| Context payload | Persona name, one line reason, originating conversation reference (opaque) |

On expiry, the URL resolves to the underlying asset's permanent token rather than erroring, so an old link a user saved still works. It simply loses the personal framing.

---

## 7. Dynamic Resolution Rules

Rules are **defined and owned per domain**. There is no shared evaluation engine and no shared rule library.

### 7.1 Strategies required for v2

| Strategy | Description |
|---|---|
| `calendar_map` | Explicit date to asset mapping. Used for Daily Bread and dated devotionals. |
| `sequence_daily` | Cycles an ordered pool, one item per day, wraps at the end. |
| `sequence_weekly` | As above, advanced weekly. |
| `date_range` | Serves asset A between dates, asset B between other dates. First match wins. |
| `random_pool` | Uniform random from a pool, with a no repeat window. |
| `latest_in_collection` | Always resolves to the newest published item in a named collection. |
| `geo_route` | Resolves by request country or region. Serves the Romanian edition to a scan originating in Romania, English elsewhere. |
| `time_of_day` | Resolves by hour within the rule's declared time zone. Morning devotional before noon, evening devotional after. |

### 7.2 Rule requirements

- **Time zone is explicit per rule.** Default `America/Los_Angeles`. Store the IANA name, never a raw offset.
- **Every rule must define a fallback asset.** If evaluation throws, returns nothing, or the resolved asset is missing, serve the fallback. A DQR must never dead end.
- **`geo_route` must define a default region.** Geo lookup failure resolves to default, never to an error.
- **Evaluation must be deterministic and side effect free**, except for the scan log write.
- **Evaluation must complete in under 50ms.** Precompute or cache the candidate pool in memory, refreshed every 5 minutes.
- Strategies may be **chained**: a DQR resolves its rule first, then applies device routing (6.4), then decides landing page versus redirect (6.5).

### 7.3 Preview requirement

The admin console must let an operator enter any date, country, and device class, then see exactly what that DQR would resolve to under those conditions. This is required before a rule can be saved.

---

## 8. Data Model

Each domain provisions the following in its own existing database. Table prefix `rdr_`.

Note: unlike the IPX pipeline ledger, this subsystem requires a real database rather than JSON files. Lookups sit in the hot path of every scan, scan events accumulate continuously, and concurrent writes are expected. Use whatever engine the host site already runs.

### 8.1 `rdr_assets`

| Column | Type | Notes |
|---|---|---|
| `asset_id` | GUID, PK | Immutable. Never regenerated. |
| `content_kind` | varchar(32) | `album`, `track`, `book`, `chapter`, `article`, `app`, `devotional`, `image`, `video`, `pdf`, `external` |
| `title` | nvarchar(300) | |
| `slug` | varchar(200) | |
| `storage_url` | nvarchar(1000) | Current CDN or storage location. Mutable. |
| `storage_provider` | varchar(64) | For future migration. |
| `mime_type` | varchar(128) | |
| `byte_size` | bigint | Nullable. |
| `checksum_sha256` | char(64) | Nullable. Used by the health watcher. |
| `keywords` | nvarchar(1000) | Comma separated. Feeds persona lookup. |
| `summary` | nvarchar(500) | One or two sentences. Feeds persona lookup and landing pages. |
| `cover_image_url` | nvarchar(1000) | Nullable. Used by landing pages. |
| `taxonomy_node_id` | GUID, FK | |
| `sort_order` | int | Position among siblings. Required for resume tokens. |
| `published_at` | datetime2 | Nullable. |
| `ipx_number` | varchar(32) | Nullable. Links back to the IPX pipeline record. |
| `health_status` | varchar(16) | `ok`, `unreachable`, `checksum_mismatch`, `unchecked` |
| `health_checked_at` | datetime2 | Nullable. |
| `is_active` | bit | |
| `created_at`, `updated_at` | datetime2 | |

### 8.2 `rdr_tokens`

| Column | Type | Notes |
|---|---|---|
| `token` | char(12), PK | Uppercase. Unique index. |
| `token_type` | char(3) | `QR` or `DQR`. Immutable after insert. |
| `resolution_mode` | varchar(16) | `asset`, `rule`, `resume` |
| `asset_id` | GUID, FK | Required when mode is `asset`. |
| `rule_id` | GUID, FK | Required when mode is `rule`. |
| `resume_node_id` | GUID, FK | Required when mode is `resume`. |
| `content_kind` | varchar(32) | Enforced to match asset on update. |
| `device_routes_json` | nvarchar(max) | Nullable. See 6.4. |
| `landing_enabled` | bit | See 6.5. |
| `landing_config_json` | nvarchar(max) | Nullable. Template and block overrides. |
| `state` | varchar(16) | `active`, `retired`, `superseded`, `suspended` |
| `superseded_by_token` | char(12) | Nullable. |
| `label` | nvarchar(200) | Admin facing description. |
| `campaign` | nvarchar(100) | Nullable. See 8.9. |
| `placement` | nvarchar(100) | Nullable. Physical artifact this code was printed on. |
| `created_by` | varchar(100) | |
| `created_via` | varchar(32) | `admin_ui`, `api`, `ipx_pipeline`, `persona` |
| `created_at` | datetime2 | |
| `last_resolved_at` | datetime2 | Nullable. |
| `resolve_count` | bigint | Denormalized counter. |

Covering index on `(token, state)`. This is the hot path.

### 8.3 `rdr_aliases`

| Column | Type | Notes |
|---|---|---|
| `alias` | varchar(20), PK | Uppercase. Unique across aliases and tokens. |
| `token` | char(12), FK | |
| `approved_by` | varchar(100) | |
| `created_at` | datetime2 | |
| `resolve_count` | bigint | Tracked separately from the canonical token. |

### 8.4 `rdr_rules`

| Column | Type | Notes |
|---|---|---|
| `rule_id` | GUID, PK | |
| `name` | nvarchar(200) | |
| `strategy` | varchar(32) | See 7.1. |
| `parameters_json` | nvarchar(max) | Strategy specific. |
| `pool_json` | nvarchar(max) | Ordered array of asset IDs, or a collection reference. |
| `timezone` | varchar(64) | IANA name. |
| `default_region` | char(2) | Required for `geo_route`. |
| `fallback_asset_id` | GUID, FK | Required, not null. |
| `is_active` | bit | |

### 8.5 `rdr_taxonomy_nodes`

| Column | Type | Notes |
|---|---|---|
| `node_id` | GUID, PK | |
| `parent_node_id` | GUID | Null at root. |
| `level_key` | varchar(64) | Matches a level in the domain taxonomy profile. |
| `title` | nvarchar(300) | |
| `slug` | varchar(200) | |
| `sort_order` | int | |
| `cover_image_url` | nvarchar(1000) | Nullable. |
| `metadata_json` | nvarchar(max) | Level specific fields. |
| `is_active` | bit | |

### 8.6 `rdr_resume_state`

| Column | Type | Notes |
|---|---|---|
| `state_id` | GUID, PK | |
| `token` | char(12), FK | |
| `subject_key` | varchar(128) | Cookie ID for anonymous, SSO linked account ID when authenticated. |
| `subject_type` | varchar(16) | `cookie`, `account` |
| `last_asset_id` | GUID | |
| `last_position` | int | Sort order of the last consumed sibling. |
| `updated_at` | datetime2 | |

Unique index on `(token, subject_key)`. Purge `cookie` rows untouched for 24 months.

### 8.7 `rdr_ephemeral_tokens`

| Column | Type | Notes |
|---|---|---|
| `eph_token` | char(12), PK | Same alphabet, separate namespace, served at `/rp/`. |
| `asset_id` | GUID, FK | |
| `persona_name` | nvarchar(100) | |
| `reason_text` | nvarchar(300) | One line, shown on the landing page. |
| `expires_at` | datetime2 | Creation plus 30 days. |
| `created_at` | datetime2 | |

On expiry, resolve to the asset's permanent token rather than erroring.

### 8.8 `rdr_qr_images`

| Column | Type | Notes |
|---|---|---|
| `qr_id` | GUID, PK | |
| `token` | char(12), FK | |
| `variant` | varchar(32) | `standard`, `print`, `logo`, `inverted`, `branded` |
| `style_profile` | varchar(64) | Which brand style was applied. |
| `format` | varchar(8) | `svg`, `png` |
| `pixel_size` | int | Null for SVG. |
| `error_correction` | char(1) | `L`, `M`, `Q`, `H` |
| `file_url` | nvarchar(1000) | Cached render location. |
| `generated_at` | datetime2 | |

### 8.9 `rdr_scan_events`

| Column | Type | Notes |
|---|---|---|
| `event_id` | bigint identity, PK | |
| `token` | char(12) | Indexed. |
| `via_alias` | varchar(20) | Nullable. Which alias was used, if any. |
| `resolved_asset_id` | GUID | What was actually served. Critical for DQR analysis. |
| `campaign` | nvarchar(100) | Copied from the token row at write time. |
| `placement` | nvarchar(100) | Copied from the token row at write time. |
| `occurred_at` | datetime2 | UTC. Indexed. |
| `ip_hash` | char(64) | SHA256 of IP plus a rotating daily salt. Never store raw IP. |
| `user_agent` | nvarchar(500) | |
| `device_class` | varchar(16) | `mobile`, `tablet`, `desktop`, `bot`, `unknown` |
| `referrer` | nvarchar(1000) | Nullable. |
| `country_code` | char(2) | Nullable. |
| `is_bot` | bit | |
| `landing_shown` | bit | Whether an arrival page was served. |
| `landing_action` | varchar(32) | Nullable. What the visitor clicked on the landing page. |

Partition or roll monthly. Aggregate into a daily rollup after 90 days, then archive raw rows.

---

## 9. Redirector Runtime Behavior

### 9.1 Request flow

1. Receive `GET /r/{token}`.
2. Normalize to uppercase, strip whitespace.
3. Validate shape. Fail fast on malformed input, no database call.
4. Look up as a token. On miss, look up as an alias.
5. Use an in memory cache with a 60 second TTL for `active` tokens resolving in `asset` mode. Never cache `rule` or `resume` resolutions.
6. Branch on state (section 5.2).
7. Resolve by mode: direct asset, rule evaluation, or resume position.
8. Apply device routing if a route map exists.
9. If `landing_enabled`, render the arrival page. Otherwise issue the redirect.
10. Write the scan event asynchronously. **The log write must never block or fail the redirect.** Fire and forget onto a queue.

### 9.2 HTTP semantics

Use **HTTP 302 Found** for every redirect, static and dynamic alike.

Do not use 301. Browsers cache 301 responses permanently, which would strip your ability to repoint an asset and would silently kill your scan analytics.

Response headers on redirects:

```
Cache-Control: no-store, no-cache, must-revalidate
Pragma: no-cache
Referrer-Policy: no-referrer
X-Robots-Tag: noindex, nofollow
```

`Referrer-Policy: no-referrer` matters. Without it the destination server receives your redirector URL in the referrer chain.

### 9.3 Signed destination URLs

Where the CDN supports it, generate a **short lived signed URL** as the redirect destination rather than a permanent public path. Recommended TTL: 300 seconds for downloads, 3600 seconds for streaming manifests.

This is the deepest layer of the security model. Even if someone captures the resolved URL from browser history or a network log, it stops working within minutes and cannot be shared, hotlinked, or fed into a scraper.

Where the CDN does not support signing, note the domain as a gap in the deployment checklist.

### 9.4 Error handling

| Condition | Response |
|---|---|
| Malformed token | 404, branded page, no database hit |
| Token and alias both not found | 404, branded page, logged as a probe attempt |
| Token retired | 200, branded "no longer available" page with related links |
| Token suspended | 200, branded "temporarily unavailable" page |
| Asset row missing | 302 to the fallback, alert raised |
| Rule evaluation failure | 302 to the rule fallback asset, alert raised |
| Resume state unreadable | Resolve to the first child asset |
| Ephemeral token expired | Resolve to the asset's permanent token |

**No error path may ever expose a storage path, a stack trace, a database error, or an internal identifier.**

### 9.5 Abuse controls

- Rate limit by IP hash: 60 redirect requests per minute, 600 per hour. Return 429 beyond that.
- Track 404 rate per IP. More than 20 unknown lookups in 5 minutes indicates enumeration. Log, alert, apply a progressive delay.
- Maintain a bot user agent list. Bots still resolve so link previews work, but are flagged `is_bot` and excluded from reporting totals.
- `/r/` and `/rp/` must be disallowed in `robots.txt` and marked `noindex`.

### 9.6 Flat file failover

Every night at 02:00 local, each domain writes a static snapshot of its active tokens and aliases to a plain file on local disk.

```
/redirector/snapshot/tokens.json
/redirector/snapshot/aliases.json
/redirector/snapshot/manifest.json
```

Snapshot contents: token, alias, state, resolved storage URL for `asset` mode tokens, fallback asset URL for `rule` mode tokens, device route map.

If the database is unreachable, the resolver falls back to the snapshot and continues serving redirects in read-only mode:

- `asset` mode tokens resolve normally
- `rule` mode tokens resolve to their declared fallback asset
- `resume` mode tokens resolve to the first child
- Landing pages degrade to direct redirects
- Scan events buffer to a local append-only file and replay when the database returns
- The admin console refuses writes and displays a clear degraded-mode banner

Since resilience is the entire reason for the distributed architecture, this closes the last remaining single point of failure inside each domain. Verify the snapshot loads correctly as part of every deployment.

---

## 10. QR Image Generation

### 10.1 Generation timing

- **On token creation:** render and cache `standard` SVG plus a 1024px PNG.
- **On demand:** any other variant, rendered and cached on first request.
- **Never regenerate on resolution.** QR images are static artifacts of the token string, which never changes.

### 10.2 Variants

| Variant | Error correction | Use |
|---|---|---|
| `standard` | M | Screen, web, in app |
| `print` | Q | Book interiors, album inserts, pamphlets |
| `logo` | H | Any variant with a centered brand mark |
| `inverted` | Q | Light code on dark background |
| `branded` | H | Full brand styling per section 10.5 |

Error correction level H is mandatory whenever a logo overlays the center. The overlay must never exceed 25% of the code's width.

### 10.3 Output requirements

- SVG is the primary format. Vector, infinitely scalable, print ready.
- PNG at 512, 1024, and 2048 pixels.
- Quiet zone of 4 modules minimum on all sides. Never crop it.
- Minimum printed physical size: 2cm by 2cm. Surface this as a warning when an operator downloads a print variant.
- Contrast ratio of at least 4:1 between foreground and background. Reject brand color combinations that fall below it.

### 10.4 Encoded payload

Encode the full canonical URL, uppercase, no query string, no trailing slash:

```
HTTPS://JUBILUJAH.COM/R/K7M9P2XR4TWB
```

Uppercase the entire payload including scheme and host. This keeps the code inside QR alphanumeric encoding mode. Hosts are case insensitive, so this resolves correctly everywhere.

Campaign and placement tracking is applied through the token record, not through query parameters in the payload. Query strings force the code into byte mode and make it noticeably denser.

### 10.5 Per domain brand style profiles

Each domain ships a `qr.style.json` alongside its taxonomy profile.

```json
{
  "domain": "jubilujah.com",
  "styles": [
    {
      "key": "default",
      "module_shape": "rounded",
      "eye_shape": "rounded_square",
      "foreground": "#1A1A2E",
      "background": "#FFFFFF",
      "eye_color": "#C9A227",
      "center_mark_url": "https://.../mark.svg",
      "center_mark_scale": 0.18,
      "error_correction": "H"
    }
  ]
}
```

A code that looks intentional gets scanned measurably more often than a generic black grid, and on album art or a book cover a plain code reads as damage to the design. Requirements:

- Every style must pass an automated scan verification test at minimum print size before it can be saved. Render, decode programmatically, confirm the payload matches. Reject the style if decoding fails.
- Contrast and quiet zone rules in 10.3 are enforced regardless of brand preference. Brand never overrides scannability.
- Styles are per domain. There is no shared style library.

---

## 11. Landing Page and Arrival Experience

When `landing_enabled` is true, the resolver serves a page instead of a bare redirect. This is where a scan stops being a file transfer and becomes an arrival.

### 11.1 Required blocks

| Block | Content |
|---|---|
| Hero | Cover image, title, content kind, and the asset summary |
| Primary action | Play, Read, or Download, sized as the obvious next tap |
| Secondary actions | Share sheet, add to library when SSO authenticated, open in app |
| Context strip | Position in the hierarchy, for example Persona > Album > Song |
| Related | Two to four siblings or related items drawn from the same taxonomy node |
| Persona note | Only present for ephemeral persona tokens. Persona name plus the one line reason. |
| Resume control | Only present on resume tokens. Shows current position and a "start over" option. |

### 11.2 Requirements

- **Mobile first.** The overwhelming majority of scans are phones held at arm's length.
- **Render in under 1 second on a 4G connection.** Server rendered, inline critical CSS, lazy load below the fold. If it feels slower than the redirect it replaced, it has failed.
- **The primary action must work without JavaScript.** It is a plain link to the signed destination URL.
- **Every landing page interaction writes `landing_action` to the scan event**, so you can see whether arrival pages actually increase engagement or just add a tap.
- Templates are per domain, themed to that site, and live in the domain's own codebase.
- `noindex` on every landing page. These are not SEO surfaces.

### 11.3 Measurement requirement

For at least the pilot domain, run a comparison: identical content, half the tokens with landing pages on, half off. Compare completion rate, not scan rate. If landing pages do not measurably improve engagement for a given content kind, default them off for that kind.

---

## 12. Admin Console

Scoped to a single domain. Ships as part of the library, themed per site.

### 12.1 Layout

Three panes.

**Left: hierarchy navigation.** Renders the domain's taxonomy tree, driven by the taxonomy profile in section 13. Collapsible, searchable, drag to reorder.

**Center: line item list.** For the selected node, a row per child item and per asset. Each row shows: title, content kind badge, token string (click to copy), alias if present, QR thumbnail with a download menu per variant, type badge (`QR` or `DQR`), mode badge (`asset`, `rule`, `resume`), landing page indicator, state badge, health indicator, resolve count, last resolved, inline editable keywords, and actions.

**Right: detail and inspector panel.** Full record for the selected item. Holds the rule editor, the device route map editor, the landing page configuration, and the preview described in 7.3.

### 12.2 Required functions

- Bulk generate tokens for every asset under a selected node that lacks one
- Bulk download QR codes as a ZIP, foldered to match the hierarchy
- Bulk export CSV: token, alias, URL, title, kind, campaign, placement, tree path
- Create a campaign set: one asset, multiple placement tokens generated in a single action (section 17.2)
- Alias request and approval workflow
- Search across tokens, aliases, titles, and keywords
- Filter by kind, type, mode, state, campaign, placement, health, date range
- Print sheet generator: a grid of QR codes with captions sized for a label sheet, exported as PDF
- Scan log viewer per token with a 90 day chart
- Health dashboard listing every asset flagged by the watcher service
- Audit trail showing every change to every token, who and when

### 12.3 Authentication

Admin access authenticates through the Jubilee SSO authority at `sso.jubileeinspire.com`, consistent with the rest of the ecosystem. The redirector admin is a member site capability, not a separate credential store. Never store passwords locally.

| Role | Permissions |
|---|---|
| `viewer` | Read tokens, view QR codes, view logs |
| `editor` | Create tokens, edit keywords and labels, download QR codes |
| `manager` | Edit rules, approve aliases, configure landing pages, retire and supersede tokens, edit taxonomy |
| `owner` | All of the above plus API key management and style profile editing |

### 12.4 Design constraint

The console must be usable by a data entry operator with no technical background. Plain labels, no jargon, no exposed GUIDs in the primary interface, no raw JSON in any default view. Rule editing, device routing, and landing configuration are all form driven, never text driven.

---

## 13. Taxonomy and Brand Profiles

Each domain ships a `taxonomy.profile.json` and a `qr.style.json`. The admin console renders itself from these. Adding a new domain to the ecosystem means writing two profiles, not writing new code.

### 13.1 Taxonomy profile schema

```json
{
  "domain": "jubilujah.com",
  "display_name": "JubiLujah Music",
  "levels": [
    {
      "key": "persona",
      "label": "Persona",
      "plural": "Personas",
      "depth": 0,
      "tokenizable": false,
      "metadata_fields": ["bio", "portrait_url"]
    },
    {
      "key": "album",
      "label": "Album",
      "plural": "Albums",
      "depth": 1,
      "tokenizable": true,
      "default_token_type": "QR",
      "default_landing_enabled": true,
      "resume_eligible": true,
      "metadata_fields": ["release_date", "cover_url", "genre"]
    },
    {
      "key": "track",
      "label": "Song",
      "plural": "Songs",
      "depth": 2,
      "tokenizable": true,
      "default_token_type": "QR",
      "default_landing_enabled": true,
      "metadata_fields": ["duration", "track_number", "lyrics_url"]
    },
    {
      "key": "article",
      "label": "Article",
      "plural": "Articles",
      "depth": 2,
      "tokenizable": true,
      "attaches_to": ["album", "track"]
    }
  ]
}
```

### 13.2 Reference profiles to deliver

| Domain | Hierarchy | Notable |
|---|---|---|
| JubiLujah.com | Persona, Album, Song, plus Articles | Resume tokens on albums, device routing to app stores |
| TorahSings.com | Series, Book, Chapter, plus Articles and Song references | Resume tokens on books, the strongest use case |
| JubileeVerse.com | Category, Article, plus Related media | `latest_in_collection` DQR per category |
| KJubilee.com | Station, Show, Episode | Vanity aliases are essential, spoken on air |
| InspirePrayers.com | Collection, Prayer | `calendar_map` and `time_of_day` DQR |

### 13.3 Rules

- `tokenizable: false` levels are organizational only and never receive a token.
- `attaches_to` allows a level to hang off more than one parent type.
- `resume_eligible: true` allows a resume token to be created against that level.
- Depth is advisory for rendering. The actual tree is defined by `parent_node_id`.

---

## 14. Automation API

This is how tokens actually get created. Manual data entry is the exception, not the rule.

All endpoints live under `https://<domain>/api/redirector/v1/`, authenticate with a per domain API key in an `X-Redirector-Key` header, and are rate limited to 300 requests per minute.

### 14.1 Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/assets` | Register an asset. Returns `asset_id`. |
| `POST` | `/tokens` | Issue a token. Returns token, URL, QR URLs. |
| `POST` | `/tokens/bulk` | Issue tokens for an array of assets in one call. |
| `POST` | `/tokens/campaign-set` | Issue N placement tokens for one asset in one call. |
| `POST` | `/taxonomy/nodes` | Create or update a hierarchy node. |
| `POST` | `/rules` | Create a DQR rule. |
| `POST` | `/aliases` | Request an alias. Returns pending until a manager approves. |
| `GET` | `/tokens/{token}` | Full record including current resolution. |
| `GET` | `/lookup` | Search by keyword, kind, and node. |
| `POST` | `/persona/token` | Mint an ephemeral persona token. See section 15. |
| `PATCH` | `/assets/{id}` | Update storage location, keywords, or summary. |
| `POST` | `/tokens/{token}/retire` | Retire, with optional supersession target. |
| `GET` | `/health/assets` | Health watcher results. |

### 14.2 Idempotency

Every `POST` accepts an `Idempotency-Key` header. Replaying a key returns the original result rather than creating a duplicate. This is mandatory. Pipeline retries must never produce a second token for the same asset.

### 14.3 IPX pipeline integration

When a product completes a station in the IPX pipeline and reaches a publishable state, the station handler calls this API on the appropriate domain:

1. `POST /taxonomy/nodes` to place the product in the tree if the node does not yet exist
2. `POST /assets` for each publishable artifact, with `sort_order` set so resume tokens work
3. `POST /tokens/bulk` for everything tokenizable
4. `POST /tokens/campaign-set` for known physical placements
5. Write the returned tokens, URLs, and QR file locations back into the project's `index.json`

The IPX serial travels through as `ipx_number` on the asset row, so any token can be traced back to its originating project folder.

---

## 15. Persona Integration

### 15.1 Lookup

Personas resolve links through `GET /lookup`.

```
GET /api/redirector/v1/lookup?kind=track&q=restoration&limit=3
```

```json
{
  "results": [
    {
      "token": "K7M9P2XR4TWB",
      "title": "Song title here",
      "kind": "track",
      "summary": "One line summary for context.",
      "keywords": ["restoration", "healing", "psalms"],
      "short_url": "https://jubilujah.com/r/K7M9P2XR4TWB",
      "qr_svg_url": "https://jubilujah.com/qr/K7M9P2XR4TWB.svg",
      "qr_png_url": "https://jubilujah.com/qr/K7M9P2XR4TWB.png",
      "path": "Persona Name > Album Name > Song Title"
    }
  ]
}
```

Personas call the API for the domain that owns the content. They never construct a token themselves and never guess a URL.

This is why `keywords` and `summary` are mandatory on every asset and must be populated at creation. An asset with empty keywords is invisible to persona recommendation.

### 15.2 Contextual handoff

For a warmer handoff, the persona mints an ephemeral token:

```
POST /api/redirector/v1/persona/token
{
  "asset_id": "...",
  "persona_name": "...",
  "reason_text": "One line on why this fits what you described."
}
```

Returns a `/rp/` URL and QR. The landing page opens with the persona's name and that reason, so the link arrives as a personal recommendation rather than an anonymous URL. Governed entirely by section 6.7.

Personas present the short URL as a clickable link, and the QR image where a scan is more convenient than a tap, such as moving from a desktop conversation to a phone.

---

## 16. Asset Health Watcher Service

A background service running on each domain, independent of the request path.

### 16.1 Behavior

- Walks `rdr_assets` on a rolling schedule, covering every active asset at least every 24 hours
- Issues a HEAD request against each `storage_url`, following redirects, with a 10 second timeout
- Where a checksum is recorded, periodically fetches and verifies it (weekly is sufficient, and skip files above 100MB)
- Writes `health_status` and `health_checked_at`
- Raises an alert on any transition into `unreachable` or `checksum_mismatch`
- Never modifies an asset or a token. It only observes and reports.

### 16.2 Why this is required

A printed QR code that dead ends is a real-world failure you cannot recall from a book already in someone's hands. This catches a broken or moved asset before a reader does. Checksum verification doubles as tamper detection: a silently replaced file on the CDN is a security event, not a content event.

### 16.3 Rate control

Throttle to no more than 10 requests per second against any single storage host so the watcher never resembles an attack against your own CDN.

---

## 17. Logging, Analytics, and Campaign Attribution

### 17.1 Per domain reporting

- Resolutions per token over time
- Top 25 tokens by resolutions, filterable by kind and date range
- Device class breakdown
- Country breakdown
- Referrer breakdown, direct traffic and QR scan traffic separated where distinguishable
- Alias versus canonical token split per item
- For DQR tokens, which asset was actually served on each day
- Landing page conversion: scans served a page versus primary actions taken
- Resume token progression: how far readers or listeners actually get
- Unknown token probe attempts, as a security signal

### 17.2 Per artifact campaign tokens

Issue a **distinct token for every physical placement of the same asset**: book insert, album sleeve, conference handout, banner, business card, bulletin, pamphlet.

All of them carry the same `asset_id`, so nothing is duplicated downstream and the indirection model still holds. But because each has its own token row with its own `placement` value, the scan log now tells you which physical channel actually moves people.

This costs almost nothing to build and it converts print spend from guesswork into measured spend. The `campaign-set` endpoint and the admin console bulk action both exist to make this a single operation rather than tedious repetition.

Reporting requirement: a campaign view that groups all placement tokens for one asset and ranks them by resolutions, with a cost per scan field an operator can fill in manually.

### 17.3 Privacy

- Never store a raw IP address. Hash with a salt that rotates daily.
- Never correlate scans to an SSO identity unless the user is authenticated and has consented.
- Resume state for anonymous scanners is a first party cookie only, never joined to any other dataset.
- Publish retention in the site privacy policy: raw events 90 days, aggregates indefinitely.

---

## 18. Security Requirements

1. All redirector traffic is HTTPS only. HTTP receives a 308 to HTTPS before any token processing.
2. The admin console and API are on separate paths from the public redirector and may be IP restricted.
3. API keys are stored hashed, are rotatable, and are scoped per consumer (pipeline, persona, admin tooling) so one can be revoked without affecting the others.
4. All admin mutations are written to the audit trail with actor, timestamp, before value, and after value.
5. Storage buckets have directory listing disabled and public enumeration blocked. The redirector is the only sanctioned path to an asset.
6. Asset checksums are recorded at registration and verified by the health watcher. Silent file replacement raises an alert.
7. Do not include the token in any client side analytics payload that leaves your domains.
8. Ephemeral persona tokens must not leak conversation content. The context payload carries a persona name and a reason line only, never a transcript excerpt or a user identifier.

---

## 19. Deployment

### 19.1 Order of build

| Phase | Scope |
|---|---|
| 1 | Core library: token generator, schema and migrations, resolver, 302 pipeline, error pages |
| 2 | QR renderer, all variants, caching, brand style profiles with scan verification |
| 3 | Landing page engine and templates |
| 4 | Admin console: tree navigation, line item list, detail panel, manual token creation |
| 5 | Automation API with idempotency, campaign sets, alias workflow |
| 6 | Device routing and DQR rules engine, all eight strategies, plus preview |
| 7 | Flat file failover and the health watcher service |
| 8 | Resume tokens |
| 9 | Analytics, campaign attribution, audit trail |
| 10 | IPX pipeline handler integration |
| 11 | Persona lookup and ephemeral token integration |

Phases 1, 2, 4, 5, and 7 are the minimum viable deployment. Everything else can follow on a live system without disturbing tokens already issued.

### 19.2 Pilot domain

Build and prove the full stack on **one domain first**. JubiLujah.com is the recommended pilot because the music hierarchy (persona, album, song) exercises three levels of depth, both token types, resume tokens, device routing to app stores, landing pages, and the persona recommendation path in a single deployment.

Do not roll out to a second domain until the pilot has run in production for at least two weeks with real scan traffic.

### 19.3 Per domain rollout checklist

- [ ] Library version pinned
- [ ] Database migrations applied
- [ ] `taxonomy.profile.json` written and reviewed
- [ ] `qr.style.json` written and passing scan verification
- [ ] Landing page templates themed to the site
- [ ] Existing assets imported and tokens issued
- [ ] CDN signed URL support confirmed, or gap documented
- [ ] Failover snapshot generated and load-tested
- [ ] Health watcher service scheduled and alerting
- [ ] `robots.txt` updated to disallow `/r/` and `/rp/`
- [ ] SSO roles assigned to that domain's operators
- [ ] API keys issued to the pipeline and to personas
- [ ] Branded error and retired pages themed
- [ ] Rate limits tuned to expected traffic
- [ ] Monitoring and alerting connected

---

## 20. Acceptance Criteria

The build is complete when all of the following are demonstrably true.

1. A token resolves in under 100ms at the 95th percentile, measured from the edge.
2. A landing page renders in under 1 second on a throttled 4G connection.
3. Moving an asset to a new CDN path breaks no existing token and requires no QR regeneration.
4. A DQR token returns different content on two different simulated dates, and different content for two different simulated countries, verified through preview and through live requests.
5. One token resolves to three different destinations across iPhone, Android, and desktop.
6. A resume token returns chapter one on a fresh browser and the correct later chapter on a returning one, and the same position follows an SSO user across devices.
7. A retired token serves a branded page, never a raw 404 and never a stack trace.
8. No response from any code path, including every error path, contains a storage path, an internal identifier, or a file naming convention.
9. Every branded QR style decodes correctly at minimum print size in an automated verification test.
10. With the database stopped, static token redirects continue to resolve from the failover snapshot, and buffered scan events replay correctly on recovery.
11. The health watcher detects a deliberately broken asset URL and a deliberately altered file within one cycle.
12. The IPX pipeline creates a full set of tokens, placement tokens, and QR codes for a new product with zero manual data entry.
13. A persona retrieves and presents a correct short link and QR code for a keyword search, live in conversation, and an ephemeral token displays the persona attribution on arrival.
14. A vanity alias spoken aloud, typed by a listener, resolves to the same asset as its canonical token.
15. An operator with no technical background completes token creation, QR download, alias request, and rule editing after a single walkthrough.
16. Taking one domain's redirector completely offline has no effect on any other domain's redirects.
17. Adding a new domain requires only two profile files and a deployment, with no changes to the shared library.
18. Enumeration of 100 sequential guesses produces zero valid hits and triggers the abuse alert.
19. Every QR variant scans reliably at minimum print size from 30cm on a mid range phone camera.
20. Campaign reporting correctly attributes scans to the physical placement each code was printed on.

---

## 21. Open Decisions

Flag these for review before Phase 6.

1. Whether `random_pool` should persist its no repeat window server side rather than by cookie, given that most QR scans are anonymous.
2. Whether the retired page should offer automatic related content drawn from keyword similarity.
3. Whether scan events should feed the IPX pipeline's post release results scoring, and if so at what aggregation interval.
4. Retention period for the audit trail, which currently has no stated limit.
5. Whether anonymous resume state should survive a cookie clear via a device fingerprint. Recommendation: no. The privacy cost outweighs the convenience.
6. Whether vanity aliases should be permitted on DQR tokens, which would let a spoken link resolve to rotating content. Recommendation: yes, with manager approval.

---
---

# PART B — Reference Implementation & Installation Guide (as-built)

*Appended 2026-08-06. Part A above is the design contract. This part documents the code that actually exists in this repository (`w:/JubiLujah.com`), verified against source, and turns it into a runbook for installing the same engine on another website. Where the code diverges from Part A, §B9 lists every divergence; the code is authoritative for what runs today.*

## B0. Build status ledger (done / deferred)

| Phase (Part A §19.1) | Status | Notes |
|---|---|---|
| 1 · Core lib (tokens, schema, resolver, 302, error pages) | ✅ Done | Postgres schema `redirector.*`; 60s asset-mode cache; branded state pages. |
| 2 · QR renderer (variants, cache, brand styles, scan-verify) | ✅ Done | SVG primary + PNG 512/1024/2048; jsQR verification; contrast + quiet-zone enforced. |
| 3 · Landing pages | ✅ Done | Server-rendered, no-JS primary action, `noindex`, destination never in HTML. |
| 4 · Admin console | ⚠ Partial | Browse / audit / health / reports **live**; **real token minting + downloadable-QR UI + rule/device/landing form editors still deferred** (console shows preview-placeholder QR labelled "not minted"). |
| 5 · Automation API (idempotency, campaign sets, alias workflow) | ✅ Done | Full surface (§B5); API keys hashed/scoped; idempotency + audit. |
| 6 · Device routing + DQR (8 strategies) + preview | ✅ Done | UA parse is lightweight (see §B9); all 8 strategies + preview endpoints. |
| 7 · Flat-file failover + health watcher | ✅ Done | Nightly snapshot, scan-buffer replay, observe-only health cycle. |
| 8 · Resume tokens | ⚠ Partial | Anonymous cookie path **live**; **SSO cross-device account position not wired to the public route** (engine + DB exist). |
| 9 · Analytics, campaign attribution, audit | ✅ Done | Reports + probe logging; bots excluded from totals. |
| 10 · IPX pipeline handler | ❌ Deferred | Schema linkage only (`created_via='ipx_pipeline'`, `ipx_number`); handler likely lives in the IPX codebase, not here. |
| 11 · Persona lookup + ephemeral `/rp/` tokens | ✅ Done | Lookup + `/rp/` mint/resolve/expiry. |

**Offline verification suites — all green:** `redirector:check`, `:rules`, `:resume`, `:ephemeral`, `:reports`, `:landing`, `:landing-html`, `:failover`, `:health-check`, `qr:verify`. **DB-gated (not yet run against a live Postgres in the build env):** `:smoke`, `:snapshot`, `:health`. See §B7.

## B1. Stack & type mapping

- **API:** Node.js + Express, ESM. Mounted in `app/api/src/index.js`: `app.use('/api/redirector', redirectorLimiter, redirectorRouter)`; the opt-in scheduler is started from the same file.
- **Database:** PostgreSQL via `pg`. All objects live in a dedicated schema **`redirector.*`** (not `rdr_` table-prefix as Part A §8 wrote — the schema namespace replaces the prefix).
- **Web:** Next.js (App Router). Public routes under `app/web/app/r`, `/rp`, `/qr`, console under `/admin/redirector`.

Part A's data model uses SQL-Server types. The as-built Postgres equivalents:

| Part A (SQL Server) | As-built (Postgres) |
|---|---|
| `GUID` | `uuid` |
| `nvarchar(n)` / `nvarchar(max)` | `text` / `jsonb` (for `*_json`) |
| `bit` | `boolean` |
| `datetime2` | `timestamptz` |
| `char(n)` | `char(n)` / `varchar(n)` |
| `bigint identity` | `bigint GENERATED … AS IDENTITY` |
| table prefix `rdr_` | schema `redirector.` (e.g. `redirector.tokens`) |

## B2. File map (as built)

**API — core engine (`app/api/src/redirector/`)**
| File | Purpose |
|---|---|
| `resolver.js` | token/alias → outcome (redirect / landing / retired / suspended / notfound); 60s cache for active asset-mode; fire-and-forget scan + probe logging (daily-salted IP hash); DB-failure → snapshot fallback. |
| `tokens.js` | token + alias generation/validation; CSPRNG; EN+RO profanity/reserved blocklist; namespace uniqueness. |
| `keys.js` | automation API keys (`rdk_<consumer>_<hex>`): mint / verify / revoke; sha256-hashed at rest; per-consumer. |
| `idempotency.js` | `idempotent(endpoint)` middleware; replay cache keyed by consumer + `Idempotency-Key`, 24h; 409 on body mismatch. |
| `audit.js` | `writeAudit()` append-only mutation log (fire-and-forget). |
| `deviceRoutes.js` | UA → device class + `applyDeviceRoutes()` (§6.4); shared by live + snapshot resolvers. |
| `resume.js` | resume progress: pure `mergeEffective`/`nextUnconsumed`/`resolveResume`/`advanceResume` + DB wrappers; cookie vs account → further-forward. |
| `ephemeral.js` | persona `/rp/` tokens: mint (30-day expiry), resolve, expiry → permanent-token fallback. |
| `landing.js` | landing payload shaper (hero / primary / context path / related siblings / persona / resume); computes app deep-link. |
| `reports.js` | read-only analytics aggregates; bots excluded; 90-day default range. |
| `profiles.js` | loads/caches `taxonomy.profile.json`. |
| `qr/index.js` | QR orchestration; bounded LRU render cache; `renderOnCreate()` warms standard SVG + 1024 PNG; writes `qr_images` rows. |
| `qr/render.js` | SVG (primary) + PNG rendering; VARIANTS→ECC/logo/style map; quiet zone 4; overlay cap 25%. |
| `qr/style.js` | brand style loader + WCAG contrast enforcement (`assertScannable`, min 4:1). |
| `qr/payload.js` | payload builder `HTTPS://<HOST>/<R\|RP>/<token>` (host uppercased, token verbatim). |
| `qr/verify.js` | rasterize + jsQR decode of every variant/style at min print size. |
| `rules/engine.js` | 8 DQR strategies + `validateRuleParams` + `zonedParts` (IANA tz); pure/deterministic. |
| `rules/cache.js` | 5-min TTL cache; `evaluateRuleForToken()` → `{evaluatedId, fallbackId}`. |
| `failover/snapshot.js` | nightly flat-file snapshot (tokens/aliases/manifest); atomic write; read-only resolve. |
| `failover/scanBuffer.js` | NDJSON scan-event buffer during DB outage + `replayScanBuffer()`. |
| `health/watcher.js` | HEAD reachability + weekly checksum; per-host throttle; observe-only. |
| `profiles/qr.style.json` | **site-specific** brand QR styles (§B11). |
| `profiles/taxonomy.profile.json` | **site-specific** product tree (§B11). |

**API — routing / middleware / service**
| File | Purpose |
|---|---|
| `app/api/src/routes/redirector.js` | all API routes (§B5). |
| `app/api/src/middleware/redirectorAuth.js` | `requireRedirectorAuth(minRole)` — accepts `X-Redirector-Key` **or** SSO role; `roleFor()` maps redirector roles → this app's RBAC; `redirectorRateKey()`. |
| `app/api/src/services/redirectorScheduler.js` | opt-in in-process jobs: nightly snapshot + rolling health cycle + scan-buffer replay. |

**Web (`app/web/`)**
| File | Purpose |
|---|---|
| `app/r/[token]/route.ts` | public front door `GET /r/<token>` → 302 or branded landing/state page. |
| `app/r/[token]/go/route.ts` | tracked action redirect `GET /r/<token>/go?a=<action>`; advances resume cookie; works no-JS. |
| `app/rp/[token]/route.ts` + `…/go/route.ts` | ephemeral persona front door + tracked action. |
| `app/qr/[file]/route.ts` | QR image proxy → API, immutable cache. |
| `app/admin/redirector/page.tsx` | SSO-gated console (browse / audit / health / reports). |
| `components/RedirectorCatalog.tsx` | console catalog tree (**site-specific** Music/Articles/Books). |
| `lib/redirector.ts` | typed browser client for the console API. |
| `lib/landing.ts` | server-rendered landing HTML template (**site-themed**) + app-vs-web deep-link gate. |
| `lib/resumeCookie.ts` | `rdr_resume` HttpOnly cookie (forward-only merge, 2y). |
| `lib/appLinks.ts` | **site-specific** iOS/Android deep-link config (bundle, store URLs, team id, fingerprints, scheme). |
| `app/robots.ts` | disallows `/r/`, `/rp/`, `/admin`, `/api`. |
| `app/well-known/aasa/route.ts` + `assetlinks/route.ts` | Apple App Site Association + Android assetlinks (from `appLinks.ts`). |
| `next.config.mjs` | rewrites: `/.well-known/*`, `/R/*`→`/r/*`, `/RP/*`→`/rp/*`, `/api/*` proxy. |

## B3. Database & migrations

Migration files in `app/db/migrations/`:

| File | Adds |
|---|---|
| `0021_redirector.sql` | `CREATE SCHEMA redirector` + core tables: `assets`, `taxonomy_nodes`, `rules`, `tokens`, `aliases`, `resume_state`, `ephemeral_tokens`, `qr_images`, `scan_events` (columns per Part A §8, Postgres types per §B1). |
| `0030_redirector_automation.sql` | `api_keys`, `idempotency`, `audit_log`; ALTER `assets` +`checksum_checked_at`; ALTER `aliases` + approval workflow (`approval_status` pending/approved/rejected, `requested_by`, `requested_at`, `reject_reason`). |
| `0031_redirector_probes.sql` | `probe_events` (unknown-token enumeration signal; hashed IP only). |

**⚠ Migration-numbering collision:** there are **two** `0021_*` files — `0021_mobile_app_settings.sql` and `0021_redirector.sql`. The runner sorts by full filename, so both apply (each tracked separately). A new site cloning only the redirector migrations avoids this; if you copy the whole tree, keep both.

**How migrations apply — read this, it is the #1 install gotcha:**
- `app/docker-compose.yml` mounts **only `0001`–`0009`** (+ 3 seed files) into the Postgres init dir. **The redirector migrations (0021 / 0030 / 0031) are NOT auto-applied by docker-compose.**
- The real runner is **`app/db/run-migrations.js`**, invoked by `npm run db:migrate` (from `app/`). It applies every `*.sql` in `migrations/` in sorted order, tracks applied files in `public._migrations`, is idempotent/re-runnable, and requires `DATABASE_URL`.
- **Install step:** after standing up Postgres, run `cd app && npm run db:migrate` to apply 0021/0030/0031 (and everything ≥ 0010).

## B4. Configuration & environment variables

**`config.js` `redirector` block** (`app/api/src/config.js`):

| Key | Env var | Default | Controls |
|---|---|---|---|
| `internalKey` | `REDIRECTOR_INTERNAL_KEY` | `dev-redirector-internal-key` | shared key gating the internal `/resolve` endpoint (web → API). |
| `baseUrl` | `REDIRECTOR_BASE_URL` → `WEB_BASE_URL` | `http://localhost:3000` | public base for `/r/`, `/qr/` URLs and the QR payload host. |
| `snapshotDir` | `REDIRECTOR_SNAPSHOT_DIR` | `<api>/data/redirector/snapshot` | failover snapshot dir. |
| `scanBufferPath` | `REDIRECTOR_SCAN_BUFFER` | `<api>/data/redirector/scan-buffer.ndjson` | failover scan buffer. |
| `health.concurrency` | `REDIRECTOR_HEALTH_CONCURRENCY` | `4` | health watcher parallelism. |
| `health.perHostRps` | `REDIRECTOR_HEALTH_HOST_RPS` | `10` | per-host throttle. |
| `health.timeoutMs` | `REDIRECTOR_HEALTH_TIMEOUT_MS` | `10000` | HEAD timeout. |
| `health.checksumMaxBytes` | `REDIRECTOR_HEALTH_CHECKSUM_MAX` | `104857600` (100MB) | skip checksum above this. |
| `health.batchSize` | `REDIRECTOR_HEALTH_BATCH` | `200` | assets per cycle. |
| `scheduler` | `REDIRECTOR_SCHEDULER` | off (`'on'` to enable) | opt-in in-process snapshot+health jobs. |

**Web env vars:** `REDIRECTOR_API_BASE` (→ `NEXT_PUBLIC_API_BASE` → `http://localhost:4000`), `REDIRECTOR_INTERNAL_KEY` (forwarded as `x-redirector-internal`), `NEXT_PUBLIC_SITE_URL` (robots). **App-link vars** (feed landing gate + association files): `IOS_BUNDLE_ID`, `IOS_APP_STORE_URL`, `APPLE_TEAM_ID`, `ANDROID_PACKAGE`, `ANDROID_PLAY_STORE_URL`, `ANDROID_SHA256_FINGERPRINTS`, `APP_SCHEME`. **`DATABASE_URL`** is required by the API, migrations, and scripts.

> **⚠ `app/.env.example` contains NONE of the `REDIRECTOR_*` or app-link vars** — everything currently relies on in-code defaults. A new-site installer must add these to their environment explicitly (the internal key and base URL at minimum).

## B5. API route surface (mounted at `/api/redirector`)

Auth: `requireRedirectorAuth('role')` accepts `X-Redirector-Key` **or** an SSO session of at least that role (`editor`/`manager`/`viewer`/`owner` → this app's RBAC ladder). `internal` = shared `x-redirector-internal` key. Automation limiter 300/min (skips `/qr/` and `/resolve/`).

| Method · Path | Auth | Purpose |
|---|---|---|
| `GET /qr/:file` | public | QR SVG/PNG image; 1-yr immutable cache; `?variant`,`?size`,`?rp`. |
| `GET /resolve/:input` | internal | resolve token/alias, log scan/probe (called by web `/r/`). |
| `GET /resolve/rp/:token` | internal | resolve ephemeral token (called by web `/rp/`). |
| `GET /codes/:code` | public | album+song token map for one album code (public album QR). |
| `POST /assets` · `PATCH /assets/:id` | editor | register / update asset (never `content_kind`). |
| `POST /tokens` · `/tokens/bulk` · `/tokens/campaign-set` | editor | issue token(s); bulk ≤500 in one tx; N placement tokens for one asset. |
| `POST /tokens/:token/retire` | manager | retire or supersede (kind-immutability enforced). |
| `GET /tokens/:token` · `/tokens/:token/scans` | viewer | record; 90-day daily scan series. |
| `POST /taxonomy/nodes` · `GET /taxonomy/nodes` · `GET /taxonomy/nodes/:id/items` | manager / viewer | create-update node; list; node items. |
| `POST /rules` · `/rules/preview` · `/rules/:id/preview` · `GET /rules/:id` | manager / viewer | create (validated); preview unsaved/saved; read. |
| `POST /aliases` · `/aliases/:alias/approve` · `/aliases/:alias/reject` | editor / manager | request (pending, ≤5/token); approve; reject. |
| `GET /lookup` | viewer | persona/keyword asset search (assets with an active token only). |
| `POST /persona/token` | editor | mint ephemeral `/rp/` token. |
| `GET /health/assets` | manager | asset health. |
| `GET /profile` | viewer | taxonomy profile + QR style keys. |
| `GET /audit` | manager | audit trail. |
| `GET /reports/{overview,top-tokens,breakdown,token/:token,campaign/:asset_id,resume/:token}` | viewer | analytics. |
| `GET /reports/probes` | manager | enumeration signal. |
| `GET /asset-tokens` | viewer | asset-slug → token map. |

All `POST` accept an `Idempotency-Key` header (§14.2). Idempotent endpoints are marked in code via the `idempotent()` middleware.

## B6. Public web surface

`/r/:token` (302 or branded landing/retired/suspended/notfound) · `/r/:token/go?a=<action>` (tracked, no-JS) · `/rp/:token` + `/rp/:token/go` · `/qr/:file` · `/admin/redirector` · `/.well-known/apple-app-site-association` · `/.well-known/assetlinks.json`.

- 302 headers: `Cache-Control: no-store…`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`. Real destination is **never** placed in landing HTML.
- Every landing/error page emits `<meta name="robots" content="noindex, nofollow">` + `X-Robots-Tag`; QR images `X-Robots-Tag: noindex`; `app/robots.ts` disallows `/r/`, `/rp/`, `/admin`, `/api`.
- `next.config.mjs` maps uppercase `/R/*`→`/r/*`, `/RP/*`→`/rp/*` (QR payload uses uppercase host + path prefix; token case preserved — see §B9).

## B7. Verification suite (`app/api`, `npm run …`)

**Offline (no DB) — run these to prove a fresh install compiles and behaves:** `qr:verify`, `redirector:check`, `redirector:rules`, `redirector:landing`, `redirector:resume`, `redirector:ephemeral`, `redirector:reports`, `redirector:landing-html`, `redirector:failover`, `redirector:health-check`.
**Live DB required:** `redirector:smoke` (full automation e2e — needs 0021+0030 applied; skips cleanly if DB down), `redirector:snapshot`, `redirector:health`.
**Run directly (not npm-scripted, live DB):** `node scripts/redirector-mint-key.mjs` (mint an automation key), `node scripts/redirector-ingest-music.mjs` (**site-specific** — see §B11).

## B8. External dependencies (`app/api/package.json`)

`qrcode` (PNG + matrix) · `jsqr` (scan-verify decode) · `pg` (DB) · `zod` (validation) · `express` + `express-rate-limit`. Node built-in `crypto` for CSPRNG + hashing. **No new web packages** — the landing page and QR proxy are hand-rolled (no client framework in the landing HTML).

## B9. Known deviations from Part A (as-built — read before porting)

1. **Token casing (§3.2).** Shipped tokens are **mixed-case, case-sensitive Base58**, not the uppercase-only 30-char alphabet. Only the QR payload *host* is uppercased; the token is verbatim; `next.config.mjs` maps the uppercase `/R/`,`/RP/` path prefixes. Aliases are uppercase + case-insensitive as specified. *(To restore spec behavior, edit `tokens.js` and `qr/payload.js` together.)*
2. **🔴 Signed destination URLs (§9.3) — NOT implemented.** `resolver.js` currently redirects to the raw `storage_url`. This is the deepest layer of the security model in Part A and it is a real gap: a captured resolved URL does not expire. Track as a follow-up before public print runs where hotlink/scrape risk matters.
3. **Device UA parse (§6.4).** A lightweight in-house parse, not a maintained UA library. Fine for iOS/Android/desktop/bot buckets; swap in a real library for edge cases.
4. **QR durability.** Renders are cached in-memory only; `qr_images.file_url` is reserved for a future object-storage copy. PNG rounded-modules / center-mark are **SVG-only** (PNG is standard modules). Use SVG for print.
5. **SSO cross-device resume (§6.6 / acceptance #6).** The engine + DB support account-scoped position, but the public `/r/` route passes `accountId: null` (no server-visible SSO session). Only the anonymous **cookie** position flows today.
6. **Admin console (Phase 4).** Browse / audit / health / reports are live; **real token minting, downloadable-QR UI, and the form-driven rule/device/landing editors are deferred**. The catalog currently renders a deterministic *preview-placeholder* QR labelled "not minted."
7. **IPX pipeline (Phase 10).** Schema-only (`created_via='ipx_pipeline'`, `ipx_number`). No handler in this repo — it belongs to the IPX pipeline codebase.
8. **App auto-open.** The landing deep-link gate is interim best-effort. Flawless silent open needs valid association files: **`APPLE_TEAM_ID` must be set** or the AASA route serves `TEAMID_PENDING` and won't verify.
9. **Music ingest `--songs`.** The ingest script's song pass exists but is off ("later phase").

## B10. Install on a new website (runbook)

Assumes the target site runs the same reference stack (Express ESM API + Postgres + Next.js). For a different stack, treat Part A as the spec and this as the reference behavior to reproduce.

1. **Copy the engine.** Bring over `app/api/src/redirector/**`, `routes/redirector.js`, `middleware/redirectorAuth.js`, `services/redirectorScheduler.js`, the migrations `0021/0030/0031`, and the web files in §B2. Add deps from §B8.
2. **Wire the API.** Mount `app.use('/api/redirector', redirectorLimiter, redirectorRouter)` and start the scheduler (guarded by `REDIRECTOR_SCHEDULER`).
3. **Set env (§B4).** At minimum `DATABASE_URL`, `REDIRECTOR_BASE_URL` (the site's public origin), `REDIRECTOR_INTERNAL_KEY` (a strong shared secret), `REDIRECTOR_API_BASE` on the web side, and — if using app deep-links — the `APP_*`/`IOS_*`/`ANDROID_*` vars. Add them to the site's `.env` (they are not in `.env.example`).
4. **Apply migrations.** `cd app && npm run db:migrate` (docker-compose will NOT do this for you — §B3).
5. **Write the two profiles (§B11).** `taxonomy.profile.json` (the site's product tree) and `qr.style.json` (brand colors + monogram). These are the "no new code" customization surface.
6. **Rebrand the themed files (§B11).** Landing template, the two `/r` & `/rp` route branded pages, `appLinks.ts`, and the well-known routes.
7. **Adjust locale + RBAC.** Token blocklist locale terms in `tokens.js`; `roleFor()` mapping in `redirectorAuth.js` to the site's role names; default timezone if not `America/Los_Angeles`.
8. **Verify.** Run the offline suite (§B7) — all should pass. With Postgres up, run `redirector:smoke`, `redirector:snapshot`, `redirector:health`.
9. **Seed content.** Either call the Automation API (`/assets` → `/tokens/bulk` → …) from the site's own publish pipeline, or write a site-specific ingest (the JubiLujah `redirector-ingest-music.mjs` is a model, not reusable as-is).
10. **Ops.** `robots.txt` disallow `/r/` `/rp/`; enable `REDIRECTOR_SCHEDULER=on`; mint API keys (`redirector-mint-key.mjs`); assign SSO roles; and close the §B9 gaps that matter for your launch (signed URLs first if print/scrape risk is high).

## B11. Portability checklist — exact files/keys to change per site

**Swap, don't recode (design intent):**
- `app/api/src/redirector/profiles/taxonomy.profile.json` — `domain`, `display_name`, and the `levels` tree (JubiLujah ships persona → album → track("Song") → article).
- `app/api/src/redirector/profiles/qr.style.json` — `domain`, brand colors (JubiLujah: `#1A1A2E`, `#0F3460`, gold `#E6AC00`), `center_mark_monogram` ("J"), `min_print_cm`.

**Domain / base URL:**
- `REDIRECTOR_BASE_URL` / `WEB_BASE_URL` env. Hardcoded fallbacks to change if env is unset: `qr/payload.js` (`https://jubilujah.com`) and `redirector-ingest-music.mjs` (`https://www.jubilujah.com`).

**Rebrand (contain hardcoded JubiLujah strings):**
- `app/web/lib/landing.ts` — brand mark, gold theme, "Get the JubiLujah app" copy, `♪` placeholder.
- `app/web/app/r/[token]/route.ts` & `app/web/app/rp/[token]/route.ts` — inline branded page HTML ("JubiLujah.com", gold, "Explore the music").
- `app/web/lib/appLinks.ts` — `com.jubilujah.app`, store URLs, Apple Team ID, Android SHA-256 fingerprint, scheme `jubilujah`.
- `app/web/app/well-known/aasa/route.ts` + `assetlinks/route.ts` — derive from `appLinks.ts`.

**Locale / RBAC / defaults:**
- `app/api/src/redirector/tokens.js` — Romanian profanity terms (adjust per market).
- `app/api/src/middleware/redirectorAuth.js` `roleFor()` — maps to this app's RBAC (`content_editor`/`executive`/`admin`); remap to the new app's roles.
- Default timezone `America/Los_Angeles` in `0021_redirector.sql` and `rules/engine.js`.

**Replace or omit (JubiLujah-only, not generic):**
- `app/api/scripts/redirector-ingest-music.mjs` — reads `web/public/music/catalog-manifest.json`, the 12 Inspire persona slugs, album/song URL shapes. A per-site ingest must be written fresh.
- `app/web/components/RedirectorCatalog.tsx` — Music/Articles/Books tree tied to `@/lib/personas` and the music/articles JSON. Rebuild for the new site's catalog.

*End of Part B.*
