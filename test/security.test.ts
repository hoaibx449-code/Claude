import { test } from 'node:test';
import assert from 'node:assert/strict';
import { body, useQuota } from '../web/src/util.ts';
import { isAdmin, defaultConfig } from '../web/src/settings.ts';
import { fitVoice } from '../src/node/tts.ts';

const env: any = { DAILY_SCRIPTS: '20', DAILY_IMAGES: '60', DAILY_RENDERS: '5' };
test('zero, negative and invalid quotas refuse before touching the database', async () => {
  for (const limit of [0, -1, NaN, Infinity]) await assert.rejects(useQuota(env, 'u', 'image', limit), { status: 429 });
});
test('JSON limits count UTF-8 bytes, including chunked requests', async () => {
  const text = JSON.stringify({ text: 'Việt Nam'.repeat(20) });
  const bytes = new TextEncoder().encode(text);
  await assert.rejects(body(new Request('https://test', { method: 'POST', body: text }), text.length), { status: 413 });
  const stream = new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 10)); c.enqueue(bytes.slice(10)); c.close(); } });
  await assert.rejects(body(new Request('https://test', { method: 'POST', body: stream, duplex: 'half' } as any), 20), { status: 413 });
  assert.deepEqual(await body(new Request('https://test', { method: 'POST', body: text }), bytes.length), JSON.parse(text));
  for (const invalid of ['null', '[]', '1', '"hello"']) await assert.rejects(body(new Request('https://test', { method: 'POST', body: invalid })), { status: 400 });
});
test('initial production owner is explicit; the first visitor cannot become admin', async () => {
  const config = defaultConfig(env);
  const user = { id: 'google-user', email: 'owner@example.com', name: null, picture: null };
  assert.equal(await isAdmin(env, config, user), false);
  assert.equal(await isAdmin({ ...env, ADMIN_EMAIL: 'OWNER@example.com' }, config, user), true);
  assert.equal(await isAdmin(env, config, { ...user, id: 'dev-1' }), false);
  assert.equal(await isAdmin({ ...env, DEV_LOGIN: '1' }, config, { ...user, id: 'dev-1' }), true);
  config.admins = ['other@example.com'];
  assert.equal(await isAdmin({ ...env, ADMIN_EMAIL: user.email }, config, user), false);
});
test('estimated continuous narration cues stay inside measured audio', () => {
  const spans = fitVoice(['Một.', 'Một câu dài hơn nhiều.'], 1.25);
  assert.equal(spans[0].start, 0);
  assert.equal(spans[0].end, spans[1].start);
  assert.equal(spans[1].end, 1.25);
  assert.ok(spans[1].end - spans[1].start > spans[0].end);
  assert.throws(() => fitVoice([], 1));
  assert.throws(() => fitVoice(['a'], NaN));
});
