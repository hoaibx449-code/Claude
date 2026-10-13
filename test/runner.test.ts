import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { database } from './support/sqlite.ts';
import { runner } from '../web/src/worker.ts';
import { storedVideoKey, videoKey } from '../web/src/media.ts';
import { defaultConfig } from '../web/src/settings.ts';

test('reclaimed jobs reject stale updates and publish only artifacts from the winning lease', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'lease-'));
 try {
  const DB = database(join(dir, 'db.sqlite'));
  const objects = new Map<string, Uint8Array>();
  const env: any = { DB, RUNNER_TOKEN: 't'.repeat(32), DAILY_SCRIPTS: '20', DAILY_IMAGES: '60', DAILY_RENDERS: '5', BUCKET: {
   async put(key: string, stream: ReadableStream) { objects.set(key, new Uint8Array(await new Response(stream).arrayBuffer())); },
   async head(key: string) { return objects.has(key) ? { size: objects.get(key)!.length } : null; },
  } };
  env.config = defaultConfig(env);
  const rc: any = { log() {}, wait() {} };
  const id = 'a'.repeat(24), spec = { scenes: [{ lines: ['demo'], panels: [] }] };
  await DB.prepare("INSERT INTO jobs(id,project_id,user_id,status,spec,created_at) VALUES(?,'p','u','queued',?,?)").bind(id, JSON.stringify(spec), Date.now()).run();
  await DB.prepare("INSERT INTO usage(user_id,day,kind,n) VALUES('u',?,'render',1)").bind(new Date().toISOString().slice(0,10)).run();
  const call = (sub: string, lease = '', data: any = {}, method = 'POST') => runner(new Request('https://test/api/runner/' + sub, { method, headers: { authorization: 'Bearer ' + env.RUNNER_TOKEN, 'x-nv-lease': lease }, body: method === 'PUT' ? 'file-data' : JSON.stringify(data) }), env, sub, rc);
  const first = (await (await call('claim')).json() as any).job;
  assert.match(first.lease, /^lease-[a-f0-9]{32}$/);
  await DB.prepare('UPDATE jobs SET started_at=0 WHERE id=?').bind(id).run();
  const second = (await (await call('claim')).json() as any).job;
  assert.notEqual(first.lease, second.lease);
  await call(`jobs/${id}/progress`, second.lease, { progress: 0, phase: 'voice', message: 'Chuẩn bị lời đọc: cảnh 1/2' });
  assert.equal((await DB.prepare('SELECT phase FROM job_progress WHERE job_id=?').bind(id).first()).phase,'voice');
  for (const sub of ['progress', 'done', 'fail']) await assert.rejects(call(`jobs/${id}/${sub}`, first.lease), { status: 409 });
  await assert.rejects(call(`jobs/${id}/video`, first.lease, {}, 'PUT'), { status: 409 });
  await call(`jobs/${id}/video`, second.lease, {}, 'PUT');
  await assert.rejects(call(`jobs/${id}/done`, second.lease), { status: 400 });
  await call(`jobs/${id}/srt`, second.lease, {}, 'PUT');
  assert.equal((await call(`jobs/${id}/done`, second.lease)).status,200);
  const key = await storedVideoKey(env, 'u', id, 'mp4');
  assert.equal(key, videoKey('u',id,'mp4',second.lease));
  assert.ok(objects.has(key));
  // Even a slow stale upload that finishes late writes an unreachable generation.
  objects.set(videoKey('u',id,'mp4',first.lease), new Uint8Array([0]));
  assert.equal((objects.get(await storedVideoKey(env,'u',id,'mp4'))!).length,9);
  assert.equal((await call(`jobs/${id}/done`, second.lease)).status,200);
  await assert.rejects(call(`jobs/${id}/fail`, second.lease), { status: 409 });
  assert.equal((await DB.prepare("SELECT n FROM usage WHERE user_id='u'").first()).n,1);
  assert.equal(videoKey('u',id,'mp4','old-hostname'),`video/u/${id}.mp4`);
 } finally { rmSync(dir,{recursive:true,force:true}); }
});
