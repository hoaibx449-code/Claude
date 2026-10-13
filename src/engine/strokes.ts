// Stroke-by-stroke drawing of line art. The picture (inked lines on transparency) is thinned to
// its centre lines (Zhang–Suen), the skeleton is walked into continuous polylines, smoothed,
// and put in a drawing order a person would follow (top first, then always the nearest stroke,
// continuing through junctions without lifting the pen). The plan maps drawing progress p to
// the exact pen point, so the hand's nib sits on the end of the line being drawn: the picture is
// revealed by a thick stroke along the same centre lines, never by a sweep across the panel.
// Pure functions of the input pixels: browser preview and server render draw the same strokes.

export type Pt = [number, number];

export interface StrokePlan {
  /** ordered strokes in panel (logical) coordinates */
  strokes: Pt[][];
  /** cumulative arc length inside each stroke */
  cums: number[][];
  /** drawing cost at the start of each stroke (pen travel before it included) and in total */
  starts: number[];
  total: number;
  /** cost of the travel move that precedes each stroke (0 when it continues the previous one) */
  travel: number[];
  /** width of the reveal stroke, logical px, per stroke (thick filled shapes get wide ones) */
  widths: number[];
}

/** Share of the panel's time spent on the lines; the rest settles tones and tiny details. */
export const LINE_SHARE = 0.9;
const TRAVEL = 0.3; // the pen moves faster in the air than on the paper
const LIFT = 7; // fixed cost (px of line) of lifting and placing the pen again
const MIN_LEN = 3; // shorter bits are left to the final settle

/**
 * Thin binary image in place (1 = ink). Zhang & Suen, "A fast parallel algorithm for thinning
 * digital patterns", CACM 1984.
 */
export function thin(b: Uint8Array, w: number, h: number) {
  const del: number[] = [];
  for (let changed = true, iter = 0; changed && iter < 60; iter++) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      del.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!b[i]) continue;
          const p2 = b[i - w], p3 = b[i - w + 1], p4 = b[i + 1], p5 = b[i + w + 1], p6 = b[i + w], p7 = b[i + w - 1], p8 = b[i - 1], p9 = b[i - w - 1];
          const n = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (n < 2 || n > 6) continue;
          const a = (+(!p2 && p3)) + (+(!p3 && p4)) + (+(!p4 && p5)) + (+(!p5 && p6)) + (+(!p6 && p7)) + (+(!p7 && p8)) + (+(!p8 && p9)) + (+(!p9 && p2));
          if (a !== 1) continue;
          if (step === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue;
          del.push(i);
        }
      }
      if (del.length) changed = true;
      for (const i of del) b[i] = 0;
    }
  }
}

/** Chamfer (3-4) distance of every ink pixel to the background, in pixels. */
export function distance(b: Uint8Array, w: number, h: number) {
  const d = new Float32Array(w * h), F = 1e6;
  for (let i = 0; i < d.length; i++) d[i] = b[i] ? F : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!d[i]) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 3); else v = Math.min(v, 3);
    if (y > 0) { v = Math.min(v, d[i - w] + 3); if (x > 0) v = Math.min(v, d[i - w - 1] + 4); if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4); } else v = Math.min(v, 3);
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!d[i]) continue;
    let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + 3); else v = Math.min(v, 3);
    if (y < h - 1) { v = Math.min(v, d[i + w] + 3); if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4); if (x > 0) v = Math.min(v, d[i + w - 1] + 4); } else v = Math.min(v, 3);
    d[i] = v;
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

const N8: Pt[] = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];

