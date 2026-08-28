import { headers } from 'next/headers';
import { DEFAULT_TENANT, Tenant, tenantForHost } from './tenants';

// The request-bound half of the tenant system. Kept separate from lib/tenants.ts
// so that the registry stays importable from client components and scripts —
// this file touches `next/headers` and can only run on the server.

/**
 * The tenant this request belongs to, from its Host header.
 *
 * WRAPPED IN try/catch DELIBERATELY. `headers()` throws when called outside a
 * request scope, and lib/manifest.ts — which calls this on every catalogue read
 * — is also imported by build-time code and by node scripts. Without the catch,
 * scoping the catalogue would break the very tooling that generates it. Outside
 * a request there is no tenant, so the honest answer is the default: the whole
 * collection, exactly as it behaved before tenancy existed.
 *
 * Note this makes any route that reads it dynamic. That is already true across
 * this app — the root layout reads cookies() for the language — so it costs
 * nothing new.
 */
export function currentTenant(): Tenant {
  try {
    return tenantForHost(headers().get('host'));
  } catch {
    return DEFAULT_TENANT;
  }
}

/**
 * The category keys the current request may see, or null for "everything".
 *
 * Null and an empty array mean opposite things and the difference matters: null
 * is JubileePraise's whole catalogue, `[]` would be a tenant that can see nothing.
 */
export function currentTenantCategories(): string[] | null {
  return currentTenant().categories;
}
