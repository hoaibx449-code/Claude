import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractStrokes, penState, thin, trace } from '../src/engine/strokes.ts';

/** RGBA picture with ink where f(x, y) holds. */
function pic(w: number, h: number, f: (x: number, y: number) => boolean) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (f(x, y)) px[(y * w + x) * 4 + 3] = 255;
  return px;
}

test('a thick bar thins to one centre line', () => {
  const w = 40, h = 20, b = new Uint8Array(w * h);
  for (let y = 8; y < 13; y++) for (let x = 5; x < 35; x++) b[y * w + x] = 1;
  thin(b, w, h);
  const lines = trace(b, w, h);
  assert.equal(lines.length, 1);
  for (const [, y] of lines[0]) assert.ok(Math.abs(y - 10) <= 1);
});

test('the pen sits on the end of the line being drawn and lifts between strokes', () => {
  // two separate horizontal strokes, the upper one first
  const P = extractStrokes(pic(60, 40, (x, y) => (y >= 9 && y <= 11 && x >= 5 && x <= 50) || (y >= 29 && y <= 31 && x >= 5 && x <= 50)), 60, 40, 1)!;
  assert.ok(P);
  assert.equal(P.strokes.length, 2);
  assert.ok(P.strokes[0][0][1] < 15);
  let prev = penState(P, 0), maxStep = 0, lifted = false;
  for (let i = 1; i <= 400; i++) {
    const s = penState(P, i / 400);
    maxStep = Math.max(maxStep, Math.hypot(s.x - prev.x, s.y - prev.y));
    if (s.lift > 0) lifted = true;
    if (s.along > 0) assert.ok(Math.abs(s.y - (s.done === 0 ? 10.5 : 30.5)) < 1.5, 'nib on the stroke');
    prev = s;
  }
  assert.ok(lifted, 'pen lifts to travel');
  assert.ok(maxStep < 2, 'no jumps');
  assert.equal(penState(P, 1).done, 2);
});

test('photos (mostly ink) are not drawn line by line', () => {
  assert.equal(extractStrokes(pic(30, 30, () => true), 30, 30, 1), null);
});
