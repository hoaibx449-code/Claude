// A raster picture (inked lines on transparency) drawn by the hand along its own strokes: the
// shared piece behind drawn characters (Open Peeps) and handwritten words. The picture is
// thinned to centre lines once (strokes.ts), paced to a hand's speed, and revealed through a
// mask of the strokes drawn so far; the nib point is the end of the stroke being drawn.
import type { Ctx, Env } from './types.ts';
import { extractStrokes, LINE_SHARE, pace, pathStroke, penState, type StrokePlan } from './strokes.ts';

export interface Reveal {
  /** the picture at device resolution */
  canvas: any;
  /** logical size and device px per logical px */
  w: number; h: number; dpr: number;
  plan: StrokePlan | null;
  share: number;
  /** mask of finished strokes, rebuilt when drawing goes backwards */
  done?: { cv: any; n: number };
  work?: any;
}

const ease = (u: number) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

export function makeReveal(env: Env, canvas: any, w: number, h: number, dpr: number, seconds?: number, opts: { minLen?: number; reading?: number } = {}): Reveal {
  const s = Math.min(1.2, 560 / Math.max(w, h)), ww = Math.max(8, Math.round(w * s)), hh = Math.max(8, Math.round(h * s));
  const small = env.createCanvas(ww, hh), x = small.getContext('2d');
  x.drawImage(canvas, 0, 0, ww, hh);
  const full = extractStrokes(x.getImageData(0, 0, ww, hh).data, ww, hh, s, opts);
  if (full && seconds) { const f = pace(full, seconds); return { canvas, w, h, dpr, plan: f.plan, share: f.share }; }
  return { canvas, w, h, dpr, plan: full, share: LINE_SHARE };
}

/** Nib position (local logical coordinates) and lift at drawing progress p (0..1). */
export function revealPen(R: Reveal, p: number) {
  if (!R.plan) return { x: R.w * p, y: R.h * 0.5, lift: 0 };
  const st = penState(R.plan, p / R.share);
  return { x: st.x, y: st.y, lift: st.lift };
}

/** Draw the picture as revealed at progress p, its top-left at (x, y), w × h logical. */
export function drawReveal(c: Ctx, env: Env, R: Reveal, p: number, x: number, y: number, alpha = 1) {
  if (p <= 0) return;
  c.save(); c.globalAlpha *= alpha;
  if (p >= 1 || !R.plan) {
    // no strokes (not line art): a soft sweep from the top
    if (!R.plan && p < 1) { c.beginPath(); c.rect(x, y, R.w, R.h * p); c.clip(); }
    c.drawImage(R.canvas, x, y, R.w, R.h); c.restore(); return;
  }
  const plan = R.plan, st = penState(plan, p / R.share), W = R.canvas.width, H = R.canvas.height;
  R.done ||= { cv: env.createCanvas(W, H), n: 0 };
  R.work ||= env.createCanvas(W, H);
  const pen = (k: any, i: number) => { k.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); k.lineCap = 'round'; k.lineJoin = 'round'; k.lineWidth = plan.widths[i]; k.strokeStyle = '#000'; k.beginPath(); };
  const d = R.done.cv.getContext('2d');
  if (R.done.n > st.done) { d.setTransform(1, 0, 0, 1, 0, 0); d.clearRect(0, 0, W, H); R.done.n = 0; }
  for (let i = R.done.n; i < st.done; i++) { pen(d, i); pathStroke(d, plan, i); d.stroke(); }
  R.done.n = Math.max(R.done.n, st.done);
  const k = R.work.getContext('2d');
  k.setTransform(1, 0, 0, 1, 0, 0); k.globalCompositeOperation = 'source-over'; k.clearRect(0, 0, W, H);
  k.drawImage(R.done.cv, 0, 0);
  if (st.along > 0 && st.done < plan.strokes.length) { pen(k, st.done); pathStroke(k, plan, st.done, st.along); k.stroke(); }
  k.setTransform(1, 0, 0, 1, 0, 0); k.globalCompositeOperation = 'source-in'; k.drawImage(R.canvas, 0, 0);
  c.drawImage(R.work, x, y, R.w, R.h);
  if (p > R.share) { c.globalAlpha = alpha * ease((p - R.share) / (1 - R.share)); c.drawImage(R.canvas, x, y, R.w, R.h); }
  c.restore();
}
