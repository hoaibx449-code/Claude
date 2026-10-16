import { composeLook } from '../web/src/compose.ts';
// Server-side logic that needs no Cloudflare runtime: intent detection, free scene design,
// spec validation, settings cleaning, log masking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectIntent } from '../web/src/intent.ts';
import { composeScene, splitScript } from '../web/src/compose.ts';
import { cleanSpec } from '../web/src/spec.ts';
import { cleanConfig, defaultConfig, publicConfig } from '../web/src/settings.ts';
import { summarize } from '../web/src/log.ts';
import { DEFAULT_TEMPLATES } from '../web/src/templates.ts';

const icons = JSON.parse(readFileSync('assets/icons/tabler.json', 'utf8'));
const env: any = { OPENAI_TEXT_MODEL: 'gpt-4o-mini', DAILY_SCRIPTS: '20', DAILY_IMAGES: '60', DAILY_RENDERS: '5' };

test('the kind of video is read from the words', () => {
  const kind = (id: string) => detectIntent(DEFAULT_TEMPLATES.find((t) => t.id === id)!.text);
  assert.equal(kind('chia-luong').format, 'listicle');
  assert.equal(kind('lai-kep').format, 'data');
  assert.equal(kind('ke-chuyen').format, 'story');
  assert.equal(kind('gioi-thieu-sp').format, 'sales');
  assert.equal(kind('lai-kep').niche, 'finance');
});

test('every template becomes a valid video without AI, with known icons and cues from its own words', () => {
  for (const t of DEFAULT_TEMPLATES) {
    for (const ratio of ['9:16', '16:9']) {
      const scenes = splitScript(t.text);
      const spec = cleanSpec({ visual: 'sketch', ratio, scenes: scenes.map((lines) => ({ lines })) }, 'u1');
      assert.ok(spec.scenes.length >= 3, t.id);
      spec.scenes.forEach((sc: any) => {
        assert.equal(sc.diagram.kind, 'sketch');
        const words = sc.lines.join(' ').toLowerCase();
        for (const it of sc.diagram.items) {
          if (it.t === 'icon') assert.ok(icons[it.name], `${t.id}: ${it.name}`);
          if (it.cue) assert.ok(words.includes(it.cue.toLowerCase()), `${t.id}: cue "${it.cue}" not in "${words}"`);
          if (it.t === 'text') assert.ok(!/^[:;,]/.test(it.text), it.text);
        }
      });
    }
  }
});

test('a list item gets its own number, other scenes do not', () => {
  const items = composeScene(['Thứ hai: ngủ đủ bảy tiếng mỗi đêm.'], true, 2, { format: 'listicle', index: 2, total: 5 });
  assert.ok(items.some((i: any) => i.t === 'text' && i.text === '2'));
  const other = composeScene(['Người giàu giữ tiền tốt hơn.'], true, 3, { format: 'listicle', index: 3, total: 5 });
  assert.ok(!other.some((i: any) => i.t === 'text' && /^\d+$/.test(i.text)));
});

test('settings: visibility, free voices and plans are always well formed', () => {
  const base = defaultConfig(env);
  const c = cleanConfig({ visibility: { 'style:kraft': 'hidden', 'style:oly': 'dev', 'bad key': 'hidden', 'feature:zalo': 'nope' }, voices: [{ provider: 'everai', code: 'vi_x_y', label: 'X' }], plans: [{ id: 'pro', name: 'Pro', price: 100 }] }, base);
  // settings saved before the story animation existed hide the old stick-figure story once
  assert.deepEqual(Object.keys(c.visibility).sort(), ['look:director', 'look:doc', 'look:illustrated', 'look:story', 'look:whiteboard', 'style:kraft', 'style:oly']);
  assert.equal(c.defaults.look, 'act');
  const again = cleanConfig({ ...c, visibility: { 'style:kraft': 'hidden' }, defaults: { ...c.defaults, look: 'kinetic' } }, base);
  assert.deepEqual(Object.keys(again.visibility), ['style:kraft'], 'an admin who shows it again keeps it shown');
  assert.equal(again.defaults.look, 'kinetic');
  assert.ok(!c.enabledStyles.includes('kraft') && !c.enabledStyles.includes('oly'));
  assert.ok(c.voices.some((v) => v.provider === 'free'), 'free voice always available');
  assert.equal(c.plans[0].price, 0, 'a free plan always exists');
  const pub = publicConfig(c) as any;
  assert.ok(!('costs' in pub) && !('admins' in pub) && !('promptExtra' in pub) && !('briefs' in pub), 'internal settings stay private');
});

