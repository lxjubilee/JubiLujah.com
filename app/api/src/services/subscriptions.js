import { query, withTransaction } from '../db.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { notify, nameParts } from './notifications.js';

// ============================================================================
// Subscription domain service. Pure business logic shared by the routes and the
// gateway webhook: plan lookup, effective-entitlement resolution, activation /
// lifecycle transitions (with audit + notifications), and the Free-plan daily
// listening counter. Routes stay thin; billing rules live here.
// ============================================================================

// Statuses that still grant playback entitlement.
const ENTITLED_STATUSES = ['trialing', 'active', 'past_due'];

// ---- Plan lookups ----------------------------------------------------------
export async function listPlans({ includeInactive = false } = {}) {
  const r = await query(
    `SELECT * FROM production.subscription_plans
      ${includeInactive ? '' : 'WHERE is_active = TRUE'}
      ORDER BY sort_order, price_cents`,
  );
  return r.rows.map(planView);
}

export async function getPlanByCode(code) {
  const r = await query('SELECT * FROM production.subscription_plans WHERE code = $1', [code]);
  return r.rows[0] || null;
}
export async function getPlanById(id) {
  const r = await query('SELECT * FROM production.subscription_plans WHERE id = $1', [id]);
  return r.rows[0] || null;
}

// Public-facing shape of a plan row.
export function planView(p) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    tagline: p.tagline,
    description: p.description,
    price_cents: p.price_cents,
    price_display: p.price_cents === 0 ? 'Free' : `$${(p.price_cents / 100).toFixed(2)}`,
    currency: p.currency,
    billing_interval: p.billing_interval,
    max_members: p.max_members,
    daily_song_limit: p.daily_song_limit,         // null = unlimited
    preview_seconds: p.preview_seconds,
    is_paid: p.is_paid,
    highlighted: p.highlighted,
    cta_label: p.cta_label,
    features: Array.isArray(p.features) ? p.features : [],
  };
}

// ---- Effective entitlement -------------------------------------------------
// Resolves what a user is allowed to do RIGHT NOW. Returns:
//   { isPaid, status, source: 'individual'|'family'|'free', plan, subscription,
//     dailySongLimit, previewSeconds }
export async function getEntitlement(userId) {
  // 1) Own subscription?
  const own = await getActiveSubscription(userId);
  if (own && ENTITLED_STATUSES.includes(own.status) && notExpired(own)) {
    const plan = await getPlanById(own.plan_id);
    return entitlement(true, own.status, own.plan_code === 'family' ? 'family' : 'individual', plan, own);
  }

  // 2) Active member of someone's family group?
  const fam = await query(
    `SELECT s.*, p.code AS plan_code, p.daily_song_limit, p.preview_seconds
       FROM production.family_members fm
       JOIN production.family_groups fg ON fg.id = fm.family_group_id
       JOIN production.subscriptions s  ON s.id = fg.subscription_id
       JOIN production.subscription_plans p ON p.id = s.plan_id
      WHERE fm.user_id = $1 AND fm.status = 'active'
        AND s.status = ANY($2)
      ORDER BY s.current_period_end DESC NULLS LAST
      LIMIT 1`,
    [userId, ENTITLED_STATUSES],
  );
  if (fam.rowCount && notExpired(fam.rows[0])) {
    const plan = await getPlanById(fam.rows[0].plan_id);
    return entitlement(true, fam.rows[0].status, 'family', plan, fam.rows[0]);
  }

  // 3) Free.
  const freePlan = await getPlanByCode('free');
  return entitlement(false, 'free', 'free', freePlan, null);
}

function entitlement(isPaid, status, source, plan, subscription) {
  return {
    isPaid,
    status,
    source,
    plan: plan ? planView(plan) : null,
    subscription: subscription ? subscriptionView(subscription) : null,
    dailySongLimit: isPaid ? null : (plan?.daily_song_limit ?? 36),
    previewSeconds: plan?.preview_seconds ?? 60,
  };
}

function notExpired(sub) {
  return !sub.current_period_end || new Date(sub.current_period_end).getTime() > Date.now();
}

