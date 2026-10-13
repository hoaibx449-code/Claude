// Rigged characters. A character is a skeleton (hip, spine, neck, head, two arms with elbows,
// two legs with knees and feet) driven by joint angles, dressed by a fixed "look" (hair, skin,
// clothes, proportions) so the same person stays the same person in every scene. Actions are
// procedural poses over time (walk cycle, wave, point, nod, shake…), emotions drive the face
// and posture, and changes between actions blend, so nothing pops. The output is vector
// primitives: the hand can draw the character stroke by stroke, then it comes alive.
import { arc, clamp, ellipse, hash, lerp, quad, soft, wobble, type Prim, type Pt } from './geom.ts';

export type Hair = 'short' | 'spiky' | 'bun' | 'long' | 'bob' | 'cap' | 'curly' | 'bald';
export interface CharLook {
  hair: Hair; hairColor: string; skin: string; shirt: string; pants: string; shoes: string;
  /** dress instead of trousers top half (skirt) */
  skirt?: boolean; glasses?: boolean; beard?: boolean;
  /** body scale (1 = adult, ~0.75 child) */
  size?: number;
}

export const LOOKS: Record<string, CharLook> = {
  minh: { hair: 'spiky', hairColor: '#2b2420', skin: '#f3d2b8', shirt: '#5b8def', pants: '#33415c', shoes: '#2b2b2b' },
  lan: { hair: 'long', hairColor: '#3a2a22', skin: '#f6dcc6', shirt: '#ff8a65', pants: '#4b3f72', shoes: '#3a2f2f', skirt: true },
  an: { hair: 'bun', hairColor: '#4a3426', skin: '#efcfb2', shirt: '#3cc68a', pants: '#2f3e46', shoes: '#2b2b2b' },
  khoa: { hair: 'short', hairColor: '#1f1b18', skin: '#e9c4a6', shirt: '#f2b134', pants: '#384656', shoes: '#262626', glasses: true },
  linh: { hair: 'bob', hairColor: '#2e2220', skin: '#f5d6c0', shirt: '#c084fc', pants: '#3b3b58', shoes: '#2e2e2e' },
  tuan: { hair: 'cap', hairColor: '#d94841', skin: '#e2b996', shirt: '#7aa6c2', pants: '#2d3a3a', shoes: '#222', beard: true },
};

export type Emotion = 'neutral' | 'happy' | 'shy' | 'nervous' | 'confident' | 'sad' | 'surprised' | 'thinking' | 'laugh' | 'angry' | 'awkward' | 'calm';
export const EMOTIONS: Emotion[] = ['neutral', 'happy', 'shy', 'nervous', 'confident', 'sad', 'surprised', 'thinking', 'laugh', 'angry', 'awkward', 'calm'];

/** Joint angles, radians. Limb angles are measured from straight down, positive = forward. */
export interface Pose {
  lean: number; tilt: number; pitch: number; shrug: number;
  armF: [number, number]; armB: [number, number]; legF: [number, number]; legB: [number, number];
  /** hip height above the ground when sitting (0 = standing on the legs) */
  seat: number;
  dy: number; dx: number;
  /** pupils look left/right relative to facing (-1..1) */
  gaze: number;
}
export interface Face { eyes: 'open' | 'closed' | 'happy' | 'wide'; brow: number; browUp: number; mouth: number; open: number; blush: number; sweat: number; teeth?: boolean }

export const STAND: Pose = { lean: 0, tilt: 0, pitch: 0, shrug: 0, armF: [0.12, 0.18], armB: [-0.1, 0.18], legF: [0.06, 0], legB: [-0.06, 0], seat: 0, dy: 0, dx: 0, gaze: 0 };

