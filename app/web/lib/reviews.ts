'use client';
// ============================================================================
// Client helpers + types for the public Rating & Review module.
// All calls go through lib/api (Bearer auth, transparent token refresh).
// ============================================================================
import { api } from '@/lib/api';

export type TargetType = 'album' | 'song';
export type ReviewSort = 'recent' | 'highest' | 'lowest' | 'helpful';
export type ReportReason = 'spam' | 'offensive_language' | 'hate_speech' | 'fake_review' | 'other';

export interface Distribution { 1: number; 2: number; 3: number; 4: number; 5: number }

export interface MyReview {
  id: string;
  stars: number;
  title: string | null;
  body: string | null;
  status: string;
  helpful_count: number;
  created_at: string;
  edited?: boolean;
}

export interface ReviewSummary {
  target_type: TargetType;
  target_id: string;
  average: number | null;
  rating_count: number;
  review_count: number;
  distribution: Distribution;
  mine?: MyReview | null;
}

export interface ReviewItem {
  id: string;
  target_type: TargetType;
  target_id: string;
  stars: number;
  title: string | null;
  body: string | null;
  helpful_count: number;
  created_at: string;
  edited: boolean;
  author: { display_name: string; avatar_url: string | null };
  mine: boolean;
  voted: boolean;
}

export interface ReviewListResult {
  items: ReviewItem[];
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
  sort: ReviewSort;
}

export interface Target { type: TargetType; id: string }

// ---- Reads (public) --------------------------------------------------------

export const getSummary = (type: TargetType, id: string) =>
  api.get<ReviewSummary>(`/api/reviews/${type}/${id}/summary`);

export const batchSummaries = (targets: Target[]) =>
  api.post<{ summaries: Record<string, ReviewSummary> }>(`/api/reviews/summaries`, { targets });

export const listReviews = (
  targets: Target[],
  opts: { sort?: ReviewSort; page?: number; limit?: number } = {},
) => api.post<ReviewListResult>(`/api/reviews/list`, { targets, ...opts });

export const getArtistSummary = (slug: string) =>
  api.get<{ slug: string; average: number | null; rating_count: number; review_count: number; album_count: number }>(
    `/api/reviews/artist/${slug}/summary`,
  );

// ---- Writes (require auth) -------------------------------------------------

export const upsertReview = (
  type: TargetType,
  id: string,
  body: { stars: number; title?: string | null; body?: string | null },
) => api.put<{ review: MyReview; summary: ReviewSummary }>(`/api/reviews/${type}/${id}`, body);

export const deleteReview = (type: TargetType, id: string) =>
  api.del<{ deleted: boolean; summary: ReviewSummary }>(`/api/reviews/${type}/${id}`);

export const toggleHelpful = (reviewId: string) =>
  api.post<{ voted: boolean; helpful_count: number }>(`/api/reviews/review/${reviewId}/helpful`);

export const reportReview = (reviewId: string, body: { reason: ReportReason; detail?: string }) =>
  api.post<{ reported: boolean }>(`/api/reviews/review/${reviewId}/report`, body);

// ---- Profile (§13) ---------------------------------------------------------

export interface Contributions {
  albums_rated: number;
  songs_rated: number;
  reviews_written: number;
  total_contributions: number;
  helpful_received: number;
}
export const getContributions = () => api.get<Contributions>(`/api/reviews/me/contributions`);
export const getMyReviews = () =>
  api.get<Array<MyReview & { target_type: TargetType; target_id: string }>>(`/api/reviews/me/reviews`);

// ---- Notifications (§14) ---------------------------------------------------

export interface ReviewNotification {
  id: string;
  kind: 'helpful_vote' | 'review_approved' | 'review_rejected' | 'review_removed';
  review_id: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}
export const getNotifications = () =>
  api.get<{ items: ReviewNotification[]; unread: number }>(`/api/reviews/notifications`);
export const markNotificationsRead = (ids?: string[]) =>
  api.post<{ ok: boolean }>(`/api/reviews/notifications/read`, ids ? { ids } : {});

// ---- Admin moderation (§11, §19) ------------------------------------------

export interface AdminReviewRow {
  id: string;
  target_type: TargetType;
  target_id: string;
  target_title: string | null;
  stars: number;
  title: string | null;
  body: string | null;
  status: string;
  helpful_count: number;
  open_reports: number;
  created_at: string;
  deleted_at: string | null;
  author_id: string;
  author_name: string;
  author_email: string;
}
export type ModerationAction = 'approve' | 'reject' | 'hide' | 'restore' | 'delete';

export const adminListReviews = (params: Record<string, string | number | boolean> = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, String(v)]),
  ).toString();
  return api.get<{ items: AdminReviewRow[]; page: number; limit: number; total: number; has_more: boolean }>(
    `/api/admin/reviews${qs ? `?${qs}` : ''}`,
  );
};
export const adminReports = () =>
  api.get<{ items: any[] }>(`/api/admin/reviews/reports`);
export const adminHistory = (reviewId: string) =>
  api.get<{ items: any[] }>(`/api/admin/reviews/${reviewId}/history`);
export const adminModerate = (reviewId: string, body: { action: ModerationAction; reason?: string }) =>
  api.post<{ id: string; action: string; status: string }>(`/api/admin/reviews/${reviewId}/moderate`, body);
export const adminAnalytics = () => api.get<any>(`/api/admin/reviews/analytics`);

// ---- Display helpers -------------------------------------------------------

export const REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam',
  offensive_language: 'Offensive Language',
  hate_speech: 'Hate Speech',
  fake_review: 'Fake Review',
  other: 'Other',
};

export const SORT_LABELS: Record<ReviewSort, string> = {
  recent: 'Most Recent',
  highest: 'Highest Rated',
  lowest: 'Lowest Rated',
  helpful: 'Most Helpful',
};

// "May 2026" style date for review timestamps.
export function reviewDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

// Distribution percentage for one star bucket.
export function distPct(distribution: Distribution, star: 1 | 2 | 3 | 4 | 5, total: number): number {
  if (!total) return 0;
  return Math.round((distribution[star] / total) * 100);
}