// The user's most recent live (non-terminal) subscription, with plan code joined.
export async function getActiveSubscription(userId) {
  const r = await query(
    `SELECT s.*, p.code AS plan_code, p.name AS plan_name, p.price_cents, p.daily_song_limit, p.preview_seconds
       FROM production.subscriptions s
       JOIN production.subscription_plans p ON p.id = s.plan_id
      WHERE s.user_id = $1
        AND s.status = ANY($2)
      ORDER BY s.created_at DESC
      LIMIT 1`,
    [userId, ['trialing', 'active', 'past_due', 'payment_failed', 'suspended']],
  );
  return r.rows[0] || null;
}

// Has this exact gateway subscription already been activated for the user? Used
// to make checkout confirmation + webhook activation mutually idempotent.
export async function findActivatedByProviderSub(userId, providerSubscriptionId) {
  if (!providerSubscriptionId) return null;
  const r = await query(
    `SELECT s.*, p.code AS plan_code, p.name AS plan_name, p.price_cents
       FROM production.subscriptions s JOIN production.subscription_plans p ON p.id = s.plan_id
      WHERE s.user_id = $1 AND s.provider_subscription_id = $2
        AND s.status = ANY($3) LIMIT 1`,
    [userId, providerSubscriptionId, ['trialing', 'active', 'past_due']],
  );
  return r.rows[0] || null;
}

export function subscriptionView(s) {
  return {
    id: s.id,
    status: s.status,
    plan_code: s.plan_code,
    plan_name: s.plan_name,
    provider: s.provider,
    current_period_start: s.current_period_start,
    current_period_end: s.current_period_end,
    cancel_at_period_end: s.cancel_at_period_end,
    cancelled_at: s.cancelled_at,
    trial_end: s.trial_end,
    started_at: s.started_at,
    next_billing_amount: s.price_cents != null ? `$${(s.price_cents / 100).toFixed(2)}` : null,
    // A customer-facing reference for the subscription (the gateway id).
    reference: s.provider_subscription_id || s.id,
  };
}

