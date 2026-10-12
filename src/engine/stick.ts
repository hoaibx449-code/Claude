// Animated stick figures. The hand first sketches the figure in its starting pose,
// then the figure comes alive: every pose is a pure function of time, so the browser
// preview and the server render show the same movement.
import type { Ctx } from './types.ts';

export type Action = 'idle' | 'walk' | 'run' | 'wave' | 'think' | 'cheer' | 'sad' | 'point' | 'shrug' | 'jump';
export const ACTIONS: Action[] = ['idle', 'walk', 'run', 'wave', 'think', 'cheer', 'sad', 'point', 'shrug', 'jump'];

type P = [number, number];
// segment lengths at scale 1 (figure ≈ 170 px tall)
const L = { torso: 62, head: 17, upper: 30, fore: 28, thigh: 35, shin: 35 };

interface Pose {
  lean: number; // torso tilt, + = forward
  head: P; // head offset
  front: [number, number]; // front arm: upper, fore (0 = hanging down, π = straight up; + = forward)
  back: [number, number];
  legF: [number, number];
  legB: [number, number];
  lift: number; // body raised (jumps, bounce)
}

const S = Math.sin, C = Math.cos;
export function pose(action: Action, t: number): Pose {
  const base: Pose = { lean: 0, head: [0, 0], front: [0.15, 0.15], back: [-0.15, -0.15], legF: [0.12, 0.12], legB: [-0.12, -0.12], lift: 0 };
  const breathe = S(t * 2.2) * 0.05;
  switch (action) {
    case 'walk': {
      const w = t * Math.PI * 2 * 1.5;
      return { ...base, lean: 0.06, lift: Math.abs(S(w)) * 3,
        legF: [0.5 * S(w), 0.5 * S(w) - 0.7 * Math.max(0, -C(w))], legB: [-0.5 * S(w), -0.5 * S(w) - 0.7 * Math.max(0, C(w))],
        front: [-0.45 * S(w), -0.45 * S(w) + 0.45], back: [0.45 * S(w), 0.45 * S(w) + 0.45] };
    }
    case 'run': {
      const w = t * Math.PI * 2 * 2.6;
      return { ...base, lean: 0.28, lift: Math.abs(S(w)) * 9,
        legF: [0.85 * S(w), 0.85 * S(w) - 1.3 * Math.max(0, -C(w))], legB: [-0.85 * S(w), -0.85 * S(w) - 1.3 * Math.max(0, C(w))],
        front: [-0.9 * S(w), -0.9 * S(w) + 1.5], back: [0.9 * S(w), 0.9 * S(w) + 1.5] };
    }
    case 'wave':
      return { ...base, head: [2, 0], front: [2.1, 2.85 + 0.5 * S(t * 9)], back: [-0.15 + breathe, -0.1] };
    case 'think':
      return { ...base, head: [3 + S(t * 1.5) * 2, 2], lean: 0.04, front: [0.55, 2.75], back: [-0.35, 0.9 + breathe] };
    case 'cheer': {
      const j = Math.max(0, S(t * 5.5));
      // arms up in a V, little hops
      return { ...base, lift: j * 18, front: [2.3 + 0.15 * S(t * 11), 2.55], back: [-2.3 - 0.15 * S(t * 11), -2.55],
        legF: [0.18 + 0.2 * j, 0.18 - 0.25 * j], legB: [-0.18 - 0.2 * j, -0.18 + 0.25 * j] };
    }
    case 'sad':
      return { ...base, lean: 0.22, head: [5, 7 + S(t * 1.2) * 1.5], front: [0.06 + breathe, 0.05], back: [-0.06, -0.05] };
    case 'point':
      return { ...base, lean: 0.05, front: [1.45 + 0.08 * S(t * 6), 1.55 + 0.08 * S(t * 6)], back: [-0.2 + breathe, -0.2] };
    case 'shrug': {
      const s = (S(t * 3.2) + 1) / 2;
      return { ...base, head: [0, -s * 3], front: [0.7 + 0.2 * s, 2.4], back: [-0.7 - 0.2 * s, -2.4], lift: s * 2 };
    }
    case 'jump': {
      const j = Math.max(0, S(t * 4.2)), crouch = Math.max(0, -S(t * 4.2));
      return { ...base, lift: j * 34 - crouch * 8, lean: crouch * 0.2,
        legF: [0.3 * crouch + 0.15, -0.6 * crouch], legB: [-0.3 * crouch - 0.15, 0.6 * crouch], front: [1.2 * j - 0.3, 1.3 * j], back: [-1.2 * j + 0.3, -1.3 * j] };
    }
    default:
      return { ...base, front: [0.15 + breathe, 0.2], back: [-0.15 - breathe, -0.2], head: [0, S(t * 2.2) * 0.8] };
  }
}

