// Video formats ("looks"). Each one has its own storytelling grammar, pacing and colour sets:
//   kinetic  big words, 1-3 at a time, key word boxed, punch-in on every beat
//   split    two sides of the screen doing opposite things (wrong / right, poor / rich)
//   chat     a message thread that grows with the narration
//   story    one stick character walking through places along a street
//   data     a headline figure counting up, then its breakdown
//   quiz     question, options, a 3-2-1 countdown, then the answer
//   doc      full-screen pictures with slow camera moves, film grain and a lower third
// Every frame is a pure function of t, so the browser preview and the server MP4 match.
// The engine also lists sound cues (pops, whooshes, message pings, ticks) for the mixer.
import type { Ctx, Env, Img, LookData, ProjectSpec, SceneSpec, SceneTiming, Timeline } from './types.ts';
import { resolveIcon, type IconSet } from './sketch.ts';
import { flatten } from './svgpath.ts';
import { pose, strokes, type Action, ACTIONS } from './stick.ts';
import { wrapVi } from './textwrap.ts';

export type Sfx = 'whoosh' | 'pop' | 'msg' | 'tick' | 'ding';
export interface Cue { t: number; k: Sfx }

export interface Skin {
  name: string;
  /** backgrounds, cycled per scene */
  bg: [string, string][];
  ink: string; sub: string;
  /** highlight box behind key words / active caption word, and the text on it */
  hl: string; hlInk: string;
  good: string; bad: string;
  /** cards, bubbles */
  card: string; cardInk: string;
  /** chart / sticker colours */
  colors: string[];
  /** split: side tints */
  a?: string; b?: string;
  /** chat: bubble colours */
  bubA?: string; bubAInk?: string; bubB?: string; bubBInk?: string; head?: string;
  /** doc: colour grade over the pictures */
  grade?: string; mono?: boolean;
}

const C4 = ['#ffd23f', '#5b8def', '#ff6b5e', '#3cc68a', '#c084fc'];
export const SKINS: Record<string, Skin[]> = {
  kinetic: [
    { name: 'dem', bg: [['#121019', '#1d1240'], ['#0f1a2b', '#10233d'], ['#1a1020', '#2c1338']], ink: '#ffffff', sub: '#c9c3e0', hl: '#ffd23f', hlInk: '#16131f', good: '#3cc68a', bad: '#ff6b5e', card: '#ffffff', cardInk: '#16131f', colors: C4 },
    { name: 'sang', bg: [['#fffaf0', '#fff1dc'], ['#f3f7ff', '#e6eeff'], ['#fff4f4', '#ffe6e3']], ink: '#17122b', sub: '#5d5875', hl: '#ff4f3a', hlInk: '#ffffff', good: '#1f8a57', bad: '#e5372b', card: '#17122b', cardInk: '#ffffff', colors: ['#ff4f3a', '#3d6bff', '#f5a623', '#1f8a57', '#8b5cf6'] },
    { name: 'tim', bg: [['#3b0764', '#7c3aed'], ['#4c1d95', '#be185d'], ['#312e81', '#7c3aed']], ink: '#ffffff', sub: '#e9d5ff', hl: '#facc15', hlInk: '#2e1065', good: '#4ade80', bad: '#fb7185', card: '#ffffff', cardInk: '#2e1065', colors: ['#facc15', '#f472b6', '#38bdf8', '#4ade80', '#fb923c'] },
  ],
  split: [
    { name: 'do-xanh', bg: [['#121019', '#121019']], a: '#3a1417', b: '#0f2e20', ink: '#ffffff', sub: '#d9d6e6', hl: '#ffd23f', hlInk: '#16131f', good: '#3cc68a', bad: '#ff6b5e', card: '#ffffff', cardInk: '#16131f', colors: C4 },
    { name: 'sang', bg: [['#ffffff', '#ffffff']], a: '#ffe9e6', b: '#e3f7ec', ink: '#17122b', sub: '#4b4660', hl: '#17122b', hlInk: '#ffffff', good: '#1f8a57', bad: '#e5372b', card: '#ffffff', cardInk: '#17122b', colors: ['#e5372b', '#1f8a57', '#3d6bff', '#f5a623', '#8b5cf6'] },
    { name: 'tim-vang', bg: [['#1b1035', '#1b1035']], a: '#2b1a4f', b: '#3d2a08', ink: '#ffffff', sub: '#e4dcf7', hl: '#facc15', hlInk: '#1b1035', good: '#facc15', bad: '#c4b5fd', card: '#ffffff', cardInk: '#1b1035', colors: ['#c4b5fd', '#facc15', '#f472b6', '#38bdf8', '#4ade80'] },
  ],
  chat: [
    { name: 'sang', bg: [['#eef1f6', '#e7ebf3']], head: '#ffffff', bubA: '#ffffff', bubAInk: '#17122b', bubB: '#3d7bff', bubBInk: '#ffffff', ink: '#17122b', sub: '#6b6880', hl: '#ffd23f', hlInk: '#16131f', good: '#1f8a57', bad: '#e5372b', card: '#ffd23f', cardInk: '#16131f', colors: C4 },
    { name: 'toi', bg: [['#0b141a', '#0e1a22']], head: '#1f2c34', bubA: '#1f2c34', bubAInk: '#e9edef', bubB: '#005c4b', bubBInk: '#e9edef', ink: '#e9edef', sub: '#8696a0', hl: '#25d366', hlInk: '#0b141a', good: '#25d366', bad: '#ff6b5e', card: '#25d366', cardInk: '#0b141a', colors: C4 },
    { name: 'hong', bg: [['#fff0f6', '#ffe4ef']], head: '#ffffff', bubA: '#ffffff', bubAInk: '#3b0a24', bubB: '#ff5c9a', bubBInk: '#ffffff', ink: '#3b0a24', sub: '#9d6b84', hl: '#ffd23f', hlInk: '#3b0a24', good: '#16a34a', bad: '#e11d48', card: '#3b0a24', cardInk: '#ffffff', colors: C4 },
  ],
  story: [
    { name: 'giay', bg: [['#fffdf6', '#fff6e2']], ink: '#1b1a22', sub: '#5d5b6a', hl: '#ffd23f', hlInk: '#1b1a22', good: '#1f8a57', bad: '#e5372b', card: '#ffffff', cardInk: '#1b1a22', colors: ['#ffd9a8', '#cfe3ff', '#ffd1dc', '#d4f5df', '#e8dcff'] },
    { name: 'bang-den', bg: [['#20302a', '#1a2823']], ink: '#f3f1e7', sub: '#c3c9bd', hl: '#ffd23f', hlInk: '#1a2823', good: '#9be7b5', bad: '#ff9c8a', card: '#f3f1e7', cardInk: '#1a2823', colors: ['#2c4239', '#33493f', '#2a3d35', '#30463c', '#2e443a'] },
    { name: 'xanh', bg: [['#eaf4ff', '#dbeafe']], ink: '#0f2747', sub: '#3e5878', hl: '#ff7a59', hlInk: '#ffffff', good: '#15803d', bad: '#dc2626', card: '#ffffff', cardInk: '#0f2747', colors: ['#ffffff', '#fff7e0', '#e0f2fe', '#fde2e4', '#e9fbe9'] },
  ],
  data: [
    { name: 'dem', bg: [['#0d1424', '#111c33']], ink: '#ffffff', sub: '#9fb3d9', hl: '#5b8def', hlInk: '#ffffff', good: '#3cc68a', bad: '#ff6b5e', card: '#16223b', cardInk: '#ffffff', colors: ['#5b8def', '#f2a541', '#ff6b5e', '#3cc68a', '#c084fc'] },
    { name: 'sang', bg: [['#f7f9fc', '#eef2f8']], ink: '#0f172a', sub: '#475569', hl: '#2563eb', hlInk: '#ffffff', good: '#16a34a', bad: '#dc2626', card: '#ffffff', cardInk: '#0f172a', colors: ['#2563eb', '#f59e0b', '#ef4444', '#16a34a', '#8b5cf6'] },
    { name: 'xanh-la', bg: [['#06281f', '#0a3a2c']], ink: '#ecfdf5', sub: '#a7d7c5', hl: '#facc15', hlInk: '#06281f', good: '#4ade80', bad: '#fb7185', card: '#0c3528', cardInk: '#ecfdf5', colors: ['#facc15', '#4ade80', '#38bdf8', '#fb7185', '#c084fc'] },
  ],
  quiz: [
    { name: 'tim', bg: [['#2b1660', '#4c1d95']], ink: '#ffffff', sub: '#ddd6fe', hl: '#ffd23f', hlInk: '#2b1660', good: '#22c55e', bad: '#f87171', card: '#ffffff', cardInk: '#2b1660', colors: C4 },
    { name: 'xanh', bg: [['#0b3d91', '#1d4ed8']], ink: '#ffffff', sub: '#dbeafe', hl: '#fde047', hlInk: '#0b3d91', good: '#22c55e', bad: '#fca5a5', card: '#ffffff', cardInk: '#0b3d91', colors: C4 },
    { name: 'cam', bg: [['#7c2d12', '#c2410c']], ink: '#ffffff', sub: '#fed7aa', hl: '#fef08a', hlInk: '#7c2d12', good: '#4ade80', bad: '#fecaca', card: '#fff7ed', cardInk: '#7c2d12', colors: C4 },
  ],
  doc: [
    { name: 'dien-anh', bg: [['#0b0b0f', '#0b0b0f']], grade: 'rgba(255,170,90,.10)', ink: '#ffffff', sub: '#e5e5e5', hl: '#f2a541', hlInk: '#0b0b0f', good: '#3cc68a', bad: '#ff6b5e', card: 'rgba(0,0,0,.58)', cardInk: '#ffffff', colors: C4 },
    { name: 'trang-den', bg: [['#0b0b0b', '#0b0b0b']], mono: true, grade: 'rgba(0,0,0,.05)', ink: '#ffffff', sub: '#d4d4d4', hl: '#ffffff', hlInk: '#0b0b0b', good: '#e5e5e5', bad: '#a3a3a3', card: 'rgba(0,0,0,.62)', cardInk: '#ffffff', colors: C4 },
    { name: 'lanh', bg: [['#060b14', '#060b14']], grade: 'rgba(70,130,220,.12)', ink: '#ffffff', sub: '#dbeafe', hl: '#7dd3fc', hlInk: '#06101e', good: '#4ade80', bad: '#fb7185', card: 'rgba(4,12,28,.6)', cardInk: '#ffffff', colors: C4 },
  ],
};
export const skinOf = (look: string, name?: string) => (SKINS[look] || SKINS.kinetic).find((s) => s.name === name) || (SKINS[look] || SKINS.kinetic)[0];

