'use client';

import Link from 'next/link';
import { useAudio } from '@/components/torahsings/audio/AudioProvider';
import { Eyebrow } from '@/components/torahsings/system/Eyebrow';
import { PlayButton } from '@/components/torahsings/system/PlayButton';
import { canPlayTrack, freeTasteNote } from '@/lib/torahsings/access';
import { useJubileeAccount } from '@/lib/torahsings/jubilee-account';
import { trackId } from '@/lib/torahsings/media';
import { albumQueue, toPlayable } from '@/lib/torahsings/playable';
import type { Album } from '@/lib/torahsings/types';
import styles from './TrackList.module.css';

/** Seven numbered songs. The one sounding is gold. The gated ones say so. */
export function TrackList({ album }: { album: Album }) {
  const { entitlement } = useJubileeAccount();
  const { current, playing, toggle } = useAudio();

  const queue = albumQueue(album, entitlement);
  const isMember = entitlement === 'member';

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.headTitle}>The songs</span>
        <span className={styles.headMeta}>{album.tracks.length} songs</span>
      </div>

      <ol className={styles.list}>
        {album.tracks.map((track) => {
          const id = trackId(album.slug, track.n);
          const access = canPlayTrack(album, track, entitlement);
          const playable = toPlayable(album, track);
          const isCurrent = current?.id === id;
          const locked = !access.allowed;

          return (
            <li
              key={track.n}
              className={[styles.row, isCurrent ? styles.current : '', locked ? styles.locked : '']
                .filter(Boolean)
                .join(' ')}
            >
              <span className={styles.n}>{String(track.n).padStart(2, '0')}</span>

              <PlayButton
                size={40}
                ghost
                playing={isCurrent && playing}
                locked={locked}
                disabled={!playable}
                label={locked ? `${track.title} — unlocks with membership` : `Play ${track.title}`}
                onClick={playable ? () => toggle(playable, queue) : undefined}
              />

              <span className={styles.title}>{track.title}</span>

              {locked ? (
                <span className={styles.lockNote}>Members</span>
              ) : (
                <span className={styles.duration}>{track.duration}</span>
              )}
            </li>
          );
        })}
      </ol>

      <div className={styles.taste}>
        <Eyebrow className={styles.tasteLabel}>{isMember ? 'Full access' : 'Free taste'}</Eyebrow>
        <p className={styles.tasteBody}>
          {isMember
            ? 'Your membership opens the whole library — this album, every album, and everything still to come.'
            : freeTasteNote(album)}
        </p>
        {!isMember && (
          <Link href="/membership" className={styles.tasteLink}>
            Open the treasury &#8594;
          </Link>
        )}
      </div>
    </div>
  );
}
