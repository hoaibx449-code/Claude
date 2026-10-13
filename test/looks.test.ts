import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { prepare, renderFrame } from '../src/engine/render.ts';
import { buildTimeline, estimateVoice } from '../src/engine/timeline.ts';
import { beats, SKINS } from '../src/engine/looks.ts';
import { composeLook, numbersIn } from '../web/src/compose.ts';
import { cleanSpec } from '../web/src/spec.ts';
import { database } from './support/sqlite.ts';
import { defaultConfig } from '../web/src/settings.ts';
import { chargeDoc, closeDocProject, creditState, addCredits, openDocProject, useDocImage } from '../web/src/credits.ts';

const icons = JSON.parse(readFileSync('assets/icons/tabler.json', 'utf8'));
const LINES = [['Lương 15 triệu, sao cuối tháng vẫn hết sạch?'], ['Người nghèo nhận lương là đi mua sắm.', 'Người giàu nhận lương là cất 20% trước.'], ['Nhà 5 triệu, ăn uống 4 triệu, mua sắm 4 triệu.'], ['Mỗi tháng nên cất bao nhiêu?'], ['Đáp án là 20%, tức 3 triệu.'], ['Mẹo: nhận lương là cất 20% trước nhé.']];

test('every format renders every frame in both ratios and lists sound cues', () => {
  for (const look of ['kinetic', 'split', 'chat', 'story', 'data', 'quiz', 'doc']) for (const ratio of ['9:16', '16:9']) {
    const c = composeLook({ look, scenes: LINES.map((lines) => ({ lines })) });
    const spec: any = cleanSpec({ title: 'Thử', ratio, look, scenes: c.scenes, sides: c.sides, chatName: c.chatName }, 'u1');
    assert.equal(spec.look, look); assert.equal(spec.skin, SKINS[look][0].name);
    const timeline = buildTimeline(spec.scenes, spec.scenes.map((s: any) => estimateVoice(s.lines)), {});
    const env = { createCanvas: (w: number, h: number) => createCanvas(w, h) as any };
    const m = prepare({ env, project: spec, timeline, images: spec.scenes.map((s: any) => s.panels.map(() => createCanvas(64, 48))), hand: {} as any, dpr: 0.25, icons });
    const cv = createCanvas(Math.round(m.W * 0.25), Math.round(m.H * 0.25)), ctx = cv.getContext('2d');
    for (let t = 0; t < timeline.duration; t += 0.5) renderFrame(ctx, m, t);
    assert.ok(m.look!.cues.length > 0, look + ' has sound cues');
  }
});

test('format composer fills sides, chat roles, numbers and quiz pairs from the words alone', () => {
  const split = composeLook({ look: 'split', scenes: [{ lines: LINES[1] }] });
  assert.deepEqual(split.sides, { a: 'Người nghèo', b: 'Người giàu' });
  assert.ok(split.scenes[0].x.a && split.scenes[0].x.b);
  const chat = composeLook({ look: 'chat', scenes: [{ lines: ['Anh ơi lương về chưa?', 'Về rồi em.'] }, { lines: ['Mẹo: cất 20% trước.'] }] });
  assert.equal(chat.chatName, 'Bạn thân'); // "Mẹo" is not "mẹ"
  assert.equal(chat.scenes[1].x.card, 'Mẹo: cất 20% trước.');
  assert.deepEqual(numbersIn('Lương 15.000.000đ, cất 20%, lãi 1,5 tỷ').map((n) => [n.value, n.unit]), [[15000000, 'đ'], [20, '%'], [1.5, 'tỷ']]);
  const data = composeLook({ look: 'data', scenes: [{ lines: ['Lương 15 triệu.', 'Nhà 5 triệu, ăn uống 4 triệu, mua sắm 4 triệu.'] }] });
  assert.equal(data.scenes[0].x.stat.value, 15); assert.equal(data.scenes[0].x.stat.parts.length, 3);
  const quiz = composeLook({ look: 'quiz', scenes: [{ lines: ['Mỗi tháng nên cất bao nhiêu?', 'Đáp án là 20%.'] }] });
  assert.equal(quiz.scenes.length, 2); assert.equal(quiz.scenes[0].pause, 3);
  assert.equal(quiz.scenes[0].x.quiz.options[quiz.scenes[0].x.quiz.answer], '20%'); assert.equal(quiz.scenes[1].x.quiz.reveal, true);
  assert.deepEqual(beats('Lương 15 triệu, sao cuối tháng vẫn hết sạch?').length > 1, true);
});

