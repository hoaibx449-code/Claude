// Site settings edited on the admin page (#/admin). Stored in D1 as one JSON document plus
// encrypted API keys. Defaults below are only starting values: every name shown to users
// can be renamed by the admin, and keys entered there override the Worker secrets.
import { Env, HttpError } from './util.ts';
import type { User } from './auth.ts';

export const SECRET_NAMES = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'EVERAI_API_KEY', 'GOOGLE_TTS_API_KEY', 'ELEVENLABS_API_KEY'] as const;
export type SecretName = (typeof SECRET_NAMES)[number];
/** Keys the render machine needs (voices); the Worker uses the AI ones itself. */
const RUNNER_SECRETS: SecretName[] = ['EVERAI_API_KEY', 'GOOGLE_TTS_API_KEY', 'ELEVENLABS_API_KEY'];

export const STYLE_KEYS = ['whiteboard', 'chalkboard', 'oly', 'kraft', 'pencil', 'blueprint', 'ricepaper', 'notebook'] as const;
export const TOOL_KEYS = ['marker', 'chalk', 'fountain', 'colormarker', 'pencil', 'technical', 'brush'] as const;
export const KIND_KEYS = ['sketch', 'bars', 'flow', 'compare', 'steps', 'number', 'statement', 'stick'] as const;
export const VISUAL_KEYS = ['sketch', 'diagram', 'mix', 'images'] as const;
export const SOURCE_KEYS = ['topic', 'mine-ai', 'mine-free'] as const;
export const ACTION_KEYS = ['idle', 'walk', 'run', 'wave', 'think', 'cheer', 'sad', 'point', 'shrug', 'jump'] as const;
export const AI_KEYS = ['openai', 'gemini'] as const;

export interface Voice { provider: 'everai' | 'google' | 'elevenlabs'; code: string; label: string }

export interface Config {
  brand: { name: string; accent: string; tagline: string };
  labels: {
    styles: Record<string, string>; tools: Record<string, string>; kinds: Record<string, string>;
    visual: Record<string, string>; actions: Record<string, string>; ai: Record<string, string>; sources: Record<string, string>;
  };
  /** Ways to start a video the users may pick (AI from a topic, own script + AI pictures, own script free). */
  enabledSources: string[];
  texts: Record<string, string>;
  enabledStyles: string[];
  defaults: { source: string; textAI: string; imageAI: string; style: string; visual: string; ratio: string; seconds: number; voice: string; channel: string; tone: string; subtitles: boolean };
  voices: Voice[];
  models: { openaiText: string; openaiImage: string; openaiImageQuality: string; geminiText: string; geminiImage: string };
  limits: { script: number; image: number; render: number };
  promptExtra: string;
  admins: string[];
}

/** Every piece of interface text the admin can rename. */
export const DEFAULT_TEXTS: Record<string, string> = {
  loginTitle: 'Video bàn tay vẽ, từ một câu chủ đề',
  loginText: 'AI viết kịch bản, bạn chỉnh từng câu, xem trước bàn tay vẽ ngay trên trang, rồi nhận video MP4 có giọng đọc và phụ đề.',
  homeTitle: 'Xưởng video của bạn',
  newVideo: 'Tạo video mới',
  source: 'Cách tạo', topic: 'Chủ đề', topicHint: 'Ví dụ: Vì sao lương mãi không tăng dù làm việc chăm chỉ?',
  script: 'Kịch bản của bạn', scriptHint: 'Dán kịch bản vào đây. Mỗi đoạn (cách nhau một dòng trống) được chia thành cảnh, mỗi cảnh 1-2 câu.',
  subsOnPicture: 'Phụ đề trên hình',
  textAI: 'AI viết kịch bản', duration: 'Thời lượng', ratio: 'Khung hình', visual: 'Kiểu hình', style: 'Phong cách',
  voice: 'Giọng đọc', tone: 'Giọng văn', toneHint: 'Ví dụ: gần gũi, hài hước nhẹ', channel: 'Tên kênh', episode: 'Số tập', episodeHint: 'Ví dụ: Tập 1',
  write: 'Viết kịch bản', writing: 'AI đang viết…',
  myVideos: 'Video đã tạo', noVideos: 'Chưa có video nào. Nhập chủ đề ở trên để tạo video đầu tiên.',
  allVideos: '← Tất cả video', render: 'Dựng video', drawAll: 'Vẽ tất cả bằng AI', post: 'Nội dung đăng bài',
  export: 'Xuất video', download: 'Tải video MP4', subtitles: 'Tải phụ đề', logout: 'Đăng xuất', admin: 'Quản trị',
};

