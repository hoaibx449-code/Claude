import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { actionPose, joints, STAND } from '../src/engine/act/rig.ts';
import { buildAct, longestStill, actorState } from '../src/engine/act/director.ts';
import { planAt, pointAt } from '../src/engine/act/geom.ts';
import { buildTimeline, estimateVoice } from '../src/engine/timeline.ts';
import { cleanAct, cleanCast, composeAct, ACT_ACTIONS, ACT_SETS, ACT_PROPS } from '../web/src/act.ts';
import { cleanSpec } from '../web/src/spec.ts';
import { PROPS, SETS } from '../src/engine/act/props.ts';

const spec = JSON.parse(readFileSync(new URL('../examples/giao-tiep-nguoi-la/project.json', import.meta.url), 'utf8'));
const build = (s = spec) => buildAct({ project: s, timeline: buildTimeline(s.scenes, s.scenes.map((x: any) => estimateVoice(x.lines)), {}), font: 'sans', hand: 'sans' });

test('standing and walking keep a foot on the ground, no limb stretches', () => {
  for (const a of ['idle', 'walk', 'run', 'wave', 'shy', 'celebrate', 'handshake', 'talk']) {
    for (let t = 0; t < 2; t += 0.1) {
      const p = actionPose({ do: a, t0: 0, t1: 2 }, t, 1, 1), J = joints(p, 1, 0.5);
      const lowest = Math.max(J.anF[1], J.anB[1]);
      assert.ok(Math.abs(lowest - p.dy) < 0.01 || a === 'celebrate', `${a}: a foot touches the ground`);
      const upper = Math.hypot(J.elF[0] - J.shF[0], J.elF[1] - J.shF[1]);
      assert.ok(Math.abs(upper - 42) < 0.01, 'bones keep their length');
    }
  }
  assert.ok(joints(STAND, 1, 0).head[1] < -200);
});

test('the story test video meets the acceptance list', () => {
  const m = build();
  const minh = m.actors.find((a) => a.id === 'minh')!, lan = m.actors.find((a) => a.id === 'lan')!;
  // the hand really draws a character, which acts once the hand is gone
  assert.ok(minh.draw && minh.draw.plan.prims.length > 12);
  assert.ok(minh.body.some((b) => b.t0 > minh.draw!.end + 0.5));
  // one person approaches the other; both talk
  assert.ok(minh.moves.some((v) => v.x1 > v.x0 + 50));
  assert.ok(m.bubbles.some((b) => b.who === 'minh' && !b.think) && m.bubbles.some((b) => b.who === 'lan' && !b.think));
  assert.ok(minh.body.some((b) => b.do === 'handshake') && lan.body.some((b) => b.do === 'handshake'));
  // shy turns confident
  const emo = minh.emos.map((e) => e.e);
  assert.ok(emo.indexOf('shy') >= 0 && emo.lastIndexOf('confident') > emo.indexOf('shy'));
  // wrong / right shown by actions, with continuity between places (walk to the next stage)
  assert.deepEqual(m.badges.map((b) => b.ok), [false, true]);
  assert.ok(m.cams.some((c, i) => i > 0 && Math.abs(c.x - m.cams[i - 1].x) > 300), 'camera travels to the next place');
  // pacing: never more than ~3.5 s without a new visual event, sound on the pen and steps
  assert.ok(longestStill(m) <= 3.6, `still for ${longestStill(m)}s`);
  assert.ok(m.cues.some((c) => c.k === 'scribble') && m.cues.some((c) => c.k === 'step') && m.cues.some((c) => c.k === 'whoosh'));
  // the bubbles never overlap in time
  for (let i = 1; i < m.bubbles.length; i++) assert.ok(m.bubbles[i].t0 >= m.bubbles[i - 1].t1 - 1e-6);
});

test('the nib sits on the line being drawn', () => {
  const m = build(), d = m.actors[0].draw!;
  for (let q = 0.01; q < 1; q += 0.07) {
    const st = planAt(d.plan, q);
    if (st.lift > 0 || st.u <= 0) continue;
    const p = d.plan.prims[st.i];
    if (p.dot) continue;
    const at = pointAt(p.d, st.u, p.closed);
    assert.ok(Math.hypot(at[0] - st.x, at[1] - st.y) < 1e-6);
  }
});

test('people turn smoothly and face who they walked up to', () => {
  const m = build(), minh = m.actors.find((a) => a.id === 'minh')!;
  let prev = actorState(m, minh, 0).yaw;
  for (let t = 0; t < m.duration; t += 1 / 30) { const y = actorState(m, minh, t).yaw; assert.ok(Math.abs(y - prev) < 0.12, `yaw jump at ${t}`); prev = y; }
});

