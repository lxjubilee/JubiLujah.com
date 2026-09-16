'use client';
import { useEffect, useRef } from 'react';
import { usePlayer } from '@/stores/player';

// ============================================================================
// THE MUSIC LINE across the footer player.
//
// 2026-09-16 (first cut): one solid line, edge to edge, moving with the music
// and flowing through the fivefold colours.
//
// 2026-09-16 (owner, same day, supersedes the look): the line sits BEHIND
// everything in the bar (cover, text, buttons; only the bar's own background is
// further back), and it is no longer solid. It dissolves into thousands of small
// sparks of different sizes and shapes that ride the line, and on the beat it
// bursts like fireworks, "because it is Jubilee, and that is celebration."
// One colour for now: bright yellow gold. While nothing is playing there are no
// sparks; on pause the ones in the air finish falling and the bar goes quiet.
//
// 🔴 WHY IT IS DRIVEN BY THE SONG'S TEMPO AND ENERGY, NOT BY THE AUDIO SAMPLES.
// Reading the actual waveform needs the Web Audio API to analyse the <audio>
// element, and a browser returns silence for that unless the media host sends
// Access-Control-Allow-Origin, which the music CDN (cd.jubilujah.com) does not
// (see FooterPlayer.tsx, the note on the <audio> tag; setting crossOrigin makes
// the browser refuse to play the file at all). So the motion is shaped from each
// song's own measured character in public/music/track-metadata.json: its tempo
// sets the beat the bursts land on, its energy sets how tall the line moves and
// how many sparks fly. When the CDN sends CORS, an AnalyserNode can drive `beat`
// and `amp` below without changing anything else.
// ============================================================================

// Bright yellow gold, in a few shades so the sparks shimmer instead of reading
// as one flat colour. [r, g, b]
const GOLD: [number, number, number][] = [
  [255, 215, 64],
  [255, 199, 44],
  [255, 232, 140],
  [245, 184, 46],
  [255, 244, 190],
];

// Every shade at 20 opacity steps, built once, so thousands of sparks a frame
// never build a colour string.
const LEVELS = 20;
const STYLES = GOLD.map(([r, g, b]) =>
  Array.from({ length: LEVELS }, (_, l) => `rgba(${r},${g},${b},${((l + 0.5) / LEVELS).toFixed(3)})`));

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

// Spark shapes: a round dot, a square fleck, a streak drawn along its motion,
// and a four-point twinkle.
const DOT = 0, FLECK = 1, STREAK = 2, TWINKLE = 3;

// A fixed pool in flat typed arrays: thousands of sparks a frame without
// creating a single object.
const MAX = 4000;

