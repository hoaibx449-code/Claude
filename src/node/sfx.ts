// Sound effects synthesised in code (no files, no licences): whoosh on cuts, pop when a word or
// sticker lands, a ping for chat messages, ticks for the countdown, a bell for answers.
// All cues of a video are summed into one mono WAV that FFmpeg mixes under the voice.
import { writeFileSync } from 'node:fs';
import type { Cue, Sfx } from '../engine/looks.ts';

const RATE = 44100;

function rand(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; }; }

/** One effect as samples in [-1, 1]. */
export function synth(kind: Sfx): Float32Array {
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
    case 'ding': {
      const out = len(0.9);
      for (let i = 0; i < out.length; i++) { const t = i / RATE; out[i] = (Math.sin(2 * Math.PI * 1046.5 * t) + 0.45 * Math.sin(2 * Math.PI * 2093 * t) + 0.2 * Math.sin(2 * Math.PI * 3139.5 * t)) * Math.exp(-4.5 * t) * 0.45; }
      return out;
    }
  }
}

const LEVEL: Record<Sfx, number> = { whoosh: 0.32, pop: 0.22, msg: 0.38, tick: 0.4, ding: 0.32 };

/** Mix every cue into one mono 16-bit WAV of `duration` seconds. Returns false when there is nothing to play. */
export function writeSfxTrack(cues: Cue[], duration: number, file: string) {
  if (!cues.length) return false;
  const total = Math.ceil(duration * RATE), mix = new Float32Array(total), cache = new Map<Sfx, Float32Array>();
  let lastPop = -1;
  for (const cue of cues) {
    // pops closer than 90 ms blur into a rattle: keep the first
    if (cue.k === 'pop') { if (cue.t - lastPop < 0.09) continue; lastPop = cue.t; }
    if (!cache.has(cue.k)) cache.set(cue.k, synth(cue.k));
    const s = cache.get(cue.k)!, at = Math.round(Math.max(0, cue.t) * RATE), g = LEVEL[cue.k];
    for (let i = 0; i < s.length && at + i < total; i++) mix[at + i] += s[i] * g;
  }
  const buf = Buffer.alloc(44 + total * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + total * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(total * 2, 40);
  for (let i = 0; i < total; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mix[i])) * 32000), 44 + i * 2);
  writeFileSync(file, buf);
  return true;
}
