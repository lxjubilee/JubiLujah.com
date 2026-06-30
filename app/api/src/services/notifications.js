import { query } from '../db.js';
import { logger } from '../logger.js';
import { sendSubscriptionEmail } from './email.js';

// ============================================================================
// Subscription notifications: writes an in-app feed row and (optionally) sends
// the matching email. Both are best-effort — a notification failure must never
// roll back a billing state change, so callers fire-and-forget.
// ============================================================================

// Split a subscriber's display name for email greetings. Returns empty strings
// when the user has no name, so callers can fall back to an impersonal greeting.
export function nameParts(user) {
  const fullName = (user?.displayName || '').trim();
  return { fullName, firstName: fullName ? fullName.split(/\s+/)[0] : '' };
}

// type -> default copy (overridable per call).
const TEMPLATES = {
  subscription_activated:  { title: 'Your subscription is active', },
  payment_succeeded:       { title: 'Payment received' },
  payment_failed:          { title: 'Payment failed' },
  renewal_upcoming:        { title: 'Your subscription renews soon' },
  renewed:                 { title: 'Your subscription renewed' },
  expired:                 { title: 'Your subscription has expired' },
  cancelled:               { title: 'Your subscription was cancelled' },
  reactivated:             { title: 'Your subscription was reactivated' },
  plan_changed:            { title: 'Your plan was changed' },
  family_invite_sent:      { title: 'Family invitation sent' },
  family_invite_accepted:  { title: 'A family member joined' },
  family_member_removed:   { title: 'A family member was removed' },
};

// Insert an in-app notification. Returns the row id (or null on failure).
export async function notify({ userId, type, title, body = null, metadata = {}, email = null }) {
  const t = title || TEMPLATES[type]?.title || 'Subscription update';
  let id = null;
  try {
    const r = await query(
      `INSERT INTO production.subscription_notifications (user_id, type, title, body, metadata, email_sent)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, type, t, body, JSON.stringify(metadata || {}), !!email],
    );
    id = r.rows[0].id;
  } catch (err) {
    logger.warn({ err, userId, type }, 'subscription notification insert failed');
  }

  if (email?.to) {
    try {
      await sendSubscriptionEmail(email);
    } catch (err) {
      logger.warn({ err, userId, type }, 'subscription email failed');
    }
  }
  return id;
}
