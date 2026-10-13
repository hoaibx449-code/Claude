// Props and sets as vector primitives (origin at the bottom centre, on the ground, y down).
// Light fills keep the whiteboard look; every line can be drawn by the hand.
import { arc, ellipse, quad, rect, soft, wobble, type Prim, type Pt } from './geom.ts';

const INK = '#22252b';
const W = 2.6;
type Mk = (seed: number) => Prim[];
const wb = (d: Pt[], seed: number, closed = false) => wobble(d, seed, 0.6, closed);
const shape = (d: Pt[], fill: string, seed: number, z = 0, w = W): Prim => ({ d: wb(d, seed, true), closed: true, w, ink: INK, fill, z });
const line = (d: Pt[], seed: number, z = 0, w = W, ink = INK): Prim => ({ d: wb(d, seed), w, ink, z });

export const PROPS: Record<string, Mk> = {
  bench: (s) => [
    shape(rect(-70, -62, 140, 12, 3), '#d9a066', s), shape(rect(-70, -42, 140, 12, 3), '#d9a066', s + 1),
    line([[-58, -30], [-62, 0]], s + 2, 0, 5), line([[58, -30], [62, 0]], s + 3, 0, 5), line([[-60, -50], [-60, -30]], s + 4, 0, 4), line([[60, -50], [60, -30]], s + 5, 0, 4),
  ],
  table: (s) => [shape(rect(-55, -72, 110, 10, 3), '#e9c79a', s), line([[0, -62], [0, -4]], s + 1, 0, 5), line([[-24, 0], [24, 0]], s + 2, 0, 4)],
  chair: (s) => [line([[-18, -100], [-18, -52], [18, -52]], s, -1, 4), line([[-16, -52], [-18, 0]], s + 1, -1, 4), line([[16, -52], [18, 0]], s + 2, -1, 4)],
  stool: (s) => [shape(rect(-20, -56, 40, 8, 3), '#d9a066', s), line([[-14, -48], [-18, 0]], s + 1, 0, 4), line([[14, -48], [18, 0]], s + 2, 0, 4)],
  cup: (s) => [shape([[-9, -22], [9, -22], [7, 0], [-7, 0]], '#ffffff', s), line(arc(10, -13, 5, 6, -Math.PI / 2, Math.PI / 2, 6), s + 1, 0, 2.2), line(quad([-2, -26], [3, -32], [0, -38], 4), s + 2, 0, 1.6, '#9aa0a8')],
  phone: (s) => [shape(rect(-8, -26, 16, 26, 3), '#2f3542', s, 0, 2), { d: rect(-6, -23, 12, 18), closed: true, w: 0.8, ink: '#9ec5ff', fill: '#9ec5ff', z: 0.1 }],
  tree: (s) => [line([[-6, 0], [-4, -90]], s, 0, 9), line([[6, 0], [4, -90]], s + 1, 0, 0.1),
    shape(soft([[-60, -110], [-40, -175], [10, -195], [55, -165], [65, -110], [30, -80], [-35, -82]], 2), '#a8d8a0', s + 2, 1)],
  bush: (s) => [shape(soft([[-40, 0], [-44, -22], [-20, -40], [8, -36], [36, -40], [46, -18], [40, 0]], 2), '#b9e2b0', s)],
  lamp: (s) => [line([[0, 0], [0, -230]], s, 0, 4), line(quad([0, -230], [10, -248], [30, -244], 6), s + 1, 0, 4), shape(soft([[18, -246], [42, -246], [38, -230], [22, -230]], 1), '#ffe9a8', s + 2)],
  building: (s) => {
    const out: Prim[] = [shape([[-80, 0], [-80, -320], [80, -320], [80, 0]], '#eef1f5', s, -2)];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) out.push(shape(rect(-60 + c * 44, -300 + r * 56, 30, 36, 2), '#cfe3f6', s + 10 + r * 3 + c, -1.9, 2));
    return out;
  },
  window: (s) => [shape(rect(-60, -80, 120, 80), '#dcecfb', s, -2), line([[-68, 2], [68, 2]], s + 9, -1.9, 4), line([[0, -80], [0, 0]], s + 1, -1.9, 2.2), line([[-60, -40], [60, -40]], s + 2, -1.9, 2.2)],
  door: (s) => [shape(rect(-34, -150, 68, 150, 3), '#e6c9a8', s, -2), { d: ellipse(22, -72, 3.5, 3.5, 8), dot: true, w: 0, ink: INK, z: -1.9 }],
  plant: (s) => [shape([[-16, -30], [16, -30], [12, 0], [-12, 0]], '#d98e6a', s),
    line(quad([0, -30], [-20, -60], [-30, -70], 6), s + 1, 0, 3, '#3a9b5c'), line(quad([0, -30], [4, -70], [0, -86], 6), s + 2, 0, 3, '#3a9b5c'), line(quad([0, -30], [22, -56], [32, -64], 6), s + 3, 0, 3, '#3a9b5c')],
  desk: (s) => [shape(rect(-80, -78, 160, 12, 3), '#e9c79a', s), line([[-70, -66], [-70, 0]], s + 1, 0, 5), line([[70, -66], [70, 0]], s + 2, 0, 5)],
  laptop: (s) => [shape([[-26, -40], [26, -40], [22, -6], [-22, -6]], '#c9d3df', s), shape([[-32, -6], [32, -6], [36, 0], [-36, 0]], '#9aa7b6', s + 1)],
  balloons: (s) => {
    const out: Prim[] = [];
    const cols = ['#ff8a65', '#5b8def', '#ffd23f'];
    [[-22, -300], [14, -330], [34, -280]].forEach(([x, y], i) => {
      out.push(line(quad([0, 0], [x * 0.3 + 10, y * 0.5], [x, y + 34], 8), s + i * 3, 0, 1.6));
      out.push(shape(soft([[x, y + 34], [x - 24, y], [x - 20, y - 26], [x, y - 36], [x + 20, y - 26], [x + 24, y]], 2), cols[i], s + i * 3 + 1));
    });
    return out;
  },
  bunting: (s) => {
    const out: Prim[] = [line(quad([-200, -10], [0, 30], [200, -10], 16), s, 0, 2)];
    const cols = ['#ff8a65', '#ffd23f', '#5b8def', '#3cc68a', '#c084fc'];
    for (let i = 0; i < 9; i++) { const x = -180 + i * 45, y = -6 + 16 * (1 - ((x / 200) ** 2)); out.push(shape([[x - 12, y], [x + 12, y], [x, y + 26]], cols[i % 5], s + i + 1, 0, 2)); }
    return out;
  },
  sign: (s) => [line([[0, 0], [0, -170]], s, 0, 4), shape(rect(-34, -200, 68, 40, 6), '#ffd76a', s + 1)],
  sun: (s) => { const out: Prim[] = [shape(ellipse(0, -40, 26, 26, 24), '#ffd76a', s)]; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; out.push(line([[Math.cos(a) * 34, -40 + Math.sin(a) * 34], [Math.cos(a) * 46, -40 + Math.sin(a) * 46]], s + i + 1, 0, 2.4)); } return out; },
  cloud: (s) => [shape(soft([[-50, 0], [-56, -20], [-30, -36], [-6, -50], [24, -42], [48, -30], [54, -6], [40, 0]], 2), '#ffffff', s)],
  heart: (s) => [shape(soft([[0, 0], [-30, -26], [-30, -46], [-14, -54], [0, -42], [14, -54], [30, -46], [30, -26]], 1), '#ff6b6b', s)],
  bulb: (s) => { const out: Prim[] = [shape(soft([[-10, -10], [-10, -22], [-24, -38], [-22, -60], [0, -72], [22, -60], [24, -38], [10, -22], [10, -10]], 1), '#ffe58a', s), line([[-9, -4], [9, -4]], s + 1, 0, 3)]; for (let i = 0; i < 5; i++) { const a = -Math.PI * (0.15 + i * 0.175); out.push(line([[Math.cos(a) * 34, -44 + Math.sin(a) * 34], [Math.cos(a) * 46, -44 + Math.sin(a) * 46]], s + 3 + i, 0, 2.6, '#e0a400')); } return out; },
  check: (s) => [line([[-24, -26], [-6, -8], [26, -46]], s, 0, 7, '#2e9e5b')],
  cross: (s) => [line([[-22, -48], [22, -4]], s, 0, 7, '#e0453a'), line([[22, -48], [-22, -4]], s + 1, 0, 7, '#e0453a')],
  question: (s) => [line([...arc(0, -52, 14, 14, Math.PI, Math.PI * 2.3, 10), [6, -30], [2, -20]], s, 0, 5, '#5b6bff'), { d: ellipse(2, -8, 3.5, 3.5, 8), dot: true, w: 0, ink: '#5b6bff' }],
  exclaim: (s) => [line([[0, -60], [0, -22]], s, 0, 6, '#e0453a'), { d: ellipse(0, -8, 4, 4, 8), dot: true, w: 0, ink: '#e0453a' }],
  star: (s) => { const pts: Pt[] = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 11 : 26; pts.push([Math.cos(a) * r, -28 + Math.sin(a) * r]); } return [shape(pts, '#ffd23f', s)]; },
  clock: (s) => [shape(ellipse(0, -30, 28, 28, 24), '#ffffff', s), line([[0, -30], [0, -48]], s + 1, 0, 3), line([[0, -30], [12, -24]], s + 2, 0, 3)],
  coin: (s) => [shape(ellipse(0, -18, 18, 18, 20), '#ffd23f', s), line([[0, -28], [0, -8]], s + 1, 0, 2.4)],
  chart: (s) => [line([[-50, 0], [-50, -80]], s, 0, 2.4), line([[-50, 0], [50, 0]], s + 1, 0, 2.4), line([[-40, -14], [-16, -30], [6, -24], [40, -66]], s + 2, 0, 4, '#2e9e5b')],
  book: (s) => [shape([[-24, -36], [0, -30], [0, 0], [-24, -6]], '#ff8a65', s), shape([[0, -30], [24, -36], [24, -6], [0, 0]], '#ffb199', s + 1)],
  gift: (s) => [shape(rect(-22, -40, 44, 40, 2), '#c084fc', s), line([[0, -40], [0, 0]], s + 1, 0, 3, '#ffd23f'), line(quad([0, -40], [-16, -58], [-6, -40], 5), s + 2, 0, 2.4)],
  ground: (s) => [line([[-560, 0], [-200, 2], [160, -1], [560, 1]], s, -3, 2.4)],
  // the inner voice: a thought cloud
  thought: (s) => [shape(soft([[-60, -20], [-64, -50], [-34, -74], [0, -80], [36, -74], [64, -50], [60, -20], [30, -6], [-30, -6]], 2), '#ffffff', s, 5),
    shape(ellipse(-26, 10, 8, 6, 10), '#ffffff', s + 1, 5, 2), shape(ellipse(-38, 26, 5, 4, 8), '#ffffff', s + 2, 5, 2)],
  wall: (s) => [line([[-80, 0], [-80, -200]], s, -2, 3), line([[80, 0], [80, -200]], s + 1, -2, 3), line([[-80, -200], [80, -200]], s + 2, -2, 3)],
};

