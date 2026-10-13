// Vector primitives of the story animation. Everything on the board (characters, props, sets,
// marks) is a list of primitives, so the same geometry is drawn three ways: whole, partly drawn
// by the hand (the nib on the exact point of the path), or morphing into another shape.
import type { Ctx } from '../types.ts';

export type Pt = [number, number];

export interface Prim {
  /** polyline in drawing order */
  d: Pt[];
  /** closed shape (filled with `fill`, outlined with ink) */
  closed?: boolean;
  /** outline / line width */
  w: number;
  ink: string;
  fill?: string;
  /** limb: drawn as an outlined capsule, inner colour `fill`, total width `w` */
  limb?: boolean;
  /** paint order (higher on top); drawing order stays the array order */
  z?: number;
  /** filled dot (eyes, buttons): no outline */
  dot?: boolean;
  alpha?: number;
}

export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const ease = (u: number) => { u = clamp(u); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp(u)) ** 3;
export const easeBack = (u: number) => { u = clamp(u); return 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2; };
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a || 1e-6));

export function hash(n: number) { let x = Math.imul((n | 0) ^ 0x9e3779b9, 2654435761); x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; return (x >>> 0) / 4294967296; }

/** Points of a circle/ellipse, starting at the top, clockwise. */
export function ellipse(cx: number, cy: number, rx: number, ry: number, n = 28, start = -Math.PI / 2): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) { const a = start + (i / n) * Math.PI * 2; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return out;
}
/** Arc from angle a0 to a1. */
export function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 12): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return out;
}
/** Quadratic curve sampled. */
export function quad(a: Pt, c: Pt, b: Pt, n = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; out.push([v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1]]); }
  return out;
}
/** Rounded closed polygon (Chaikin corner cutting). */
export function soft(pts: Pt[], iter = 2): Pt[] {
  let p = pts;
  for (let k = 0; k < iter; k++) {
    const q: Pt[] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = q;
  }
  return p;
}
export function rect(x: number, y: number, w: number, h: number, r = 0): Pt[] {
  if (!r) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  return soft([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], 2).map(([px, py]) => [px, py]);
}

export function length(d: Pt[], closed = false) {
  let s = 0;
  for (let i = 1; i < d.length; i++) s += Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]);
  if (closed && d.length > 2) s += Math.hypot(d[0][0] - d[d.length - 1][0], d[0][1] - d[d.length - 1][1]);
  return s;
}

/** Hand-drawn wobble: a steady, seeded offset across the line (no boiling unless `boil` changes). */
export function wobble(d: Pt[], seed: number, amp: number, closed = false): Pt[] {
  if (amp <= 0 || d.length < 2) return d;
  const out: Pt[] = [];
  let s = 0;
  const f1 = 0.035 + hash(seed) * 0.03, f2 = 0.11 + hash(seed + 7) * 0.05, ph = hash(seed + 3) * 6.28;
  for (let i = 0; i < d.length; i++) {
    if (i) s += Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]);
    const a = d[Math.max(0, i - 1)], b = d[Math.min(d.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
    // closed shapes: the offset returns to zero where the line meets its start
    const fade = closed ? 1 : Math.min(1, s / 12, 1);
    const o = (Math.sin(s * f1 + ph) * 0.7 + Math.sin(s * f2 + ph * 2) * 0.3) * amp * fade;
    out.push([d[i][0] + nx * o, d[i][1] + ny * o]);
  }
  return out;
}

export function transform(prims: Prim[], f: (p: Pt) => Pt): Prim[] {
  return prims.map((p) => ({ ...p, d: p.d.map(f) }));
}
export const place = (prims: Prim[], x: number, y: number, s = 1, flip = 1): Prim[] => transform(prims, ([px, py]) => [x + px * s * flip, y + py * s]);

function trace(c: Ctx, d: Pt[], closed?: boolean) {
  c.beginPath(); c.moveTo(d[0][0], d[0][1]);
  for (let i = 1; i < d.length; i++) c.lineTo(d[i][0], d[i][1]);
  if (closed) c.closePath();
}

/** Draw primitives whole (sorted by z). */
export function paint(c: Ctx, prims: Prim[], alpha = 1) {
  const list = prims.map((p, i) => [p, i] as const).sort((a, b) => (a[0].z ?? 0) - (b[0].z ?? 0) || a[1] - b[1]);
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  for (const [p] of list) paintOne(c, p, alpha, 1, 1);
  c.restore();
}

/**
 * One primitive, `u` of its outline drawn (0..1), its fill at `f` (0..1). Partly drawn limbs
 * show as an outlined marker stroke being laid down.
 */
export function paintOne(c: Ctx, p: Prim, alpha: number, u: number, f: number) {
  if (p.d.length < 1 || u <= 0) return;
  const a = alpha * (p.alpha ?? 1);
  c.globalAlpha = a;
  if (p.dot) {
    if (u < 1) return;
    c.fillStyle = p.ink; trace(c, p.d, true); c.fill(); return;
  }
  const d = u >= 1 ? p.d : partial(p.d, u, !!p.closed);
  if (p.limb) {
    c.strokeStyle = p.ink; c.lineWidth = p.w; trace(c, d, false); c.stroke();
    if (p.fill) { c.strokeStyle = p.fill; c.lineWidth = Math.max(1, p.w - 5); c.stroke(); }
    return;
  }
  if (p.closed && p.fill && f > 0) {
    c.globalAlpha = a * f; c.fillStyle = p.fill; trace(c, p.d, true); c.fill(); c.globalAlpha = a;
  }
  c.strokeStyle = p.ink; c.lineWidth = p.w;
  trace(c, d, !!p.closed && u >= 1); c.stroke();
}