/** Walk a one-pixel skeleton into polylines (pixel coordinates). */
export function trace(b: Uint8Array, w: number, h: number): Pt[][] {
  const seen = new Uint8Array(w * h), out: Pt[][] = [];
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && b[y * w + x] === 1;
  const degree = (x: number, y: number) => { let n = 0; for (const [dx, dy] of N8) if (at(x + dx, y + dy)) n++; return n; };
  const walk = (sx: number, sy: number, from?: Pt) => {
    const line: Pt[] = from ? [from, [sx, sy]] : [[sx, sy]];
    seen[sy * w + sx] = 1;
    let x = sx, y = sy, dx = from ? sx - from[0] : 0, dy = from ? sy - from[1] : 0;
    for (;;) {
      // keep going the way the line goes: the unvisited neighbour with the smallest turn
      let best = -1, bx = 0, by = 0, score = -9;
      for (let k = 0; k < 8; k++) {
        const nx = x + N8[k][0], ny = y + N8[k][1];
        if (!at(nx, ny) || seen[ny * w + nx]) continue;
        const ux = N8[k][0], uy = N8[k][1], len = k < 4 ? 1 : Math.SQRT2;
        const s = (dx || dy ? (ux * dx + uy * dy) / (len * Math.hypot(dx, dy)) : 0) + (k < 4 ? 0.01 : 0);
        if (s > score) { score = s; best = k; bx = nx; by = ny; }
      }
      if (best < 0) break;
      seen[by * w + bx] = 1; line.push([bx, by]);
      // direction from a few pixels back, so stair steps do not steer the walk
      const back = line[Math.max(0, line.length - 4)];
      dx = bx - back[0]; dy = by - back[1]; x = bx; y = by;
    }
    if (line.length > 1) out.push(line);
  };
  // 1. from the free ends of lines
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y) && !seen[y * w + x] && degree(x, y) === 1) walk(x, y);
  // 2. branches left at junctions start from the line they leave, so they stay attached
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!at(x, y) || seen[y * w + x]) continue;
      let from: Pt | undefined;
      for (const [dx, dy] of N8) if (at(x + dx, y + dy) && seen[(y + dy) * w + x + dx]) { from = [x + dx, y + dy]; break; }
      if (from || pass === 1) walk(x, y, from);
    }
  }
  return out;
}

/** Remove pixel stair steps: a light moving average, then Ramer–Douglas–Peucker. */
export function smooth(line: Pt[], eps = 0.6): Pt[] {
  if (line.length < 3) return line;
  const avg: Pt[] = line.map((p, i) => {
    if (i === 0 || i === line.length - 1) return p;
    const a = line[i - 1], c = line[i + 1];
    return [(a[0] + 2 * p[0] + c[0]) / 4, (a[1] + 2 * p[1] + c[1]) / 4];
  });
  return rdp(avg, eps);
}

export function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1, dmax = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
      if (d > dmax) { dmax = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const length = (l: Pt[]) => { let s = 0; for (let i = 1; i < l.length; i++) s += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]); return s; };
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Drawing order: start with the topmost stroke (heads before feet), then always the nearest
 * unused stroke end (strokes may be drawn backwards). Ties go to the longer stroke.
 */
export function order(lines: Pt[][]): { i: number; pts: Pt[] }[] {
  const left = lines.map((pts, i) => ({ i, pts })), out: { i: number; pts: Pt[] }[] = [];
  if (!left.length) return out;
  const top = (l: Pt[]) => { let m = Infinity; for (const p of l) m = Math.min(m, p[1]); return m; };
  let first = 0;
  for (let i = 1; i < left.length; i++) if (top(left[i].pts) < top(left[first].pts) - 0.5) first = i;
  let cur = left.splice(first, 1)[0];
  if (cur.pts[cur.pts.length - 1][1] < cur.pts[0][1]) cur = { i: cur.i, pts: cur.pts.slice().reverse() };
  out.push(cur);
  while (left.length) {
    const end = cur.pts[cur.pts.length - 1];
    let bi = 0, rev = false, bd = Infinity;
    for (let i = 0; i < left.length; i++) {
      const l = left[i].pts, d0 = dist(end, l[0]), d1 = dist(end, l[l.length - 1]);
      const bonus = Math.min(1.5, length(l) * 0.01); // between equally near strokes, the longer
      if (d0 - bonus < bd) { bd = d0 - bonus; bi = i; rev = false; }
      if (d1 - bonus < bd) { bd = d1 - bonus; bi = i; rev = true; }
    }
    cur = left.splice(bi, 1)[0];
    if (rev) cur = { i: cur.i, pts: cur.pts.slice().reverse() };
    out.push(cur);
  }
  return out;
}

/** Time plan for ordered strokes (cost = line length + cheaper pen travel + a little per lift). */
export function planStrokes(strokes: Pt[][], widths: number[]): StrokePlan {
  const cums: number[][] = [], starts: number[] = [], travel: number[] = [];
  let total = 0;
  strokes.forEach((s, i) => {
    const c = [0];
    for (let j = 1; j < s.length; j++) c.push(c[j - 1] + dist(s[j], s[j - 1]));
    cums.push(c);
    const d = i ? dist(strokes[i - 1][strokes[i - 1].length - 1], s[0]) : 0;
    const tr = i && d > 1.5 ? d * TRAVEL + LIFT : 0;
    travel.push(tr); total += tr; starts.push(total); total += c[c.length - 1];
  });
  return { strokes, cums, starts, total, travel, widths };
}