// ---- Activation / upsert (used by mock checkout + Stripe webhook) ----------
// Idempotent-ish: if the user already has a live subscription it is updated in
// place (covers plan changes + webhook replays); otherwise a new row is created.
export async function activateSubscription({
  userId, plan, provider, providerCustomerId = null, providerSubscriptionId = null,
  periodStart = new Date(), periodEnd = monthFrom(new Date()), status = 'active',
  actor = 'system', amountCents = null, currency = config.payments.currency,
  invoiceId = null, invoiceUrl = null, invoicePdfUrl = null, paymentIntentId = null, user = null,
}) {
  const result = await withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT * FROM production.subscriptions
        WHERE user_id = $1 AND status = ANY($2)
        ORDER BY created_at DESC LIMIT 1`,
      [userId, ['trialing', 'active', 'past_due', 'payment_failed', 'suspended']],
    );

    let sub; let fromStatus = null; let fromPlanCode = null;
    if (existing.rowCount) {
      const prev = existing.rows[0];
      fromStatus = prev.status;
      const prevPlan = await client.query('SELECT code FROM production.subscription_plans WHERE id=$1', [prev.plan_id]);
      fromPlanCode = prevPlan.rows[0]?.code || null;
      const upd = await client.query(
        `UPDATE production.subscriptions
            SET plan_id=$2, status=$3, provider=$4,
                provider_customer_id=COALESCE($5, provider_customer_id),
                provider_subscription_id=COALESCE($6, provider_subscription_id),
                current_period_start=$7, current_period_end=$8,
                cancel_at_period_end=FALSE, cancelled_at=NULL
          WHERE id=$1 RETURNING *`,
        [prev.id, plan.id, status, provider, providerCustomerId, providerSubscriptionId, periodStart, periodEnd],
      );
      sub = upd.rows[0];
    } else {
      const ins = await client.query(
        `INSERT INTO production.subscriptions
           (user_id, plan_id, status, provider, provider_customer_id, provider_subscription_id,
            current_period_start, current_period_end)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [userId, plan.id, status, provider, providerCustomerId, providerSubscriptionId, periodStart, periodEnd],
      );
      sub = ins.rows[0];
    }

    // Family plan: ensure a group exists with the owner as a member.
    if (plan.code === 'family') {
      const grp = await client.query(
        `INSERT INTO production.family_groups (subscription_id, owner_user_id, max_members)
         VALUES ($1,$2,$3)
         ON CONFLICT (subscription_id) DO UPDATE SET max_members=EXCLUDED.max_members
         RETURNING id`,
        [sub.id, userId, plan.max_members],
      );
      await client.query(
        `INSERT INTO production.family_members (family_group_id, user_id, is_owner, status)
         VALUES ($1,$2,TRUE,'active')
         ON CONFLICT (family_group_id, user_id) DO UPDATE SET status='active', removed_at=NULL`,
        [grp.rows[0].id, userId],
      );
    }

    // Payment + renewal records (when this activation carried a charge).
    // Idempotent on the gateway invoice id: if this invoice was already recorded
    // (e.g. the webhook beat the success-page confirm, or vice-versa), skip the
    // duplicate payment/renewal rows.
    let paymentId = null;
    const dupInvoice = amountCents != null && invoiceId
      ? await client.query('SELECT 1 FROM production.payment_records WHERE provider_invoice_id = $1 LIMIT 1', [invoiceId])
      : { rowCount: 0 };
    if (amountCents != null && !dupInvoice.rowCount) {
      const pay = await client.query(
        `INSERT INTO production.payment_records
           (subscription_id, user_id, provider, provider_invoice_id, provider_payment_intent,
            amount_cents, currency, status, description, invoice_url, invoice_pdf_url, paid_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'succeeded',$8,$9,$10,NOW()) RETURNING id`,
        [sub.id, userId, provider, invoiceId, paymentIntentId, amountCents, currency,
         `${plan.name} plan — ${plan.billing_interval}ly`, invoiceUrl, invoicePdfUrl],
      );
      paymentId = pay.rows[0].id;
      await client.query(
        `INSERT INTO production.subscription_renewals
           (subscription_id, period_start, period_end, amount_cents, currency, status, payment_record_id)
         VALUES ($1,$2,$3,$4,$5,'succeeded',$6)`,
        [sub.id, periodStart, periodEnd, amountCents, currency, paymentId],
      );
    }

    // Ledger + audit.
    await client.query(
      `INSERT INTO production.subscription_transactions
         (subscription_id, user_id, type, provider, provider_ref, amount_cents, currency, status, metadata)
       VALUES ($1,$2,'activation',$3,$4,$5,$6,'succeeded',$7)`,
      [sub.id, userId, provider, providerSubscriptionId || invoiceId, amountCents, currency,
       JSON.stringify({ plan: plan.code })],
    );
    await client.query(
      `INSERT INTO production.subscription_history
         (subscription_id, user_id, event, from_status, to_status, from_plan, to_plan, actor, actor_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [sub.id, userId, fromStatus ? 'plan_changed' : 'activated', fromStatus, status, fromPlanCode, plan.code, actor, actor === 'user' ? userId : null],
    );

    return { sub, isNew: !existing.rowCount, fromPlanCode };
  });

  // Confirmation notification + email (best-effort, outside the tx).
  // Personalize with the subscriber's name (first name for the greeting). The
  // email always goes to the subscriber's own account email (user.email).
  const { fullName, firstName } = nameParts(user);
  await notify({
    userId,
    type: result.fromPlanCode && result.fromPlanCode !== plan.code ? 'plan_changed' : 'subscription_activated',
    title: result.fromPlanCode && result.fromPlanCode !== plan.code ? `You're now on the ${plan.name} plan` : `Welcome to Jubilujah ${plan.name}`,
    body: 'Your subscription is active. Enjoy unlimited Christian music.',
    metadata: { plan: plan.code, subscription_id: result.sub.id },
    email: user?.email ? {
      to: user.email,
      subject: `Your Jubilujah ${plan.name} subscription is active`,
      heading: firstName ? `You're all set, ${firstName} — ${plan.name} plan active` : `You're all set — ${plan.name} plan active`,
      intro: `${fullName ? `Hi ${fullName}, thank you` : 'Thank you'} for subscribing to Jubilujah.com. Your subscription is active and you now have unlimited access to inspiring Christian music.`,
      rows: [
        { label: 'Plan', value: plan.name },
        { label: 'Price', value: plan.price_cents === 0 ? 'Free' : `$${(plan.price_cents / 100).toFixed(2)} / ${plan.billing_interval}` },
        { label: 'Renews', value: new Date(result.sub.current_period_end).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) },
      ],
      ctaLabel: 'Manage subscription',
      ctaUrl: `${config.webBaseUrl}/account/subscription`,
      note: 'Your subscription renews automatically each period until cancelled. You can manage or cancel anytime from your account.',
    } : null,
  });

  logger.info({ userId, plan: plan.code, sub: result.sub.id, provider }, 'subscription activated');
  return result.sub;
}

