// Notifications on the phone or computer when a video is ready (Web Push), with no third party:
// Android and desktop browsers, and iPhone when the site is added to the Home Screen (iOS 16.4+).
// Pushes carry no payload, so no message encryption is needed: the push only wakes the service
// worker, which asks the site what to show (/api/push/latest). The VAPID key pair is created on
// first use and kept in the settings table.
import type { Env } from './util.ts';

const b64u = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const utf8 = (s: string) => new TextEncoder().encode(s);

/** Push services the browsers use (subscriptions to anything else are refused). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export const validEndpoint = (e: unknown) => {
  try { const u = new URL(String(e)); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port==='443') && !u.hash && String(e).length <= 800 && PUSH_HOSTS.some((r) => r.test(u.hostname)); } catch { return false; }
};

let cached: { pub: string; key: CryptoKey } | null = null;
async function vapid(env: Env) {
  if (cached) return cached;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'push:vapid'").first<any>();
  let v: { jwk: JsonWebKey; pub: string } | null = null;
  try { v = row ? JSON.parse(row.value) : null; } catch {}
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    v = { jwk: await crypto.subtle.exportKey('jwk', kp.privateKey) as JsonWebKey, pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey) as ArrayBuffer) };
    // the first writer wins, so two requests at once agree on one key
    await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('push:vapid', ?, ?)").bind(JSON.stringify(v), Date.now()).run();
    const again = await env.DB.prepare("SELECT value FROM settings WHERE key = 'push:vapid'").first<any>();
    v = JSON.parse(again.value);
  }
  cached = { pub: v!.pub, key: await crypto.subtle.importKey('jwk', v!.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']) };
  return cached;
}

/** The public key the browser subscribes with. */
export async function pushPublicKey(env: Env) { return (await vapid(env)).pub; }

async function authHeader(env: Env, endpoint: string, contact: string) {
  const { pub, key } = await vapid(env);
  const head = b64u(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contact })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${pub}`;
}

export interface PushNote { title: string; body: string; url: string }

/** Wake every device of a user; the newest note is what the notification shows. */
export async function pushUser(env: Env, userId: string, note: PushNote, contact = 'mailto:hotro@netve.studio') {
  await env.DB.prepare('INSERT INTO push_notes (user_id, title, body, url, ts) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET title = excluded.title, body = excluded.body, url = excluded.url, ts = excluded.ts')
    .bind(userId, note.title.slice(0, 120), note.body.slice(0, 240), note.url.slice(0, 300), Date.now()).run();
  const subs = (await env.DB.prepare('SELECT endpoint FROM push_subs WHERE user_id = ?').bind(userId).all<any>()).results;
  let sent = 0;
  for (const s of subs) {
    if(!validEndpoint(s.endpoint))continue;
    try {
      const res = await fetch(s.endpoint, { method: 'POST', redirect:'error', headers: { TTL: '86400', Urgency: 'high', 'Content-Length': '0', Authorization: await authHeader(env, s.endpoint, contact) }, signal: AbortSignal.timeout(8000) });
      if (res.status === 404 || res.status === 410) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run();
      else if (res.ok) sent++;
    } catch {}
  }
  return { devices: subs.length, sent };
}
