import type { Metadata } from 'next';

import { Plans } from '@/components/torahsings/membership/Plans';
import { PageHero } from '@/components/torahsings/system/PageHero';
import { getAlbums, getArticles, getLessonAlbums } from '@/lib/torahsings/content';
import { numberWord } from '@/lib/torahsings/format';
import styles from './page.module.css';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Membership',
  description:
    'Support the discovery. Fund the biblical archaeology. Access the treasury. $87.95 a year — the full Torah Sings library, current and future.',
};

export default function MembershipPage() {
  // The free-tier promises are read off the content itself, so the page can
  // never advertise a taste that the gating does not actually serve.
  const albums = getAlbums();
  const freeAlbums = albums.filter((a) => a.freeTier);
  const freeArticles = getArticles().filter((a) => a.freeTier);
  const freeLesson = getLessonAlbums().find((l) => l.freeTier);

  const gatedAlbum = albums.find((a) => !a.freeTier);
  const freeSongs = gatedAlbum ? gatedAlbum.tracks.filter((t) => t.freeTier).length : 0;

  return (
    <>
      <PageHero
        eyebrow="Partners in ongoing revelation"
        title="Support the discovery. Fund the biblical archaeology. Access the treasury."
      >
        One yearly commitment. It covers everything that has been uncovered so far — and everything uncovered
        while your membership is active. The work continues either way; the question is whether you are inside it
        while it happens.
      </PageHero>

      <div className={`wrap ${styles.page}`}>
        <Plans
        freeAlbumCount={`${numberWord(freeAlbums.length)} full ${freeAlbums.length === 1 ? 'album' : 'albums'}`}
        freeSongsPerAlbum={`${numberWord(freeSongs)} ${freeSongs === 1 ? 'song' : 'songs'}`}
        freeArticleCount={`${numberWord(freeArticles.length)} selected ${
          freeArticles.length === 1 ? 'article' : 'articles'
        }`}
        freeLessonLevel={
          freeLesson
            ? `Level ${freeLesson.level} of Learn Hebrew — ${freeLesson.title}`
            : 'The doorway into Learn Hebrew'
        }
        freeLessonShort={freeLesson ? `Level ${freeLesson.level} only` : 'The first level'}
      />

        <div className={styles.closing}>
          <p className={styles.closingLine}>
            An investment in ongoing spiritual archaeology — not merely a purchase. As more is uncovered, active
            members receive it.
          </p>
        </div>
      </div>
    </>
  );
}
