// Drawing quality gates (run in CI): a change that makes the hand jump, the nib leave the line,
// pictures fall back to the sweep, or rendering slow down fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { prepare, renderFrame, SANS, inkify } from '../src/engine/render.ts';
import { buildTimeline, estimateVoice } from '../src/engine/timeline.ts';
import { extractStrokes, pace, penState, pathStroke, thin, trace } from '../src/engine/strokes.ts';

const R = new URL('..', import.meta.url).pathname;
GlobalFonts.registerFromPath(R + 'assets/fonts/Pangolin-Regular.ttf', 'Pangolin');
GlobalFonts.registerFromPath(R + 'assets/fonts/BeVietnamPro-ExtraBold.ttf', SANS);
const env = { createCanvas: (w: number, h: number) => createCanvas(w, h) as any };
const hand = async () => { const d = R + 'assets/hands/default/'; return { img: await loadImage(d + 'hand.webp'), fingers: await loadImage(d + 'fingers.webp'), meta: JSON.parse(readFileSync(d + 'hand.json', 'utf8')) }; };
const p95 = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.95)] || 0;
const DOODLES = readdirSync(R + 'assets/doodles').filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4));

test('every bundled picture is drawn stroke by stroke (no fall back to the sweep)', async () => {
  let fallback = 0;
  for (const name of DOODLES) {
    const img = await loadImage(R + `assets/doodles/${name}.svg`);
    const ink = inkify(env, img, 400, 300, '#222222');
    const px = (ink as any).getContext('2d').getImageData(0, 0, 400, 300).data;
    const plan = extractStrokes(px, 400, 300, 1);
    if (!plan) { fallback++; continue; }
    const fit = pace(plan, 4);
    assert.ok(fit.plan.strokes.length >= 3, `${name}: main strokes kept`);
  }
  assert.equal(fallback, 0, `${fallback} of ${DOODLES.length} pictures fell back to the sweep`);
});

test('the hand moves smoothly and the nib stays on the line (classic board, 30 fps)', async () => {
  const lines = [['Bạn có biết vì sao đọc sách mỗi ngày lại thay đổi cuộc đời?'], ['Mỗi sáng một tách cà phê, mười lăm phút đọc, không cần nhiều hơn.'], ['Một năm sau, kiến thức ấy lớn dần như một cái cây.']];
  const names = ['ReadingDoodle', 'CoffeeDoodle', 'PlantDoodle'];
  const spec: any = { title: 't', channel: 'c', ratio: '9:16', style: 'notebook', mode: 'hand', subtitles: false, scenes: lines.map((l, i) => ({ lines: l, panels: [{ image: names[i], line: 0 }] })) };
  const images = await Promise.all(names.map(async (n) => [await loadImage(R + `assets/doodles/${n}.svg`)]));
  const timeline = buildTimeline(spec.scenes, spec.scenes.map((s: any) => estimateVoice(s.lines)), {});
  const m = prepare({ env, project: spec, timeline, images, hand: await hand(), dpr: 1, icons: {} });
  const units = m.units.flat(), jumps: number[] = [];
  let prev: number[] | null = null;
  const c = createCanvas(540, 960).getContext('2d');
  const t0 = performance.now();
  for (let t = 0; t < timeline.duration; t += 1 / 30) {
    renderFrame(c, m, t);
    const u = units.find((x) => t >= x.start && t < x.end);
    if (!u) { prev = null; continue; }
    const q = u.pen((t - u.start) / (u.end - u.start)) as number[];
    if (prev && !(q[2] > 0)) jumps.push(Math.hypot(q[0] - prev[0], q[1] - prev[1]));
    prev = q;
  }
  const perSecond = (performance.now() - t0) / 1000 / timeline.duration;
  assert.ok(p95(jumps) <= 45, `pen step p95 ${p95(jumps).toFixed(1)} px/frame (max 45)`);
  assert.ok(Math.max(...jumps) <= 130, `largest pen step ${Math.max(...jumps).toFixed(1)} px/frame`);
  assert.ok(perSecond <= 1.5, `render ${perSecond.toFixed(2)} s per video second (max 1.5)`);
  // nib on the line: the pen point is the end of the partly drawn stroke
  for (const P of m.panels.flat()) {
    const plan = (P as any).plan; if (!plan) continue;
    for (let q = 0.03; q < 1; q += 0.09) {
      const st = penState(plan, q);
      if (st.along <= 0 || st.done >= plan.strokes.length) continue;
      let last: number[] = [];
      pathStroke({ moveTo: (x: number, y: number) => { last = [x, y]; }, lineTo: (x: number, y: number) => { last = [x, y]; } }, plan, st.done, st.along);
      assert.ok(Math.hypot(last[0] - st.x, last[1] - st.y) < 0.05, 'nib on the stroke');
    }
  }
});

test('an X is drawn as two straight strokes through the crossing', () => {
  const w = 60, h = 60, b = new Uint8Array(w * h);
  for (let i = 8; i < 52; i++) for (let k = -1; k <= 1; k++) { b[i * w + i + k] = 1; b[i * w + (59 - i) + k] = 1; }
  thin(b, w, h);
  const lines = trace(b, w, h).filter((l) => l.length > 6);
  assert.equal(lines.length, 2, 'two strokes');
  for (const l of lines) {
    const [a, z] = [l[0], l[l.length - 1]];
    assert.ok(Math.hypot(z[0] - a[0], z[1] - a[1]) > 50, 'each crosses the whole X');
  }
});
