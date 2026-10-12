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
    scenes: [
      { lines: ['Xin chào các bạn.', 'Hôm nay học vẽ.'], panels: [{ image: 'x' }, { image: 'y' }] },
      { lines: ['Lãi kép sau ba mươi năm.'], panels: [], diagram: { kind: 'bars', title: 'Lãi kép', values: [21.6, 46.6, 100.6], labels: ['10 năm', '20 năm', '30 năm'], unit: 'tr' } },
      { lines: ['Ba bước.'], panels: [], diagram: { kind: 'steps', items: ['Một', 'Hai', 'Ba'] } },
    ],
  };
  const tl = buildTimeline(project.scenes, project.scenes.map((s) => estimateVoice(s.lines)));
  const img = await loadImage('assets/doodles/CoffeeDoodle.svg');
  const meta = JSON.parse(readFileSync('assets/hands/default/hand.json', 'utf8'));
  const hand = { img: await loadImage('assets/hands/default/hand.webp'), fingers: await loadImage('assets/hands/default/fingers.webp'), meta };
  return prepare({ env: { createCanvas: (w, h) => createCanvas(w, h) as any }, project, timeline: tl, images: [[img, img], [], []], hand, dpr: 0.5 });
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
  for (const style of ['notebook', 'whiteboard', 'chalkboard', 'kraft', 'oly', 'pencil', 'blueprint', 'ricepaper', 'neon', 'pastel', 'newspaper', 'comic', 'darkboard', 'sunset', 'cosmos', 'manim', 'bold'] as const) {
    for (const ratio of ['9:16', '16:9'] as const) {
      const m = await model(ratio, style);
      const c = createCanvas(m.W * 0.5, m.H * 0.5);
      renderFrame(c.getContext('2d'), m, m.timeline.duration - 0.5);
    }
  }
});

test('diagram strokes are drawn while their scene is spoken', async () => {
  const m = await model('9:16', 'notebook');
  const units = m.units[1], T = m.timeline.scenes[1];
  assert.ok(units.length >= 8);
  assert.ok(units[0].start >= T.lines[0].start && units[units.length - 1].end <= T.end);
  for (let i = 1; i < units.length; i++) assert.ok(units[i].start >= units[i - 1].start);
});

test('stick figures keep moving after the hand has drawn them', async () => {
  const project: ProjectSpec = {
    title: 't', channel: 'Kênh', ratio: '9:16', style: 'whiteboard',
    scenes: [{ lines: ['Một người đang chạy rất nhanh về đích.', 'Và vui mừng nhảy lên.'], panels: [], diagram: { kind: 'stick', title: 'Về đích', actors: [{ action: 'run', label: 'Bạn' }, { action: 'cheer' }], bubble: 'Xong rồi!', caption: 'Cố lên' } }],
  };
  const tl = buildTimeline(project.scenes, project.scenes.map((s) => estimateVoice(s.lines)));
  const meta = JSON.parse(readFileSync('assets/hands/default/hand.json', 'utf8'));
  const hand = { img: await loadImage('assets/hands/default/hand.webp'), fingers: await loadImage('assets/hands/default/fingers.webp'), meta };
  const m = prepare({ env: { createCanvas: (w, h) => createCanvas(w, h) as any }, project, timeline: tl, images: [[]], hand, dpr: 0.5 });
  const actor = m.units[0][3]; // title, underline, ground, first figure
  const c = createCanvas(270, 480), x = c.getContext('2d');
  // only the figure layer: draw the unit alone at two moments after it was finished
  const shot = (t: number) => { x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, 270, 480); x.setTransform(0.5, 0, 0, 0.5, 0, 0); actor.draw(x, 1, 1, t); return Buffer.from(x.getImageData(0, 0, 270, 480).data); };
  assert.ok(!shot(actor.end + 0.3).equals(shot(actor.end + 0.6)));
  assert.ok(shot(actor.end + 0.3).equals(shot(actor.end + 0.3)));
});

test('motion, maths and kinetic modes render with an opening title card', async () => {
  GlobalFonts.registerFromPath('assets/fonts/BeVietnamPro-ExtraBold.ttf', 'NVSans');
  const icons = JSON.parse(readFileSync('assets/icons/tabler.json', 'utf8'));
  const meta = JSON.parse(readFileSync('assets/hands/default/hand.json', 'utf8'));
  const hand = { img: await loadImage('assets/hands/default/hand.webp'), fingers: await loadImage('assets/hands/default/fingers.webp'), meta };
  for (const mode of ['motion', 'math', 'kinetic'] as const) {
    const project: ProjectSpec = {
      title: 't', channel: 'Kênh', ratio: '9:16', style: 'cosmos', mode, intro: { title: 'Bí mật 10 triệu', badge: 'Mới', icon: 'pig-money' },
      scenes: [{ lines: ['Gửi 10 triệu mỗi tháng, đều đặn.', 'Tiền tăng nhờ lãi kép.'], panels: [], diagram: { kind: 'sketch', items: [
        { t: 'icon', name: 'pig-money', x: 30, y: 40, line: 0 }, { t: 'text', text: 'lãi kép', x: 50, y: 10, line: 1 },
        { t: 'chart', kind: 'plot', fn: 'exp', x: 50, y: 75, w: 90, h: 30, line: 1 }, { t: 'qr', text: 'https://example.com', x: 70, y: 40, line: 1 }] } }],
    };
    const tl = buildTimeline(project.scenes, project.scenes.map((s) => estimateVoice(s.lines)), { intro: true });
    assert.ok(tl.intro! > 1 && tl.scenes[0].start === tl.intro);
    const m = prepare({ env: { createCanvas: (w, h) => createCanvas(w, h) as any }, project, timeline: tl, images: [[]], hand, dpr: 0.5, icons });
    const c = createCanvas(m.W * 0.5, m.H * 0.5), x = c.getContext('2d');
    for (const t of [0, tl.intro! + 0.1, tl.scenes[0].lines[1].start + 0.5, tl.duration - 0.2]) renderFrame(x, m, t);
  }
});
