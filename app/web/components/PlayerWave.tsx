'use client';
import { useEffect, useRef } from 'react';
import { usePlayer } from '@/stores/player';

// ============================================================================
// THE MUSIC LINE across the footer player (owner, 2026-09-16).
//
// One line, edge to edge, that moves up and down with the music and flows
// through the fivefold colours — purple, crimson, azure, green, gold — changing
// quickly for fast songs and slowly for slow ones. 50% transparent, so the bar
// underneath stays readable; pointer-events none, so every button still works.
// While nothing is playing there is no line at all.
//
// 🔴 WHY IT IS DRIVEN BY THE SONG'S TEMPO AND ENERGY, NOT BY THE AUDIO SAMPLES.
// Reading the actual waveform needs the Web Audio API to analyse the <audio>
// element, and a browser returns silence for that unless the media host sends
// Access-Control-Allow-Origin — which the music CDN (cd.jubilujah.com) does not
// (see FooterPlayer.tsx, the note on the <audio> tag; setting crossOrigin makes
// the browser refuse to play the file at all). So the line is shaped from each
// song's own measured character in public/music/track-metadata.json: its tempo
// sets the pulse and how fast the colours flow, its energy sets how tall the
// line moves. When the CDN sends CORS, an AnalyserNode can replace `sample()`
// below without changing anything else.
// ============================================================================

const FIVEFOLD: [number, number, number][] = [
  [139, 92, 246],   // purple
  [220, 20, 60],    // crimson
  [61, 165, 255],   // azure
  [34, 197, 94],    // green
  [245, 184, 46],   // gold
];

interface Meta { energy: number; tempo: number }
let metaPromise: Promise<Record<string, Meta>> | null = null;
function loadMeta(): Promise<Record<string, Meta>> {
  // Fetched once, on the first song, never on page load: the file is ~700 KB.
  if (!metaPromise) {
    metaPromise = fetch('/music/track-metadata.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { tracks?: Record<string, Meta> } | null) => (d && d.tracks) || {})
      .catch(() => ({}));
  }
  return metaPromise;
}

function lerpColour(t: number): string {
  const n = FIVEFOLD.length;
  const x = ((t % n) + n) % n;
  const i = Math.floor(x);
  const f = x - i;
  const a = FIVEFOLD[i];
  const b = FIVEFOLD[(i + 1) % n];
  // Smoothstep, so each colour lingers before it flows into the next.
  const s = f * f * (3 - 2 * f);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * s)},${Math.round(a[1] + (b[1] - a[1]) * s)},${Math.round(a[2] + (b[2] - a[2]) * s)})`;
}

export default function PlayerWave() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const songId = usePlayer((s) => s.nowPlaying?.songId);
  const metaRef = useRef<Meta>({ energy: 60, tempo: 100 });

  // The song's character, looked up when the song changes.
  useEffect(() => {
    metaRef.current = { energy: 60, tempo: 100 };
    if (!songId) return;
    let live = true;
    loadMeta().then((all) => {
      const m = all[songId];
      if (live && m && m.tempo) metaRef.current = { energy: m.energy ?? 60, tempo: m.tempo };
    });
    return () => { live = false; };
  }, [songId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    };

    // No music: no line. Clear and stop.
    if (!isPlaying) {
      const { w, h } = size();
      ctx.clearRect(0, 0, w, h);
      return;
    }

    let reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }

    let raf = 0;
    const t0 = performance.now();
    let colourPhase = Math.random() * FIVEFOLD.length;
    let last = t0;

    const frame = (now: number) => {
      const { w, h } = size();
      const dt = (now - last) / 1000;
      last = now;
      const t = (now - t0) / 1000;
      const { energy, tempo } = metaRef.current;
      const beatHz = Math.max(0.6, Math.min(3.2, tempo / 60));

      // COLOUR FLOW: one colour every eight beats. A 140 bpm song changes about
      // every 3.4 s, a 70 bpm song every 6.9 s.
      colourPhase += (dt * beatHz) / 8;

      // HEIGHT: energy sets how far the line travels; each beat lifts it and it
      // settles back, which is what makes it read as moving with the music.
      const beat = Math.pow(Math.abs(Math.sin(Math.PI * t * beatHz)), 3);
      const amp = h * (0.12 + 0.28 * (energy / 100)) * (0.45 + 0.55 * beat) * (reduce ? 0.35 : 1);
      const mid = h / 2;

      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      const step = 4;
      for (let x = 0; x <= w + step; x += step) {
        const u = x / w;
        // Three travelling waves at different lengths and speeds, so the line is
        // never a plain sine; the edges taper so it never touches the bar's rim.
        const y =
          Math.sin(u * 14 + t * beatHz * 2.1) * 0.55 +
          Math.sin(u * 31 - t * beatHz * 3.3) * 0.28 +
          Math.sin(u * 5.5 + t * 0.9) * 0.17;
        const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
        const py = mid + y * amp * (0.35 + 0.65 * taper);
        if (x === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py);
      }
      const colour = lerpColour(colourPhase);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.shadowColor = colour;
      ctx.shadowBlur = 10;
      ctx.stroke();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  return <canvas ref={canvasRef} className="jv-wave" aria-hidden="true" />;
}
