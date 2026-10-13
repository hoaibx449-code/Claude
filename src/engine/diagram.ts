// Hand-drawn diagrams: titles, bar charts (with start value, arrow, trend curve and
// highlighted maximum), comparisons, steps, cause→effect flows, big numbers and statements,
// drawn stroke by stroke with the hand following the pen (no images needed).
import type { Ctx, DiagramSpec } from './types.ts';
import { wrapVi } from './textwrap.ts';
import { ACTIONS, actorAt, drawLines, lengthOf, pointAlong, type Action, type Actor } from './stick.ts';

export interface Box { x: number; y: number; w: number; h: number }
export interface Colors { ink: string; accent: string; accent2: string; good: string; fills?: string[]; /** canvas font family (handwriting or the sans of the modern modes) */ font?: string; /** motion graphics: icons sit on coloured discs */ flat?: boolean; /** loaded pictures for image items */ images?: Record<string, any>; /** QR matrix maker for qr items */ qr?: (text: string) => boolean[][] | null; /** reference character picture: replaces the stick figures */ character?: any;
  /** hand-drawn people (Open Peeps): a person in the pose of an action, `hpx` tall, the i-th person of the board */
  peep?: (action: string, hpx: number, i: number) => PeepEl | null }
/** A drawn person ready to be revealed: picture, feet anchor (ax, h), how to draw it at progress p. */
export interface PeepEl { w: number; h: number; ax: number; draw: (c: Ctx, p: number, x: number, y: number) => void; pen: (p: number) => { x: number; y: number } }
/** How the tool marks the paper: extra offset passes (chalk, pencil) and brush pressure. */
export interface Pen { passes: [number, number, number, number][]; brush?: boolean; width: number }

/** line: narration line it is drawn with; item: sketch item it belongs to; cue: words of the line that trigger it */
export type Element = { line?: number; item?: number; cue?: string } & (
  | { kind: 'path'; pts: [number, number][]; cum: number[]; len: number; color: string; width: number; weight: number }
  | { kind: 'text'; text: string; x: number; y: number; size: number; w: number; color: string; weight: number; font?: string }
  // a real picture, revealed (not traced)
  | { kind: 'image'; img: any; x: number; y: number; w: number; h: number; shape?: 'rounded' | 'circle'; color: string; weight: number }
  | { kind: 'qr'; cells: boolean[][]; x: number; y: number; size: number; color: string; weight: number }
  | { kind: 'fill'; pts: [number, number][]; color: string; anchor: [number, number]; weight: number }
  // stick figure: sketched in its first pose, then animated (tau = seconds since it was finished)
  | { kind: 'actor'; actor: Actor; first: [number, number][][]; len: number; color: string; width: number; weight: number }
  // a hand-drawn person revealed along its own strokes (x: feet, y: ground), then breathing
  | { kind: 'peep'; peep: PeepEl; x: number; y: number; flip: number; weight: number }
  // several strokes drawn one after another (icons)
  | { kind: 'lines'; lines: [number, number][][]; len: number; color: string; width: number; weight: number });

export type P = [number, number];
export function line(a: P, b: P, step = 5): P[] {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(d / step)), o: P[] = [];
  for (let i = 0; i <= n; i++) o.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return o;
}
export function poly(pts: P[], closed = false): P[] {
  const all = closed ? [...pts, pts[0]] : pts, o: P[] = [];
  for (let i = 0; i < all.length - 1; i++) { const s = line(all[i], all[i + 1]); if (i) s.shift(); o.push(...s); }
  return o;
}
export function ellipse(cx: number, cy: number, rx: number, ry: number): P[] {
  const o: P[] = [];
  for (let i = 0; i <= 52; i++) { const a = -Math.PI * 0.6 + (i / 48) * Math.PI * 2; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return o;
}
export function arrow(a: P, b: P): P[] {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), h = 16;
  const l: P = [b[0] - h * Math.cos(ang - 0.5), b[1] - h * Math.sin(ang - 0.5)], r: P = [b[0] - h * Math.cos(ang + 0.5), b[1] - h * Math.sin(ang + 0.5)];
  return [...line(a, b), ...line(b, l), ...line(l, b), ...line(b, r)];
}
export function wavy(x0: number, x1: number, y: number): P[] {
  const o: P[] = [];
  for (let x = x0; x <= x1; x += 4) o.push([x, y + Math.sin((x - x0) / 9) * 3]);
  return o;
}
// tiny deterministic wobble so strokes look hand drawn
export function wobble(pts: P[], seed: number): P[] {
  return pts.map(([x, y], i) => [x + Math.sin(i * 0.7 + seed) * 0.7, y + Math.cos(i * 0.9 + seed * 1.3) * 0.7]);
}