test('format data from the page or an AI is checked field by field', () => {
  const spec: any = cleanSpec({ title: 'x', look: 'split', skin: 'evil<script>', sides: { a: 'A'.repeat(100), b: 'B' }, music: 'https://evil.example/a.mp3',
    scenes: [{ lines: ['một hai ba'], x: { a: 'x', b: 'y', aIcon: 'BAD ICON!', aAction: 'fly', chat: [{ who: 'a', text: 'not for split' }] } }] }, 'u1');
  assert.equal(spec.skin, 'do-xanh'); assert.equal(spec.sides.a.length, 24); assert.equal(spec.music, undefined);
  assert.deepEqual(spec.scenes[0].x, { a: 'x', b: 'y' });
  const doc: any = cleanSpec({ title: 'x', look: 'doc', scenes: [{ lines: ['một'], panels: [{ image: 'r2:img/other/aaaaaaaaaaaaaaaaaaaaaaaa.png', prompt: 'p' }] }] }, 'u1');
  assert.equal(doc.scenes[0].panels[0].image, ''); // someone else's picture is never reused
});

test('documentary credits: plan allowance first, then credits, refund when nothing was drawn', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'credits-'));
  try {
    const env: any = { DB: database(join(dir, 'db.sqlite')) };
    env.config = defaultConfig(env);
    const rc: any = { log() {}, wait() {} }, user = { id: 'u1', email: 'a@b.c', name: null, picture: null };
    await env.DB.prepare("INSERT INTO users (id, email, name, picture, created_at) VALUES ('u1', 'a@b.c', NULL, NULL, 0)").run();
    await assert.rejects(chargeDoc(env, rc, user, 'r0'), { status: 402 });
    await addCredits(env, 'u1', 2, 'admin', null);
    assert.equal((await creditState(env, 'u1')).balance, 2);
    assert.equal(await chargeDoc(env, rc, user, 'r1'), 'credits');
    assert.equal((await creditState(env, 'u1')).balance, 1);
    await openDocProject(env, 'p1', 'u1', 'r1');
    await closeDocProject(env, rc, 'p1'); // no picture drawn → refunded
    assert.equal((await creditState(env, 'u1')).balance, 2);
    await chargeDoc(env, rc, user, 'r2'); await openDocProject(env, 'p2', 'u1', 'r2');
    env.config.doc.imagesPerVideo = 14;
    assert.equal(await useDocImage(env, 'p2'), true);
    await closeDocProject(env, rc, 'p2'); // a picture was drawn → kept
    assert.equal((await creditState(env, 'u1')).balance, 1);
    // a VIP plan includes documentaries each month before credits are used
    env.config.plans[1].docPerMonth = 1;
    await env.DB.prepare("INSERT INTO user_plans (user_id, plan, expires_at, granted_by) VALUES ('u1', 'pro', ?, 'test')").bind(Date.now() + 86_400_000).run();
    assert.equal(await chargeDoc(env, rc, user, 'r3'), 'plan');
    assert.equal((await creditState(env, 'u1')).balance, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('hand drawing picks Open Doodles or the acting person from the words and never repeats a picture', async () => {
  const { doodlePanels, isDoodle, isPeep, DOODLE_NAMES } = await import('../web/src/doodles.ts');
  const scenes = Array.from({ length: 20 }, (_, i) => [`Câu thứ ${i} về cuộc sống.`]);
  scenes[0] = ['Mỗi ngày đọc sách mười lăm phút.']; scenes[1] = ['Mua sắm trên Shopee quá nhiều.'];
  const panels = doodlePanels(scenes);
  assert.equal(panels[0][0].image, 'doodle:ReadingDoodle'); assert.equal(panels[1][0].image, 'doodle:UnboxingDoodle');
  const names = panels.map((p) => p[0].image), doodles = names.filter(isDoodle), people = names.filter(isPeep);
  assert.equal(new Set(doodles).size, doodles.length);
  assert.ok(people.length >= 4, 'the video\'s person plays some of the lines');
  assert.equal(new Set(people.map((p) => p.split('.')[0])).size <= 2, true, 'one main character (and at most one other)');
  assert.ok(names.every((n, i) => (isDoodle(n) || isPeep(n)) && n !== names[i - 1]));
  assert.equal(isPeep('peep:minh.think.thinking'), true); assert.equal(isPeep('peep:../x.y.z'), false); assert.equal(isDoodle('doodle:../../etc'), false); assert.ok(DOODLE_NAMES.length >= 30);
  const spec: any = cleanSpec({ title: 'x', visual: 'doodle', scenes: [{ lines: ['một hai'], panels: [{ image: 'doodle:ReadingDoodle', line: 0 }, { image: 'doodle:Nope' }] }] }, 'u1');
  assert.equal(spec.scenes[0].panels[0].image, 'doodle:ReadingDoodle'); assert.equal(spec.scenes[0].panels[1].image, '');
});
