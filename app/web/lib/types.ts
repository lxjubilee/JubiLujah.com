export type AlbumStatus = 'ready' | 'studio';

export interface Track {
  id: string;
  n: number;
  title: string;
  file?: string;
  audio: boolean;
  url: string | null; // absolute CDN url
}

export interface AlbumSummary {
  id: string;
  code: string;
  title: string;
  playable: number;
  trackCount: number;
  status: AlbumStatus;
}

export interface Album extends AlbumSummary {
  folder?: string;
  path?: string;
  artistSlug: string;
  artistName: string;
  category: string;
  categoryLabel: string;
  tracks: Track[];
}

export interface Artist {
  slug: string;
  name: string;
  role: string | null;
  category: string;
  categoryLabel?: string;
  albumCount?: number;
  playableAlbums?: number;
  albums?: AlbumSummary[];
}

export interface CategorySummary {
  key: string;
  label: string;
  artistCount: number;
  albumCount: number;
}

export interface StatusCounts {
  scope: string;
  ready: { albums: number; songs: number };
  studio: { albums: number; songs: number };
}
