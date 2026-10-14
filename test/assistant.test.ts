import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { database } from './support/sqlite.ts';
import { defaultConfig } from '../web/src/settings.ts';
import { notifyOwner, webhookSecret, zaloWebhook } from '../web/src/zalo.ts';
import { sepayWebhook } from '../web/src/plans.ts';

async function fixture(run: (f: any) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'asst-')), orig = globalThis.fetch;
  try {
    const env: any = { DB: database(join(dir, 'db.sqlite')), RUNNER_TOKEN: 'r'.repeat(32), ZALO_BOT_TOKEN: 't', PUBLIC_URL: 'https://studio.test', GEMINI_API_KEY: 'g', GEMINI_TEXT_MODEL: 'gemini-3.5-flash', ADMIN_EMAIL: 'boss@shop.vn', SEPAY_API_KEY: 'sk', DAILY_SCRIPTS: '20', DAILY_IMAGES: '60', DAILY_RENDERS: '5' };
    env.config = defaultConfig(env); env.config.zalo.enabled = true;
    const sent: any[] = [], prompts: any[] = [], pending: any[] = [];
    let answer: any = { reply: 'Gói Chuyên nghiệp 199.000đ/tháng, 10 video mỗi ngày.', intent: 'chat', topic: '' };
    globalThis.fetch = (async (url: any, o: any) => {
      const u = String(url), b = o?.body ? JSON.parse(o.body) : {};
      if (u.includes('generativelanguage')) { prompts.push(b); return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(answer) }] } }] })); }
      if (u.endsWith('/sendMessage')) sent.push(b);
      return new Response(JSON.stringify({ ok: true, result: {} }));
    }) as any;
    const rc: any = { userId: null, channel: 'zalo', quiet: false, log() {}, wait(p: any) { pending.push(p); } };
    let n = 0;
    const say = async (text: string, chat = 'customer-abc123') => {
      await zaloWebhook(new Request('https://studio.test/api/zalo/webhook', { method: 'POST', headers: { 'x-bot-api-secret-token': await webhookSecret(env) }, body: JSON.stringify({ event_name: 'message.text.received', message: { message_id: 'm' + (++n), chat: { id: chat }, from: { display_name: 'Lan' }, text } }) }), env, rc);
      while (pending.length) await Promise.all(pending.splice(0));
    };
    await env.DB.prepare("INSERT INTO users (id, email, name, created_at) VALUES ('boss', 'boss@shop.vn', 'Chủ', 1)").run();
    await env.DB.prepare("INSERT INTO zalo_links (user_id, chat_id, name, linked_at, notify, prefs) VALUES ('boss', 'owner-chat', 'Chủ', 1, 1, '{}')").run();
    await run({ env, sent, prompts, say, setAnswer: (a: any) => { answer = a; } });
  } finally { globalThis.fetch = orig; rmSync(dir, { recursive: true, force: true }); }
}

test('the owner hears about orders on the Zalo linked to the admin account, even without CHUWEB', () => fixture(async (f) => {
  assert.equal(f.env.config.zalo.ownerChat, '');
  await notifyOwner(f.env, 'order', 'Đơn mới NVTEST01');
  assert.ok(f.sent.some((m: any) => m.chat_id === 'owner-chat' && /NVTEST01/.test(m.text)));
  const log = await f.env.DB.prepare("SELECT ok, data FROM events WHERE type = 'owner.notify'").first();
  assert.equal(log.ok, 1);
  // a paid order (SePay) reaches the owner too
  f.env.config.payment = { ...f.env.config.payment, enabled: true, account: '999' };
  const plan = f.env.config.plans.find((p: any) => p.price > 0);
  await f.env.DB.prepare("INSERT INTO orders(code,user_id,plan,amount,status,created_at) VALUES('NVPQRSTU','boss',?,?,'pending',?)").bind(plan.id, plan.price, Date.now()).run();
  await sepayWebhook(new Request('https://t/api/sepay/webhook', { method: 'POST', headers: { authorization: 'Apikey sk' }, body: JSON.stringify({ id: 1, transferType: 'in', accountNumber: '999', transferAmount: plan.price, content: 'NVPQRSTU' }) }), f.env, { log() {}, wait() {} } as any);
  assert.ok(f.sent.some((m: any) => m.chat_id === 'owner-chat' && /NVPQRSTU/.test(m.text)));
}));