test('logs never keep secrets or images', () => {
  const s = JSON.stringify(summarize({ apiKey: 'sk-123', nested: { token: 'x', ok: 1 }, img: 'data:image/png;base64,AAAA', scenes: [1, 2, 3] }));
  assert.ok(!s.includes('sk-123') && !s.includes('AAAA'));
  assert.ok(s.includes('[3 cảnh]'));
});

test('new styles and genres reach installs saved before they existed; length cap is clamped', () => {
  const base = defaultConfig({} as any);
  const c = cleanConfig({ enabledStyles: ['sunset', 'neon'], visibility: { 'style:neon': 'hidden' }, limits: { maxSeconds: 99999 }, defaults: { mode: 'kinetic' } }, base);
  for (const k of ['cosmos', 'manim', 'bold', 'whiteboard']) assert.ok(c.enabledStyles.includes(k), k);
  assert.ok(!c.enabledStyles.includes('neon'));
  assert.equal(c.limits.maxSeconds, 1800);
  assert.equal(c.defaults.mode, 'kinetic');
  assert.equal(publicConfig(c).limits.maxSeconds, 1800);
});

test('a project keeps only its owner\'s pictures, valid QR links and its genre', () => {
  const mine = 'r2:up/u1/' + 'a'.repeat(24) + '.jpg', theirs = 'r2:up/u2/' + 'b'.repeat(24) + '.jpg';
  const spec: any = cleanSpec({ visual: 'sketch', ratio: '9:16', mode: 'motion', media: { nv: mine, x: theirs }, character: 'nv', intro: { title: 'Tiêu đề', icon: 'rocket' },
    scenes: [{ lines: ['Mua ngay.'], diagram: { kind: 'sketch', items: [{ t: 'image', src: 'nv', x: 50, y: 50 }, { t: 'image', src: 'x', x: 50, y: 50 }, { t: 'qr', text: 'https://shope.ee/a', x: 50, y: 80 }, { t: 'qr', text: 'javascript:alert(1)', x: 50, y: 80 }, { t: 'chart', kind: 'plot', fn: 'exp', x: 50, y: 50 }] } }] }, 'u1');
  assert.deepEqual(spec.media, { nv: mine });
  assert.equal(spec.character, 'nv');
  assert.equal(spec.mode, 'motion');
  assert.equal(spec.intro.title, 'Tiêu đề');
  assert.deepEqual(spec.scenes[0].diagram.items.map((i: any) => i.t), ['image', 'qr', 'chart']);
});

test('custom formats from the training page: cleaned, and only released ones are public', () => {
  const base = defaultConfig(env);
  const c = cleanConfig({ rev: 2, briefs: { act: 'Riêng cho act', nope: 'x' }, formats: [
    { id: 'ke-sach', name: 'Kể sách', base: 'act', brief: 'Kể như review sách', stage: 'live', note: 'Dòng đầu\nchi tiết' },
    { id: 'thu', name: 'Thử', base: 'doc', stage: 'test' }, { id: 'BAD ID', name: 'x' }, { id: 'y', name: '' },
  ] }, base);
  assert.deepEqual(Object.keys(c.briefs), ['act']);
  assert.deepEqual(c.formats.map((f) => [f.id, f.base, f.stage]), [['ke-sach', 'act', 'live'], ['thu', 'act', 'test']]);
  const pub = publicConfig(c) as any;
  assert.deepEqual(pub.formats, [{ id: 'f:ke-sach', name: 'Kể sách', base: 'act', note: 'Dòng đầu' }]);
});


test('format audit migrates incomplete formats out of creation, preserves projects and allows explicit re-enabling', () => {
  const base = defaultConfig(env);
  const retired = ['director', 'whiteboard', 'illustrated', 'doc', 'story'];
  const old = cleanConfig({ rev: 2, visibility: {}, formats: [{id:'image-mode', name:'Ảnh', base:'illustrated', stage:'live'}] }, base);
  for (const k of retired) assert.equal(old.visibility['look:' + k], 'hidden');
  assert.equal(old.rev, 3);
  assert.equal(publicConfig(old).formats.length, 0);
  assert.ok(!old.visibility['look:act']);
  const enabled = cleanConfig({ ...old, visibility: { ...old.visibility, 'look:director': 'on' } }, base);
  assert.equal(enabled.visibility['look:director'], undefined);
  const existing = cleanSpec({ look: 'director', scenes: [{ lines: ['Giữ dự án cũ.'] }] }, 'u');
  assert.equal(existing.look, 'director');
});

test('comparison never invents good/bad judgments when the script does not state them', () => {
  const c = composeLook({look:'split', scenes:[{lines:['Trà có hương nhẹ.', 'Cà phê có hương đậm.']}]});
  assert.deepEqual(c.sides, {a:'Bên A', b:'Bên B'});
});
