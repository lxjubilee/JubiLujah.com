/**
 * The content registry.
 *
 * Adding a release is adding a file and a line here. Nothing else in the app
 * needs to know it happened: the grids, the routes, the sitemap, and the
 * subscriber unlocks all read from these arrays.
 *
 * When this moves behind a CMS, keep the same three exports and the rest of the
 * codebase will not notice.
 */

import type { Album } from '@/lib/torahsings/types';

import { creation } from './albums/creation';
import { theCovenantPromises } from './albums/the-covenant-promises';
import { theNamesOfElohim } from './albums/the-names-of-elohim';
import { theThroneRoom } from './albums/the-throne-room';
import { wisdomAndTheWord } from './albums/wisdom-and-the-word';
import { theExodusSong } from './albums/the-exodus-song';

export const albums: Album[] = [
  creation,
  theCovenantPromises,
  theNamesOfElohim,
  theThroneRoom,
  wisdomAndTheWord,
  theExodusSong,
];

export { articles } from './articles';
export { lessonAlbums } from './lessons';
