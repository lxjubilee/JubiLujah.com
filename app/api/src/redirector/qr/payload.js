'use strict';
// ============================================================================
// QR encoded payload — software/redirector.md §10.4.
//
// Encode the full canonical URL, no query string, no trailing slash:
//     HTTPS://JUBILEEPRAISE.COM/R/aB3kM9pQ7xT2
// The scheme + host are uppercased (hosts are case-insensitive) so THAT segment
// stays in QR alphanumeric mode; the token, however, is CASE-SENSITIVE (Base58,
// mixed case) and is emitted verbatim — so the token segment encodes in byte mode.
// The code is therefore slightly denser than an all-uppercase token would be; the
// branded/dotted style + error correction keep it comfortably scannable. Campaign
// and placement tracking live on the token row, never as query params (§10.4).
// ============================================================================
import { config } from '../../config.js';

// host[:port] from the configured redirector base URL, uppercased. Scheme is
// always forced to HTTPS in the payload (§10.4); in dev the host may be a
// localhost:port, which is still alphanumeric-mode-safe (':' is a legal char).
export function canonicalHost() {
  const base = config.redirector.baseUrl || 'https://jubileepraise.com';
  return base.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toUpperCase();
}

// `prefix` is the path segment: 'R' for canonical/alias tokens (/r/), 'RP' for
// ephemeral persona tokens (/rp/, §6.7). The token is emitted verbatim (case-
// sensitive Base58); only the host is uppercased.
export function tokenPayload(token, prefix = 'R') {
  return `HTTPS://${canonicalHost()}/${prefix}/${String(token).trim()}`;
}
