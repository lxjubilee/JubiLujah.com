'use client';

import Link from 'next/link';
import { useAudio } from '@/components/torahsings/audio/AudioProvider';
import { ArticleBody } from '@/components/torahsings/reading/ArticleBody';
import { ReadAloudButton } from '@/components/torahsings/reading/ReadAloudButton';
import { CelestialArt } from '@/components/torahsings/system/CelestialArt';
import { Eyebrow } from '@/components/torahsings/system/Eyebrow';
import { Tabs } from '@/components/torahsings/system/Tabs';
import { songCountLabel, toRoman } from '@/lib/torahsings/format';
import type { DerivationRow } from '@/lib/torahsings/derivation';
import { useJubileeAccount } from '@/lib/torahsings/jubilee-account';
import { albumQueue } from '@/lib/torahsings/playable';
import type { Album } from '@/lib/torahsings/types';
import { DerivationTable } from './DerivationTable';
import { TrackList } from './TrackList';
import styles from './AlbumDetail.module.css';

interface AlbumDetailProps {
  album: Album;
  /** Computed on the server by the derivation engine. */
  rows: DerivationRow[];
  modeLabel: string;
  noteLine: string;
}

/**
 * The reusable heart of the platform. Every album renders through this one
 * component — three tabs for three audiences, and the tracklist beside them.
 */
export function AlbumDetail({ album, rows, modeLabel, noteLine }: AlbumDetailProps) {
  const { entitlement } = useJubileeAccount();
  const { play } = useAudio();

  const queue = albumQueue(album, entitlement);

  const playAlbum = () => {
    if (queue.length > 0) play(queue[0], queue);
  };

  return (
    <>
      <div className="wrap">
        <Link href="/#library" className={styles.back}>
          &#8592; All albums
        </Link>
      </div>

      <section className={`wrap ${styles.hero}`}>
        <CelestialArt
          className={styles.art}
          seed={album.slug}
          hue={album.art.hue}
          topic={album.topic}
          glyph={album.art.glyph}
          ratio="1 / 1"
          ring
        />

        <div>
          <Eyebrow>
            Topic album {toRoman(album.albumNumber)} · {songCountLabel(album.tracks.length)}
          </Eyebrow>

          <h1 className={styles.title}>{album.title}</h1>

          <p className={styles.description}>{album.description}</p>

          <div className={styles.actions}>
            <button type="button" className="pill" onClick={playAlbum} disabled={queue.length === 0}>
              Play album
            </button>

            <span className={styles.presenter}>
              Presented by <span className={styles.presenterName}>{album.presenter}</span>
            </span>
          </div>
        </div>
      </section>

      <section className={`wrap ${styles.body}`}>
        <Tabs
          tabs={[
            {
              id: 'article',
              label: 'Article',
              panel: (
                <div>
                  <ReadAloudButton
                    id={`album:${album.slug}`}
                    blocks={album.article.blocks}
                    presenter={album.article.voice}
                    audioUrl={album.article.audioUrl}
                    minutes={album.article.minutes}
                  />
                  <h2 className={styles.articleHeadline}>{album.article.headline}</h2>
                  <ArticleBody blocks={album.article.blocks} />
                </div>
              ),
            },
            {
              id: 'lyrics',
              label: 'Lyrics',
              panel: (
                <div className={styles.lyrics}>
                  {album.lyrics.stanzas.map((stanza, i) => (
                    <p key={i} className={styles.stanza}>
                      {stanza.map((line, j) => (
                        <span key={j}>{line}</span>
                      ))}
                    </p>
                  ))}
                  <p className={styles.lyricsNote}>{album.lyrics.note}</p>
                </div>
              ),
            },
            {
              id: 'derivation',
              label: 'Derivation',
              panel: <DerivationTable album={album} rows={rows} modeLabel={modeLabel} noteLine={noteLine} />,
            },
          ]}
        />

        <TrackList album={album} />
      </section>
    </>
  );
}
