'use client';
// Account-backed favorites ("likes"). Backed by /api/me/likes (requires auth).
import { api } from './api';

export type LikeType = 'album' | 'song';

export interface LikedItem {
  target_type: LikeType;
  target_id: string;
  liked_at: string;
  // Resolved from the manifest:
  id?: string;
  code?: string;
  title: string;
  artist?: string;
  artistSlug?: string;
  cover?: string | null;
  status?: 'ready' | 'studio';
  trackCount?: number;
}

export const listLikeIds = () => api.get<{ ids: string[] }>('/api/me/likes/ids');
export const listLikes = () => api.get<{ items: LikedItem[] }>('/api/me/likes');
export const likeTarget = (target_type: LikeType, target_id: string) =>
  api.post<{ liked: boolean }>('/api/me/likes', { target_type, target_id });
export const unlikeTarget = (target_type: LikeType, target_id: string) =>
  api.del<{ liked: boolean }>(`/api/me/likes/${target_type}/${target_id}`);
