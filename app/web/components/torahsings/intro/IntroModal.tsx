'use client';

import { useEffect, useRef } from 'react';
import { CelestialArt } from '@/components/torahsings/system/CelestialArt';
import { Eyebrow } from '@/components/torahsings/system/Eyebrow';
import { PlayButton } from '@/components/torahsings/system/PlayButton';
import { useIntro } from './IntroProvider';
import styles from './IntroModal.module.css';

/**
 * The 2–3 minute intro video.
 *
 * Drop the finished film at this URL (or point it at the Jubilee CDN) and the
 * placeholder disappears on its own. Until then the modal shows the celestial
 * plate and says plainly that the film is pending, rather than miming a player
 * that plays nothing.
 */
const INTRO_VIDEO_URL: string | null = null;

export function IntroModal() {
  const { open, closeIntro } = useIntro();
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocusTo.current = document.activeElement;
    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeIntro();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (restoreFocusTo.current instanceof HTMLElement) restoreFocusTo.current.focus();
    };
  }, [open, closeIntro]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-headline"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeIntro();
      }}
    >
      <div className={styles.card}>
        <button ref={closeRef} type="button" className={styles.close} onClick={closeIntro} aria-label="Close">
          &#215;
        </button>

        <div className={styles.video}>
          {INTRO_VIDEO_URL ? (
            <video className={styles.videoEl} src={INTRO_VIDEO_URL} controls playsInline preload="metadata" />
          ) : (
            <CelestialArt seed="intro-video" hue={44} topic="the discovery" ratio="16 / 9" glyph="ש">
              <div
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  height: '100%',
                }}
              >
                <PlayButton size={76} label="Intro video — coming soon" disabled />
                <span className={styles.videoNote}>2–3 minute intro · film pending</span>
              </div>
            </CelestialArt>
          )}
        </div>

        <Eyebrow>A secret hidden in the text</Eyebrow>

        <h2 id="intro-headline" className={styles.headline}>
          There are songs inside the Scriptures. Almost no one knows.
        </h2>

        <p className={styles.copy}>
          Not songs about the Scriptures. Songs <em>in</em> them — surfaced from the Paleo-Hebrew itself, read
          symbol by symbol, sung from the perspective of the ones who were already singing when the foundations
          went down. We have been quietly working on this for a long time. It is not theory. The songs exist.
        </p>

        <p className={styles.hush}>Please don&rsquo;t share this. (You will.)</p>

        <div className={styles.actions}>
          <button type="button" className="pill" onClick={closeIntro}>
            Begin the discovery
          </button>
          <button type="button" className="pill pill--ghost" onClick={closeIntro}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
