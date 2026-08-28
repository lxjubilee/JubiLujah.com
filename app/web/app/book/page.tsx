import type { Metadata } from 'next';

import { BookCover } from '@/components/torahsings/book/BookCover';
import { BookPurchase } from '@/components/torahsings/book/BookPurchase';
import { Eyebrow } from '@/components/torahsings/system/Eyebrow';
import { SectionHeader } from '@/components/torahsings/system/SectionHeader';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'The Book',
  description:
    'Fragments of a Song — the whole account of how the songs were found in the Paleo-Hebrew, and what else came loose from the text along the way.',
};

const CHAPTERS: readonly { title: string; body: string }[] = [
  {
    title: 'The First Sequence',
    body: 'How a line of six symbols in the opening word of Genesis turned out to be doing something no one had asked it to do.',
  },
  {
    title: 'What the Letters Were Before They Were Letters',
    body: 'An ox, a house, a door, a mark. The pictographs beneath the alphabet, and why they never really left.',
  },
  {
    title: 'The Fold of Seven',
    body: 'Why the reduction is sevenfold, what happens at the multiples, and the reason nothing ever falls to nothing.',
  },
  {
    title: 'Whose Voice Is This',
    body: 'The songs do not read as ours. They read as sung from above, looking down at a world being made. On what that could mean, and what it cannot.',
  },
  {
    title: 'Iyob 38 and the Company of Singers',
    body: 'The morning stars, the sons of Elohim, and a soundtrack to creation that Scripture mentions almost in passing.',
  },
  {
    title: 'What We Have Not Told You',
    body: 'An honest accounting of the withheld layer — what stays proprietary, why, and what a serious student can still reconstruct.',
  },
];

export default function BookPage() {
  return (
    <div className={`wrap ${styles.page}`}>
      <section className={styles.top}>
        <div>
          <Eyebrow>The full transmission</Eyebrow>

          <h1 className={styles.title}>Fragments of a Song</h1>

          <p className={styles.lede}>
            The albums let you hear it. This is the account of how it was found — where the first sequence turned
            up, what the symbols were doing, why the fold is sevenfold, and what else came loose from the text
            once we stopped reading it the way we had been taught to. It is the argument in full, set down for
            anyone willing to check the work. It is not offered as canon. It is offered as something to consider.
          </p>

          <BookPurchase />
        </div>

        <div className={styles.coverWrap}>
          <BookCover />
        </div>
      </section>

      <section className={styles.contents}>
        <SectionHeader eyebrow="What is inside" title="Six chapters" aside={`${CHAPTERS.length} chapters`} />

        <div className={styles.chapters}>
          {CHAPTERS.map((chapter, i) => (
            <div key={chapter.title} className={styles.chapter}>
              <span className={styles.chapterN}>Chapter {String(i + 1).padStart(2, '0')}</span>
              <h3 className={styles.chapterTitle}>{chapter.title}</h3>
              <p className={styles.chapterBody}>{chapter.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.closing}>
        <p className={styles.closingLine}>
          Fragments of a song, scattered through the Scriptures. We did not write it. We only noticed it was
          there.
        </p>
      </div>
    </div>
  );
}
