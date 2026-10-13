import type { Ctx, Env, HandMeta, Img, Mode, ProjectSpec, Ratio, SceneTiming, Timeline, ToolKind } from './types.ts';
import { STYLES, type Style } from './styles.ts';
import { drawTool } from './tools.ts';
import { buildDiagram, drawElement, elementCentre, elementPen, type Element, type Pen } from './diagram.ts';
import { buildSketch, resolveIcon, type IconSet } from './sketch.ts';
import { buildKinetic } from './kinetic.ts';
import { flatten } from './svgpath.ts';
import { qrCells } from './qr.ts';
import { wrapVi } from './textwrap.ts';
import { buildLook, preparePhoto, renderLook, skinOf, type LookModel } from './looks.ts';

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
  /** What gets drawn in each scene, in order, with its time window. */
  units: Unit[][];
  mode: Mode;
  icons: IconSet;
  /** video format (new videos); when set, the frame is drawn by looks.ts */
  look?: LookModel;
}

/** Family of the modern sans (Be Vietnam Pro ExtraBold, registered under this name). */
export const SANS = 'NVSans';

/** `t` is the frame time: animated parts (stick figures) keep moving after they are drawn. */
export interface Unit { start: number; end: number; draw(c: Ctx, p: number, alpha: number, t: number): void; pen(p: number): [number, number] }

/** Area a diagram may use (above the subtitles when they are shown on the picture). */
export function diagramBox(ratio: Ratio, subtitles = false): Box {
  if (ratio === '9:16') return subtitles ? { x: 40, y: 112, w: 460, h: 540 } : { x: 40, y: 112, w: 460, h: 640 };
  return subtitles ? { x: 70, y: 72, w: 820, h: 350 } : { x: 70, y: 76, w: 820, h: 400 };
}

/** Area a free composition (sketch) may use. */
export function stageBox(ratio: Ratio, subtitles = false): Box {
  if (ratio === '9:16') return subtitles ? { x: 26, y: 96, w: 488, h: 580 } : { x: 26, y: 96, w: 488, h: 820 };
  return subtitles ? { x: 40, y: 64, w: 880, h: 370 } : { x: 40, y: 64, w: 880, h: 452 };
}

