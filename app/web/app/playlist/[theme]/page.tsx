import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTheme, allThemeIds } from '@/lib/playlistThemes';
import ThemePlaylistApp from '@/components/ThemePlaylistApp';
import type { Arc } from '@/lib/themePlaylist';

// A new theme = a new JSON file in public/music/playlist-themes/. Each gets a
// fully working page here with no code change (acceptance criterion §18.14).
export function generateStaticParams() {
  return allThemeIds().map((theme) => ({ theme }));
}

export function generateMetadata({ params }: { params: { theme: string } }): Metadata {
  const theme = getTheme(params.theme);
  if (!theme) return { title: 'Playlist — JubiLujah' };
  return {
    title: `${theme.theme_name} — JubiLujah`,
    description: theme.theme_statement,
    openGraph: { title: `${theme.theme_name} — JubiLujah`, description: theme.theme_statement },
  };
}

export default function ThemePlaylistPage({ params }: { params: { theme: string } }) {
  const theme = getTheme(params.theme);
  if (!theme) notFound();
  return (
    <ThemePlaylistApp
      themeId={theme.theme_id}
      initial={{
        name: theme.theme_name,
        statement: theme.theme_statement,
        accent: theme.accent || null,
        heroImage: theme.hero_image || null,
        supportedArcs: theme.supported_arcs as Arc[],
        defaultArc: theme.default_arc as Arc,
        targetTrackCount: theme.target_track_count,
      }}
    />
  );
}
