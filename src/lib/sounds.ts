/**
 * Web Audio API & Sound Synthesis for RAAS RANG Entry Scanner.
 * Features:
 * - Unique "Raas Triumph Chime" for valid admissions (D5 → F#5 → A5 → D6 arpeggio).
 * - Distinct, punchy dual-alert buzzer for rejections.
 * - Automatic iOS/Android AudioContext unlocker and gesture listeners.
 * - Dual-layer playback (synthesized Web Audio + pre-rendered HTML5 WAV fallback).
 * - Native haptic vibration integration.
 */

export type ScanSound = 'pass' | 'reject';

export const MUTE_STORAGE_KEY = 'raasrang_scanner_muted';

let globalAudioCtx: AudioContext | null = null;
let isAudioUnlocked = false;

// Fallback HTML5 Audio elements created lazily in browser
let passFallbackAudio: HTMLAudioElement | null = null;
let rejectFallbackAudio: HTMLAudioElement | null = null;

/**
 * Generate a standalone base64 WAV Data URI in pure JS (zero external requests).
 */
function createWavDataUri(sampleRate: number, samples: Float32Array): string {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + (typeof btoa === 'function' ? btoa(binary) : '');
}

/**
 * Lazily synthesize HTML5 Audio fallback elements for mobile browsers
 * where Web Audio might be suspended or muted by the hardware silent switch.
 */
function initFallbackAudio(): void {
  if (typeof window === 'undefined' || passFallbackAudio) return;

  try {
    const sr = 22050;

    // 1. Synthesize Pass Chime (D5 → F#5 → A5 → D6)
    const durPass = 0.52;
    const passSamples = new Float32Array(Math.floor(sr * durPass));
    const passNotes = [
      { freq: 587.33, start: 0, dur: 0.16 },
      { freq: 739.99, start: 0.08, dur: 0.18 },
      { freq: 880.0, start: 0.16, dur: 0.22 },
      { freq: 1174.66, start: 0.24, dur: 0.28 },
    ];
    passNotes.forEach(({ freq, start, dur }) => {
      const startIdx = Math.floor(start * sr);
      const endIdx = Math.min(passSamples.length, Math.floor((start + dur) * sr));
      for (let i = startIdx; i < endIdx; i++) {
        const t = (i - startIdx) / sr;
        const env = Math.exp(-t * 9);
        const attack = Math.min(1, t / 0.012);
        const wave =
          Math.sin(2 * Math.PI * freq * t) * 0.7 +
          Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.3;
        passSamples[i] += wave * env * attack * 0.42;
      }
    });

    const passUri = createWavDataUri(sr, passSamples);
    passFallbackAudio = new Audio(passUri);
    passFallbackAudio.preload = 'auto';

    // 2. Synthesize Reject Buzzer (dual alert pulses)
    const durReject = 0.44;
    const rejectSamples = new Float32Array(Math.floor(sr * durReject));
    function addRejectPulse(start: number, dur: number, freq1: number, freq2: number) {
      const startIdx = Math.floor(start * sr);
      const endIdx = Math.min(rejectSamples.length, Math.floor((start + dur) * sr));
      for (let i = startIdx; i < endIdx; i++) {
        const t = (i - startIdx) / sr;
        const progress = t / dur;
        const currentFreq = freq1 + (freq2 - freq1) * progress;
        const env = Math.exp(-progress * 4.2);
        const attack = Math.min(1, t / 0.015);
        // Sawtooth harmonics for authoritative warning buzz
        const saw =
          Math.sin(2 * Math.PI * currentFreq * t) +
          0.5 * Math.sin(2 * Math.PI * currentFreq * 2 * t) +
          0.25 * Math.sin(2 * Math.PI * currentFreq * 3 * t);
        rejectSamples[i] += saw * 0.32 * env * attack;
      }
    }
    addRejectPulse(0, 0.16, 196, 175);
    addRejectPulse(0.2, 0.22, 145, 95);

    const rejectUri = createWavDataUri(sr, rejectSamples);
    rejectFallbackAudio = new Audio(rejectUri);
    rejectFallbackAudio.preload = 'auto';
  } catch {
    /* fallback audio creation failed gracefully */
  }
}

/**
 * Get or create the shared AudioContext singleton.
 */
export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  try {
    if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        globalAudioCtx = new AudioCtxClass();
      }
    }

    if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
      globalAudioCtx.resume().catch(() => {});
    }

    return globalAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Permanently unlock the Web Audio hardware on mobile browsers (iOS Safari / Android Chrome).
 * Called on any user gesture (tap, touch, click).
 */
