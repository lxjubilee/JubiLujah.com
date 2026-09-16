// ============================================================================
// Cross-site sign-in — the JubileeInspire family session, spoken from here.
//
// One signed-in browser across the family: a reader signed in on JubileeInspire
// (or any of its persona domains) opens jubileepraise.com already signed in, and
// signing in HERE lets those sites recognise them in turn. Same design, same
// endpoints and same rules as JubileeInspire's api/routes/sso-link.js.
//
// The sites are separate ORIGINS and cannot read each other's cookies. The one
// place they can all consult is the SSO's own origin, reached by a top-level
// redirect so its cookie stays first-party. Two hops, both driven by the web
// app's middleware.ts and lib/familySso.ts:
//
//   CONTINUE  signed out here → the browser asks SSO /api/auth/continue, which
//             comes back with ?t=<ticket> (signed in to the family) or ?sso=none.
//   PLANT     signed in here, and the SSO has not met this browser → it visits
//             SSO /api/auth/plant?t=<ticket> once, which sets the family cookie.
//
//   POST /api/auth/sso/redeem-ticket { ticket, provision? } -> { tokens, user, created }
//   POST /api/auth/sso/plant-url     { return }  (Bearer)   -> { url | null }
//
// Mounted in index.js ABOVE the /api/auth limiter, with its own. redeem-ticket is
// called by the web server over loopback, so under the shared auth limiter every
// arrival on the site would count against one address and the 51st reader in a
// quarter hour would be refused.
// ============================================================================
import { Router } from 'express';
import { config } from '../config.js';
import { ah } from '../util/async.js';
import { HttpError, requireAuth } from '../middleware/rbac.js';
import { query } from '../db.js';
import { upsertUserFromSSO, issueAccessToken, createRefreshToken } from '../auth/session.js';
import {
  ssoEnabled, ssoRedeemTicket, ssoOpenSession, ssoIssueTicket,
} from '../services/ssoClient.js';
import { logger } from '../logger.js';

const router = Router();

const familySsoOn = () => config.loginMode === 'sso' && ssoEnabled();

async function audit(userId, action, payload) {
  try {
    // actor_user_id is uuid and target_id is text, so the same id goes in
    // twice: one $1 for both made Postgres refuse every write with "inconsistent
    // types deduced for parameter $1", and no ticket sign-in was ever audited.
    await query(
      `INSERT INTO identity.audit_log (actor_user_id, action, target_type, target_id, payload)
         VALUES ($1, $2, 'user', $3, $4)`,
      [userId, action, String(userId), JSON.stringify(payload || {})]
    );
  } catch (err) {
    logger.warn({ err, userId, action }, 'sso bridge audit write failed');
  }
}

// ---- POST /redeem-ticket ----------------------------------------------------
// Spend a one-time ticket and sign the reader in HERE.
//
// PUBLIC ON PURPOSE. The ticket IS the credential: minted from a live family
// session seconds ago, single-use, burned by the SSO on this very call.
//
// ONLY A DELIBERATE ARRIVAL MAY CREATE AN ACCOUNT. The web middleware sends
// provision:true only for a ticket a sibling site handed over on a link. A
// ticket that answers our OWN silent "is this browser signed in?" check is
// stamped by the middleware and sends provision:false — and then a reader with
// no JubileePraise account is simply not signed in. JubileePraise deletes accounts
// outright (purgeUserAccount), so there is no tombstone to consult: letting the
// silent check provision would recreate a deleted account on the next page load,
// because merely having the browser open would be enough.
router.post('/redeem-ticket', ah(async (req, res) => {
  if (!familySsoOn()) throw new HttpError(503, 'sso_not_configured');

  const ticket = String(req.body?.ticket || '').trim();
  if (!ticket || ticket.length > 256) throw new HttpError(400, 'ticket_required');

  // Unbound audience, as on JubileeInspire: the SSO mints /continue tickets with
  // no audience because the redeeming API never presents the reader's host.
  const t0 = Date.now();
  const spent = await ssoRedeemTicket(ticket, null);
  if (!spent.ok) {
    // LOUD, because until 2026-09-16 a failed arrival left no trace at all —
    // not here, not in the middleware — and "it didn't sign me in" could not be
    // told apart from "the link carried no ticket". Never the ticket itself.
    logger.warn({ ssoStatus: spent.status ?? null, ssoError: spent.error ?? null, ms: Date.now() - t0 },
      'Family ticket refused by the SSO');
    throw new HttpError(401, 'invalid_ticket');
  }

  const ssoUser = spent.user;
  const email = String(ssoUser.email).trim().toLowerCase();
  const local = await query('SELECT id, is_active FROM identity.users WHERE email = $1', [email]);
  const row = local.rows[0];

  // A switched-off account stays switched off. upsertUserFromSSO sets
  // is_active = TRUE on conflict, which is right for a password sign-in the
  // admin has not blocked and wrong here, so refuse before it runs.
  if (row && !row.is_active) throw new HttpError(403, 'account_disabled');

  if (!row && req.body?.provision !== true) {
    return res.status(404).json({ error: 'no_local_user', message: 'No account on this site yet.' });
  }

  // Creates the row on a deliberate arrival; on a returning reader it refreshes
  // the name from the SSO (the identity authority) and last_login_at.
  const { user } = await upsertUserFromSSO(ssoUser);
  const created = !row;

  // Remembered, like JubileeInspire's arrival: the reader came on the strength
  // of a 90-day family session, so a session that dies with the tab would be a
  // surprise.
  const access = await issueAccessToken({ userId: user.id });
  const refresh = await createRefreshToken({ userId: user.id, extended: true });

  await audit(user.id, created ? 'account.created' : 'login_success', { via: 'sso_ticket' });
  // With the time taken: the web middleware waits REDEEM_TIMEOUT_MS for this
  // answer, and a redeem that succeeds after it gave up signs nobody in.
  logger.info({ userId: user.id, created, ms: Date.now() - t0 }, 'Signed in from a family ticket');

  res.json({
    success: true,
    created,
    user: { id: user.id, email: user.email, displayName: user.display_name },
    tokens: { accessToken: access.token, refreshToken: refresh.token, expiresAt: access.expiresAt },
  });
}));