export function wrap(c: Ctx, text: string, size: number, max: number, font = 'Pangolin'): string[] {
  return wrapVi(c, text, size, max, font);
}

export function buildDiagram(c: Ctx, d: DiagramSpec, box: Box, col: Colors): Element[] {
  const F = col.font || 'Pangolin';
  const wrap = (cc: Ctx, s: string, size: number, max: number) => wrapVi(cc, s, size, max, F);
  const els: Element[] = [];
  let seed = 1;
  const path = (pts: P[], color = col.ink, width = 3.4) => {
    const w = wobble(pts, seed++), cum = [0];
    for (let i = 1; i < w.length; i++) cum.push(cum[i - 1] + Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]));
    const len = cum[cum.length - 1];
    els.push({ kind: 'path', pts: w, cum, len, color, width, weight: Math.max(0.25, len / 420) });
  };
  // filled shape (kraft style colours bars after outlining them); the hand rests at `anchor`
  const fill = (pts: P[], color: string | undefined) => { if (color) els.push({ kind: 'fill', pts, color, anchor: pts[pts.length - 1], weight: 0.3 }); };
  const text = (s: string, x: number, y: number, size: number, color = col.ink, align: 'left' | 'center' | 'right' = 'left') => {
    c.font = `${size}px ${F}`;
    const w = c.measureText(s).width;
    els.push({ kind: 'text', font: F, text: s, x: align === 'center' ? x - w / 2 : align === 'right' ? x - w : x, y, size, w, color, weight: Math.max(0.35, s.length * 0.045) });
    return w;
  };
  const portrait = box.h > box.w;
  let top = box.y;

  if (d.title) {
    const size = portrait ? 42 : 36;
    const lines = wrap(c, d.title, size, box.w).slice(0, 2);
    let maxW = 0;
    lines.forEach((l, i) => { maxW = Math.max(maxW, text(l, box.x, top + size + i * size * 1.25, size)); });
    top += size + (lines.length - 1) * size * 1.25 + 14;
    path(wavy(box.x, box.x + Math.min(maxW, box.w), top), col.accent, 3);
    top += 34;
  }
  const bottom = box.y + box.h, avail = bottom - top, cx = box.x + box.w / 2;

  switch (d.kind) {
    case 'plot': {
      // axes with arrow heads, light ticks, then the curve traced point by point (maths-video look)
      const pad = portrait ? 34 : 40, x0 = box.x + pad, x1 = box.x + box.w - 12, y0 = top + 14, y1 = bottom - pad;
      path(arrow([x0, y1], [x1, y1]), col.ink, 2.6);
      path(arrow([x0, y1], [x0, y0]), col.ink, 2.6);
      for (let i = 1; i <= 4; i++) { const x = x0 + ((x1 - x0 - 20) * i) / 4, y = y1 - ((y1 - y0 - 20) * i) / 4; path(line([x, y1 - 6], [x, y1 + 6]), col.ink, 1.8); path(line([x0 - 6, y], [x0 + 6, y]), col.ink, 1.8); }
      const f: Record<string, (u: number) => number> = {
        linear: (u) => u, exp: (u) => (Math.exp(3 * u) - 1) / (Math.exp(3) - 1), log: (u) => Math.log(1 + 9 * u) / Math.log(10), sin: (u) => 0.5 + 0.42 * Math.sin(u * Math.PI * 2),
        square: (u) => u * u, sqrt: (u) => Math.sqrt(u), down: (u) => 1 - u * 0.9, wave: (u) => 0.5 + 0.35 * Math.sin(u * Math.PI * 3) * (1 - u * 0.5),
      };
      const vals = (d.values || []).filter((v) => isFinite(v));
      const fn = vals.length > 1 ? (u: number) => { const k = u * (vals.length - 1), i = Math.min(vals.length - 2, Math.floor(k)), mx = Math.max(...vals), mn = Math.min(0, ...vals); return ((vals[i] + (vals[i + 1] - vals[i]) * (k - i)) - mn) / (mx - mn || 1); } : f[d.fn || 'exp'] || f.exp;
      const pts: P[] = [];
      for (let i = 0; i <= 80; i++) { const u = i / 80; pts.push([x0 + 6 + (x1 - x0 - 30) * u, y1 - 8 - (y1 - y0 - 40) * Math.max(0, Math.min(1, fn(u)))]); }
      path(pts, col.accent2, 4.2);
      const end = pts[pts.length - 1];
      path(ellipse(end[0], end[1], 7, 7), col.accent, 3);
      const ls = portrait ? 24 : 21;
      if (d.xLabel) text(d.xLabel, x1 - 4, y1 + ls + 10, ls, col.ink, 'center');
      if (d.yLabel) text(d.yLabel, x0 + 8, y0 - 6 + ls * 0.2, ls, col.ink, 'left');
      if (d.caption) text(wrap(c, d.caption, ls + 4, box.w * 0.6)[0] || '', Math.min(end[0], x1 - box.w * 0.25), Math.max(y0 + ls * 2, end[1] - 26), ls + 4, col.accent, 'center');
      break;
    }
    case 'pie': {
      // a hand-drawn pie: tinted slices, the circle, the cuts from the centre, then each share written beside it
      const vals = (d.values || []).filter((v) => v > 0).slice(0, 5), labels = d.labels || [];
      if (!vals.length) break;
      const sum = vals.reduce((a, b) => a + b, 0), ls = portrait ? 24 : 21;
      const r = Math.max(40, Math.min(box.w * (portrait ? 0.3 : 0.2), (avail - ls * 3) / 2)), cy = top + avail / 2;
      const tints = col.fills?.length ? col.fills : [col.accent, col.accent2, col.good, col.ink];
      const big = vals.indexOf(Math.max(...vals));
      let a0 = -Math.PI / 2;
      const cuts: number[] = [];
      vals.forEach((v, i) => {
        const a1 = a0 + (v / sum) * Math.PI * 2, n = Math.max(3, Math.ceil((a1 - a0) * 16)), pts: P[] = [[cx, cy]];
        for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
        els.push({ kind: 'fill', pts, color: tints[i % tints.length] + (col.fills?.length ? '' : '40'), anchor: pts[pts.length - 1], weight: 0.25 });
        cuts.push(a0); a0 = a1;
      });
      path(ellipse(cx, cy, r, r), col.ink, 3.4);
      if (vals.length > 1) for (const a of cuts) path(line([cx, cy], [cx + Math.cos(a) * r, cy + Math.sin(a) * r]), col.ink, 2.8);
      a0 = -Math.PI / 2;
      vals.forEach((v, i) => {
        const am = a0 + (v / sum) * Math.PI; a0 += (v / sum) * Math.PI * 2;
        const pct = `${Math.round((v / sum) * 100)}%`, lx = cx + Math.cos(am) * (r + ls * 1.6), ly = cy + Math.sin(am) * (r + ls * 1.3);
        text(pct, cx + Math.cos(am) * r * 0.6, cy + Math.sin(am) * r * 0.6 + ls * 0.35, ls + 2, i === big ? col.accent : col.ink, 'center');
        if (labels[i]) text(labels[i].slice(0, 16), lx, ly + ls * 0.35, ls, col.ink, Math.abs(Math.cos(am)) < 0.3 ? 'center' : Math.cos(am) > 0 ? 'left' : 'right');
      });
      if (d.caption) text(wrap(c, d.caption, ls + 2, box.w)[0] || '', cx, Math.min(bottom - 4, cy + r + ls * 2.6), ls + 2, col.accent, 'center');
      break;
    }
    case 'bars': {
      const vals = (d.values || []).slice(0, 5), labels = d.labels || [];
      if (!vals.length) break;
      let x0 = box.x + 8, yt = top + 40;
      const x1 = box.x + box.w - 8, yb = bottom - 34;
      // optional starting amount: a coin-like circle with an arrow into the chart (as in the demo)
      if (d.start) {
        const r = portrait ? 48 : 52;
        if (portrait) {
          const cx0 = box.x + r + 10, cy0 = top + r + 6;
          path(ellipse(cx0, cy0, r, r)); fill(ellipse(cx0, cy0, r, r), col.fills?.[0]);
          text(d.start, cx0, cy0 + 10, 28, col.ink, 'center');
          path(arrow([cx0 + r + 16, cy0], [cx0 + r + 110, cy0]), col.accent2);
          yt = cy0 + r + 50;
        } else {
          const cx0 = box.x + r + 6, cy0 = (yt + yb) / 2 - 30;
          path(ellipse(cx0, cy0, r, r)); fill(ellipse(cx0, cy0, r, r), col.fills?.[0]);
          text(d.start, cx0, cy0 + 10, 30, col.ink, 'center');
          path(arrow([cx0 + r + 14, cy0], [cx0 + r + 104, cy0]), col.accent2);
          x0 = cx0 + r + 130;
        }
      }
      const max = Math.max(...vals, 1e-9);
      path(poly([[x0, yt - 10], [x0, yb], [x1, yb]]));
      const slot = (x1 - x0) / vals.length, bw = Math.min(90, slot * 0.6);
      const tops: P[] = [];
      let maxLabel: P = [0, 0];
      vals.forEach((v, i) => {
        const bx = x0 + slot * (i + 0.5) - bw / 2, h = Math.max(6, ((yb - yt - 30) * v) / max);
        const rect: P[] = [[bx, yb], [bx, yb - h], [bx + bw, yb - h], [bx + bw, yb]];
        path(poly(rect)); fill(rect, col.fills?.[(i + 1) % (col.fills?.length || 1)]);
        const vs = portrait ? 28 : 24, isMax = v === max;
        text(`${fmt(v)}${d.unit || ''}`, bx + bw / 2, yb - h - 12, vs, isMax && d.trend !== false ? col.accent : col.ink, 'center');
        if (labels[i]) text(labels[i].slice(0, 14), bx + bw / 2, yb + 30, portrait ? 23 : 20, col.ink, 'center');
        tops.push([bx + bw / 2, yb - h]);
        if (isMax) maxLabel = [bx + bw / 2, yb - h - 20];
      });
      // rising trend curve and a circle around the largest value
      if (d.trend !== false && vals.length > 1) {
        const last = tops[tops.length - 1], pts: P[] = [];
        for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push([x0 + 8 + (last[0] - x0 - 8) * u, yb - 10 - (yb - 10 - (last[1] - 34)) * u ** 2.6]); }
        path(pts, col.accent, 3.6);
        path(ellipse(maxLabel[0], maxLabel[1] - 4, portrait ? 52 : 46, portrait ? 34 : 30), col.accent, 3.4);
      }
      break;
    }
    case 'flow': {
      // cause → effect chain: circles with short words, joined by arrows
      const items = (d.items || []).slice(0, 4);
      if (!items.length) break;
      const n = items.length, ts = portrait ? 29 : 24;
      const vertical = portrait;
      const r = vertical ? Math.min(58, (avail - (n - 1) * 46) / n / 2) : Math.min(70, (box.w - (n - 1) * 60) / n / 2);
      items.forEach((it, i) => {
        const cxi = vertical ? cx : box.x + r + 6 + i * ((box.w - 2 * r - 12) / Math.max(1, n - 1));
        const cyi = vertical ? top + r + 6 + i * ((avail - 2 * r - 12) / Math.max(1, n - 1)) : top + avail / 2 - 10;
        if (i) {
          const prev = vertical ? [cxi, cyi - (avail - 2 * r - 12) / Math.max(1, n - 1)] : [cxi - (box.w - 2 * r - 12) / Math.max(1, n - 1), cyi];
          path(arrow(vertical ? [cxi, prev[1] + r + 10] : [prev[0] + r + 10, cyi], vertical ? [cxi, cyi - r - 10] : [cxi - r - 10, cyi]), col.accent2);
        }
        const e = ellipse(cxi, cyi, vertical ? r * 2.4 : r, r);
        path(e, i === n - 1 ? col.accent : col.ink); fill(e, col.fills?.[i % (col.fills?.length || 1)]);
        const ls = wrap(c, it, ts, (vertical ? r * 4.4 : r * 1.8)).slice(0, 2);
        ls.forEach((l, k) => text(l, cxi, cyi + 8 + (k - (ls.length - 1) / 2) * ts * 1.2, ts, col.ink, 'center'));
      });
      break;
    }
    case 'compare': {
      const lx = box.x + box.w / 4, rx = box.x + (box.w * 3) / 4, colW = box.w / 2 - 24, hs = portrait ? 34 : 30;
      text(d.left || '', lx, top + hs, hs, col.ink, 'center');
      text(d.right || '', rx, top + hs, hs, col.ink, 'center');
      path(line([cx, top], [cx, bottom - 10]));
      const my = top + hs + 90, s = 38;
      path(line([lx - s, my - s], [lx + s, my + s]), col.accent, 4.2);
      path(line([lx + s, my - s], [lx - s, my + s]), col.accent, 4.2);
      path(poly([[rx - s, my], [rx - s * 0.3, my + s * 0.8], [rx + s, my - s]]), col.good, 4.2);
      const ns = portrait ? 27 : 23;
      wrap(c, d.leftNote || '', ns, colW).slice(0, 4).forEach((l, i) => text(l, lx, my + 100 + i * ns * 1.35, ns, col.ink, 'center'));
      wrap(c, d.rightNote || '', ns, colW).slice(0, 4).forEach((l, i) => text(l, rx, my + 100 + i * ns * 1.35, ns, col.ink, 'center'));
      break;
    }
    case 'steps': {
      const items = (d.items || []).slice(0, 4);
      if (!items.length) break;
      const row = Math.min(140, avail / items.length), ts = portrait ? 31 : 25;
      items.forEach((it, i) => {
        const y = top + row * i + 26;
        path(ellipse(box.x + 24, y, 23, 23));
        text(String(i + 1), box.x + 24, y + 10, 28, col.accent, 'center');
        wrap(c, it, ts, box.w - 70).slice(0, 2).forEach((l, k) => text(l, box.x + 64, y + 10 + k * ts * 1.3, ts));
      });
      break;
    }
    case 'number': {
      const size = portrait ? 120 : 96, y = top + Math.min(avail * 0.42, 190);
      const w = text(d.number || '', cx, y, size, col.ink, 'center');
      path(ellipse(cx, y - size * 0.32, w / 2 + 34, size * 0.72), col.accent, 3.6);
      const cs = portrait ? 32 : 27;
      wrap(c, d.caption || '', cs, box.w - 20).slice(0, 3).forEach((l, i) => text(l, cx, y + size * 0.75 + 30 + i * cs * 1.35, cs, col.ink, 'center'));
      break;
    }
    case 'stick': {
      const acts = (d.actors || []).slice(0, 2), n = acts.length;
      if (!n) break;
      const labels = acts.some((a) => a.label), ls = portrait ? 26 : 22;
      const ground = bottom - 8 - (labels ? ls + 14 : 0) - (d.caption ? (portrait ? 48 : 38) : 0);
      const room = ground - top - (d.bubble && portrait ? 128 : 16);
      const k = Math.max(0.55, Math.min(portrait ? 1.6 : 1.3, room / 172));
      // where each figure ends up; landscape keeps the right side for the bubble
      const span = portrait || !d.bubble ? [box.x, box.x + box.w] : [box.x, box.x + box.w * 0.55];
      const slots = n === 1 ? [span[0] + (span[1] - span[0]) * 0.5] : [span[0] + (span[1] - span[0]) * 0.27, span[0] + (span[1] - span[0]) * 0.73];
      path(wavy(box.x, box.x + box.w, ground + 2), col.ink, 2.6);
      const heads: P[] = [];
      acts.forEach((a, i) => {
        const action = (ACTIONS.includes(a.action as Action) ? a.action : 'idle') as Action;
        const facing: 1 | -1 = n === 2 && i === 1 ? -1 : 1;
        const x1 = slots[i], moving = action === 'walk' || action === 'run';
        const x0 = moving ? Math.max(box.x + 30 * k, Math.min(box.x + box.w - 30 * k, x1 - facing * box.w * (n === 2 ? 0.22 : 0.34))) : x1;
        const actor: Actor = { action, x0, x1, ground, scale: k, facing };
        const first = actorAt(actor, 0), len = lengthOf(first), pe = col.peep?.(action, 172 * k, i);
        els.push(pe ? { kind: 'peep', peep: pe, x: x1, y: ground, flip: facing, weight: 1.1 } : { kind: 'actor', actor, first, len, color: col.ink, width: 3.6, weight: Math.max(0.6, len / 360) });
        heads.push([x1, ground - 172 * k]);
        if (a.label) text(a.label.slice(0, 16), x1, ground + ls + 10, ls, col.accent2, 'center');
      });
      if (d.bubble) {
        const bs = portrait ? 27 : 22, h = heads[0];
        const rx = portrait ? box.w * 0.46 : box.w * 0.2;
        const lines = wrap(c, d.bubble, bs, rx * 1.55).slice(0, portrait ? 2 : 3);
        const ry = Math.max(44, lines.length * bs * 0.8 + 22);
        // portrait: above the figures; landscape: up and to the right of the speaker
        const bx = portrait ? cx : Math.min(box.x + box.w - rx - 4, h[0] + rx + 70 * k);
        const by = portrait ? top + ry + 4 : Math.max(top + ry, h[1] - ry * 0.9);
        // short tail from the bubble edge towards the speaker's head
        const ang = Math.atan2(h[1] - by, h[0] - bx), ex = bx + Math.cos(ang) * rx * 0.96, ey = by + Math.sin(ang) * ry * 0.96;
        const dl = Math.hypot(h[0] - ex, h[1] - ey) || 1, tl = Math.min(44, dl * 0.6);
        const tip: P = [ex + ((h[0] - ex) / dl) * tl, ey + ((h[1] - ey) / dl) * tl];
        const nx = -Math.sin(ang) * 11, ny = Math.cos(ang) * 11;
        path(ellipse(bx, by, rx, ry));
        path(poly([[ex - nx, ey - ny], tip, [ex + nx, ey + ny]]));
        lines.forEach((l, i) => text(l, bx, by + bs * 0.35 + (i - (lines.length - 1) / 2) * bs * 1.25, bs, col.ink, 'center'));
      }
      if (d.caption) {
        const cs = portrait ? 30 : 24;
        text(wrap(c, d.caption, cs, box.w)[0] || '', cx, bottom - 8, cs, col.accent, 'center');
      }
      break;
    }
    case 'statement': {
      const size = portrait ? 46 : 38;
      const lines = wrap(c, d.text || '', size, box.w - 10).slice(0, 5);
      const y0 = top + Math.max(size, (avail - lines.length * size * 1.35) / 2);
      let lastW = 0, lastY = 0;
      lines.forEach((l, i) => { lastY = y0 + i * size * 1.35; lastW = text(l, cx, lastY, size, col.ink, 'center'); });
      if (lines.length) path(wavy(cx - lastW / 2, cx + lastW / 2, lastY + 14), col.accent, 3.4);
      break;
    }
  }
  return els;
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString('vi-VN');

