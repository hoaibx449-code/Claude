// Ink Studio: hand-drawn videos made by the Ink engine (ink/ in this repo).
// The site keeps the queue (ink_jobs) and the files (R2 ink/<user>/<job>/...). One render machine (ink/ink/site.py)
// runs wherever the admin chooses, in the order chosen: a server of their own (VPS, cloud VM, a home PC: always
// on, it polls), Google Cloud Run Jobs (started on demand), GitHub Actions (started with the dispatch API).
// Machines take jobs from /api/ink-runner/* with RUNNER_TOKEN or a per-server connection code.
// A job is 'plan' (script, storyboard, cover, then the video unless the user reviews the storyboard first)
// or 'render' (an approved or re-paced storyboard to video: no AI call).
import catalog from '../../ink/ink/catalog.json' with { type: 'json' };
import { body, HttpError, json, randomId, readBytes, refundQuota, sha256, timingSafeEqual, today, useQuota, type Env } from './util.ts';
import { startRunner } from './gcp.ts';
import { askChain, fillPrompt, microsoftVoices, speak } from './ink-browser.ts';
import { voiceCatalog } from './voices.ts';
import { decrypt, encrypt, isAdmin, type Config } from './settings.ts';
import { limitsFor, planOf } from './plans.ts';
import { serveObject } from './media.ts';
import { pushUser } from './push.ts';
import type { User } from './auth.ts';
import { zaloInk } from './zalo.ts';

type XEnv = Env & { config: Config };
type Rc = { userId: string | null; quiet: boolean; log(type: string, extra?: any): void; wait(p: Promise<unknown>): void };

export const PACES = ['slow', 'normal', 'fast', 'faster'] as const;
export const MOODS = ['auto', 'motivating', 'calm', 'upbeat', 'emotional', 'none'] as const;
const FILES: Record<string, string> = { 'video.mp4': 'video/mp4', 'cover.jpg': 'image/jpeg', 'overview.png': 'image/png', 'thumb.jpg': 'image/jpeg', 'draw.json': 'application/json', 'audio.aac': 'audio/aac',
  // 'Đòn Bẩy Tư Duy' also gives the clean voice-over script and karaoke subtitles to re-time after recording a voice
  'script.txt': 'text/plain; charset=utf-8', 'subs.ass': 'text/plain; charset=utf-8', 'captions.srt': 'text/plain; charset=utf-8' };
const STALE_MS = 5 * 60_000; // no heartbeat for this long: the machine is gone, the job goes back in the queue
const MAX_ACTIVE = 2;

export interface InkVoice { id: string; label: string; provider: 'microsoft' | 'everai'; code: string; on: boolean }
export interface InkSettings {
  enabled: boolean;
  ai: { order: ('gemini' | 'openai')[]; fallback: boolean; gemini: string; openai: string };
  voice: { fallback: boolean; default: string; list: InkVoice[] };
  defaults: { pace: string; seconds: number; mood: string; musicVolume: number; captions: boolean; review: boolean };
  github: { repo: string; workflow: string; ref: string };
  /** where videos are made, first choice first; a machine that cannot be reached hands over to the next */
  machines: { order: MachineKind[]; on: Record<MachineKind, boolean>; cloudJob: string };
}
export const MACHINES = ['server', 'cloudrun', 'github', 'browser'] as const;
export type MachineKind = (typeof MACHINES)[number];
export const INK_DEFAULTS: InkSettings = {
  enabled: true,
  ai: { order: ['gemini', 'openai'], fallback: true, gemini: 'gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-latest', openai: 'gpt-4.1-mini,gpt-4o-mini' },
  voice: { fallback: true, default: 'hoaimy', list: [
    { id: 'hoaimy', label: 'Hoài My (nữ, miễn phí)', provider: 'microsoft', code: 'vi-VN-HoaiMyNeural', on: true },
    { id: 'namminh', label: 'Nam Minh (nam, miễn phí)', provider: 'microsoft', code: 'vi-VN-NamMinhNeural', on: true },
    { id: 'thuytrang', label: 'Thùy Trang (nữ, EverAI)', provider: 'everai', code: 'vi_female_thuytrang_mb', on: false },
    { id: 'minhtriet', label: 'Minh Triết (nam, EverAI)', provider: 'everai', code: 'vi_male_minhtriet_mb', on: false },
    { id: 'vanduy', label: 'Văn Duy (nam trầm, EverAI)', provider: 'everai', code: 'vi_male_vanduy_mb', on: true },
  ] },
  defaults: { pace: 'normal', seconds: 60, mood: 'auto', musicVolume: 0.2, captions: true, review: false },
  github: { repo: 'hoaibx449-code/Claude', workflow: 'ink-runner.yml', ref: 'claude/ai-hand-drawing-video-platform-9na7xi' },
  machines: { order: ['server', 'cloudrun', 'github', 'browser'], on: { server: true, cloudrun: true, github: true, browser: false }, cloudJob: 'faciup-ink-runner' },
};

const str = (v: unknown, max: number, d = '') => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : d);
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const num = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : d);
const models = (v: unknown, d: string) => { const s = str(v, 300).split(',').map((x) => x.trim()).filter((x) => /^[\w.\-:]{2,60}$/.test(x)); return s.length ? s.join(',') : d; };

export function cleanInk(i: any): InkSettings {
  const d = INK_DEFAULTS, a = i?.ai || {}, v = i?.voice || {}, df = i?.defaults || {}, g = i?.github || {}, m = i?.machines || {};
  const morder = [...new Set([...(Array.isArray(m.order) ? m.order : []).filter((x: unknown) => MACHINES.includes(x as MachineKind)), ...MACHINES])] as MachineKind[];
  const order = (Array.isArray(a.order) ? a.order : d.ai.order).filter((x: unknown) => x === 'gemini' || x === 'openai');
  const list: InkVoice[] = (Array.isArray(v.list) ? v.list : d.voice.list).slice(0, 60).map((x: any, k: number) => ({
    id: /^[a-z0-9-]{2,24}$/.test(x?.id) ? x.id : 'giong-' + (k + 1), label: str(x?.label, 60) || 'Giọng ' + (k + 1),
    provider: x?.provider === 'everai' ? 'everai' : 'microsoft', code: /^[\w-]{3,60}$/.test(x?.code || '') ? x.code : 'vi-VN-HoaiMyNeural', on: x?.on !== false,
  }));
  // voices added to the defaults later reach settings saved before (the 'Đòn Bẩy Tư Duy' voice)
  if (list.length) for (const dv of d.voice.list.filter((x) => x.id === 'vanduy')) if (!list.some((x) => x.code === dv.code)) list.push({ ...dv });
  return {
    enabled: i?.enabled !== false,
    ai: { order: [...new Set(order.length ? order : d.ai.order)] as InkSettings['ai']['order'], fallback: a.fallback !== false, gemini: models(a.gemini, d.ai.gemini), openai: models(a.openai, d.ai.openai) },
    voice: { fallback: v.fallback !== false, default: list.some((x) => x.id === v.default && x.on) ? v.default : (list.find((x) => x.on) || list[0])?.id || 'hoaimy', list: list.length ? list : d.voice.list },
    defaults: { pace: pick(df.pace, PACES, 'normal'), seconds: num(df.seconds, 20, 300, 60), mood: pick(df.mood, MOODS, 'auto'), musicVolume: num(df.musicVolume, 0, 0.6, 0.2), captions: df.captions !== false, review: df.review === true },
    github: { repo: /^[\w.-]{1,40}\/[\w.-]{1,100}$/.test(g.repo || '') ? g.repo : d.github.repo, workflow: /^[\w.-]{1,60}\.ya?ml$/.test(g.workflow || '') ? g.workflow : d.github.workflow, ref: /^[\w./-]{1,120}$/.test(g.ref || '') ? g.ref : d.github.ref },
    machines: { order: morder, on: Object.fromEntries(MACHINES.map((k) => [k, typeof m.on?.[k] === 'boolean' ? m.on[k] : d.machines.on[k]])) as Record<MachineKind, boolean>,
      cloudJob: /^[a-z][a-z0-9-]{2,62}$/.test(m.cloudJob || '') ? m.cloudJob : d.machines.cloudJob },
  };
}

