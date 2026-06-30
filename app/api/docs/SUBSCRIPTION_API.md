# Subscription API

Base path: `/api/subscriptions` and `/api/listening`. All authenticated endpoints
use `Authorization: Bearer <access token>` (same scheme as the rest of the API).
Errors follow the standard shape `{ "error": "...", "message": "..." }`.

See [`docs/SUBSCRIPTION_FEATURE.md`](../../docs/SUBSCRIPTION_FEATURE.md) for design.

---

## Plans

### `GET /api/subscriptions/plans`  — public
Returns the active plan catalog.

```json
{
  "plans": [
    {
      "code": "individual", "name": "Individual", "tagline": "Unlimited, just for you",
      "price_cents": 395, "price_display": "$3.95", "currency": "usd",
      "billing_interval": "month", "max_members": 1, "daily_song_limit": null,
      "preview_seconds": 60, "is_paid": true, "highlighted": true,
      "cta_label": "Start Your Subscription", "features": ["Unlimited streaming …", "…"]
    }
  ]
}
```

---

## My subscription

### `GET /api/subscriptions/me`  — auth
```json
{
  "entitlement": {
    "isPaid": true, "status": "active", "source": "individual",
    "plan": { "code": "individual", "name": "Individual", "...": "..." },
    "subscription": { "id": "…", "status": "active", "plan_code": "individual",
      "current_period_end": "2026-07-24T00:00:00Z", "cancel_at_period_end": false },
    "dailySongLimit": null, "previewSeconds": 60
  },
  "subscription": { "id": "…", "status": "active", "plan_code": "individual",
    "current_period_end": "2026-07-24T…", "next_billing_amount": "$3.95", "...": "..." }
}
```
For a Free user: `isPaid:false`, `source:"free"`, `subscription:null`, `dailySongLimit:7`.

---

## Checkout

### `POST /api/subscriptions/checkout`  — auth
Body: `{ "plan_code": "individual" }`

Starts a checkout for a **paid** plan. Returns a gateway URL to redirect to.

```json
{ "url": "https://checkout.stripe.com/c/pay/cs_test_…", "activated": false, "provider": "stripe" }
```
- With the **mock** provider, `activated` is `true` and `url` is the success path
  (the subscription is already active).
- With **Stripe**, redirect the browser to `url`; activation completes via webhook
  when the customer pays.

Errors: `404` unknown plan · `400` free plan · `409` already on that plan ·
`503` payments not configured.

### `POST /api/subscriptions/confirm`  — auth
Body: `{ "session_id": "cs_test_…" }`

Called by the **success page** after the gateway redirect (`…?checkout=success&session_id=…`).
Retrieves the Checkout Session server-side, verifies it belongs to the caller and
is paid, then **activates immediately** — so activation works locally without a
webhook tunnel and as a production safety net. Idempotent with the webhook
(whichever lands first activates; the other is a no-op).

```json
{ "activated": true, "subscription": { "plan_code": "individual", "status": "active",
  "reference": "sub_…", "current_period_end": "…", "next_billing_amount": "$3.95" } }
```
`{ "activated": false, "pending": true }` if payment is still settling. `403` if the
session belongs to another account · `404` unknown session.

---

## Lifecycle

### `POST /api/subscriptions/cancel`  — auth
Body: `{ "immediate": false }` (default — cancel at period end). Returns the
updated subscription. `immediate:true` ends access now.

### `POST /api/subscriptions/reactivate`  — auth
Undoes a pending cancellation (`cancel_at_period_end`). Returns the subscription.

### `POST /api/subscriptions/change`  — auth
Body: `{ "plan_code": "family" }`. Upgrade/downgrade between paid plans; gateway
prorates. Crossing into/out of `family` creates/releases the family group. `409`
if already on the target plan.

---

## Billing & notifications

### `GET /api/subscriptions/billing`  — auth
```json
{
  "payments": [{ "id":"…","amount_cents":395,"amount_display":"$3.95","status":"succeeded",
                 "description":"Individual plan — monthly","invoice_url":null,"paid_at":"…" }],
  "renewals": [{ "id":"…","period_start":"…","period_end":"…","amount_cents":395,"status":"succeeded" }]
}
```

### `POST /api/subscriptions/portal`  — auth
Returns `{ "url": "…" }` for the gateway's hosted billing portal (Stripe). `404`
if the user has no billing account.

### `GET /api/subscriptions/notifications`  — auth
`{ "notifications": [{ "id":"…","type":"subscription_activated","title":"…","body":"…","read_at":null,"created_at":"…" }] }`

### `POST /api/subscriptions/notifications/read`  — auth
Marks all of the caller's notifications read. `{ "ok": true }`

---

## Free-plan listening enforcement

### `POST /api/listening/intent`  — auth
Called by the player when a **new** track starts. Atomically advances the daily
counter and returns the entitlement for this play.

Body (optional): `{ "song_id": "…" }`
```json
{ "mode": "full", "unlimited": false, "plays_today": 3, "daily_limit": 7,
  "remaining": 4, "preview_seconds": 60, "status": "free" }
```
After the daily limit: `{ "mode": "limited", "remaining": 0, "preview_seconds": 60, … }`.
Paid users always get `{ "mode": "full", "unlimited": true }`.

### `GET /api/listening/status`  — auth
Read-only daily usage (no increment):
`{ "unlimited": false, "plays_today": 3, "daily_limit": 7, "remaining": 4, "preview_seconds": 60 }`

---

## Webhook (gateway → server)

### `POST /api/billing/webhook`  — signed, no session
**Configure this URL as the Stripe webhook endpoint.** (`/api/subscriptions/webhook`
remains a back-compat alias for the same handler.)

Mounted with a raw-body parser before JSON parsing. Verifies the `Stripe-Signature`
header against `STRIPE_WEBHOOK_SECRET`. Handles `checkout.session.completed`,
`invoice.paid`/`invoice.payment_succeeded`, `invoice.payment_failed`,
`customer.subscription.updated`, `customer.subscription.deleted`. Returns
`{ "received": true }`; `400` on bad signature; `500` to request a retry.

On a paid invoice it: syncs the subscription's `current_period_end` (the user's
access for the new month), records the invoice in `payment_records`, writes a
`subscription_renewals` cycle + `subscription_transactions` ledger + history rows,
and emails/notifies the user. All inserts are deduped per invoice id (status
`succeeded`), so Stripe's duplicate `invoice.paid`/`invoice.payment_succeeded`
events and 5xx retries are safe.
