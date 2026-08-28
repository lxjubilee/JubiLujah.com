/**
 * Read access to the "angels" music catalog.
 *
 * The catalog data itself is auto-generated into `src/content/angels-catalog.ts`;
 * these helpers flatten it and look albums up by their `code`, which is also the
 * `/album/[id]` details-page slug for catalog albums.
 */

import { angelsCatalog } from '@/content/torahsings/angels-catalog';
import type { CatalogAlbum, CatalogCategory } from '@/lib/torahsings/angels';

/** Every catalog album across all divisions, in catalog order. */
export function allCatalogAlbums(): CatalogAlbum[] {
  return angelsCatalog.flatMap((c) => c.albums);
}

/** Album codes, for static generation of the details pages. */
export function allCatalogCodes(): string[] {
  return allCatalogAlbums().map((a) => a.code);
}

/** Look an album up by its code (e.g. "ANSMX01001EN"). */
export function getCatalogAlbum(code: string): CatalogAlbum | undefined {
  return allCatalogAlbums().find((a) => a.code === code);
}

/** The division an album belongs to — for the details-page breadcrumb. */
export function catalogCategoryOf(code: string): CatalogCategory | undefined {
  return angelsCatalog.find((c) => c.albums.some((a) => a.code === code));
}