export default function PlayerWave() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const songId = usePlayer((s) => s.nowPlaying?.songId);
  const metaRef = useRef<Meta>({ energy: 60, tempo: 100 });
  const playingRef = useRef(isPlaying);
  const kickRef = useRef<(() => void) | null>(null);

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
    playingRef.current = isPlaying;
    if (isPlaying) kickRef.current?.();
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }

    const px = new Float32Array(MAX), py = new Float32Array(MAX);
    const vx = new Float32Array(MAX), vy = new Float32Array(MAX);
    const life = new Float32Array(MAX), ttl = new Float32Array(MAX);
    const sz = new Float32Array(MAX), drag = new Float32Array(MAX), grav = new Float32Array(MAX);
    const shape = new Uint8Array(MAX), tone = new Uint8Array(MAX);
    let count = 0;

    const spawn = (x: number, y: number, vxx: number, vyy: number, t: number, s: number, sh: number, g: number, d: number) => {
      if (count >= MAX) return;
      const i = count++;
      px[i] = x; py[i] = y; vx[i] = vxx; vy[i] = vyy;
      life[i] = 0; ttl[i] = t; sz[i] = s; shape[i] = sh; grav[i] = g; drag[i] = d;
      tone[i] = (Math.random() * GOLD.length) | 0;
    };

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

    let raf = 0;
    let running = false;
    let t0 = performance.now();
    let last = t0;
    let lastBeat = -1;
    let carry = 0;

    // Where the line is at horizontal fraction u, as an offset from the middle.
    const spine = (u: number, t: number, beatHz: number) =>
      Math.sin(u * 14 + t * beatHz * 2.1) * 0.55 +
      Math.sin(u * 31 - t * beatHz * 3.3) * 0.28 +
      Math.sin(u * 5.5 + t * 0.9) * 0.17;

    // A firework: a ring of sparks thrown out from one point on the line.
    const burst = (x: number, y: number, power: number, h: number) => {
      const n = Math.round((reduce ? 18 : 120) * power);
      const speed = h * (1.6 + 1.8 * power);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + Math.random() * 0.3;
        const v = speed * (0.35 + Math.random() * 0.75);
        const r = Math.random();
        const sh = r < 0.45 ? STREAK : r < 0.7 ? DOT : r < 0.88 ? FLECK : TWINKLE;
        spawn(x, y, Math.cos(a) * v * 1.6, Math.sin(a) * v, 0.55 + Math.random() * 0.9,
          0.8 + Math.random() * 2.2, sh, h * 0.9, 1.6 + Math.random() * 1.2);
      }
    };

    const frame = (now: number) => {
      const { w, h } = size();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      const playing = playingRef.current;
      const { energy, tempo } = metaRef.current;
      const beatHz = Math.max(0.6, Math.min(3.2, tempo / 60));
      const e = Math.max(0.15, Math.min(1, energy / 100));

      const beatPos = t * beatHz;
      const beat = Math.pow(Math.abs(Math.sin(Math.PI * beatPos)), 3);
      const amp = h * (0.12 + 0.26 * e) * (0.45 + 0.55 * beat) * (reduce ? 0.35 : 1);
      const mid = h / 2;

      if (playing && w > 0) {
        // THE DISSOLVING LINE: sparks shed continuously along the moving line,
        // denser on the beat and in louder songs; each drifts a little off it.
        const rate = (reduce ? 120 : 900 + 1500 * e) * (0.55 + 0.45 * beat);
        carry += rate * dt;
        while (carry >= 1) {
          carry -= 1;
          const u = Math.random();
          const taper = Math.sin(Math.PI * u);
          const x = u * w;
          const y = mid + spine(u, t, beatHz) * amp * (0.35 + 0.65 * taper);
          const r = Math.random();
          const sh = r < 0.62 ? DOT : r < 0.84 ? FLECK : r < 0.95 ? STREAK : TWINKLE;
          spawn(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 36 - 6,
            0.35 + Math.random() * 0.8, 0.5 + Math.random() * 1.9, sh, 14, 2.2);
        }
        // FIREWORKS ON THE BEAT: a burst each beat, a bigger double burst on the
        // first beat of every bar of four.
        const whole = Math.floor(beatPos);
        if (whole !== lastBeat) {
          if (lastBeat >= 0) {
            const down = whole % 4 === 0;
            const shots = down ? 2 : 1;
            for (let s = 0; s < shots; s++) {
              const u = 0.08 + Math.random() * 0.84;
              const y = mid + spine(u, t, beatHz) * amp * (0.35 + 0.65 * Math.sin(Math.PI * u));
              burst(u * w, y, (down ? 1 : 0.55) * (0.5 + 0.5 * e), h);
            }
          }
          lastBeat = whole;
        }
      }

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      let j = 0;
      for (let i = 0; i < count; i++) {
        life[i] += dt;
        if (life[i] >= ttl[i] || px[i] < -10 || px[i] > w + 10) continue;
        const k = Math.exp(-drag[i] * dt);
        vx[i] *= k; vy[i] = vy[i] * k + grav[i] * dt;
        px[i] += vx[i] * dt; py[i] += vy[i] * dt;

        const f = life[i] / ttl[i];
        // Flash in, then fade; a little flicker so the field twinkles.
        const alpha = Math.min(1, f * 8) * (1 - f) * (0.75 + 0.25 * Math.random());
        ctx.fillStyle = ctx.strokeStyle = STYLES[tone[i]][Math.min(LEVELS - 1, (alpha * LEVELS) | 0)];
        const s = sz[i] * (1 - f * 0.5);
        switch (shape[i]) {
          case DOT:
            ctx.beginPath(); ctx.arc(px[i], py[i], s, 0, Math.PI * 2); ctx.fill();
            break;
          case FLECK:
            ctx.fillRect(px[i] - s * 0.7, py[i] - s * 0.7, s * 1.4, s * 1.4);
            break;
          case STREAK: {
            const len = Math.min(14, Math.hypot(vx[i], vy[i]) * 0.035 + s);
            const sp = Math.hypot(vx[i], vy[i]) || 1;
            ctx.lineWidth = Math.max(0.6, s * 0.6);
            ctx.beginPath();
            ctx.moveTo(px[i], py[i]);
            ctx.lineTo(px[i] - (vx[i] / sp) * len, py[i] - (vy[i] / sp) * len);
            ctx.stroke();
            break;
          }
          default: {
            const r = s * 1.8;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(px[i] - r, py[i]); ctx.lineTo(px[i] + r, py[i]);
            ctx.moveTo(px[i], py[i] - r); ctx.lineTo(px[i], py[i] + r);
            ctx.stroke();
          }
        }

        // Keep the live ones packed at the front of the pool.
        if (j !== i) {
          px[j] = px[i]; py[j] = py[i]; vx[j] = vx[i]; vy[j] = vy[i];
          life[j] = life[i]; ttl[j] = ttl[i]; sz[j] = sz[i]; drag[j] = drag[i];
          grav[j] = grav[i]; shape[j] = shape[i]; tone[j] = tone[i];
        }
        j++;
      }
      count = j;
      ctx.globalCompositeOperation = 'source-over';

      // Paused and every spark has landed: stop drawing until play resumes.
      if (!playing && count === 0) {
        ctx.clearRect(0, 0, w, h);
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      if (lastBeat < 0) t0 = last;
      raf = requestAnimationFrame(frame);
    };
    kickRef.current = start;
    if (playingRef.current) start();

    return () => { cancelAnimationFrame(raf); running = false; kickRef.current = null; };
  }, []);

  return <canvas ref={canvasRef} className="jv-wave" aria-hidden="true" />;
}