export function mixPose(a: Pose, b: Pose, u: number): Pose {
  const m = (x: number, y: number) => lerp(x, y, u);
  const m2 = (x: [number, number], y: [number, number]): [number, number] => [m(x[0], y[0]), m(x[1], y[1])];
  return { lean: m(a.lean, b.lean), tilt: m(a.tilt, b.tilt), pitch: m(a.pitch, b.pitch), shrug: m(a.shrug, b.shrug), armF: m2(a.armF, b.armF), armB: m2(a.armB, b.armB),
    legF: m2(a.legF, b.legF), legB: m2(a.legB, b.legB), seat: m(a.seat, b.seat), dy: m(a.dy, b.dy), dx: m(a.dx, b.dx), gaze: m(a.gaze, b.gaze) };
}

// ---------------------------------------------------------------- body proportions
const HEAD = 29, NECK = 7, TORSO = 76, UPPER = 42, FORE = 40, THIGH = 50, SHIN = 47, FOOT = 17, SHOULDER = 26, HIP = 19;
export const BODY_HEIGHT = THIGH + SHIN + TORSO + NECK + HEAD * 2; // ≈ 238 at size 1

export interface Action {
  do: string;
  t0: number; t1: number;
  /** walk: x where it ends (world); point/look: x of the target */
  to?: number; at?: number;
  /** extra intensity 0..1 */
  k?: number;
}

const S = Math.sin, C = Math.cos, TAU = Math.PI * 2;

