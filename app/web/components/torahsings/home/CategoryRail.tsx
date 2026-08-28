import type { CatalogCategory } from '@/lib/torahsings/angels';
import { CatalogAlbumTile } from './CatalogAlbumTile';
import styles from './CategoryRail.module.css';

/**
 * One home-page division (Torah, Prophets, …) with every album from its books
 * laid out as square tiles. Albums are pre-sorted by book, so they cluster by
 * book within the grid; each tile names its source book.
 */
export function CategoryRail({ category }: { category: CatalogCategory }) {
  return (
    <section className={styles.rail} id={category.id}>
      <div className={`wrap ${styles.head}`}>
        <div className={styles.heading}>
          <h2 className={styles.title}>{category.title}</h2>
        </div>
        <span className={styles.count}>{category.albums.length} albums</span>
      </div>

      <div className={`wrap ${styles.grid}`}>
        {category.albums.map((album) => (
          <CatalogAlbumTile key={album.code} album={album} />
        ))}
      </div>
    </section>
  );
}
