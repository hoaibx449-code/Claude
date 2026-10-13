// Adaptive hand positioning: the drawing hand comes in from outside the frame at the angle that
// suits the stroke being drawn. Five photographed poses (assets/hands/poses, made by
// tools/hands-build.py) give the ways in: from the bottom right (A), the right (B), below (C,
// the bottom-right pose turned rigidly), the bottom left (D) and the top (E). For every stroke
// the planner weighs how much forearm would show, how much of the drawing the hand would
// cover, how natural the way in is for the frame's shape, and whether it keeps the movement
// continuous; a change of way happens only while the hand is out of the frame. When no way in
// is natural the stroke draws itself with no hand. The pen is a separate drawing held between
// the hand and the fingers in front of it, so the tool can change without moving the nib.
import type { Ctx, Img } from './types.ts';

type P = [number, number];

/** Anchors of one photographed pose, in its asset pixels (see tools/hands-build.py). */
export interface PoseMeta {
  id: string; width: number; height: number;
  /** pen tip, pen end, where the fingers hold it, the narrowest part of the wrist, where the photo's forearm is cut */
  tip: P; back: P; grip: P; wrist: P; cut: P;
  penWidth: number; penAxis: number; forearm: number; armHalf: number;
  /** the hand itself (without the forearm), for occlusion */
  box: [number, number, number, number];
}
export interface PoseAsset { img: Img; fingers: Img; arm: Img; meta: PoseMeta }

/** The ways in: a pose and a rigid turn of it (never a mirrored or twisted hand). */
export interface Way { key: 'A' | 'B' | 'C' | 'D' | 'E' | 'E2'; id: string; rot: number; prior: [number, number] }
export const WAYS: Way[] = [
  { key: 'A', id: '5', rot: 0, prior: [0, 0.12] },
  { key: 'B', id: '4', rot: 0, prior: [0.22, 0] },
  { key: 'C', id: '5', rot: 0.5, prior: [0.12, 0.28] },
  { key: 'D', id: '2', rot: 0, prior: [0.35, 0.35] },
  { key: 'E', id: '3', rot: 0, prior: [0.6, 0.55] },
  { key: 'E2', id: '1', rot: 0, prior: [0.55, 0.5] },
];

/** Something the hand draws: its time window and the nib at progress q (screen coordinates). */
export interface HandTask { start: number; end: number; pen: (q: number) => [number, number, number?]; group?: number }

export interface HandPlan {
  tasks: HandTask[];
  /** way index per task (into `ways`), -1: the stroke draws itself */
  choice: number[];
  ways: Way[];
  poses: Record<string, PoseAsset>;
  W: number; H: number; k: number; portrait: boolean;
}

const rotate = (v: P, a: number): P => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (u: number) => u * u * (3 - 2 * u);

/** Hand size: logical px per asset px (the photos share one scale). */
export const handScale = (portrait: boolean) => (portrait ? 0.48 : 0.52);
/** Most forearm the frame may show (beyond that the hand comes in another way). */
const maxArm = (W: number, H: number, portrait: boolean) => (portrait ? 0.5 * H : 0.5 * W);

/** The small, steady turn of the wrist across the board (part of the pose, so the planner sees it). */
export const wristTurn = (x: number, y: number, W: number, H: number) => clamp(((x - W / 2) / W) * 0.12 + ((y - H / 2) / H) * 0.04, -0.09, 0.09);

/** Asset point → screen, with the nib at (x, y). */
function placer(meta: PoseMeta, way: Way, x: number, y: number, turn: number, k: number) {
  const a = way.rot + turn;
  return (p: P): P => { const r = rotate([(p[0] - meta.tip[0]) * k, (p[1] - meta.tip[1]) * k], a); return [x + r[0], y + r[1]]; };
}

/** Distance from p along direction a until the frame is left (0 when p is already outside). */
function exitDistance(p: P, a: number, W: number, H: number) {
  if (p[0] < 0 || p[1] < 0 || p[0] > W || p[1] > H) return 0;
  const dx = Math.cos(a), dy = Math.sin(a);
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (W - p[0]) / dx); else if (dx < -1e-6) t = Math.min(t, -p[0] / dx);
  if (dy > 1e-6) t = Math.min(t, (H - p[1]) / dy); else if (dy < -1e-6) t = Math.min(t, -p[1] / dy);
  return t;
}