/** Body pose of an action at time t (seconds since its start, total duration d). */
export function actionPose(a: Action, t: number, seed: number, facing: number): Pose {
  const d = Math.max(0.01, a.t1 - a.t0), u = clamp(t / d), p: Pose = { ...STAND, armF: [...STAND.armF], armB: [...STAND.armB], legF: [...STAND.legF], legB: [...STAND.legB] };
  const breathe = S((t + seed * 3) * TAU / 3.4);
  p.dy = breathe * 0.8; p.armF[0] += breathe * 0.02; p.armB[0] -= breathe * 0.02;
  const k = a.k ?? 1;
  switch (a.do) {
    case 'walk': case 'run': {
      const run = a.do === 'run';
      const ph = (a as any).phase ?? t * (run ? 2.2 : 1.6) * TAU / 2;
      const sw = run ? 0.7 : 0.42;
      p.legF = [S(ph) * sw, -Math.max(0, -C(ph)) * (run ? 1.3 : 0.8) - 0.05];
      p.legB = [-S(ph) * sw, -Math.max(0, C(ph)) * (run ? 1.3 : 0.8) - 0.05];
      p.armF = [-S(ph) * (run ? 0.9 : 0.42), run ? 1.5 : 0.35];
      p.armB = [S(ph) * (run ? 0.9 : 0.42), run ? 1.5 : 0.35];
      p.lean = run ? 0.2 : 0.06; p.dy = -Math.abs(S(ph)) * (run ? 6 : 3);
      break;
    }
    case 'wave': {
      p.armF = [2.75, 0.45 + S(t * TAU * 2.2) * 0.45]; p.tilt = 0.06; break;
    }
    case 'point': {
      p.armF = [1.45, 0.05]; p.lean = 0.04; break;
    }
    case 'cross': case 'confident-cross': {
      p.armF = [0.25, -1.85]; p.armB = [-0.25, 1.85]; p.lean = -0.04; p.pitch = -0.06; break;
    }
    case 'hips': {
      p.armF = [0.75, -1.65]; p.armB = [-0.75, 1.65]; p.lean = -0.05; p.pitch = -0.08; break;
    }
    case 'shy': {
      p.shrug = 0.8; p.pitch = 0.3; p.armF = [0.12, -0.75]; p.armB = [-0.12, 0.75]; p.lean = 0.04; p.gaze = -0.8;
      p.legF = [0.02, 0]; p.legB = [0.02, 0]; p.dx = S(t * TAU * 0.6) * 2; break;
    }
    case 'nervous': {
      p.shrug = 0.6; p.armF = [0.18, -1.1 + S(t * TAU * 1.7) * 0.12]; p.armB = [-0.18, 1.1]; p.pitch = 0.12; p.gaze = S(t * TAU * 0.5) > 0.3 ? -0.9 : 0.3;
      p.dx = S(t * TAU * 1.1) * 2.5; p.dy += S(t * TAU * 2.3) * 0.8; break;
    }
    case 'talk': {
      const g = S(t * TAU * 0.9 + seed), h = S(t * TAU * 1.6 + seed * 2);
      p.armF = [0.55 + g * 0.22 * k, 1.15 + h * 0.3 * k]; p.armB = [0.05, 0.3];
      p.pitch = S(t * TAU * 1.3) * 0.05; p.tilt = g * 0.03; p.lean = 0.03; break;
    }
    case 'explain': {
      const g = S(t * TAU * 0.8 + seed);
      p.armF = [0.9 + g * 0.25, 0.9]; p.armB = [-0.5 - g * 0.2, -0.9]; p.pitch = S(t * TAU * 1.2) * 0.05; break;
    }
    case 'listen': {
      p.pitch = 0.04 + Math.max(0, S(t * TAU * 0.55)) * 0.12; p.tilt = 0.05; p.armF = [0.2, 0.3]; break;
    }
    case 'nod': {
      p.pitch = 0.05 + Math.max(0, S(u * TAU * 2)) * 0.28; break;
    }
    case 'shake': {
      p.gaze = S(t * TAU * 2.6) * 0.9; p.pitch = 0.04; p.armF = [0.15, 0.25]; break;
    }
    case 'think': {
      p.armF = [0.5, 2.55]; p.armB = [-0.25, 1.8]; p.tilt = 0.12; p.pitch = -0.12; p.gaze = 0.5; break;
    }
    case 'celebrate': case 'cheer': {
      const b = Math.abs(S(t * TAU * 1.6));
      p.armF = [2.85, 0.25]; p.armB = [-2.85, -0.25]; p.dy = -b * 12; p.pitch = -0.18;
      p.legF = [0.15 * b, -0.35 * b]; p.legB = [-0.1 * b, -0.35 * b]; break;
    }
    case 'sad': {
      p.lean = 0.14; p.pitch = 0.38; p.shrug = -0.4; p.armF = [0.05, 0.05]; p.armB = [-0.02, 0.05]; break;
    }
    case 'surprised': {
      const jump = S(clamp(t / 0.35) * Math.PI);
      p.armF = [0.9, 1.6]; p.armB = [-0.9, -1.6]; p.lean = -0.12; p.dy = -jump * 10; p.dx = -clamp(t / 0.3) * 10 * facing; p.pitch = -0.12; break;
    }
    case 'laugh': {
      const b = S(t * TAU * 5);
      p.pitch = -0.22 + b * 0.05; p.armF = [0.6, 2.0]; p.armB = [0.2, 0.8]; p.dy = b * 2; p.lean = -0.06; break;
    }
    case 'shrug': {
      const v = S(clamp(u * 1.6) * Math.PI / 2);
      p.armF = [0.25 * v, 1.4 * v]; p.armB = [-0.25 * v, -1.4 * v]; p.shrug = v; p.tilt = 0.1 * v; break;
    }
    case 'handshake': {
      p.armF = [1.15, 0.28]; p.armF[0] += S(t * TAU * 2.4) * 0.07 * (t < 1.4 ? 1 : 0); p.lean = 0.05; break;
    }
    case 'reach': case 'give': {
      p.armF = [1.25, 0.2]; p.lean = 0.08; break;
    }
    case 'phone': {
      p.armF = [0.2, -2.15]; p.armB = [-0.2, 2.1]; p.pitch = 0.32; p.gaze = 0.2; break;
    }
    case 'sit': {
      p.seat = 52; p.legF = [1.5, -1.5]; p.legB = [1.42, -1.42]; p.armF = [0.45, 0.75]; p.armB = [0.35, 0.7]; p.lean = 0.02; break;
    }
    case 'sit-talk': {
      p.seat = 52; p.legF = [1.5, -1.5]; p.legB = [1.42, -1.42];
      const g = S(t * TAU * 0.9 + seed);
      p.armF = [0.7 + g * 0.2, 1.2]; p.armB = [0.35, 0.7]; p.pitch = S(t * TAU * 1.3) * 0.05; break;
    }
    case 'clap': {
      const c = Math.abs(S(t * TAU * 2.4));
      p.armF = [0.25, -1.95 + c * 0.3]; p.armB = [-0.25, 1.95 - c * 0.3]; p.pitch = -0.08; break;
    }
    case 'facepalm': {
      p.armF = [0.6, 2.75]; p.pitch = 0.3; p.lean = 0.06; break;
    }
    case 'wait': {
      p.armF = [0.1, 0.2]; p.armB = [-0.08, 0.2]; p.gaze = S(t * TAU * 0.25) * 0.6; p.legF = [0.12, 0]; p.legB = [-0.1, 0]; break;
    }
    case 'look-around': {
      p.gaze = S(t * TAU * 0.6) * 1; p.pitch = -0.05; break;
    }
    case 'bow': {
      const v = S(u * Math.PI);
      p.lean = 0.45 * v; p.pitch = 0.2 * v; break;
    }
    case 'idle': default: {
      p.gaze = S((t + seed * 9) * TAU / 7) > 0.85 ? 0.6 : 0;
      p.legF = [0.07, 0]; p.legB = [-0.07, 0];
      break;
    }
  }
  return p;
}

