'use strict';
// ============================================================================
// Redirector automation auth — software/redirector.md §14 / §12.3.
//
// The automation API (pipeline, personas) authenticates with a per-domain API
// key in `X-Redirector-Key` (§14). The admin console authenticates with the
// Jubilee SSO JWT + RBAC roles (§12.3). Both drive the same endpoints, so this
// guard accepts EITHER:
//   - a valid X-Redirector-Key  -> req.rdrAuth = { via:'api_key', consumer, scopes, actor }
//   - an SSO session of >= minRole -> req.rdrAuth = { via:'sso', actor, roles }
// On neither -> 401/403. `minRole` is the SSO floor (editor/manager/owner map to
// the app's content_editor/executive/admin ladder — see roleFor()).
// ============================================================================
import { HttpError, hasRole } from './rbac.js';
import { verifyKey } from '../redirector/keys.js';

// Map redirector role names (§12.3) onto this app's RBAC ladder (config.js).
// viewer->viewer, editor->content_editor, manager->executive, owner->admin.
export function roleFor(redirectorRole) {
  switch (redirectorRole) {
    case 'viewer': return 'viewer';
    case 'editor': return 'content_editor';
    case 'manager': return 'executive';
    case 'owner': return 'admin';
    default: return redirectorRole;
  }
}

export function requireRedirectorAuth(minRole = 'editor') {
  const ssoFloor = roleFor(minRole);
  return async (req, res, next) => {
    try {
      // (1) API key path.
      const rawKey = req.get('x-redirector-key');
      if (rawKey) {
        const k = await verifyKey(rawKey);
        if (!k) return next(new HttpError(401, 'Invalid redirector API key'));
        req.rdrAuth = { via: 'api_key', consumer: k.consumer, scopes: k.scopes, actor: `key:${k.consumer}`, actorType: 'api_key' };
        return next();
      }
      // (2) SSO path.
      if (!req.auth) return next(new HttpError(401, 'Authentication required'));
      if (!hasRole(req.auth.roles, ssoFloor)) {
        return next(new HttpError(403, `Requires role: ${minRole} or higher`));
      }
      req.rdrAuth = {
        via: 'sso',
        actor: req.auth.email || req.auth.userId || 'sso',
        actorType: 'sso',
        roles: req.auth.roles || [],
      };
      return next();
    } catch (err) {
      next(err);
    }
  };
}

// Stable identity for rate-limiting the automation API (300/min, §14). Buckets by
// API key hash when present, else by SSO subject, else by IP.
export function redirectorRateKey(req) {
  const k = req.get('x-redirector-key');
  if (k) return 'rdk:' + k.slice(0, 20);
  if (req.auth?.userId) return 'rdr-sso:' + req.auth.userId;
  return req.ip;
}