/** Geometry of a way at a nib point: visible forearm, the hand's outline, the forearm direction. */
export function poseAt(plan: Pick<HandPlan, 'W' | 'H' | 'k'>, meta: PoseMeta, way: Way, x: number, y: number) {
  const turn = wristTurn(x, y, plan.W, plan.H), at = placer(meta, way, x, y, turn, plan.k);
  const dir = meta.forearm + way.rot + turn, wrist = at(meta.wrist), cut = at(meta.cut);
  const [x0, y0, x1, y1] = meta.box;
  const hull = [at([x0, y0]), at([x1, y0]), at([x1, y1]), at([x0, y1])];
  const arm = exitDistance(wrist, dir, plan.W, plan.H), h = meta.armHalf * plan.k, nx = -Math.sin(dir) * h, ny = Math.cos(dir) * h;
  const end: P = [wrist[0] + Math.cos(dir) * arm, wrist[1] + Math.sin(dir) * arm];
  // the forearm in the frame, from the wrist to the edge
  const forearm: P[] = [[wrist[0] + nx, wrist[1] + ny], [end[0] + nx, end[1] + ny], [end[0] - nx, end[1] - ny], [wrist[0] - nx, wrist[1] - ny]];
  return { turn, dir, wrist, cut, hull, forearm, arm };
}