test('the sanitizer keeps only what the engine knows', () => {
  const cast = cleanCast([{ id: 'Minh', look: 'minh' }, { id: 'x y', look: 'zz' }, { id: 'lan', look: 'nope' }]);
  assert.deepEqual(cast.map((c) => c.id), ['minh', 'lan']);
  const a = cleanAct({ set: 'moon', draw: ['minh', 'evil'], beats: [{ who: 'minh', do: 'fly', say: 'x'.repeat(200), at: 'L1@0.5' }, { who: 'ghost', do: 'walk' }, { who: 'lan', do: 'walk', to: 'minh', emo: 'happy' }], text: [{ text: 'A', kind: 'weird' }] }, ['minh', 'lan']);
  assert.equal(a.set, undefined);
  assert.deepEqual(a.draw, ['minh']);
  assert.equal(a.beats.length, 2);
  assert.equal(a.beats[0].do, undefined); assert.equal(a.beats[0].say.length, 60); assert.equal(a.beats[0].at, 'L1@0.5');
  assert.equal(a.text[0].kind, 'stamp');
});

test('engine and site agree on actions, sets and props', () => {
  for (const s of ACT_SETS) assert.ok(SETS[s], s);
  for (const p of ACT_PROPS) assert.ok(PROPS[p], p);
  for (const a of ACT_ACTIONS) assert.doesNotThrow(() => actionPose({ do: a, t0: 0, t1: 1 }, 0.5, 1, 1));
});

test('a storyboard is written from the words alone and survives the sanitizer', () => {
  const scenes = [['Bạn ngại nói chuyện với người lạ?', 'Tim đập nhanh, tay đổ mồ hôi.'], ['Cách sai: cúi mặt và im lặng.', 'Người kia sẽ bỏ đi.'], ['Hãy mỉm cười và hỏi một câu.', 'Mọi thứ dễ hơn bạn nghĩ.'], ['Người lạ là bạn chưa quen.']];
  const c = composeAct(scenes.map((lines) => ({ lines })));
  assert.equal(c.acts.length, 4);
  const spec2 = cleanSpec({ look: 'act', ratio: '9:16', cast: c.cast, scenes: scenes.map((lines, i) => ({ lines, act: c.acts[i] })) }, 'u1');
  assert.equal(spec2.cast!.length, 2);
  assert.equal(spec2.scenes[1].act.badge, 'wrong');
  assert.equal(spec2.scenes[2].act.badge, 'right');
  assert.ok(spec2.scenes[3].act.text.some((t: any) => t.kind === 'big'));
  const m = build({ ...spec2, ratio: '9:16' });
  assert.ok(m.actors.length === 2 && m.hand.length >= 2);
});

test('an uploaded recording keeps scenes back to back', () => {
  const sc = [{ lines: ['a'], panels: [] }, { lines: ['b'], panels: [] }] as any;
  const tl = buildTimeline(sc, [{ lines: [{ start: 0, end: 2 }], duration: 2.5 }, { lines: [{ start: 0, end: 1 }], duration: 1 }], { continuous: true });
  assert.equal(tl.scenes[1].start, tl.scenes[0].end);
  assert.ok(Math.abs(tl.scenes[1].lines[0].start - 2.8) < 1e-9);
});

test('hand-drawn people keep one outfit, stand under their head and are drawn by the hand', async () => {
  const { createCanvas, Path2D } = await import('@napi-rs/canvas');
  const { setPeeps, peepPicture, poseOf, PEEP_LOOKS } = await import('../src/engine/act/peeps.ts');
  (globalThis as any).Path2D ||= Path2D;
  setPeeps(JSON.parse(readFileSync(new URL('../assets/peeps/peeps.json', import.meta.url), 'utf8')));
  const env = { createCanvas: (w: number, h: number) => createCanvas(w, h) as any };
  try {
    for (const look of Object.values(PEEP_LOOKS)) {
      // every standing pose of a person wears the same outfit
      const poses = ['idle', 'walk', 'point', 'cross', 'explain'].map((a) => poseOf(a, look));
      for (const [g, n] of poses) if (g === 'standing') assert.ok(n.endsWith(look.outfit), `${n} keeps ${look.outfit}`);
      const pic = peepPicture(env, look, 'standing', poseOf('idle', look)[1], 'Calm', 0.1, 1)!;
      assert.ok(pic && pic.h > pic.w, 'a standing person is taller than wide');
      // the feet anchor is under the head
      assert.ok(Math.abs(pic.ax - pic.head[0]) < pic.w * 0.25 && pic.head[1] < pic.h * 0.25);
    }
    const m = buildAct({ project: spec, timeline: buildTimeline(spec.scenes, spec.scenes.map((x: any) => estimateVoice(x.lines)), {}), font: 'sans', hand: 'sans', measure: createCanvas(4, 4).getContext('2d') as any, env, dpr: 1 });
    const a = m.actors.find((x: any) => x.reveal)!;
    assert.ok(a && a.reveal!.R.plan, 'the person is revealed along its own strokes');
  } finally { setPeeps(null); }
});