export function prepare(opts: {
  env: Env; project: ProjectSpec; timeline: Timeline; images: Img[][]; hand: HandAsset; dpr: number; icons?: IconSet;
  /** loaded pictures for image items, by ProjectSpec.media key */
  media?: Record<string, Img>;
}): Model {
  const { env, project, timeline, images, hand, dpr } = opts;
  if (project.look) return prepareLook(opts);
  const mode: Mode = (['motion', 'math', 'kinetic'] as const).includes(project.mode as any) ? project.mode! : 'hand';
  const subs = !!project.subtitles;
  const style = STYLES[project.style] ?? STYLES.notebook;
  const { W, H } = logicalSize(project.ratio);
  const bgc = env.createCanvas(W * dpr, H * dpr), b = bgc.getContext('2d');
  b.setTransform(dpr, 0, 0, dpr, 0, 0); style.bg(b, W, H);
  const panels = project.scenes.map((sc, si) => {
    if (sc.diagram) return [];
    const boxes = panelBoxes(project.ratio, sc.panels.length);
    return sc.panels.map((_, k) => {
      const box = boxes[k];
      return { canvas: inkify(env, images[si][k], Math.round(box.w * dpr), Math.round(box.h * dpr), style.ink), box, zig: zigzag(box.w, box.h, si * 3 + k) };
    });
  });
  const m: Model = { project, timeline, style, tool: project.tool ?? style.tool, W, H, dpr, background: bgc, panels, mask: new Map(), hand, env, units: [], mode, icons: opts.icons || {} };
  const measure = env.createCanvas(4, 4).getContext('2d');
  const colors = { ink: style.ink, accent: style.episode, accent2: style.accent2, good: style.good, fills: style.fills,
    font: mode === 'hand' ? 'Pangolin' : SANS, flat: mode === 'motion', images: opts.media || {}, qr: qrCells,
    character: project.character ? opts.media?.[project.character] || undefined : undefined };
  // maths animation: crisp single strokes with a faint glow, no paper texture passes
  const pen: Pen = mode === 'math' ? { passes: [[0, 0, 0.22, 2.6], [0, 0, 1, 0.85]], width: style.width } : { passes: style.passes, brush: style.brush, width: style.width };
  m.units = project.scenes.map((sc, si) => {
    const T = timeline.scenes[si];
    if (mode === 'kinetic') {
      const keys = (sc.diagram?.items || []).filter((it: any) => it.t === 'text').map((it: any) => String(it.text));
      if (sc.diagram?.title) keys.push(sc.diagram.title);
      const box = project.ratio === '9:16' ? { x: 50, y: 170, w: 440, h: 620 } : { x: 90, y: 80, w: 780, h: 390 };
      const ic = (sc.diagram?.items || []).find((it: any) => it.t === 'icon'), name = ic ? resolveIcon(ic.name, m.icons) : null;
      const deco = name ? m.icons[name].split('|').flatMap((d) => flatten(d)) : undefined;
      return [buildKinetic(measure, sc, T, box, colors, keys, deco)];
    }
    if (!sc.diagram) {
      return sc.panels.map((_, k) => ({ start: T.panels[k].start, end: T.panels[k].end,
        draw: (c: Ctx, p: number, a: number) => drawPanel(c, m, si, k, p, a), pen: (p: number) => penAt(m, si, k, p) }));
    }
    // diagram: spread its strokes over the time the scene is spoken
    let items = sc.diagram.items || [];
    // the reference character appears in every board, beside the drawing when it has no person
    if (colors.character && sc.diagram.kind === 'sketch' && !items.some((it: any) => it.t === 'person' || it.t === 'image')) {
      items = [...items, { t: 'image', src: project.character, x: si % 2 ? 16 : 84, y: 86, w: project.ratio === '9:16' ? 26 : 16, shape: 'circle', line: 0 }];
    }
    const els = sc.diagram.kind === 'sketch'
      ? buildSketch(measure, items, stageBox(project.ratio, subs), colors, opts.icons || {}, project.ratio === '9:16')
      : buildDiagram(measure, sc.diagram, diagramBox(project.ratio, subs), colors);
    if (mode === 'motion') {
      // motion graphics: each thing springs into place quickly, then keeps floating gently
      return schedule(els, sc.lines, T, sc.diagram.kind === 'sketch', (e, start, end) => {
        const stop = start + Math.min(end - start, e.kind === 'path' ? 0.7 : 0.5), ctr = elementCentre(e), ph = ctr[0] * 0.013 + ctr[1] * 0.007;
        return { start, end: stop, draw: (c: Ctx, p: number, a: number, now: number) => drawPop(c, e, p, a, pen, now - stop, ctr, ph), pen: (p: number) => elementPen(e, p) };
      });
    }
    return schedule(els, sc.lines, T, sc.diagram.kind === 'sketch', (e, start, end) => ({
      start, end, draw: (c: Ctx, p: number, a: number, now: number) => drawElement(c, e, p, a, pen, now - end), pen: (p: number) => elementPen(e, p),
    }));
  });
  return m;
}

function prepareLook(opts: Parameters<typeof prepare>[0]): Model {
  const { env, project, timeline, images, hand, dpr } = opts;
  const { W, H } = logicalSize(project.ratio);
  const skin = skinOf(project.look!, project.skin);
  const photos = project.scenes.map((sc, si) => (project.look === 'doc' && !sc.diagram ? preparePhoto(env, images[si]?.[0] || null, !!skin.mono, dpr, W, H) : null));
  const measure = env.createCanvas(4, 4).getContext('2d');
  const look = buildLook({ c: measure, env, project, timeline, W, H, icons: opts.icons || {}, font: SANS, hand: 'Pangolin', photos });
  const bg = env.createCanvas(4, 4);
  return { project, timeline, style: STYLES.notebook, tool: 'marker', W, H, dpr, background: bg, panels: project.scenes.map(() => []), mask: new Map(), hand, env,
    units: project.scenes.map(() => []), mode: 'kinetic', icons: opts.icons || {}, look };
}

export const TRANSITIONS = ['fade', 'slide', 'wipe', 'zoom'] as const;
/** Transition into scene si: the project's choice, or a varied but fixed sequence ("auto"). */
function transitionOf(p: ProjectSpec, si: number) {
  const t = p.transition || 'auto';
  if (t !== 'auto') return t;
  return (['fade', 'slide', 'wipe', 'fade', 'zoom'] as const)[si % 5];
}

