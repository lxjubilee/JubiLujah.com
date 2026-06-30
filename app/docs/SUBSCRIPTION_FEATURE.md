# Subscription Management — Feature & Operations Guide

Premium music subscriptions for Jubilujah.com: a Free tier with a daily listening
limit, paid **Individual** and **Family** plans, a provider-agnostic billing layer
(Stripe in production), and the supporting account UI, enforcement, and audit.

This document covers architecture, data model, configuration, and deployment. The
HTTP contract is in [`api/docs/SUBSCRIPTION_API.md`](../api/docs/SUBSCRIPTION_API.md).

> Status: **Core vertical slice** shipped — schema (all tables), plan catalog,
> checkout → activate → manage flow, Free-plan 7-song/60-second enforcement, and
> billing history. Family-member management UI, the admin dashboard UI, the full
> notification center, and PDF invoices are scaffolded in the schema and planned
> as follow-ups (see *Roadmap*).

---

## 1. Plans

| Plan | Price | Daily limit | Members | Notes |
|------|-------|-------------|---------|-------|
| Free | $0 | 7 full songs/day, then 60-sec previews | 1 | No checkout; default state |
| Individual | $3.95 / mo | Unlimited | 1 | Recommended / highlighted card |
| Family | $7.95 / mo | Unlimited | 6 (1 owner + 5) | Each member has independent history/playlists |

Plans live in `production.subscription_plans` and are **seeded by migration
`0014_subscriptions.sql`**. Entitlement parameters (`daily_song_limit`,
`preview_seconds`, `max_members`) are read from the row — change the policy in
data, not code.

---

## 2. Architecture

```
Browser (Next.js)                       API (Express)                       Postgres
─────────────────                       ─────────────                       ────────
/subscription  ──── GET  /plans ───────► subscriptions.js ───────────────► subscription_plans
/account/subscription ─ GET /me ───────► services/subscriptions.js          subscriptions
  "Subscribe" ──────  POST /checkout ──► payments/* (provider) ─┐           family_*
                                          (Stripe-hosted page) ◄─┘           payment_records
  player (each track) POST /listening/intent ► resolvePlayIntent ──────────► daily_listening_counters
                                                                             subscription_history
Stripe ─── webhook ─► /api/subscriptions/webhook ► activate/renew/cancel ──► subscription_notifications
```

- **Billing is provider-agnostic.** `services/payments/index.js` selects an adapter
  by `PAYMENT_PROVIDER`. `stripe.js` is the production gateway; `mock.js` is an
  in-process gateway for local/dev/test that activates immediately (no hosted page
  or webhook). Adding PayPal/Razorpay = a new adapter file implementing the same
  interface — no route changes.
- **The gateway is the source of truth for money.** We mirror only opaque
  references (customer/subscription/invoice ids) plus amounts. **No card data is
  ever stored** (Stripe Checkout is SAQ-A).
- **Entitlement is computed server-side** in `services/subscriptions.js`
  (`getEntitlement`). A user is entitled if they own an active subscription *or*
  are an active member of a family group whose subscription is active.

### Key files
| Concern | File |
|---|---|
| Schema + seed | `db/migrations/0014_subscriptions.sql` |
| Domain logic (entitlement, activation, counters) | `api/src/services/subscriptions.js` |
| Payment provider factory + adapters | `api/src/services/payments/{index,stripe,mock}.js` |
| Notifications (in-app + email) | `api/src/services/notifications.js` |
| User routes | `api/src/routes/subscriptions.js` |
| Gateway webhook (raw-body, signed) | `api/src/routes/subscriptionsWebhook.js` |
| Free-plan enforcement endpoint | `api/src/routes/listening.js` |
| Plans page | `web/components/SubscriptionPlans.tsx` |
| My Subscription | `web/components/MySubscription.tsx` |
| Upgrade prompt + player cap | `web/components/UpgradeModal.tsx`, `web/stores/player.ts`, `web/components/FooterPlayer.tsx` |
| Client API | `web/lib/subscription.ts` |

---

## 3. Free-plan enforcement (7 songs / day → 60-sec previews)

The browser is **not trusted** to count. On every *new* track, the player calls
`POST /api/listening/intent`, which atomically advances the per-user, per-day
counter and returns whether this play is `full` or `limited`:

1. Paid users → always `full`.
2. Free users, songs **1–7** of the day → `full` (counter incremented).
3. Free users, song **8+** → `limited` with `preview_seconds` (default 60).

When `limited`, the player sets `capSeconds`; `FooterPlayer`'s `timeupdate` handler
pauses at the cap, locks resume past it, and opens the **Upgrade** modal. The
counter row is keyed by `(user_id, day)` where `day = (NOW() AT TIME ZONE
LISTENING_TZ)::date`, so it **resets at local midnight** automatically (no cron).

Concurrency: the increment runs inside a transaction whose `INSERT … ON CONFLICT
DO UPDATE` takes a row lock, so simultaneous plays for one user serialize.

