import { ROLE_ORDER } from '../config.js';

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function roleLevel(roles) {
  let max = -1;
  for (const r of roles || []) {
    const idx = ROLE_ORDER.indexOf(r);
    if (idx > max) max = idx;
  }
  return max;
}

export function hasRole(roles, minRole) {
  return roleLevel(roles) >= ROLE_ORDER.indexOf(minRole);
}

// Require a valid session.
export function requireAuth(req, res, next) {
  if (!req.auth) throw new HttpError(401, 'Authentication required');
  next();
}

// Require at least `minRole` (privilege-ordered). content_editor is the global
// minimum to access editorial features (Build-Spec §5).
export function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.auth) throw new HttpError(401, 'Authentication required');
    if (!hasRole(req.auth.roles, minRole)) {
      throw new HttpError(403, `Requires role: ${minRole} or higher`);
    }
    next();
  };
}