export function defaultConfig(env: Env): Config {
  return {
    brand: { name: 'Nét Vẽ', accent: 'Studio', tagline: 'Tạo video bàn tay vẽ kèm thuyết minh tiếng Việt.' },
    labels: {
      styles: { whiteboard: 'Bảng trắng', chalkboard: 'Bảng phấn', oly: 'Vở ô ly', kraft: 'Giấy kraft', pencil: 'Sổ phác chì', blueprint: 'Bản vẽ kỹ thuật', ricepaper: 'Giấy dó mực tàu', notebook: 'Giấy kem kể chuyện' },
      tools: { marker: 'Bút dạ bảng', chalk: 'Phấn', fountain: 'Bút máy', colormarker: 'Bút dạ màu', pencil: 'Bút chì', technical: 'Bút kỹ thuật', brush: 'Bút lông' },
      kinds: { sketch: 'Bảng vẽ tự do (chữ + hình + mũi tên)', bars: 'Biểu đồ cột (mũi tên, đường cong)', flow: 'Chuỗi nguyên nhân → kết quả', compare: 'So sánh ✗ / ✓', steps: 'Các bước', number: 'Con số nổi bật', statement: 'Câu chốt', stick: 'Người que chuyển động' },
      visual: { sketch: 'Bảng vẽ tự do: chữ + hình + sơ đồ (như demo)', diagram: 'Sơ đồ theo mẫu', mix: 'Kết hợp sơ đồ + tranh AI', images: 'Tranh AI cho mọi cảnh' },
      sources: { topic: 'AI viết từ chủ đề', 'mine-ai': 'Kịch bản của tôi + AI minh hoạ', 'mine-free': 'Kịch bản của tôi + tự minh hoạ (miễn phí)' },
      actions: { idle: 'Đứng', walk: 'Đi bộ', run: 'Chạy', wave: 'Vẫy tay', think: 'Suy nghĩ', cheer: 'Ăn mừng', sad: 'Buồn', point: 'Chỉ tay', shrug: 'Nhún vai', jump: 'Nhảy' },
      ai: { openai: 'OpenAI', gemini: 'Gemini' },
    },
    texts: { ...DEFAULT_TEXTS },
    enabledStyles: [...STYLE_KEYS],
    enabledSources: [...SOURCE_KEYS],
    defaults: { source: 'topic', subtitles: false, textAI: 'gemini', imageAI: 'gemini', style: 'whiteboard', visual: 'sketch', ratio: '9:16', seconds: 45, voice: 'vi_female_thuytrang_mb', channel: '', tone: '' },
    voices: [
      ['vi_female_thuytrang_mb', 'Thùy Trang · nữ Bắc · nói chuyện'], ['vi_male_minhtriet_mb', 'Minh Triết · nam Bắc · sách nói'],
      ['vi_male_leduc_mb', 'Lê Đức · nam Bắc · kể chuyện'], ['vi_female_kimphuong_mb', 'Kim Phượng · nữ Bắc · kể chuyện'],
      ['vi_male_lehoang_mb', 'Lê Hoàng · nam Bắc · mạch lạc'], ['vi_male_vanduy_mb', 'Văn Duy · nam Bắc · bình luận'],
      ['vi_female_thuylinh_mb', 'Thùy Linh · nữ Bắc · podcast'], ['vi_female_hoaian_mb', 'Hoài An · nữ Bắc · đọc tin'],
      ['vi_male_minhkhang_mb', 'Minh Khang · nam Bắc · mạng xã hội'], ['vi_female_khanhlinh_mb', 'Khánh Linh · nữ Bắc · review'],
      ['vi_female_thuytien_mn', 'Thùy Tiên · nữ Nam · trò chuyện'], ['vi_female_hongngan_mn', 'Hồng Ngân · nữ Nam · nhẹ nhàng'],
      ['vi_male_tridung_mn', 'Trí Dũng · nam Nam · sách nói'], ['vi_male_thanhtrung_mn', 'Thành Trung · nam Nam · podcast'],
      ['vi_male_tuankiet_mn', 'Tuấn Kiệt · nam Nam · tin tức'], ['vi_male_vanduc_mn', 'Văn Đức · nam Nam · tự sự'],
    ].map(([code, label]) => ({ provider: 'everai' as const, code, label }))
      .concat([{ provider: 'google', code: 'vi-VN-Neural2-A', label: 'Google · nữ (Neural2 A)' }, { provider: 'google', code: 'vi-VN-Neural2-D', label: 'Google · nam (Neural2 D)' }] as Voice[]),
    models: {
      openaiText: env.OPENAI_TEXT_MODEL || 'gpt-4o-mini', openaiImage: env.OPENAI_IMAGE_MODEL || 'gpt-image-1', openaiImageQuality: env.OPENAI_IMAGE_QUALITY || 'medium',
      geminiText: env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash', geminiImage: env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
    },
    limits: { script: Number(env.DAILY_SCRIPTS) || 20, image: Number(env.DAILY_IMAGES) || 60, render: Number(env.DAILY_RENDERS) || 5 },
    promptExtra: '',
    admins: [],
  };
}

