// Google sign-in: the browser gets an ID token from Google Identity Services and
// posts it here. We verify its RS256 signature against Google's public keys,
// then issue our own session cookie. Only a hash of the session token is stored.
import { cookie, Env, HttpError, randomId, sha256 } from './util.ts';

const SESSION_DAYS = 7;
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

export interface User { id: string; email: string; name: string | null; picture: string | null }

let jwksCache: { keys: any[]; until: number } | null = null;
async function googleKeys(): Promise<any[]> {
  if (jwksCache && jwksCache.until > Date.now()) return jwksCache.keys;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) throw new HttpError(502, 'Không kết nối được Google, thử lại sau.');
  const maxAge = Number((res.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
  jwksCache = { keys: ((await res.json()) as any).keys, until: Date.now() + maxAge * 1000 };
  return jwksCache.keys;
}

function b64url(s: string) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export async function verifyGoogleToken(token: string, clientId: string, expectedNonce: string) {
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 8000) throw new HttpError(400, 'Thông tin Google không hợp lệ.');
  const header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
  if (header.alg !== 'RS256') throw new HttpError(400, 'Thông tin Google không hợp lệ.');
  let jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) { jwksCache = null; jwk = (await googleKeys()).find((k) => k.kid === header.kid); }
  if (!jwk) throw new HttpError(401, 'Không xác thực được tài khoản Google.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new HttpError(401, 'Không xác thực được tài khoản Google.');
  const c = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  const now = Date.now() / 1000;
  if (!ISSUERS.includes(c.iss) || c.aud !== clientId || !(c.exp > now) || !(c.iat < now + 300)
    || c.email_verified !== true || !c.sub || !c.email || c.nonce !== expectedNonce) {
    throw new HttpError(401, 'Không xác thực được tài khoản Google.');
  }
  return { id: String(c.sub), email: String(c.email).toLowerCase(), name: c.name ?? null, picture: c.picture ?? null };
}

/** One-time nonce bound to this sign-in attempt; stored until used or expired. */
export async function newNonce(env: Env) {
  const nonce = randomId(16);
  await env.DB.prepare('INSERT INTO used_nonces (nonce, expires_at) VALUES (?, ?)').bind('pending:' + nonce, Date.now() + 10 * 60_000).run();
  return nonce;
}
export async function consumeNonce(env: Env, nonce: string) {
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new HttpError(400, 'Phiên đăng nhập không hợp lệ, tải lại trang.');
  const r = await env.DB.prepare('DELETE FROM used_nonces WHERE nonce = ? AND expires_at > ? RETURNING nonce').bind('pending:' + nonce, Date.now()).first();
  if (!r) throw new HttpError(400, 'Phiên đăng nhập đã hết hạn, tải lại trang rồi đăng nhập lại.');
}

export async function startSession(env: Env, u: User) {
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture`,
  ).bind(u.id, u.email, u.name, u.picture, Date.now()).run();
  const token = randomId(32);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), u.id, Date.now() + SESSION_DAYS * 86400_000).run();
  // opportunistic cleanup
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run();
  await env.DB.prepare('DELETE FROM used_nonces WHERE expires_at < ?').bind(Date.now()).run();
  return `sid=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export async function currentUser(env: Env, req: Request): Promise<User | null> {
  const token = cookie(req, 'sid');
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.picture FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(await sha256(token), Date.now()).first<User>();
}

export async function endSession(env: Env, req: Request) {
  const token = cookie(req, 'sid');
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}
