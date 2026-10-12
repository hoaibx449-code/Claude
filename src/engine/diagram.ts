// Hand-drawn diagrams: titles, bar charts, comparisons, steps, big numbers and
// statements, drawn stroke by stroke with the hand following the pen (no images needed).
import type { Ctx, DiagramSpec } from './types.ts';

export interface Box { x: number; y: number; w: number; h: number }
interface Colors { ink: string; accent: string; good: string }

export type Element =
  | { kind: 'path'; pts: [number, number][]; cum: number[]; len: number; color: string; width: number; weight: number }
  | { kind: 'text'; text: string; x: number; y: number; size: number; w: number; color: string; weight: number };

type P = [number, number];
function line(a: P, b: P, step = 5): P[] {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(d / step)), o: P[] = [];
  for (let i = 0; i <= n; i++) o.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return o;
}
function poly(pts: P[], closed = false): P[] {
  const all = closed ? [...pts, pts[0]] : pts, o: P[] = [];
  for (let i = 0; i < all.length - 1; i++) { const s = line(all[i], all[i + 1]); if (i) s.shift(); o.push(...s); }
  return o;
}
function ellipse(cx: number, cy: number, rx: number, ry: number): P[] {
  const o: P[] = [];
  for (let i = 0; i <= 52; i++) { const a = -Math.PI * 0.6 + (i / 48) * Math.PI * 2; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return o;
}
function arrow(a: P, b: P): P[] {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), h = 16;
  const l: P = [b[0] - h * Math.cos(ang - 0.5), b[1] - h * Math.sin(ang - 0.5)], r: P = [b[0] - h * Math.cos(ang + 0.5), b[1] - h * Math.sin(ang + 0.5)];
  return [...line(a, b), ...line(b, l), ...line(l, b), ...line(b, r)];
}
function wavy(x0: number, x1: number, y: number): P[] {
  const o: P[] = [];
  for (let x = x0; x <= x1; x += 4) o.push([x, y + Math.sin((x - x0) / 9) * 3]);
  return o;
}
// tiny deterministic wobble so strokes look hand drawn
function wobble(pts: P[], seed: number): P[] {
  return pts.map(([x, y], i) => [x + Math.sin(i * 0.7 + seed) * 0.7, y + Math.cos(i * 0.9 + seed * 1.3) * 0.7]);
}

export function wrap(c: Ctx, text: string, size: number, max: number): string[] {
  c.font = `${size}px Pangolin`;
  const out: string[] = []; let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? cur + ' ' + w : w;
    if (c.measureText(next).width > max && cur) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

export function buildDiagram(c: Ctx, d: DiagramSpec, box: Box, col: Colors): Element[] {
  const els: Element[] = [];
  let seed = 1;
  const path = (pts: P[], color = col.ink, width = 3.4) => {
    const w = wobble(pts, seed++), cum = [0];
    for (let i = 1; i < w.length; i++) cum.push(cum[i - 1] + Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]));
    const len = cum[cum.length - 1];
    els.push({ kind: 'path', pts: w, cum, len, color, width, weight: Math.max(0.25, len / 420) });
  };
  const text = (s: string, x: number, y: number, size: number, color = col.ink, align: 'left' | 'center' = 'left') => {
    c.font = `${size}px Pangolin`;
    const w = c.measureText(s).width;
    els.push({ kind: 'text', text: s, x: align === 'center' ? x - w / 2 : x, y, size, w, color, weight: Math.max(0.35, s.length * 0.045) });
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
    case 'bars': {
      const vals = (d.values || []).slice(0, 5), labels = d.labels || [];
      if (!vals.length) break;
      const x0 = box.x + 8, x1 = box.x + box.w - 8, yb = bottom - 34, yt = top + 34, max = Math.max(...vals, 1e-9);
      path(poly([[x0, yt - 10], [x0, yb], [x1, yb]]));
      const slot = (x1 - x0) / vals.length, bw = Math.min(90, slot * 0.6);
      vals.forEach((v, i) => {
        const bx = x0 + slot * (i + 0.5) - bw / 2, h = Math.max(6, ((yb - yt) * v) / max);
        path(poly([[bx, yb], [bx, yb - h], [bx + bw, yb - h], [bx + bw, yb]]));
        text(`${fmt(v)}${d.unit || ''}`, bx + bw / 2, yb - h - 12, portrait ? 30 : 24, v === max ? col.accent : col.ink, 'center');
        if (labels[i]) text(labels[i].slice(0, 14), bx + bw / 2, yb + 30, portrait ? 24 : 20, col.ink, 'center');
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

export function drawElement(c: Ctx, e: Element, p: number, alpha: number) {
  if (p <= 0 || alpha <= 0) return;
  c.save(); c.globalAlpha = alpha;
  if (e.kind === 'text') {
    c.beginPath(); c.rect(e.x - 4, e.y - e.size * 1.15, e.w * p + 6, e.size * 1.6); c.clip();
    c.font = `${e.size}px Pangolin`; c.textAlign = 'left'; c.fillStyle = e.color; c.fillText(e.text, e.x, e.y);
  } else {
    const L = e.len * p;
    c.strokeStyle = e.color; c.lineWidth = e.width; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(e.pts[0][0], e.pts[0][1]);
    for (let i = 1; i < e.pts.length; i++) {
      if (e.cum[i] <= L) { c.lineTo(e.pts[i][0], e.pts[i][1]); continue; }
      const a = e.pts[i - 1], b = e.pts[i], u = (L - e.cum[i - 1]) / (e.cum[i] - e.cum[i - 1] || 1);
      c.lineTo(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u);
      break;
    }
    c.stroke();
  }
  c.restore();
}

export function elementPen(e: Element, p: number): [number, number] {
  if (e.kind === 'text') return [e.x + e.w * p, e.y - e.size * 0.3 + Math.sin(p * e.w * 0.2) * e.size * 0.18];
  const L = e.len * p;
  let i = 1;
  while (i < e.cum.length - 1 && e.cum[i] < L) i++;
  const a = e.pts[i - 1], b = e.pts[i], u = Math.max(0, Math.min(1, (L - e.cum[i - 1]) / (e.cum[i] - e.cum[i - 1] || 1)));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}