// ---- validation: stored config is always complete and well-formed
const str = (v: unknown, max: number, def: string) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : def);
const int = (v: unknown, lo: number, hi: number, def: number) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.round(Math.min(hi, Math.max(lo, Number(v)))) : def);
const pick = (v: unknown, list: readonly string[], def: string) => (list.includes(v as string) ? (v as string) : def);
const MODEL = /^[a-z0-9][a-z0-9.\-_:]{1,60}$/i;
function labels(v: any, keys: readonly string[], def: Record<string, string>, max = 60) {
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = str(v?.[k], max, def[k]) || def[k];
  return out;
}

export function cleanConfig(input: any, base: Config): Config {
  const i = input && typeof input === 'object' ? input : {};
  const L = i.labels || {}, d = i.defaults || {}, m = i.models || {}, lim = i.limits || {};
  const enabled = Array.isArray(i.enabledStyles) ? STYLE_KEYS.filter((k) => i.enabledStyles.includes(k)) : base.enabledStyles;
  const voices = (Array.isArray(i.voices) ? i.voices : base.voices)
    .map((v: any) => ({ provider: pick(v?.provider, ['everai', 'google', 'elevenlabs'], 'everai') as Voice['provider'], code: str(v?.code, 60, ''), label: str(v?.label, 80, '') }))
    .filter((v: Voice) => /^[A-Za-z0-9_-]{3,60}$/.test(v.code)).map((v: Voice) => ({ ...v, label: v.label || v.code })).slice(0, 80);
  const vs = voices.length ? voices : base.voices;
  const en = enabled.length ? enabled : [...STYLE_KEYS];
  return {
    brand: { name: str(i.brand?.name, 40, base.brand.name) || base.brand.name, accent: str(i.brand?.accent, 30, base.brand.accent), tagline: str(i.brand?.tagline, 160, base.brand.tagline) },
    labels: {
      styles: labels(L.styles, STYLE_KEYS, base.labels.styles), tools: labels(L.tools, TOOL_KEYS, base.labels.tools),
      kinds: labels(L.kinds, KIND_KEYS, base.labels.kinds), visual: labels(L.visual, VISUAL_KEYS, base.labels.visual, 80),
      actions: labels(L.actions, ACTION_KEYS, base.labels.actions), ai: labels(L.ai, AI_KEYS, base.labels.ai),
      sources: labels(L.sources, SOURCE_KEYS, base.labels.sources, 80),
    },
    enabledSources: (() => { const v = Array.isArray(i.enabledSources) ? SOURCE_KEYS.filter((k) => i.enabledSources.includes(k)) : base.enabledSources; return v.length ? v : ['mine-free']; })(),
    texts: labels(i.texts, Object.keys(DEFAULT_TEXTS), base.texts, 240),
    enabledStyles: en,
    defaults: {
      source: pick(d.source, SOURCE_KEYS, base.defaults.source), subtitles: typeof d.subtitles === 'boolean' ? d.subtitles : base.defaults.subtitles,
      textAI: pick(d.textAI, AI_KEYS, base.defaults.textAI), imageAI: pick(d.imageAI, AI_KEYS, base.defaults.imageAI),
      style: pick(d.style, en, en.includes(base.defaults.style) ? base.defaults.style : en[0]), visual: pick(d.visual, VISUAL_KEYS, base.defaults.visual),
      ratio: pick(d.ratio, ['9:16', '16:9'], base.defaults.ratio), seconds: int(d.seconds, 15, 180, base.defaults.seconds),
      voice: pick(d.voice, vs.map((v: Voice) => v.code), vs[0].code), channel: str(d.channel, 40, base.defaults.channel), tone: str(d.tone, 200, base.defaults.tone),
    },
    voices: vs,
    models: {
      openaiText: MODEL.test(m.openaiText) ? m.openaiText : base.models.openaiText, openaiImage: MODEL.test(m.openaiImage) ? m.openaiImage : base.models.openaiImage,
      openaiImageQuality: pick(m.openaiImageQuality, ['low', 'medium', 'high'], base.models.openaiImageQuality),
      geminiText: MODEL.test(m.geminiText) ? m.geminiText : base.models.geminiText, geminiImage: MODEL.test(m.geminiImage) ? m.geminiImage : base.models.geminiImage,
    },
    limits: { script: int(lim.script, 0, 1000, base.limits.script), image: int(lim.image, 0, 5000, base.limits.image), render: int(lim.render, 0, 500, base.limits.render) },
    promptExtra: str(i.promptExtra, 1500, base.promptExtra),
    admins: (Array.isArray(i.admins) ? i.admins : base.admins).map((e: unknown) => str(e, 100, '').toLowerCase()).filter((e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)).slice(0, 20),
  };
}