/** Face of an emotion (talking opens the mouth with the syllables). */
export function emotionFace(e: Emotion, t: number, talking: boolean, seed: number): Face {
  const f: Face = { eyes: 'open', brow: 0, browUp: 0, mouth: 0.35, open: 0, blush: 0, sweat: 0 };
  switch (e) {
    case 'happy': f.mouth = 0.9; f.eyes = 'happy'; f.browUp = 0.2; break;
    case 'laugh': f.mouth = 1; f.open = 0.75; f.eyes = 'happy'; f.teeth = true; break;
    case 'shy': f.mouth = 0.15; f.blush = 1; f.brow = -0.5; break;
    case 'awkward': f.mouth = -0.15; f.blush = 0.6; f.brow = -0.6; f.sweat = 1; break;
    case 'nervous': f.mouth = -0.35; f.brow = -0.8; f.sweat = 1; f.browUp = 0.2; break;
    case 'confident': f.mouth = 0.75; f.brow = 0.25; break;
    case 'sad': f.mouth = -0.8; f.brow = -1; break;
    case 'surprised': f.mouth = 0; f.open = 0.65; f.eyes = 'wide'; f.browUp = 1; break;
    case 'thinking': f.mouth = -0.05; f.brow = 0.35; f.browUp = 0.3; break;
    case 'angry': f.mouth = -0.6; f.brow = 1; break;
    case 'calm': f.mouth = 0.45; f.eyes = 'happy'; break;
    default: break;
  }
  if (talking) {
    // syllables ~4.5 per second, irregular
    const s = Math.abs(S(t * TAU * 2.25 + seed)) * (0.6 + 0.4 * Math.abs(S(t * TAU * 0.7 + seed * 3)));
    f.open = Math.max(f.open, 0.12 + s * 0.6);
  }
  // blink every ~3.5 s
  const bt = (t + hash(seed * 31) * 3.5) % 3.5;
  if (bt < 0.12 && f.eyes !== 'happy') f.eyes = 'closed';
  return f;
}

/** Posture shift an emotion adds to any action. */
export function emotionPosture(e: Emotion, p: Pose): Pose {
  const q = { ...p };
  if (e === 'shy' || e === 'awkward') { q.shrug = Math.max(q.shrug, 0.5); q.pitch += 0.12; q.gaze = q.gaze || -0.5; }
  if (e === 'nervous') { q.shrug = Math.max(q.shrug, 0.4); }
  if (e === 'confident') { q.lean -= 0.04; q.pitch -= 0.06; q.shrug = Math.min(q.shrug, 0); }
  if (e === 'sad') { q.pitch += 0.15; q.lean += 0.05; }
  return q;
}

