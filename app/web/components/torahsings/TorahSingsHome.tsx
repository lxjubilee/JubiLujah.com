import { CatalogHero } from '@/components/torahsings/home/CatalogHero';
import { CategoryRail } from '@/components/torahsings/home/CategoryRail';
import { HoverPreviewProvider } from '@/components/torahsings/home/HoverPreview';
import { angelsCatalog } from '@/content/torahsings/angels-catalog';
import styles from './TorahSingsHome.module.css';

/**
 * Home for the Torah Sings tenant: the hero, then one rail per canonical
 * division (Torah · Prophets · Writings · Gospels · Letters · Revelation).
 *
 * This is why lib/tenants.ts grew a `catalog` field. TenantHome — the home the
 * children's tenants use — reads personaRows() off the shared manifest and
 * groups by ARTIST. The 285 ANSMX albums have no artist and are not in that
 * manifest at all; they are grouped by book. Pointing TenantHome at this tenant
 * would render an empty page, exactly as pointing JubileePraise's Home at
 * goPartyGiggles once would have.
 */
export default function TorahSingsHome() {
  return (
    <>
      <CatalogHero />

      <HoverPreviewProvider>
        <div className={styles.browse} id="library">
          {angelsCatalog.map((category) => (
            <CategoryRail key={category.id} category={category} />
          ))}
        </div>
      </HoverPreviewProvider>
    </>
  );
}