// ---- POST /plant-url --------------------------------------------------------
// The one-time URL that teaches the SSO this browser, or null.
//
// Identified by the BEARER, because there is no cookie to read — this API is
// cookie-free. The 90-day session token exists only inside this request: opened,
// spent for a one-minute ticket, and only the ticket reaches the browser.
//
// NULL IS THE ORDINARY ANSWER, never an error: the SSO may be unconfigured, down,
// or unwilling. Every one of those means "carry on", which is what the reader
// wanted anyway, so this route never fails a page.
// RETIRED 2026-09-15 — always null. Planting is what let a JubileePraise sign-in
// silently sign the persona domains in (as this account, even over another).
// Owner decision: the family signs in by rail link only (/go-url, redeem), and
// the persona domains' silent sign-in is theirs alone. Kept answering, not
// removed, because web builds from before this still call it on every page.
const PLANT_RETIRED = true;

router.post('/plant-url', requireAuth, ah(async (req, res) => {
  if (PLANT_RETIRED || !familySsoOn()) return res.json({ success: true, url: null });

  let back;
  try { back = new URL(String(req.body?.return || '')); } catch { throw new HttpError(400, 'invalid_return'); }
  if (back.protocol !== 'https:' && back.hostname !== 'localhost') throw new HttpError(400, 'invalid_return');

  const opened = await ssoOpenSession(req.auth.user.email);
  if (!opened.ok) {
    logger.warn({ userId: req.auth.user.id, opened }, 'family session not opened');
    return res.json({ success: true, url: null });
  }
  const issued = await ssoIssueTicket(opened.sessionToken, null);
  if (!issued.ok) return res.json({ success: true, url: null });

  const url = new URL(`${config.sso.baseUrl}/api/auth/plant`);
  url.searchParams.set('t', issued.ticket);
  url.searchParams.set('return', back.toString());
  res.json({ success: true, url: url.toString() });
}));

// ---- POST /go-url -----------------------------------------------------------
// The rail's rows to the other family sites (web components/InspireRail.tsx):
// { to: 'https://www.kjubilee.com/…' } -> { url } with a one-time ticket on it,
// so a signed-in reader arrives there signed in — and with an account made for
// them if they had none, because following the rail to a site is joining it.
//
// Identified by the BEARER: this API is cookie-free, so the page asks for the
// URL and then navigates. Only the family sites are accepted (never an open
// redirect), and every failure answers with the plain URL.
const GO_FAMILY = new Set(['jubileeinspire.com', 'bornagaindna.com', 'kjubilee.com', 'jubileebibletalks.com', 'jubileepraise.com', 'jubileeverse.com', 'inspiremanna.com']);

router.post('/go-url', requireAuth, ah(async (req, res) => {
  let to;
  try { to = new URL(String(req.body?.to || '')); } catch { throw new HttpError(400, 'invalid_to'); }
  if (to.protocol !== 'https:' || !GO_FAMILY.has(to.hostname.toLowerCase().replace(/^www\./, ''))) {
    throw new HttpError(400, 'invalid_to');
  }
  to.searchParams.delete('t');
  if (!familySsoOn()) return res.json({ success: true, url: to.toString() });

  const opened = await ssoOpenSession(req.auth.user.email);
  if (opened.ok) {
    const issued = await ssoIssueTicket(opened.sessionToken, null);
    if (issued.ok) to.searchParams.set('t', issued.ticket);
  } else {
    logger.warn({ userId: req.auth.user.id, opened }, 'go-url: family session not opened');
  }
  res.json({ success: true, url: to.toString() });
}));

export default router;