// ------------------------------------------------------------------ small helpers
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a || 1e-6));
const eOut = (x: number) => 1 - (1 - x) ** 3;
const eIO = (x: number) => x * x * (3 - 2 * x);
const eBack = (x: number) => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2;
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const plain = (w: string) => fold(w).replace(/[^a-z0-9%]/g, '');
const isLight = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150; };
function hash(n: number) { let x = Math.imul(n ^ 0x9e3779b9, 2654435761); x ^= x >>> 15; return (x >>> 0) / 4294967296; }
function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function grad(c: Ctx, W: number, H: number, [a, b]: [string, string]) {
  if (a === b) { c.fillStyle = a; c.fillRect(0, 0, W, H); return; }
  const g = c.createLinearGradient(0, 0, W * 0.4, H); g.addColorStop(0, a); g.addColorStop(1, b); c.fillStyle = g; c.fillRect(0, 0, W, H);
}

/** When each word of a line is said: syllable weights, longer after punctuation (as the hand-drawn mode). */
export function wordTimes(line: string, start: number, end: number) {
  const words = line.split(/\s+/).filter(Boolean);
  const weight = words.map((w) => 1 + (/[,;:]$/.test(w) ? 1.5 : /[.!?…]$/.test(w) ? 2.5 : 0));
  const total = weight.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return words.map((w, i) => { const t = start + (acc / total) * (end - start); acc += weight[i]; return { w, t }; });
}

const STRONG = /^(khong|dung|sai|giau|ngheo|tien|no|luon|het|tang|giam|gap|that|moi|tuyet|nguy|bimat|saylam|chua|bao|gio|ngay|nhat)$/;
/** Beats of 1-3 words; a number keeps its unit ("15 triệu", "20%"). */
export function beats(line: string) {
  const words = line.split(/\s+/).filter(Boolean), out: number[][] = [];
  let cur: number[] = [];
  const unit = /^(%|tr|triệu|tỷ|nghìn|ngàn|k|đồng|đ|năm|tháng|ngày|giờ|phút|lần|người|bước)[,.!?…]*$/i;
  words.forEach((w, i) => {
    cur.push(i);
    const next = words[i + 1];
    const keepUnit = next && /\d/.test(w) && unit.test(next);
    if (!keepUnit && (cur.length >= 3 || /[,;:.!?…]$/.test(w) || (cur.length >= 2 && /\d/.test(next || '')))) { out.push(cur); cur = []; }
  });
  if (cur.length) out.push(cur);
  // a lone short word joins the beat before it
  return out.reduce((acc: number[][], b) => { if (b.length === 1 && acc.length && plain(words[b[0]]).length <= 2 && acc[acc.length - 1].length < 4) acc[acc.length - 1].push(...b); else acc.push(b); return acc; }, []);
}

export interface LookBuild {
  c: Ctx; env: Env; project: ProjectSpec; timeline: Timeline; skin: Skin; W: number; H: number; S: number; portrait: boolean;
  icons: IconSet; font: string; hand: string; cues: Cue[]; photos: (any | null)[];
}
export interface LookScene { draw(c: Ctx, t: number, alpha: number): void; captions: boolean }

