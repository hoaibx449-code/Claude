// Free compositions: every scene is laid out for its own sentence (handwritten words, line-art
// icons, animated stick figures, small charts, arrows, circles...), like a person sketching the
// idea on a board. The script gives rough positions; this file measures everything, keeps it
// on the page, moves items that would overlap, and routes arrows between items by id.
import type { Ctx, InkColor, SketchItem } from './types.ts';
import { buildDiagram, ellipse, line, poly, wavy, wobble, wrap, type Box, type Colors, type Element, type P } from './diagram.ts';
import { flatten } from './svgpath.ts';
import { ACTIONS, actorAt, lengthOf, type Action } from './stick.ts';

/** Icon name → SVG path data joined with "|" (24×24 line art, assets/icons/tabler.json). */
export type IconSet = Record<string, string>;

interface BBox { x0: number; y0: number; x1: number; y1: number }
const SIZES = { s: [26, 22], m: [34, 28], l: [44, 36], xl: [58, 48], xxl: [96, 80] } as const;

/** Best match for an icon name the script asked for (exact, then close spellings). */
export function resolveIcon(name: string, icons: IconSet): string | null {
  const n = String(name || '').toLowerCase().trim().replace(/[\s_]+/g, '-');
  if (!n) return null;
  if (icons[n]) return n;
  for (const v of [n.replace(/-(outline|icon|line)$/, ''), n.replace(/s$/, ''), n.split('-')[0]]) if (icons[v]) return v;
  const keys = Object.keys(icons);
  return keys.find((k) => k.startsWith(n + '-')) || keys.find((k) => k.split('-').includes(n.split('-')[0])) || null;
}

const overlap = (a: BBox, b: BBox) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const area = (a: BBox) => Math.max(1, (a.x1 - a.x0) * (a.y1 - a.y0));