let memo: { at: number; s: InkSettings; token: string } | null = null;
async function settings(env: Env) {
  if (memo && Date.now() - memo.at < 15_000) return memo;
  const rows = (await env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('ink', 'secret:INK_GITHUB_TOKEN')").all<any>()).results;
  let s = INK_DEFAULTS, token = '';
  for (const r of rows) {
    if (r.key === 'ink') { try { s = cleanInk(JSON.parse(r.value)); } catch { /* keep defaults */ } }
    else { try { token = await decrypt(env, r.value); } catch { /* RUNNER_TOKEN changed: enter it again */ } }
  }
  memo = { at: Date.now(), s, token: token || (env as any).INK_GITHUB_TOKEN || '' };
  return memo;
}

// ---------------------------------------------------------------- waking GitHub
/** Start the workflow; GitHub keeps at most one waiting run, and a run takes every queued job. */
export async function dispatch(env: Env, force = false) {
  const r = await wake(env, force);
  // the last failure is kept so the admin page and the waiting users see why nothing moves
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('ink:wake_error', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(r === 'ok' ? '' : r, Date.now()).run();
  return r;
}
async function wake(env: Env, force: boolean) {
  const { s } = await settings(env), errors: string[] = [];
  // Shorts currently needs the new GitHub machine; do not wake an older cloud/server for this queue.
  const shorts = await env.DB.prepare("SELECT 1 FROM ink_jobs WHERE status = 'queued' AND json_extract(input, '$.format') = 'shorts3d' LIMIT 1").first();
  if (shorts) return s.machines.on.github ? startGithub(env, force) : 'Shorts 3D cần bật máy dựng GitHub.';
  for (const kind of s.machines.order) {
    if (!s.machines.on[kind]) continue;
    if (kind === 'browser') continue; // the user's device draws; it never takes the AI and voice part
    const r = kind === 'server' ? await serverAwake(env) : kind === 'cloudrun' ? await startCloud(env, s, force) : kind === 'github' ? await startGithub(env, force) : 'chưa hỗ trợ';
    if (r === 'ok') return 'ok';
    errors.push(`${MACHINE_NAMES[kind]}: ${r}`);
  }
  return errors.join(' · ') || 'Chưa bật máy dựng nào (Quản trị → Ink Studio → Máy dựng).';
}
export const MACHINE_NAMES: Record<MachineKind, string> = { server: 'Máy chủ riêng', cloudrun: 'Google Cloud Run', github: 'GitHub Actions', browser: 'Trình duyệt' };

/** A server of the admin's own polls every few seconds: it only has to be online. */
async function serverAwake(env: Env) {
  const seen = await machinesSeen(env);
  return Object.values(seen).some((x) => x.kind === 'server' && Date.now() - x.at < 90_000) ? 'ok' : 'không có máy chủ nào đang online';
}
async function startCloud(env: Env, s: InkSettings, force: boolean) {
  if (!env.GCP_TRIGGER_KEY || !env.GCP_PROJECT || !env.GCP_REGION) return 'chưa nối Google Cloud';
  if (!force && (await recently(env, 'ink:cloud'))) return 'ok';
  const ok = await startRunner({ ...env, GCP_JOB: s.machines.cloudJob }).catch(() => false);
  if (!ok) return `không chạy được job ${s.machines.cloudJob} (đã triển khai lên Google Cloud chưa?)`;
  await mark(env, 'ink:cloud'); return 'ok';
}
async function startGithub(env: Env, force: boolean) {
  const { s, token } = await settings(env);
  if (!token) return 'chưa có GitHub token';
  if (!force && (await recently(env, 'ink:dispatch'))) return 'ok';
  const res = await fetch(`https://api.github.com/repos/${s.github.repo}/actions/workflows/${s.github.workflow}/dispatches`, {
    method: 'POST', body: JSON.stringify({ ref: s.github.ref }),
    headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'user-agent': 'faciup-ink', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json' },
  });
  if (!res.ok) return `GitHub từ chối (HTTP ${res.status}): ${(await res.text()).slice(0, 160)}`;
  await mark(env, 'ink:dispatch'); return 'ok';
}
const recently = async (env: Env, k: string) => { const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(k).first<any>(); return !!r && Date.now() - Number(r.value) < 90_000; };
const mark = (env: Env, k: string) => env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, String(Date.now()), Date.now()).run();

// ---------------------------------------------------------------- machines
/** Servers the admin connected: each has its own code (only its hash is kept), shown once. */
interface Server { id: string; name: string; hash: string; created: number }
async function servers(env: Env): Promise<Server[]> {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ink:servers'").first<any>();
  try { return r ? JSON.parse(r.value) : []; } catch { return []; }
}
const saveServers = (env: Env, list: Server[]) => env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('ink:servers', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(list), Date.now()).run();
type Seen = Record<string, { kind: string; at: number; version: string; host: string }>;
async function machinesSeen(env: Env): Promise<Seen> {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ink:seen'").first<any>();
  try { return r ? JSON.parse(r.value) : {}; } catch { return {}; }
}
/** who may take jobs: the site's RUNNER_TOKEN, or a server's connection code */
async function runnerAuth(env: Env, req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') || '';
  if (env.RUNNER_TOKEN && env.RUNNER_TOKEN.length >= 32 && timingSafeEqual(auth, `Bearer ${env.RUNNER_TOKEN}`)) return 'token';
  const code = auth.match(/^Bearer (ink_[a-f0-9]{48})$/)?.[1];
  if (!code) return null;
  const h = await sha256(code), s = (await servers(env)).find((x) => timingSafeEqual(x.hash, h));
  return s ? 'server:' + s.id : null;
}
/** the newest machine code the site has (set at deploy), so servers update themselves */
async function bundleVersion(env: Env) {
  const v = await env.BUCKET.get('ink-runner/version.txt');
  return v ? (await v.text()).trim().slice(0, 40) : '';
}

/** a machine read with another provider than the chosen voice: that voice failed (hidden, owner told) */
async function voiceUsed(env: Env, j: any, b: any) {
  const used = str(b.voice, 40); if (!used) return;
  const { s } = await settings(env), input = JSON.parse(j.input || '{}'), v = s.voice.list.find((x) => x.id === input.voice);
  if (v && used !== v.provider) await inkVoiceFailed(env, v, str(b.voiceError, 300) || `máy dựng phải đọc bằng ${used}`);
}

// ---------------------------------------------------------------- voices: tested before users can pick them
// Same rule as the main site: a voice is offered only after it read a real sentence; one that fails while making
// a video is hidden again and the owner is told. Users never see the reason.
type InkCheck = { ok: boolean; at: number; ms?: number; error?: string; from?: string };
async function inkChecks(env: Env): Promise<Record<string, InkCheck>> {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ink:voicechecks'").first<any>();
  try { return JSON.parse(r?.value || '{}'); } catch { return {}; }
}
const vkey = (v: { provider: string; code: string }) => `${v.provider}:${v.code}`;
async function saveInkCheck(env: Env, v: { provider: string; code: string }, c: InkCheck) {
  const all = await inkChecks(env); all[vkey(v)] = c;
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('ink:voicechecks', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(all), Date.now()).run();
}
async function testInkVoice(env: Env, v: { provider: string; code: string }, from = 'admin') {
  const t0 = Date.now();
  try {
    const r = await speak(env, v, 'Xin chào! Đây là giọng đọc cho video của bạn.', '+0%', false);
    if (r.audio.length < 1000) throw new Error(`tệp âm thanh rỗng (${r.audio.length} byte)`);
    await saveInkCheck(env, v, { ok: true, at: Date.now(), ms: Date.now() - t0, from });
    return { ok: true, ms: Date.now() - t0, audio: r.audio };
  } catch (e: any) {
    const error = String(e?.message || e).replace(/^Không đọc được giọng: /, '').slice(0, 300);
    await saveInkCheck(env, v, { ok: false, at: Date.now(), ms: Date.now() - t0, error, from });
    return { ok: false, ms: Date.now() - t0, error, audio: null };
  }
}
async function inkVoiceFailed(env: Env, v: { provider: string; code: string; label?: string }, error: string) {
  const before = (await inkChecks(env))[vkey(v)];
  await saveInkCheck(env, v, { ok: false, at: Date.now(), error: error.slice(0, 300) || 'phải đọc bằng giọng dự phòng', from: 'render' });
  if (before?.ok !== false) {
    const { notifyOwner } = await import('./zalo.ts');
    const { effectiveEnv } = await import('./settings.ts');
    await notifyOwner(await effectiveEnv(env), 'support', `Ink Studio: giọng "${v.label || v.code}" vừa lỗi khi dựng video nên đã tạm ẩn khỏi danh sách người dùng. Lý do: ${error.slice(0, 200) || 'không rõ'}. Vào Quản trị → Ink Studio để kiểm tra lại.`).catch(() => {});
  }
}
/** voices users may pick right now */
async function readyVoices(env: Env, s: InkSettings) {
  const checks = await inkChecks(env);
  return s.voice.list.filter((v) => v.on && checks[vkey(v)]?.ok === true);
}

/** Pixabay photos/clips used by the latest cinematic videos (newest first) */
async function recentFootage(env: Env): Promise<string[]> {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ink:footage'").first<any>();
  try { return JSON.parse(r?.value || '[]'); } catch { return []; }
}

/** Every minute: jobs whose machine went quiet go back in the queue; a waiting queue wakes GitHub again. */
export async function inkCron(env: Env) {
  const now = Date.now();
  // voices nobody has tested yet (just added, or right after this update): two per minute
  { const { s } = await settings(env), checks = await inkChecks(env);
    for (const v of s.voice.list.filter((x) => x.on && !checks[vkey(x)]).slice(0, 2)) await testInkVoice(env, v, 'auto'); }
  await env.DB.prepare("UPDATE ink_jobs SET status = 'queued', lease = '', message = 'Đang chờ máy dựng (thử lại)' WHERE status = 'running' AND heartbeat < ?").bind(now - STALE_MS).run();
  const waiting = await env.DB.prepare("SELECT MIN(updated_at) AS t FROM ink_jobs WHERE status = 'queued'").first<any>();
  const running = await env.DB.prepare("SELECT COUNT(*) AS n FROM ink_jobs WHERE status = 'running'").first<any>();
  // nothing is being made and something waits for more than 2 minutes: the last wake-up was lost
  if (waiting?.t && !running?.n && now - waiting.t > 2 * 60_000) {
    const last = await env.DB.prepare("SELECT MAX(CAST(value AS INTEGER)) AS t FROM settings WHERE key IN ('ink:dispatch', 'ink:cloud', 'ink:cron')").first<any>();
    if (!last?.t || now - Number(last.t) > 3 * 60_000) { await mark(env, 'ink:cron'); await dispatch(env, true); }
  }
}

// ---------------------------------------------------------------- users
const key = (j: { user_id: string; id: string }, name: string) => `ink/${j.user_id}/${j.id}/${name}`;
const PROP_KEYS = new Set(catalog.props.map(([k]) => k));
// fields of a hand-drawn scene that are drawing choices, not words: a user edit never changes them
const NOT_TEXT = new Set(['layout', 'pose', 'face', 'color', 'pick', 'type']);
/** the user's words put into a scene's drawing: only text that is already there changes (same shape), and an object
 *  only becomes another object the engine can draw */
export function mergeText(orig: any, edit: any, k = ''): any {
  if (typeof orig === 'string') {
    if (k === 'prop') return typeof edit === 'string' && PROP_KEYS.has(edit) ? edit : orig;
    return NOT_TEXT.has(k) || typeof edit !== 'string' ? orig : str(edit.replace(/\s+/g, ' '), 120);
  }
  if (Array.isArray(orig)) return orig.map((x, i) => mergeText(x, Array.isArray(edit) ? edit[i] : undefined, k));
  if (orig && typeof orig === 'object') return Object.fromEntries(Object.entries(orig).map(([kk, v]) => [kk, mergeText(v, edit && typeof edit === 'object' ? edit[kk] : undefined, kk)]));
  return orig;
}
// ---- how long a video really takes, learned from the last finished ones (per video type): shown instead of a promise
type Eta = Record<string, { wait: number; run: number; n: number }>;
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
async function etaOf(env: Env): Promise<Eta> {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ink:eta'").first<any>().catch(() => null);
  try { return r?.value ? JSON.parse(r.value) : {}; } catch { return {}; }
}
/** recomputed when a video finishes: median wait (queued → a machine took it) and render time over the last 30 */
async function learnEta(env: Env) {
  const rows = (await env.DB.prepare("SELECT input, meta, created_at, finished_at FROM ink_jobs WHERE status = 'done' AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 90").all<any>()).results || [];
  const by: Record<string, { wait: number[]; run: number[] }> = {};
  for (const r of rows) {
    const input = JSON.parse(r.input || '{}'), meta = JSON.parse(r.meta || '{}');
    if (input.browser || !meta.started) continue;
    const f = input.format || 'ink', b = (by[f] ||= { wait: [], run: [] });
    if (b.run.length >= 30) continue;
    b.wait.push(Math.max(0, meta.started - (meta.queued || r.created_at)) / 1000); b.run.push(Math.max(0, r.finished_at - meta.started) / 1000);
  }
  const eta: Eta = Object.fromEntries(Object.entries(by).map(([f, b]) => [f, { wait: Math.round(median(b.wait)), run: Math.round(median(b.run)), n: b.run.length }]));
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('ink:eta', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(eta), Date.now()).run();
}

const view = (j: any) => {
  const input = JSON.parse(j.input || '{}'), meta = JSON.parse(j.meta || '{}');
  return { id: j.id, parent: j.parent || null, title: j.title, status: j.status, stage: j.stage, progress: j.progress, message: j.message, error: j.error,
    duration: j.duration, created_at: j.created_at, finished_at: j.finished_at, pace: input.pace, browser: !!input.browser, mode: input.mode, seconds: input.seconds, format: input.format || 'ink',
    files: meta.files || [], caption: meta.caption || '', hashtags: meta.hashtags || [], series: input.series?.name || '' };
};

/** a name shown in lists: at most n characters, cut at a clause or a whole word, never inside one */
function clip(text: string, n: number) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const head = t.slice(0, n + 1);
  for (const sep of [' – ', ' - ', ': ', ', ', '; ', '? ']) { const k = head.lastIndexOf(sep); if (k >= n * 0.45) return head.slice(0, k + (sep === '? ' ? 1 : 0)).trim(); }
  const k = head.lastIndexOf(' ');
  return (k > 0 ? head.slice(0, k) : t.slice(0, n)).replace(/[\s,;:–-]+$/, '') + '…';
}

// ---- per-user preferences: the pronunciation dictionary and the brand (colour, logo)
type Lex = { w: string; say: string }[];
const cleanLex = (v: unknown): Lex => (Array.isArray(v) ? v : []).map((x: any) => ({ w: str(x?.w, 60).trim(), say: str(x?.say, 120).trim() }))
  .filter((x) => x.w && x.say && x.w.toLowerCase() !== x.say.toLowerCase()).slice(0, 200);
