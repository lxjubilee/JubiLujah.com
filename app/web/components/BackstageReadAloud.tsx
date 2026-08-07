'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Read Aloud — a self-contained text-to-speech widget for the article sidebar,
// built on the browser's Web Speech API (SpeechSynthesis). No backend: the
// article text is spoken client-side. Mirrors JubileeVerse's Read Aloud widget
// — play/pause, stop, a 1×/1.5×/2× speed cycle, a female/male voice toggle, a
// seekable progress bar, an elapsed/duration readout, and word-by-word
// highlighting that follows along in the article body.
//
// The body is spoken in short sentence-sized segments queued back to back: a
// single long utterance is silently cut off after ~15s in Chromium, so chunking
// is what actually lets a full article play through.
//
// Highlighting: on mount every word in `.bsa-body` is wrapped in a `.tts-word`
// span. While speaking, the active word gets `.tts-word-active` — driven by the
// utterance's `onboundary` events where the engine reports them (exact, no
// drift), and by a time-based estimate as a fallback for engines that stay
// silent. Clicking any word starts reading from there.

const SPEEDS = [1, 1.5, 2];
const WPM = 165; // words/min at rate 1× — used only to estimate total duration

type Gender = 'female' | 'male';
interface Seg {
  text: string;
  words: { i: number; start: number }[]; // global word index + char offset in `text`
}

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Wrap every word of `root` in a `.tts-word` span, preserving inline markup
 *  (bold/italic live in their own text nodes, so they wrap cleanly). Returns the
 *  span elements in document order. Idempotent via a data flag. */
function wrapWords(root: HTMLElement): HTMLElement[] {
  if (root.dataset.ttsWrapped) {
    return Array.from(root.querySelectorAll<HTMLElement>('.tts-word'));
  }
  // Undo any pre-existing word spans first (e.g. restored HTML that had been
  // wrapped before) so re-wrapping never nests spans and doubles the count.
  const existing = root.querySelectorAll<HTMLElement>('.tts-word');
  if (existing.length) {
    existing.forEach((s) => s.replaceWith(document.createTextNode(s.textContent || '')));
    root.normalize();
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if ((n as Text).nodeValue && (n as Text).nodeValue!.trim()) textNodes.push(n as Text);
  }
  const els: HTMLElement[] = [];
  for (const tn of textNodes) {
    const parts = tn.nodeValue!.split(/(\s+)/);
    const frag = document.createDocumentFragment();
    for (const part of parts) {
      if (part && part.trim()) {
        const span = document.createElement('span');
        span.className = 'tts-word';
        span.dataset.i = String(els.length);
        span.textContent = part;
        frag.appendChild(span);
        els.push(span);
      } else if (part) {
        frag.appendChild(document.createTextNode(part));
      }
    }
    tn.parentNode!.replaceChild(frag, tn);
  }
  root.dataset.ttsWrapped = '1';
  return els;
}

/** Group word strings into ≥~180-char segments, tracking each word's global
 *  index and char offset within its segment. Also fills `wordToSeg`. */
function buildSegments(words: string[], wordToSeg: number[]): Seg[] {
  const segs: Seg[] = [];
  let cur: Seg = { text: '', words: [] };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const start = cur.text ? cur.text.length + 1 : 0;
    cur.text = cur.text ? `${cur.text} ${w}` : w;
    cur.words.push({ i, start });
    wordToSeg[i] = segs.length;
    if (cur.text.length >= 180) {
      segs.push(cur);
      cur = { text: '', words: [] };
    }
  }
  if (cur.text.trim()) segs.push(cur);
  else if (segs.length === 0) segs.push({ text: words.join(' '), words: words.map((_, i) => ({ i, start: 0 })) });
  return segs;
}

function pickVoice(voices: SpeechSynthesisVoice[], gender: Gender): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const en = voices.filter((v) => /^en[-_]?/i.test(v.lang));
  const pool = en.length ? en : voices;
  const female = /(female|woman|zira|samantha|susan|karen|moira|tessa|fiona|serena|victoria|allison|ava|joanna|salli|kimberly|amy|emma|hazel|google us english)/i;
  const male = /(male|man|david|mark|daniel|alex|fred|guy|tom|george|james|arthur|matthew|google uk english male)/i;
  const want = gender === 'female' ? female : male;
  const avoid = gender === 'female' ? male : female;
  return pool.find((v) => want.test(v.name)) || pool.find((v) => !avoid.test(v.name)) || pool[0] || null;
}