export function buildSketch(c: Ctx, items: SketchItem[], stage: Box, col: Colors, icons: IconSet, portrait: boolean): Element[] {
  const els: Element[] = [];
  const boxes = new Map<string, BBox>();
  const placed: BBox[] = [];
  const X = (v: number) => stage.x + (stage.w * Math.max(0, Math.min(100, v))) / 100;
  const Y = (v: number) => stage.y + (stage.h * Math.max(0, Math.min(100, v))) / 100;
  const color = (k?: InkColor) => (k === 'accent' ? col.accent : k === 'accent2' ? col.accent2 : k === 'good' ? col.good : col.ink);
  let seed = 7;

  // ---- element makers; each returns the elements and their bounding box
  const pathEl = (pts: P[], clr: string, width = 3.4, line?: number): Element => {
    const w = wobble(pts, seed++), cum = [0];
    for (let i = 1; i < w.length; i++) cum.push(cum[i - 1] + Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]));
    const len = cum[cum.length - 1];
    return { kind: 'path', pts: w, cum, len, color: clr, width, weight: Math.max(0.2, len / 480), line };
  };
  const textEls = (s: string, cx: number, top: number, size: number, clr: string, maxW: number, align: 'center' | 'left', line?: number) => {
    let sz = size, rows = wrap(c, s, sz, maxW);
    // shrink until it fits in 3 rows and no single word overflows
    while (sz > 18 && (rows.length > 3 || rows.some((r) => (c.font = `${sz}px Pangolin`, c.measureText(r).width > maxW)))) { sz -= 2; rows = wrap(c, s, sz, maxW); }
    rows = rows.slice(0, 3);
    c.font = `${sz}px Pangolin`;
    const out: Element[] = [];
    let wMax = 0;
    rows.forEach((r, i) => {
      const w = c.measureText(r).width, x = align === 'center' ? cx - w / 2 : cx;
      wMax = Math.max(wMax, w);
      out.push({ kind: 'text', text: r, x, y: top + sz * 0.95 + i * sz * 1.22, size: sz, w, color: clr, weight: Math.max(0.3, r.length * 0.045), line });
    });
    const h = sz * 1.22 * rows.length;
    const x0 = align === 'center' ? cx - wMax / 2 : cx;
    return { els: out, box: { x0, y0: top, x1: x0 + wMax, y1: top + h } };
  };

  type Built = { els: Element[]; box: BBox };
  const solid = (it: any, dx: number, dy: number): Built | null => {
    const line = it.line;
    switch (it.t) {
      case 'text': {
        const size = (SIZES[it.size as keyof typeof SIZES] || SIZES.m)[portrait ? 0 : 1];
        const align = it.align === 'left' ? 'left' : 'center';
        const cx = X(it.x) + dx;
        const maxW = it.w ? (stage.w * Math.min(100, it.w)) / 100 : align === 'center' ? Math.max(120, 2 * Math.min(cx - stage.x, stage.x + stage.w - cx)) : stage.x + stage.w - cx;
        const rowsH = size * 1.22 * Math.min(3, wrap(c, it.text, size, maxW).length);
        return textEls(it.text, cx, Y(it.y) + dy - rowsH / 2, size, color(it.color), maxW, align, line);
      }
      case 'icon': {
        const name = resolveIcon(it.name, icons);
        if (!name) return null;
        const size = (stage.w * Math.max(6, Math.min(60, it.w || 22))) / 100, k = size / 24;
        const ox = X(it.x) + dx - size / 2, oy = Y(it.y) + dy - size / 2;
        const lines: P[][] = [];
        for (const d of icons[name].split('|')) for (const l of flatten(d)) lines.push(wobble(l.map(([a, b]) => [ox + a * k, oy + b * k] as P), seed++));
        const len = lengthOf(lines);
        const els: Element[] = [{ kind: 'lines', lines, len, color: color(it.color), width: Math.max(2.6, Math.min(4.2, size / 34)), weight: Math.max(0.45, len / 520), line }];
        const box: BBox = { x0: ox, y0: oy, x1: ox + size, y1: oy + size };
        if (it.label) {
          const t = textEls(it.label, ox + size / 2, oy + size + 6, SIZES.s[portrait ? 0 : 1], col.ink, Math.max(size * 1.6, 140), 'center', line);
          els.push(...t.els); box.y1 = t.box.y1; box.x0 = Math.min(box.x0, t.box.x0); box.x1 = Math.max(box.x1, t.box.x1);
        }
        return { els, box };
      }
      case 'person': {
        const hpx = (stage.h * Math.max(12, Math.min(60, it.h || 30))) / 100, k = hpx / 172;
        const x = X(it.x) + dx, ground = Y(it.y) + dy + hpx / 2;
        const action = (ACTIONS.includes(it.action) ? it.action : 'idle') as Action;
        const facing: 1 | -1 = it.facing === -1 ? -1 : 1, moving = action === 'walk' || action === 'run';
        const x0 = moving ? x - facing * Math.min(stage.w * 0.25, 120) : x;
        const actor = { action, x0: Math.max(stage.x + 20, Math.min(stage.x + stage.w - 20, x0)), x1: x, ground, scale: k, facing };
        const first = actorAt(actor, 0), len = lengthOf(first);
        const els: Element[] = [{ kind: 'actor', actor, first, len, color: col.ink, width: 3.6, weight: Math.max(0.6, len / 380), line }];
        const box: BBox = { x0: x - 45 * k, y0: ground - hpx, x1: x + 45 * k, y1: ground };
        if (it.label) {
          const t = textEls(it.label, x, ground + 4, SIZES.s[portrait ? 0 : 1], col.accent2, 160, 'center', line);
          els.push(...t.els); box.y1 = t.box.y1;
        }
        if (it.bubble) {
          // speech bubble beside the head, on the side with more room
          const right = x < stage.x + stage.w / 2, bs = SIZES.s[portrait ? 0 : 1];
          const bw = Math.min(stage.w * 0.42, 230), rows = wrap(c, it.bubble, bs, bw * 0.78).slice(0, 3);
          const bh = rows.length * bs * 1.22 + 26, head: P = [x, ground - hpx + 14 * k];
          const bx = right ? Math.min(stage.x + stage.w - bw / 2 - 4, x + 30 * k + bw / 2) : Math.max(stage.x + bw / 2 + 4, x - 30 * k - bw / 2);
          const by = Math.max(stage.y + bh / 2 + 2, head[1] - bh * 0.7);
          els.push(pathEl(ellipse(bx, by, bw / 2, bh / 2), col.ink, 3, line));
          const ex = bx + (right ? -1 : 1) * bw * 0.32, ey = by + bh * 0.42;
          els.push(pathEl(poly([[ex - 10, ey], [head[0] + (right ? 22 : -22) * k, head[1] - 4], [ex + 10, ey]]), col.ink, 3, line));
          rows.forEach((r, i) => {
            c.font = `${bs}px Pangolin`; const w = c.measureText(r).width;
            els.push({ kind: 'text', text: r, x: bx - w / 2, y: by - (rows.length - 1) * bs * 0.61 + i * bs * 1.22 + bs * 0.35, size: bs, w, color: col.ink, weight: 0.4, line });
          });
          box.y0 = Math.min(box.y0, by - bh / 2); box.x0 = Math.min(box.x0, bx - bw / 2); box.x1 = Math.max(box.x1, bx + bw / 2);
        }
        return { els, box };
      }
      case 'chart': {
        const w = (stage.w * Math.max(30, Math.min(100, it.w || 80))) / 100, h = (stage.h * Math.max(15, Math.min(80, it.h || 35))) / 100;
        const box: Box = { x: X(it.x) + dx - w / 2, y: Y(it.y) + dy - h / 2, w, h };
        const { t: _t, x: _x, y: _y, w: _w, h: _h, line: _l, id: _id, ...spec } = it;
        const els = buildDiagram(c, spec, box, col).map((e) => ({ ...e, line }));
        return els.length ? { els, box: { x0: box.x, y0: box.y, x1: box.x + w, y1: box.y + h } } : null;
      }
    }
    return null;
  };

  // ---- pass 1: things with a size, nudged apart and kept on the page
  const order: { it: any; built: Built; idx: number }[] = [];
  items.forEach((it: any, idx) => {
    if (!['text', 'icon', 'person', 'chart'].includes(it.t)) return;
    let built = solid(it, 0, 0);
    if (!built) return;
    const fit = (b: BBox) => [Math.max(0, stage.x - b.x0) - Math.max(0, b.x1 - (stage.x + stage.w)), Math.max(0, stage.y - b.y0) - Math.max(0, b.y1 - (stage.y + stage.h))];
    const bad = (b: BBox) => placed.some((p) => overlap(p, b) > 0.12 * Math.min(area(p), area(b)));
    let [dx, dy] = fit(built.box);
    if (dx || dy) built = solid(it, dx, dy) || built;
    if (bad(built.box)) {
      const step = stage.h * 0.04;
      found: for (let r = 1; r <= 12; r++) {
        for (const [ox, oy] of [[0, r], [0, -r], [r, 0], [-r, 0], [r, r], [-r, r]]) {
          const b = shift(built.box, ox * step, oy * step);
          const [fx, fy] = fit(b);
          if (fx || fy || bad(b)) continue;
          built = solid(it, dx + ox * step, dy + oy * step) || built; break found;
        }
      }
    }
    placed.push(built.box);
    boxes.set(it.id || `i${idx}`, built.box);
    boxes.set(String(idx), built.box);
    order.push({ it, built, idx });
  });

  // ---- pass 2: everything in script order (connectors need the final boxes)
  const target = (ref: unknown): BBox | null => {
    if (Array.isArray(ref)) { const x = X(Number(ref[0])), y = Y(Number(ref[1])); return { x0: x, y0: y, x1: x, y1: y }; }
    return boxes.get(String(ref)) || null;
  };
  const centre = (b: BBox): P => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  // point where the segment from the centre of b towards p leaves b (plus a gap)
  const edge = (b: BBox, p: P, gap = 12): P => {
    const [cx, cy] = centre(b), dx = p[0] - cx, dy = p[1] - cy;
    if (!dx && !dy) return [cx, cy];
    const hw = (b.x1 - b.x0) / 2 + gap, hh = (b.y1 - b.y0) / 2 + gap;
    const s = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity, 1);
    return [cx + dx * s, cy + dy * s];
  };
  items.forEach((it: any, idx) => {
    const done = order.find((o) => o.idx === idx);
    if (done) { els.push(...done.built.els); return; }
    const line = it.line;
    if (it.t === 'arrow') {
      const A = target(it.from), B = target(it.to);
      if (!A || !B) return;
      const a = edge(A, centre(B)), b = edge(B, centre(A));
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 24) return;
      const bend = Math.max(-1, Math.min(1, Number(it.curve) || 0)) * 0.35;
      const mx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * bend, my = (a[1] + b[1]) / 2 + (b[0] - a[0]) * bend;
      const pts: P[] = [];
      for (let i = 0; i <= 30; i++) { const u = i / 30, v = 1 - u; pts.push([v * v * a[0] + 2 * v * u * mx + u * u * b[0], v * v * a[1] + 2 * v * u * my + u * u * b[1]]); }
      els.push(pathEl([...pts, ...arrowHead(pts[pts.length - 4], b)], color(it.color || 'accent2'), 3.4, line));
      if (it.label) {
        const t = textEls(it.label, mx, my - SIZES.s[portrait ? 0 : 1] * 1.4, SIZES.s[portrait ? 0 : 1], color(it.color || 'accent2'), 200, 'center', line);
        els.push(...t.els);
      }
      return;
    }
    const B = target(it.on);
    if (!B) return;
    const [cx, cy] = centre(B), w = B.x1 - B.x0, h = B.y1 - B.y0;
    switch (it.t) {
      case 'circle': els.push(pathEl(ellipse(cx, cy, w / 2 + 18 + w * 0.08, h / 2 + 14 + h * 0.1), color(it.color || 'accent'), 3.4, line)); break;
      case 'underline': els.push(pathEl(wavy(B.x0, B.x1, B.y1 + 6), color(it.color || 'accent'), 3.2, line)); break;
      case 'box': els.push(pathEl(poly([[B.x0 - 12, B.y0 - 10], [B.x1 + 12, B.y0 - 10], [B.x1 + 12, B.y1 + 10], [B.x0 - 12, B.y1 + 10]], true), color(it.color), 3.2, line)); break;
      case 'cross': {
        const s = Math.min(w, h) * 0.5 + 10;
        els.push(pathEl(line_(cx - s, cy - s, cx + s, cy + s), color(it.color || 'accent'), 4.4, line));
        els.push(pathEl(line_(cx + s, cy - s, cx - s, cy + s), color(it.color || 'accent'), 4.4, line));
        break;
      }
      case 'check': {
        const s = Math.max(18, Math.min(w, h) * 0.22), x = B.x1 + 6, y = B.y0 + s;
        els.push(pathEl(poly([[x - s, y], [x - s * 0.35, y + s * 0.75], [x + s, y - s]]), color(it.color || 'good'), 4.4, line));
        break;
      }
    }
  });
  return els;
}

const shift = (b: BBox, dx: number, dy: number): BBox => ({ x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy });
const line_ = (x0: number, y0: number, x1: number, y1: number) => line([x0, y0], [x1, y1]);
function arrowHead(from: P, b: P): P[] {
  const ang = Math.atan2(b[1] - from[1], b[0] - from[0]), h = 16;
  const l: P = [b[0] - h * Math.cos(ang - 0.5), b[1] - h * Math.sin(ang - 0.5)], r: P = [b[0] - h * Math.cos(ang + 0.5), b[1] - h * Math.sin(ang + 0.5)];
  return [...line(b, l), ...line(l, b), ...line(b, r)];
}