// ---- encrypted keys (AES-GCM, key derived from RUNNER_TOKEN; never returned to the browser)
async function cryptoKey(env: Env) {
  if (!env.RUNNER_TOKEN || env.RUNNER_TOKEN.length < 32) throw new HttpError(503, 'Thiếu RUNNER_TOKEN nên chưa lưu được khoá.');
  const raw = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.RUNNER_TOKEN), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('net-ve-settings'), info: new Uint8Array() }, raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function encrypt(env: Env, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(env), new TextEncoder().encode(text)));
  return b64(iv) + '.' + b64(ct);
}
export async function decrypt(env: Env, blob: string) {
  const [iv, ct] = blob.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await cryptoKey(env), unb64(ct)));
}

// ---- loading (cached briefly per isolate; saving clears the cache)
let cache: { at: number; config: Config; secrets: Partial<Record<SecretName, string>> } | null = null;
export function clearCache() { cache = null; }

export async function load(env: Env) {
  if (cache && Date.now() - cache.at < 15_000) return cache;
  const rows = (await env.DB.prepare("SELECT key, value FROM settings WHERE key = 'config' OR key LIKE 'secret:%'").all<any>()).results;
  const base = defaultConfig(env);
  let config = base;
  const secrets: Partial<Record<SecretName, string>> = {};
  for (const r of rows) {
    if (r.key === 'config') { try { config = cleanConfig(JSON.parse(r.value), base); } catch { /* keep defaults */ } }
    else {
      const name = r.key.slice(7) as SecretName;
      if (SECRET_NAMES.includes(name)) { try { secrets[name] = await decrypt(env, r.value); } catch { /* RUNNER_TOKEN changed: key must be entered again */ } }
    }
  }
  cache = { at: Date.now(), config, secrets };
  return cache;
}

