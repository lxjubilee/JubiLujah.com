# tenants/

One `.json` per site. The file is named for the tenant's primary host, and
`tenant`, `hosts[0]` and the filename must all be the same string.

| File | Site | Scope |
|---|---|---|
| `jubileepraise.com.json` | JubileePraise.com | the whole catalogue |
| `gopartygiggles.com.json` | goPartyGiggles.com | `party-giggles` |
| `mytinytiggles.com.json` | MyTinyTiggles.com | `tiny-tiggles` |
| `torahsings.com.json` | Torah Sings | *(none — its own catalogue)* |

**Torah Sings is the odd one.** The other three are scopes of one shared
manifest. It reads a different catalogue entirely — 285 ANSMX albums grouped by
book, generated from `J:/torahsings.com/music` — which is why `lib/tenants.ts`
carries a `catalog` field at all. Its `categories` is `[]`, not `null`: it may
see **none** of the shared catalogue. It is also **not live yet** — the code is
merged and builds, but DNS and nginx still point at the standalone app.

## 🔴 Which file governs what

**Two files describe these four sites, and only one of them is running.**

| | |
|---|---|
| **`app/web/lib/tenants.ts`** | what the **site serves**. Imported by the layout, the header and `lib/manifest`'s scope check. If a visitor can see it, this is the file that decided. |
| **`tenants/*.json`** | what the **tooling reads**, and the operational record: disk folders, CDN prefixes, the pm2 process, the nginx vhost, the TLS position. Consumed by the WPF studio's Website picker. |

The overlap between them is copied data, and copied data rots. That is what
`tools/check-tenants.mjs` is for:

```
node tools/check-tenants.mjs            structure + drift
node tools/check-tenants.mjs --drive    also verify the J: folders exist
```

It fails on the first mismatch of key, hosts, brand, tagline, description,
catalogue scope or nav — and on a stated SEO title that `layout.tsx` would never
actually emit, because a config file that documents a lie is worse than one that
says nothing. **Run it after editing either side.** Exit 1 means they disagree.

## Adding a tenant

1. Add it to `app/web/lib/tenants.ts` — that is what makes the site serve it.
2. Add `tenants/<host>.json` here, schema `jl.tenant/2`.
3. `node tools/check-tenants.mjs --drive` until it is green.
4. Point DNS at the box and add an nginx vhost proxying to `127.0.0.1:3030`.
   Nothing else: **one pm2 process serves every tenant**, so there is no new
   app, no new port, and no separate deploy.

The WPF studio picks the new file up on its next launch, with no code change.

## What these files do NOT hold

- **Secrets.** Env vars are named, never valued. There is no key, token or
  password in this folder and none may be added.
- **Counts.** No album or track totals. Those change weekly and a stale number in
  a config file gets believed. `catalog-manifest.json` is the count.
- **Per-tenant env.** There isn't any. One build serves all four, so
  `NEXT_PUBLIC_*` is process-wide — recorded in the JubileePraise file, marked
  `shared` in the others.

## 🔴 There are two copies of each children's catalogue on J:

Measured 2026-08-17. Both are real directories with identical album lists and
identical file timestamps — not junctions, because J: is a network share and a
link was impossible.

| | Master — what the tooling scans | Stale copy — scanned by nothing |
|---|---|---|
| Party Giggles | `J:/gopartygiggles.com/music/party-giggles` | `J:/jubileepraise.com/music/children/party-giggles` |
| Tiny Tiggles | `J:/mytinytiggles.com/music/tiny-tiggles` | `J:/jubileepraise.com/music/children/tiny-tiggles` |

The masters were re-filed to per-domain roots on 2026-08-16 and
`deploy/rebuild-manifest.mjs` and `deploy/check-manifest.mjs` were pointed at
them (`EXTRA_ROOTS`). **The originals were left in place.** Each file records both
paths — `catalogue.musicDrive` and `catalogue.staleCopy` — because editing the
wrong one fails silently: the manifest never sees the change and the site never
moves. Roughly 3.4 GB is duplicated; deleting the stale side is an owner call,
not a cleanup to do quietly.

## Two facts worth reading before you trust a path

- **A manifest category key is not a folder.** The manifest says `party-giggles`;
  the drive says `children/party-giggles`. Every file states both, so nothing has
  to guess.
- **MyTinyTiggles is served from a different path than it is stored under.** The
  manifest publishes it at `albums/tiny-tiggles/…`, so the CDN serves
  `music/tiny-tiggles/…`, while J: keeps it under `children/tiny-tiggles`. Both
  trees exist on R2. A sync that writes one leaves the other stale.