---

## 4. Subscription lifecycle

```
              checkout
  (free) ───────────────► active ──renew──► active
                            │  ▲                │
                cancel(at   │  │ reactivate     │ payment_failed
                 period end)▼  │                ▼
                         cancel_at_period_end   past_due ──(retries fail)──► payment_failed
                            │                        │
                  period end│                        │ paid
                            ▼                        ▼
                        cancelled / expired       active
```

Every transition writes an append-only row to `production.subscription_history`
(`REVOKE UPDATE/DELETE`) and an in-app notification (+ email where relevant).

Statuses: `trialing`, `active`, `past_due`, `payment_failed`, `cancelled`,
`expired`, `suspended`. "Free" is the **absence** of an entitled row.

---

## 5. Configuration (env)

Set in the monorepo root `.env` (loaded by `api/src/config.js`):

```bash
# Provider selection — defaults to 'stripe' when STRIPE_SECRET_KEY is set, else 'mock'.
PAYMENT_PROVIDER=stripe
BILLING_CURRENCY=usd

# Stripe (test or live)
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx        # (reserved for future client SDK use)
STRIPE_WEBHOOK_SECRET=whsec_xxx
# Optional: override the DB price ids
STRIPE_PRICE_INDIVIDUAL=price_xxx
STRIPE_PRICE_FAMILY=price_xxx

# Redirect paths after hosted checkout (relative to WEB_BASE_URL)
CHECKOUT_SUCCESS_PATH=/account/subscription?checkout=success
CHECKOUT_CANCEL_PATH=/subscription?checkout=cancelled

# Free-plan daily reset timezone (IANA name)
LISTENING_TZ=America/Los_Angeles

WEB_BASE_URL=https://jubilujah.com
```

With **no Stripe key**, the provider falls back to `mock`: the full subscribe →
activate → manage → cancel flow works locally, so you can build and demo the UI
before wiring a real gateway.

---

## 6. Deployment

1. **Migrate the DB** (idempotent, tracked in `public._migrations`):
   ```bash
   node db/run-migrations.js          # applies 0014_subscriptions.sql + seeds the 3 plans
   ```
2. **Install the gateway SDK** (only needed when `PAYMENT_PROVIDER=stripe`):
   ```bash
   cd api && npm install               # picks up the new `stripe` dependency
   ```
3. **Create Stripe products/prices** and link them to the plan rows:
   ```bash
   STRIPE_SECRET_KEY=sk_test_... DATABASE_URL=postgres://... node scripts/stripe-setup.mjs
   ```
4. **Register the webhook** in the Stripe dashboard pointing at
   `https://api.jubilujah.com/api/subscriptions/webhook`, subscribed to:
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.updated`, `customer.subscription.deleted`. Put the signing
   secret in `STRIPE_WEBHOOK_SECRET`.
5. **Restart the API** and **rebuild the web app**. Verify `GET
   /api/subscriptions/plans` returns the three plans.

> Webhook body: the route is mounted with `express.raw` **before** the global JSON
> parser (see `api/src/index.js`) so the Stripe signature verifies against the
> exact bytes. Don't move it below `express.json`.

### Local dev
See memory `local-backend-stack-howto`: copy `api`/`db` to `C:\jubilujah-local`,
`npm install`, run migrations, `npm start` (API :4000). Web rewrites `/api/*` →
the API. With `PAYMENT_PROVIDER` unset and no Stripe key, checkout uses the mock
gateway and activates instantly.

---

## 7. Security

- All mutating subscription endpoints require a valid Bearer session (`requireAuth`).
- Playback entitlement is validated server-side on every play intent — a tampered
  client cannot grant itself unlimited plays.
- The webhook only acts on **signature-verified** events; an unsigned/forged POST
  is rejected with 400.
- No PAN/card data is stored; only opaque gateway references.
- `subscription_history` is append-only (`REVOKE UPDATE, DELETE`).
- Admin-only operations (refunds, manual activation) are gated by `requireRole('admin')`.

---

## 8. Roadmap (scaffolded, not yet in the slice)

The schema already includes everything below; these are UI/route follow-ups:

- **Family management UI + API** — invite by email, accept via `family_invitations`
  token, remove/replace members, slot counter. Tables: `family_groups`,
  `family_members`, `family_invitations`.
- **Admin subscription dashboard** — list/search/filter subscribers, manual
  activate/suspend/cancel, issue refunds, CSV/Excel/PDF export. (Analytics admin
  pattern at `web/app/admin/analytics` + CSV helper in `routes/analytics.js`.)
- **Notification center** — in-app feed UI over `subscription_notifications`
  (API already exposed at `/api/subscriptions/notifications`).
- **Downloadable invoices (PDF)** — currently links to the gateway's hosted
  invoice; a PDF generator can attach to `payment_records.invoice_url`.
- **Future plans** — annual billing, trials (`trialing` status + `trial_end`
  already modeled), coupons, gift subs, regional/multi-currency.