// ---------------------------------------------------------------- geometry
const dir = (a: number, f: number): Pt => [S(a) * f, C(a)];
const add = (p: Pt, v: Pt, k: number): Pt => [p[0] + v[0] * k, p[1] + v[1] * k];

export interface Joints { hip: Pt; neck: Pt; head: Pt; shF: Pt; shB: Pt; elF: Pt; elB: Pt; haF: Pt; haB: Pt; knF: Pt; knB: Pt; anF: Pt; anB: Pt; toeF: Pt; toeB: Pt }

/** Joint positions in local coordinates (origin on the ground under the body, y down). */
export function joints(p: Pose, f: number, yaw: number): Joints {
  const leg = (l: [number, number], hip: Pt) => { const kn = add(hip, dir(l[0], f), THIGH); const an = add(kn, dir(l[0] + l[1], f), SHIN); return { kn, an }; };
  const hipX = p.dx;
  let hip: Pt = [hipX, 0];
  const lf = leg(p.legF, [0, 0]), lb = leg(p.legB, [0, 0]);
  if (p.seat > 0) hip = [hipX, -p.seat + p.dy];
  else hip = [hipX, -Math.max(lf.an[1], lb.an[1]) + p.dy];
  const off = (o: Pt): Pt => [hip[0] + o[0], hip[1] + o[1]];
  const hipF: Pt = [hip[0] + f * 4, hip[1]], hipB: Pt = [hip[0] - f * 4, hip[1]];
  const LF = leg(p.legF, hipF), LB = leg(p.legB, hipB);
  void off;
  const sp: Pt = [S(p.lean) * f, -C(p.lean)];
  const neck = add(hip, sp, TORSO - p.shrug * 4);
  const shC = add(hip, sp, TORSO - 8 + p.shrug * 5);
  const perp: Pt = [-sp[1], sp[0]];
  const half = SHOULDER * (1 - 0.3 * Math.abs(yaw));
  const shF = add(shC, perp, half * f * 0.8), shB = add(shC, perp, -half * f * 0.8);
  const headUp = NECK + HEAD - p.shrug * 5;
  const head = add(add(neck, [S(p.lean + p.tilt * 0.4) * f, -C(p.lean)], headUp), [f, 0], p.pitch * 6);
  const arm = (a: [number, number], sh: Pt) => { const el = add(sh, dir(a[0], f), UPPER); const ha = add(el, dir(a[0] + a[1], f), FORE); return { el, ha }; };
  const AF = arm(p.armF, shF), AB = arm(p.armB, shB);
  return { hip, neck, head, shF, shB, elF: AF.el, elB: AB.el, haF: AF.ha, haB: AB.ha, knF: LF.kn, knB: LB.kn, anF: LF.an, anB: LB.an,
    toeF: [LF.an[0] + FOOT * f, LF.an[1]], toeB: [LB.an[0] + FOOT * f, LB.an[1]] };
}

const INK = '#22252b';

/**
 * Primitives of a character. Drawing order (for the hand): head, hair, face, body, arms,
 * legs, shoes. Paint order puts the far arm and leg behind the body.
 */