const inside = (q: P, poly: P[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > q[1]) !== (yj > q[1]) && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

const NONE = 2.5, SWITCH = 0.5, QUICK = 4;

/**
 * Choose the way in for every task (Viterbi over the tasks: the cost of each way at its nib
 * points plus the cost of changing way, which needs time for the hand to leave and come back).
 */
export function planHand(tasks: HandTask[], poses: Record<string, PoseAsset>, W: number, H: number, ways = WAYS): HandPlan {
  const portrait = H > W, k = handScale(portrait), plan: HandPlan = { tasks, choice: [], ways: ways.filter((w) => poses[w.id]), poses, W, H, k, portrait };
  const n = tasks.length, S = plan.ways.length;
  if (!n || !S) { plan.choice = tasks.map(() => -1); return plan; }
  const lim = maxArm(W, H, portrait);
  const samples = tasks.map((tk) => Array.from({ length: 13 }, (_, i) => tk.pen(i / 12)));
  // unit costs; the last state is "no hand"
  const cost = tasks.map((tk, i) => {
    // what is already on the board in this scene (each earlier thing counts the same, whatever its size)
    const drawn: P[][] = [];
    for (let j = i - 1; j >= 0 && drawn.length < 24; j--) if (tasks[j].group === tk.group && tasks[j].end <= tk.start + 1e-6) drawn.push(samples[j].map((s) => [s[0], s[1]] as P));
    const row = plan.ways.map((way) => {
      const meta = poses[way.id].meta;
      let sum = 0;
      for (const s of samples[i]) {
        const g = poseAt(plan, meta, way, s[0], s[1]);
        if (g.arm > lim) return Infinity;
        let cover = 0;
        for (const d of drawn) cover += d.filter((q) => inside(q, g.hull) || inside(q, g.forearm)).length / d.length;
        sum += g.arm / lim * 0.8 + cover * 1.2;
      }
      return sum / samples[i].length + way.prior[portrait ? 0 : 1];
    });
    row.push(NONE);
    return row;
  });
  const total: number[][] = [cost[0].slice()], from: number[][] = [cost[0].map(() => -1)];
  for (let i = 1; i < n; i++) {
    const gap = tasks[i].start - tasks[i - 1].end;
    total.push([]); from.push([]);
    for (let s = 0; s <= S; s++) {
      let best = Infinity, arg = 0;
      for (let r = 0; r <= S; r++) {
        const change = r === s ? 0 : r === S || s === S ? 0.3 : gap >= 0.45 ? SWITCH : QUICK;
        const v = total[i - 1][r] + change;
        if (v < best) { best = v; arg = r; }
      }
      total[i].push(best + cost[i][s]); from[i].push(arg);
    }
  }
  let s = total[n - 1].indexOf(Math.min(...total[n - 1]));
  const out: number[] = new Array(n);
  for (let i = n - 1; i >= 0; i--) { out[i] = s === S ? -1 : s; s = from[i][s]; }
  plan.choice = out;
  return plan;
}

/** How far the hand travels to be out of the frame from p along direction a. */
const offDistance = (plan: HandPlan, p: P, a: number) => exitDistance(p, a, plan.W, plan.H) + 260 * plan.k * 2.2;

/** Where the hand is at time t: way, nib point, lift. Null when no hand is in the frame. */
export function handAt(plan: HandPlan, t: number): { way: number; x: number; y: number; lift: number } | null {
  const { tasks, choice } = plan;
  if (!tasks.length) return null;
  const dirOf = (w: number, p: P) => { const way = plan.ways[w], meta = plan.poses[way.id].meta; return meta.forearm + way.rot + wristTurn(p[0], p[1], plan.W, plan.H); };
  const outFrom = (w: number, p: P, u: number) => { const a = dirOf(w, p), d = offDistance(plan, p, a) * ease(clamp(u)); return { x: p[0] + Math.cos(a) * d, y: p[1] + Math.sin(a) * d }; };
  const i = tasks.findIndex((k) => t >= k.start && t <= k.end);
  if (i >= 0) {
    if (choice[i] < 0) return null;
    const q = (t - tasks[i].start) / Math.max(1e-6, tasks[i].end - tasks[i].start), p = tasks[i].pen(q);
    return { way: choice[i], x: p[0], y: p[1], lift: p[2] ?? 0 };
  }
  const next = tasks.findIndex((k) => k.start > t), prev = next < 0 ? n1(tasks) : next - 1;
  const a = prev >= 0 ? prev : -1, b = next;
  const IN = 0.5, OUT = 0.55;
  if (a >= 0 && b >= 0 && choice[a] >= 0 && choice[a] === choice[b] && tasks[b].start - tasks[a].end < 1.5) {
    // the same way in: the hand travels lifted to the next stroke
    const pa = tasks[a].pen(1), pb = tasks[b].pen(0), u = ease(clamp((t - tasks[a].end) / Math.max(1e-6, tasks[b].start - tasks[a].end)));
    return { way: choice[a], x: pa[0] + (pb[0] - pa[0]) * u, y: pa[1] + (pb[1] - pa[1]) * u, lift: Math.sin(Math.PI * u) };
  }
  // another way in (or a long pause): leave along the forearm, come back in along the next one
  const gap = a >= 0 && b >= 0 ? tasks[b].start - tasks[a].end : Infinity;
  const out = Math.min(OUT, gap / 2), inn = Math.min(IN, gap / 2);
  if (a >= 0 && choice[a] >= 0 && t < tasks[a].end + out) {
    const p = tasks[a].pen(1), u = (t - tasks[a].end) / out, o = outFrom(choice[a], [p[0], p[1]], u);
    return { way: choice[a], ...o, lift: clamp(u * 2) };
  }
  if (b >= 0 && choice[b] >= 0 && t > tasks[b].start - inn) {
    const p = tasks[b].pen(0), u = (tasks[b].start - t) / inn, o = outFrom(choice[b], [p[0], p[1]], u);
    return { way: choice[b], ...o, lift: clamp(u * 2) };
  }
  return null;
}
const n1 = (a: unknown[]) => a.length - 1;

/**
 * Draw the hand of a way with its nib at (x, y): the forearm continued to past the frame edge,
 * the hand, the pen (any tool, drawn along the pen axis from the nib) and the fingers in front.
 */
export function drawPosedHand(c: Ctx, plan: HandPlan, w: number, x: number, y: number, lift: number, wobble: number, dpr: number, drawPen: (c: Ctx) => void) {
  const way = plan.ways[w], A = plan.poses[way.id], meta = A.meta, turn = wristTurn(x, y, plan.W, plan.H) + wobble;
  const k = plan.k * (1 + lift * 0.04);
  // forearm length to draw: from the cut to well outside the frame
  const at = placer(meta, way, x, y, turn, k), cut = at(meta.cut), dir = meta.forearm + way.rot + turn;
  const ext = (exitDistance(cut, dir, plan.W, plan.H) + 40) / k + 40;
  c.save();
  c.translate(x, y); c.rotate(way.rot + turn); c.scale(k, k); c.translate(-meta.tip[0], -meta.tip[1]);
  c.save();
  c.shadowColor = 'rgba(40,25,10,.14)'; c.shadowBlur = (6 + lift * 8) * dpr;
  c.shadowOffsetX = (4 + lift * 10) * dpr; c.shadowOffsetY = (5 + lift * 12) * dpr;
  c.save(); c.translate(meta.cut[0], meta.cut[1]); c.rotate(meta.forearm);
  c.drawImage(A.arm, -2, -A.arm.height / 2, ext, A.arm.height);
  c.restore();
  c.drawImage(A.img, 0, 0, meta.width, meta.height);
  c.restore();
  c.save(); c.translate(meta.tip[0], meta.tip[1]); c.rotate(meta.penAxis); c.scale(meta.penWidth / 23, meta.penWidth / 23); drawPen(c); c.restore();
  c.drawImage(A.fingers, 0, 0, meta.width, meta.height);
  c.restore();
}