/** First fraction u of a polyline (by length). */
export function partial(d: Pt[], u: number, closed = false): Pt[] {
  const pts = closed ? [...d, d[0]] : d;
  const L = length(pts) * clamp(u);
  const out: Pt[] = [pts[0]];
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (s + l >= L) { const v = (L - s) / (l || 1); out.push([lerp(pts[i - 1][0], pts[i][0], v), lerp(pts[i - 1][1], pts[i][1], v)]); return out; }
    out.push(pts[i]); s += l;
  }
  return out;
}
export function pointAt(d: Pt[], u: number, closed = false): Pt {
  const p = partial(d, u, closed); return p[p.length - 1];
}

/** Drawing plan of a set of primitives: lengths in drawing order, with pen travel in between. */
export interface DrawPlan { prims: Prim[]; lens: number[]; starts: number[]; travel: number[]; total: number }
export function drawPlan(prims: Prim[]): DrawPlan {
  const lens: number[] = [], starts: number[] = [], travel: number[] = [];
  let total = 0, last: Pt | null = null;
  for (const p of prims) {
    const L = p.dot ? 4 : length(p.d, p.closed);
    const first = p.d[0];
    const tr = last ? Math.hypot(first[0] - last[0], first[1] - last[1]) * 0.35 + 6 : 0;
    travel.push(tr); total += tr; starts.push(total); lens.push(L); total += L;
    last = p.closed ? first : p.d[p.d.length - 1];
  }
  return { prims, lens, starts, travel, total };
}
/** Pen state at drawing progress q: index being drawn, fraction of it, nib point and lift. */
export function planAt(P: DrawPlan, q: number): { i: number; u: number; x: number; y: number; lift: number } {
  const n = P.prims.length;
  if (!n) return { i: 0, u: 0, x: 0, y: 0, lift: 0 };
  const C = clamp(q) * P.total;
  let i = 0;
  while (i < n - 1 && P.starts[i + 1] - P.travel[i + 1] <= C) i++;
  const p = P.prims[i];
  if (C < P.starts[i]) {
    const prev = P.prims[i - 1], a = prev.closed ? prev.d[0] : prev.d[prev.d.length - 1], b = p.d[0];
    const v = ease((C - (P.starts[i] - P.travel[i])) / (P.travel[i] || 1));
    return { i, u: 0, x: lerp(a[0], b[0], v), y: lerp(a[1], b[1], v), lift: Math.sin(Math.PI * v) * Math.min(1, Math.hypot(b[0] - a[0], b[1] - a[1]) / 80) };
  }
  const u = clamp((C - P.starts[i]) / (P.lens[i] || 1));
  const [x, y] = p.dot ? p.d[0] : pointAt(p.d, u, p.closed);
  return { i, u, x, y, lift: 0 };
}
/** Paint a plan drawn up to q (fills of finished shapes settle in quickly). */
export function paintPlan(c: Ctx, P: DrawPlan, q: number, alpha = 1) {
  const st = planAt(P, q), C = clamp(q) * P.total;
  const order = P.prims.map((p, i) => i).sort((a, b) => (P.prims[a].z ?? 0) - (P.prims[b].z ?? 0) || a - b);
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  for (const i of order) {
    const u = i < st.i ? 1 : i === st.i ? (q >= 1 ? 1 : st.u) : 0;
    if (u <= 0) continue;
    // fill follows the outline, 40 px of drawing later
    const f = clamp((C - P.starts[i] - P.lens[i]) / 40 + (q >= 1 ? 1 : 0));
    paintOne(c, P.prims[i], alpha, u, f);
  }
  c.restore();
  return st;
}

/** Resample a polyline to n points (for morphing). */
export function resample(d: Pt[], n: number, closed = false): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) out.push(pointAt(d, closed ? i / n : i / Math.max(1, n - 1), closed));
  return out;
}

/**
 * A hand-drawn line the way rough.js draws one: slightly bowed, ends that overshoot a little,
 * drawn twice with different wobble. Deterministic for a seed (no boiling).
 */
export function roughLine(a: Pt, b: Pt, seed: number, amp = 1): Pt[][] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
  const gain = Math.max(0.4, Math.min(1, 1.23 - 0.0017 * len)) * amp;
  return [0, 1].map((pass) => {
    const r = (k: number) => (hash(seed * 13 + pass * 7 + k) - 0.5) * 2;
    const off = Math.min(len / 10, 3) * gain, bow = len * 0.025 * r(1) * gain;
    const p0: Pt = [a[0] + r(2) * off, a[1] + r(3) * off], p1: Pt = [b[0] + r(4) * off, b[1] + r(5) * off];
    const mid: Pt = [(p0[0] + p1[0]) / 2 + nx * bow, (p0[1] + p1[1]) / 2 + ny * bow];
    return quad(p0, mid, p1, Math.max(6, Math.round(len / 12)));
  });
}
/** A rough arrow from a to b (shaft drawn twice, open head). */
export function roughArrow(a: Pt, b: Pt, seed: number, ink: string, w = 3): Prim[] {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), hl = 14;
  const h1: Pt = [b[0] - Math.cos(ang - 0.45) * hl, b[1] - Math.sin(ang - 0.45) * hl], h2: Pt = [b[0] - Math.cos(ang + 0.45) * hl, b[1] - Math.sin(ang + 0.45) * hl];
  return [...roughLine(a, b, seed), ...roughLine(h1, b, seed + 1, 0.6), ...roughLine(h2, b, seed + 2, 0.6)].map((d, i) => ({ d, w: i % 2 ? w * 0.7 : w, ink, alpha: i % 2 ? 0.7 : 1 }));
}