export function characterPrims(look: CharLook, p: Pose, face: Face, f: number, yaw: number, seed: number, wob = 0.7, ink = INK): Prim[] {
  const J = joints(p, f, yaw), out: Prim[] = [], w = 2.6;
  const W = (d: Pt[], k: number, closed = false) => wobble(d, seed * 97 + k, wob, closed);
  const [hx, hy] = J.head;
  const fx = clamp(yaw, -1, 1) * HEAD * 0.36 + p.gaze * 2 * f, fy = p.pitch * HEAD * 0.45;
  // back hair (long) behind the head
  if (look.hair === 'long') out.push({ d: W(soft([[hx - HEAD * 1.05, hy - 6], [hx - HEAD * 1.1, hy + HEAD * 1.45], [hx + HEAD * 1.1, hy + HEAD * 1.45], [hx + HEAD * 1.05, hy - 6], [hx, hy - HEAD * 1.1]], 2), 1, true), closed: true, w, ink, fill: look.hairColor, z: 1.5 });
  if (look.hair === 'bob') out.push({ d: W(soft([[hx - HEAD * 1.12, hy - 4], [hx - HEAD * 1.08, hy + HEAD * 0.8], [hx + HEAD * 1.08, hy + HEAD * 0.8], [hx + HEAD * 1.12, hy - 4], [hx, hy - HEAD * 1.15]], 2), 1, true), closed: true, w, ink, fill: look.hairColor, z: 1.5 });
  // head
  out.push({ d: W(ellipse(hx, hy, HEAD, HEAD * 1.04, 30), 2, true), closed: true, w, ink, fill: look.skin, z: 4 });
  // hair on top
  const top = hy - HEAD * 1.04, hs = -clamp(yaw) * 4;
  switch (look.hair) {
    case 'spiky': {
      const pts: Pt[] = [[hx - HEAD * 1.02, hy - 2]];
      for (let i = 0; i <= 6; i++) { const a = Math.PI + (i / 6) * Math.PI, r = HEAD * (i % 2 ? 1.28 : 1.06); pts.push([hx + hs + C(a) * r, hy - 4 + S(a) * r]); }
      pts.push([hx + HEAD * 1.02, hy - 2], [hx + HEAD * 0.4 + hs, hy - HEAD * 0.55], [hx - HEAD * 0.5 + hs, hy - HEAD * 0.42]);
      out.push({ d: W(soft(pts, 1), 3, true), closed: true, w, ink, fill: look.hairColor, z: 4.5 }); break;
    }
    case 'short': case 'curly': {
      const pts: Pt[] = [];
      for (let i = 0; i <= 14; i++) { const a = Math.PI * 0.95 + (i / 14) * Math.PI * 1.1, r = HEAD * (look.hair === 'curly' ? 1.12 + (i % 2) * 0.1 : 1.1); pts.push([hx + hs + C(a) * r, hy - 3 + S(a) * r]); }
      pts.push([hx + HEAD * 0.7 + hs, hy - HEAD * 0.45], [hx - HEAD * 0.6 + hs, hy - HEAD * 0.5]);
      out.push({ d: W(soft(pts, 1), 3, true), closed: true, w, ink, fill: look.hairColor, z: 4.5 }); break;
    }
    case 'bun': {
      out.push({ d: W(ellipse(hx + hs * 0.5, top - 8, 14, 12, 18), 4, true), closed: true, w, ink, fill: look.hairColor, z: 3.9 });
      const pts: Pt[] = arc(hx + hs, hy - 2, HEAD * 1.08, HEAD * 1.1, Math.PI * 0.98, Math.PI * 2.02, 14);
      pts.push([hx + HEAD * 0.5 + hs, hy - HEAD * 0.5], [hx - HEAD * 0.5 + hs, hy - HEAD * 0.55]);
      out.push({ d: W(soft(pts, 1), 3, true), closed: true, w, ink, fill: look.hairColor, z: 4.5 }); break;
    }
    case 'long': case 'bob': {
      const pts: Pt[] = arc(hx + hs, hy - 2, HEAD * 1.1, HEAD * 1.12, Math.PI * 0.95, Math.PI * 2.05, 14);
      pts.push([hx + HEAD * 0.8 + hs, hy - HEAD * 0.25], [hx + hs * 2, hy - HEAD * 0.7], [hx - HEAD * 0.8 + hs, hy - HEAD * 0.2]);
      out.push({ d: W(soft(pts, 1), 3, true), closed: true, w, ink, fill: look.hairColor, z: 4.5 }); break;
    }
    case 'cap': {
      const pts: Pt[] = arc(hx + hs, hy - 12, HEAD * 1.02, HEAD * 0.95, Math.PI, Math.PI * 2, 12);
      out.push({ d: W(pts, 3, true), closed: true, w, ink, fill: look.hairColor, z: 4.5 });
      out.push({ d: W([[hx + hs - f * 6, hy - 13], [hx + hs + f * HEAD * 1.6, hy - 11]], 5), w: 4.5, ink, z: 4.6 });
      break;
    }
    default: break;
  }
  // face
  const ex = HEAD * 0.36, ey = hy - HEAD * 0.08 + fy, cx = hx + fx;
  for (const s of [-1, 1]) {
    const x = cx + s * ex;
    if (face.eyes === 'closed') out.push({ d: [[x - 5, ey + 1], [x + 5, ey + 1]], w: 2.4, ink, z: 5 });
    else if (face.eyes === 'happy') out.push({ d: arc(x, ey + 3, 5.5, 5, Math.PI * 1.1, Math.PI * 1.9, 6), w: 2.4, ink, z: 5 });
    else {
      const r = face.eyes === 'wide' ? 5.4 : 4.1;
      out.push({ d: ellipse(x + p.gaze * 1.6 * f, ey, r * 0.85, r, 12), dot: true, w: 0, ink, z: 5 });
    }
    // brows: inner end down when angry, up when worried
    const by = ey - 11 - face.browUp * 5;
    out.push({ d: [[x - s * 6, by + face.brow * 3.5], [x + s * 6, by - face.brow * 1]], w: 2.2, ink, z: 5 });
  }
  if (look.glasses) for (const s of [-1, 1]) out.push({ d: W(ellipse(cx + s * ex, ey, 8.5, 7.5, 16), 30 + s, true), closed: true, w: 1.8, ink, z: 5.1 });
  // mouth
  const my = hy + HEAD * 0.42 + fy, mw = 9 + Math.abs(face.mouth) * 2;
  if (face.open > 0.08) {
    const oh = 3 + face.open * 10, ow = mw * (0.65 + face.open * 0.25);
    out.push({ d: W(soft([[cx - ow, my - 1 - face.mouth * 2], [cx + ow, my - 1 - face.mouth * 2], [cx + ow * 0.6, my + oh], [cx - ow * 0.6, my + oh]], 2), 40, true), closed: true, w: 2.2, ink, fill: '#8a2c2c', z: 5 });
    if (face.teeth) out.push({ d: [[cx - ow * 0.7, my + 1 - face.mouth * 2], [cx + ow * 0.7, my + 1 - face.mouth * 2]], w: 2.4, ink: '#fff', z: 5.1 });
  } else {
    out.push({ d: quad([cx - mw, my - face.mouth * 2], [cx, my + face.mouth * 8], [cx + mw, my - face.mouth * 2], 8), w: 2.4, ink, z: 5 });
  }
  if (face.blush > 0) for (const s of [-1, 1]) out.push({ d: ellipse(cx + s * HEAD * 0.62, my - 6, 6, 3.5, 12), dot: true, w: 0, ink: '#f29a9a', alpha: 0.7 * face.blush, z: 4.8 });
  if (face.sweat > 0) out.push({ d: soft([[hx + HEAD * 0.95 * -f, hy - HEAD * 0.7], [hx + HEAD * 1.1 * -f, hy - HEAD * 0.3], [hx + HEAD * 0.8 * -f, hy - HEAD * 0.3]], 1), closed: true, w: 1.6, ink: '#3c8dd6', fill: '#bfe0fb', z: 5.2, alpha: face.sweat });
  if (look.beard) out.push({ d: W(arc(cx, hy + HEAD * 0.15 + fy, HEAD * 0.75, HEAD * 0.7, 0.15 * Math.PI, 0.85 * Math.PI, 10), 41), w: 2, ink, z: 5 });

  // torso (shirt), slightly wider at the hips for a skirt
  const sp: Pt = [J.neck[0] - J.hip[0], J.neck[1] - J.hip[1]], L = Math.hypot(sp[0], sp[1]) || 1, ux = sp[0] / L, uy = sp[1] / L, px = -uy, py = ux;
  const half = SHOULDER * (1 - 0.3 * Math.abs(yaw)), hw = (look.skirt ? HIP * 1.5 : HIP) * (1 - 0.2 * Math.abs(yaw));
  const top2: Pt = [J.neck[0] - ux * 6, J.neck[1] - uy * 6];
  const bottom: Pt = look.skirt ? [J.hip[0] + ux * -12, J.hip[1] + uy * -12] : J.hip;
  const torso = soft([[top2[0] + px * half, top2[1] + py * half], [bottom[0] + px * hw, bottom[1] + py * hw], [bottom[0] - px * hw, bottom[1] - py * hw], [top2[0] - px * half, top2[1] - py * half]], 1);
  // neck
  out.push({ d: W([J.neck, [J.neck[0] + (hx - J.neck[0]) * 0.35, J.neck[1] + (hy - J.neck[1]) * 0.35]], 6), w: 9, ink, fill: look.skin, limb: true, z: 2.9 });
  out.push({ d: W(torso, 7, true), closed: true, w, ink, fill: look.shirt, z: 3 });
  // arms (front over the body, back behind)
  const armPrims = (sh: Pt, el: Pt, ha: Pt, z: number, k: number) => {
    out.push({ d: W([sh, el, ha], k), w: 12, ink, fill: look.shirt, limb: true, z });
    out.push({ d: W(ellipse(ha[0], ha[1], 6.5, 6.5, 12), k + 1, true), closed: true, w: 2.2, ink, fill: look.skin, z: z + 0.05 });
  };
  armPrims(J.shF, J.elF, J.haF, 3.5, 10);
  armPrims(J.shB, J.elB, J.haB, 1, 12);
  // legs and shoes
  const legPrims = (hipP: Pt, kn: Pt, an: Pt, toe: Pt, z: number, k: number) => {
    out.push({ d: W([hipP, kn, an], k), w: 15, ink, fill: look.pants, limb: true, z });
    out.push({ d: W(soft([[an[0] - 5 * f, an[1] - 6], [toe[0] + 3 * f, an[1] - 4], [toe[0] + 3 * f, an[1] + 2], [an[0] - 6 * f, an[1] + 2]], 1), k + 1, true), closed: true, w: 2.2, ink, fill: look.shoes, z: z + 0.05 });
  };
  const hipF: Pt = [J.hip[0] + f * 5, J.hip[1] - 4], hipB: Pt = [J.hip[0] - f * 5, J.hip[1] - 4];
  legPrims(hipF, J.knF, J.anF, J.toeF, 2, 20);
  legPrims(hipB, J.knB, J.anB, J.toeB, 0.8, 22);
  if (look.skirt) {
    const sk: Pt[] = soft([[J.hip[0] + px * hw * 0.8 - ux * 14, J.hip[1] + py * hw * 0.8 - uy * 14], [J.hip[0] + px * hw * 1.25 + ux * 22, J.hip[1] + py * hw * 1.25 + uy * 22],
      [J.hip[0] - px * hw * 1.25 + ux * 22, J.hip[1] - py * hw * 1.25 + uy * 22], [J.hip[0] - px * hw * 0.8 - ux * 14, J.hip[1] - py * hw * 0.8 - uy * 14]], 1);
    out.push({ d: W(sk, 8, true), closed: true, w, ink, fill: look.pants, z: 3.1 });
  }
  return out;
}

/** Where the character's front hand is (local coordinates), to attach a held prop. */
export function handPoint(p: Pose, f: number, yaw: number): Pt { return joints(p, f, yaw).haF; }
export function headPoint(p: Pose, f: number, yaw: number): Pt { return joints(p, f, yaw).head; }
export const HEAD_R = HEAD;
