'use strict';
// ============================================================================
// Audit trail — software/redirector.md §18.4 / §12.2.
//
// "All admin mutations are written to the audit trail with actor, timestamp,
//  before value, and after value." Append-only. Fire-and-forget so an audit
// write can never fail the mutation it records; a dropped audit row is logged.
// ============================================================================
import { query } from '../db.js';
import { logger } from '../logger.js';

/**
 * @param {object} rdrAuth  req.rdrAuth ({ actor, actorType })
 * @param {string} action   e.g. 'token.create', 'token.retire', 'alias.approve'
 * @param {string} entityType  token | alias | asset | rule | node | key
 * @param {string} entityId
 * @param {object|null} before
 * @param {object|null} after
 */
export function writeAudit(rdrAuth, action, entityType, entityId, before, after) {
  const actor = rdrAuth?.actor || 'unknown';
  const actorType = rdrAuth?.actorType || 'sso';
  query(
    `INSERT INTO redirector.audit_log (actor, actor_type, action, entity_type, entity_id, before_json, after_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [actor, actorType, action, entityType, entityId == null ? null : String(entityId),
     before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null],
  ).catch((err) => logger.warn({ err, action, entityId }, 'redirector: audit write failed'));
}