const iconCache = new Map<string, [number, number][][]>();
export function iconPaths(name: string | undefined, icons: IconSet) {
  if (!name) return null;
  const key = resolveIcon(name, icons);
  if (!key) return null;
  if (!iconCache.has(key)) iconCache.set(key, icons[key].split('|').flatMap((d) => flatten(d)));
  return iconCache.get(key)!;
}
/** A Tabler line icon centred at (cx, cy), `size` px wide. */
export function drawIcon(c: Ctx, paths: [number, number][][] | null, cx: number, cy: number, size: number, color: string, width = 2) {
  if (!paths) return;
  const k = size / 24;
  c.save(); c.translate(cx - 12 * k, cy - 12 * k);
  c.strokeStyle = color; c.lineWidth = width * k; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const l of paths) { c.beginPath(); l.forEach(([x, y], i) => (i ? c.lineTo(x * k, y * k) : c.moveTo(x * k, y * k))); c.stroke(); }
  c.restore();
}
/** Round sticker with an icon, popping in at `at`. */
function sticker(c: Ctx, B: LookBuild, name: string | undefined, cx: number, cy: number, r: number, t: number, at: number, bg: string, fg: string) {
  const p = seg(t, at, at + 0.32);
  if (p <= 0) return;
  const paths = iconPaths(name, B.icons);
  if (!paths) return;
  const s = eBack(p), bob = Math.sin((t - at) * 2.4) * r * 0.04;
  c.save(); c.translate(cx, cy + bob); c.scale(s, s); c.rotate(Math.sin((t - at) * 1.6) * 0.05);
  c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.arc(r * 0.06, r * 0.1, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = bg; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
  drawIcon(c, paths, 0, 0, r * 1.15, fg, 2.1);
  c.restore();
}
function stickFigure(c: Ctx, action: string, t: number, x: number, ground: number, scale: number, color: string, width: number, facing: 1 | -1 = 1) {
  const a = (ACTIONS as string[]).includes(action) ? (action as Action) : 'idle';
  c.save(); c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const l of strokes(pose(a, t), x, ground, scale, facing)) { c.beginPath(); l.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.stroke(); }
  c.restore();
}
function text(c: Ctx, B: LookBuild, s: string, x: number, y: number, size: number, color: string, align: 'left' | 'center' | 'right' = 'center', font = B.font) {
  c.font = `${size}px ${font}`; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillStyle = color; c.fillText(s, x, y);
}
/** Wrapped block centred on (cx, cy); returns its height. */
function block(c: Ctx, B: LookBuild, s: string, cx: number, cy: number, size: number, maxW: number, color: string, lh = 1.22, align: 'left' | 'center' = 'center', maxRows = 6) {
  const rows = wrapVi(c, s, size, maxW, B.font).slice(0, maxRows), h = rows.length * size * lh;
  c.font = `${size}px ${B.font}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic';
  rows.forEach((r, i) => c.fillText(r, cx, cy - h / 2 + size * 0.95 + i * size * lh));
  return h;
}
/** Largest size (≤ max) at which `s` fits in maxRows rows of maxW. */
function fit(c: Ctx, B: LookBuild, s: string, max: number, min: number, maxW: number, maxRows: number) {
  for (let size = max; size > min; size -= 2) if (wrapVi(c, s, size, maxW, B.font).length <= maxRows) return size;
  return min;
}
const fmtNum = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('vi-VN') : (Math.round(v * 10) / 10).toString().replace('.', ','));

// ------------------------------------------------------------------ captions + progress (shared)
export function drawCaption(c: Ctx, B: LookBuild, sc: SceneSpec, T: SceneTiming, t: number, y: number, style: 'box' | 'doc' = 'box') {
  let li = -1;
  T.lines.forEach((l, i) => { if (t >= l.start - 0.05 && t <= l.end + 0.35) li = i; });
  if (li < 0) return;
  const span = T.lines[li], words = wordTimes(sc.lines[li], span.start, span.end);
  const size = Math.round((B.portrait ? 30 : 26) * B.S), maxW = B.W * (B.portrait ? 0.86 : 0.7);
  c.font = `${size}px ${B.font}`;
  const space = c.measureText(' ').width, rows: number[][] = [];
  let row: number[] = [], rw = 0;
  words.forEach(({ w }, i) => { const ww = c.measureText(w).width; if (row.length && rw + space + ww > maxW) { rows.push(row); row = []; rw = 0; } rw += (row.length ? space : 0) + ww; row.push(i); });
  if (row.length) rows.push(row);
  let k = words.findIndex((w, i) => t >= w.t && (i === words.length - 1 || t < words[i + 1].t));
  if (t < words[0].t) k = 0;
  // two rows at a time, following the spoken word
  const ri = Math.max(0, rows.findIndex((r) => r.includes(k)));
  const show = rows.slice(Math.floor(ri / 2) * 2, Math.floor(ri / 2) * 2 + 2), lh = size * 1.32;
  const y0 = y - ((show.length - 1) * lh) / 2;
  if (style === 'doc') {
    const bw = Math.min(B.W - 32 * B.S, Math.max(...show.map((r) => r.reduce((a, i) => a + c.measureText(words[i].w).width, 0) + space * (r.length - 1))) + 44 * B.S);
    c.fillStyle = B.skin.card; rr(c, (B.W - bw) / 2, y0 - size * 1.05, bw, show.length * lh + size * 0.55, 12 * B.S); c.fill();
  }
  show.forEach((r, ri2) => {
    const widths = r.map((i) => c.measureText(words[i].w).width), total = widths.reduce((a, b) => a + b, 0) + space * (r.length - 1);
    let x = (B.W - total) / 2;
    const yy = y0 + ri2 * lh;
    r.forEach((i, j) => {
      const active = i === k;
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      if (style === 'box' && active) {
        c.fillStyle = B.skin.hl; rr(c, x - 6 * B.S, yy - size * 0.86, widths[j] + 12 * B.S, size * 1.14, 8 * B.S); c.fill();
        c.fillStyle = B.skin.hlInk; c.fillText(words[i].w, x, yy);
      } else {
        const light = style === 'box' && isLight(B.skin.bg[0][0]);
        if (style === 'box' && !light) { c.lineJoin = 'round'; c.lineWidth = size * 0.2; c.strokeStyle = 'rgba(0,0,0,.72)'; c.strokeText(words[i].w, x, yy); }
        c.fillStyle = style === 'doc' && active ? B.skin.hl : light ? B.skin.ink : '#ffffff'; c.fillText(words[i].w, x, yy);
        if (style === 'doc' && active) { c.fillStyle = B.skin.hl; c.fillRect(x, yy + size * 0.14, widths[j], 3 * B.S); }
      }
      x += widths[j] + space;
    });
  });
}
export function drawProgress(c: Ctx, B: LookBuild, t: number) {
  const D = B.timeline.duration, h = 6 * B.S;
  c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(0, 0, B.W, h);
  c.fillStyle = B.skin.hl; c.fillRect(0, 0, B.W * clamp(t / D), h);
}

// ------------------------------------------------------------------ 1. kinetic
function kinetic(B: LookBuild, sc: SceneSpec, T: SceneTiming, si: number): LookScene {
  const { c, W, H, S, skin } = B;
  const items: { at: number; words: string[]; hi: number; num: boolean }[] = [];
  const keys = new Set((sc.x?.keys || []).flatMap((k) => k.split(/\s+/)).map(plain).filter((k) => k.length > 2));
  sc.lines.forEach((line, li) => {
    const span = T.lines[li]; if (!span) return;
    const times = wordTimes(line, span.start, span.end), ws = times.map((x) => x.w);
    beats(line).forEach((b, bi) => {
      const words = b.map((i) => ws[i]);
      let hi = words.findIndex((w) => /\d/.test(w));
      if (hi < 0) hi = words.findIndex((w) => keys.has(plain(w)));
      if (hi < 0) hi = words.findIndex((w) => STRONG.test(plain(w)));
      items.push({ at: times[b[0]].t - 0.04, words, hi, num: hi >= 0 && /\d/.test(words[hi]) });
    });
  });
  // never an empty frame: the first beat is already there when the scene opens
  if (items[0]) items[0].at = Math.min(items[0].at, T.start);
  for (const it of items) if (it.hi >= 0) B.cues.push({ t: it.at, k: 'pop' });
  const icon = sc.x?.icon;
  const maxW = W * (B.portrait ? 0.84 : 0.72);
  // layout once per beat
  const laid = items.map((it) => {
    const txt = it.words.join(' ');
    let size = Math.round((B.portrait ? 96 : 84) * S);
    for (; size > 40 * S; size -= 4) if (wrapVi(c, txt, size, maxW, B.font).length <= (B.portrait ? 3 : 2)) break;
    const rows = wrapVi(c, txt, size, maxW, B.font);
    return { ...it, size, rows };
  });
  const bg = skin.bg[si % skin.bg.length];
  return {
    captions: false,
    draw(c2, t, alpha) {
      c2.save(); c2.globalAlpha = alpha;
      grad(c2, W, H, bg);
      // soft moving glow
      const gx = W * (0.5 + Math.sin(t * 0.7 + si) * 0.25), gy = H * (0.4 + Math.cos(t * 0.5) * 0.12);
      const g = c2.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.6); g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c2.fillStyle = g; c2.fillRect(0, 0, W, H);
      let k = -1;
      laid.forEach((it, i) => { if (t >= it.at) k = i; });
      if (k >= 0) {
        const it = laid[k], p = seg(t, it.at, it.at + 0.16);
        const z = 1 + 0.22 * (1 - eOut(p)), shake = it.num ? Math.sin(t * 70) * 5 * S * (1 - seg(t, it.at, it.at + 0.4)) : 0;
        const cy = H * (icon ? 0.42 : 0.48);
        c2.save(); c2.translate(W / 2 + shake, cy); c2.scale(z, z); c2.globalAlpha *= clamp(p * 3);
        c2.font = `${it.size}px ${B.font}`; c2.textBaseline = 'alphabetic';
        const lh = it.size * 1.18, y0 = -((it.rows.length - 1) * lh) / 2 + it.size * 0.36, space = c2.measureText(' ').width;
        const hiWord = it.hi >= 0 ? it.words[it.hi] : null;
        it.rows.forEach((row, r) => {
          const ws = row.split(' '), widths = ws.map((w) => c2.measureText(w).width), total = widths.reduce((a, b) => a + b, 0) + space * (ws.length - 1);
          let x = -total / 2;
          ws.forEach((w, j) => {
            const y = y0 + r * lh;
            if (w === hiWord) {
              c2.fillStyle = skin.hl; rr(c2, x - 12 * S, y - it.size * 0.84, widths[j] + 24 * S, it.size * 1.08, 14 * S); c2.fill();
              c2.fillStyle = skin.hlInk;
            } else { c2.fillStyle = 'rgba(0,0,0,.25)'; c2.textAlign = 'left'; c2.fillText(w, x + 3 * S, y + 4 * S); c2.fillStyle = skin.ink; }
            c2.textAlign = 'left'; c2.fillText(w, x, y);
            x += widths[j] + space;
          });
        });
        c2.restore();
      }
      if (icon) sticker(c2, B, icon, W / 2, H * 0.74, (B.portrait ? 78 : 56) * S, t, T.lines[0].start + 0.2, skin.hl, skin.hlInk);
      c2.restore();
    },
  };
}

// ------------------------------------------------------------------ 2. split
function split(B: LookBuild, sc: SceneSpec, T: SceneTiming, si: number): LookScene {
  const { W, H, S, skin, portrait } = B, x = sc.x || {};
  const sides = B.project.sides || { a: 'Cách sai', b: 'Cách đúng' };
  const halves = portrait ? [{ x: 0, y: 0, w: W, h: H / 2 }, { x: 0, y: H / 2, w: W, h: H / 2 }] : [{ x: 0, y: 0, w: W / 2, h: H }, { x: W / 2, y: 0, w: W / 2, h: H }];
  const last = T.lines.length - 1, sEnd = T.lines[last].end;
  const atA = T.lines[0].start + 0.1, atB = T.lines.length > 1 ? T.lines[1].start : (T.lines[0].start + T.lines[0].end) / 2;
  const both = !!(x.a && x.b);
  if (both) { B.cues.push({ t: atA, k: 'pop' }, { t: atB, k: 'ding' }); } else B.cues.push({ t: atA, k: 'pop' });
  const side = (c: Ctx, t: number, hv: typeof halves[0], label: string, body: string | undefined, iconName: string | undefined, value: string | undefined, action: string, at: number, tint: string, accent: string) => {
    c.fillStyle = tint; c.fillRect(hv.x, hv.y, hv.w, hv.h);
    // label pill
    const ls = Math.round(22 * S); c.font = `${ls}px ${B.font}`;
    const lw = c.measureText(label.toUpperCase()).width + 28 * S;
    const ly = hv.y + (portrait && hv.y > 0 ? 46 : 22) * S;
    c.fillStyle = accent; rr(c, hv.x + 20 * S, ly, lw, ls * 1.7, ls * 0.85); c.fill();
    text(c, B, label.toUpperCase(), hv.x + 34 * S, ly + ls * 1.18, ls, '#ffffff', 'left');
    const ground = hv.y + hv.h * 0.86;
    stickFigure(c, t > at ? action : 'idle', t, hv.x + hv.w * 0.18, ground, 0.62 * S * (portrait ? 1 : 1.2), skin.ink, 6 * S);
    if (body) {
      const p = seg(t, at, at + 0.3);
      if (p > 0) {
        c.save(); c.globalAlpha *= p; c.translate(0, (1 - eOut(p)) * 18 * S);
        const size = fit(c, B, body, Math.round(34 * S), 20 * S, hv.w * 0.6, 4);
        block(c, B, body, hv.x + hv.w * 0.62, hv.y + hv.h * 0.48, size, hv.w * 0.6, skin.ink);
        c.restore();
      }
    }
    if (iconName) sticker(c, B, iconName, hv.x + hv.w - 56 * S, hv.y + 50 * S, 32 * S, t, at + 0.15, accent, '#ffffff');
    if (value) {
      const n = Number(value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
      const p = eOut(seg(t, at + 0.2, at + 1.2));
      const shown = Number.isFinite(n) && n > 0 ? value.replace(/[\d.,]+/, fmtNum(n * p)) : value;
      if (p > 0) text(c, B, shown, hv.x + hv.w - 24 * S, hv.y + hv.h - 30 * S, Math.round(44 * S), accent, 'right');
    }
  };
  return {
    captions: false,
    draw(c, t, alpha) {
      c.save(); c.globalAlpha = alpha;
      grad(c, W, H, skin.bg[0]);
      if (both) {
        side(c, t, halves[0], sides.a, x.a, x.aIcon, x.aValue, x.aAction || (t > sEnd - 0.6 ? 'sad' : 'shrug'), atA, skin.a!, skin.bad);
        side(c, t, halves[1], sides.b, x.b, x.bIcon, x.bValue, x.bAction || (t > sEnd - 0.6 ? 'cheer' : 'point'), atB, skin.b!, skin.good);
        // divider + VS
        c.fillStyle = skin.ink; if (portrait) c.fillRect(0, H / 2 - 2 * S, W, 4 * S); else c.fillRect(W / 2 - 2 * S, 0, 4 * S, H);
        const vs = eBack(seg(t, T.start, T.start + 0.35));
        c.save(); c.translate(W / 2, H / 2); c.scale(vs, vs);
        c.fillStyle = skin.hl; c.beginPath(); c.arc(0, 0, 34 * S, 0, Math.PI * 2); c.fill();
        text(c, B, 'VS', 0, 10 * S, Math.round(28 * S), skin.hlInk); c.restore();
      } else {
        // a scene without two sides: one statement across the divider
        c.fillStyle = skin.a!; portrait ? c.fillRect(0, 0, W, H / 2) : c.fillRect(0, 0, W / 2, H);
        c.fillStyle = skin.b!; portrait ? c.fillRect(0, H / 2, W, H / 2) : c.fillRect(W / 2, 0, W / 2, H);
        const p = seg(t, atA, atA + 0.3), line = sc.lines.join(' ');
        c.save(); c.globalAlpha *= p; c.translate(W / 2, H * 0.44); c.scale(0.9 + 0.1 * eBack(p), 0.9 + 0.1 * eBack(p));
        const size = fit(c, B, line, Math.round(40 * S), 22 * S, W * 0.7, 5), rows = wrapVi(c, line, size, W * 0.7, B.font);
        const bh = rows.length * size * 1.25 + 56 * S;
        c.fillStyle = skin.card; rr(c, -W * 0.41, -bh / 2, W * 0.82, bh, 22 * S); c.fill();
        block(c, B, line, 0, 0, size, W * 0.7, skin.cardInk, 1.25);
        c.restore();
        if (x.icon) sticker(c, B, x.icon, W / 2, H * 0.44 + 160 * S, 44 * S, t, atA + 0.25, skin.hl, skin.hlInk);
      }
      c.restore();
    },
  };
}

// ------------------------------------------------------------------ 3. chat (one thread across all scenes)
interface Bubble { who: 'a' | 'b'; text: string; at: number; rows: string[]; w: number; h: number }
function chatThread(B: LookBuild) {
  const { c, W, S, skin, portrait } = B, size = Math.round((portrait ? 27 : 22) * S), maxW = W * (portrait ? 0.68 : 0.44);
  const bubbles: Bubble[] = [], cards: { text: string; at: number; until: number }[] = [];
  let n = 0;
  B.project.scenes.forEach((sc, si) => {
    const T = B.timeline.scenes[si], card = sc.x?.card;
    const lines = sc.lines.map((l, i) => ({ l, i })).filter(({ l }) => l !== card);
    const msgs = sc.x?.chat?.length ? sc.x.chat : lines.map(({ l }) => ({ who: (n++ % 2 ? 'b' : 'a') as 'a' | 'b', text: l }));
    const s0 = T.lines[0].start, s1 = T.lines[T.lines.length - 1].end;
    msgs.forEach((m, k) => {
      const at = msgs.length === sc.lines.length ? T.lines[k].start - 0.12 : s0 + ((s1 - s0) * k) / Math.max(1, msgs.length);
      const rows = wrapVi(c, m.text, size, maxW - 36 * S, B.font);
      c.font = `${size}px ${B.font}`;
      const w = Math.max(...rows.map((r) => c.measureText(r).width)) + 40 * S, h = rows.length * size * 1.3 + 30 * S;
      bubbles.push({ who: m.who === 'b' ? 'b' : 'a', text: m.text, at, rows, w, h });
      B.cues.push({ t: at, k: 'msg' });
    });
    if (card) {
      const li = sc.lines.indexOf(card), at = li >= 0 ? T.lines[li].start : s0;
      cards.push({ text: card, at, until: T.end + (si === B.project.scenes.length - 1 ? 2 : 0) });
      B.cues.push({ t: at, k: 'ding' });
    }
  });
  return { bubbles, cards, size };
}
function chat(B: LookBuild, thread: ReturnType<typeof chatThread>): LookScene {
  const { W, H, S, skin, portrait } = B, { bubbles, cards, size } = thread;
  const name = B.project.chatName || 'Bạn thân', headH = (portrait ? 112 : 84) * S, gap = 14 * S;
  const colW = portrait ? W : Math.min(W, 640 * S), x0 = (W - colW) / 2, pad = 22 * S;
  const tops: number[] = []; let y = 0;
  for (const b of bubbles) { tops.push(y); y += b.h + gap; }
  return {
    captions: false,
    draw(c, t, alpha) {
      c.save(); c.globalAlpha = alpha;
      grad(c, W, H, skin.bg[0]);
      const shown = bubbles.filter((b) => t >= b.at).length;
      // scroll so the newest bubble sits above the bottom edge
      const area = H - headH - 60 * S;
      const target = (k: number) => Math.max(0, (k > 0 ? tops[k - 1] + bubbles[k - 1].h : 0) - area + 40 * S);
      const lastAt = shown ? bubbles[shown - 1].at : 0;
      const scroll = shown ? target(shown - 1) + (target(shown) - target(shown - 1)) * eOut(seg(t, lastAt, lastAt + 0.3)) : 0;
      c.save(); c.beginPath(); c.rect(0, headH, W, H - headH); c.clip();
      c.translate(0, headH + 26 * S - scroll);
      for (let k = 0; k < shown; k++) {
        const b = bubbles[k], p = seg(t, b.at, b.at + 0.25), right = b.who === 'b';
        const bx = right ? x0 + colW - pad - b.w : x0 + pad, by = tops[k];
        c.save(); c.translate(right ? bx + b.w : bx, by + b.h); c.scale(0.6 + 0.4 * eBack(p), 0.6 + 0.4 * eBack(p)); c.translate(-(right ? bx + b.w : bx), -(by + b.h));
        c.globalAlpha *= clamp(p * 2);
        c.fillStyle = 'rgba(0,0,0,.08)'; rr(c, bx, by + 3 * S, b.w, b.h, 24 * S); c.fill();
        c.fillStyle = right ? skin.bubB! : skin.bubA!; rr(c, bx, by, b.w, b.h, 24 * S); c.fill();
        c.fillStyle = right ? skin.bubBInk! : skin.bubAInk!; c.font = `${size}px ${B.font}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
        b.rows.forEach((r, i) => c.fillText(r, bx + 20 * S, by + 15 * S + size * 0.98 + i * size * 1.3));
        c.restore();
      }
      // typing dots before the next bubble
      const next = bubbles[shown];
      if (next && next.at - t < 0.75) {
        const right = next.who === 'b', by = shown ? tops[shown - 1] + bubbles[shown - 1].h + gap : 0, w = 86 * S, h = 48 * S, bx = right ? x0 + colW - pad - w : x0 + pad;
        c.fillStyle = right ? skin.bubB! : skin.bubA!; rr(c, bx, by, w, h, 24 * S); c.fill();
        for (let i = 0; i < 3; i++) { c.fillStyle = right ? skin.bubBInk! : skin.sub; c.globalAlpha = alpha * (0.5 + 0.5 * Math.sin(t * 10 - i)); c.beginPath(); c.arc(bx + 24 * S + i * 19 * S, by + h / 2 + Math.sin(t * 10 - i) * 3 * S, 5 * S, 0, Math.PI * 2); c.fill(); }
        c.globalAlpha = alpha;
      }
      // "seen" under the last message from me
      const lastMine = shown && bubbles[shown - 1].who === 'b' && t - bubbles[shown - 1].at > 0.9 && !(next && next.at - t < 0.75);
      if (lastMine) text(c, B, 'Đã xem', x0 + colW - pad, tops[shown - 1] + bubbles[shown - 1].h + 26 * S, Math.round(16 * S), skin.sub, 'right');
      c.restore();
      // header
      c.fillStyle = skin.head!; c.fillRect(0, 0, W, headH); c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(0, headH - 1.5 * S, W, 1.5 * S);
      const ay = headH * 0.55, ar = 30 * S;
      c.fillStyle = skin.bubB!; c.beginPath(); c.arc(x0 + pad + ar, ay, ar, 0, Math.PI * 2); c.fill();
      text(c, B, name.trim().charAt(0).toUpperCase(), x0 + pad + ar, ay + 11 * S, Math.round(30 * S), skin.bubBInk!);
      text(c, B, name, x0 + pad + ar * 2 + 16 * S, ay - 2 * S, Math.round(26 * S), skin.ink, 'left');
      text(c, B, (next && next.at - t < 0.75) ? 'đang soạn tin…' : 'đang hoạt động', x0 + pad + ar * 2 + 16 * S, ay + 26 * S, Math.round(17 * S), skin.good, 'left');
      // lesson card
      for (const cd of cards) {
        const p = seg(t, cd.at, cd.at + 0.35);
        if (p <= 0 || t > cd.until) continue;
        c.fillStyle = `rgba(10,8,20,${0.66 * eOut(p)})`; c.fillRect(0, 0, W, H);
        c.save(); c.translate(W / 2, H * 0.48 + (1 - eOut(p)) * 60 * S);
        const cw = Math.min(W - 60 * S, 520 * S), sz = fit(c, B, cd.text, Math.round(36 * S), 22 * S, cw - 70 * S, 5), rows = wrapVi(c, cd.text, sz, cw - 70 * S, B.font);
        const ch = rows.length * sz * 1.28 + 120 * S;
        c.fillStyle = skin.card; rr(c, -cw / 2, -ch / 2, cw, ch, 26 * S); c.fill();
        text(c, B, 'BÀI HỌC', 0, -ch / 2 + 50 * S, Math.round(20 * S), skin.cardInk);
        block(c, B, cd.text, 0, 22 * S, sz, cw - 70 * S, skin.cardInk, 1.28);
        c.restore();
      }
      c.restore();
    },
  };
}

