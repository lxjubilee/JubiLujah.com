'use client';
// Typed client for the personal user-playlist API (/api/me/playlists). All
// endpoints require an authenticated session; the api client sends the session
// cookie + CSRF token automatically.
import { api } from './api';

export interface UserPlaylist {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  is_default?: boolean;   // the auto-provisioned "My Favorites" playlist
  item_count?: number;
  cover?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlaylistItem {
  id: string;
  song_id: string;
  position: number;
  song_title: string;
  album_title?: string;
  artist_name?: string;
  cover?: string | null;
  url?: string | null;
}

export interface PlaylistDetail extends UserPlaylist {
  items: PlaylistItem[];
}

export const listMyPlaylists = () => api.get<UserPlaylist[]>('/api/me/playlists');

export const createPlaylist = (body: { name: string; description?: string; is_public?: boolean }) =>
  api.post<UserPlaylist>('/api/me/playlists', body);

export const getPlaylist = (id: string) => api.get<PlaylistDetail>(`/api/me/playlists/${id}`);

export const updatePlaylist = (
  id: string,
  body: { name?: string; description?: string | null; is_public?: boolean }
) => api.patch<UserPlaylist>(`/api/me/playlists/${id}`, body);

export const deletePlaylist = (id: string) => api.del<void>(`/api/me/playlists/${id}`);

export const addToPlaylist = (id: string, songId: string) =>
  api.post(`/api/me/playlists/${id}/items`, { song_id: songId });

// Add many songs at once (e.g. a whole album). Returns how many were newly added.
export const bulkAddToPlaylist = (id: string, songIds: string[]) =>
  api.post<{ playlist_id: string; added: number; total: number }>(`/api/me/playlists/${id}/items/bulk`, { song_ids: songIds });

export const removeFromPlaylist = (id: string, itemId: string) =>
  api.del<void>(`/api/me/playlists/${id}/items/${itemId}`);

// Distinct song ids (with per-song count) across all of the caller's playlists.
// Used to show a "✓ already added" indicator on tracks.
export const listPlaylistSongIds = () =>
  api.get<{ counts: Record<string, number> }>('/api/me/playlist-song-ids');