/** Env with admin settings applied: keys entered on the admin page win over Worker secrets. */
export async function effectiveEnv(env: Env): Promise<Env & { config: Config }> {
  const { config, secrets } = await load(env);
  return {
    ...env,
    OPENAI_API_KEY: secrets.OPENAI_API_KEY || env.OPENAI_API_KEY,
    GEMINI_API_KEY: secrets.GEMINI_API_KEY || env.GEMINI_API_KEY,
    OPENAI_TEXT_MODEL: config.models.openaiText, OPENAI_IMAGE_MODEL: config.models.openaiImage, OPENAI_IMAGE_QUALITY: config.models.openaiImageQuality,
    GEMINI_TEXT_MODEL: config.models.geminiText, GEMINI_IMAGE_MODEL: config.models.geminiImage,
    DAILY_SCRIPTS: String(config.limits.script), DAILY_IMAGES: String(config.limits.image), DAILY_RENDERS: String(config.limits.render),
    config,
  };
}

export async function secretStatus(env: Env) {
  const { secrets } = await load(env);
  const out: Record<string, 'admin' | 'env' | null> = {};
  for (const n of SECRET_NAMES) out[n] = secrets[n] ? 'admin' : (env as any)[n] ? 'env' : null;
  return out;
}

export async function save(env: Env, input: any, secretInput: Record<string, unknown> = {}) {
  const config = cleanConfig(input, defaultConfig(env));
  const now = Date.now();
  const stmts = [env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('config', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(config), now)];
  for (const n of SECRET_NAMES) {
    const v = secretInput[n];
    if (v === null) stmts.push(env.DB.prepare('DELETE FROM settings WHERE key = ?').bind('secret:' + n));
    else if (typeof v === 'string' && v.trim()) {
      const key = v.trim();
      if (key.length < 10 || key.length > 300 || /\s/.test(key)) throw new HttpError(400, `Khoá ${n} không hợp lệ.`);
      stmts.push(env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind('secret:' + n, await encrypt(env, key), now));
    }
  }
  await env.DB.batch(stmts);
  clearCache();
  return config;
}

/** Keys for the render machine (voice providers only). */
export async function runnerSecrets(env: Env) {
  const { secrets } = await load(env);
  return Object.fromEntries(RUNNER_SECRETS.filter((n) => secrets[n]).map((n) => [n, secrets[n]]));
}

/** Admins are listed by email; until someone is listed, the first account ever created is the admin. */
export async function isAdmin(env: Env, config: Config, user: User) {
  if (config.admins.length) return config.admins.includes(user.email.toLowerCase());
  const first = await env.DB.prepare("SELECT id FROM users WHERE id NOT LIKE 'dev-%' ORDER BY created_at LIMIT 1").first<any>();
  return first ? first.id === user.id : user.id.startsWith('dev-');
}

/** What every visitor's browser needs to draw the interface. */
export function publicConfig(config: Config) {
  return { brand: config.brand, labels: config.labels, texts: config.texts, enabledStyles: config.enabledStyles, enabledSources: config.enabledSources, defaults: config.defaults, voices: config.voices };
}