// ------------------------------------------------------------------ 4. story (one street, one character)
const PLACE_DEFAULT = [{ icon: 'home', label: 'Nhà' }, { icon: 'briefcase', label: 'Công ty' }, { icon: 'building-store', label: 'Cửa hàng' }, { icon: 'coffee', label: 'Quán' }, { icon: 'building-bank', label: 'Ngân hàng' }];
function story(B: LookBuild, sc: SceneSpec, T: SceneTiming, si: number): LookScene {
  const { W, H, S, skin, portrait } = B, x = sc.x || {};
  const step = W * 1.05, ground = H * (portrait ? 0.68 : 0.74), charX = W * (portrait ? 0.27 : 0.3);
  const places = B.project.scenes.map((s, i) => s.x?.place || PLACE_DEFAULT[i % PLACE_DEFAULT.length]);
  const walk = 0.9, s0 = T.lines[0].start;
  if (x.say) B.cues.push({ t: s0 + 0.25, k: 'pop' });
  const camAt = (t: number) => (si === 0 ? 0 : (si - 1) * step + step * eIO(seg(t, T.start, T.start + walk)));
  const icons = (x.icons || []).slice(0, 2);
  icons.forEach((_, i) => B.cues.push({ t: (T.lines[i] || T.lines[0]).start + 0.3, k: 'pop' }));
  const building = (c: Ctx, wx: number, pi: number) => {
    const bw = W * (portrait ? 0.5 : 0.3), bh = H * (portrait ? 0.3 : 0.42), bx = wx - bw / 2, by = ground - bh, lw = 5 * S;
    c.fillStyle = skin.colors[pi % skin.colors.length]; c.strokeStyle = skin.ink; c.lineWidth = lw; c.lineJoin = 'round';
    c.fillRect(bx, by, bw, bh); c.strokeRect(bx, by, bw, bh);
    c.beginPath(); c.moveTo(bx - 14 * S, by); c.lineTo(wx, by - bh * 0.32); c.lineTo(bx + bw + 14 * S, by); c.closePath(); c.fill(); c.stroke();
    c.strokeRect(wx - bw * 0.13, ground - bh * 0.42, bw * 0.26, bh * 0.42);
    c.strokeRect(bx + bw * 0.1, by + bh * 0.18, bw * 0.2, bh * 0.2); c.strokeRect(bx + bw * 0.7, by + bh * 0.18, bw * 0.2, bh * 0.2);
    // sign with icon and name
    const sw = bw * 0.86, sh = 54 * S, sy = by - bh * 0.32 - sh - 12 * S;
    c.fillStyle = skin.card; rr(c, wx - sw / 2, sy, sw, sh, 12 * S); c.fill(); c.stroke();
    const pl = places[pi];
    drawIcon(c, iconPaths(pl.icon, B.icons), wx - sw / 2 + 32 * S, sy + sh / 2, 34 * S, skin.cardInk, 2.2);
    text(c, B, pl.label.toUpperCase().slice(0, 14), wx + 16 * S, sy + sh / 2 + 9 * S, Math.round(24 * S), skin.cardInk);
  };
  return {
    captions: true,
    draw(c, t, alpha) {
      c.save(); c.globalAlpha = alpha;
      grad(c, W, H, skin.bg[0]);
      const cam = camAt(t);
      // far clouds (parallax)
      c.strokeStyle = skin.sub; c.lineWidth = 3 * S; c.globalAlpha = alpha * 0.5;
      for (let i = -1; i < 4; i++) { const cx = ((i * 260 * S - cam * 0.3) % (W + 300 * S) + W + 300 * S) % (W + 300 * S) - 150 * S, cy = H * 0.14 + (i % 2) * 40 * S; c.beginPath(); c.arc(cx, cy, 26 * S, Math.PI, 0); c.arc(cx + 40 * S, cy, 34 * S, Math.PI, 0); c.arc(cx + 80 * S, cy, 22 * S, Math.PI, 0); c.stroke(); }
      c.globalAlpha = alpha;
      c.save(); c.translate(-cam, 0);
      for (let pi = Math.max(0, si - 1); pi <= Math.min(places.length - 1, si + 1); pi++) building(c, pi * step + W * 0.66, pi);
      c.restore();
      c.strokeStyle = skin.ink; c.lineWidth = 5 * S; c.beginPath(); c.moveTo(0, ground); c.lineTo(W, ground); c.stroke();
      // the character walks while the camera moves, then acts
      const moving = si > 0 && t < T.start + walk;
      const act = moving ? 'walk' : (x.action || 'idle');
      stickFigure(c, act, t, charX, ground, (portrait ? 0.95 : 1.05) * S, skin.ink, 7 * S);
      // money flying out of the pocket
      if (x.money && !moving) for (let i = 0; i < 6; i++) {
        const k = ((t - s0) * 0.7 + i / 6) % 1;
        if (t < s0) break;
        c.globalAlpha = alpha * (1 - k);
        drawIcon(c, iconPaths('cash', B.icons), charX + 40 * S + k * 200 * S, ground - 120 * S - k * 220 * S + Math.sin(i * 2 + t * 3) * 14 * S, 40 * S, skin.good, 2);
      }
      c.globalAlpha = alpha;
      // speech bubble
      if (x.say) {
        const p = seg(t, s0 + 0.25, s0 + 0.5);
        if (p > 0) {
          const sz = Math.round(28 * S), maxW = W * 0.62, rows = wrapVi(c, x.say, sz, maxW, B.font);
          c.font = `${sz}px ${B.font}`;
          const bw = Math.max(...rows.map((r) => c.measureText(r).width)) + 44 * S, bh = rows.length * sz * 1.3 + 30 * S;
          const bx = Math.min(W - bw - 20 * S, charX - 30 * S), by = ground - 260 * S * (portrait ? 1 : 0.95) - bh;
          c.save(); c.translate(bx + 30 * S, by + bh); c.scale(eBack(p), eBack(p)); c.translate(-(bx + 30 * S), -(by + bh));
          c.fillStyle = skin.card; c.strokeStyle = skin.ink; c.lineWidth = 4 * S; rr(c, bx, by, bw, bh, 22 * S); c.fill(); c.stroke();
          c.beginPath(); c.moveTo(bx + 30 * S, by + bh); c.lineTo(bx + 22 * S, by + bh + 26 * S); c.lineTo(bx + 56 * S, by + bh); c.closePath(); c.fill(); c.stroke();
          c.fillStyle = skin.card; c.fillRect(bx + 26 * S, by + bh - 4 * S, 28 * S, 6 * S);
          c.fillStyle = skin.cardInk; c.textAlign = 'left'; rows.forEach((r, i) => c.fillText(r, bx + 22 * S, by + 15 * S + sz * 0.98 + i * sz * 1.3));
          c.restore();
        }
      }
      icons.forEach((ic, i) => sticker(c, B, ic, W * (0.62 + i * 0.22), ground - H * (portrait ? 0.44 : 0.55), 38 * S, t, (T.lines[i] || T.lines[0]).start + 0.3, skin.hl, skin.hlInk));
      c.restore();
    },
  };
}

