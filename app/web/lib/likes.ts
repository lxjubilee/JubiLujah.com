'use client';
// Account-backed likes and favorites. Backed by /api/me/likes (requires auth).
//
// A LIKE is the thumbs-up (and every album like); a FAVORITE is the footer
// player's heart (migration 0034). They are independent: a song can be either,
// both, or neither.
import { api } from './api';

export type LikeType = 'album' | 'song';
export type LikeKind = 'like' | 'favorite';

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
export const likeTarget = (target_type: LikeType, target_id: string, kind: LikeKind = 'like') =>
  api.post<{ liked: boolean; added_to_playlist?: boolean }>('/api/me/likes', { target_type, target_id, kind });
export const unlikeTarget = (target_type: LikeType, target_id: string, kind: LikeKind = 'like') =>
  api.del<{ liked: boolean }>(`/api/me/likes/${target_type}/${target_id}${kind === 'favorite' ? '?kind=favorite' : ''}`);