// Record a lifecycle transition (cancel / reactivate / suspend / expire …).
export async function transition(client, { subscriptionId, userId, event, fromStatus, toStatus, actor = 'system', actorUserId = null, metadata = {} }) {
  await client.query(
    `INSERT INTO production.subscription_history
       (subscription_id, user_id, event, from_status, to_status, actor, actor_user_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [subscriptionId, userId, event, fromStatus, toStatus, actor, actorUserId, JSON.stringify(metadata)],
  );
}

export function monthFrom(d) {
  const n = new Date(d);
  n.setMonth(n.getMonth() + 1);
  return n;
}

// ---- Free-plan daily listening counter -------------------------------------
// Atomically resolves "can this user play THIS next song in full?" and advances
// the daily counter. Paid users always get full; free users get full for the
// first `dailySongLimit` songs/day, then a `previewSeconds` preview.
export async function resolvePlayIntent(userId) {
  const ent = await getEntitlement(userId);
  if (ent.isPaid) {
    return { mode: 'full', unlimited: true, plays_today: null, daily_limit: null, remaining: null, preview_seconds: ent.previewSeconds, status: ent.status };
  }

  const limit = ent.dailySongLimit ?? 36;
  const preview = ent.previewSeconds ?? 60;
  const tz = config.listening.timezone;

  return withTransaction(async (client) => {
    // Lock/insert today's row, read the current count.
    const cur = await client.query(
      `INSERT INTO production.daily_listening_counters (user_id, day)
         VALUES ($1, (NOW() AT TIME ZONE $2)::date)
       ON CONFLICT (user_id, day) DO UPDATE SET updated_at = NOW()
       RETURNING day, songs_played`,
      [userId, tz],
    );
    const day = cur.rows[0].day;
    const played = cur.rows[0].songs_played;

    if (played < limit) {
      const upd = await client.query(
        `UPDATE production.daily_listening_counters
            SET songs_played = songs_played + 1, updated_at = NOW()
          WHERE user_id = $1 AND day = $2 RETURNING songs_played`,
        [userId, day],
      );
      const n = upd.rows[0].songs_played;
      return { mode: 'full', unlimited: false, plays_today: n, daily_limit: limit, remaining: Math.max(0, limit - n), preview_seconds: preview, status: 'free' };
    }

    await client.query(
      `UPDATE production.daily_listening_counters
          SET limited_plays = limited_plays + 1, updated_at = NOW()
        WHERE user_id = $1 AND day = $2`,
      [userId, day],
    );
    return { mode: 'limited', unlimited: false, plays_today: played, daily_limit: limit, remaining: 0, preview_seconds: preview, status: 'free' };
  });
}

// Read-only view of today's usage (no increment).
export async function getListeningStatus(userId) {
  const ent = await getEntitlement(userId);
  if (ent.isPaid) {
    return { unlimited: true, plays_today: 0, daily_limit: null, remaining: null, preview_seconds: ent.previewSeconds };
  }
  const tz = config.listening.timezone;
  const r = await query(
    `SELECT songs_played FROM production.daily_listening_counters
      WHERE user_id = $1 AND day = (NOW() AT TIME ZONE $2)::date`,
    [userId, tz],
  );
  const played = r.rowCount ? r.rows[0].songs_played : 0;
  const limit = ent.dailySongLimit ?? 36;
  return { unlimited: false, plays_today: played, daily_limit: limit, remaining: Math.max(0, limit - played), preview_seconds: ent.previewSeconds };
}
