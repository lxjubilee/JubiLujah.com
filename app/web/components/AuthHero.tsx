'use client';
// ============================================================================
// Auth hero slideshow (sign in / sign up / forgot / reset right-hand panel).
// Auto-advances through a set of background images with a smooth cross-fade +
// slow Ken-Burns drift. A gradient overlay (.auth-hero::before) sits above the
// images so the scripture quote (passed as children) always stays legible.
// ============================================================================
import { useEffect, useState } from 'react';

// Images live in /public/images/slider. Add more "HappyPeopleN.jpg" files and
// they slot straight in here.
const DEFAULT_SLIDES = [
  '/images/slider/HappyPeople1.jpg',
  '/images/slider/HappyPeople2.jpg',
  '/images/slider/HappyPeople3.jpg',
  '/images/slider/HappyPeople4.jpg',
  '/images/slider/HappyPeople5.jpg',
  '/images/slider/HappyPeople6.jpg',
];

const INTERVAL_MS = 5500;

export default function AuthHero({
  children,
  images = DEFAULT_SLIDES,
}: {
  children: React.ReactNode;
  images?: string[];
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = images.length;

  // Auto-advance, paused on hover so a reader isn't rushed.
  useEffect(() => {
    if (count <= 1 || paused) return;
    const t = setInterval(() => setActive((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearInterval(t);
  }, [count, paused]);

  // Preload neighbours so the cross-fade never flashes an unloaded image.
  useEffect(() => {
    images.forEach((src) => { const im = new Image(); im.src = src; });
  }, [images]);

  return (
    <div
      className="auth-hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="auth-hero-slides" aria-hidden="true">
        {images.map((src, i) => (
          <div
            key={src}
            className={`auth-hero-slide${i === active ? ' is-active' : ''}`}
            style={{ backgroundImage: `url('${src}')` }}
          />
        ))}
      </div>

      {children}

      {count > 1 && (
        <div className="auth-hero-dots">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              className={`auth-hero-dot${i === active ? ' is-active' : ''}`}
              aria-label={`Show slide ${i + 1}`}
              aria-current={i === active}
              onClick={() => setActive(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