/**
 * Strokes of a picture. `px` is RGBA of the picture at a working scale `s` (working px per
 * logical px). Returns null when the picture is not line art (too much ink to draw line by line).
 */
export function extractStrokes(px: Uint8ClampedArray, w: number, h: number, s: number): StrokePlan | null {
  const b = new Uint8Array(w * h);
  let ink = 0;
  for (let i = 0; i < w * h; i++) if (px[i * 4 + 3] > 96) { b[i] = 1; ink++; }
  if (!ink || ink > w * h * 0.35) return null;
  const dt = distance(b, w, h);
  thin(b, w, h);
  const raw = trace(b, w, h).filter((l) => length(l) >= MIN_LEN);
  if (!raw.length || raw.length > 2500) return null;
  // each stroke reveals as wide as the ink around its centre line (a filled shoe, not just a line)
  const widths: number[] = [];
  const lines = raw.map((l) => {
    const r = l.map(([x, y]) => dt[y * w + x]).sort((a, b) => a - b), half = r[Math.floor(r.length * 0.9)] || 1;
    widths.push(Math.max(3, Math.min(60, (2 * half + 1.5) / s + 2)));
    return smooth(l).map(([x, y]): Pt => [(x + 0.5) / s, (y + 0.5) / s]);
  });
  const ordered = order(lines);
  return planStrokes(ordered.map((o) => o.pts), ordered.map((o) => widths[o.i]));
}

export interface PenState {
  /** strokes finished */
  done: number;
  /** current stroke and how far along it (arc length), -1 while travelling to it */
  along: number;
  x: number; y: number;
  /** 0 on the paper, up to 1 when the pen is lifted between strokes */
  lift: number;
}

const easeIO = (u: number) => u * u * (3 - 2 * u);

/** Where the pen is at drawing progress q (0..1 of the line drawing). */
export function penState(P: StrokePlan, q: number): PenState {
  const S = P.strokes, n = S.length;
  if (!n) return { done: 0, along: -1, x: 0, y: 0, lift: 0 };
  const C = Math.max(0, Math.min(1, q)) * P.total;
  // last stroke whose travel has begun
  let lo = 0, hi = n - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (P.starts[mid] - P.travel[mid] <= C) lo = mid; else hi = mid - 1; }
  const i = lo, s = S[i], cum = P.cums[i], L = cum[cum.length - 1];
  if (C < P.starts[i]) {
    // in the air between the previous stroke and this one
    const a = S[i - 1][S[i - 1].length - 1], b = s[0], u = easeIO((C - (P.starts[i] - P.travel[i])) / (P.travel[i] || 1));
    const d = dist(a, b);
    return { done: i, along: -1, x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, lift: Math.sin(Math.PI * u) * Math.min(1, d / 70) };
  }
  if (C >= P.starts[i] + L) { const e = s[s.length - 1]; return { done: i + 1, along: L, x: e[0], y: e[1], lift: 0 }; }
  const l = C - P.starts[i];
  let j = 1;
  while (j < cum.length - 1 && cum[j] < l) j++;
  const u = (l - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
  return { done: i, along: l, x: s[j - 1][0] + (s[j][0] - s[j - 1][0]) * u, y: s[j - 1][1] + (s[j][1] - s[j - 1][1]) * u, lift: 0 };
}

/** Trace stroke i into the current path, up to arc length `upto` (whole stroke by default). */
export function pathStroke(c: { moveTo(x: number, y: number): void; lineTo(x: number, y: number): void }, P: StrokePlan, i: number, upto = Infinity) {
  const s = P.strokes[i], cum = P.cums[i];
  c.moveTo(s[0][0], s[0][1]);
  for (let j = 1; j < s.length; j++) {
    if (cum[j] <= upto) { c.lineTo(s[j][0], s[j][1]); continue; }
    const u = (upto - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    c.lineTo(s[j - 1][0] + (s[j][0] - s[j - 1][0]) * u, s[j - 1][1] + (s[j][1] - s[j - 1][1]) * u);
    break;
  }
  if (s.length === 1 || upto >= cum[cum.length - 1]) c.lineTo(s[s.length - 1][0] + 0.01, s[s.length - 1][1]);
}
