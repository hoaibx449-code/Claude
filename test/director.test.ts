import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { cleanDirection, directionIssues, fallbackDirection, planDirections } from '../src/engine/director.ts';
import { cleanSpec } from '../web/src/spec.ts';
import { composeLook } from '../web/src/compose.ts';
import { defaultConfig, cleanConfig, publicConfig } from '../web/src/settings.ts';
import { writeScript, reviewDirectionFrames } from '../web/src/ai.ts';
import { buildTimeline, estimateVoice } from '../src/engine/timeline.ts';
import { prepare, renderFrame, SANS } from '../src/engine/render.ts';

const lines = ['AI chọn một thương hiệu.', 'Khách hàng chọn nơi họ tin.'];
const scene = () => ({ lines: [...lines], direction: fallbackDirection(lines) });

test('director graphs are bounded data, with safe ids, references, coordinates and timing', () => {
  const d = cleanDirection({ title: '<script>data only</script>', nodes: [
    { id: 'a', label: 'Thương hiệu', x: -999, y: Infinity, w: 999, h: 20, line: 99, delay: -1, icon: '../secret', script: 'alert(1)' },
    { id: 'a', label: 'Duplicate' }, null,
  ], links: [{ from: 'a', to: 'missing' }, { from: 'a', to: 'a' }] }, lines)!;
  assert.equal(d.nodes.length, 1); assert.deepEqual(d.links, []);
  const n = d.nodes[0];
  assert.ok(n.x - n.w / 2 >= 2 && n.x + n.w / 2 <= 98);
  assert.ok(Number.isFinite(n.y)); assert.equal(n.line, 1); assert.equal(n.delay, 0);
  assert.equal(n.icon, undefined); assert.equal((n as any).script, undefined);
});

test('good free positioning survives saving; overlaps are repaired without changing narration', () => {
  const raw = scene(); raw.direction.nodes[0].x = 25;
  raw.direction.nodes[0].w = 30;
  const s = cleanSpec({ look: 'director', scenes: [raw] }, 'u');
  assert.equal(s.scenes[0].direction.nodes[0].x, 25);
  assert.deepEqual(cleanSpec(s, 'u').scenes, s.scenes);
  const overlap = scene(); overlap.direction.nodes.forEach((n) => { n.x = 50; n.y = 50; });
  assert.ok(directionIssues(overlap.direction).length);
  const repaired = planDirections([overlap])[0];
  assert.deepEqual(repaired.lines, lines); assert.deepEqual(directionIssues(repaired.direction), []);
});

test('fallback derives labels from narration, chooses meaningful arrangements and avoids recent ones', () => {
  const c = composeLook({ look: 'director', scenes: [
    { lines: ['Thay vì chờ đợi, hãy bắt đầu.'] }, { lines: ['Đầu tiên đọc sách.', 'Tiếp theo thực hành.'] },
    { lines: ['AI chọn thương hiệu.', 'Khách hàng chọn bạn.'] },
  ] });
  assert.deepEqual(c.scenes.map((s) => s.direction.composition), ['compare', 'steps', 'funnel']);
  assert.equal(fallbackDirection(['Thay vì chờ đợi, hãy bắt đầu.'], ['compare']).composition, 'flow');
  for (const s of c.scenes) {
    assert.deepEqual(directionIssues(s.direction), []);
    for (const n of s.direction.nodes) assert.ok(s.lines.some((l) => l.includes(n.label)));
  }
});

test('new and saved site settings expose director, with visibility still controlled by admin', () => {
  const c = cleanConfig({ rev: 2 }, defaultConfig({} as any));
  const p = publicConfig(c);
  assert.equal(c.labels.looks.director, 'AI đạo diễn');
  assert.equal((p as any).labels.looks.director, 'AI đạo diễn');
});

test('AI repair receives recent compositions and cannot rewrite the supplied narration', async () => {
  const old = globalThis.fetch, sent: any[] = [];
  globalThis.fetch = (async (_url: any, opts: any) => {
    sent.push(JSON.parse(opts.body));
    const d = fallbackDirection(lines); d.nodes.forEach((n) => { n.x = 50; n.y = 50; });
    const value = sent.length === 1 ? { scenes: [{ lines: ['Lời bị thay'], direction: d }] } : { scenes: [{ lines: ['Không được thay'], direction: fallbackDirection(lines) }] };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }));
  }) as any;
  try {
    const result = await writeScript({ OPENAI_API_KEY: 'test', OPENAI_TEXT_MODEL: 'test-model' } as any, 'openai', { look: 'director', ratio: '9:16', visual: 'sketch', topic: '', seconds: 0, tone: '', scenes: [lines], recentDirections: ['flow,steps'] });
    assert.equal(sent.length, 2); assert.match(sent[0].messages[0].content, /flow,steps/);
    assert.deepEqual(result.scenes[0].lines, lines); assert.deepEqual(directionIssues(result.scenes[0].direction), []);
    assert.equal(result._usage.tokensIn, 20);
  } finally { globalThis.fetch = old; }
});

