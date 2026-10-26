import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { database } from './support/sqlite.ts';
import { charge, mergeText, refundJob, settle } from '../web/src/ink.ts';
import { defaultConfig } from '../web/src/settings.ts';

const day = () => new Date().toISOString().slice(0, 10);

test('one request id takes one render; a failure gives it back once, a delivered video keeps it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-'));
  try {
    const DB = database(join(dir, 'db.sqlite'));
    const env: any = { DB, DAILY_RENDERS: '5' }; env.config = defaultConfig(env);
    const user: any = { id: 'u1', email: 'someone@example.com' };
    const used = async () => ((await DB.prepare("SELECT n FROM usage WHERE user_id = 'u1' AND kind = 'render'").first()) as any)?.n || 0;
    assert.equal(await charge(env, user, 'a'.repeat(24), 'new', 'req-12345678'), null);
    assert.equal(await charge(env, user, 'b'.repeat(24), 'new', 'req-12345678'), 'a'.repeat(24)); // double click: same video
    assert.equal(await used(), 1);
    await refundJob(env, { id: 'a'.repeat(24), user_id: 'u1' });
    await refundJob(env, { id: 'a'.repeat(24), user_id: 'u1' });
    assert.equal(await used(), 0);
    assert.equal(await charge(env, user, 'c'.repeat(24), 'new', 'req-87654321'), null);
    await settle(env, 'c'.repeat(24));
    await refundJob(env, { id: 'c'.repeat(24), user_id: 'u1' }); // delivered: nothing to give back
    assert.equal(await used(), 1);
    const row: any = await DB.prepare('SELECT state, day FROM ink_ledger WHERE job_id = ?').bind('c'.repeat(24)).first();
    assert.deepEqual([row.state, row.day], ['charged', day()]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a scene edit changes only words already drawn and objects the engine knows', () => {
  const v = { layout: 'before_after', before: { title: 'Cũ', prop: 'clock', label: 'a' }, after: { title: 'Mới', prop: 'coin' }, items: ['x', 'y'] };
  const out = mergeText(v, { layout: 'hero', before: { title: 'Trước đây', prop: 'not-a-prop', extra: 'no' }, after: { prop: 'book' }, items: ['x2'] });
  assert.deepEqual(out, { layout: 'before_after', before: { title: 'Trước đây', prop: 'clock', label: 'a' }, after: { title: 'Mới', prop: 'book' }, items: ['x2', 'y'] });
});
