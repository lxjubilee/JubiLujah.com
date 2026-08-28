'use client';

/**
 * Read-aloud.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * INTEGRATION POINT FOR THE JUBILEE TEAM
 *
 * When an Article or Album carries an `audioUrl`, that is a pre-rendered read
 * from the Inspire voice pipeline (Zev-led, with rotating Inspire Family
 * presenters). It is handed to the shared audio engine and plays like any other
 * track — one transport, one now-playing bar.
 *
 * When `audioUrl` is null, we fall back to the browser's own speech synthesis so
 * the feature is never simply missing. It is not the Inspire voice and does not
 * pretend to be; the button says which one you are hearing.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudio } from '@/components/torahsings/audio/AudioProvider';
import type { Block } from '@/lib/torahsings/types';

export type ReadAloudState = 'idle' | 'speaking' | 'unsupported';

export type ReadAloudVoice = 'inspire' | 'browser';

interface UseReadAloudArgs {
  /** Stable id for the piece being read, e.g. "article:the-seventh-thing". */
  id: string;
  blocks: Block[];
  /** The Inspire presenter credited with the read. */
  presenter: string;
  /** Pre-rendered Inspire-voice audio. Null falls back to the browser voice. */
  audioUrl: string | null;
}

interface UseReadAloudResult {
  state: ReadAloudState;
  /** Which voice will actually be heard. */
  voice: ReadAloudVoice;
  toggle: () => void;
  stop: () => void;
}

/** Chrome truncates long utterances. Break the body into speakable pieces. */
function toUtteranceChunks(blocks: Block[]): string[] {
  const chunks: string[] = [];

  for (const block of blocks) {
    const text = block.type === 'quote' ? `${block.text} — ${block.cite}` : block.text;

    // Split on sentence ends, then recombine up to a safe length.
    const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
    let buffer = '';
    for (const sentence of sentences) {
      if ((buffer + sentence).length > 200 && buffer) {
        chunks.push(buffer.trim());
        buffer = sentence;
      } else {
        buffer += sentence;
      }
    }
    if (buffer.trim()) chunks.push(buffer.trim());
  }

  return chunks.filter(Boolean);
}

export function useReadAloud({ id, blocks, presenter, audioUrl }: UseReadAloudArgs): UseReadAloudResult {
  const audio = useAudio();
  const [mounted, setMounted] = useState(false);
  const [supported, setSupported] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const cancelledRef = useRef(false);

  // Probed after mount. Until then we assume support, so the server and the
  // first client render agree — otherwise the button flickers through a
  // disabled state on every page load.
  useEffect(() => {
    setMounted(true);
    setSupported('speechSynthesis' in window);
  }, []);

  const usingInspireVoice = Boolean(audioUrl);
  const readAloudId = `read:${id}`;

  const stopBrowserVoice = useCallback(() => {
    cancelledRef.current = true;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  // Never leave a voice talking into an empty room.
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  const speakWithBrowser = useCallback(() => {
    const synth = window.speechSynthesis;
    synth.cancel();
    cancelledRef.current = false;

    const chunks = toUtteranceChunks(blocks);
    if (chunks.length === 0) return;

    let index = 0;

    const speakNext = () => {
      if (cancelledRef.current || index >= chunks.length) {
        setSpeaking(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index++]);
      utterance.lang = 'en-US';
      utterance.rate = 0.92; // measured, unhurried
      utterance.pitch = 0.95;
      utterance.onend = speakNext;
      utterance.onerror = () => setSpeaking(false);
      synth.speak(utterance);
    };

    setSpeaking(true);
    speakNext();
  }, [blocks]);

  const toggle = useCallback(() => {
    if (usingInspireVoice && audioUrl) {
      audio.toggle({
        id: readAloudId,
        title: 'Read aloud',
        subtitle: presenter,
        src: audioUrl,
        seed: readAloudId,
      });
      return;
    }

    if (!supported) return;
    if (speaking) stopBrowserVoice();
    else speakWithBrowser();
  }, [
    usingInspireVoice,
    audioUrl,
    audio,
    readAloudId,
    presenter,
    supported,
    speaking,
    stopBrowserVoice,
    speakWithBrowser,
  ]);

  const stop = useCallback(() => {
    if (usingInspireVoice) audio.pause();
    else stopBrowserVoice();
  }, [usingInspireVoice, audio, stopBrowserVoice]);

  let state: ReadAloudState;
  if (usingInspireVoice) {
    state = audio.isCurrent(readAloudId) && audio.playing ? 'speaking' : 'idle';
  } else if (mounted && !supported) {
    state = 'unsupported';
  } else {
    state = speaking ? 'speaking' : 'idle';
  }

  return { state, voice: usingInspireVoice ? 'inspire' : 'browser', toggle, stop };
}
