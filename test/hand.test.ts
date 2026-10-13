import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCanvas, loadImage, Path2D } from '@napi-rs/canvas';
import { prepare, logicalSize } from '../src/engine/render.ts';
import { buildTimeline, estimateVoice } from '../src/engine/timeline.ts';
import { handAt, planHand, poseAt, WAYS, type HandPlan } from '../src/engine/handpose.ts';
import { loadPoses, ROOT } from '../src/node/pipeline.ts';
import { setPeeps } from '../src/engine/act/peeps.ts';

const env = { createCanvas: (w: number, h: number) => createCanvas(w, h) as any };
const poses = (await loadPoses(ROOT + '/assets/hands/poses'))!;

async function model(file: string, ratio?: '9:16' | '16:9') {
  const spec = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
  if (ratio) spec.ratio = ratio;
  const hd = ROOT + '/assets/hands/default';
  const hand = { img: await loadImage(hd + '/hand.webp'), fingers: await loadImage(hd + '/fingers.webp'), meta: JSON.parse(readFileSync(hd + '/hand.json', 'utf8')), poses };
  const timeline = buildTimeline(spec.scenes, spec.scenes.map((s: any) => estimateVoice(s.lines)), {});
  const icons = JSON.parse(readFileSync(ROOT + '/assets/icons/tabler.json', 'utf8'));
  return prepare({ env, project: spec, timeline, images: spec.scenes.map(() => []), hand: hand as any, dpr: 0.5, icons });
}

/** Every frame of the video: where the hand is and what it shows. */
function frames(plan: HandPlan, duration: number) {
  const out: { t: number; h: ReturnType<typeof handAt>; g: ReturnType<typeof poseAt> | null }[] = [];
  for (let t = 0; t <= duration; t += 1 / 30) {
    const h = handAt(plan, t);
    out.push({ t, h, g: h ? poseAt(plan, plan.poses[plan.ways[h.way].id].meta, plan.ways[h.way], h.x, h.y) : null });
  }
  return out;
}
const inFrame = (plan: HandPlan, g: NonNullable<ReturnType<typeof poseAt>>) => g.hull.some(([x, y]) => x > 0 && y > 0 && x < plan.W && y < plan.H);

test('the five ways in come from the photographed poses, each with its anchors', () => {
  assert.deepEqual(WAYS.map((w) => w.key).slice(0, 5), ['A', 'B', 'C', 'D', 'E']);
  for (const p of Object.values(poses)) {
    const m = p.meta;
    for (const pt of [m.tip, m.back, m.grip, m.wrist, m.cut]) assert.ok(pt[0] >= 0 && pt[1] >= 0 && pt[0] <= m.width && pt[1] <= m.height, `${m.id} anchor inside the picture`);
    assert.ok(m.penWidth > 8 && m.penWidth < 80 && m.armHalf > 30 && m.edge.length === 3, `${m.id} pen and forearm measured`);
  }
});

for (const [file, ratio] of [['sketchnote', '9:16'], ['sketchnote', '16:9'], ['charts', '9:16'], ['charts', '16:9']] as const) {
  test(`adaptive hand (${file} ${ratio}): the photo's forearm runs off the frame, nib on the stroke, no jumps between ways`, async () => {
    setPeeps(null);
    const m = await model(`../examples/phong-cach/${file}.json`, ratio), plan = m.handPlan!;
    assert.ok(plan && plan.tasks.length > 10);
    const used = new Set(plan.choice.filter((c) => c >= 0).map((c) => plan.ways[c].key));
    if (ratio === '9:16' && file === 'sketchnote') assert.ok(used.size >= 2, `the hand comes in more than one way (${[...used]})`);
    assert.ok(plan.choice.filter((c) => c < 0).length <= plan.choice.length * 0.1, 'almost every stroke has a hand');
    const F = frames(plan, m.timeline.duration);
    // like a person drawing: the hand is there for most of the drawing time
    let drawing = 0, held = 0;
    for (const tk of plan.tasks) for (let t = tk.start; t < tk.end; t += 1 / 30) { drawing++; if (handAt(plan, t)) held++; }
    assert.ok(held / drawing >= 0.75, `hand present ${(held / drawing * 100).toFixed(0)}% of the drawing time`);
    for (let i = 0; i < F.length; i++) {
      const { t, h, g } = F[i];
      if (!h || !g) continue;
      // the photo's own forearm always runs out past an edge (it is never lengthened)
      assert.ok(g.out || !inFrame(plan, g), `forearm cut visible at ${t.toFixed(2)}s`);
      // while drawing (once the hand has arrived), the nib is exactly on the stroke
      // (when two things overlap in time, the hand is on the one that started last)
      let k = -1; plan.tasks.forEach((x, j) => { if (t >= x.start && t <= x.end) k = j; });
      if (k >= 0 && h.lift === 0 && plan.choice[k] === h.way) { const p = plan.tasks[k].pen((t - plan.tasks[k].start) / (plan.tasks[k].end - plan.tasks[k].start)); assert.ok(Math.hypot(p[0] - h.x, p[1] - h.y) < 1e-6); }
      // a change of way happens only out of the frame
      const prev = F[i - 1];
      if (prev?.h && prev.g && prev.h.way !== h.way) assert.ok(!inFrame(plan, g) && !inFrame(plan, prev.g), `way changed in view at ${t.toFixed(2)}s`);
    }
  });
}

test('when no way in is natural the stroke draws itself (no forced hand)', () => {
  const W = 540, H = 960;
  // only the bottom-right way allowed, and the stroke at the top-left corner: the photo's forearm would end inside the frame
  const tasks = [{ start: 0, end: 1, pen: (q: number) => [20 + q * 30, 30] as [number, number] }];
  const plan = planHand(tasks, poses, W, H, WAYS.filter((w) => w.key === 'A'));
  assert.deepEqual(plan.choice, [-1]);
  assert.equal(handAt(plan, 0.5), null);
});

test('story animation uses the adaptive hand too', async () => {
  (globalThis as any).Path2D ||= Path2D;
  setPeeps(JSON.parse(readFileSync(ROOT + '/assets/peeps/peeps.json', 'utf8')));
  try {
    const m = await model('../examples/giao-tiep-nguoi-la/project.json');
    assert.ok(m.handPlan && m.handPlan.tasks.length >= 3 && m.handPlan.choice.some((c) => c >= 0));
  } finally { setPeeps(null); }
});
