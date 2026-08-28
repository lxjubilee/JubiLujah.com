import Link from 'next/link';
import { ArticleArt } from '@/components/torahsings/system/ArticleArt';
import { ReadAloudButton } from '@/components/torahsings/reading/ReadAloudButton';
import type { Block } from '@/lib/torahsings/types';
import type { HebraicArticle } from '@/lib/torahsings/hebraic';
import { BackstageCard } from './BackstageCard';
import { BackstageProse } from './BackstageProse';
import styles from './BackstageReader.module.css';

/** Map the corpus blocks to the legacy Block[] the read-aloud engine speaks. */
function speakable(blocks: HebraicArticle['blocks']): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    if (b.type === 'h') out.push({ type: 'h', text: b.text ?? '' });
    else if (b.type === 'quote') out.push({ type: 'quote', text: b.text ?? '', cite: b.cite ?? '' });
    else if (b.type === 'p') out.push({ type: 'p', text: b.text ?? '' });
  }
  return out;
}

export function BackstageReader({
  article,
  related,
}: {
  article: HebraicArticle;
  related: HebraicArticle[];
}) {
  return (
    <article className={`bsHebraic ${styles.article}`}>
      <section className={styles.hero}>
        <ArticleArt
          className={styles.heroImg}
          slug={article.slug}
          hue={article.hue}
          glyph={article.glyph}
          topic="Hebraic Christianity"
          ratio="21 / 9"
        />
        <Link href="/hebraic-christianity" className={styles.back}>
          ← Hebraic Christianity
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
          <BackstageProse blocks={article.blocks} />
          <p className={styles.disclaimer}>Not canon · Something to consider</p>
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.widget}>
            <ReadAloudButton
              id={`hebraic:${article.slug}`}
              blocks={speakable(article.blocks)}
              presenter={article.presenter}
              audioUrl={null}
              minutes={article.readingTime}
            />
          </div>

          <div className={styles.widget}>
            <div className={styles.widgetTitle}>The Article</div>
            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dt>Author</dt>
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
          <h2 className={styles.moreTitle}>Keep reading</h2>
          <div className={styles.grid}>
            {related.map((a) => (
              <BackstageCard key={a.slug} article={a} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