export default function BackstageReadAloud({ text }: { text: string }) {
  const [supported, setSupported] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [gender, setGender] = useState<Gender>('female');
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);

  const segsRef = useRef<Seg[]>([]);
  const wordElsRef = useRef<HTMLElement[]>([]);
  const wordToSegRef = useRef<number[]>([]);
  const totalWordsRef = useRef(1);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const segIdxRef = useRef(0);
  const sessionRef = useRef(0);
  const speedIdxRef = useRef(0);
  const genderRef = useRef<Gender>('female');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);
  const elapsedRef = useRef(0);
  const boundaryFiredRef = useRef(false);
  const activeElRef = useRef<HTMLElement | null>(null);
  const activeIdxRef = useRef(-1);

  const baseDuration = useCallback(() => (totalWordsRef.current / WPM) * 60, []);

  // ---- Highlighting -------------------------------------------------------
  const highlightWord = useCallback((wi: number) => {
    if (wi === activeIdxRef.current) return;
    const els = wordElsRef.current;
    if (wi < 0 || wi >= els.length) return;
    if (activeElRef.current) activeElRef.current.classList.remove('tts-word-active');
    const el = els[wi];
    el.classList.add('tts-word-active');
    activeElRef.current = el;
    activeIdxRef.current = wi;
    const r = el.getBoundingClientRect();
    if (r.bottom < 90 || r.top > window.innerHeight - 90) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, []);

  const clearHighlight = useCallback(() => {
    if (activeElRef.current) activeElRef.current.classList.remove('tts-word-active');
    activeElRef.current = null;
    activeIdxRef.current = -1;
  }, []);

  // ---- Setup: feature-detect, wrap words, build segments, load voices -----
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    setSupported(true);

    const body = document.querySelector<HTMLElement>('.bsa-body');
    let wordStrings: string[];
    if (body) {
      const els = wrapWords(body);
      wordElsRef.current = els;
      wordStrings = els.map((e) => e.textContent || '');
    } else {
      wordElsRef.current = [];
      wordStrings = text.split(/\s+/).filter(Boolean);
    }
    totalWordsRef.current = Math.max(1, wordStrings.length);
    wordToSegRef.current = new Array(wordStrings.length);
    segsRef.current = buildSegments(wordStrings, wordToSegRef.current);

    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    // Click a word to start reading from there.
    const onWordClick = (e: MouseEvent) => {
      const span = (e.target as HTMLElement)?.closest?.('.tts-word') as HTMLElement | null;
      if (!span || span.dataset.i === undefined) return;
      seekToWordRef.current(Number(span.dataset.i));
    };
    body?.addEventListener('click', onWordClick);

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
      body?.removeEventListener('click', onWordClick);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [text]);

  // ---- Timer (progress + fallback highlight) ------------------------------
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => {
      const next = Math.min(durationRef.current, elapsedRef.current + 0.25);
      elapsedRef.current = next;
      setElapsed(next);
      setProgress(durationRef.current ? Math.min(100, (next / durationRef.current) * 100) : 0);
      // Fallback highlight only if the engine never reported a word boundary.
      if (!boundaryFiredRef.current && next > 0.8 && durationRef.current) {
        const wi = Math.min(
          totalWordsRef.current - 1,
          Math.floor((next / durationRef.current) * totalWordsRef.current),
        );
        highlightWord(wi);
      }
    }, 250);
  }, [stopTimer, highlightWord]);

  const reset = useCallback(() => {
    stopTimer();
    clearHighlight();
    elapsedRef.current = 0;
    segIdxRef.current = 0;
    setPlaying(false);
    setPaused(false);
    setElapsed(0);
    setProgress(0);
  }, [stopTimer, clearHighlight]);

  // Re-sync to the article body's CURRENT text — fired after the Translate
  // widget swaps in (or restores) content, so Read Aloud reads and highlights
  // whatever language is on screen.
  const reinitFromDom = useCallback(() => {
    sessionRef.current++;
    window.speechSynthesis.cancel();
    reset();
    const body = document.querySelector<HTMLElement>('.bsa-body');
    if (!body) return;
    delete body.dataset.ttsWrapped;
    const els = wrapWords(body);
    wordElsRef.current = els;
    const wordStrings = els.map((e) => e.textContent || '');
    totalWordsRef.current = Math.max(1, wordStrings.length);
    wordToSegRef.current = new Array(wordStrings.length);
    segsRef.current = buildSegments(wordStrings, wordToSegRef.current);
    segIdxRef.current = 0;
    boundaryFiredRef.current = false;
  }, [reset]);

  useEffect(() => {
    const onChanged = () => reinitFromDom();
    document.addEventListener('bsa:bodychanged', onChanged);
    return () => document.removeEventListener('bsa:bodychanged', onChanged);
  }, [reinitFromDom]);

  // ---- Speech queue -------------------------------------------------------
  const speakFrom = useCallback(
    (from: number) => {
      const synth = window.speechSynthesis;
      const mySession = ++sessionRef.current;
      synth.cancel();
      segIdxRef.current = from;

      const speakNext = () => {
        if (sessionRef.current !== mySession) return;
        const segs = segsRef.current;
        const idx = segIdxRef.current;
        if (idx >= segs.length) {
          if (sessionRef.current === mySession) reset();
          return;
        }
        const seg = segs[idx];
        const u = new SpeechSynthesisUtterance(seg.text);
        u.rate = SPEEDS[speedIdxRef.current];
        const v = pickVoice(voicesRef.current, genderRef.current);
        if (v) {
          u.voice = v;
          u.lang = v.lang;
        }
        u.onboundary = (e) => {
          if (sessionRef.current !== mySession) return;
          if (e.name && e.name !== 'word' && e.name !== 'sentence') return;
          boundaryFiredRef.current = true;
          const ci = e.charIndex || 0;
          let wi = seg.words.length ? seg.words[0].i : 0;
          for (const wr of seg.words) {
            if (wr.start <= ci) wi = wr.i;
            else break;
          }
          highlightWord(wi);
        };
        u.onend = () => {
          if (sessionRef.current !== mySession) return;
          segIdxRef.current += 1;
          speakNext();
        };
        u.onerror = () => {
          if (sessionRef.current !== mySession) return;
          segIdxRef.current += 1;
          speakNext();
        };
        synth.speak(u);
      };

      speakNext();
    },
    [reset, highlightWord],
  );

  const play = useCallback(() => {
    if (!supported) return;
    durationRef.current = baseDuration() / SPEEDS[speedIdxRef.current];
    setDuration(durationRef.current);
    boundaryFiredRef.current = false;
    setPlaying(true);
    setPaused(false);
    // Timer first: a synchronously-finishing utterance (engines with no audio
    // sink) must be able to clear this timer via reset() rather than orphan it.
    startTimer();
    speakFrom(segIdxRef.current);
  }, [supported, baseDuration, speakFrom, startTimer]);

  const onPlayPause = useCallback(() => {
    const synth = window.speechSynthesis;
    if (!playing) {
      play();
    } else if (paused) {
      synth.resume();
      setPaused(false);
      startTimer();
    } else {
      synth.pause();
      setPaused(true);
      stopTimer();
    }
  }, [playing, paused, play, startTimer, stopTimer]);

  const onStop = useCallback(() => {
    sessionRef.current++;
    window.speechSynthesis.cancel();
    reset();
  }, [reset]);

  const wordFromRatio = useCallback((ratio: number) => {
    const total = totalWordsRef.current;
    return Math.max(0, Math.min(total - 1, Math.floor(ratio * total)));
  }, []);

  // Seek to a given global word index; restart speech there if currently playing.
  const seekToWord = useCallback(
    (wi: number) => {
      if (!supported) return;
      if (!durationRef.current) durationRef.current = baseDuration() / SPEEDS[speedIdxRef.current];
      const frac = wi / totalWordsRef.current;
      elapsedRef.current = frac * durationRef.current;
      setElapsed(elapsedRef.current);
      setDuration(durationRef.current);
      setProgress(frac * 100);
      highlightWord(wi);
      const segIdx = wordToSegRef.current[wi] ?? 0;
      segIdxRef.current = segIdx;
      if (playing && !paused) {
        boundaryFiredRef.current = false;
        speakFrom(segIdx);
        startTimer();
      }
    },
    [supported, playing, paused, baseDuration, highlightWord, speakFrom, startTimer],
  );
  // Stable ref so the (mount-time) word-click listener always calls the latest.
  const seekToWordRef = useRef(seekToWord);
  useEffect(() => {
    seekToWordRef.current = seekToWord;
  }, [seekToWord]);

  const onCycleSpeed = useCallback(() => {
    const nextIdx = (speedIdxRef.current + 1) % SPEEDS.length;
    speedIdxRef.current = nextIdx;
    setSpeedIdx(nextIdx);
    if (playing && !paused) {
      durationRef.current = baseDuration() / SPEEDS[nextIdx];
      setDuration(durationRef.current);
      elapsedRef.current = (progress / 100) * durationRef.current;
      setElapsed(elapsedRef.current);
      boundaryFiredRef.current = false;
      speakFrom(wordToSegRef.current[wordFromRatio(progress / 100)] ?? segIdxRef.current);
      startTimer();
    }
  }, [playing, paused, progress, baseDuration, speakFrom, startTimer, wordFromRatio]);

  const setVoice = useCallback(
    (g: Gender) => {
      if (g === genderRef.current) return;
      genderRef.current = g;
      setGender(g);
      if (playing && !paused) {
        boundaryFiredRef.current = false;
        speakFrom(wordToSegRef.current[wordFromRatio(progress / 100)] ?? segIdxRef.current);
      }
    },
    [playing, paused, progress, speakFrom, wordFromRatio],
  );

  const onSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seekToWord(wordFromRatio(ratio));
    },
    [seekToWord, wordFromRatio],
  );

  if (!supported) return null;

  const isPlayingNow = playing && !paused;

  return (
    <div className="bsa-widget tts-widget">
      <h2 className="widget-title">
        Read Aloud
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      </h2>

      <div className="tts-controls">
        <button
          type="button"
          className="tts-play-btn"
          onClick={onPlayPause}
          title={isPlayingNow ? 'Pause' : 'Play'}
          aria-label={isPlayingNow ? 'Pause' : 'Play'}
        >
          {isPlayingNow ? (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="6 4 20 12 6 20 6 4" />
            </svg>
          )}
        </button>

        <button type="button" className="tts-stop-btn" onClick={onStop} title="Stop" aria-label="Stop">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
        </button>

        <button type="button" className="tts-speed-btn" onClick={onCycleSpeed} title="Playback speed">
          {SPEEDS[speedIdx]}x
        </button>

        <div className="tts-gender-toggle">
          <button
            type="button"
            className={`tts-gender-btn female-btn${gender === 'female' ? ' active' : ''}`}
            onClick={() => setVoice('female')}
            title="Female voice"
            aria-label="Female voice"
            aria-pressed={gender === 'female'}
          >
            <svg viewBox="0 0 100 120" fill="currentColor" aria-hidden="true">
              <circle cx="50" cy="14" r="10" />
              <path d="M42 26 L42 48 L58 48 L58 26 Z" />
              <path d="M42 28 L26 50 L32 54 L42 38" />
              <path d="M58 28 L74 50 L68 54 L58 38" />
              <path d="M42 48 L26 78 L74 78 L58 48 Z" />
              <path d="M38 78 L36 112 L46 112 L48 78 Z" />
              <path d="M52 78 L54 112 L64 112 L62 78 Z" />
            </svg>
          </button>
          <button
            type="button"
            className={`tts-gender-btn male-btn${gender === 'male' ? ' active' : ''}`}
            onClick={() => setVoice('male')}
            title="Male voice"
            aria-label="Male voice"
            aria-pressed={gender === 'male'}
          >
            <svg viewBox="0 0 100 120" fill="currentColor" aria-hidden="true">
              <circle cx="50" cy="14" r="10" />
              <path d="M36 28 L36 68 L64 68 L64 28 Z" />
              <path d="M36 32 L20 54 L26 58 L40 40" />
              <path d="M64 32 L80 54 L74 58 L60 40" />
              <path d="M36 68 L34 110 L46 110 L48 68 Z" />
              <path d="M52 68 L54 110 L66 110 L64 68 Z" />
            </svg>
          </button>
        </div>
      </div>

      <div
        className="tts-progress-bar"
        onClick={onSeek}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        tabIndex={0}
      >
        <div className="tts-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="tts-time-display">
        <span className="tts-elapsed">{fmtTime(elapsed)}</span>
        <span className="tts-time-sep">/</span>
        <span className="tts-duration">{fmtTime(duration)}</span>
      </div>
    </div>
  );
}