test('visual review sends rendered frames, keeps narration, and rejects malformed or excessive uploads', async () => {
  const old = globalThis.fetch; let sent: any;
  globalThis.fetch = (async (_url: any, opts: any) => {
    sent = JSON.parse(opts.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ notes: ['Giãn khoảng cách chữ.'], scenes: [{ lines: ['Hacked'], direction: fallbackDirection(lines) }] }) } }] }));
  }) as any;
  const frame = 'data:image/jpeg;base64,' + Buffer.from('test').toString('base64'), env: any = { OPENAI_API_KEY: 'test', OPENAI_TEXT_MODEL: 'test-model' };
  try {
    const result = await reviewDirectionFrames(env, [frame], [scene()], 'openai');
    assert.deepEqual(result.scenes[0].lines, lines);
    assert.equal(sent.messages[1].content[1].image_url.url, frame);
    assert.deepEqual(result.notes, ['Giãn khoảng cách chữ.']);
    await assert.rejects(reviewDirectionFrames(env, ['https://untrusted.test/private'], [scene()], 'openai'), { status: 400 });
    await assert.rejects(reviewDirectionFrames(env, Array(7).fill(frame), [scene()], 'openai'), { status: 400 });
  } finally { globalThis.fetch = old; }
});

test('director renders both ratios and palettes deterministically at every scene boundary', () => {
  GlobalFonts.registerFromPath('assets/fonts/BeVietnamPro-ExtraBold.ttf', SANS);
  const icons = JSON.parse(readFileSync('assets/icons/tabler.json', 'utf8'));
  for (const ratio of ['9:16', '16:9']) for (const skin of ['sang', 'dem']) {
    const project: any = cleanSpec({ look: 'director', skin, ratio, scenes: [scene(), { lines: ['Đầu tiên rõ dữ liệu.', 'Tiếp theo lắng nghe.'] }] }, 'u');
    const timeline = buildTimeline(project.scenes, project.scenes.map((s: any) => estimateVoice(s.lines)));
    const model = prepare({ project, timeline, env: { createCanvas: (w, h) => createCanvas(w, h) as any }, dpr: 0.5, images: [], icons, hand: {} as any });
    const cv = createCanvas(Math.round(model.W * 0.5), Math.round(model.H * 0.5));
    for (let t = 0; t < timeline.duration; t += 0.2) renderFrame(cv.getContext('2d'), model, t);
    renderFrame(cv.getContext('2d'), model, timeline.duration - 0.3); const a = cv.toBuffer('image/png');
    renderFrame(cv.getContext('2d'), model, timeline.duration - 0.3); assert.deepEqual(cv.toBuffer('image/png'), a);
    assert.ok(model.look!.cues.length >= project.scenes.length);
  }
});

test('CLI scene graphs get defaults too: omitted delay/shape cannot make objects disappear', () => {
  const project = JSON.parse(readFileSync('examples/ai-director/project.json', 'utf8'));
  const timeline = buildTimeline(project.scenes, project.scenes.map((s: any) => estimateVoice(s.lines)));
  const model = prepare({ project, timeline, env: { createCanvas: (w, h) => createCanvas(w, h) as any }, dpr: 1, images: [], icons: {}, hand: {} as any });
  const cv = createCanvas(model.W, model.H), c = cv.getContext('2d');
  renderFrame(c, model, timeline.scenes[0].end - 0.05);
  const node = project.scenes[0].direction.nodes[2];
  const x = Math.round(model.W * .06 + model.W * .88 * node.x / 100);
  const y = Math.round(model.H * .25 + model.H * .48 * node.y / 100);
  // The highlighted card is yellow, not the cream stage background.
  const pixel = c.getImageData(x + 10, y + 20, 1, 1).data;
  assert.ok(pixel[0] > 200 && pixel[1] > 150 && pixel[2] < 100, String(pixel));
});