/** Polylines of the figure: head, torso, back arm, back leg, front leg, front arm. */
export function strokes(p: Pose, x: number, ground: number, scale: number, facing: 1 | -1): P[][] {
  const k = scale, dir = (a: number): P => [S(a) * facing, C(a)];
  const hip: P = [x, ground - (L.thigh + L.shin) * k - p.lift * k];
  const neck: P = [hip[0] + S(p.lean) * L.torso * k * facing, hip[1] - C(p.lean) * L.torso * k];
  const limb = (from: P, a1: number, a2: number, l1: number, l2: number): P[] => {
    const d1 = dir(a1), mid: P = [from[0] + d1[0] * l1 * k, from[1] + d1[1] * l1 * k];
    const d2 = dir(a2), end: P = [mid[0] + d2[0] * l2 * k, mid[1] + d2[1] * l2 * k];
    return [from, mid, end];
  };
  const hc: P = [neck[0] + (p.head[0] * facing + S(p.lean) * L.head * facing) * k, neck[1] - L.head * k + p.head[1] * k];
  const head: P[] = [];
  for (let i = 0; i <= 28; i++) { const a = -Math.PI / 2 + (i / 28) * Math.PI * 2; head.push([hc[0] + C(a) * L.head * k, hc[1] + S(a) * L.head * k]); }
  return [
    head,
    [neck, hip],
    limb(neck, p.back[0], p.back[1], L.upper, L.fore),
    limb(hip, p.legB[0], p.legB[1], L.thigh, L.shin),
    limb(hip, p.legF[0], p.legF[1], L.thigh, L.shin),
    limb(neck, p.front[0], p.front[1], L.upper, L.fore),
  ];
}

export interface Actor { action: Action; x0: number; x1: number; ground: number; scale: number; facing: 1 | -1 }

/** Where the actor is and how it stands, `tau` seconds after it was drawn. */
export function actorAt(a: Actor, tau: number) {
  const moving = a.action === 'walk' || a.action === 'run';
  const dur = a.action === 'run' ? 1.6 : 2.8;
  const u = moving ? Math.min(1, Math.max(0, tau) / dur) : 0;
  const x = a.x0 + (a.x1 - a.x0) * (u * u * (3 - 2 * u));
  // once arrived, a walker stops and breathes
  const act: Action = moving && u >= 1 ? 'idle' : a.action;
  return strokes(pose(act, Math.max(0, tau)), x, a.ground, a.scale, a.facing);
}

/** Total length of a set of polylines, and the point at distance d along them. */
export function lengthOf(lines: P[][]) {
  let len = 0;
  for (const l of lines) for (let i = 1; i < l.length; i++) len += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
  return len;
}

/** Point at distance d along the polylines (where the pen is while sketching them). */
export function pointAlong(lines: P[][], d: number): P {
  let left = d;
  for (const l of lines) for (let i = 1; i < l.length; i++) {
    const seg = Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
    if (seg >= left) { const u = left / (seg || 1); return [l[i - 1][0] + (l[i][0] - l[i - 1][0]) * u, l[i - 1][1] + (l[i][1] - l[i - 1][1]) * u]; }
    left -= seg;
  }
  const last = lines[lines.length - 1];
  return last[last.length - 1];
}

export function drawLines(c: Ctx, lines: P[][], upTo: number, color: string, width: number, passes: [number, number, number, number][], alpha: number): P {
  let left = upTo, tip: P = lines[0][0];
  c.save(); c.strokeStyle = color; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const [dx, dy, al, wm] of passes) {
    left = upTo; c.globalAlpha = alpha * al; c.lineWidth = width * wm;
    for (const l of lines) {
      if (left <= 0) break;
      c.beginPath(); c.moveTo(l[0][0] + dx, l[0][1] + dy); tip = l[0];
      for (let i = 1; i < l.length; i++) {
        const seg = Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
        if (seg <= left) { c.lineTo(l[i][0] + dx, l[i][1] + dy); left -= seg; tip = l[i]; continue; }
        const u = left / (seg || 1);
        tip = [l[i - 1][0] + (l[i][0] - l[i - 1][0]) * u, l[i - 1][1] + (l[i][1] - l[i - 1][1]) * u];
        c.lineTo(tip[0] + dx, tip[1] + dy); left = 0; break;
      }
      c.stroke();
    }
  }
  c.restore();
  return tip;
}
