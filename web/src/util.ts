export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID?: string;
  RUNNER_TOKEN?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENAI_TEXT_MODEL: string;
  OPENAI_IMAGE_MODEL: string;
  OPENAI_IMAGE_QUALITY?: string;
  GEMINI_TEXT_MODEL: string;
  GEMINI_IMAGE_MODEL: string;
  DAILY_SCRIPTS: string;
  DAILY_IMAGES: string;
  DAILY_RENDERS: string;
  /** Local development only: enables /api/auth/dev on localhost. */
  DEV_LOGIN?: string;
}

/** Error whose message is safe to show to the user. */
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function randomId(bytes = 16) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function sha256(text: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function cookie(req: Request, name: string) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

export async function body<T = any>(req: Request, maxBytes = 200_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Dữ liệu gửi lên quá lớn.');
  try { return JSON.parse(text || '{}'); } catch { throw new HttpError(400, 'Dữ liệu không hợp lệ.'); }
}

export const today = () => new Date().toISOString().slice(0, 10);

/** Count one use of `kind` today; refuse when the daily limit is reached. */
export async function useQuota(env: Env, userId: string, kind: 'script' | 'image' | 'render', limit: number) {
  const day = today();
  const row = await env.DB.prepare(
    `INSERT INTO usage (user_id, day, kind, n) VALUES (?, ?, ?, 1)
     ON CONFLICT (user_id, day, kind) DO UPDATE SET n = n + 1 WHERE n < ?
     RETURNING n`,
  ).bind(userId, day, kind, limit).first<{ n: number }>();
  if (!row) {
    const names = { script: 'viết kịch bản', image: 'vẽ ảnh AI', render: 'dựng video' };
    throw new HttpError(429, `Bạn đã dùng hết lượt ${names[kind]} hôm nay (${limit} lượt). Thử lại vào ngày mai.`);
  }
}

export async function refundQuota(env: Env, userId: string, kind: string) {
  await env.DB.prepare('UPDATE usage SET n = MAX(0, n - 1) WHERE user_id = ? AND day = ? AND kind = ?').bind(userId, today(), kind).run();
}
