// Background music written in code (no files, no licences): a short loopable piece per mood,
// plucked strings (Karplus–Strong), soft bass, light percussion, ended with a fade.
// Kept on its own layer so it can be turned down, swapped for an uploaded track or muted.
import { writeWav } from './sfx.ts';

const RATE = 44100;
export type Mood = 'warm' | 'curious' | 'calm' | 'upbeat';
export const MOODS: Mood[] = ['warm', 'curious', 'calm', 'upbeat'];

function rand(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; }; }
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Plucked string note added into `out` at sample `at`. */
function pluck(out: Float32Array, at: number, f: number, len: number, gain: number, r: () => number, bright = 0.5) {
  const n = Math.max(2, Math.round(RATE / f)), buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = r();
  let idx = 0;
  const end = Math.min(out.length, at + Math.round(len * RATE)), decay = 0.994 + bright * 0.005;
  for (let i = at; i < end; i++) {
    const a = buf[idx], b = buf[(idx + 1) % n];
    const v = (a + b) * 0.5 * decay;
    buf[idx] = v; idx = (idx + 1) % n;
    const fade = Math.min(1, (end - i) / 800);
    out[i] += a * gain * fade;
  }
}
function tone(out: Float32Array, at: number, f: number, len: number, gain: number, attack = 0.01, kind: 'sine' | 'tri' = 'sine') {
  const end = Math.min(out.length, at + Math.round(len * RATE));
  for (let i = at; i < end; i++) {
    const t = (i - at) / RATE, ph = f * t;
    const w = kind === 'sine' ? Math.sin(2 * Math.PI * ph) : 1 - 4 * Math.abs(Math.round(ph - 0.25) - (ph - 0.25));
    const env = Math.min(1, t / attack) * Math.min(1, (end - i) / (RATE * 0.08));
    out[i] += w * gain * env;
  }
}
function noise(out: Float32Array, at: number, len: number, gain: number, r: () => number, hp = 0.6) {
  const end = Math.min(out.length, at + Math.round(len * RATE));
  let lp = 0;
  for (let i = at; i < end; i++) { const x = r(); lp += (1 - hp) * (x - lp); const t = (i - at) / RATE; out[i] += (x - lp) * gain * Math.exp(-t / (len * 0.35)); }
}
function kick(out: Float32Array, at: number, gain: number) {
  const end = Math.min(out.length, at + Math.round(0.25 * RATE));
  for (let i = at; i < end; i++) { const t = (i - at) / RATE; out[i] += Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-t * 30)) * t) * Math.exp(-t * 14) * gain; }
}

const PROG: Record<Mood, { bpm: number; root: number; chords: number[][]; minor?: boolean }> = {
  // chord tones in semitones above the root
  warm: { bpm: 96, root: 60, chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]] },
  curious: { bpm: 108, root: 57, chords: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], minor: true },
  calm: { bpm: 72, root: 65, chords: [[0, 4, 7, 11], [4, 7, 11, 14], [5, 9, 12, 16], [0, 4, 7, 14]] },
  upbeat: { bpm: 118, root: 55, chords: [[0, 4, 7], [5, 9, 12], [9, 12, 16], [7, 11, 14]] },
};

/** Render `duration` seconds of music for a mood into a WAV file. */
export function writeMusic(mood: Mood, duration: number, file: string) {
  const total = Math.ceil(duration * RATE), out = new Float32Array(total), r = rand(42 + mood.length);
  const P = PROG[mood], beat = 60 / P.bpm, bar = beat * 4;
  for (let b = 0, t = 0; t < duration; b++, t += bar) {
    const ch = P.chords[b % P.chords.length], at = (s: number) => Math.round((t + s) * RATE);
    // bass on beats 1 and 3
    tone(out, at(0), hz(P.root - 24 + ch[0]), beat * 1.8, 0.16, 0.01, 'tri');
    tone(out, at(beat * 2), hz(P.root - 24 + ch[0] + (b % 2 ? 7 : 0)), beat * 1.6, 0.13, 0.01, 'tri');
    if (mood === 'calm') {
      for (const n of ch) tone(out, at(0), hz(P.root + n), bar * 1.02, 0.045, 0.6);
      for (let k = 0; k < 4; k++) pluck(out, at(k * beat), hz(P.root + 12 + ch[(k * 2) % ch.length]), beat * 1.5, 0.08, r, 0.2);
    } else {
      // arpeggio in eighths (curious: staccato offbeats)
      for (let k = 0; k < 8; k++) {
        if (mood === 'curious' && k % 2 === 0 && k !== 0) continue;
        const n = ch[[0, 1, 2, 1, 0, 2, 1, 2][k] % ch.length] + (k >= 4 && mood !== 'curious' ? 12 : 0);
        pluck(out, at(k * beat / 2), hz(P.root + n), mood === 'curious' ? beat * 0.4 : beat * 1.2, mood === 'upbeat' ? 0.12 : 0.1, r, mood === 'curious' ? 0.1 : 0.6);
      }
      // a sparse bell melody every other bar
      if (b % 2 === 1) tone(out, at(beat * 2.5), hz(P.root + 24 + ch[2]), beat * 1.2, 0.03, 0.005);
    }
    // percussion
    for (let k = 0; k < 8; k++) noise(out, at(k * beat / 2), 0.05, mood === 'calm' ? 0.0 : k % 2 ? 0.035 : 0.02, r, 0.85);
    if (mood === 'upbeat' || mood === 'warm') for (let k = 0; k < 4; k++) kick(out, at(k * beat), mood === 'upbeat' ? 0.3 : (k % 2 ? 0 : 0.18));
    if (mood === 'upbeat') for (const k of [1, 3]) noise(out, at(k * beat), 0.12, 0.09, r, 0.3);
  }
  // fade in/out, peak around -6 dB
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0 ? 0.5 / peak : 1, fi = RATE * 1.0, fo = RATE * 2.5;
  for (let i = 0; i < total; i++) out[i] *= g * Math.min(1, i / fi, (total - i) / fo);
  writeWav(out, file);
}

/** Mood that suits a script, from its words. */
export function moodOf(text: string): Mood {
  const s = text.toLowerCase();
  if (/thiền|bình an|chữa lành|tĩnh|buông|ngủ|thư giãn/.test(s)) return 'calm';
  if (/bí mật|sự thật|tại sao|vì sao|bất ngờ|đố|câu hỏi/.test(s)) return 'curious';
  if (/thành công|năng lượng|động lực|chiến thắng|bứt phá|vui/.test(s)) return 'upbeat';
  return 'warm';
}
