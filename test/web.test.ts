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
  assert.deepEqual(Object.keys(c.visibility).sort(), ['style:kraft', 'style:oly']);
  assert.ok(!c.enabledStyles.includes('kraft') && !c.enabledStyles.includes('oly'));
  assert.ok(c.voices.some((v) => v.provider === 'free'), 'free voice always available');
  assert.equal(c.plans[0].price, 0, 'a free plan always exists');
  const pub = publicConfig(c) as any;
  assert.ok(!('costs' in pub) && !('admins' in pub) && !('promptExtra' in pub), 'internal settings stay private');
});

test('logs never keep secrets or images', () => {
  const s = JSON.stringify(summarize({ apiKey: 'sk-123', nested: { token: 'x', ok: 1 }, img: 'data:image/png;base64,AAAA', scenes: [1, 2, 3] }));
  assert.ok(!s.includes('sk-123') && !s.includes('AAAA'));
  assert.ok(s.includes('[3 cảnh]'));
});