// ---- timing: what is drawn when
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Where `cue` is said inside `line`, as a fraction of the line's duration (syllables before it, with pauses at punctuation). */
export function cueFraction(line: string, cue: string): number | null {
  const words = line.split(/\s+/).filter(Boolean), want = fold(cue).replace(/[^a-z0-9% ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!want.length) return null;
  const plain = words.map((w) => fold(w).replace(/[^a-z0-9%]/g, ''));
  const weight = words.map((w) => 1 + (/[,;:]$/.test(w) ? 1.5 : /[.!?…]$/.test(w) ? 2.5 : 0));
  const total = weight.reduce((a, b) => a + b, 0);
  for (let i = 0; i + want.length <= plain.length; i++) {
    if (want.every((w, k) => plain[i + k] === w || (k === want.length - 1 && plain[i + k].startsWith(w)))) {
      return weight.slice(0, i).reduce((a, b) => a + b, 0) / total;
    }
  }
  return null;
}

/**
 * Turn drawable elements into timed units. Sketch items tied to a line (and optionally to the
 * exact words `cue`) start when those words are spoken; items between two such moments share
 * the time in between, at a natural drawing speed (not slower than ~1.5x, so the hand never crawls).
 */
function schedule(els: Element[], lines: string[], T: SceneTiming, sketch: boolean, mk: (e: Element, start: number, end: number) => Unit): Unit[] {
  const last = T.lines.length - 1;
  const sceneStart = T.lines[0].start + 0.05;
  const sceneEnd = Math.min(T.end - 0.35, Math.max(sceneStart + 1.2, T.lines[last].end - 0.1));
  // group into items (an icon with its label is one gesture)
  const items: { els: Element[]; target?: number }[] = [];
  for (const e of els) {
    const key = e.item;
    const prev = items[items.length - 1];
    if (key != null && prev && prev.els[0].item === key) prev.els.push(e);
    else items.push({ els: [e] });
  }
  for (const it of items) {
    const e = it.els[0];
    let l = e.line != null && e.line >= 0 && e.line <= last ? e.line : -1, f: number | null = null;
    if (e.cue) {
      for (const k of l >= 0 ? [l] : lines.map((_, i) => i)) { const x = cueFraction(lines[k] || '', e.cue); if (x != null) { l = k; f = x; break; } }
    }
    if (l >= 0) it.target = T.lines[l].start + (f ?? 0) * (T.lines[l].end - T.lines[l].start) - (f ? 0.1 : -0.05);
  }
  if (!items.some((it) => it.target != null)) items[0] && (items[0].target = sceneStart);
  // targets never go backwards in drawing order
  let floor = sceneStart;
  for (const it of items) if (it.target != null) { it.target = Math.max(floor, Math.min(it.target, sceneEnd - 0.3)); floor = it.target; }
  const natural = (it: { els: Element[] }) => Math.max(0.3, it.els.reduce((a, e) => a + e.weight, 0) * 0.85);
  const units: Unit[] = [];
  let t = sceneStart;
  for (let i = 0; i < items.length; ) {
    // a run: item i (possibly targeted) up to the next targeted item
    let j = i + 1;
    while (j < items.length && items[j].target == null) j++;
    const t0 = Math.max(t, items[i].target ?? t);
    const t1 = j < items.length ? Math.max(t0 + 0.2, items[j].target! - 0.05) : sceneEnd;
    const run = items.slice(i, j), need = run.reduce((a, it) => a + natural(it), 0);
    const f = Math.min(sketch ? 1.5 : 50, (t1 - t0) / need); // fits before the next cue
    let u = t0;
    for (const it of run) {
      const dur = natural(it) * f, w = it.els.reduce((a, e) => a + e.weight, 0) || 1;
      let v = u;
      for (const e of it.els) {
        const d = (dur * e.weight) / w;
        units.push(mk(e, v, v + Math.max(0.08, d * 0.92)));
        v += d;
      }
      u += dur;
    }
    t = u; i = j;
  }
  return units;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const backOut = (u: number) => 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2;

function drawPop(c: Ctx, e: Element, p: number, a: number, pen: Pen, tau: number, [cx, cy]: [number, number], ph: number) {
  if (p <= 0 || a <= 0) return;
  // lines and arrows draw themselves on; shapes, icons and words pop with a small overshoot
  if (e.kind === 'path') { drawElement(c, e, ease(p), a, pen, tau); return; }
  const k = 0.35 + 0.65 * backOut(p), float = tau > 0 && e.kind !== 'text' ? Math.sin(tau * 1.7 + ph) * 3 : 0;
  c.save();
  c.translate(cx, cy + float + (e.kind === 'text' ? (1 - ease(p)) * 24 : 0)); c.scale(e.kind === 'text' ? 1 : k, e.kind === 'text' ? 1 : k); c.translate(-cx, -cy);
  drawElement(c, e, 1, a * Math.min(1, p * 2.2), pen, tau);
  c.restore();
}
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
export function renderFrame(c: Ctx, m: Model, t: number, opts: { hand?: boolean } = {}) {
  const { W, H, style, project, timeline } = m;
  c.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
  if (m.look) {
    renderLook(c, m.look, t, project.scenes);
    if (timeline.intro && t < timeline.intro + 0.4) drawIntro(c, m, t);
    return;
  }
  c.drawImage(m.background, 0, 0, W, H);
  const portrait = project.ratio === '9:16';
  const top = portrait ? 70 : 46;
  c.font = m.mode === 'hand' ? `${portrait ? 22 : 20}px Pangolin` : `${portrait ? 19 : 17}px ${SANS}`; c.textAlign = 'left'; c.fillStyle = style.channel;
  c.fillText(project.channel, 28, top);
  if (project.episode) { c.textAlign = 'right'; c.fillStyle = style.episode; c.fillText(project.episode, W - 28, top); c.textAlign = 'left'; }

  const scenes = timeline.scenes;
  let si = scenes.findIndex((s) => t < s.end);
  if (si < 0) si = scenes.length - 1;
  const S = scenes[si];

  // change of scene: the previous board leaves (fade · slide · wipe · zoom)
  const units = m.units[si];
  const prog = units.map((u) => clamp((t - u.start) / (u.end - u.start)));
  const TR = 0.5, kind = transitionOf(project, si), u = si > 0 ? clamp((t - S.start) / TR) : 1, e = ease(u);
  if (si > 0 && u < 1) {
    const prev = m.units[si - 1];
    c.save();
    if (kind === 'slide') { c.translate(-W * e, 0); prev.forEach((x) => x.draw(c, 1, 1, t)); }
    else if (kind === 'zoom') { c.translate(W / 2, H / 2); c.scale(1 + 0.25 * e, 1 + 0.25 * e); c.translate(-W / 2, -H / 2); prev.forEach((x) => x.draw(c, 1, 1 - e, t)); }
    else if (kind === 'wipe') {
      prev.forEach((x) => x.draw(c, 1, 1, t));
      // an eraser sweeps the old drawing away from left to right
      c.beginPath(); c.rect(0, 0, W * e, H); c.clip(); c.drawImage(m.background, 0, 0, W, H);
    } else prev.forEach((x) => x.draw(c, 1, 1 - e, t));
    c.restore();
  }
  c.save();
  if (si > 0 && u < 1 && kind === 'slide') c.translate(W * (1 - e), 0);
  if (m.mode === 'motion') {
    // slow camera push-in during the scene
    const z = 1 + 0.035 * ease(clamp((t - S.start) / Math.max(1, S.end - S.start)));
    c.translate(W / 2, H / 2); c.scale(z, z); c.translate(-W / 2, -H / 2);
  }
  units.forEach((x, k) => x.draw(c, prog[k], 1, t));
  c.restore();

  // subtitles on the picture (optional: the board already shows the key words)
  if (project.subtitles) drawSubtitles(c, m, si, t);

  if (opts.hand !== false && m.mode === 'hand') drawHandAt(c, m, t, si, units, prog);
  if (timeline.intro && t < timeline.intro + 0.4) drawIntro(c, m, t);
}

/**
 * Opening title card: complete on the very first frame (platforms use it as the thumbnail),
 * then it bursts away as the first scene starts.
 */
export function drawIntro(c: Ctx, m: Model, t: number) {
  const { W, H, project, timeline } = m, I = project.intro, D = timeline.intro || 0;
  if (!I?.title) return;
  const portrait = project.ratio === '9:16', out = clamp((t - (D - 0.3)) / 0.55);
  if (out >= 1) return;
  c.save();
  c.globalAlpha = 1 - ease(out);
  c.translate(W / 2, H / 2); c.scale(1 + 0.18 * ease(out), 1 + 0.18 * ease(out)); c.translate(-W / 2, -H / 2);
  // vivid background with light rays
  const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#5b21b6'); g.addColorStop(0.5, '#c026d3'); g.addColorStop(1, '#f97316');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.save(); c.translate(W / 2, H * 0.42); c.rotate(t * 0.25);
  c.fillStyle = 'rgba(255,255,255,.07)';
  for (let i = 0; i < 12; i++) { c.rotate(Math.PI / 6); c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.max(W, H), -60); c.lineTo(Math.max(W, H), 60); c.fill(); }
  c.restore();
  const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.35)'); c.fillStyle = v; c.fillRect(0, 0, W, H);

  let y = portrait ? H * 0.17 : H * 0.15;
  // badge
  const badge = (I.badge || '').toUpperCase().slice(0, 18);
  if (badge) {
    c.font = `${portrait ? 26 : 22}px ${SANS}`;
    const bw = c.measureText(badge).width + 40, bh = portrait ? 46 : 40, pulse = 1 + Math.sin(t * 6) * 0.03;
    c.save(); c.translate(W / 2, y); c.scale(pulse, pulse); c.rotate(-0.04);
    c.fillStyle = '#facc15'; rr(c, -bw / 2, -bh / 2, bw, bh, bh / 2); c.fill();
    c.fillStyle = '#1e1b4b'; c.textAlign = 'center'; c.fillText(badge, 0, bh * 0.2);
    c.restore();
    y += portrait ? 60 : 44;
  }
  // vertical budget: badge · icon · title · subtitle, above the call to action
  const ctaY = H - (portrait ? 150 : 76), ss = portrait ? 28 : 22, maxW = W - (portrait ? 56 : 140);
  const subRows = I.sub ? wrapVi(c, I.sub, ss, maxW - 40, SANS).slice(0, 2) : [];
  const subH = subRows.length ? subRows.length * ss * 1.3 + 22 : 0;
  const icon = I.icon ? resolveIcon(I.icon, m.icons) : null;
  const r = portrait ? 62 : 40;
  if (icon) {
    const cy = y + r + 4;
    c.fillStyle = 'rgba(255,255,255,.16)'; c.beginPath(); c.arc(W / 2, cy, r * 1.25, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(W / 2, cy, r, 0, Math.PI * 2); c.fill();
    const k = (r * 1.15) / 24, ox = W / 2 - 12 * k, oy = cy - 12 * k;
    c.strokeStyle = '#7c3aed'; c.lineWidth = 2.1 * k; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const d of m.icons[icon].split('|')) for (const l of flatten(d)) { c.beginPath(); l.forEach(([a, b], i) => (i ? c.lineTo(ox + a * k, oy + b * k) : c.moveTo(ox + a * k, oy + b * k))); c.stroke(); }
    y = cy + r * 1.25 + (portrait ? 18 : 8);
  } else y += portrait ? 30 : 6;
  // title: as big as the space allows, outlined, key word in yellow
  const room = ctaY - (subH ? subH + 18 : 0) - 16 - y;
  let size = portrait ? 80 : 64, rows: string[] = [];
  for (; size > 30; size -= 3) { rows = wrapVi(c, I.title, size, maxW, SANS); if (rows.length <= 4 && rows.length * size * 1.16 <= room) break; }
  const words = I.title.split(/\s+/), key = words.find((w) => /\d/.test(w)) || words.reduce((a, b) => (b.length > a.length ? b : a), '');
  const lh = size * 1.16, ty = y + Math.max(0, (room - rows.length * lh) / 2);
  c.textAlign = 'left'; c.lineJoin = 'round';
  rows.forEach((row, i) => {
    c.font = `${size}px ${SANS}`;
    const rw = c.measureText(row).width;
    let x = (W - rw) / 2;
    const yy = ty + size * 0.92 + i * lh;
    for (const w of row.split(' ')) {
      const ww = c.measureText(w).width;
      c.lineWidth = size * 0.16; c.strokeStyle = '#1e1b4b'; c.strokeText(w, x, yy);
      c.fillStyle = w === key ? '#facc15' : '#ffffff'; c.fillText(w, x, yy);
      x += ww + c.measureText(' ').width;
    }
  });
  if (subRows.length) {
    const sy = ctaY - 18 - subH;
    c.font = `${ss}px ${SANS}`;
    const sw = Math.min(W - 56, Math.max(...subRows.map((r) => c.measureText(r).width)) + 48);
    c.fillStyle = 'rgba(30,27,75,.55)'; rr(c, (W - sw) / 2, sy, sw, subH, 18); c.fill();
    c.fillStyle = '#ffffff'; c.textAlign = 'center';
    subRows.forEach((r, i) => c.fillText(r, W / 2, sy + 11 + ss * 0.95 + i * ss * 1.3));
  }
  // call to action at the bottom
  const cta = 'XEM NGAY', cs = portrait ? 26 : 20;
  c.font = `${cs}px ${SANS}`;
  const tw = c.measureText(cta).width, cw = tw + cs * 3.2, ch = cs * 2, cx0 = (W - cw) / 2;
  c.fillStyle = '#ffffff'; rr(c, cx0, ctaY, cw, ch, ch / 2); c.fill();
  // play triangle
  const px = cx0 + cs * 1.1, py = ctaY + ch / 2;
  c.fillStyle = '#f97316'; c.beginPath(); c.moveTo(px, py - cs * 0.45); c.lineTo(px + cs * 0.75, py); c.lineTo(px, py + cs * 0.45); c.closePath(); c.fill();
  c.fillStyle = '#7c3aed'; c.textAlign = 'left'; c.fillText(cta, px + cs * 1.15, ctaY + ch * 0.68);
  c.textAlign = 'center';
  if (project.channel) { c.font = `${portrait ? 20 : 16}px ${SANS}`; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText(project.channel, W / 2, H - (portrait ? 70 : 18)); }
  c.textAlign = 'left';
  c.restore();
}

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

