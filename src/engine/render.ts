import type { Ctx, Env, HandMeta, Img, ProjectSpec, Ratio, Timeline, ToolKind } from './types.ts';
import { STYLES, type Style } from './styles.ts';
import { drawTool } from './tools.ts';

/** Logical canvas size; the output size is a multiple of it (dpr). */
export function logicalSize(ratio: Ratio) {
  return ratio === '9:16' ? { W: 540, H: 960 } : { W: 960, H: 540 };
}

interface Box { x: number; y: number; w: number; h: number }

export function panelBoxes(ratio: Ratio, n: number): Box[] {
  if (ratio === '9:16') {
    if (n <= 1) return [{ x: 40, y: 120, w: 460, h: 345 }];
    const row = (y: number): Box[] => [{ x: 22, y, w: 244, h: 183 }, { x: 274, y, w: 244, h: 183 }];
    return [...row(128), ...row(326)].slice(0, n);
  }
  if (n <= 1) return [{ x: 250, y: 74, w: 460, h: 345 }];
  return [{ x: 40, y: 80, w: 420, h: 315 }, { x: 500, y: 80, w: 420, h: 315 }].slice(0, n);
}

interface Zig { pts: [number, number][]; cum: number[]; len: number; rh: number }

// Zigzag the pen follows while it "draws" a panel; the stroke so far is the reveal mask.
function zigzag(w: number, h: number, seed: number): Zig {
  const rows = Math.max(4, Math.round(h / 32)), rh = h / rows, pts: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * rh, ltr = r % 2 === 0;
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      pts.push([(ltr ? u : 1 - u) * w, y + Math.sin(u * 9 + r * 2 + seed) * rh * 0.38]);
    }
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1], rh };
}
function along(z: Zig, p: number): [number, number, number] {
  const L = z.len * p;
  let i = 1;
  while (i < z.cum.length - 1 && z.cum[i] < L) i++;
  const a = z.pts[i - 1], b = z.pts[i];
  const u = Math.max(0, Math.min(1, (L - z.cum[i - 1]) / (z.cum[i] - z.cum[i - 1] || 1)));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, i];
}

/** Turns any line art (dark lines on light ground) into ink-coloured lines on transparency. */
export function inkify(env: Env, img: Img, w: number, h: number, ink: string) {
  const cv = env.createCanvas(w, h), c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
  const s = Math.min(w / img.width, h / img.height), dw = img.width * s, dh = img.height * s;
  c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  const d = c.getImageData(0, 0, w, h), px = d.data;
  const r = parseInt(ink.slice(1, 3), 16), g = parseInt(ink.slice(3, 5), 16), b = parseInt(ink.slice(5, 7), 16);
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    // light grey fills stay as a soft tone, near-white disappears
    const a = Math.max(0, Math.min(255, (255 - lum) * 1.25 - 8));
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  }
  c.putImageData(d, 0, 0);
  return cv;
}

export interface HandAsset { img: Img; fingers: Img; meta: HandMeta }

export interface Model {
  project: ProjectSpec;
  timeline: Timeline;
  style: Style;
  tool: ToolKind;
  W: number; H: number; dpr: number;
  background: any;
  panels: { canvas: any; box: Box; zig: Zig }[][];
  mask: Map<string, any>;
  hand: HandAsset;
  env: Env;
}

export function prepare(opts: {
  env: Env; project: ProjectSpec; timeline: Timeline; images: Img[][]; hand: HandAsset; dpr: number;
}): Model {
  const { env, project, timeline, images, hand, dpr } = opts;
  const style = STYLES[project.style] ?? STYLES.notebook;
  const { W, H } = logicalSize(project.ratio);
  const bgc = env.createCanvas(W * dpr, H * dpr), b = bgc.getContext('2d');
  b.setTransform(dpr, 0, 0, dpr, 0, 0); style.bg(b, W, H);
  const panels = project.scenes.map((sc, si) => {
    const boxes = panelBoxes(project.ratio, sc.panels.length);
    return sc.panels.map((_, k) => {
      const box = boxes[k];
      return { canvas: inkify(env, images[si][k], Math.round(box.w * dpr), Math.round(box.h * dpr), style.ink), box, zig: zigzag(box.w, box.h, si * 3 + k) };
    });
  });
  return { project, timeline, style, tool: project.tool ?? style.tool, W, H, dpr, background: bgc, panels, mask: new Map(), hand, env };
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (u: number) => u * u * (3 - 2 * u);
const lerp = (a: number[], b: number[], u: number): [number, number] => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

function drawPanel(c: Ctx, m: Model, si: number, k: number, p: number, alpha: number) {
  if (p <= 0 || alpha <= 0) return;
  const P = m.panels[si][k], { box } = P;
  c.save(); c.globalAlpha = alpha;
  if (p >= 1) { c.drawImage(P.canvas, box.x, box.y, box.w, box.h); c.restore(); return; }
  const key = `${P.canvas.width}x${P.canvas.height}`;
  let mk = m.mask.get(key);
  if (!mk) { mk = m.env.createCanvas(P.canvas.width, P.canvas.height); m.mask.set(key, mk); }
  const x = mk.getContext('2d'), z = P.zig, [tx, ty, n] = along(z, p);
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, mk.width, mk.height);
  x.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
  x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = z.rh * 1.75; x.strokeStyle = '#000';
  x.beginPath(); x.moveTo(z.pts[0][0], z.pts[0][1]);
  for (let i = 1; i < n; i++) x.lineTo(z.pts[i][0], z.pts[i][1]);
  x.lineTo(tx, ty); x.stroke();
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-in'; x.drawImage(P.canvas, 0, 0);
  c.drawImage(mk, box.x, box.y, box.w, box.h);
  c.restore();
}

