// Open Peeps characters (hand-drawn artwork by Pablo Stanley, CC0; pieces from react-peeps, MIT,
// extracted by tools/peeps-extract.cjs into assets/peeps/peeps.json). One person keeps the same
// hair, face set and outfit in every scene; the pose follows the action (walking, pointing,
// arms crossed, sitting, holding a phone…), the face follows the emotion, and once drawn the
// person stays alive: breathing, a gentle sway, nodding, blinking and talking, by moving the
// head and the body of the picture separately (a light region deformation, no new drawing).
import type { Env } from '../types.ts';

type Piece = [string, string, number[], number][];
export interface PeepData { standing: Record<string, Piece>; sitting: Record<string, Piece>; bust: Record<string, Piece>; hair: Record<string, Piece>; face: Record<string, Piece>; facialHair: Record<string, Piece>; accessories: Record<string, Piece> }
export interface PeepLook { hair: string; outfit: 'BW' | 'WB'; beard?: string; glasses?: string; skin?: string; tint?: string }

let DATA: PeepData | null = null;
/** The peeps artwork (loaded from assets/peeps/peeps.json by the caller). */
export const setPeeps = (d: PeepData | null) => { DATA = d; };
export const hasPeeps = () => !!DATA;

export const PEEP_LOOKS: Record<string, PeepLook> = {
  minh: { hair: 'ShortVolumed', outfit: 'BW' },
  lan: { hair: 'Long', outfit: 'WB' },
  an: { hair: 'Bun', outfit: 'BW', glasses: 'GlassRound' },
  khoa: { hair: 'ShortWavy', outfit: 'WB', glasses: 'GlassClubmaster' },
  linh: { hair: 'MediumBangs', outfit: 'BW' },
  tuan: { hair: 'Short', outfit: 'WB', beard: 'Goatee' },
  hoa: { hair: 'BunCurly', outfit: 'WB' },
  bao: { hair: 'Pomp', outfit: 'BW', beard: 'MoustacheThin' },
};

/** Pose of each action ([group, name]; BW/WB follows the person's outfit). */
const POSES: Record<string, [keyof PeepData, string]> = {
  // one outfit across poses (BW: dark top, light trousers · WB: the reverse), no pose that changes clothes
  idle: ['standing', 'Resting#'], wait: ['standing', 'Resting#'], listen: ['standing', 'Resting#'], nod: ['standing', 'Resting#'], shake: ['standing', 'Resting#'],
  sad: ['standing', 'Resting#'], bow: ['standing', 'Resting#'], 'look-around': ['standing', 'Resting#'], shy: ['standing', 'Resting#'], nervous: ['standing', 'Resting#'],
  shrug: ['standing', 'RoboDance#'], phone: ['standing', 'Resting#'],
  walk: ['standing', 'Walking#'], run: ['standing', 'Walking#'], approach: ['standing', 'Walking#'],
  point: ['standing', 'PointingFinger#'], handshake: ['standing', 'PointingFinger#'], give: ['standing', 'PointingFinger#'], reach: ['standing', 'PointingFinger#'], wave: ['standing', 'PointingFinger#'],
  explain: ['standing', 'RoboDance#'], talk: ['standing', 'RoboDance#'], laugh: ['standing', 'RoboDance#'], surprised: ['standing', 'RoboDance#'],
  celebrate: ['standing', 'RoboDance#'], cheer: ['standing', 'RoboDance#'], clap: ['standing', 'RoboDance#'],
  cross: ['standing', 'CrossedArms#'], think: ['standing', 'CrossedArms#'], facepalm: ['standing', 'CrossedArms#'], confident: ['standing', 'CrossedArms#'], hips: ['standing', 'CrossedArms#'],
  sit: ['sitting', 'CrossedLegs'], 'sit-talk': ['sitting', 'CrossedLegs'], relax: ['sitting', 'OneLegUp#'], kneel: ['sitting', 'HandsBack#'], squat: ['sitting', 'Medium#'],
};
const FACES: Record<string, string> = {
  neutral: 'Calm', happy: 'Smile', laugh: 'SmileLol', shy: 'Cute', nervous: 'ConcernedFear', confident: 'Driven', sad: 'Solemn', surprised: 'Awe',
  thinking: 'Suspicious', angry: 'Angry', awkward: 'Concerned', calm: 'Calm',
};
const TALK: Record<string, string> = { happy: 'SmileTeeth', laugh: 'SmileBig', confident: 'Explaining', neutral: 'Explaining', calm: 'Explaining', nervous: 'Hectic', sad: 'Concerned', surprised: 'Awe', thinking: 'Explaining', awkward: 'Concerned', shy: 'Cute', angry: 'VeryAngry' };

