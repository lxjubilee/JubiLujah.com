import { angelsCatalog } from '@/content/torahsings/angels-catalog';
import styles from './CatalogHero.module.css';

/**
 * A cinematic masthead in JubileePraise's album/persona "x-hero" style: a full-width
 * banner with cover art bleeding in from the right under a left→right dark scrim,
 * and on the left an eyebrow → serif title (+ italic subtitle) → lede → a row of
 * label/value catalog stats.
 */
export function CatalogHero() {
  const albums = angelsCatalog.flatMap((c) => c.albums);
  const totalAlbums = albums.length;
  const totalSongs = albums.reduce((n, a) => n + a.tracks.length, 0);

  // The hero banner — Zev sits on the right; the left→right scrim (see CSS) keeps
  // the copy readable over the golden backdrop on the left.
  const heroImg = '/angels/art/Slide-Zev.webp';

  const nf = (n: number) => n.toLocaleString('en-US');

  return (
    <header
      className={styles.hero}
      style={heroImg ? ({ '--hero-img': `url('${heroImg}')` } as React.CSSProperties) : undefined}
    >
      <div className={`wrap ${styles.container}`}>
        <div className={styles.inner}>
          <p className={styles.eyebrow}>Jubilee Ministries · The Angels&rsquo; Catalog</p>

          <h1 className={styles.title}>
            Torah Sings
            <em>
              &mdash; the hidden songs of Scripture, decoded letter by letter and sung from heaven&rsquo;s
              own perspective.
            </em>
          </h1>

          <p className={styles.sub}>
            <strong>{nf(totalAlbums)} albums.</strong> {nf(totalSongs)} songs. Across the Torah, the
            Prophets, and the Writings &mdash; press play, and the music keeps going as you move through the
            site.
          </p>
        </div>
      </div>
    </header>
  );
}
