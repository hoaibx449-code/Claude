import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushPublicKey, pushUser, validEndpoint } from '../web/src/push.ts';

/** A tiny stand-in for D1: the statements push.ts runs. */
function fakeDb() {
  const settings = new Map<string, string>(), subs = new Map<string, string>(), notes = new Map<string, any>();
  const prepare = (sql: string) => ({
    bind: (...a: any[]) => ({
      first: async () => (sql.includes("key = 'push:vapid'") ? (settings.has('push:vapid') ? { value: settings.get('push:vapid') } : null) : null),
      all: async () => ({ results: [...subs].filter(([, u]) => u === a[0]).map(([endpoint]) => ({ endpoint })) }),
      run: async () => {
        if (sql.startsWith('INSERT OR IGNORE INTO settings') && !settings.has('push:vapid')) settings.set('push:vapid', a[0]);
        if (sql.startsWith('INSERT INTO push_notes')) notes.set(a[0], { title: a[1] });
        if (sql.startsWith('DELETE FROM push_subs')) subs.delete(a[0]);
        return { meta: { changes: 1 } };
      },
    }),
    first: async () => (sql.includes("key = 'push:vapid'") && settings.has('push:vapid') ? { value: settings.get('push:vapid') } : null),
  });
  return { db: { prepare } as any, subs, notes };
}

const b64 = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

test('only real browser push services are accepted as endpoints', () => {
  assert.ok(validEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
  assert.ok(validEndpoint('https://web.push.apple.com/QWxhZGRpbg'));
  assert.ok(validEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'));
  assert.equal(validEndpoint('https://evil.example.com/hook'), false);
  assert.equal(validEndpoint('http://fcm.googleapis.com/x'), false);
});

test('a ready video wakes every device with a VAPID-signed, empty push; expired devices are forgotten', async () => {
  const { db, subs, notes } = fakeDb();
  subs.set('https://fcm.googleapis.com/fcm/send/live', 'u1');
  subs.set('https://fcm.googleapis.com/fcm/send/gone', 'u1');
  subs.set('https://fcm.googleapis.com/fcm/send/redirect', 'u1');
  const env = { DB: db } as any, key = await pushPublicKey(env);
  assert.equal(b64(key).length, 65, 'uncompressed P-256 public key');
  const calls: any[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: any) => { assert.equal(init.redirect,'manual');calls.push({ url, init }); return new Response(null, { status: url.endsWith('gone') ? 410 : url.endsWith('redirect')?302:201 }); }) as any;
  try {
    const r = await pushUser(env, 'u1', { title: 'Video đã xong', body: 'x', url: '/#/p/1' });
    assert.deepEqual(r, { devices: 3, sent: 1 });
  } finally { globalThis.fetch = real; }
  assert.equal(notes.get('u1').title, 'Video đã xong');
  assert.ok(!subs.has('https://fcm.googleapis.com/fcm/send/gone'));
  // the JWT is signed by the published key, for the push service's origin
  const auth = calls[0].init.headers.Authorization as string, [, jwt, k] = auth.match(/^vapid t=([^,]+), k=(.+)$/)!;
  assert.equal(k, key);
  const [h, c, sig] = jwt.split('.');
  assert.equal(JSON.parse(b64(c).toString()).aud, 'https://fcm.googleapis.com');
  const pub = await crypto.subtle.importKey('raw', b64(key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64(sig), new TextEncoder().encode(`${h}.${c}`)));
  assert.equal(calls[0].init.headers['Content-Length'], '0');
});
