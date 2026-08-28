'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAudio } from '@/components/torahsings/audio/AudioProvider';
import { CelestialArt } from '@/components/torahsings/system/CelestialArt';
import { StarRating } from '@/components/torahsings/system/StarRating';
import { albumPlayables, artUrl, hasAudio, type CatalogAlbum } from '@/lib/torahsings/angels';
import { ApiError } from '@/lib/api';
import { clock } from '@/lib/torahsings/format';
import { albumUuid, songUuid } from '@/lib/ids';
import { useJubileeAccount } from '@/lib/torahsings/jubilee-account';
import { showAuthGate } from '@/lib/torahsings/auth-gate';
import { ensureLikesLoaded, likeKey, resetLikes, toggleLikeStored, useLikedSet } from '@/lib/torahsings/likes';
import {
  batchSummaries,
  summaryKey,
  upsertReview,
  type ReviewSummary,
  type Target,
  type TargetType,
} from '@/lib/reviews';
import { AddToPlaylist } from './AddToPlaylist';
import { SongRating } from './SongRating';
import styles from './CatalogAlbumDetail.module.css';

/**
 * Ratings are real: the album and every track are rated through
 * /api/reviews/:type/:id, and their aggregates come from
 * production.review_summaries (maintained by a DB trigger — nothing is averaged
 * on read). Summaries for the whole page load in ONE batch call, as JubileePraise
 * does, rather than a request per track.
 *
 * The rateable id is derived from the album code (lib/ids.ts) and matches
 * api/src/ids.js exactly, so the catalog never needs to be in the database.
 *
 * Reading is public; writing needs a signed-in Jubilee Account.
 */

/** Lightweight album shape for the side-column lists (no track payload). */
export interface MiniAlbum {
  code: string;
  title: string;
  book: string;
  art: string | null;
  hue: number;
  glyph: string | null;
}

/** Material-style icon paths (24×24). */
const ICON = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  heart: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  heartOutline:
    'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z',
} as const;

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/**
 * The catalog album details page — JubileePraise's three-column album layout
 * (`jv-app-grid`) minus the banner. The center card mirrors JubileePraise's
 * `jv-center` panel: cover + eyebrow · serif title · meta, a ratings box, an
 * action row (big play · add to playlist · follow), then the tracklist.
 *
 * The center column is the only in-flow height; the two side panels stretch to
 * match it and scroll internally.
 */
