// Starts the render machine (a Cloud Run Job) when videos are queued.
// Auth: a Google service-account key allowed only to run that job (roles/run.invoker).
import type { Env } from './util.ts';

let cached: { token: string; until: number } | null = null;

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Signed JWT assertion for Google's OAuth token endpoint (RS256). */
export async function signAssertion(key: { client_email: string; private_key: string }, now = Math.floor(Date.now() / 1000)) {
  const pem = key.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const k = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({
    iss: key.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', k, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

export async function accessToken(env: Env) {
  if (cached && cached.until > Date.now()) return cached.token;
  const key = JSON.parse(env.GCP_TRIGGER_KEY!);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await signAssertion(key) }),
  });
  if (!res.ok) throw new Error(`Google token HTTP ${res.status}`);
  const j: any = await res.json();
  cached = { token: j.access_token, until: Date.now() + (j.expires_in - 120) * 1000 };
  return cached.token;
}

/** Run the job once; it renders every queued video and exits. Safe to call repeatedly. */
export async function startRunner(env: Env) {
  if (!env.GCP_TRIGGER_KEY || !env.GCP_PROJECT || !env.GCP_REGION || !env.GCP_JOB) return false;
  const url = `https://run.googleapis.com/v2/projects/${env.GCP_PROJECT}/locations/${env.GCP_REGION}/jobs/${env.GCP_JOB}:run`;
  const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${await accessToken(env)}`, 'content-type': 'application/json' }, body: '{}' });
  if (!res.ok) console.error('startRunner', res.status, (await res.text()).slice(0, 300));
  return res.ok;
}