// ------------------------------------------------------------------ 5. data
function data(B: LookBuild, sc: SceneSpec, T: SceneTiming, si: number): LookScene {
  const st = sc.x?.stat;
  if (!st) return kinetic({ ...B }, sc, T, si);
  const { W, H, S, skin, portrait } = B, s0 = T.lines[0].start, sEnd = T.lines[T.lines.length - 1].end;
  const parts = (st.parts || []).slice(0, 5), max = Math.max(1, ...parts.map((p) => p.value));
  const barAt = parts.map((_, i) => s0 + 1.1 + ((sEnd - s0 - 1.2) * i) / Math.max(1, parts.length));
  B.cues.push({ t: s0 + 1.1, k: 'ding' }); barAt.forEach((t) => B.cues.push({ t, k: 'pop' }));
  const unit = st.unit || '';
  return {
    captions: true,
    draw(c, t, alpha) {
      c.save(); c.globalAlpha = alpha;
      grad(c, W, H, skin.bg[0]);
      // faint grid
      c.strokeStyle = 'rgba(127,140,170,.12)'; c.lineWidth = 1.5 * S;
      for (let gx = 0; gx < W; gx += 60 * S) { c.beginPath(); c.moveTo(gx, 0); c.lineTo(gx, H); c.stroke(); }
      for (let gy = 0; gy < H; gy += 60 * S) { c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke(); }
      const topY = H * (parts.length ? (portrait ? 0.2 : 0.22) : 0.38);
      if (st.label) { const p = seg(t, s0, s0 + 0.3); c.globalAlpha = alpha * p; text(c, B, st.label.toUpperCase(), W / 2, topY, Math.round(24 * S), skin.sub); c.globalAlpha = alpha; }
      const k = eOut(seg(t, s0 + 0.05, s0 + 1.1)), pulse = t > s0 + 1.1 ? 1 + Math.sin((t - s0) * 5) * 0.012 : 1;
      const big = fmtNum(st.value * k);
      const sz = Math.round((portrait ? 112 : 96) * S);
      c.save(); c.translate(W / 2, topY + sz * 1.05); c.scale(pulse, pulse);
      c.font = `${sz}px ${B.font}`; const nw = c.measureText(big).width; c.font = `${Math.round(sz * 0.42)}px ${B.font}`; const uw = unit ? c.measureText(' ' + unit).width : 0;
      const scale = Math.min(1, (W * 0.9) / (nw + uw));
      c.scale(scale, scale);
      text(c, B, big, -(nw + uw) / 2, 0, sz, skin.ink, 'left');
      if (unit) text(c, B, ' ' + unit, -(nw + uw) / 2 + nw, 0, Math.round(sz * 0.42), skin.hl, 'left');
      c.restore();
      if (parts.length) {
        const x0 = W * 0.08, bw = W * 0.84, y0 = topY + sz * 1.55, rowH = Math.min(96 * S, (H * (portrait ? 0.72 : 0.86) - y0) / parts.length);
        parts.forEach((p, i) => {
          const q = eOut(seg(t, barAt[i], barAt[i] + 0.7));
          if (t < barAt[i] - 0.05) return;
          const y = y0 + i * rowH, col = skin.colors[i % skin.colors.length], lastHot = i === parts.length - 1 && t > barAt[i] + 0.8;
          text(c, B, p.label, x0, y + 28 * S, Math.round(24 * S), skin.ink, 'left');
          c.fillStyle = 'rgba(127,140,170,.18)'; rr(c, x0, y + 40 * S, bw, 26 * S, 13 * S); c.fill();
          c.fillStyle = col; rr(c, x0, y + 40 * S, Math.max(26 * S, bw * (p.value / max) * q), 26 * S, 13 * S); c.fill();
          if (lastHot) { c.strokeStyle = col; c.lineWidth = 3 * S; c.globalAlpha = alpha * (0.5 + 0.5 * Math.sin(t * 8)); rr(c, x0 - 6 * S, y + 34 * S, bw + 12 * S, 38 * S, 19 * S); c.stroke(); c.globalAlpha = alpha; }
          text(c, B, fmtNum(p.value * q) + (unit && unit.length <= 6 ? ' ' + unit : ''), x0 + bw, y + 28 * S, Math.round(24 * S), col, 'right');
        });
      }
      c.restore();
    },
  };
}