export function CatalogAlbumDetail({
  album,
  categoryTitle,
  library,
  more,
}: {
  album: CatalogAlbum;
  categoryTitle?: string;
  library: MiniAlbum[];
  more: MiniAlbum[];
}) {
  const { current, playing, toggle, isCurrent } = useAudio();
  const { session, signIn } = useJubileeAccount();
  const playable = hasAudio(album);
  const queue = albumPlayables(album);

  const [following, setFollowing] = useState(false);

  // Account-backed like, from the shared store — stays in sync with the
  // hover-preview thumb and the Liked page. Guests get the global sign-in gate.
  const likedSet = useLikedSet();
  const liked = likedSet.has(likeKey('album', albumUuid(album.code)));

  useEffect(() => {
    if (session) ensureLikesLoaded();
    else resetLikes();
  }, [session]);

  const toggleLike = () => {
    if (!session) {
      showAuthGate();
      return;
    }
    void toggleLikeStored('album', albumUuid(album.code));
  };
  const [added, setAdded] = useState<Set<number>>(new Set());

  // Summaries keyed "album:<uuid>" / "song:<uuid>", loaded in one batch.
  const [summaries, setSummaries] = useState<Record<string, ReviewSummary>>({});
  // `stars` is set when the visitor picked a star inline rather than pressing a
  // "Rate" button — it pre-selects that value in the composer.
  const [rateTarget, setRateTarget] = useState<{
    type: TargetType;
    n: number;
    label: string;
    stars?: number;
  } | null>(null);

  const targets = useMemo<Target[]>(
    () => [
      { type: 'album' as const, id: albumUuid(album.code) },
      ...album.tracks.map((t) => ({ type: 'song' as const, id: songUuid(album.code, t.n) })),
    ],
    [album.code, album.tracks],
  );

  const loadSummaries = useCallback(async () => {
    try {
      const res = await batchSummaries(targets);
      setSummaries(res?.summaries ?? {});
    } catch {
      // Ratings are an enhancement — an unreachable API must not break the page.
      setSummaries({});
    }
  }, [targets]);

  useEffect(() => {
    void loadSummaries();
  }, [loadSummaries]);

  const albumSummary = summaries[summaryKey('album', albumUuid(album.code))] ?? null;
  const songSummary = (n: number) => summaries[summaryKey('song', songUuid(album.code, n))] ?? null;

  /**
   * Writing a rating is requireAuth, so a guest is sent to sign in and returned
   * here rather than shown a dialog that can only 401.
   *
   * `stars` carries the star the visitor actually clicked, so picking 4 stars on
   * a track row opens the composer on 4 instead of making them choose twice.
   */
  const openRate = (type: TargetType, n: number, label: string, stars?: number) => {
    if (!session) {
      signIn();
      return;
    }
    setRateTarget({ type, n, label, stars });
  };

  /** The API returns the recalculated summary, so we patch it in rather than refetch. */
  const onRated = (type: TargetType, n: number, summary: ReviewSummary) => {
    const id = type === 'album' ? albumUuid(album.code) : songUuid(album.code, n);
    setSummaries((prev) => ({ ...prev, [summaryKey(type, id)]: summary }));
    setRateTarget(null);
  };

  const onAlbum = queue.some((q) => isCurrent(q.id));
  const albumPlaying = onAlbum && playing;

  const playFrom = (i: number) => {
    if (queue[i]) toggle(queue[i], queue);
  };
  const playAlbum = () => {
    if (!playable) return;
    if (onAlbum && current) toggle(current, queue);
    else playFrom(0);
  };
  const toggleAdded = (n: number) =>
    setAdded((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(n)) nextSet.delete(n);
      else nextSet.add(n);
      return nextSet;
    });

  const related = more.length ? more : library.filter((a) => a.code !== album.code);

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <Link href="/#library" className={styles.back}>
          &#8592; All albums
        </Link>
      </div>

      <div className={styles.grid}>
        {/* LEFT — library list. Height follows the center column; list scrolls. */}
        <aside className={`${styles.panel} ${styles.side}`}>
          <div className={styles.sideInner}>
            <div className={styles.sideHead}>{categoryTitle ?? 'Library'}</div>
            <div className={styles.sideList}>
              {library.map((item) => (
                <MiniRow key={item.code} item={item} active={item.code === album.code} />
              ))}
            </div>
          </div>
        </aside>

        {/* CENTER — the album card (drives the shared height). */}
        <section className={`${styles.panel} ${styles.center}`}>
          <div className={styles.centerHead}>
            <div className={styles.coverWrap}>
              {album.art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={artUrl(album.art)} alt="" decoding="async" />
              ) : (
                <CelestialArt
                  seed={album.code}
                  hue={album.hue}
                  topic={album.book}
                  glyph={album.glyph}
                  ratio="1 / 1"
                />
              )}
            </div>

            <div className={styles.centerInfo}>
              <div className={styles.eyebrow}>Album</div>
              <h1 className={styles.title}>{album.title}</h1>
              <div className={styles.sub}>
                <span>Sung by the Angels</span>
                <span className={styles.dot}>·</span>
                <span>
                  {playable
                    ? `${album.tracks.length} song${album.tracks.length === 1 ? '' : 's'}`
                    : 'Coming soon'}
                </span>
                <span className={styles.dot}>·</span>
                <span className={styles.genrePill}>{album.book}</span>
                {playable && <span className={styles.hd}>HD</span>}
                {categoryTitle && (
                  <>
                    <span className={styles.dot}>·</span>
                    <span className={styles.secondaryGenre}>{categoryTitle}</span>
                  </>
                )}
              </div>

              <AlbumRating
                summary={albumSummary}
                onRate={(stars) => openRate('album', 0, album.title, stars)}
              />
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.bigplay}
              onClick={playAlbum}
              disabled={!playable}
              aria-label={albumPlaying ? 'Pause album' : 'Play album'}
            >
              <Icon d={albumPlaying ? ICON.pause : ICON.play} />
            </button>

            <AddToPlaylist getSongIds={() => album.tracks.map((t) => songUuid(album.code, t.n))}>
              {(openMenu) => (
                <button type="button" className={styles.addpl} onClick={openMenu}>
                  Add to Playlist
                </button>
              )}
            </AddToPlaylist>

            <button
              type="button"
              className={`${styles.follow} ${liked ? styles.likeOn : ''}`}
              onClick={toggleLike}
              aria-pressed={liked}
              aria-label={liked ? 'Remove from liked' : 'Like this album'}
            >
              <Icon d={liked ? ICON.heart : ICON.heartOutline} />
              {liked ? 'Liked' : 'Like'}
            </button>

            <button
              type="button"
              className={styles.follow}
              onClick={() => setFollowing((f) => !f)}
              aria-pressed={following}
            >
              {following ? 'Following' : 'Follow'}
            </button>
          </div>

          {playable && (
            <div className={styles.tracks}>
              <div className={styles.trackHead}>
                <span>#</span>
                <span>Title</span>
                <span aria-hidden="true" />
                <span className={styles.thDur} aria-hidden="true">
                  🕑
                </span>
              </div>
              <ol className={styles.trackList}>
                {album.tracks.map((t, i) => {
                  const p = queue[i];
                  const active = p ? isCurrent(p.id) : false;
                  return (
                    <li
                      key={t.n}
                      className={`${styles.trackRow} ${active ? styles.playing : ''}`}
                      onClick={() => playFrom(i)}
                      data-active={active ? 'yes' : 'no'}
                    >
                      <span className={styles.tnumWrap}>
                        <span className={styles.tnum}>{t.n}</span>
                        <span className={styles.tplay}>
                          <Icon d={active && playing ? ICON.pause : ICON.play} />
                        </span>
                      </span>
                      <span className={styles.tname}>
                        <span className={styles.ttitle}>{t.title}</span>
                        <SongRating
                          summary={songSummary(t.n)}
                          label={t.title}
                          onRate={(stars) => openRate('song', t.n, t.title, stars)}
                        />
                      </span>
                      <span className={styles.tadd}>
                        <button
                          type="button"
                          className={added.has(t.n) ? styles.tAddOn : ''}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAdded(t.n);
                          }}
                          aria-label={added.has(t.n) ? 'Remove from My List' : 'Add to My List'}
                        >
                          <Icon d={added.has(t.n) ? ICON.check : ICON.add} />
                        </button>
                      </span>
                      <span className={styles.tdur}>{t.secs ? clock(t.secs) : '--:--'}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </section>

        {/* RIGHT — related albums. Also follows the center height and scrolls. */}
        <aside className={`${styles.panel} ${styles.side}`}>
          <div className={styles.sideInner}>
            <div className={styles.sideHead}>
              {more.length ? `More from ${album.book}` : `More in ${categoryTitle ?? 'the catalog'}`}
            </div>
            <div className={styles.sideList}>
              {related.map((item) => (
                <MiniRow key={item.code} item={item} active={false} />
              ))}
            </div>
          </div>
        </aside>
      </div>

      {rateTarget &&
        (() => {
          // The caller's existing review for this target, when they have one — it
          // pre-fills the dialog. `title` must be carried through: dropping it
          // would blank the field and wipe the stored title on the next save.
          const mine = (rateTarget.type === 'album' ? albumSummary : songSummary(rateTarget.n))?.mine ?? null;
          return (
            <RateDialog
              type={rateTarget.type}
              id={rateTarget.type === 'album' ? albumUuid(album.code) : songUuid(album.code, rateTarget.n)}
              label={rateTarget.label}
              initial={{
                // The star just clicked wins over the stored one — that click IS
                // the new choice. Title/body always come from the existing
                // review, per the note above.
                stars: rateTarget.stars ?? mine?.stars ?? 0,
                title: mine?.title ?? null,
                body: mine?.body ?? null,
              }}
              onSaved={(summary) => onRated(rateTarget.type, rateTarget.n, summary)}
              onClose={() => setRateTarget(null)}
            />
          );
        })()}
    </div>
  );
}

/**
 * The rate popup, modelled on JubileePraise's ReviewComposer: one dialog serves both
 * "Rate this Album" and a track's "Rate". Stars are required; the note is
 * optional.
 *
 * Stars are kept (locally); the note is NOT — there is nowhere to store review
 * text until the reviews API is wired, so the dialog says so rather than
 * pretending to file it.
 */
function RateDialog({
  label,
  type,
  id,
  initial,
  onSaved,
  onClose,
}: {
  label: string;
  type: TargetType;
  /** The derived uuid — see lib/ids.ts. */
  id: string;
  initial: { stars: number; title: string | null; body: string | null } | null;
  onSaved: (summary: ReviewSummary) => void;
  onClose: () => void;
}) {
  const [stars, setStars] = useState(initial?.stars ?? 0);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [note, setNote] = useState(initial?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (stars < 1) {
      setErr('Please choose a star rating.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await upsertReview(type, id, {
        stars,
        title: title.trim() || null,
        body: note.trim() || null,
      });
      onSaved(res.summary);
    } catch (e) {
      // 401 => the token expired or they signed out in another tab.
      if (e instanceof ApiError && e.status === 401) {
        setErr('Please sign in again to rate.');
      } else {
        setErr(e instanceof ApiError ? e.message : 'Could not save your rating.');
      }
      setBusy(false);
    }
  };

  // Escape closes, as it does on JubileePraise.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.rateBackdrop} onClick={onClose}>
      <div
        className={styles.rateModal}
        role="dialog"
        aria-modal="true"
        aria-label={`Rate this ${type}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.rateHead}>
          <h3 className={styles.rateTitle}>
            Rate <span className={styles.rateTitleTarget}>{label}</span>
          </h3>
          <button type="button" className={styles.rateX} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Not a <label>: the control is a radiogroup, which a label cannot target. */}
        <div className={styles.rateField}>
          <span className={styles.rateLabel}>
            Your rating <span className={styles.rateReq} aria-hidden="true">*</span>
          </span>
          <div className={styles.rateStars}>
            <StarRating
              value={stars}
              onChange={(n) => {
                setStars(n);
                setErr(null);
              }}
              size="lg"
              ariaLabel={`Your rating for ${label}`}
            />
          </div>
        </div>

        <label className={styles.rateField}>
          <span className={styles.rateLabel}>
            Review title <span className={styles.rateOpt}>(optional)</span>
          </span>
          <input
            type="text"
            className={styles.rateInput}
            maxLength={150}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sum it up in a few words"
          />
        </label>

        <label className={styles.rateField}>
          <span className={styles.rateLabel}>
            Your review <span className={styles.rateOpt}>(optional)</span>
          </span>
          <textarea
            rows={5}
            maxLength={5000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you think of it?"
          />
          {/* Mirrors the API's 5000-char ceiling on `body`. */}
          <span className={styles.rateCount}>{note.length}/5000</span>
        </label>

        {err && <p className={styles.rateErr}>{err}</p>}

        <div className={styles.rateActions}>
          <button type="button" className={styles.rateCancel} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={styles.rateSave} onClick={save} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * JubileePraise's `rv-album-rating` box: the aggregate from review_summaries, this
 * visitor's own stars, and the way into the composer.
 *
 * The stars are the shared StarRating in interactive mode — the same widget the
 * track rows and the dialog use, so hover-preview and click-to-choose behave
 * identically everywhere. Clicking star N opens the composer with N already
 * chosen; it does not save on its own, because a bare stars-only write would
 * blank the title and body of an existing review (see the `mine` note above).
 */
function AlbumRating({
  summary,
  onRate,
}: {
  summary: ReviewSummary | null;
  /** A star click passes the chosen value; the buttons below pass nothing. */
  onRate: (stars?: number) => void;
}) {
  const [showReviews, setShowReviews] = useState(false);

  // The aggregate across everyone; `mine` is this visitor's own stars.
  const average = summary?.average ?? 0;
  const count = summary?.rating_count ?? 0;
  const rating = summary?.mine?.stars ?? 0;

  return (
    <div className={styles.ratingBox}>
      <div className={styles.ratingMain}>
        {/* Resting state shows your own rating when you have one, else the
            aggregate; hovering previews the star under the cursor. */}
        <StarRating
          value={rating || average}
          selected={rating}
          onChange={(n) => onRate(n)}
          size="md"
          ariaLabel="Rate this album"
        />
        <span className={`${styles.ratingNum} ${count ? '' : styles.ratingNumNone}`}>
          {count ? average.toFixed(1) : '—'}
        </span>
        <span className={styles.ratingCount}>
          {count
            ? `${count.toLocaleString()} rating${count === 1 ? '' : 's'}${rating ? ` · yours: ${rating}` : ''}`
            : 'No ratings yet — be the first'}
        </span>
      </div>

      <div className={styles.ratingActions}>
        <button type="button" className={styles.rateBtn} onClick={() => onRate()}>
          {rating ? 'Update rating' : 'Rate this Album'}
        </button>
        <button
          type="button"
          className={styles.reviewsLink}
          onClick={() => setShowReviews((s) => !s)}
        >
          Ratings &amp; Reviews &rarr;
        </button>
      </div>

      {showReviews && <div className={styles.reviewsNote}>No reviews yet — be the first.</div>}
    </div>
  );
}

function MiniRow({ item, active }: { item: MiniAlbum; active: boolean }) {
  return (
    <Link href={`/album/${item.code}`} className={styles.mini} data-active={active ? 'yes' : 'no'}>
      <span className={styles.miniThumb} style={{ backgroundColor: `hsl(${item.hue} 45% 22%)` }}>
        {item.art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artUrl(item.art)} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className={styles.miniGlyph} aria-hidden="true">
            {item.glyph ?? '♪'}
          </span>
        )}
      </span>
      <span className={styles.miniText}>
        <span className={styles.miniTitle}>{item.title}</span>
        <span className={styles.miniSub}>{item.book}</span>
      </span>
    </Link>
  );
}
