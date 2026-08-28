import Link from 'next/link';
import { CelestialArt } from '@/components/torahsings/system/CelestialArt';
import { ReadAloudButton } from '@/components/torahsings/reading/ReadAloudButton';
import { learnHebrewImageUrl } from '@/lib/torahsings/article-art';
import type { Block } from '@/lib/torahsings/types';
import type { LearnHebrewArticle } from '@/lib/torahsings/learn-hebrew';
import { BackstageProse } from './BackstageProse';
import { LearnHebrewCard } from './LearnHebrewCard';
import styles from './LearnHebrewReader.module.css';

function speakable(blocks: LearnHebrewArticle['blocks']): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    if (b.type === 'h') out.push({ type: 'h', text: b.text ?? '' });
    else if (b.type === 'quote') out.push({ type: 'quote', text: b.text ?? '', cite: b.cite ?? '' });
    else if (b.type === 'p') out.push({ type: 'p', text: b.text ?? '' });
  }
  return out;
}

export function LearnHebrewReader({
  article,
  related,
}: {
  article: LearnHebrewArticle;
  related: LearnHebrewArticle[];
}) {
  const heroUrl = learnHebrewImageUrl(`${article.slug}.webp`);

  return (
    <article className={`bsHebraic ${styles.article}`}>
      <section className={styles.hero}>
        {heroUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.heroImg} src={heroUrl} alt="" />
        ) : (
          <CelestialArt
            className={styles.heroImg}
            seed={article.slug}
            hue={article.hue}
            glyph={article.glyph}
            topic="Learn Hebrew"
            ratio="21 / 9"
          />
        )}
        <Link href="/learn-hebrew" className={styles.back}>
          ← Learn Hebrew
        </Link>
        <div className={styles.heroOverlay}>
          <div className={styles.heroContent}>
            <span className={styles.artistPill}>{article.presenter}</span>
            <h1 className={styles.heroTitle}>{article.title}</h1>
          </div>
        </div>
      </section>

      <div className={styles.container}>
        <div className={styles.main}>
          {article.dek ? <p className={styles.dek}>{article.dek}</p> : null}

          <BackstageProse blocks={article.blocks} imageResolver={learnHebrewImageUrl} />

          <p className={styles.disclaimer}>Not canon · Something to consider</p>
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.widget}>
            <ReadAloudButton
              id={`learn-hebrew:${article.slug}`}
              blocks={speakable(article.blocks)}
              presenter={article.presenter}
              audioUrl={null}
              minutes={article.readingTime}
            />
          </div>
          <div className={styles.widget}>
            <div className={styles.widgetTitle}>The Lesson</div>
            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dt>Teacher</dt>
                <dd>{article.presenter}</dd>
              </div>
              {article.office ? (
                <div className={styles.fact}>
                  <dt>Office</dt>
                  <dd>{article.office}</dd>
                </div>
              ) : null}
              <div className={styles.fact}>
                <dt>Reading</dt>
                <dd>{article.readingTime} min</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <section className={styles.more}>
          <h2 className={styles.moreTitle}>Keep learning</h2>
          <div className={styles.grid}>
            {related.map((a) => (
              <LearnHebrewCard key={a.slug} article={a} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
