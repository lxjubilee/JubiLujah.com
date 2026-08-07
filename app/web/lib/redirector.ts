'use client';
// ============================================================================
// Browser client for the redirector admin console — software/redirector.md §12.
// Thin typed wrappers over the shared Bearer `api` client (lib/api.ts). The
// admin's SSO JWT authorizes these calls via requireRedirectorAuth on the API.
// ============================================================================
import { api } from '@/lib/api';

export interface TaxonomyLevel {
  key: string; label: string; plural: string; depth: number; tokenizable: boolean;
  default_token_type?: string; default_landing_enabled?: boolean; resume_eligible?: boolean;
  attaches_to?: string[]; metadata_fields?: string[];
}
export interface TaxonomyProfile { domain: string; display_name: string; levels: TaxonomyLevel[]; }
export interface Profile { taxonomy: TaxonomyProfile; qr_styles: string[]; }

export interface RdrNode {
  node_id: string; parent_node_id: string | null; level_key: string; title: string;
  slug: string | null; sort_order: number; cover_image_url: string | null; is_active: boolean;
}
export interface RdrItem {
  asset_id: string; title: string; content_kind: string; keywords: string | null; summary: string | null;
  health_status: string; sort_order: number | null; token: string | null; token_type: string | null;
  resolution_mode: string | null; landing_enabled: boolean | null; state: string | null;
  resolve_count: number | null; last_resolved_at: string | null; alias: string | null;
  qr_svg_url: string | null; short_url: string | null;
}
export interface AuditEvent {
  audit_id: number; actor: string; actor_type: string; action: string;
  entity_type: string; entity_id: string | null; occurred_at: string;
}
export interface ScanPoint { day: string; scans: number; bots: number; landings: number; }
export interface HealthAsset {
  asset_id: string; title: string; content_kind: string; storage_url: string | null;
  health_status: string; health_checked_at: string | null;
}
export interface CreatedToken { token: string; url: string; qr_svg_url: string; qr_png_url: string; }
export interface LookupResult {
  token: string; title: string; kind: string; summary: string | null; keywords: string[];
  short_url: string; qr_svg_url: string; qr_png_url: string; path: string | null;
}

export interface ReportOverview {
  range: { from: string; to: string };
  resolutions: number; tokens: number; bot_hits: number; landings_shown: number; landing_actions: number;
}
export interface TopToken {
  token: string; kind: string | null; label: string | null; campaign: string | null; placement: string | null;
  resolutions: number; last_resolved: string | null;
}
export interface BreakdownRow { key: string; n: number; }
export interface AssetToken { slug: string; content_kind: string; token: string; }
export interface ProbeReport { total: number; series: { day: string; probes: number; sources: number }[]; }

function auditQuery(entityType?: string, entityId?: string): string {
  if (!entityType) return '';
  const qs = new URLSearchParams({ entity_type: entityType });
  if (entityId) qs.set('entity_id', entityId);
  return `?${qs.toString()}`;
}

export const redirector = {
  profile: () => api.get<Profile>('/api/redirector/profile'),
  nodes: () => api.get<{ nodes: RdrNode[] }>('/api/redirector/taxonomy/nodes'),
  items: (nodeId: string) => api.get<{ items: RdrItem[] }>(`/api/redirector/taxonomy/nodes/${nodeId}/items`),
  token: (token: string) => api.get<Record<string, unknown>>(`/api/redirector/tokens/${token}`),
  scans: (token: string) => api.get<{ token: string; series: ScanPoint[] }>(`/api/redirector/tokens/${token}/scans`),
  audit: (entityType?: string, entityId?: string) =>
    api.get<{ events: AuditEvent[] }>(`/api/redirector/audit${auditQuery(entityType, entityId)}`),
  health: () => api.get<{ count: number; assets: HealthAsset[] }>('/api/redirector/health/assets'),
  lookup: (q: string, limit = 20) =>
    api.get<{ results: LookupResult[] }>(`/api/redirector/lookup?q=${encodeURIComponent(q)}&limit=${limit}`),
  // Real minted asset-mode tokens keyed by asset slug (e.g. album code), for the
  // admin catalog to render each album/song's actual QR. Optional kind filter.
  assetTokens: (kind?: string) =>
    api.get<{ tokens: AssetToken[] }>(`/api/redirector/asset-tokens${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`),
  createToken: (body: Record<string, unknown>) => api.post<CreatedToken>('/api/redirector/tokens', body),
  retire: (token: string, supersedeWith?: string) =>
    api.post<{ token: string; state: string }>(`/api/redirector/tokens/${token}/retire`, supersedeWith ? { supersede_with: supersedeWith } : {}),
  requestAlias: (token: string, alias: string) =>
    api.post<{ alias: string; status: string }>('/api/redirector/aliases', { token, alias }),
  approveAlias: (alias: string) =>
    api.post<{ alias: string; status: string }>(`/api/redirector/aliases/${encodeURIComponent(alias)}/approve`),
  patchAsset: (assetId: string, body: Record<string, unknown>) =>
    api.patch<{ asset_id: string; updated: string[] }>(`/api/redirector/assets/${assetId}`, body),
  reports: {
    overview: () => api.get<ReportOverview>('/api/redirector/reports/overview'),
    topTokens: () => api.get<{ tokens: TopToken[] }>('/api/redirector/reports/top-tokens'),
    breakdown: (dimension: 'device' | 'country' | 'referrer') =>
      api.get<{ dimension: string; rows: BreakdownRow[] }>(`/api/redirector/reports/breakdown?dimension=${dimension}`),
    probes: () => api.get<ProbeReport>('/api/redirector/reports/probes'),
  },
};
