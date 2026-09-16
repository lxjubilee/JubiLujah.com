// ============================================================================
// GET /api/chat-history -> { conversations: [{ id, title, lastMessageAt, href }], total }
//
// The signed-in reader's JubileeInspire Chat History, for the rail's Chat
// History section (web components/InspireRail.tsx). Same contract as the other
// family sites' /api/chat-history (first: JubileeBibleTalks, 2026-09-15).
//
// Identified by the BEARER, like everything on this cookie-free API
// (requireAuth → req.auth.user.email), so a request can only ever return the
// history of whoever is signed in. The key that can read anyone's history
// (JI_HISTORY_API_KEY; W:/JubileeInspire.com/docs/chat-history-api-v1.md) never
// leaves this server.
//
// The list JubileeInspire's own sidebar shows: saved chats on
// jubileeinspire.com, newest first, fetched in one go (up to 100) because the
// rail filters titles in the browser the way JI's does.
//
// `href` is the conversation's plain https URL on JubileeInspire. The rail
// opens it through its goSignedIn click handler (POST /api/auth/sso/go-url), so
// the reader arrives signed in — a link cannot carry this API's bearer.
// ============================================================================
import { Router } from 'express';
import { ah } from '../util/async.js';
import { requireAuth } from '../middleware/rbac.js';

const router = Router();

const API_BASE = (process.env.JI_HISTORY_API_BASE || 'https://api.jubileeinspire.com/api/history/v1').replace(/\/$/, '');

// jubileeinspire.com is served from www, so the ticket goes straight there
// rather than riding a redirect.
function openHref(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.toLowerCase() === 'jubileeinspire.com') u.hostname = 'www.jubileeinspire.com';
    return u.toString();
  } catch {
    return null;
  }
}

router.get('/', requireAuth, ah(async (req, res) => {
  // Personal: nothing in between may keep a copy.
  res.set('Cache-Control', 'no-store, private');

  const email = req.auth.user.email;
  if (!email) return res.status(401).json({ error: 'signed_out' });
  if (!process.env.JI_HISTORY_API_KEY) {
    return res.status(503).json({ error: 'not_configured', message: 'Chat history is not configured on this deployment.' });
  }

  let status;
  let body;
  try {
    const url = new URL(`${API_BASE}/conversations`);
    url.searchParams.set('email', email);
    url.searchParams.set('limit', '100');
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.JI_HISTORY_API_KEY}` },
      signal: AbortSignal.timeout(8000),
    });
    status = r.status;
    body = await r.json().catch(() => null);
  } catch (err) {
    console.error('[chat-history] JubileeInspire unreachable:', err.message);
    return res.status(502).json({ error: 'unavailable' });
  }

  // No JubileeInspire account for this email yet: an empty history, not a fault.
  if (status === 404 && body?.error?.code === 'USER_NOT_FOUND') {
    return res.json({ conversations: [], total: 0 });
  }
  if (status !== 200 || !body?.success) {
    console.error('[chat-history] history API', status, body?.error?.code, body?.error?.request_id);
    return res.status(502).json({ error: 'unavailable' });
  }

  const conversations = (body.conversations || []).map((c) => ({
    id: c.id,
    title: c.title || 'Untitled conversation',
    lastMessageAt: c.last_message_at,
    href: openHref(c.url),
  }));
  res.json({ conversations, total: body.total ?? conversations.length });
}));

export default router;