function drawSubtitles(c: Ctx, m: Model, si: number, t: number) {
  const { W, style, project, timeline } = m, portrait = project.ratio === '9:16', S = timeline.scenes[si];
  const size = portrait ? 29 : 26;
  c.font = `${size}px Pangolin`; c.fillStyle = style.sub;
  let y = portrait ? 700 : 462;
  project.scenes[si].lines.forEach((line, i) => {
    if (t < S.lines[i].start - 0.1) return;
    for (const l of wrapVi(c, line, size, W - 68)) { c.fillText(l, 34, y); y += size * 1.5; }
  });
}

function drawHandAt(c: Ctx, m: Model, t: number, si: number, units: Unit[], prog: number[]) {
  const { W, H, timeline } = m, scenes = timeline.scenes, S = scenes[si];

  // hand
  // the hand rests just beside the last thing it drew, enters from bottom-right and leaves at the end
  const off: [number, number] = [W * 1.1, H * 1.05];
  const restAfter = (s: number): [number, number] => {
    if (!m.units[s].length) return off;
    // between scenes the hand waits at the lower right, out of the way of the drawing
    return [W * 0.97, H * 0.97];
  };
  let pos: [number, number] = off, lift = 0;
  const active = prog.findIndex((p) => p > 0 && p < 1);
  if (active >= 0) pos = units[active].pen(prog[active]);
  else if (units.length) {
    const next = units.findIndex((u) => t < u.start);
    if (next === 0) {
      const from = si === 0 ? off : restAfter(si - 1);
      const u = ease(clamp((t - S.start) / (units[0].start - S.start)));
      pos = lerp(from, units[0].pen(0), u); lift = Math.sin(Math.PI * u);
    } else if (next > 0) {
      const a = units[next - 1], b = units[next], u = clamp((t - a.end) / (b.start - a.end || 1));
      pos = lerp(a.pen(1), b.pen(0), ease(u)); lift = Math.sin(Math.PI * u) * (b.start - a.end > 0.3 ? 1 : 0.3);
    } else {
      const last = units[units.length - 1], u = ease(clamp((t - last.end) / 0.45));
      const to = si === scenes.length - 1 ? off : restAfter(si);
      pos = lerp(last.pen(1), to, u); lift = si === scenes.length - 1 ? u : Math.sin(Math.PI * u) * 0.6;
    }
  }
  drawHand(c, m, pos[0], pos[1], lift, Math.sin(t * 2.1) * 0.025);
}