const cleanBrand = (v: any) => ({ ...(/^#[0-9a-f]{6}$/i.test(v?.color || '') ? { color: String(v.color).toLowerCase() } : {}), ...(/^logo\.(png|jpg|webp)$/.test(v?.logo || '') ? { logo: v.logo } : {}),
  ...(['tl', 'tr', 'bl', 'br'].includes(v?.corner) ? { corner: v.corner } : {}) });
export async function inkPrefs(env: Env, userId: string) {
  const r = await env.DB.prepare('SELECT lexicon, brand FROM ink_prefs WHERE user_id = ?').bind(userId).first<any>().catch(() => null);
  return { lexicon: cleanLex(JSON.parse(r?.lexicon || '[]')), brand: cleanBrand(JSON.parse(r?.brand || '{}')) };
}
/** names and terms read the way the person wants: whole words, as written (and in capitals), in one pass so a
 *  replacement is never replaced again; the longest entries win ("OpenAI" before "AI"; the word "ai" stays) */
export function applyLexicon(text: string, lex: Lex) {
  if (!lex.length) return text;
  const map = new Map<string, string>();
  for (const e of lex) { map.set(e.w, e.say); if (e.w !== e.w.toUpperCase()) map.set(e.w.toUpperCase(), e.say); }
  const keys = [...map.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])(?:${keys.join('|')})(?![\\p{L}\\p{N}])`, 'gu'), (m) => map.get(m) ?? m);
}

async function own(env: Env, user: User, id: string) {
  const j = await env.DB.prepare('SELECT * FROM ink_jobs WHERE id = ? AND user_id = ?').bind(id, user.id).first<any>();
  if (!j) throw new HttpError(404, 'Không tìm thấy video.');
  return j;
}

// ---- the allowance ledger (ink_ledger): every video takes one render from the day's allowance when it is queued
// ("held"), keeps it when delivered ("charged") and gives it back on that same day's count when it fails ("refunded").
// The page sends a request id: the same request twice (double click, a retry after a lost answer) makes one video.
const RID = /^[a-z0-9-]{8,40}$/;
/** takes the render for a new video; returns the id of the video already made for the same request, if any */
export async function charge(env: XEnv, user: User, jobId: string, reason: string, rid = ''): Promise<string | null> {
  const now = Date.now(), admin = await isAdmin(env, env.config, user), r = RID.test(rid) ? rid : null;
  const same = () => r ? env.DB.prepare('SELECT job_id FROM ink_ledger WHERE user_id = ? AND rid = ?').bind(user.id, r).first<any>() : Promise.resolve(null);
  const dup = await same(); if (dup) return dup.job_id;
  const got = await env.DB.prepare(`INSERT INTO ink_ledger (job_id, user_id, day, kind, state, reason, rid, created_at, updated_at) VALUES (?, ?, ?, 'render', ?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING RETURNING job_id`).bind(jobId, user.id, today(), admin ? 'free' : 'held', reason, r, now, now).first<any>();
  if (!got) { const d = await same(); if (d) return d.job_id; throw new HttpError(409, 'Yêu cầu đang được xử lý, vui lòng đợi giây lát.'); }
  // the site's admins test freely; everyone else has the plan's videos a day
  if (!admin) {
    try { await useQuota(env, user.id, 'render', (await limitsFor(env, user.id)).render); }
    catch (e) { await env.DB.prepare('DELETE FROM ink_ledger WHERE job_id = ?').bind(jobId).run(); throw e; }
  }
  return null;
}
/** a failed video asked again: takes a render again if the failure gave it back */
async function recharge(env: XEnv, user: User, jobId: string) {
  const row = await env.DB.prepare('SELECT state FROM ink_ledger WHERE job_id = ?').bind(jobId).first<any>();
  if (row && row.state !== 'refunded') return;
  const admin = await isAdmin(env, env.config, user), now = Date.now();
  if (!admin) await useQuota(env, user.id, 'render', (await limitsFor(env, user.id)).render);
  await env.DB.prepare(`INSERT INTO ink_ledger (job_id, user_id, day, kind, state, reason, created_at, updated_at) VALUES (?, ?, ?, 'render', ?, 'retry', ?, ?)
    ON CONFLICT (job_id) DO UPDATE SET state = excluded.state, day = excluded.day, reason = 'retry', updated_at = excluded.updated_at`).bind(jobId, user.id, today(), admin ? 'free' : 'held', now, now).run();
}
/** delivered: the render stays taken */
export const settle = (env: Env, jobId: string) => env.DB.prepare("UPDATE ink_ledger SET state = 'charged', updated_at = ? WHERE job_id = ? AND state = 'held'").bind(Date.now(), jobId).run();
/** failed or dropped before it was made: the render goes back to the day it was taken from, once */
export async function refundJob(env: Env, j: { id: string; user_id: string }) {
  const r = await env.DB.prepare("UPDATE ink_ledger SET state = 'refunded', updated_at = ? WHERE job_id = ? AND state = 'held' RETURNING day, kind").bind(Date.now(), j.id).first<any>();
  if (r) { await env.DB.prepare('UPDATE usage SET n = MAX(0, n - 1) WHERE user_id = ? AND day = ? AND kind = ?').bind(j.user_id, r.day, r.kind).run(); return; }
  if (!(await env.DB.prepare('SELECT 1 FROM ink_ledger WHERE job_id = ?').bind(j.id).first())) await refundQuota(env, j.user_id, 'render'); // made before the ledger
}

// the steps of a video the machine times (site.py PHASES) and where a failed one stopped
const PHASES = ['start', 'script', 'check', 'storyboard', 'voice', 'render', 'upload'];
const cleanSteps = (x: any): Record<string, number> => Object.fromEntries(Object.entries(x && typeof x === 'object' ? x : {})
  .filter(([k]) => PHASES.includes(k)).map(([k, v]) => [k, num(v, 0, 86_400, 0)]));

// ---- every voice's real reading speed (words a second at plain speed), learned from each finished video: scripts
// are sized with it, so a 2-minute video is 2 minutes whatever voice and pace were chosen
async function wpsOf(env: Env): Promise<Record<string, number>> {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ink:wps'").first<any>().catch(() => null);
  try { return r?.value ? JSON.parse(r.value) : {}; } catch { return {}; }
}
async function learnWps(env: Env, voice: { provider: string; code: string } | undefined, st: any) {
  const words = num(st?.words, 0, 100_000, 0), secs = num(st?.seconds, 0, 36_000, 0), m = /^([+-]\d{1,2})%$/.exec(String(st?.rate || ''));
  if (!voice || st?.provider !== voice.provider || words < 40 || secs < 10 || !m) return;
  const plain = words / secs / (1 + Number(m[1]) / 100);
  if (plain < 1.5 || plain > 6) return;
  const all = await wpsOf(env), k = voice.provider + ':' + voice.code;
  all[k] = Math.round((all[k] ? all[k] * 0.7 + plain * 0.3 : plain) * 100) / 100;
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('ink:wps', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(all), Date.now()).run();
}

/** what one video used, for pricing: AI answers (by model), characters read aloud, machine seconds */
function costOf(j: any, ai: unknown, machineSec: number) {
  const calls = Array.isArray(ai) ? ai.map((x) => String(x)) : [], sb = j.storyboard ? JSON.parse(j.storyboard) : null;
  const models: Record<string, number> = {}; for (const c of calls) models[c] = (models[c] || 0) + 1;
  return { aiCalls: calls.length, models, voiceChars: (sb?.scenes || []).reduce((n: number, s: any) => n + String(s.say || '').length, 0), machineSec };
}

async function enqueue(env: XEnv, rc: Rc, user: User, input: any, stage: 'plan' | 'render', storyboard: any = null, parent: string | null = null, title = '', reason = 'new') {
  const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM ink_jobs WHERE user_id = ? AND (status IN ('queued','running') OR (status = 'browser' AND updated_at > ?))").bind(user.id, Date.now() - 6 * 3600_000).first<any>();
  const id = randomId(12), now = Date.now();
  if (RID.test(input.rid || '')) { const d = await env.DB.prepare('SELECT job_id FROM ink_ledger WHERE user_id = ? AND rid = ?').bind(user.id, input.rid).first<any>(); if (d) return d.job_id as string; }
  if (active.n >= MAX_ACTIVE) throw new HttpError(429, 'Bạn đang có video chờ dựng. Đợi xong rồi tạo tiếp nhé.');
  const dup = await charge(env, user, id, reason, input.rid || ''); if (dup) return dup;
  // made in the user's browser: no machine is woken, the page does everything (status 'browser')
  const browser = input.browser === true, status = browser ? 'browser' : 'queued', message = browser ? 'Sẵn sàng dựng trên máy của bạn' : 'Đang chờ máy dựng';
  await env.DB.prepare(`INSERT INTO ink_jobs (id, user_id, parent, title, input, storyboard, stage, status, message, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, user.id, parent, title || clip(str(input.topic || input.script, 500), 80) || 'Video mới', JSON.stringify(input), storyboard ? JSON.stringify(storyboard) : null, stage, status, message, now, now).run();
  rc.log('ink.queue', { data: { job: id, stage, mode: input.mode, seconds: input.seconds, pace: input.pace, parent, browser } });
  if (!browser) rc.wait(dispatch(env).then((r) => { if (r !== 'ok') rc.log('ink.dispatch', { ok: false, data: { error: r } }); }));
  return id;
}

/** A new video from a topic or a script: the web page and Zalo both come here (same checks, same queue). */
export async function createInk(env: XEnv, rc: Rc, user: User, b: any, extra: Record<string, unknown> = {}) {
  const { s } = await settings(env), { plan } = await planOf(env, user.id);
  if (!s.enabled && !(await isAdmin(env, env.config, user))) throw new HttpError(404, 'Ink Studio đang tạm tắt.');
  const mode = b.mode === 'script' ? 'script' : 'topic', source = /^https?:\/\/\S{6,}$/.test(String(b.source || '').trim()) ? String(b.source).trim().slice(0, 500) : '';
  // a link to an article is optional: with it, a topic may be left short (the article is the story)
  let text = mode === 'script' ? str(String(b.script || '').replace(/\r/g, ''), 12_000) : str(b.topic, 500);
  if (mode === 'topic' && text.length < 4 && source && b.format === 'money') text = 'Theo bài báo: ' + source;
  if (text.length < (mode === 'script' ? 40 : 4)) throw new HttpError(400, mode === 'script' ? 'Kịch bản quá ngắn.' : 'Hãy nhập chủ đề video.');
  const format = b.format === 'cine' || b.format === 'money' || b.format === 'shorts3d' ? b.format : 'ink';
  if (format === 'shorts3d' && !s.machines.on.github) throw new HttpError(503, 'Shorts 3D cần bật máy dựng GitHub trong quản trị.');
  // 'Đòn Bẩy Tư Duy' runs about two minutes unless asked otherwise
  const cap = Math.min(300, plan.maxSeconds, env.config.limits.maxSeconds), seconds = Math.round(num(b.seconds, 20, 300, Math.min(format === 'money' ? 120 : s.defaults.seconds, cap)));
  if (seconds > cap) throw new HttpError(402, `Gói ${plan.name} cho video tối đa ${cap} giây.`);
  if (format === 'shorts3d' && seconds > 120) throw new HttpError(400, 'Shorts 3D hiện hỗ trợ tối đa 2 phút.');
  if (format === 'shorts3d' && b.series) throw new HttpError(400, 'Shorts 3D chưa dùng series Điện ảnh; hãy bỏ chọn series.');
  const ready = await readyVoices(env, s);
  if (!ready.length) throw new HttpError(503, 'Giọng đọc đang được bảo trì, vui lòng thử lại sau ít phút.');
  const voice = ready.find((v) => v.id === b.voice) || (format === 'money' ? ready.find((v) => v.id === 'vanduy') : undefined) || ready.find((v) => v.id === s.voice.default) || ready[0];
  const music = /^[a-f0-9]{24}\.(mp3|m4a|wav)$/.test(b.music || '') ? b.music : '';
  if (music && !(await env.BUCKET.head(`ink-music/${user.id}/${music}`))) throw new HttpError(400, 'Không tìm thấy nhạc đã tải lên.');
  const input: Record<string, any> = { mode, [mode]: text, seconds, audience: str(b.audience, 200), tone: str(b.tone, 120), notes: str(b.notes, 600),
    pace: pick(b.pace, PACES, s.defaults.pace as any), voice: voice.id, rid: !extra.zalo && RID.test(String(b.rid || '')) ? String(b.rid) : '', mood: pick(b.mood, MOODS, s.defaults.mood as any), music,
    musicVolume: num(b.musicVolume, 0, 0.6, s.defaults.musicVolume), captions: b.captions !== false, review: typeof b.review === 'boolean' ? b.review : s.defaults.review,
    // drawn on the user's own device: a machine writes the script, voice and drawing plan, the browser draws
    // 'cine': real footage (HBX engine, render machines only); 'money': 'Đòn Bẩy Tư Duy' (researched on the web, same engine); 'ink': hand-drawn
    format, ...(format === 'money' ? { aspect: b.aspect === '16:9' ? '16:9' : '9:16', ...(source ? { source } : {}) } : {}),
    browser: b.browser === true && s.machines.on.browser && format === 'ink', ...extra };
  if (typeof b.series === 'string' && b.series) {  // a series films with the cinematic engine and its own new 3D prop
    const sr = await env.DB.prepare('SELECT * FROM ink_series WHERE id = ? AND user_id = ?').bind(b.series, user.id).first<any>();
    if (!sr) throw new HttpError(404, 'Không tìm thấy series.');
    if (input.format === 'ink') input.format = 'cine';
    (input as any).series = { id: sr.id, name: sr.name, topic: sr.topic, style: sr.style, used: JSON.parse(sr.used || '[]') };
  }
  // the person's own dictionary and brand go with every video (web and Zalo alike)
  const prefs = await inkPrefs(env, user.id);
  if (prefs.lexicon.length) input.lexicon = prefs.lexicon;
  if (prefs.brand.color || prefs.brand.logo) input.brand = prefs.brand;
  // other frame shapes are drawn by the render machines (the device renderer draws 9:16)
  if (input.format === 'ink') { const ar = ['9:16', '1:1', '4:5', '16:9'].includes(b.aspect) ? b.aspect : '9:16'; if (ar !== '9:16') { input.aspect = ar; input.browser = false; } }
  if (['cine', 'money'].includes(input.format) && !(env as any).PIXABAY_API_KEY) throw new HttpError(503, `Kiểu ${format === 'money' ? 'Đòn Bẩy Tư Duy' : 'Điện ảnh'} đang được chuẩn bị, vui lòng chọn Vẽ tay.`);
  return enqueue(env, rc, user, input, 'plan', null, typeof b.parent === 'string' ? b.parent : null);
}
/** Voices a video can be read with right now (tested, switched on). */
export async function inkVoices(env: Env) { const { s } = await settings(env); return (await readyVoices(env, s)).map((v) => ({ id: v.id, label: v.label })); }
/** The reviewed storyboard goes on to be made into the video. */
export async function approveInk(env: Env, rc: Rc, id: string) {
  const r = await env.DB.prepare("UPDATE ink_jobs SET status = 'queued', stage = 'render', message = 'Đang chờ máy dựng', updated_at = ? WHERE id = ? AND status = 'review'").bind(Date.now(), id).run();
  if (!r.meta.changes) return false;
  rc.wait(dispatch(env));
  return true;
}
/** A storyboard nobody will make: removed, and the video it counted against the day's allowance is given back. */
export async function dropInk(env: Env, j: { id: string; user_id: string; status: string }) {
  const files = (await env.BUCKET.list({ prefix: `ink/${j.user_id}/${j.id}/` })).objects.map((o) => o.key);
  if (files.length) await env.BUCKET.delete(files);
  await env.DB.prepare('DELETE FROM ink_jobs WHERE id = ?').bind(j.id).run();
  if (j.status === 'queued' || j.status === 'review') await refundJob(env, j);
}

export async function inkUser(req: Request, env: XEnv, rc: Rc, user: User, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/ink/')) return null;
  const { s } = await settings(env), method = req.method, sub = path.slice('/api/ink/'.length);
  if (!s.enabled && !(await isAdmin(env, env.config, user))) throw new HttpError(404, 'Ink Studio đang tạm tắt.');
  if (sub === 'config' && method === 'GET') {
    const { plan } = await planOf(env, user.id);
    const ready = await readyVoices(env, s);
    const used = await env.DB.prepare("SELECT n FROM usage WHERE user_id = ? AND day = ? AND kind = 'render'").bind(user.id, today()).first<any>();
    const admin = await isAdmin(env, env.config, user);
    return json({ quota: admin ? null : { used: used?.n || 0, limit: plan.limits.render }, eta: await etaOf(env), browser: s.machines.on.browser, shorts3d: s.machines.on.github, cine: !!(env as any).PIXABAY_API_KEY, voices: ready.map((v) => ({ id: v.id, label: v.label })), defaults: { ...s.defaults, voice: ready.some((v) => v.id === s.voice.default) ? s.voice.default : ready[0]?.id || '' },
      maxSeconds: Math.min(300, plan.maxSeconds, env.config.limits.maxSeconds) });
  }
  if (sub === 'browser/bundle' && method === 'GET') {
    // the Python engine for the page to run itself (no prompts inside), cached by version
    const obj = await env.BUCKET.get('ink-runner/browser.tar.gz');
    if (!obj) throw new HttpError(404, 'Chưa có gói máy dựng cho trình duyệt (triển khai lại web).');
    rc.quiet = true;
    return new Response(obj.body, { headers: { 'content-type': 'application/gzip', 'cache-control': 'private, max-age=86400' } });
  }
  if (sub === 'browser/version' && method === 'GET') { rc.quiet = true; return json({ version: await bundleVersion(env) }); }
  if (sub === 'music' && method === 'POST') {
    const bytes = await readBytes(req, 15_000_000), type = req.headers.get('content-type') || '';
    const ext = /mpeg|mp3/.test(type) ? 'mp3' : /mp4|m4a|aac/.test(type) ? 'm4a' : /wav/.test(type) ? 'wav' : '';
    if (!ext || bytes.length < 10_000) throw new HttpError(400, 'Chỉ nhận tệp nhạc MP3, M4A hoặc WAV (tối đa 15 MB).');
    const id = randomId(12);
    await env.BUCKET.put(`ink-music/${user.id}/${id}.${ext}`, bytes, { httpMetadata: { contentType: type } });
    return json({ music: `${id}.${ext}` });
  }
  if (sub === 'prefs' && method === 'GET') {
    rc.quiet = true;
    const p = await inkPrefs(env, user.id);
    return json({ ...p, logoUrl: p.brand.logo ? `/api/ink/prefs/logo?v=${Date.now() % 1e6}` : '' });
  }
  if (sub === 'prefs' && method === 'PUT') {
    const b = await body<any>(req, 40_000), cur = await inkPrefs(env, user.id);
    const lexicon = b.lexicon !== undefined ? cleanLex(b.lexicon) : cur.lexicon;
    const brand = cleanBrand({ ...cur.brand, ...(b.brand && typeof b.brand === 'object' ? b.brand : {}), logo: cur.brand.logo });
    if (b.brand && b.brand.color === '') delete (brand as any).color;
    await env.DB.prepare('INSERT INTO ink_prefs (user_id, lexicon, brand, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET lexicon = excluded.lexicon, brand = excluded.brand, updated_at = excluded.updated_at')
      .bind(user.id, JSON.stringify(lexicon), JSON.stringify(brand), Date.now()).run();
    return json({ lexicon, brand });
  }
  if (sub === 'prefs/logo' && method === 'POST') {
    const bytes = await readBytes(req, 1_500_000), type = req.headers.get('content-type') || '';
    const ext = /png/.test(type) ? 'png' : /jpe?g/.test(type) ? 'jpg' : /webp/.test(type) ? 'webp' : '';
    if (!ext || bytes.length < 200) throw new HttpError(400, 'Logo cần là ảnh PNG, JPG hoặc WEBP (tối đa 1,5 MB). PNG nền trong suốt đẹp nhất.');
    const cur = await inkPrefs(env, user.id);
    if (cur.brand.logo && cur.brand.logo !== `logo.${ext}`) await env.BUCKET.delete(`ink-brand/${user.id}/${cur.brand.logo}`);
    await env.BUCKET.put(`ink-brand/${user.id}/logo.${ext}`, bytes, { httpMetadata: { contentType: type } });
    const brand = { ...cur.brand, logo: `logo.${ext}` };
    await env.DB.prepare('INSERT INTO ink_prefs (user_id, lexicon, brand, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET brand = excluded.brand, updated_at = excluded.updated_at')
      .bind(user.id, JSON.stringify(cur.lexicon), JSON.stringify(brand), Date.now()).run();
    return json({ brand, logoUrl: `/api/ink/prefs/logo?v=${Date.now() % 1e6}` });
  }
  if (sub === 'prefs/logo' && method === 'DELETE') {
    const cur = await inkPrefs(env, user.id);
    if (cur.brand.logo) await env.BUCKET.delete(`ink-brand/${user.id}/${cur.brand.logo}`);
    const { logo, ...brand } = cur.brand as any;
    await env.DB.prepare('UPDATE ink_prefs SET brand = ?, updated_at = ? WHERE user_id = ?').bind(JSON.stringify(brand), Date.now(), user.id).run();
    return json({ brand });
  }
  if (sub === 'prefs/logo' && method === 'GET') {
    const cur = await inkPrefs(env, user.id);
    if (!cur.brand.logo) throw new HttpError(404, 'Chưa có logo.');
    rc.quiet = true;
    return serveObject(env, req, `ink-brand/${user.id}/${cur.brand.logo}`, cur.brand.logo.endsWith('png') ? 'image/png' : cur.brand.logo.endsWith('webp') ? 'image/webp' : 'image/jpeg', { 'cache-control': 'private, max-age=60' });
  }
  if (sub === 'voices/preview' && method === 'POST') {
    // hear a voice before choosing it: a fixed sample (cached), or the person's own sentence read with their dictionary
    const b = await body<any>(req, 4_000), v = s.voice.list.find((x) => x.on && x.id === b.voice);
    if (!v) throw new HttpError(404, 'Không có giọng này.');
    const own = str(String(b.text || '').replace(/\s+/g, ' '), 300).trim();
    const sample = 'Xin chào, đây là giọng đọc cho video của bạn. Mỗi ngày học một điều nhỏ, một năm sau bạn sẽ khác hẳn.';
    const key = `ink-voice-preview/${v.provider}-${v.code}.mp3`;
    if (!own) { const hit = await env.BUCKET.get(key); if (hit) { rc.quiet = true; return new Response(hit.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=86400' } }); } }
    await useQuota(env, 'u:' + user.id, 'voice', 60);
    const text = own ? applyLexicon(own, b.lexicon !== undefined ? cleanLex(b.lexicon) : (await inkPrefs(env, user.id)).lexicon) : sample;
    const r = await speak(env, v, text, '+8%', false);
    if (!own) await env.BUCKET.put(key, r.audio, { httpMetadata: { contentType: 'audio/mpeg' } });
    rc.log('ink.voice.preview', { data: { voice: v.id, own: !!own, chars: text.length } });
    return new Response(r.audio, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, no-store' } });
  }
  if (sub === 'series' && method === 'GET') {
    rc.quiet = true;
    const rows = (await env.DB.prepare('SELECT * FROM ink_series WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50').bind(user.id).all<any>()).results;
    return json({ series: rows.map((r) => ({ id: r.id, name: r.name, topic: r.topic, style: r.style, videos: r.videos, used: JSON.parse(r.used || '[]').slice(-30) })) });
  }
  if (sub === 'series' && method === 'POST') {
    const b = await body<any>(req, 4_000), name = str(b.name, 80), topic = str(b.topic, 300);
    if (name.length < 2) throw new HttpError(400, 'Hãy đặt tên series.');
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM ink_series WHERE user_id = ?').bind(user.id).first<any>();
    if ((n?.n || 0) >= 50) throw new HttpError(400, 'Tối đa 50 series.');
    const id = randomId(12), t = Date.now();
    await env.DB.prepare('INSERT INTO ink_series(id,user_id,name,topic,style,used,videos,created_at,updated_at) VALUES(?,?,?,?,?,?,0,?,?)').bind(id, user.id, name, topic, str(b.style, 300), '[]', t, t).run();
    return json({ id });
  }
  const sm = sub.match(/^series\/([a-f0-9]{24})$/);
  if (sm && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM ink_series WHERE id = ? AND user_id = ?').bind(sm[1], user.id).run();
    return json({ ok: true });
  }
  if (sub === 'jobs' && method === 'GET') {
    rc.quiet = true;
    const rows = (await env.DB.prepare('SELECT * FROM ink_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 60').bind(user.id).all<any>()).results;
    return json({ jobs: rows.map(view) });
  }
  if (sub === 'jobs' && method === 'POST') return json({ id: await createInk(env, rc, user, await body<any>(req, 40_000)) });
  if (sub === 'catalog' && method === 'GET') { rc.quiet = true; return json(catalog); }
  const m = sub.match(/^jobs\/([a-f0-9]{24})(?:\/(file\/[\w.]+|approve|repace|retry|storyboard|scenes|handoff|myvoice|browser\/video|browser\/done|browser\/progress|browser\/error|browser\/ai|browser\/voice|browser\/plan|browser\/music|browser\/file\/(?:cover|thumb)\.jpg))?$/);
  if (!m) throw new HttpError(404, 'Không tìm thấy.');
  const j = await own(env, user, m[1]), act = m[2] || '';
  if (!act && method === 'GET') {
    rc.quiet = true;
    const v: any = view(j);
    if (j.status === 'browser') { // the owner's page makes the video itself; the script is sized to the voice that will read it
      const input = JSON.parse(j.input || '{}'), voice = s.voice.list.find((x) => x.id === input.voice) || s.voice.list.find((x) => x.id === s.voice.default) || s.voice.list[0];
      v.input = { ...input, voiceProvider: voice?.provider || 'microsoft' };
    }
    v.charge = (await env.DB.prepare('SELECT state FROM ink_ledger WHERE job_id = ?').bind(j.id).first<any>())?.state || null;
    if (j.status === 'queued' || j.status === 'running') {
      // where it stands: place in the queue and what the last videos of this type really took
      const eta = (await etaOf(env))[JSON.parse(j.input || '{}').format || 'ink'], meta = JSON.parse(j.meta || '{}');
      if (j.status === 'queued') {
        const ahead = await env.DB.prepare("SELECT COUNT(*) AS n FROM ink_jobs WHERE status = 'queued' AND created_at < ?").bind(j.created_at).first<any>();
        const busy = await env.DB.prepare("SELECT COUNT(*) AS n FROM ink_jobs WHERE status = 'running'").first<any>();
        v.queue = { ahead: ahead?.n || 0, busy: busy?.n || 0 };
      }
      if (eta?.n >= 3) v.eta = { wait: eta.wait, run: eta.run, left: j.status === 'running' && meta.started ? Math.max(30, eta.run - Math.round((Date.now() - meta.started) / 1000)) : null };
    }
    if (j.status === 'queued' && Date.now() - j.updated_at > 2 * 60_000) {
      const err = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ink:wake_error'").first<any>();
      if (err?.value) v.message = 'Máy dựng chưa khởi động được. Quản trị viên đã được báo; video sẽ tự chạy khi máy dựng sẵn sàng.';
    }
    return json({ job: v });
  }
  if (!act && method === 'DELETE') {
    if (j.status === 'running') throw new HttpError(409, 'Video đang dựng, đợi xong rồi xoá.');
    await dropInk(env, j);
    return json({ ok: true });
  }
  if (act === 'storyboard' && method === 'GET') {
    const sb = j.storyboard ? JSON.parse(j.storyboard) : null;
    if (new URL(req.url).searchParams.get('full') === '1') return json({ storyboard: sb });
    return json({ storyboard: sb && { title: sb.title, cover: sb.cover, caption: sb.caption, hashtags: sb.hashtags, facts: sb.facts || null, scenes: sb.scenes.map((x: any) => ({ say: x.say, layout: x.visual?.layout })), table: sb.script_table, metaphor: sb.metaphor || sb.series_meta?.metaphor,
      proposal: sb.proposal, script: sb.script, question: sb.question, voyage: !!sb.voyage } });
  }
  if (act.startsWith('file/') && method === 'GET') {
    const name = act.slice(5);
    if (!FILES[name]) throw new HttpError(404, 'Không tìm thấy tệp.');
    rc.quiet = name !== 'video.mp4';
    const dl = new URL(req.url).searchParams.get('download') === '1';
    return serveObject(env, req, key(j, name), FILES[name], { 'cache-control': 'private, max-age=600', ...(dl ? { 'content-disposition': `attachment; filename="faciup-${j.id.slice(0, 8)}.${name.split('.')[1]}"` } : {}) });
  }
  if (act === 'approve' && method === 'POST') {
    if (j.status !== 'review' || !(await approveInk(env, rc, j.id))) throw new HttpError(409, 'Phân cảnh này không chờ duyệt.');
    return json({ ok: true });
  }
  if (act === 'scenes' && method === 'PUT') {
    // the user's own corrections, scene by scene: words read, words drawn, the object drawn, how long it stays.
    // Waiting for review: saved in place. A finished video: made again from the corrected storyboard, no AI call.
    if (!j.storyboard) throw new HttpError(409, 'Video này chưa có phân cảnh.');
    const input = JSON.parse(j.input || '{}'), sb = JSON.parse(j.storyboard);
    if ((input.format || 'ink') !== 'ink') throw new HttpError(409, 'Hiện chỉ sửa từng cảnh được với video vẽ tay.');
    if (!['review', 'done', 'failed'].includes(j.status)) throw new HttpError(409, 'Video đang dựng, đợi xong rồi sửa.');
    const b = await body<any>(req, 120_000), edits = Array.isArray(b.scenes) ? b.scenes : [];
    if (edits.length !== sb.scenes.length) throw new HttpError(400, 'Số cảnh không khớp, hãy tải lại trang.');
    let changed = 0;
    sb.scenes.forEach((sc: any, i: number) => {
      const e = edits[i] || {}, before = JSON.stringify([sc.say, sc.visual, sc.hold || 0]);
      if (typeof e.say === 'string') {
        const say = str(e.say.replace(/\s+/g, ' '), 400).trim();
        if (!say) throw new HttpError(400, `Cảnh ${i + 1} chưa có lời đọc.`);
        if (say !== sc.say) { sc.say = say; sc.phrases = []; }
      }
      if (e.visual && typeof e.visual === 'object') sc.visual = mergeText(sc.visual, e.visual);
      const hold = Math.round(num(e.hold, 0, 3, 0) * 2) / 2; if (hold) sc.hold = hold; else delete sc.hold;
      if (JSON.stringify([sc.say, sc.visual, sc.hold || 0]) !== before) changed++;
    });
    if (!changed) throw new HttpError(400, 'Bạn chưa sửa cảnh nào.');
    sb.edited = (sb.edited || 0) + 1;
    rc.log('ink.edit', { data: { job: j.id, scenes: changed, status: j.status } });
    if (j.status === 'review') {
      await env.DB.prepare("UPDATE ink_jobs SET storyboard = ?, updated_at = ? WHERE id = ? AND status = 'review'").bind(JSON.stringify(sb), Date.now(), j.id).run();
      return json({ id: j.id, changed });
    }
    return json({ id: await enqueue(env, rc, user, { ...input, browser: false, rid: '' }, 'render', sb, j.id, j.title, 'edit'), changed });
  }
  if (act === 'myvoice' && method === 'POST') {
    // the person recorded the voice-over themselves: the same storyboard is made again, timed to their voice
    if (!j.storyboard) throw new HttpError(409, 'Video này chưa có phân cảnh.');
    const bytes = await readBytes(req, 30_000_000), type = req.headers.get('content-type') || '';
    const ext = /mpeg|mp3/.test(type) ? 'mp3' : /mp4|m4a|aac/.test(type) ? 'm4a' : /wav/.test(type) ? 'wav' : /ogg|opus/.test(type) ? 'ogg' : '';
    if (!ext || bytes.length < 20_000) throw new HttpError(400, 'Chỉ nhận tệp giọng đọc MP3, M4A, WAV hoặc OGG (tối đa 30 MB).');
    const file = `${randomId(12)}.${ext}`;
    await env.BUCKET.put(`ink-voice/${user.id}/${file}`, bytes, { httpMetadata: { contentType: type } });
    const input = { ...JSON.parse(j.input), myvoice: file, myvoiceExt: ext };
    return json({ id: await enqueue(env, rc, user, input, 'render', JSON.parse(j.storyboard), j.id, j.title) });
  }
  if (act === 'repace' && method === 'POST') {
    // same storyboard, another pace: the voice is read again and the hand redraws, no AI call
    if (!j.storyboard) throw new HttpError(409, 'Video này chưa có phân cảnh.');
    const b = await body<any>(req, 2_000), input = { ...JSON.parse(j.input), pace: pick(b.pace, PACES, 'fast') };
    if (b.voice && s.voice.list.some((v) => v.on && v.id === b.voice)) input.voice = b.voice;
    return json({ id: await enqueue(env, rc, user, { ...input, rid: '' }, 'render', JSON.parse(j.storyboard), j.id, j.title, 'repace') });
  }
  // ---- drawn in the browser: progress, the finished MP4, or give the job to a render machine instead
  if (act.startsWith('browser/') || act === 'handoff') {
    if (j.status !== 'browser') throw new HttpError(409, 'Video này không chờ dựng trên trình duyệt.');
    const meta = JSON.parse(j.meta || '{}'), input = JSON.parse(j.input || '{}');
    const count = async (k: string, max: number) => {
      const n = (meta[k] || 0) + 1; if (n > max) throw new HttpError(429, 'Video này đã dùng hết lượt hỏi cho phép. Bấm "Để máy chủ dựng giúp" hoặc tạo lại.');
      meta[k] = n; await env.DB.prepare('UPDATE ink_jobs SET meta = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(meta), Date.now(), j.id).run();
    };
    if (act === 'browser/ai' && method === 'POST') {
      // the browser sends prompt names and values; the prompts and the keys stay here
      const b = await body<any>(req, 200_000);
      // every answer is kept with the job: a retry after an error asks again only from the step that failed
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([b.system, b.user, b.temperature, b.attempt]))))].map((x) => x.toString(16).padStart(2, '0')).join('');
      const kept = await env.BUCKET.get(`ink/${user.id}/${j.id}/ai/${hash}.json`);
      if (kept) return json({ ...(await kept.json<any>()), cached: true });
      await count('aiCalls', 80);
      const chain = s.ai.order.filter((p, i) => i === 0 || s.ai.fallback).flatMap((p) => (p === 'gemini' ? s.ai.gemini : s.ai.openai).split(',').map((model) => ({ provider: p, model })));
      const r = await askChain(env, chain, fillPrompt(b.system), fillPrompt(b.user), num(b.temperature, 0, 1.5, 0.7), Math.round(num(b.attempt, 0, 10, 0)));
      rc.log('ink.ai', { data: { job: j.id, provider: r.provider, model: r.model, step: str(b.user?.name, 30) } });
      await env.BUCKET.put(`ink/${user.id}/${j.id}/ai/${hash}.json`, JSON.stringify(r), { httpMetadata: { contentType: 'application/json' } });
      return json(r);
    }
    if (act === 'browser/voice' && method === 'POST') {
      const b = await body<any>(req, 60_000), text = str(String(b.text || '').replace(/\s+/g, ' '), 20_000);
      if (text.length < 5) throw new HttpError(400, 'Không có lời đọc.');
      await count('voiceCalls', 6);
      const v = s.voice.list.find((x) => x.id === input.voice) || s.voice.list.find((x) => x.id === s.voice.default) || s.voice.list[0];
      const asked = /^[+-]\d{1,2}%$/.test(String(b.rate || '')) ? Math.max(-15, Math.min(50, parseInt(b.rate, 10))) : null;
      const rate = asked != null ? (asked >= 0 ? '+' : '') + asked + '%' : ({ slow: '+0%', normal: '+8%', fast: '+15%', faster: '+25%' } as Record<string, string>)[input.pace] || '+8%';
      const r = await speak(env, v, applyLexicon(text, cleanLex(input.lexicon)), rate, s.voice.fallback);
      let bin = ''; for (let i = 0; i < r.audio.length; i += 0x8000) bin += String.fromCharCode(...r.audio.subarray(i, i + 0x8000));
      rc.log('ink.voice', { data: { job: j.id, provider: r.provider, chars: text.length, ...(r.errors.length ? { errors: r.errors } : {}) } });
      if (r.provider !== v.provider) await inkVoiceFailed(env, v, r.errors.join(' | '));
      return json({ audio: btoa(bin), words: r.words, provider: r.provider });
    }
    if (act === 'browser/plan' && method === 'POST') {
      const b = await body<any>(req, 400_000), sb = b.storyboard;
      if (!sb || !Array.isArray(sb.scenes) || !sb.scenes.length) throw new HttpError(400, 'Phân cảnh rỗng.');
      const next = { ...meta, caption: str(sb.caption, 1000), hashtags: (Array.isArray(sb.hashtags) ? sb.hashtags : []).map((x: unknown) => '#' + str(x, 40).replace(/^#+/, '')).filter((x: string) => /^#[A-Za-z0-9_]{2,40}$/.test(x)).slice(0, 10), ai: sb.ai };
      await env.DB.prepare("UPDATE ink_jobs SET storyboard = ?, title = ?, meta = ?, stage = 'render', progress = 30, message = 'Phân cảnh xong', updated_at = ? WHERE id = ?")
        .bind(JSON.stringify(sb), (input.mode === 'script' ? clip(str(sb.title, 300), 100) : '') || j.title, JSON.stringify(next), Date.now(), j.id).run();
      return json({ ok: true });
    }
    if (act === 'browser/music' && method === 'GET') {
      const obj = input.music ? await env.BUCKET.get(`ink-music/${j.user_id}/${input.music}`) : null;
      if (!obj) throw new HttpError(404, 'Không có nhạc riêng.');
      return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'audio/mpeg' } });
    }
    const bf = act.match(/^browser\/file\/((?:cover|thumb)\.jpg)$/);
    if (bf && method === 'PUT') {
      if (Number(req.headers.get('content-length')) > 2_000_000) throw new HttpError(413, 'Ảnh quá lớn.');
      await env.BUCKET.put(key(j, bf[1]), req.body, { httpMetadata: { contentType: 'image/jpeg' } });
      await env.DB.prepare('UPDATE ink_jobs SET meta = ? WHERE id = ?').bind(JSON.stringify({ ...meta, files: [...new Set([...(meta.files || []), bf[1]])] }), j.id).run();
      return json({ ok: true });
    }
    if (act === 'browser/error' && method === 'POST') {
      // shown on the admin's "Video gần đây"; cleared when the device makes progress again
      const b = await body<any>(req, 4_000);
      await env.DB.prepare('UPDATE ink_jobs SET error = ?, updated_at = ? WHERE id = ?').bind(str(`Trên máy người dùng, bước "${str(b.step, 120)}": ${str(b.error, 600)}`, 800), Date.now(), j.id).run();
      rc.log('ink.browser_error', { data: { job: j.id, step: str(b.step, 120), error: str(b.error, 300) } });
      return json({ ok: true });
    }
    if (act === 'browser/progress' && method === 'POST') {
      rc.quiet = true;
      const b = await body<any>(req, 1_000);
      await env.DB.prepare('UPDATE ink_jobs SET progress = ?, message = ?, error = NULL, updated_at = ? WHERE id = ?').bind(Math.round(num(b.progress, 60, 99, 60)), str(b.message, 160), Date.now(), j.id).run();
      return json({ ok: true });
    }
    if (act === 'browser/video' && method === 'PUT') {
      if (req.headers.get('content-type') !== 'video/mp4') throw new HttpError(415, 'Chỉ nhận MP4.');
      if (Number(req.headers.get('content-length')) > 100_000_000) throw new HttpError(413, 'Video quá lớn (tối đa 100 MB).');
      await env.BUCKET.put(key(j, 'video.mp4'), req.body, { httpMetadata: { contentType: 'video/mp4' } });
      await env.DB.prepare('UPDATE ink_jobs SET meta = ? WHERE id = ?').bind(JSON.stringify({ ...meta, files: [...new Set([...(meta.files || []), 'video.mp4'])] }), j.id).run();
      return json({ ok: true });
    }
    if (act === 'browser/done' && method === 'POST') {
      const head = await env.BUCKET.head(key(j, 'video.mp4'));
      if (!head || head.size < 10_000) throw new HttpError(400, 'Chưa tải video lên.');
      const b = await body<any>(req, 2_000).catch(() => ({} as any)), now = Date.now();
      await env.DB.prepare("UPDATE ink_jobs SET status = 'done', progress = 100, message = 'Đã xong', finished_at = ?, updated_at = ? WHERE id = ?").bind(now, now, j.id).run();
      await settle(env, j.id);
      if (Array.isArray(b.footage) && b.footage.length) {
      const ids = b.footage.map((x: unknown) => String(x)).filter((x: string) => /^v?\d{1,12}$/.test(x)).slice(0, 80);
      const all = [...ids, ...(await recentFootage(env)).filter((x) => !ids.includes(x))].slice(0, 600);
      await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('ink:footage', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(all), now).run();
    }
    rc.log('ink.done', { data: { job: j.id, machine: 'browser', renderSec: num(b.seconds, 0, 99999, 0), device: str(b.device, 80), size: head.size } });
      rc.wait(zaloInk(env, rc, j, 'done'));
      return json({ ok: true });
    }
    if (act === 'handoff' && method === 'POST') {
      const input = { ...JSON.parse(j.input), browser: false };
      await env.DB.prepare("UPDATE ink_jobs SET status = 'queued', stage = CASE WHEN storyboard IS NULL THEN 'plan' ELSE 'render' END, input = ?, progress = 0, message = 'Đang chờ máy dựng', updated_at = ? WHERE id = ?").bind(JSON.stringify(input), Date.now(), j.id).run();
      rc.log('ink.handoff', { data: { job: j.id } });
      rc.wait(dispatch(env));
      return json({ ok: true });
    }
  }
  if (act === 'retry' && method === 'POST') {
    if (j.status !== 'failed') throw new HttpError(409, 'Chỉ thử lại được video bị lỗi.');
    await recharge(env, user, j.id);
    await env.DB.prepare("UPDATE ink_jobs SET status = 'queued', error = '', progress = 0, message = 'Đang chờ máy dựng', updated_at = ? WHERE id = ?").bind(Date.now(), j.id).run();
    rc.wait(dispatch(env));
    return json({ ok: true });
  }
  throw new HttpError(405, 'Không hỗ trợ.');
}

// ---------------------------------------------------------------- the render machine
export async function inkRunner(req: Request, env: XEnv, sub: string, rc: Rc): Promise<Response> {
  const who = await runnerAuth(env, req);
  if (!who) throw new HttpError(401, 'Không có quyền.');
  const now = Date.now();
  // the newest machine code, for servers that keep themselves up to date (needs a connection code too)
  if (sub === 'bundle' && req.method === 'GET') {
    const obj = await env.BUCKET.get('ink-runner/bundle.tar.gz');
    if (!obj) throw new HttpError(404, 'Trang chưa có gói máy dựng (triển khai lại web).');
    return new Response(obj.body, { headers: { 'content-type': 'application/gzip', 'x-ink-version': await bundleVersion(env) } });
  }
  if (sub === 'claim' && req.method === 'POST') {
    const cb = await body<any>(req, 1_000).catch(() => ({} as any));
    // remember who is online (at most once a minute per machine: a polling server must not fill the database)
    const name = str(cb.runner, 60) || who, kind = pick(cb.kind, ['server', 'cloudrun', 'github'] as const, who.startsWith('server:') ? 'server' : 'github');
    const seen = await machinesSeen(env);
    if (!seen[name] || now - seen[name].at > 60_000) {
      for (const [k, v] of Object.entries(seen)) if (now - v.at > 7 * 86_400_000) delete seen[k];
      seen[name] = { kind, at: now, version: str(cb.version, 40), host: str(cb.host, 60) };
      await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('ink:seen', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(seen), now).run();
    }
    await env.DB.prepare("UPDATE ink_jobs SET status = 'queued', lease = '' WHERE status = 'running' AND heartbeat < ?").bind(now - STALE_MS).run();
    const lease = 'lease-' + randomId(16);
    const j = await env.DB.prepare(`UPDATE ink_jobs SET status = 'running', lease = ?, heartbeat = ?, progress = 1, message = 'Máy dựng đã nhận việc', updated_at = ?,
        meta = json_set(CASE WHEN json_valid(meta) THEN meta ELSE '{}' END, '$.started', ?, '$.queued', updated_at)
      WHERE id = (SELECT id FROM ink_jobs WHERE status = 'queued' AND (COALESCE(json_extract(input, '$.format'), 'ink') != 'shorts3d' OR ? = 1) ORDER BY created_at LIMIT 1) AND status = 'queued' RETURNING *`).bind(lease, now, now, now, cb.shorts3d === true ? 1 : 0).first<any>();
    if (!j) {
      rc.quiet = true;
      // storyboards a user is looking at right now: the machine waits for them instead of leaving
      const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM ink_jobs WHERE status = 'review' AND updated_at > ?").bind(now - 30 * 60_000).first<any>();
      return json({ job: null, review: r?.n || 0, version: kind === 'server' ? await bundleVersion(env) : '' });
    }
    rc.userId = j.user_id;
    const { s } = await settings(env), input = JSON.parse(j.input);
    if (input.format === 'shorts3d' && j.stage === 'plan') {
      const recent = (await env.DB.prepare("SELECT storyboard FROM ink_jobs WHERE user_id = ? AND id != ? AND status = 'done' AND json_extract(input, '$.format') = 'shorts3d' ORDER BY finished_at DESC LIMIT 8").bind(j.user_id, j.id).all<any>()).results;
      input.avoid3d = recent.map((r: any) => { try { return str(JSON.parse(r.storyboard || '{}').metaphor, 300); } catch { return ''; } }).filter(Boolean);
    }
    const voice = s.voice.list.find((v) => v.id === input.voice) || s.voice.list.find((v) => v.id === s.voice.default) || s.voice.list[0];
    rc.log('ink.start', { data: { job: j.id, stage: j.stage, waitedSec: Math.round((now - j.updated_at) / 1000) } });
    return json({ job: { id: j.id, lease, stage: j.stage, input: { ...input, musicExt: input.music ? input.music.split('.').pop() : '' }, storyboard: j.storyboard ? JSON.parse(j.storyboard) : null,
      config: { env: {
        INK_AI_ORDER: s.ai.order.join(','), INK_AI_FALLBACK: s.ai.fallback ? '1' : '0', INK_GEMINI_MODELS: s.ai.gemini, INK_OPENAI_MODELS: s.ai.openai,
        GEMINI_API_KEY: env.GEMINI_API_KEY || '', OPENAI_API_KEY: env.OPENAI_API_KEY || '', EVERAI_API_KEY: (env as any).EVERAI_API_KEY || '',
        // footage other videos used lately: this one picks different shots (many people, same topic, different videos)
        // a series' own 3D prop is written by Claude when its key is set (Gemini/OpenAI otherwise)
        ...(input.series ? { ANTHROPIC_API_KEY: (env as any).ANTHROPIC_API_KEY || '' } : {}),
        ...(input.format === 'cine' || input.format === 'money' ? { PIXABAY_API_KEY: (env as any).PIXABAY_API_KEY || '', HBX_AVOID: (await recentFootage(env)).join(',') } : {}),
        INK_VOICE_PROVIDER: voice.provider, INK_VOICE_FALLBACK: s.voice.fallback ? '1' : '0', INK_WPS: String((await wpsOf(env))[voice.provider + ':' + voice.code] || ''),
        ...(voice.provider === 'microsoft' ? { INK_MS_VOICE: voice.code } : { EVERAI_VOICE_CODE: voice.code }),
      } } } });
  }
  const m = sub.match(/^jobs\/([a-f0-9]{24})\/(progress|planned|exported|done|fail|music|myvoice|logo|file\/[\w.]+)$/);
  if (!m) throw new HttpError(404, 'Không tìm thấy.');
  const lease = req.headers.get('x-nv-lease') || '';
  const j = await env.DB.prepare('SELECT * FROM ink_jobs WHERE id = ?').bind(m[1]).first<any>();
  if (j && j.lease === lease && ((m[2] === 'done' && j.status === 'done') || (m[2] === 'fail' && j.status === 'failed'))) return json({ ok: true });
  if (!j || j.status !== 'running' || j.lease !== lease) throw new HttpError(409, 'Lượt dựng đã hết hạn.');
  rc.userId = j.user_id;
  const act = m[2], meta = JSON.parse(j.meta || '{}'), input = JSON.parse(j.input);
  if (act === 'progress') {
    rc.quiet = true;
    const b = await body<any>(req, 1_000);
    await env.DB.prepare('UPDATE ink_jobs SET progress = ?, message = ?, heartbeat = ?, updated_at = ? WHERE id = ? AND lease = ?')
      .bind(Math.round(num(b.progress, 0, 99, j.progress)), str(b.message, 160), now, now, j.id, lease).run();
    return json({ ok: true });
  }
  if (act === 'logo' && req.method === 'GET') {
    const obj = input.brand?.logo ? await env.BUCKET.get(`ink-brand/${j.user_id}/${input.brand.logo}`) : null;
    if (!obj) throw new HttpError(404, 'Không có logo.');
    return new Response(obj.body);
  }
  if (act === 'myvoice' && req.method === 'GET') {
    const obj = input.myvoice ? await env.BUCKET.get(`ink-voice/${j.user_id}/${input.myvoice}`) : null;
    if (!obj) throw new HttpError(404, 'Không có giọng đọc.');
    return new Response(obj.body);
  }
  if (act === 'music' && req.method === 'GET') {
    const obj = input.music ? await env.BUCKET.get(`ink-music/${j.user_id}/${input.music}`) : null;
    if (!obj) throw new HttpError(404, 'Không có nhạc.');
    return new Response(obj.body);
  }
  if (act.startsWith('file/') && req.method === 'PUT') {
    const name = act.slice(5);
    if (!FILES[name]) throw new HttpError(400, 'Tên tệp không hợp lệ.');
    if (Number(req.headers.get('content-length')) > (name === 'video.mp4' ? 300_000_000 : name === 'draw.json' || name === 'audio.aac' ? 40_000_000 : 8_000_000)) throw new HttpError(413, 'Tệp quá lớn.');
    await env.BUCKET.put(key(j, name), req.body, { httpMetadata: { contentType: FILES[name] } });
    const files = [...new Set([...(meta.files || []), name])];
    await env.DB.prepare('UPDATE ink_jobs SET meta = ?, heartbeat = ? WHERE id = ?').bind(JSON.stringify({ ...meta, files }), now, j.id).run();
    return json({ ok: true });
  }
  if (act === 'planned' && req.method === 'POST') {
    const b = await body<any>(req, 400_000), sb = b.storyboard;
    if (!sb || !Array.isArray(sb.scenes) || !sb.scenes.length) throw new HttpError(400, 'Phân cảnh rỗng.');
    // the user's own topic stays the video's name; the AI's title only names videos made from a pasted script
    const title = (input.mode === 'script' ? clip(str(sb.title, 300), 100) : '') || j.title, next = { ...meta, planned: now, steps: cleanSteps(b.steps), caption: str(sb.caption, 1000), hashtags: (Array.isArray(sb.hashtags) ? sb.hashtags : []).map((x: unknown) => '#' + str(x, 40).replace(/^#+/, '')).filter((x: string) => /^#[A-Za-z0-9_]{2,40}$/.test(x)).slice(0, 10), ai: b.ai };
    // the series remembers the metaphor and prop this video used: the next one invents another
    const sm = sb.series_meta;
    if (input.series?.id && sm?.ok && sm.prop) {
      const sr = await env.DB.prepare('SELECT used FROM ink_series WHERE id = ? AND user_id = ?').bind(input.series.id, j.user_id).first<any>();
      if (sr) {
        const used = [...JSON.parse(sr.used || '[]'), { metaphor: str(sm.metaphor, 200), prop: str(sm.prop, 30), job: j.id, at: now }].slice(-200);
        await env.DB.prepare('UPDATE ink_series SET used = ?, videos = videos + 1, updated_at = ? WHERE id = ?').bind(JSON.stringify(used), now, input.series.id).run();
      }
    }
    const review = input.review === true && !input.browser; // in the browser the storyboard is shown before drawing anyway
    await env.DB.prepare(`UPDATE ink_jobs SET storyboard = ?, title = ?, meta = ?, stage = 'render', status = ?, lease = ?, progress = ?, message = ?, updated_at = ? WHERE id = ?`)
      .bind(JSON.stringify(sb), title, JSON.stringify(next), review ? 'review' : 'running', review ? '' : lease, 40, review ? 'Phân cảnh xong, chờ bạn duyệt' : 'Phân cảnh xong, đang dựng', now, j.id).run();
    if (review) { rc.wait(notify(env, j.user_id, j.id, 'Phân cảnh đã sẵn sàng', `"${title}": xem phân cảnh và bấm Dựng video.`)); rc.wait(zaloInk(env, rc, { ...j, title }, 'review', sb)); }
    return json({ render: !review });
  }
  if (act === 'exported' && req.method === 'POST') {
    // the drawing plan and the sound are ready: the user's browser draws the video
    if (!(await env.BUCKET.head(key(j, 'draw.json'))) || !(await env.BUCKET.head(key(j, 'audio.aac')))) throw new HttpError(400, 'Chưa tải bản vẽ lên.');
    const b = await body<any>(req, 5_000).catch(() => ({} as any));
    await env.DB.prepare("UPDATE ink_jobs SET status = 'browser', lease = '', progress = 60, message = 'Sẵn sàng dựng trên máy của bạn', duration = ?, meta = ?, updated_at = ? WHERE id = ?")
      .bind(num(b.duration, 0, 3600, 0), JSON.stringify({ ...meta, voice: str(b.voice, 40), ai: b.ai || meta.ai }), now, j.id).run();
    rc.log('ink.exported', { data: { job: j.id, videoSec: b.duration } });
    await voiceUsed(env, j, b);
    rc.wait(notify(env, j.user_id, j.id, 'Sẵn sàng dựng trên máy của bạn', `"${j.title}": mở trang video để máy bạn vẽ và xuất video.`));
    return json({ ok: true });
  }
  if (act === 'done' && req.method === 'POST') {
    if (!(await env.BUCKET.head(key(j, 'video.mp4')))) throw new HttpError(400, 'Chưa tải video lên.');
    const b = await body<any>(req, 5_000).catch(() => ({} as any));
    await env.DB.prepare("UPDATE ink_jobs SET status = 'done', progress = 100, message = 'Đã xong', lease = ?, duration = ?, meta = ?, finished_at = ?, updated_at = ? WHERE id = ?")
      .bind(lease, num(b.duration, 0, 3600, 0), JSON.stringify({ ...meta, voice: str(b.voice, 40), renderSec: num(b.seconds, 0, 99999, 0), steps: { ...(meta.steps || {}), ...cleanSteps(b.steps) }, ai: b.ai || meta.ai, cost: costOf(j, b.ai || meta.ai, num(b.seconds, 0, 99999, 0)), ...(b.sync && typeof b.sync === 'object' ? { sync: { median: num(b.sync.median, 0, 60, 0), p90: num(b.sync.p90, 0, 60, 0), bias: num(b.sync.bias, -60, 60, 0) } } : {}) }), now, now, j.id).run();
    rc.log('ink.done', { data: { job: j.id, videoSec: b.duration, renderSec: b.seconds, voice: b.voice, totalSec: Math.round((now - j.created_at) / 1000) } });
    await settle(env, j.id);
    rc.wait(learnEta(env).catch(() => {}));
    { const { s } = await settings(env); rc.wait(learnWps(env, s.voice.list.find((v) => v.id === input.voice), b.voiceStats).catch(() => {})); }
    await voiceUsed(env, j, b);
    rc.wait(notify(env, j.user_id, j.id, 'Video đã xong ✓', `"${j.title}" đã dựng xong. Bấm để xem và tải về.`));
    rc.wait(zaloInk(env, rc, { ...j, duration: num(b.duration, 0, 3600, 0) }, 'done'));
    return json({ ok: true });
  }
  if (act === 'fail' && req.method === 'POST') {
    const fb = await body<any>(req, 5_000).catch(() => ({} as any)), error = str(fb.error, 300) || 'Dựng video thất bại.';
    const failedAt = PHASES.includes(fb.phase) ? fb.phase : j.stage === 'plan' ? 'script' : 'render';
    await env.DB.prepare("UPDATE ink_jobs SET status = 'failed', error = ?, message = '', meta = ?, finished_at = ?, updated_at = ? WHERE id = ?")
      .bind(error, JSON.stringify({ ...meta, failedAt, steps: cleanSteps(fb.steps) }), now, now, j.id).run();
    await refundJob(env, j);
    rc.log('ink.fail', { ok: false, data: { job: j.id, stage: j.stage, error } });
    rc.wait(notify(env, j.user_id, j.id, 'Video chưa dựng được', `"${j.title}": ${error.slice(0, 120)}`));
    rc.wait(zaloInk(env, rc, j, 'failed', error));
    return json({ ok: true });
  }
  throw new HttpError(405, 'Không hỗ trợ.');
}

async function notify(env: XEnv, userId: string, id: string, title: string, text: string) {
  try { await pushUser(env, userId, { title, body: text, url: `/ink/${id}` }, 'mailto:' + env.config.legal.email); } catch { /* the page shows it anyway */ }
}

// ---------------------------------------------------------------- operations board (admin): measured, not promised
const pct = (a: number[], q: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]); };
const sec = (ms: number) => Math.max(0, ms) / 1000;
/** the last N days of videos: how long people waited and the machine worked (median, 90th percentile), where videos
 *  failed, what each one cost, and what that means for a promise to customers and for render capacity */
export async function inkStats(env: Env, days: number) {
  const since = Date.now() - days * 86_400_000;
  const rows = (await env.DB.prepare('SELECT id, status, stage, input, meta, error, duration, created_at, finished_at FROM ink_jobs WHERE created_at > ? ORDER BY created_at DESC LIMIT 3000').bind(since).all<any>()).results || [];
  const pr = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ink:prices'").first<any>();
  const prices = { aiCall: 0, voiceK: 0, machineMin: 0, ...(pr?.value ? JSON.parse(pr.value) : {}) };
  type Acc = { n: number; done: number; failed: number; open: number; wait: number[]; run: number[]; total: number[]; video: number[]; steps: Record<string, number[]>; ai: number[]; chars: number[]; machine: number[]; cost: number[] };
  const acc = (): Acc => ({ n: 0, done: 0, failed: 0, open: 0, wait: [], run: [], total: [], video: [], steps: {}, ai: [], chars: [], machine: [], cost: [] });
  const by: Record<string, Acc> = {}, all = acc(), fails: Record<string, number> = {}, errors: Record<string, number> = {}, models: Record<string, number> = {};
  const daily: Record<string, { created: number; done: number; failed: number }> = {}, hours: Record<string, number> = {};
  for (const r of rows) {
    const input = JSON.parse(r.input || '{}'), meta = JSON.parse(r.meta || '{}'), f = input.browser ? 'browser' : input.format || 'ink';
    const d = new Date(r.created_at + 7 * 3600_000).toISOString(), day = d.slice(0, 10), hour = d.slice(0, 13);
    (daily[day] ||= { created: 0, done: 0, failed: 0 }).created++; hours[hour] = (hours[hour] || 0) + 1;
    for (const a of [by[f] ||= acc(), all]) {
      a.n++;
      if (r.status === 'done') {
        a.done++;
        if (meta.started) { a.wait.push(sec(meta.started - (meta.queued || r.created_at))); if (r.finished_at) a.run.push(sec(r.finished_at - meta.started)); }
        if (r.finished_at) a.total.push(sec(r.finished_at - r.created_at));
        if (r.duration) a.video.push(r.duration);
        for (const [k, v] of Object.entries(meta.steps || {})) (a.steps[k] ||= []).push(Number(v));
        const c = meta.cost;
        if (c) {
          a.ai.push(c.aiCalls || 0); a.chars.push(c.voiceChars || 0); a.machine.push(c.machineSec || 0);
          a.cost.push((c.aiCalls || 0) * prices.aiCall + (meta.voice === 'everai' ? (c.voiceChars || 0) / 1000 * prices.voiceK : 0) + (c.machineSec || 0) / 60 * prices.machineMin);
        }
      } else if (r.status === 'failed') a.failed++;
      else a.open++;
    }
    if (r.status === 'done') { daily[day].done++; for (const [m, k] of Object.entries(meta.cost?.models || {})) models[m] = (models[m] || 0) + Number(k); }
    if (r.status === 'failed') {
      daily[day].failed++;
      const at = meta.failedAt || (r.stage === 'plan' ? 'script' : 'render'); fails[at] = (fails[at] || 0) + 1;
      const e = String(r.error || 'không rõ').replace(/[0-9a-f]{12,}/g, '…').replace(/\d+(\.\d+)?/g, '#').slice(0, 90); errors[e] = (errors[e] || 0) + 1;
    }
  }
  const sum = (a: Acc) => {
    const avg = (x: number[]) => x.length ? Math.round(x.reduce((p, q) => p + q, 0) / x.length) : 0;
    return { n: a.n, done: a.done, failed: a.failed, open: a.open, success: a.done + a.failed ? Math.round(100 * a.done / (a.done + a.failed)) : null,
      wait: { p50: pct(a.wait, .5), p90: pct(a.wait, .9) }, run: { p50: pct(a.run, .5), p90: pct(a.run, .9) }, total: { p50: pct(a.total, .5), p90: pct(a.total, .9), n: a.total.length },
      video: avg(a.video), steps: Object.fromEntries(PHASES.filter((k) => a.steps[k]?.length).map((k) => [k, pct(a.steps[k], .5)])),
      cost: { ai: avg(a.ai), chars: avg(a.chars), machine: avg(a.machine), vnd: avg(a.cost), n: a.cost.length } };
  };
  const total = sum(all), slowest = PHASES.filter((k) => total.steps[k]).sort((x, y) => total.steps[y] - total.steps[x])[0];
  // what the numbers allow: a promise only once there is enough history, more machines only when people wait
  const advice: string[] = [];
  if (total.total.n < 20) advice.push(`Mới có ${total.total.n} video hoàn thành có đủ mốc thời gian trong ${days} ngày: chưa đủ để cam kết thời gian với khách (cần ít nhất 20).`);
  else advice.push(`Có thể hứa với khách: 9/10 video xong trong khoảng ${Math.ceil(total.total.p90 / 60)} phút (hiện trung vị ${Math.ceil(total.total.p50 / 60)} phút).`);
  if (total.wait.p90 > 600) advice.push(`Khách chờ máy lâu (90% chờ dưới ${Math.ceil(total.wait.p90 / 60)} phút): nên thêm máy chủ riêng hoặc Cloud Run để chạy song song.`);
  if (total.success !== null && total.success < 90) {
    const worst = Object.entries(fails).sort((a, b) => b[1] - a[1])[0];
    advice.push(`Tỉ lệ thành công ${total.success}% (dưới 90%): lỗi nhiều nhất ở bước "${worst ? worst[0] : '?'}" — xem bảng lỗi bên dưới trước khi mở bán rộng.`);
  }
  if (slowest) advice.push(`Bước tốn thời gian nhất: "${slowest}" (trung vị ${total.steps[slowest]} giây).`);
  const peak = Object.entries(hours).sort((a, b) => b[1] - a[1])[0];
  if (peak) advice.push(`Giờ đông nhất: ${peak[0].slice(11)}h ngày ${peak[0].slice(8, 10)}/${peak[0].slice(5, 7)} với ${peak[1]} video.`);
  const ledger = (await env.DB.prepare('SELECT state, reason, COUNT(*) AS n FROM ink_ledger WHERE created_at > ? GROUP BY state, reason').bind(since).all<any>()).results || [];
  return { days, prices, total, byFormat: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, sum(v)])),
    fails, errors: Object.entries(errors).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([text, n]) => ({ text, n })),
    models: Object.entries(models).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([model, n]) => ({ model, n })),
    daily: Object.entries(daily).sort((a, b) => a[0].localeCompare(b[0])).map(([day, v]) => ({ day, ...v })), ledger, advice };
}

