import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { flatten } from '../src/engine/svgpath.ts';
import { buildSketch } from '../src/engine/sketch.ts';
import { stageBox } from '../src/engine/render.ts';
import { composeScene, splitScript } from '../web/src/compose.ts';
import { cleanSpec } from '../web/src/spec.ts';

GlobalFonts.registerFromPath('assets/fonts/Pangolin-Regular.ttf', 'Pangolin');
const icons = JSON.parse(readFileSync('assets/icons/tabler.json', 'utf8'));
const col = { ink: '#111', accent: '#d00', accent2: '#00d', good: '#0a0' };

test('svg arcs flatten into closed circles', () => {
  const [ring] = flatten('M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0');
  for (const [x, y] of ring) assert.ok(Math.abs(Math.hypot(x - 12, y - 12) - 10) < 0.05);
});

test('sketch items stay on the page and arrows connect items by id', () => {
  const stage = stageBox('9:16'), c = createCanvas(4, 4).getContext('2d');
  const els = buildSketch(c, [
    { id: 'a', t: 'icon', name: 'pig-money', x: 2, y: 30, w: 30 },
    { id: 'b', t: 'icon', name: 'pig-money', x: 3, y: 31, w: 30 }, // same spot: must be moved
    { id: 't', t: 'text', text: 'Một tiêu đề rất rất dài cần xuống dòng cho vừa', x: 50, y: 0, size: 'xl' },
    { t: 'arrow', from: 'a', to: 't' }, { t: 'circle', on: 'b' }, { t: 'arrow', from: 'a', to: 'missing' },
  ] as any, stage, col, icons, true);
  const icons2 = els.filter((e) => e.kind === 'lines') as any[];
  assert.equal(icons2.length, 2);
  const xs = (e: any) => e.lines.flat().map((p: number[]) => p[0]);
  assert.ok(Math.min(...xs(icons2[0])) >= stage.x - 2);
  const ys = (e: any) => e.lines.flat().map((p: number[]) => p[1]);
  const moved = Math.abs(Math.min(...xs(icons2[0])) - Math.min(...xs(icons2[1]))) + Math.abs(Math.min(...ys(icons2[0])) - Math.min(...ys(icons2[1])));
  assert.ok(moved > 40, 'overlapping items are pushed apart');
  for (const e of els) if (e.kind === 'text') assert.ok(e.x >= stage.x - 1 && e.x + e.w <= stage.x + stage.w + 1);
  assert.equal(els.filter((e) => e.kind === 'path').length, 2); // one arrow + one circle; the broken arrow is skipped
});

test('own script: split into scenes and illustrated without AI', () => {
  const scenes = splitScript('Lương về 10 triệu. Nhưng mười ngày sau ví trống trơn.\n\nHãy chia lương: tiết kiệm, chi tiêu, đầu tư.');
  assert.equal(scenes.length, 2);
  const spec = cleanSpec({ visual: 'sketch', scenes: scenes.map((lines) => ({ lines })) }, 'u1');
  for (const sc of spec.scenes) {
    assert.equal(sc.diagram.kind, 'sketch');
    assert.ok(sc.diagram.items.length >= 3);
  }
  assert.equal(spec.subtitles, false);
  // every icon the free designer uses exists
  for (const s of ['Vì sao tôi buồn?', 'Chạy deadline nên mệt', 'Tiết kiệm 30% lương']) for (const it of composeScene([s], true, 0) as any[]) if (it.t === 'icon') assert.ok(icons[it.name], it.name);
});

test('cue words set when an item is drawn', async () => {
  const { cueFraction } = await import('../src/engine/render.ts');
  assert.equal(cueFraction('Gửi mười triệu, lãi tám phần trăm', 'gửi'), 0);
  const f = cueFraction('Gửi mười triệu, lãi tám phần trăm', 'lai tam')!;
  assert.ok(f > 0.4 && f < 0.6, String(f));
  assert.equal(cueFraction('Một câu', 'không có'), null);
});
