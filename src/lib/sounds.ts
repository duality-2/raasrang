/**
 * Web Audio API sound synthesis for entry scanner.
 * No audio files — all sounds generated programmatically.
 *
 * PASS:   Bright rising two-note chime (C5 → E5), sine wave
 * REJECT: Low harsh double buzz (A2), square wave
 */

/** Sound type discriminator */
export type ScanSound = 'pass' | 'reject';

/** Mute state key for localStorage */
export const MUTE_STORAGE_KEY = 'raasrang_scanner_muted';

/**
 * Play the PASS chime: rising C5 → E5 sine tones.
 * ~300ms total. Loud and bright.
 */
export function playPassSound(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.6, now);
  masterGain.connect(ctx.destination);

  // Note 1: C5 (523 Hz), 150ms
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(523.25, now);
  gain1.gain.setValueAtTime(0.8, now);
  gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
  osc1.connect(gain1);
  gain1.connect(masterGain);
  osc1.start(now);
  osc1.stop(now + 0.2);

  // Note 2: E5 (659 Hz), 150ms, starts at 120ms for slight overlap
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(659.25, now + 0.12);
  gain2.gain.setValueAtTime(0, now);
  gain2.gain.setValueAtTime(0.9, now + 0.12);
  gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
  osc2.connect(gain2);
  gain2.connect(masterGain);
  osc2.start(now + 0.12);
  osc2.stop(now + 0.4);

  // Harmonic: G5 (783 Hz) very soft for brightness
  const osc3 = ctx.createOscillator();
  const gain3 = ctx.createGain();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(783.99, now + 0.12);
  gain3.gain.setValueAtTime(0, now);
  gain3.gain.setValueAtTime(0.25, now + 0.12);
  gain3.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
  osc3.connect(gain3);
  gain3.connect(masterGain);
  osc3.start(now + 0.12);
  osc3.stop(now + 0.4);
}

/**
 * Play the REJECT buzz: low A2 square wave, double pulse.
 * ~500ms total. Harsh and unmistakable.
 */
export function playRejectSound(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.7, now);
  masterGain.connect(ctx.destination);

  // Buzz 1: A2 (110 Hz) square wave, 200ms
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'square';
  osc1.frequency.setValueAtTime(110, now);
  gain1.gain.setValueAtTime(0.8, now);
  gain1.gain.setValueAtTime(0, now + 0.2);
  osc1.connect(gain1);
  gain1.connect(masterGain);
  osc1.start(now);
  osc1.stop(now + 0.22);

  // Gap: 100ms silence

  // Buzz 2: A2 (110 Hz) square wave, 200ms
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'square';
  osc2.frequency.setValueAtTime(110, now + 0.3);
  gain2.gain.setValueAtTime(0, now);
  gain2.gain.setValueAtTime(0.8, now + 0.3);
  gain2.gain.setValueAtTime(0, now + 0.5);
  osc2.connect(gain2);
  gain2.connect(masterGain);
  osc2.start(now + 0.3);
  osc2.stop(now + 0.52);

  // Sub-harmonic rumble for intensity
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'square';
  sub.frequency.setValueAtTime(55, now);
  subGain.gain.setValueAtTime(0.3, now);
  subGain.gain.setValueAtTime(0, now + 0.2);
  subGain.gain.setValueAtTime(0.3, now + 0.3);
  subGain.gain.setValueAtTime(0, now + 0.5);
  sub.connect(subGain);
  subGain.connect(masterGain);
  sub.start(now);
  sub.stop(now + 0.52);
}

/**
 * Play the correct sound based on the admission/redemption status.
 * Only VALID and ADMIT_N get the pass sound; everything else gets reject.
 */
export function playScanSound(ctx: AudioContext, status: string): void {
  if (status === 'VALID' || status === 'ADMIT_N') {
    playPassSound(ctx);
  } else {
    playRejectSound(ctx);
  }
}

/**
 * Check if the scanner is muted (from localStorage).
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