// ---------------------------------------------------------------- admin
export async function inkAdmin(req: Request, env: XEnv, sub: string, rc: Rc): Promise<Response | null> {
  if (!sub.startsWith('ink')) return null;
  if (sub === 'ink/voices/test' && req.method === 'POST') {
    const b = await body<any>(req, 500), provider = b.provider === 'everai' ? 'everai' : 'microsoft', code = str(b.code, 60);
    if (!/^[A-Za-z0-9_-]{3,60}$/.test(code)) throw new HttpError(400, 'Mã giọng không hợp lệ.');
    const r = await testInkVoice(env, { provider, code });
    rc.log('admin.ink.voice', { ok: r.ok, data: { provider, code, error: r.error } });
    let audio = ''; if (r.audio) { let bin = ''; for (let i = 0; i < r.audio.length; i += 0x8000) bin += String.fromCharCode(...r.audio.subarray(i, i + 0x8000)); audio = btoa(bin); }
    return json({ ok: r.ok, ms: r.ms, error: r.error, audio });
  }
  if (sub === 'ink/machines/test' && req.method === 'POST') {
    // check a machine without giving it work: the token/job/server is reached and the answer explained
    const b = await body<any>(req, 2_000), { s, token: saved } = await settings(env), t0 = Date.now();
    const out = (ok: boolean, detail: string, hint = '') => json({ ok, detail, hint, ms: Date.now() - t0 });
    if (b.kind === 'github') {
      const token = str(b.token, 300) || saved, repo = str(b.repo, 120) || s.github.repo, wf = str(b.workflow, 120) || s.github.workflow;
      if (!token) return out(false, 'Chưa có GitHub token.', 'Tạo token fine-grained: Settings → Developer settings → Fine-grained tokens, chọn repo này, quyền Actions: Read and write.');
      const gh = (path: string) => fetch('https://api.github.com/repos/' + repo + path, { headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'user-agent': 'faciup-ink', 'x-github-api-version': '2022-11-28' }, signal: AbortSignal.timeout(15_000) });
      const r1 = await gh('');
      if (r1.status === 401) return out(false, 'GitHub từ chối token (HTTP 401: sai hoặc đã hết hạn).', 'Tạo token mới rồi dán lại.');
      if (r1.status === 404) return out(false, `Token không thấy repo ${repo} (HTTP 404).`, 'Kiểm tra tên repo, và khi tạo token chọn "Only select repositories" → đúng repo này.');
      if (!r1.ok) return out(false, `GitHub trả lỗi HTTP ${r1.status}.`);
      const r2 = await gh('/actions/workflows/' + encodeURIComponent(wf));
      if (r2.status === 404) return out(false, `Không thấy workflow ${wf} trong repo (HTTP 404).`, 'Kiểm tra tên tệp workflow trong .github/workflows/.');
      if (r2.status === 403) return out(false, 'Token chưa có quyền Actions (HTTP 403).', 'Sửa token: Repository permissions → Actions: Read and write.');
      if (!r2.ok) return out(false, `GitHub trả lỗi HTTP ${r2.status} khi đọc workflow.`);
      const w: any = await r2.json();
      return out(w.state === 'active', w.state === 'active' ? `Token vào được ${repo} và thấy workflow "${w.name}". Bấm "Bật máy dựng ngay" để chạy thử thật.` : `Workflow đang tắt (${w.state}).`, w.state === 'active' ? '' : 'Bật lại workflow trong tab Actions của repo.');
    }
    if (b.kind === 'cloudrun') {
      if (!env.GCP_TRIGGER_KEY || !env.GCP_PROJECT || !env.GCP_REGION) return out(false, 'Trang chưa nối Google Cloud (thiếu GCP_TRIGGER_KEY / GCP_PROJECT / GCP_REGION).', 'Làm theo hướng dẫn Google Cloud Run bên dưới.');
      const { accessToken } = await import('./gcp.ts');
      const job = str(b.job, 60) || s.machines.cloudJob;
      const r = await fetch(`https://run.googleapis.com/v2/projects/${env.GCP_PROJECT}/locations/${env.GCP_REGION}/jobs/${job}`, { headers: { authorization: 'Bearer ' + (await accessToken(env)) }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
      if (!r) return out(false, 'Không gọi được Google Cloud.');
      if (r.ok) return out(true, `Google Cloud thấy job ${job} (${env.GCP_REGION}). Sẵn sàng nhận video.`);
      const t = await r.text(), msg = t.match(/"message": *"([^"]{0,200})/)?.[1] || '';
      return out(false, `Google Cloud trả lỗi HTTP ${r.status}${msg ? ': ' + msg : ''}.`, r.status === 404 ? 'Job chưa được triển khai: chạy workflow "Ink Studio — triển khai lên Google Cloud".' : /billing/i.test(t) ? 'Dự án chưa bật thanh toán: Billing → Link a billing account.' : '');
    }
    if (b.kind === 'server') {
      const seen = Object.entries(await machinesSeen(env)).filter(([, v]) => v.kind === 'server');
      const on = seen.filter(([, v]) => Date.now() - v.at < 90_000);
      return out(on.length > 0, on.length ? `${on.length} máy chủ đang online: ${on.map(([n]) => n).join(', ')}.` : seen.length ? 'Có máy chủ đã kết nối nhưng hiện không online.' : 'Chưa có máy chủ nào kết nối.', on.length ? '' : 'Trên máy chủ chạy: sudo systemctl status faciup-ink (hoặc cài lại bằng lệnh ở mục Máy chủ riêng).');
    }
    return out(true, 'Trình duyệt của người dùng tự dựng, không cần kiểm tra.');
  }
  if (sub === 'ink/voices/catalog' && req.method === 'GET') {
    const p = new URL(req.url).searchParams.get('p');
    return json(p === 'everai' ? await voiceCatalog(env, 'everai') : { source: 'api', voices: await microsoftVoices() });
  }
  if (sub === 'ink/stats' && req.method === 'GET') return json(await inkStats(env, Math.round(num(new URL(req.url).searchParams.get('days'), 1, 90, 7))));
  if (sub === 'ink/prices' && req.method === 'PUT') {
    const b = await body<any>(req, 2_000), p = { aiCall: num(b.aiCall, 0, 100_000, 0), voiceK: num(b.voiceK, 0, 100_000, 0), machineMin: num(b.machineMin, 0, 100_000, 0) };
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('ink:prices', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(p), Date.now()).run();
    rc.log('admin.ink.prices', { data: p });
    return json({ prices: p });
  }
  if (sub === 'ink' && req.method === 'GET') {
    const { s, token } = await settings(env);
    const jobs = (await env.DB.prepare(`SELECT j.id, j.title, j.status, j.stage, j.progress, j.message, j.error, j.duration, j.created_at, j.finished_at, u.email
      FROM ink_jobs j LEFT JOIN users u ON u.id = j.user_id ORDER BY j.created_at DESC LIMIT 40`).all<any>()).results;
    const last = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ink:dispatch'").first<any>();
    const err = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ink:wake_error'").first<any>();
    const seen = await machinesSeen(env), list = await servers(env);
    const machines = { seen: Object.entries(seen).map(([name, v]) => ({ name, ...v, online: Date.now() - v.at < 90_000 })).sort((a, b) => b.at - a.at),
      servers: list.map(({ id, name, created }) => ({ id, name, created })), cloud: !!(env.GCP_TRIGGER_KEY && env.GCP_PROJECT && env.GCP_REGION), version: await bundleVersion(env) };
    return json({ machines, wakeError: err?.value || '', settings: s, checks: await inkChecks(env), token: !!token, keys: { gemini: !!env.GEMINI_API_KEY, openai: !!env.OPENAI_API_KEY, everai: !!(env as any).EVERAI_API_KEY }, lastDispatch: Number(last?.value) || 0, jobs });
  }
  if (sub === 'ink' && req.method === 'PUT') {
    const b = await body<any>(req, 30_000), s = cleanInk(b.settings || {}), now = Date.now();
    const stmts = [env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('ink', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(s), now)];
    if (b.token === null) stmts.push(env.DB.prepare("DELETE FROM settings WHERE key = 'secret:INK_GITHUB_TOKEN'"));
    else if (typeof b.token === 'string' && b.token.trim()) {
      const t = b.token.trim();
      if (!/^(gh[pousr]_|github_pat_)[\w]{20,250}$/.test(t)) throw new HttpError(400, 'GitHub token không đúng dạng (ghp_… hoặc github_pat_…).');
      stmts.push(env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('secret:INK_GITHUB_TOKEN', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(await encrypt(env, t), now));
    }
    await env.DB.batch(stmts); memo = null;
    rc.log('admin.settings', { data: { section: 'ink' } });
    return json({ settings: s });
  }
  if (sub === 'ink/servers' && req.method === 'POST') {
    const b = await body<any>(req, 2_000), list = await servers(env);
    if (list.length >= 20) throw new HttpError(400, 'Tối đa 20 máy chủ.');
    const code = 'ink_' + randomId(24), server = { id: randomId(6), name: str(b.name, 40) || 'Máy chủ ' + (list.length + 1), hash: await sha256(code), created: Date.now() };
    await saveServers(env, [...list, server]);
    rc.log('admin.settings', { data: { section: 'ink-server', add: server.name } });
    const origin = new URL(req.url).origin;
    return json({ id: server.id, code, command: `curl -fsSL ${origin}/api/ink-setup.sh | sudo bash -s -- ${code}` });
  }
  const del = sub.match(/^ink\/servers\/([a-f0-9]{12})$/);
  if (del && req.method === 'DELETE') {
    await saveServers(env, (await servers(env)).filter((x) => x.id !== del[1]));
    rc.log('admin.settings', { data: { section: 'ink-server', remove: del[1] } });
    return json({ ok: true });
  }
  if (sub === 'ink/dispatch' && req.method === 'POST') {
    memo = null;
    const r = await dispatch(env, true);
    if (r !== 'ok') throw new HttpError(502, r);
    return json({ ok: true });
  }
  return null;
}

/** The one-line install for a server of the admin's own (public: it holds no secret, the code is typed by the admin). */
export async function inkSetup(req: Request, env: Env): Promise<Response> {
  const obj = await env.BUCKET.get('ink-runner/setup.sh');
  if (!obj) throw new HttpError(404, 'Chưa có bộ cài (triển khai lại web).');
  const text = (await obj.text()).replace(/__SITE__/g, new URL(req.url).origin);
  return new Response(text, { headers: { 'content-type': 'text/x-shellscript; charset=utf-8', 'cache-control': 'no-store' } });
}