function penAt(m: Model, si: number, k: number, p: number): [number, number] {
  const P = m.panels[si][k], [x, y] = along(P.zig, p);
  return [P.box.x + x, P.box.y + y];
}

function wrapLines(c: Ctx, text: string, max: number): string[] {
  const words = text.split(' '), out: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (c.measureText(next).width > max && cur) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

export function drawHand(c: Ctx, m: Model, x: number, y: number, lift: number, rot: number) {
  const { img, fingers, meta } = m.hand;
  const k = (m.project.ratio === '9:16' ? 0.33 : 0.37) * (1 + lift * 0.05);
  const px = m.dpr; // shadow offsets are in device pixels
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(k, k); c.translate(-meta.tip[0], -meta.tip[1]);
  c.save();
  c.shadowColor = 'rgba(40,25,10,.14)'; c.shadowBlur = (6 + lift * 8) * px;
  c.shadowOffsetX = (4 + lift * 10) * px; c.shadowOffsetY = (5 + lift * 12) * px;
  c.drawImage(img, 0, 0, meta.width, meta.height);
  c.restore();
  c.save(); c.translate(meta.tip[0], meta.tip[1]); c.rotate(meta.angle); c.scale(meta.penWidth / 23, meta.penWidth / 23);
  drawTool(c, m.tool, m.style.ink.startsWith('#f') || m.style.ink.startsWith('#e') ? '#1d1d1f' : m.style.ink);
  c.restore();
  c.drawImage(fingers, 0, 0, meta.width, meta.height);
  c.restore();
}

/** Draw the frame at time t (seconds). Pure function of t: browser and server match. */
export function renderFrame(c: Ctx, m: Model, t: number) {
  const { W, H, style, project, timeline } = m;
  c.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
  c.drawImage(m.background, 0, 0, W, H);
  const portrait = project.ratio === '9:16';
  const top = portrait ? 70 : 46;
  c.font = `${portrait ? 22 : 20}px Pangolin`; c.textAlign = 'left'; c.fillStyle = style.channel;
  c.fillText(project.channel, 28, top);
  if (project.episode) { c.textAlign = 'right'; c.fillStyle = style.episode; c.fillText(project.episode, W - 28, top); c.textAlign = 'left'; }

  const scenes = timeline.scenes;
  let si = scenes.findIndex((s) => t < s.end);
  if (si < 0) si = scenes.length - 1;
  const S = scenes[si];

  // previous scene fades out while this one begins
  if (si > 0 && t - S.start < 0.4) {
    const a = 1 - (t - S.start) / 0.4;
    m.panels[si - 1].forEach((_, k) => drawPanel(c, m, si - 1, k, 1, a));
  }
  const prog = S.panels.map((w) => clamp((t - w.start) / (w.end - w.start)));
  prog.forEach((p, k) => drawPanel(c, m, si, k, p, 1));

  // subtitles: each line appears when it is spoken
  const size = portrait ? 29 : 26;
  c.font = `${size}px Pangolin`; c.fillStyle = style.sub;
  let y = portrait ? 700 : 462;
  project.scenes[si].lines.forEach((line, i) => {
    if (t < S.lines[i].start - 0.1) return;
    for (const l of wrapLines(c, line, W - 68)) { c.fillText(l, 34, y); y += size * 1.5; }
  });

  // hand
  // the hand rests just beside the last thing it drew, enters from bottom-right and leaves at the end
  const off: [number, number] = [W * 1.1, H * 1.05];
  const restAfter = (s: number): [number, number] => {
    const [x, y] = penAt(m, s, m.panels[s].length - 1, 1);
    return [x + 18, y + 26];
  };
  let pos: [number, number], lift = 0;
  const active = prog.findIndex((p) => p > 0 && p < 1);
  if (active >= 0) pos = penAt(m, si, active, prog[active]);
  else {
    const next = S.panels.findIndex((w) => t < w.start);
    if (next === 0) {
      const from = si === 0 ? off : restAfter(si - 1);
      const u = ease(clamp((t - S.start) / (S.panels[0].start - S.start)));
      pos = lerp(from, penAt(m, si, 0, 0), u); lift = Math.sin(Math.PI * u);
    } else if (next > 0) {
      const a = S.panels[next - 1], b = S.panels[next], u = clamp((t - a.end) / (b.start - a.end));
      pos = lerp(penAt(m, si, next - 1, 1), penAt(m, si, next, 0), ease(u)); lift = Math.sin(Math.PI * u);
    } else {
      const last = S.panels.length - 1, u = ease(clamp((t - S.panels[last].end) / 0.45));
      const to = si === scenes.length - 1 ? off : restAfter(si);
      pos = lerp(penAt(m, si, last, 1), to, u); lift = si === scenes.length - 1 ? u : Math.sin(Math.PI * u) * 0.6;
    }
  }
  drawHand(c, m, pos[0], pos[1], lift, Math.sin(t * 2.1) * 0.025);
}