/** Sets: a place made of props, laid out around x = 0 (stage width ~ 540). */
export const SETS: Record<string, { kind: string; x: number; y?: number; s?: number }[]> = {
  street: [{ kind: 'building', x: -170, s: 0.9 }, { kind: 'building', x: 175, s: 0.75 }, { kind: 'lamp', x: 95 }, { kind: 'ground', x: 0 }],
  park: [{ kind: 'tree', x: -170 }, { kind: 'bush', x: 190 }, { kind: 'sun', x: 170, y: -560 }, { kind: 'ground', x: 0 }],
  bench: [{ kind: 'tree', x: -190 }, { kind: 'bench', x: 40 }, { kind: 'bush', x: 210 }, { kind: 'ground', x: 0 }],
  cafe: [{ kind: 'window', x: 150, y: -600, s: 1.1 }, { kind: 'plant', x: 205 }, { kind: 'table', x: 0 }, { kind: 'cup', x: -18, y: -72 }, { kind: 'cup', x: 22, y: -72 }, { kind: 'ground', x: 0 }],
  office: [{ kind: 'window', x: 150, y: -600, s: 1.1 }, { kind: 'desk', x: -250 }, { kind: 'laptop', x: -235, y: -78 }, { kind: 'plant', x: 220 }, { kind: 'ground', x: 0 }],
  party: [{ kind: 'balloons', x: -262, s: 0.62 }, { kind: 'table', x: 205 }, { kind: 'balloons', x: 232, y: -72, s: 0.5 }, { kind: 'cup', x: 190, y: -72 }, { kind: 'ground', x: 0 }],
  room: [{ kind: 'window', x: 150, y: -600, s: 1.1 }, { kind: 'door', x: 190 }, { kind: 'plant', x: -215 }, { kind: 'ground', x: 0 }],
  bus: [{ kind: 'sign', x: -190 }, { kind: 'bench', x: 120 }, { kind: 'ground', x: 0 }],
  blank: [{ kind: 'ground', x: 0 }],
};

export function propPrims(kind: string, seed: number): Prim[] { return (PROPS[kind] || PROPS.star)(seed); }