test('a free question is answered by the assistant from the real plan prices and the chat history', () => fixture(async (f) => {
  await f.say('Gói nào rẻ nhất mà làm được 10 video một ngày vậy shop?');
  const r = f.sent.at(-1);
  assert.equal(r.chat_id, 'customer-abc123'); assert.match(r.text, /199\.000đ/);
  const sys = f.prompts[0].systemInstruction.parts[0].text;
  assert.match(sys, /Chuyên nghiệp: 199\.000đ\/tháng/); assert.match(sys, /chưa có tài khoản/);
  await f.say('Còn gói năm thì sao?');
  assert.match(f.prompts[1].contents[0].parts[0].text, /KHÁCH: Gói nào rẻ nhất/);
  assert.match(f.prompts[1].contents[0].parts[0].text, /BẠN: Gói Chuyên nghiệp/);
  assert.ok(!f.sent.some((m: any) => /chưa hiểu/.test(m.text)));
}));

test('a hard question goes to the owner with a code, and the owner answers with TL', () => fixture(async (f) => {
  f.setAnswer({ reply: 'Mình đã chuyển cho nhân viên, bạn chờ chút nhé.', intent: 'human', topic: '' });
  await f.say('Mình chuyển khoản rồi mà chưa thấy kích hoạt gói');
  const note = f.sent.find((m: any) => m.chat_id === 'owner-chat');
  assert.match(note.text, /Khách cần hỗ trợ \[abc123\]/);
  await f.say('TL abc123 Bạn gửi giúp mình ảnh chụp giao dịch nhé', 'owner-chat');
  assert.ok(f.sent.some((m: any) => m.chat_id === 'customer-abc123' && /ảnh chụp giao dịch/.test(m.text)));
}));

test('asking for a video in plain words queues it like TAO', () => fixture(async (f) => {
  f.setAnswer({ reply: 'Có ngay! Mình làm video về lãi kép cho bạn.', intent: 'make_video', topic: 'sức mạnh của lãi kép' });
  await f.say('làm giúp mình video về lãi kép với');
  const q = await f.env.DB.prepare("SELECT text, status FROM zalo_messages WHERE id = 'm1-tao'").first();
  assert.equal(q.text, 'TAO sức mạnh của lãi kép'); assert.equal(q.status, 'received');
}));

test('a refused AI key is skipped for a while instead of failing before every answer', async () => {
  const { textPlan, noteFailure } = await import('../web/src/ai.ts');
  const env: any = { GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'bad', GEMINI_TEXT_MODEL: 'gemini-3.5-flash', OPENAI_TEXT_MODEL: 'gpt-4o-mini' };
  assert.equal(textPlan(env, 'openai')[0][0], 'openai');
  noteFailure('openai', 'gpt-4o-mini', 401);
  assert.deepEqual(textPlan(env, 'openai').map(([p]) => p), ['gemini']);
});

test('polling answers messages alongside listening and shows "typing" first', () => fixture(async (f) => {
  const { pollZalo } = await import('../web/src/zalo.ts');
  f.env.config.zalo.receive = 'poll';
  const calls: string[] = []; let served = false;
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: any, o: any) => {
    const u = String(url), m = u.split('/').pop()!;
    calls.push(m);
    if (u.includes('generativelanguage')) { await new Promise((r) => setTimeout(r, 300)); return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ reply: 'Chào bạn!', intent: 'chat', topic: '' }) }] } }] })); }
    if (m === 'getUpdates') {
      if (!served) { served = true; return new Response(JSON.stringify({ ok: true, result: { event_name: 'message.text.received', message: { message_id: 'p1', chat: { id: 'c-poll' }, from: { display_name: 'A' }, text: 'Shop ơi cho hỏi' } } })); }
      await new Promise((r) => setTimeout(r, 200)); return new Response(JSON.stringify({ ok: false, error_code: 408, description: 'timeout' }), { status: 408 });
    }
    if (m === 'sendMessage') f.sent.push(JSON.parse(o.body));
    return new Response(JSON.stringify({ ok: true, result: {} }));
  }) as any;
  try {
    const r = await pollZalo(f.env, { log() {}, wait() {} } as any, 4000);
    assert.equal(r.polled, 1);
    assert.ok(calls.indexOf('sendChatAction') < calls.lastIndexOf('sendMessage'));
    assert.ok(f.sent.some((m: any) => m.chat_id === 'c-poll' && m.text === 'Chào bạn!'));
    // listening went on while the AI was answering
    assert.ok(calls.filter((c) => c === 'getUpdates').length >= 2);
  } finally { globalThis.fetch = orig; }
}));
