export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID?: string;
  RUNNER_TOKEN?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  /** Ollama (self-hosted or Ollama Cloud): server address, optional key, models */
  OLLAMA_API_KEY?: string;
  OLLAMA_URL?: string;
  OLLAMA_TEXT_MODEL?: string;
  OLLAMA_TEXT_FALLBACK?: string;
  /** comma-separated text providers in the order they are tried */
  AI_ORDER?: string;
  OPENAI_TEXT_MODEL: string;
  /** comma-separated models tried when the main one fails */
  OPENAI_TEXT_FALLBACK?: string;
  GEMINI_TEXT_FALLBACK?: string;
  OPENAI_IMAGE_MODEL: string;
  OPENAI_IMAGE_QUALITY?: string;
  GEMINI_TEXT_MODEL: string;
  GEMINI_IMAGE_MODEL: string;
  DAILY_SCRIPTS: string;
  DAILY_IMAGES: string;
  DAILY_RENDERS: string;
  /** Cloud Run Job that renders videos (see web/src/gcp.ts). */
  GCP_TRIGGER_KEY?: string;
  GCP_PROJECT?: string;
  GCP_REGION?: string;
  GCP_JOB?: string;
  /** Local development only: enables /api/auth/dev on localhost. */
  DEV_LOGIN?: string;
  /** Explicit owner for initial production bootstrap; never first-visitor ownership. */
  ADMIN_EMAIL?: string;
}

/** Error whose message is safe to show to the user. */
export class HttpError extends Error {
  status: number;
  /** extra fields for the page (e.g. which plan unlocks the blocked option) */
  extra?: Record<string, unknown>;
  constructor(status: number, message: string, extra?: Record<string, unknown>) { super(message); this.status = status; this.extra = extra; }
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

export async function readBytes(req:Request,maxBytes:number):Promise<Uint8Array> {
  if (Number(req.headers.get('content-length')) > maxBytes) throw new HttpError(413, 'Dữ liệu gửi lên quá lớn.');
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, 'Dữ liệu gửi lên quá lớn.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function body<T = any>(req: Request, maxBytes = 200_000): Promise<T> {
  const text = new TextDecoder().decode(await readBytes(req,maxBytes));
  try {
    const value = JSON.parse(text || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
    return value;
  } catch { throw new HttpError(400, 'Dữ liệu không hợp lệ.'); }
}

export const today = () => new Date().toISOString().slice(0, 10);

/** Count one use of `kind` today; refuse when the daily limit is reached. */
export async function useQuota(env: Env, userId: string, kind: 'feed-test' | 'bridge' | 'ocr' | 'hunter' | 'hunter-report' | 'hunter-ai' | 'script' | 'image' | 'render' | 'events' | 'zalo' | 'try' | 'upload' | 'like' | 'voice' | 'voiceup' | 'chat', limit: number) {
  if (!Number.isFinite(limit) || limit < 1) throw new HttpError(429, 'Gói hiện tại không có lượt sử dụng tính năng này.');
  const day = today();
  const row = await env.DB.prepare(
    `INSERT INTO usage (user_id, day, kind, n) VALUES (?, ?, ?, 1)
     ON CONFLICT (user_id, day, kind) DO UPDATE SET n = n + 1 WHERE n < ?
     RETURNING n`,
  ).bind(userId, day, kind, limit).first<{ n: number }>();
  if (!row) {
    const names = { ocr:'đọc chữ từ ảnh', hunter:'chia sẻ prompt', 'hunter-report':'báo cáo prompt', 'hunter-ai':'phân loại prompt', script: 'viết kịch bản', image: 'vẽ ảnh AI', render: 'dựng video', events: 'ghi nhận', zalo: 'nhắn Zalo', try: 'xem thử', chat: 'hỏi trợ lý' } as Record<string, string>;
    throw new HttpError(429, `Bạn đã dùng hết lượt ${names[kind]} hôm nay (${limit} lượt). Thử lại vào ngày mai.`);
  }
}

export async function refundQuota(env: Env, userId: string, kind: string) {
  await env.DB.prepare('UPDATE usage SET n = MAX(0, n - 1) WHERE user_id = ? AND day = ? AND kind = ?').bind(userId, today(), kind).run();
}