export function drawElement(c: Ctx, e: Element, p: number, alpha: number, pen: Pen = { passes: [[0, 0, 1, 1]], width: 1 }, tau = 0) {
  if (p <= 0 || alpha <= 0) return;
  if (e.kind === 'lines') { drawLines(c, e.lines, e.len * p, e.color, e.width * pen.width, pen.passes, alpha); return; }
  if (e.kind === 'actor') {
    const lines = p < 1 ? e.first : actorAt(e.actor, tau);
    drawLines(c, lines, p < 1 ? e.len * p : Infinity, e.color, e.width * pen.width, pen.passes, alpha);
    return;
  }
  c.save();
  if (e.kind === 'peep') {
    const P = e.peep, br = p >= 1 ? 1 + Math.sin(tau * 2.4 + e.x * 0.05) * 0.008 : 1, sway = p >= 1 ? Math.sin(tau * 0.9 + e.x) * 0.012 : 0;
    c.globalAlpha *= alpha;
    c.translate(e.x, e.y); c.rotate(sway); c.scale(e.flip, br);
    P.draw(c, p, -P.ax, -P.h);
    c.restore(); return;
  }
  if (e.kind === 'image') {
    // the picture is revealed by a growing rounded window and a soft pop
    const q = Math.min(1, p * 1.15), k = 0.9 + 0.1 * q;
    c.globalAlpha = alpha * Math.min(1, p * 2);
    c.translate(e.x + e.w / 2, e.y + e.h / 2); c.scale(k, k); c.translate(-e.w / 2, -e.h / 2);
    c.beginPath();
    if (e.shape === 'circle') c.arc(e.w / 2, e.h / 2, Math.min(e.w, e.h) / 2, 0, Math.PI * 2);
    else roundRect(c, 0, 0, e.w, e.h * q, Math.min(e.w, e.h) * 0.08);
    c.save(); c.clip();
    const s = Math.max(e.w / e.img.width, e.h / e.img.height), dw = e.img.width * s, dh = e.img.height * s;
    c.drawImage(e.img, (e.w - dw) / 2, (e.h - dh) / 2, dw, dh);
    c.restore();
    c.lineWidth = 4; c.strokeStyle = e.color; c.stroke();
    c.restore(); return;
  }
  if (e.kind === 'qr') {
    const n = e.cells.length, cell = e.size / (n + 2);
    c.globalAlpha = alpha * Math.min(1, p * 1.5);
    c.fillStyle = '#ffffff'; c.beginPath(); roundRect(c, e.x, e.y, e.size, e.size, cell * 1.2); c.fill();
    c.fillStyle = '#111111';
    const rows = Math.ceil(n * Math.min(1, p * 1.2));
    for (let r = 0; r < rows; r++) for (let q = 0; q < n; q++) if (e.cells[r][q]) c.fillRect(e.x + cell * (q + 1), e.y + cell * (r + 1), cell + 0.3, cell + 0.3);
    c.restore(); return;
  }
  if (e.kind === 'fill') {
    c.globalAlpha = alpha * 0.85 * p; c.fillStyle = e.color; c.beginPath();
    e.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill();
    c.restore(); return;
  }
  if (e.kind === 'text') {
    c.beginPath(); c.rect(e.x - 4, e.y - e.size * 1.15, e.w * p + 6, e.size * 1.6); c.clip();
    c.font = `${e.size}px ${e.font || 'Pangolin'}`; c.textAlign = 'left'; c.fillStyle = e.color;
    for (const [dx, dy, a] of pen.passes) { c.globalAlpha = alpha * a; c.fillText(e.text, e.x + dx * 0.6, e.y + dy * 0.6); }
    c.restore(); return;
  }
  const L = e.len * p;
  c.strokeStyle = e.color; c.lineCap = 'round'; c.lineJoin = 'round';
  // index of the last whole segment and the partial tip
  let n = 1;
  while (n < e.pts.length - 1 && e.cum[n] < L) n++;
  const a = e.pts[n - 1], b = e.pts[n], u = Math.max(0, Math.min(1, (L - e.cum[n - 1]) / (e.cum[n] - e.cum[n - 1] || 1)));
  const tip: [number, number] = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  for (const [dx, dy, al, wm] of pen.passes) {
    c.globalAlpha = alpha * al;
    if (pen.brush) {
      // brush: thick in the middle of a stroke, thin at its ends
      for (let i = 1; i <= n; i++) {
        const t = e.cum[i] / (e.len || 1);
        c.lineWidth = e.width * pen.width * wm * (0.45 + 1.1 * Math.sin(Math.PI * Math.min(1, t)) ** 0.7);
        const q = i === n ? tip : e.pts[i];
        c.beginPath(); c.moveTo(e.pts[i - 1][0] + dx, e.pts[i - 1][1] + dy); c.lineTo(q[0] + dx, q[1] + dy); c.stroke();
      }
    } else {
      c.lineWidth = e.width * pen.width * wm;
      c.beginPath(); c.moveTo(e.pts[0][0] + dx, e.pts[0][1] + dy);
      for (let i = 1; i < n; i++) c.lineTo(e.pts[i][0] + dx, e.pts[i][1] + dy);
      c.lineTo(tip[0] + dx, tip[1] + dy); c.stroke();
    }
  }
  c.restore();
}

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}

