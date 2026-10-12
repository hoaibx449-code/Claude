import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { buildTimeline, estimateVoice } from '../src/engine/timeline.ts';
import { prepare, renderFrame } from '../src/engine/render.ts';
import type { ProjectSpec } from '../src/engine/types.ts';

GlobalFonts.registerFromPath('assets/fonts/Pangolin-Regular.ttf', 'Pangolin');

async function model(ratio: '9:16' | '16:9', style: ProjectSpec['style']) {
  const project: ProjectSpec = {
    title: 't', channel: 'Kênh', episode: 'Tập 1', ratio, style,
    scenes: [{ lines: ['Xin chào các bạn.', 'Hôm nay học vẽ.'], panels: [{ image: 'x' }, { image: 'y' }] }],
  };
  const tl = buildTimeline(project.scenes, project.scenes.map((s) => estimateVoice(s.lines)));
  const img = await loadImage('assets/doodles/CoffeeDoodle.svg');
  const meta = JSON.parse(readFileSync('assets/hands/default/hand.json', 'utf8'));
  const hand = { img: await loadImage('assets/hands/default/hand.webp'), fingers: await loadImage('assets/hands/default/fingers.webp'), meta };
  return prepare({ env: { createCanvas: (w, h) => createCanvas(w, h) as any }, project, timeline: tl, images: [[img, img]], hand, dpr: 0.5 });
}

test('a frame is a pure function of time', async () => {
  const m = await model('9:16', 'notebook');
  const c = createCanvas(270, 480), x = c.getContext('2d');
  const t = m.timeline.scenes[0].panels[0].start + 0.5;
  renderFrame(x, m, t); const a = Buffer.from(x.getImageData(0, 0, 270, 480).data);
  renderFrame(x, m, 0.1); renderFrame(x, m, t); const b = Buffer.from(x.getImageData(0, 0, 270, 480).data);
  assert.ok(a.equals(b));
});

test('every style renders in both ratios', async () => {
  for (const style of ['notebook', 'whiteboard', 'chalkboard', 'kraft', 'oly', 'blueprint', 'ricepaper'] as const) {
    for (const ratio of ['9:16', '16:9'] as const) {
      const m = await model(ratio, style);
      const c = createCanvas(m.W * 0.5, m.H * 0.5);
      renderFrame(c.getContext('2d'), m, m.timeline.duration - 0.5);
    }
  }
});
