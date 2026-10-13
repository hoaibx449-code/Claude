// Sound effects synthesised in code (no files, no licences): whoosh on cuts, pop when a word or
// sticker lands, a ping for chat messages, ticks for the countdown, a bell for answers.
// All cues of a video are summed into one mono WAV that FFmpeg mixes under the voice.
import { writeFileSync } from 'node:fs';
import type { Sfx as LookSfx } from '../engine/looks.ts';
import type { ActSfx } from '../engine/act/director.ts';

export type Sfx = LookSfx | ActSfx;
export interface Cue { t: number; k: Sfx; d?: number; v?: number }

const RATE = 44100;

function rand(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; }; }

/** One effect as samples in [-1, 1]. */
export function synth(kind: Sfx, dur = 1): Float32Array {
  const len = (d: number) => new Float32Array(Math.round(d * RATE));
  switch (kind) {
    case 'whoosh': {
      // band-passed noise with a rising, then falling, centre
      const out = len(0.42), r = rand(7);
      let lp = 0, hp = 0, prev = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE, u = t / 0.42, env = Math.sin(Math.PI * u) ** 2;
        const f = 300 + 2600 * Math.sin(Math.PI * u), a = Math.min(1, (2 * Math.PI * f) / RATE);
        lp += a * (r() - lp); hp = lp - prev; prev = lp;
        out[i] = (lp * 0.6 + hp * 1.4) * env * 0.9;
      }
      return out;
    }
    case 'pop': {
      const out = len(0.12);
      for (let i = 0; i < out.length; i++) { const t = i / RATE; out[i] = Math.sin(2 * Math.PI * (950 - 3800 * t) * t) * Math.exp(-34 * t) * 0.8; }
      return out;
    }
    case 'msg': {
      const out = len(0.42);
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE, t2 = Math.max(0, t - 0.09);
        out[i] = 0.5 * Math.sin(2 * Math.PI * 1318 * t) * Math.exp(-14 * t) + (t >= 0.09 ? 0.5 * Math.sin(2 * Math.PI * 1760 * t2) * Math.exp(-10 * t2) : 0);
      }
      return out;
    }
    case 'tick': {
      const out = len(0.07);
      for (let i = 0; i < out.length; i++) { const t = i / RATE; out[i] = Math.sin(2 * Math.PI * 2100 * t) * Math.exp(-70 * t) * 0.8; }
      return out;
    }
    case 'scribble': {
      // felt tip on paper: band-limited noise, loud while a stroke moves, quieter between strokes
      const out = len(Math.max(0.06, dur)), r = rand(11);
      let lp = 0, lp2 = 0, phase = 0, rate = 5;
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        phase += rate / RATE; if (phase >= 1) { phase -= 1; rate = 3.5 + (r() + 1) * 2.5; }
        const stroke = 0.35 + 0.65 * Math.sin(Math.PI * phase) ** 2;
        const x = r(); lp += 0.35 * (x - lp); lp2 += 0.08 * (lp - lp2);
        const env = Math.min(1, t / 0.04, (out.length / RATE - t) / 0.06);
        out[i] = (lp - lp2) * stroke * env * 1.6;
      }
      return out;
    }
    case 'step': {
      const out = len(0.14), r = rand(5);
      let lp = 0;
      for (let i = 0; i < out.length; i++) { const t = i / RATE; lp += 0.06 * (r() - lp); out[i] = (Math.sin(2 * Math.PI * 95 * t) * 0.7 + lp * 2.2) * Math.exp(-28 * t); }
      return out;
    }
    case 'buzz': {
      const out = len(0.42);
      for (let i = 0; i < out.length; i++) { const t = i / RATE, f = 170 + Math.sin(2 * Math.PI * 9 * t) * 6; const sq = Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.5 + Math.sin(2 * Math.PI * f * t) * 0.5; out[i] = sq * Math.min(1, t / 0.01) * Math.exp(-3.2 * t) * 0.5; }
      return out;
    }
    case 'swish': {
      const out = len(0.24), r = rand(9);
      let lp = 0, prev = 0;
      for (let i = 0; i < out.length; i++) { const t = i / RATE, u = t / 0.24, env = Math.sin(Math.PI * u) ** 2; const f = 1200 + 3000 * u, a = Math.min(1, (2 * Math.PI * f) / RATE); lp += a * (r() - lp); out[i] = (lp - prev) * env * 2.2; prev = lp; }
      return out;
    }
    case 'tap': {
      const out = len(0.07), r = rand(3);
      let lp = 0;
      for (let i = 0; i < out.length; i++) { const t = i / RATE; lp += 0.5 * (r() - lp); out[i] = lp * Math.exp(-60 * t) * 1.2; }
      return out;
    }
    case 'ding': {
      const out = len(0.9);
      for (let i = 0; i < out.length; i++) { const t = i / RATE; out[i] = (Math.sin(2 * Math.PI * 1046.5 * t) + 0.45 * Math.sin(2 * Math.PI * 2093 * t) + 0.2 * Math.sin(2 * Math.PI * 3139.5 * t)) * Math.exp(-4.5 * t) * 0.45; }
      return out;
    }
  }
}

const LEVEL: Record<Sfx, number> = { whoosh: 0.32, pop: 0.22, msg: 0.38, tick: 0.4, ding: 0.32, scribble: 0.11, step: 0.2, buzz: 0.22, swish: 0.14, tap: 0.22 };

/** Mix every cue into one mono 16-bit WAV of `duration` seconds. Returns false when there is nothing to play. */
export { writeWav };
export function writeSfxTrack(cues: Cue[], duration: number, file: string, volume = 1) {
  if (!cues.length) return false;
  const total = Math.ceil(duration * RATE), mix = new Float32Array(total), cache = new Map<string, Float32Array>();
  let lastPop = -1;
  for (const cue of cues) {
    // pops closer than 90 ms blur into a rattle: keep the first
    if (cue.k === 'pop') { if (cue.t - lastPop < 0.09) continue; lastPop = cue.t; }
    const key = cue.k === 'scribble' ? `scribble:${(cue.d || 1).toFixed(2)}` : cue.k;
    if (!cache.has(key)) cache.set(key, synth(cue.k, cue.d));
    const s = cache.get(key)!, at = Math.round(Math.max(0, cue.t) * RATE), g = LEVEL[cue.k] * (cue.v ?? 1) * volume;
    for (let i = 0; i < s.length && at + i < total; i++) mix[at + i] += s[i] * g;
  }
  writeWav(mix, file);
  return true;
}

/** Mono 16-bit WAV. */
function writeWav(mix: Float32Array, file: string) {
  const total = mix.length;
  const buf = Buffer.alloc(44 + total * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + total * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(total * 2, 40);
  for (let i = 0; i < total; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mix[i])) * 32000), 44 + i * 2);
  writeFileSync(file, buf);
}