export function poseOf(action: string, look: PeepLook): [keyof PeepData, string] {
  const [g, n] = POSES[action] || POSES.idle;
  const name = n.replace('#', look.outfit);
  return DATA && (DATA[g] as any)[name] ? [g, name] : DATA && (DATA[g] as any)[n.replace('#', 'BW')] ? [g, n.replace('#', 'BW')] : ['standing', 'RestingBW'];
}
export function faceOf(emotion: string, talking: boolean, t: number, seed: number) {
  const bt = (t + (seed % 7) * 0.5) % 3.6;
  if (bt < 0.12 && !talking) return 'EyesClosed';
  if (talking) { const s = Math.sin(t * Math.PI * 2 * 2.3 + seed); return s > 0.1 ? TALK[emotion] || 'Explaining' : FACES[emotion] || 'Calm'; }
  return FACES[emotion] || 'Calm';
}

/** Head pivot (neck) and head centre in the peeps frame, by pose group. */
export const FRAME = { neck: [455, 470], head: [455, 300], height: { standing: 2940, sitting: 1890, bust: 1160 } } as const;

export interface PeepPicture { canvas: any; w: number; h: number; ax: number; ay: number; neck: [number, number]; head: [number, number]; scale: number; group: keyof PeepData }

const cache = new Map<string, PeepPicture>();
/**
 * The person in one pose with one face, at `scale` logical px per peeps unit, cropped. (ax, ay):
 * the feet anchor inside the picture (bottom centre); neck: y of the head pivot; head: head centre.
 */
export function peepPicture(env: Env, look: PeepLook, group: keyof PeepData, pose: string, face: string, scale: number, dpr: number, ink = '#1f2024'): PeepPicture | null {
  if (!DATA) return null;
  const key = [look.hair, look.outfit, look.beard, look.glasses, group, pose, face, scale, dpr, ink].join('|');
  const hit = cache.get(key); if (hit) return hit;
  const body = (DATA[group] as any)[pose]; if (!body) return null;
  const head: [Piece, number, number][] = [[DATA.hair[look.hair] || [], 0, 0], [DATA.face[face] || DATA.face.Calm, 159, 186]];
  if (look.beard && DATA.facialHair[look.beard]) head.push([DATA.facialHair[look.beard], 123, 338]);
  if (look.glasses && DATA.accessories[look.glasses]) head.push([DATA.accessories[look.glasses], 47, 241]);
  const hex = ink.replace('#', ''), light = hex.length >= 6 && parseInt(hex.slice(0, 2), 16) + parseInt(hex.slice(2, 4), 16) + parseInt(hex.slice(4, 6), 16) > 420;
  const draw = (c: any, s: number, ox: number, oy: number) => {
    const P2 = (globalThis as any).Path2D;
    const one = (list: Piece, dx: number, dy: number) => {
      for (const [d, fill, m, eo] of list) {
        // light ink (chalk on a dark board): the white fills are left out, the board shows through
        if (fill === 'none' || (fill === 'bg' && light)) continue;
        c.save(); c.translate(ox, oy); c.scale(s, s); c.translate(dx, dy); c.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        c.fillStyle = fill === 'ink' ? ink : fill === 'bg' ? '#ffffff' : fill;
        c.fill(new P2(d), eo ? 'evenodd' : 'nonzero'); c.restore();
      }
    };
    one(body, 0, 0);
    for (const [list, x, y] of head) one(list, 225 + x, y);
  };
  // find the bounds once at low resolution, then draw cropped at full resolution
  const probeS = 0.05, PW = 140, PH = 170, probe = env.createCanvas(PW, PH), pc = probe.getContext('2d');
  draw(pc, probeS, 20, 20);
  const px = pc.getImageData(0, 0, PW, PH).data;
  let x0 = PW, y0 = PH, x1 = 0, y1 = 0;
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) if (px[(y * PW + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0) return null;
  const fx0 = (x0 - 21) / probeS, fy0 = (y0 - 21) / probeS, fx1 = (x1 - 19) / probeS, fy1 = (y1 - 19) / probeS;
  const w = (fx1 - fx0) * scale, h = (fy1 - fy0) * scale;
  const cv = env.createCanvas(Math.max(2, Math.ceil(w * dpr)), Math.max(2, Math.ceil(h * dpr))), c = cv.getContext('2d');
  draw(c, scale * dpr, -fx0 * scale * dpr, -fy0 * scale * dpr);
  // anchor: under the head, on the ground (the person stands where the head is, whatever the pose leans)
  const at = (p: readonly number[]): [number, number] => [(p[0] - fx0) * scale, (p[1] - fy0) * scale];
  const pic: PeepPicture = { canvas: cv, w, h, ax: at(FRAME.neck)[0], ay: h, neck: at(FRAME.neck), head: at(FRAME.head), scale, group };
  cache.set(key, pic);
  return pic;
}
