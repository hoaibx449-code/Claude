import { test } from 'node:test';
import { database } from './support/sqlite.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig } from '../web/src/settings.ts';
import { sepayWebhook } from '../web/src/plans.ts';

test('bank payments credit atomically, once per transaction, only to the configured account', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'payments-'));
  try {
    const DB = database(join(dir, 'db.sqlite'));
    const env: any = { DB, SEPAY_API_KEY: 'test-only', DAILY_SCRIPTS: '20', DAILY_IMAGES: '60', DAILY_RENDERS: '5' };
    env.config = defaultConfig(env);
    env.config.payment = { ...env.config.payment, enabled: true, account: '123456' };
    const plan = env.config.plans.find((p: any) => p.price > 0);
    const rc: any = { log() {}, wait() {} };
    const order = async (code: string) => DB.prepare("INSERT INTO orders(code,user_id,plan,amount,status,created_at) VALUES(?, 'u', ?, ?, 'pending', ?)").bind(code, plan.id, plan.price, Date.now()).run();
    const pay = (code: string, id: number, extra: any = {}) => sepayWebhook(new Request('https://test/api/sepay/webhook', { method: 'POST', headers: { authorization: 'Apikey test-only' }, body: JSON.stringify({ id, transferType: 'in', accountNumber: '123456', transferAmount: plan.price, content: code, ...extra }) }), env, rc);
    await order('NVABCDEF');
    await pay('NVABCDEF', 1, { accountNumber: 'wrong' });
    await pay('NVABCDEF', 1, { transferType: 'out' });
    await pay('NVABCDEF', 1, { transferAmount: plan.price - 1 });
    assert.equal(await DB.prepare('SELECT * FROM user_plans').first(), null);
    await Promise.all([pay('NVABCDEF', 1), pay('NVABCDEF', 1)]);
    const first = await DB.prepare('SELECT * FROM user_plans').first();
    assert.ok(first.expires_at > Date.now());
    await pay('NVABCDEF', 1);
    assert.equal((await DB.prepare('SELECT * FROM user_plans').first()).expires_at, first.expires_at);
    await order('NVGHJKLM');
    await pay('NVGHJKLM', 1); // same bank transfer cannot pay a different order
    assert.equal((await DB.prepare("SELECT status FROM orders WHERE code='NVGHJKLM'").first()).status, 'pending');
    await pay('NVGHJKLM', 2);
    assert.equal((await DB.prepare('SELECT * FROM user_plans').first()).expires_at, first.expires_at + (plan.days || 30) * 86400000);
    await order('NVNPQRST');
    await DB.prepare("UPDATE orders SET created_at=0 WHERE code='NVNPQRST'").run();
    await pay('NVNPQRST', 3);
    assert.equal((await DB.prepare("SELECT status FROM orders WHERE code='NVNPQRST'").first()).status, 'pending');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a yearly order is priced at the yearly price and grants 365 days', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'payments-y-'));
  try {
    const { planOrder } = await import('../web/src/plans.ts');
    const DB = database(join(dir, 'db.sqlite'));
    const env: any = { DB, SEPAY_API_KEY: 'test-only', DAILY_SCRIPTS: '20', DAILY_IMAGES: '60', DAILY_RENDERS: '5' };
    env.config = defaultConfig(env);
    env.config.payment = { ...env.config.payment, enabled: true, account: '123456' };
    const plan = env.config.plans.find((p: any) => p.price > 0);
    assert.equal(planOrder(env.config.plans, plan.id + ':year'), null); // no yearly price set: not for sale by year
    plan.yearPrice = 1_990_000;
    const y = planOrder(env.config.plans, plan.id + ':year')!;
    assert.equal(y.price, 1_990_000); assert.equal(y.days, 365); assert.equal(planOrder(env.config.plans, plan.id + ':week'), null);
    await DB.prepare("INSERT INTO orders(code,user_id,plan,amount,status,created_at) VALUES('NVYEARAB','u',?,?, 'pending', ?)").bind(plan.id + ':year', y.price, Date.now()).run();
    const t0 = Date.now();
    await sepayWebhook(new Request('https://test/api/sepay/webhook', { method: 'POST', headers: { authorization: 'Apikey test-only' }, body: JSON.stringify({ id: 9, transferType: 'in', accountNumber: '123456', transferAmount: y.price, content: 'NVYEARAB' }) }), env, { log() {}, wait() {} } as any);
    const up = await DB.prepare('SELECT * FROM user_plans').first();
    assert.equal(up.plan, plan.id);
    assert.ok(Math.abs(up.expires_at - (t0 + 365 * 86400000)) < 60_000);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