/** Centre of an element (motion graphics scale things around it). */
export function elementCentre(e: Element): [number, number] {
  if (e.kind === 'image') return [e.x + e.w / 2, e.y + e.h / 2];
  if (e.kind === 'qr') return [e.x + e.size / 2, e.y + e.size / 2];
  if (e.kind === 'text') return [e.x + e.w / 2, e.y - e.size * 0.35];
  if (e.kind === 'peep') return [e.x, e.y - e.peep.h / 2];
  const all: [number, number][] = e.kind === 'path' || e.kind === 'fill' ? e.pts : e.kind === 'lines' ? e.lines.flat() : e.first.flat();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of all) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return isFinite(x0) ? [(x0 + x1) / 2, (y0 + y1) / 2] : [0, 0];
}

export function elementPen(e: Element, p: number): [number, number] {
  if (e.kind === 'image') return [e.x + e.w * p, e.y + e.h * Math.min(1, p * 1.15)];
  if (e.kind === 'qr') return [e.x + e.size, e.y + e.size * p];
  if (e.kind === 'fill') return e.anchor;
  if (e.kind === 'peep') { const q = e.peep.pen(p); return [e.x + (q.x - e.peep.ax) * e.flip, e.y + q.y - e.peep.h]; }
  if (e.kind === 'actor') return pointAlong(e.first, e.len * p);
  if (e.kind === 'lines') return pointAlong(e.lines, e.len * p);
  if (e.kind === 'text') return [e.x + e.w * p, e.y - e.size * 0.3 + Math.sin(p * e.w * 0.2) * e.size * 0.18];
  const L = e.len * p;
  let i = 1;
  while (i < e.cum.length - 1 && e.cum[i] < L) i++;
  const a = e.pts[i - 1], b = e.pts[i], u = Math.max(0, Math.min(1, (L - e.cum[i - 1]) / (e.cum[i] - e.cum[i - 1] || 1)));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}