// ------------------------------------------------------------------ 6. quiz
function quiz(B: LookBuild, sc: SceneSpec, T: SceneTiming, si: number): LookScene {
  const { W, H, S, skin, portrait } = B, q = sc.x?.quiz, s0 = T.lines[0].start, speechEnd = T.lines[T.lines.length - 1].end;
  if (!q) return kinetic(B, sc, T, si);
  const reveal = !!q.reveal, opts = q.options.slice(0, 4);
  const optAt = opts.map((_, i) => s0 + 0.35 + i * 0.28);
  const cd0 = speechEnd + 0.1, countdown = !reveal && (sc.pause || 0) >= 1.5;
  if (!reveal) { optAt.forEach((t) => B.cues.push({ t, k: 'pop' })); if (countdown) for (let i = 0; i < 3; i++) B.cues.push({ t: cd0 + i, k: 'tick' }); }
  else B.cues.push({ t: T.start + 0.15, k: 'ding' });
  return {
    captions: reveal,
    draw(c, t, alpha) {
      c.save(); c.globalAlpha = alpha;
      grad(c, W, H, skin.bg[si % skin.bg.length]);
      c.fillStyle = 'rgba(255,255,255,.06)';
      for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(((i * 97 * S) % W), ((i * 173 * S + t * 18 * S) % H), (30 + (i % 3) * 22) * S, 0, Math.PI * 2); c.fill(); }
      // question card
      const p = reveal ? 1 : eBack(seg(t, T.start, T.start + 0.35)), cw = W * (portrait ? 0.86 : 0.6);
      const qs = fit(c, B, q.q, Math.round(36 * S), 22 * S, cw - 60 * S, 4), qrows = wrapVi(c, q.q, qs, cw - 60 * S, B.font), ch = qrows.length * qs * 1.26 + 96 * S;
      const qy = H * (portrait ? 0.1 : 0.08);
      c.save(); c.translate(W / 2, qy + ch / 2); c.scale(p, p);
      c.fillStyle = skin.card; rr(c, -cw / 2, -ch / 2, cw, ch, 24 * S); c.fill();
      c.fillStyle = skin.hl; const bw = 150 * S; rr(c, -bw / 2, -ch / 2 - 18 * S, bw, 40 * S, 20 * S); c.fill();
      text(c, B, reveal ? 'ĐÁP ÁN' : 'CÂU HỎI', 0, -ch / 2 + 10 * S, Math.round(19 * S), skin.hlInk);
      block(c, B, q.q, 0, 14 * S, qs, cw - 60 * S, skin.cardInk, 1.26);
      c.restore();
      const oy = qy + ch + 40 * S, oh = (portrait ? 84 : 64) * S, gap = 18 * S;
      opts.forEach((o, i) => {
        const pi = reveal ? 1 : eBack(seg(t, optAt[i], optAt[i] + 0.3));
        if (pi <= 0) return;
        const y = oy + i * (oh + gap), right = i === q.answer;
        c.save(); c.translate(W / 2, y + oh / 2); c.scale(pi, pi);
        const bg = reveal ? (right ? skin.good : 'rgba(255,255,255,.18)') : skin.card, fg = reveal ? '#ffffff' : skin.cardInk;
        if (reveal && right) { const g = 1 + Math.sin((t - T.start) * 6) * 0.015; c.scale(g, g); }
        c.fillStyle = bg; rr(c, -cw / 2, -oh / 2, cw, oh, 18 * S); c.fill();
        const letter = String.fromCharCode(65 + i);
        c.fillStyle = reveal ? 'rgba(255,255,255,.25)' : skin.hl; c.beginPath(); c.arc(-cw / 2 + oh / 2 + 8 * S, 0, oh * 0.32, 0, Math.PI * 2); c.fill();
        text(c, B, letter, -cw / 2 + oh / 2 + 8 * S, 9 * S, Math.round(26 * S), reveal ? '#ffffff' : skin.hlInk);
        const osz = fit(c, B, o, Math.round(28 * S), 18 * S, cw - oh * 1.6, 2);
        block(c, B, o, -cw / 2 + oh + 16 * S, 0, osz, cw - oh * 1.6, fg, 1.15, 'left', 2);
        if (reveal && right) drawIcon(c, iconPaths('check', B.icons), cw / 2 - 40 * S, 0, 40 * S, '#ffffff', 3);
        c.restore();
      });
      if (countdown && t >= cd0 - 0.05 && t < cd0 + 3) {
        const k = (t - cd0) % 1, n = 3 - Math.floor(t - cd0), cy = Math.min(H * 0.86, oy + opts.length * (oh + gap) + 80 * S), r = 52 * S;
        c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 10 * S; c.beginPath(); c.arc(W / 2, cy, r, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = skin.hl; c.beginPath(); c.arc(W / 2, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k)); c.stroke();
        c.save(); c.translate(W / 2, cy); const z = 1 + 0.25 * (1 - eOut(clamp(k * 4))); c.scale(z, z); text(c, B, String(Math.max(1, n)), 0, 16 * S, Math.round(48 * S), '#ffffff'); c.restore();
      }
      if (!reveal && !countdown && t > speechEnd) text(c, B, 'Bình luận đáp án của bạn', W / 2, H * 0.9, Math.round(24 * S), skin.hl);
      c.restore();
    },
  };
}

