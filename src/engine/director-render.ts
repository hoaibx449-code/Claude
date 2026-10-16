import type { Direction, DirectorNode } from './director.ts';
import { cleanDirection, fallbackDirection } from './director.ts';
import type { LookBuild, LookScene } from './looks.ts';
import type { SceneSpec, SceneTiming, Ctx } from './types.ts';
import { wrapVi } from './textwrap.ts';

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => 1 - (1 - clamp(x)) ** 3;
function box(c: Ctx, x: number, y: number, w: number, h: number, r = 8) { c.beginPath(); c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); }
/** Fit every glyph before drawing: prefer one line, never rely on clipped text. */
function label(c: Ctx, font: string, value: string, x: number, y: number, w: number, h: number, max: number, color: string) {
  let size = max, rows: string[] = [];
  while (size >= 10) {
    rows = wrapVi(c, value, size, w, font);
    c.font = `600 ${size}px ${font}`;
    if (rows.length * size * 1.45 <= h && rows.every((s) => c.measureText(s).width <= w)) break;
    size--;
  }
  c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
  rows.forEach((r, i) => c.fillText(r, x, y + (i - (rows.length - 1) / 2) * size * 1.45));
}

export function directorScene(B: LookBuild, sc: SceneSpec, T: SceneTiming, si: number,
  drawIcon: (c: Ctx, name: string, x: number, y: number, size: number, color: string) => void): LookScene {
  const { W, H, S } = B;
  const d: Direction = cleanDirection(sc.direction, sc.lines) || fallbackDirection(sc.lines);
  const dark = B.project.skin === 'dem', bg = dark ? '#171914' : '#f3f0e2', ink = dark ? '#f3f0e2' : '#20231e', muted = dark ? '#b6b7a9' : '#61675b', yellow = '#f4d539';
  const left = W * 0.06, top = H * 0.25, width = W * 0.88, height = H * (B.portrait ? 0.48 : 0.46);
  const start = (n: DirectorNode) => { const l = T.lines[n.line] || T.lines[0]; return l.start + (l.end - l.start) * n.delay; };
  const coords = (n: DirectorNode) => ({ x: left + width * n.x / 100, y: top + height * n.y / 100, w: width * n.w / 100, h: height * n.h / 100 });
  d.nodes.forEach((n) => B.cues.push({ t: start(n), k: n.accent ? 'ding' : 'pop' }));
  return { captions: true, draw(c, t, alpha) {
    c.save(); c.globalAlpha = alpha;
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.fillStyle = dark ? '#ffffff07' : '#20231e08';
    for (let x = left; x < W - left; x += 12 * S) for (let y = H * 0.22; y < H * 0.77; y += 12 * S) c.fillRect(x, y, S, S);
    label(c, B.font, B.project.channel || 'NÉT VẼ', W * 0.24, H * 0.065, W * 0.36, H * 0.035, 14 * S, muted);
    label(c, B.font, String(si + 1).padStart(2, '0'), W * 0.9, H * 0.065, W * 0.08, H * 0.035, 14 * S, muted);
    label(c, B.font, d.title, W / 2, H * 0.16, width, H * 0.12, (B.portrait ? 29 : 25) * S, ink);
    c.strokeStyle = muted; c.lineWidth = S; c.beginPath(); c.moveTo(left, H * 0.235); c.lineTo(W - left, H * 0.235); c.stroke();
    // Edges meet the boundary of each object rather than crossing its label.
    for (const link of d.links) {
      const a = d.nodes.find((n) => n.id === link.from)!, b = d.nodes.find((n) => n.id === link.to)!;
      const at = Math.max(start(a), start(b), (T.lines[link.line] || T.lines[0]).start), p = ease((t - at) / 0.5);
      if (p <= 0) continue;
      const A = coords(a), Z = coords(b), dx = Z.x - A.x, dy = Z.y - A.y;
      const boundary = (n: typeof A) => 1 / Math.max(Math.abs(dx) / (n.w / 2 + 6 * S), Math.abs(dy) / (n.h / 2 + 6 * S), 0.001);
      const ra = Math.min(0.48, boundary(A)), rb = Math.min(0.48, boundary(Z));
      const x0 = A.x + dx * ra, y0 = A.y + dy * ra, x1 = x0 + (dx * (1 - rb - ra)) * p, y1 = y0 + (dy * (1 - rb - ra)) * p;
      c.strokeStyle = dark ? yellow : ink; c.lineWidth = 2 * S; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      const angle = Math.atan2(dy, dx); c.beginPath(); c.moveTo(x1 - 8 * S * Math.cos(angle - 0.5), y1 - 8 * S * Math.sin(angle - 0.5)); c.lineTo(x1, y1); c.lineTo(x1 - 8 * S * Math.cos(angle + 0.5), y1 - 8 * S * Math.sin(angle + 0.5)); c.stroke();
    }
    for (const n of d.nodes) {
      const p = ease((t - start(n)) / 0.45); if (p <= 0) continue;
      const q = coords(n); c.save(); c.globalAlpha = alpha * p;
      c.translate(q.x + (n.enter === 'slide' ? (1 - p) * 26 * S : 0), q.y + (n.enter === 'rise' ? (1 - p) * 22 * S : 0));
      const scale = n.enter === 'scale' ? 0.82 + 0.18 * p : 1; c.scale(scale, scale);
      const color = n.accent ? '#20231e' : ink;
      if (n.shape !== 'text') {
        c.fillStyle = n.accent ? yellow : dark ? '#25291f' : '#fffef7'; c.strokeStyle = n.accent ? yellow : muted; c.lineWidth = S;
        if (n.shape === 'circle') { c.beginPath(); c.ellipse(0, 0, q.w / 2, q.h / 2, 0, 0, Math.PI * 2); } else box(c, -q.w / 2, -q.h / 2, q.w, q.h, 3 * S);
        c.fill(); c.stroke();
      }
      const inset = n.shape === 'circle' ? 0.6 : 0.84;
      if (n.icon) drawIcon(c, n.icon, 0, -q.h * 0.19, Math.min(q.h * 0.32, q.w * 0.3), color);
      label(c, B.font, n.label, 0, n.icon ? q.h * 0.2 : 0, q.w * inset, q.h * (n.icon ? 0.36 : 0.78), 24 * S, color);
      c.restore();
    }
    c.restore();
  } };
}
