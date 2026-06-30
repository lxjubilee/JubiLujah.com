import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { requireAuth } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { resolvePlayIntent, getListeningStatus } from '../services/subscriptions.js';

// ============================================================================
// Free-plan listening enforcement (BRD §Free Plan Restrictions).
//
//   POST /api/listening/intent  — called by the player when a NEW track starts.
//       Atomically advances the daily counter and returns whether this play is
//       allowed in full or limited to a `preview_seconds` preview. The server is
//       authoritative: a tampered client can't grant itself unlimited plays
//       because the count + entitlement are evaluated here, not in the browser.
//
//   GET  /api/listening/status  — read-only daily-usage snapshot (no increment),
//       used to render "N of 7 free songs left today" hints.
// ============================================================================
const router = Router();

const intentSchema = z.object({
  // The catalog song id is accepted for future per-song policy / logging; the
  // quota itself is per-user-per-day, so it isn't required to be resolvable.
  song_id: z.string().max(80).optional(),
});

router.post('/intent', requireAuth, validate(intentSchema), ah(async (req, res) => {
  const result = await resolvePlayIntent(req.auth.user.id);
  res.json(result);
}));

router.get('/status', requireAuth, ah(async (req, res) => {
  res.json(await getListeningStatus(req.auth.user.id));
}));

export default router;