// ------------------------------------------------------------------ 7. documentary
function doc(B: LookBuild, sc: SceneSpec, T: SceneTiming, si: number): LookScene {
  const { W, H, S, skin } = B, photo = B.photos[si];
  const dir = si % 4, first = si === 0 && !B.project.intro?.title;
  return {
    captions: true,
    draw(c, t, alpha) {
      c.save(); c.globalAlpha = alpha;
      c.fillStyle = skin.bg[0][0]; c.fillRect(0, 0, W, H);
      const k = seg(t, T.start, T.end + 0.7), z = 1.04 + 0.12 * k;
      const px = (dir === 0 ? -1 : dir === 1 ? 1 : 0) * 0.05 * W * (k - 0.5), py = (dir === 2 ? -1 : dir === 3 ? 1 : 0) * 0.04 * H * (k - 0.5);
      if (photo) {
        const s = Math.max(W / photo.width, H / photo.height) * z, dw = photo.width * s, dh = photo.height * s;
        c.drawImage(photo, (W - dw) / 2 + px, (H - dh) / 2 + py, dw, dh);
      } else { grad(c, W, H, ['#1c2430', '#3b4a5e']); }
      if (skin.grade) { c.fillStyle = skin.grade; c.fillRect(0, 0, W, H); }
      const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
      // film grain: same pattern for the same frame (24 per second)
      const f = Math.floor(t * 24);
      for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(255,255,255,${hash(f * 131 + i) * 0.07})`; c.fillRect(hash(f * 7 + i * 3) * W, hash(f * 13 + i * 5) * H, 2 * S, 2 * S); }
      if (first) {
        const p = seg(t, T.start + 0.2, T.start + 0.9) * (1 - seg(t, T.start + 3.2, T.start + 3.9));
        if (p > 0) { c.globalAlpha = alpha * p; block(c, B, B.project.title, W / 2, H * 0.32, fit(c, B, B.project.title, Math.round(52 * S), 26 * S, W * 0.8, 3), W * 0.8, '#ffffff', 1.18); c.globalAlpha = alpha; }
      }
      c.restore();
    },
  };
}

function placeholderPhoto(env: Env, dpr: number, W: number, H: number) {
  const cv = env.createCanvas(Math.round(W * 1.2 * dpr), Math.round(H * 1.2 * dpr)), c = cv.getContext('2d'), w = cv.width, h = cv.height;
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b1636'); g.addColorStop(0.62, '#2a2160'); g.addColorStop(1, '#f2873a');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 14; i++) { const bw = w / 12, bh = h * (0.18 + hash(i) * 0.25); c.fillStyle = '#0a0f22'; c.fillRect(i * bw * 0.95 - bw * 0.2, h - bh, bw * 0.85, bh); }
  c.fillStyle = 'rgba(255,255,255,.75)'; c.font = `${Math.round(22 * dpr)}px sans-serif`; c.textAlign = 'center'; c.fillText('Ảnh AI của cảnh sẽ hiện ở đây', w / 2, h * 0.3);
  return cv;
}

/** Pictures for the documentary: grey when the colour set asks for it. */
export function preparePhoto(env: Env, img: Img | null, mono: boolean, dpr: number, W: number, H: number) {
  // not drawn yet (editor preview): a quiet placeholder scene
  if (!img || img.width < 16) return placeholderPhoto(env, dpr, W, H);
  const s = Math.max(W / img.width, H / img.height) * 1.2 * dpr;
  const cv = env.createCanvas(Math.max(2, Math.round(img.width * s)), Math.max(2, Math.round(img.height * s))), c = cv.getContext('2d');
  c.drawImage(img, 0, 0, cv.width, cv.height);
  if (mono) {
    const d = c.getImageData(0, 0, cv.width, cv.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) { const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; px[i] = px[i + 1] = px[i + 2] = l; }
    c.putImageData(d, 0, 0);
  }
  return cv;
}

export interface LookModel { look: string; skin: Skin; scenes: LookScene[]; cues: Cue[]; build: LookBuild; continuous: boolean }

export function buildLook(opts: { c: Ctx; env: Env; project: ProjectSpec; timeline: Timeline; W: number; H: number; icons: IconSet; font: string; hand: string; photos: (any | null)[] }): LookModel {
  const look = opts.project.look || 'kinetic', skin = skinOf(look, opts.project.skin);
  const B: LookBuild = { ...opts, skin, S: Math.min(opts.W, opts.H) / 540, portrait: opts.H > opts.W, cues: [] };
  const per = { kinetic, split, story, data, quiz, doc } as Record<string, (B: LookBuild, sc: SceneSpec, T: SceneTiming, si: number) => LookScene>;
  let scenes: LookScene[];
  if (look === 'chat') { const one = chat(B, chatThread(B)); scenes = opts.project.scenes.map(() => one); }
  else scenes = opts.project.scenes.map((sc, si) => (per[look] || kinetic)(B, sc, opts.timeline.scenes[si], si));
  const continuous = look === 'chat';
  if (!continuous) opts.timeline.scenes.forEach((s, si) => { if (si > 0) B.cues.push({ t: s.start, k: 'whoosh' }); });
  B.cues.sort((a, b) => a.t - b.t);
  return { look, skin, scenes, cues: B.cues, build: B, continuous };
}

/** One frame of a format video (background, scene, transition, captions, progress). */
export function renderLook(c: Ctx, L: LookModel, t: number, sceneSpecs: SceneSpec[]) {
  const B = L.build, T = B.timeline.scenes;
  let si = T.findIndex((s) => t < s.end);
  if (si < 0) si = T.length - 1;
  const S = T[si];
  if (L.continuous || si === 0) L.scenes[si].draw(c, t, 1);
  else {
    const dur = L.look === 'doc' ? 0.7 : 0.24, u = seg(t, S.start, S.start + dur);
    if (u < 1) L.scenes[si - 1].draw(c, t, 1);
    c.save();
    if (L.look !== 'doc') { const z = 1 + 0.08 * (1 - eOut(u)); c.translate(B.W / 2, B.H / 2); c.scale(z, z); c.translate(-B.W / 2, -B.H / 2); }
    L.scenes[si].draw(c, t, L.look === 'doc' ? eIO(u) : clamp(u * 2.5));
    c.restore();
    // a white flash on the cut
    if (L.look !== 'doc' && u < 1) { c.fillStyle = `rgba(255,255,255,${0.35 * (1 - u)})`; c.fillRect(0, 0, B.W, B.H); }
  }
  if (L.scenes[si].captions && B.project.subtitles !== false) drawCaption(c, B, sceneSpecs[si], S, t, B.H * (B.portrait ? (L.look === 'doc' ? 0.82 : 0.885) : 0.86), L.look === 'doc' ? 'doc' : 'box');
  drawProgress(c, B, t);
}
