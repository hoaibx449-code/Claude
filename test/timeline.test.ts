import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, estimateVoice } from '../src/engine/timeline.ts';

const scenes = [
  { lines: ['Một câu ngắn.', 'Câu thứ hai dài hơn một chút.'], panels: [{ image: 'a' }, { image: 'b' }] },
  { lines: ['Chỉ một câu.'], panels: [{ image: 'c' }, { image: 'd' }] },
];

test('scenes follow each other and panels start with their line', () => {
  const tl = buildTimeline(scenes, scenes.map((s) => estimateVoice(s.lines)));
  assert.equal(tl.scenes.length, 2);
  assert.equal(tl.scenes[1].start, tl.scenes[0].end);
  const s0 = tl.scenes[0];
  assert.ok(Math.abs(s0.panels[0].start - s0.lines[0].start) < 0.1);
  assert.ok(Math.abs(s0.panels[1].start - s0.lines[1].start) < 0.1);
  assert.ok(tl.duration > tl.scenes[1].end);
});

test('two panels on one line are drawn one after the other', () => {
  const tl = buildTimeline(scenes, scenes.map((s) => estimateVoice(s.lines)));
  const [a, b] = tl.scenes[1].panels;
  assert.ok(b.start >= a.end);
  assert.ok(b.end <= tl.scenes[1].end);
});