export function unlockAudioSystem(): void {
  if (typeof window === 'undefined') return;

  try {
    initFallbackAudio();

    const ctx = getSharedAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      // Play a silent 1-sample buffer to unlock the hardware session
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);

      if (ctx.state === 'running') {
        isAudioUnlocked = true;
      }
    }

    // Warm up fallback audio elements with 0 volume play/pause
    if (passFallbackAudio) {
      passFallbackAudio.load();
    }
    if (rejectFallbackAudio) {
      rejectFallbackAudio.load();
    }
  } catch {
    /* ignore */
  }
}

export function isAudioSystemUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  return isAudioUnlocked || (!!globalAudioCtx && globalAudioCtx.state === 'running');
}

/**
 * Unique Festival Pass Sound:
 * Joyful, triumphant 4-note ascending arpeggio (D5 → F#5 → A5 → D6) with warm crystalline shimmer.
 */
export function playPassSound(customCtx?: AudioContext | null): void {
  if (isMuted()) return;

  // Mobile haptic vibration
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([60, 40, 90]);
    } catch {
      /* ignore */
    }
  }

  const ctx = customCtx || getSharedAudioContext();
  let webAudioPlayed = false;

  if (ctx) {
    try {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.9, now);
      masterGain.connect(ctx.destination);

      // Arpeggio notes: D5 (587.33), F#5 (739.99), A5 (880), D6 (1174.66)
      const notes = [
        { freq: 587.33, start: 0, dur: 0.16 },
        { freq: 739.99, start: 0.08, dur: 0.18 },
        { freq: 880.0, start: 0.16, dur: 0.2 },
        { freq: 1174.66, start: 0.24, dur: 0.32 },
      ];

      notes.forEach(({ freq, start, dur }) => {
        // Primary Tone (Sine for clarity)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + start);

        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(0.85, now + start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now + start);
        osc.stop(now + start + dur + 0.05);

        // Warm Harmonic (Triangle for presence on loud mobile speakers)
        const harm = ctx.createOscillator();
        const harmGain = ctx.createGain();
        harm.type = 'triangle';
        harm.frequency.setValueAtTime(freq * 0.5, now + start); // sub-octave warmth

        harmGain.gain.setValueAtTime(0, now + start);
        harmGain.gain.linearRampToValueAtTime(0.35, now + start + 0.015);
        harmGain.gain.exponentialRampToValueAtTime(0.001, now + start + dur * 0.85);

        harm.connect(harmGain);
        harmGain.connect(masterGain);

        harm.start(now + start);
        harm.stop(now + start + dur + 0.05);
      });

      webAudioPlayed = true;
    } catch {
      webAudioPlayed = false;
    }
  }

  // If Web Audio was not running or failed, use HTML5 Audio fallback
  if (!webAudioPlayed || (ctx && ctx.state !== 'running')) {
    try {
      initFallbackAudio();
      if (passFallbackAudio) {
        passFallbackAudio.currentTime = 0;
        passFallbackAudio.play().catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Unique Festival Reject Sound:
 * Authoritative dual descending warning alert (Low C#3 → A2).
 */
export function playRejectSound(customCtx?: AudioContext | null): void {
  if (isMuted()) return;

  // Mobile double-buzz haptics
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([160, 80, 220]);
    } catch {
      /* ignore */
    }
  }

  const ctx = customCtx || getSharedAudioContext();
  let webAudioPlayed = false;

  if (ctx) {
    try {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.95, now);
      masterGain.connect(ctx.destination);

      // Two punchy descending pulses
      const pulses = [
        { startFreq: 155, endFreq: 110, start: 0, dur: 0.18 },
        { startFreq: 145, endFreq: 95, start: 0.24, dur: 0.22 },
      ];

      pulses.forEach(({ startFreq, endFreq, start, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';

        osc.frequency.setValueAtTime(startFreq, now + start);
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + start + dur);

        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(0.85, now + start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

        // Lowpass filter to give thick punch
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(650, now + start);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc.start(now + start);
        osc.stop(now + start + dur + 0.05);
      });

      webAudioPlayed = true;
    } catch {
      webAudioPlayed = false;
    }
  }

  // Fallback to HTML5 Audio element if Web Audio was not running or failed
  if (!webAudioPlayed || (ctx && ctx.state !== 'running')) {
    try {
      initFallbackAudio();
      if (rejectFallbackAudio) {
        rejectFallbackAudio.currentTime = 0;
        rejectFallbackAudio.play().catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Play scan sound by status.
 */
export function playScanSound(ctx: AudioContext | null, status: string): void {
  if (status === 'VALID' || status === 'ADMIT_N') {
    playPassSound(ctx);
  } else {
    playRejectSound(ctx);
  }
}

/**
 * Check if the scanner is muted.
 */
export function isMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
}

/**
 * Set mute state in localStorage.
 */
export function setMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MUTE_STORAGE_KEY, muted ? 'true' : 'false');
}
