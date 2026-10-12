// Zalo Bot (bot-api.zaloplatforms.com, Telegram-style API). People can:
//  · link the bot to their web account with a short code, or just start chatting
//    (a Zalo-only account is created when the admin allows it);
//  · send a script ("KB ...") or a topic ("TAO ...") and get the finished video back as a link;
//  · check progress, list recent videos, pick frame/style/voice, mute notifications.
// The webhook is verified with the secret token header Zalo sends back on every call.
import type { User } from './auth.ts';
import { vis, type Config } from './settings.ts';
import { body, type Env, HttpError, json, randomId, sha256, timingSafeEqual, useQuota } from './util.ts';
import { createProject, queueRender, type Rc, type XEnv } from './worker.ts';

const API = 'https://bot-api.zaloplatforms.com/bot';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SHARE_DAYS = 7;

export async function zaloApi(token: string, method: string, payload: unknown = {}): Promise<{ ok: boolean; status: number; result: any; error: string }> {
  try {
    const res = await fetch(`${API}${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) });
    const j: any = await res.json().catch(() => ({}));
    return { ok: res.ok && j.ok !== false, status: res.status, result: j.result, error: j.description || j.message || (res.ok ? '' : `HTTP ${res.status}`) };
  } catch (e: any) {
    return { ok: false, status: 0, result: null, error: 'không gọi được Zalo: ' + String(e.message || e).slice(0, 120) };
  }
}

async function hmacHex(secret: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Secret Zalo must echo in X-Bot-Api-Secret-Token (derived, so nothing extra to store). */
export const webhookSecret = async (env: Env) => (await hmacHex(env.RUNNER_TOKEN || '', 'zalo-webhook')).slice(0, 48);

/** Link that plays/downloads a finished video without logging in, valid for a few days. */
export async function shareLink(env: Env, origin: string, jobId: string) {
  const exp = Date.now() + SHARE_DAYS * 86_400_000;
  const sig = (await hmacHex(env.RUNNER_TOKEN || '', `share:${jobId}:${exp}`)).slice(0, 32);
  return `${origin}/api/share/${jobId}?e=${exp}&s=${sig}`;
}
export async function checkShare(env: Env, jobId: string, exp: number, sig: string) {
  if (!exp || exp < Date.now()) return false;
  return timingSafeEqual((await hmacHex(env.RUNNER_TOKEN || '', `share:${jobId}:${exp}`)).slice(0, 32), sig);
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const fill = (tpl: string, v: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? '').toString());

async function send(env: XEnv, chatId: string, text: string) {
  const token = (env as any).ZALO_BOT_TOKEN;
  if (!token) return { ok: false, error: 'chưa có token' };
  // never throws: a failed reply must not stop the work (creating the video) around it
  return zaloApi(token, 'sendMessage', { chat_id: chatId, text: text.slice(0, 1900) });
}

/** Tell the owner about something (if they claimed the bot and want this kind of news). */
export async function notifyOwner(env: XEnv, kind: keyof Config['zalo']['notifyOwner'], text: string) {
  const z = env.config.zalo;
  if (z.enabled && z.ownerChat && z.notifyOwner[kind]) await send(env, z.ownerChat, '🔔 ' + text).catch(() => {});
}

// ---------------------------------------------------------------- webhook
export async function zaloWebhook(req: Request, env: XEnv, rc: Rc): Promise<Response> {
  const token = (env as any).ZALO_BOT_TOKEN;
  if (!env.config.zalo.enabled || !token) return json({ ok: true });
  const secret = await webhookSecret(env);
  const given = req.headers.get('x-bot-api-secret-token') || new URL(req.url).searchParams.get('s') || '';
  if (!timingSafeEqual(given, secret)) { rc.log('zalo.webhook', { ok: false, data: { error: 'sai mã bí mật' } }); throw new HttpError(401, 'Không có quyền.'); }
  const b = await body<any>(req, 50_000);
  const ev = b.result || b;
  const msg = ev.message || {};
  const chatId = String(msg.chat?.id || msg.from?.id || '');
  if (!/received/.test(String(ev.event_name || 'message.text.received')) || !chatId) return json({ ok: true });
  // Zalo retries deliveries: handle each message once
  const mid = String(msg.message_id || '');
  if (mid) {
    const fresh = await env.DB.prepare('INSERT OR IGNORE INTO zalo_seen (message_id, ts) VALUES (?, ?) RETURNING message_id').bind(mid, Date.now()).first();
    if (!fresh) return json({ ok: true });
  }
  rc.quiet = true;
  // answer Zalo at once; the work (AI, queueing) continues in the background
  rc.wait(handleMessage(env, rc, chatId, String(msg.text || ''), msg.from?.display_name || msg.from?.name || '', !!msg.text));
  return json({ ok: true });
}

async function handleMessage(env: XEnv, rc: Rc, chatId: string, text: string, name: string, isText: boolean) {
  const z = env.config.zalo, t = z.templates;
  const reply = async (s: string) => { const r = await send(env, chatId, s); if (!r.ok) rc.log('zalo.reply', { ok: false, data: { chat: chatId, error: r.error } }); return r; };
  const link = await env.DB.prepare('SELECT l.user_id, l.prefs, l.notify, u.email, u.name FROM zalo_links l JOIN users u ON u.id = l.user_id WHERE l.chat_id = ?').bind(chatId).first<any>();
  rc.userId = link?.user_id || null;
  rc.log('zalo.message', { data: { chat: chatId, linked: !!link, text: text.slice(0, 200) } });
  if (!isText) return reply('Mình chỉ đọc được tin nhắn chữ. Gõ HUONGDAN để xem cách dùng.');
  // per chat: at most 60 messages a day
  try { await useQuota(env, 'z:' + chatId, 'zalo', 60); } catch { return; }

  const raw = text.trim(), plain = fold(raw).trim();
  const [cmd0, ...rest] = plain.split(/\s+/);
  const cmd = cmd0.replace(/^\//, '').toUpperCase();
  const argRaw = raw.slice(raw.indexOf(' ') + 1).trim(), arg = raw.includes(' ') ? argRaw : '';

  // owner claims the bot (code from the admin page)
  if (cmd === 'CHUWEB' || (cmd === 'CHU' && rest[0]?.toUpperCase() === 'WEB')) {
    const code = (cmd === 'CHUWEB' ? rest[0] : rest[1] || '').toUpperCase();
    const row = await env.DB.prepare("SELECT user_id FROM zalo_codes WHERE code = ? AND user_id = 'owner' AND expires_at > ?").bind(code, Date.now()).first();
    if (!row) return reply('Mã chủ web không đúng hoặc đã hết hạn. Tạo mã mới trong trang Quản trị → Zalo.');
    await saveOwnerChat(env, chatId);
    await env.DB.prepare('DELETE FROM zalo_codes WHERE code = ?').bind(code).run();
    rc.log('zalo.owner', { data: { chat: chatId } });
    return reply('Đã nhận bạn là chủ web. Mình sẽ báo người dùng mới, video lỗi và đơn hàng ở đây.');
  }
  // link to a web account
  if (cmd === 'KETNOI' || cmd === 'KET') {
    const code = (cmd === 'KETNOI' ? rest[0] : rest[1] || '').toUpperCase();
    const row = await env.DB.prepare("SELECT user_id FROM zalo_codes WHERE code = ? AND user_id != 'owner' AND expires_at > ?").bind(code, Date.now()).first<any>();
    if (!row) return reply('Mã kết nối không đúng hoặc đã hết hạn. Mở web → Kết nối Zalo để lấy mã mới.');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM zalo_links WHERE chat_id = ? OR user_id = ?').bind(chatId, row.user_id),
      env.DB.prepare('INSERT INTO zalo_links (user_id, chat_id, name, linked_at, notify, prefs) VALUES (?, ?, ?, ?, 1, ?)').bind(row.user_id, chatId, name.slice(0, 60), Date.now(), '{}'),
      env.DB.prepare('DELETE FROM zalo_codes WHERE code = ?').bind(code),
    ]);
    const u = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(row.user_id).first<any>();
    rc.userId = row.user_id; rc.log('zalo.link', { data: { chat: chatId } });
    return reply(fill(t.linked, { email: u?.email || '', ten: name }));
  }

  let user: User | null = link ? { id: link.user_id, email: link.email, name: link.name, picture: null } : null;
  const prefs = link ? JSON.parse(link.prefs || '{}') : {};
  const help = () => reply(fill(t.help, { ten: name || link?.name || 'bạn' }));
  if (!cmd || ['HUONGDAN', 'HELP', 'START', 'MENU', '?', 'HD', 'XINCHAO', 'CHAO', 'HI', 'HELLO'].includes(cmd)) return help();

  const wantsVideo = ['KB', 'KICHBAN', 'TAO', 'MAU'].includes(cmd) || raw.length >= 120;
  if (!user && wantsVideo) {
    if (!z.allowGuests) return reply('Bạn cần kết nối tài khoản trước: mở web → Kết nối Zalo, rồi gửi mã cho mình.');
    user = await guestUser(env, chatId, name);
    rc.userId = user.id;
  }
  if (!user) return reply(t.unknown);
  const savePrefs = (p: any) => env.DB.prepare('UPDATE zalo_links SET prefs = ? WHERE chat_id = ?').bind(JSON.stringify(p), chatId).run();

  switch (cmd) {
    case 'TT': case 'TRANGTHAI': {
      const jobs = (await env.DB.prepare("SELECT j.id, j.status, j.progress, j.error, p.title FROM jobs j JOIN projects p ON p.id = j.project_id WHERE j.user_id = ? ORDER BY j.created_at DESC LIMIT 3").bind(user.id).all<any>()).results;
      if (!jobs.length) return reply('Bạn chưa có video nào đang dựng. Gửi KB + kịch bản để bắt đầu.');
      const names: Record<string, string> = { queued: 'đang chờ', running: 'đang dựng', done: 'xong', failed: 'lỗi' };
      const lines = await Promise.all(jobs.map(async (j) => `• ${j.title}: ${names[j.status] || j.status}${j.status === 'running' ? ` ${j.progress}%` : ''}${j.status === 'done' ? '\n  ' + (await shareLink(env, origin(env), j.id)) : ''}${j.status === 'failed' ? ` (${j.error})` : ''}`));
      return reply(lines.join('\n'));
    }
    case 'DS': case 'DANHSACH': {
      const ps = (await env.DB.prepare('SELECT title, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5').bind(user.id).all<any>()).results;
      return reply(ps.length ? 'Video gần đây:\n' + ps.map((p, i) => `${i + 1}. ${p.title}`).join('\n') + `\nSửa chi tiết trên web: ${origin(env)}` : 'Chưa có video nào.');
    }
    case 'KHUNG': {
      const v = fold(rest.join(' ')).toLowerCase();
      prefs.ratio = /ngang|16/.test(v) ? '16:9' : '9:16';
      await savePrefs(prefs);
      return reply(`Đã chọn khung ${prefs.ratio === '16:9' ? 'ngang 16:9 (YouTube)' : 'dọc 9:16 (TikTok, Reels)'}.`);
    }
    case 'PHONGCACH': case 'PC': {
      const styles = env.config.enabledStyles;
      const n = Number(rest[0]);
      if (!rest.length) return reply('Chọn phong cách (gõ PHONGCACH + số):\n0. Tự chọn theo nội dung\n' + styles.map((k, i) => `${i + 1}. ${env.config.labels.styles[k]}`).join('\n'));
      prefs.style = n === 0 ? 'auto' : styles[n - 1] || styles.find((k) => fold(env.config.labels.styles[k]).toLowerCase().includes(fold(rest.join(' ')).toLowerCase())) || 'auto';
      await savePrefs(prefs);
      return reply('Đã chọn phong cách: ' + (prefs.style === 'auto' ? 'tự chọn theo nội dung' : env.config.labels.styles[prefs.style]));
    }
    case 'GIONG': {
      const voices = env.config.voices.filter((v) => vis(env.config, 'voice:' + v.code) === 'on');
      const n = Number(rest[0]);
      if (!n) return reply('Chọn giọng đọc (gõ GIONG + số):\n' + voices.map((v, i) => `${i + 1}. ${v.label}`).join('\n'));
      if (!voices[n - 1]) return reply('Không có giọng số ' + n);
      prefs.voice = voices[n - 1].code; await savePrefs(prefs);
      return reply('Đã chọn giọng: ' + voices[n - 1].label);
    }
    case 'TAT': case 'BAT':
      await env.DB.prepare('UPDATE zalo_links SET notify = ? WHERE chat_id = ?').bind(cmd === 'BAT' ? 1 : 0, chatId).run();
      return reply(cmd === 'BAT' ? 'Đã bật thông báo video.' : 'Đã tắt thông báo. Gõ BAT để bật lại.');
    case 'HUYKETNOI':
      await env.DB.prepare('DELETE FROM zalo_links WHERE chat_id = ?').bind(chatId).run();
      rc.log('zalo.unlink', { data: { chat: chatId } });
      return reply('Đã bỏ liên kết Zalo.');
    case 'MAU': {
      const list = env.config.templates;
      const n = Number(rest[0]);
      if (!n) return reply('Kịch bản mẫu (gõ MAU + số để dựng ngay):\n' + list.map((x, i) => `${i + 1}. ${x.title}`).join('\n'));
      const tpl = list[n - 1];
      if (!tpl) return reply('Không có mẫu số ' + n);
      return makeVideo(env, rc, user, chatId, 'mine-free', tpl.text, prefs, !link);
    }
  }
  if (cmd === 'TAO') {
    if (!arg) return reply('Gửi: TAO + chủ đề. Ví dụ: TAO vì sao lương mãi không tăng');
    if (!env.config.enabledSources.includes('topic') || !(env.GEMINI_API_KEY || env.OPENAI_API_KEY)) return reply(t.noAI);
    return makeVideo(env, rc, user, chatId, 'topic', arg, prefs, !link);
  }
  if (cmd === 'KB' || cmd === 'KICHBAN' || raw.length >= 120) {
    const script = cmd === 'KB' || cmd === 'KICHBAN' ? arg : raw;
    if (script.length < 20) return reply('Gửi: KB + kịch bản của bạn (ít nhất một câu).');
    const src = z.scriptSource === 'mine-ai' && (env.GEMINI_API_KEY || env.OPENAI_API_KEY) ? 'mine-ai' : 'mine-free';
    return makeVideo(env, rc, user, chatId, src, script, prefs, !link);
  }
  return reply(t.unknown);
}

async function makeVideo(env: XEnv, rc: Rc, user: User, chatId: string, source: string, text: string, prefs: any, guest: boolean) {
  const t = env.config.zalo.templates;
  try {
    await send(env, chatId, 'Đã nhận, mình đang chuẩn bị kịch bản và hình…');
    const p = await createProject(env, rc, user, { source, topic: text, ratio: prefs.ratio, style: prefs.style || 'auto', voiceId: prefs.voice, visual: 'sketch', channel: '' });
    if (!env.config.zalo.autoRender) return send(env, chatId, `Kịch bản "${p.spec.title}" đã sẵn sàng (${p.spec.scenes.length} cảnh). Mở web để xem và dựng: ${origin(env)}/#/p/${p.id}`);
    await queueRender(env, rc, user, p.id, p.spec);
    const queue = await env.DB.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running')").first<any>();
    await send(env, chatId, fill(t.queued, {
      tieuDe: p.spec.title, canh: p.spec.scenes.length, dang: p.spec.ratio === '16:9' ? 'khung ngang' : 'khung dọc', hangCho: queue?.n || 1,
      suaWeb: guest ? '' : `\nSửa trên web: ${origin(env)}/#/p/${p.id}`,
    }) + (p.note ? '\n' + p.note : ''));
  } catch (e: any) {
    rc.log('zalo.create', { ok: false, data: { error: e.message } });
    await send(env, chatId, 'Chưa tạo được video: ' + (e instanceof HttpError ? e.message : 'máy chủ đang bận, thử lại sau ít phút.'));
  }
}

/** A Zalo-only account for people who never opened the web page. */
async function guestUser(env: XEnv, chatId: string, name: string): Promise<User> {
  const id = 'zl-' + (await sha256('zalo:' + chatId)).slice(0, 20);
  const now = Date.now();
  const existed = await env.DB.prepare('SELECT 1 FROM users WHERE id = ?').bind(id).first();
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO users (id, email, name, picture, created_at) VALUES (?, ?, ?, NULL, ?)').bind(id, `zalo:${chatId}`, name.slice(0, 60) || 'Người dùng Zalo', now),
    env.DB.prepare("INSERT OR IGNORE INTO zalo_links (user_id, chat_id, name, linked_at, notify, prefs) VALUES (?, ?, ?, ?, 1, '{}')").bind(id, chatId, name.slice(0, 60), now),
  ]);
  if (!existed) {
    // the chat is the sign-up: tell them the terms and record that they continued
    await env.DB.prepare('INSERT OR IGNORE INTO consents (user_id, version, accepted_at, ip, ua) VALUES (?, ?, ?, NULL, ?)').bind(id, env.config.legal.version, now, 'zalo').run();
    await send(env, chatId, `Chào ${name || 'bạn'}! Khi tiếp tục dùng bot, bạn đồng ý Điều khoản (${origin(env)}/#/dieu-khoan) và Chính sách bảo mật (${origin(env)}/#/bao-mat). Gõ HUYKETNOI bất cứ lúc nào để ngừng.`);
    await notifyOwner(env, 'signup', `Người dùng mới qua Zalo: ${name || chatId}`);
  }
  return { id, email: `zalo:${chatId}`, name, picture: null };
}

let originCache = '';
/** Public address of the site (from the last request). */
export function origin(env: XEnv) { return (env as any).PUBLIC_URL || originCache; }
export function rememberOrigin(o: string) { if (o.startsWith('https://')) originCache = o; }

async function saveOwnerChat(env: XEnv, chatId: string) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'config'").first<any>();
  const cfg = row ? JSON.parse(row.value) : {};
  cfg.zalo = { ...(cfg.zalo || {}), ownerChat: chatId };
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('config', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(cfg), Date.now()).run();
  const { clearCache } = await import('./settings.ts');
  clearCache();
}

// ---------------------------------------------------------------- after a render
export async function notifyJob(env: XEnv, rc: Rc, job: any, ok: boolean, error: string, seconds = 0) {
  const z = env.config.zalo;
  if (!z.enabled) return;
  const spec = JSON.parse(job.spec);
  if (!ok) await notifyOwner(env, 'failed', `Video lỗi: "${spec.title}" (${job.user_id}): ${error}`);
  const link = await env.DB.prepare('SELECT chat_id, notify FROM zalo_links WHERE user_id = ?').bind(job.user_id).first<any>();
  // tell Zalo users about every video; web users only when they turned notifications on
  if (!link || !link.notify) return;
  const text = ok
    ? fill(z.templates.done, { tieuDe: spec.title, link: await shareLink(env, origin(env), job.id), hanNgay: SHARE_DAYS, giay: Math.round(seconds) || '?' })
    : fill(z.templates.failed, { tieuDe: spec.title, loi: error });
  const r = await send(env, link.chat_id, text);
  rc.log('zalo.notify', { ok: r.ok, projectId: job.project_id, data: { job: job.id, done: ok, error: r.ok ? undefined : r.error } });
}

// ---------------------------------------------------------------- web account page
export async function zaloUser(req: Request, env: XEnv, rc: Rc, user: User, sub: string, method: string) {
  if (vis(env.config, 'feature:zalo') !== 'on' || !env.config.zalo.enabled) throw new HttpError(403, 'Tính năng Zalo đang tắt.');
  if (sub === 'me' && method === 'GET') {
    const link = await env.DB.prepare('SELECT name, linked_at, notify FROM zalo_links WHERE user_id = ?').bind(user.id).first<any>();
    return json({ linked: !!link, link, botLink: env.config.zalo.botLink });
  }
  if (sub === 'code' && method === 'POST') {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM zalo_codes WHERE user_id = ? OR expires_at < ?').bind(user.id, Date.now()),
      env.DB.prepare('INSERT INTO zalo_codes (code, user_id, expires_at) VALUES (?, ?, ?)').bind(code, user.id, Date.now() + 30 * 60_000),
    ]);
    rc.log('zalo.code');
    return json({ code, command: 'KETNOI ' + code, botLink: env.config.zalo.botLink, expiresMin: 30 });
  }
  if (sub === 'notify' && method === 'POST') {
    await env.DB.prepare('UPDATE zalo_links SET notify = ? WHERE user_id = ?').bind((await body<any>(req, 200)).on ? 1 : 0, user.id).run();
    return json({ ok: true });
  }
  if (sub === 'unlink' && method === 'POST') {
    await env.DB.prepare('DELETE FROM zalo_links WHERE user_id = ?').bind(user.id).run();
    rc.log('zalo.unlink');
    return json({ ok: true });
  }
  throw new HttpError(404, 'Không tìm thấy.');
}

// ---------------------------------------------------------------- admin
export async function zaloAdmin(req: Request, env: XEnv, rawEnv: Env, sub: string, method: string, rc: Rc) {
  const token = (env as any).ZALO_BOT_TOKEN;
  const url = new URL(req.url);
  if (sub === 'zalo/connect' && method === 'POST') {
    if (!token) throw new HttpError(400, 'Nhập Zalo Bot token ở mục Khoá API trước.');
    const hook = `${url.origin}/api/zalo/webhook`;
    const r = await zaloApi(token, 'setWebhook', { url: hook, secret_token: await webhookSecret(rawEnv) });
    const info = await zaloApi(token, 'getWebhookInfo');
    rc.log('admin.zalo.connect', { ok: r.ok, data: { error: r.error, url: info.result?.url } });
    if (!r.ok) throw new HttpError(502, 'Zalo từ chối đăng ký webhook: ' + r.error);
    return json({ ok: true, url: hook, info: info.result });
  }
  if (sub === 'zalo/check' && method === 'GET') {
    const me = token ? await zaloApi(token, 'getMe') : null;
    const info = token ? await zaloApi(token, 'getWebhookInfo') : null;
    const last = await env.DB.prepare("SELECT ts, ok, data FROM events WHERE type LIKE 'zalo.%' ORDER BY id DESC LIMIT 10").all<any>();
    const links = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(user_id LIKE \'zl-%\') AS guests FROM zalo_links').first<any>();
    const expected = `${url.origin}/api/zalo/webhook`;
    return json({
      steps: [
        { k: 'Bật tính năng Zalo', ok: env.config.zalo.enabled, fix: 'Bật ở mục Zalo rồi lưu.' },
        { k: 'Token hợp lệ', ok: !!me?.ok, detail: me?.result?.account_name || me?.result?.display_name || me?.error || 'chưa nhập token', fix: 'Lấy token trong Zalo Bot Creator và dán vào Khoá API.' },
        { k: 'Webhook trỏ về web này', ok: info?.result?.url === expected, detail: info?.result?.url || '(chưa có)', fix: 'Bấm "Kết nối webhook".' },
        { k: 'Chủ web đã nhận bot', ok: !!env.config.zalo.ownerChat, fix: 'Tạo mã chủ web và gửi CHUWEB <mã> cho bot.' },
        { k: 'Liên kết bot cho người dùng', ok: !!env.config.zalo.botLink, fix: 'Dán đường dẫn bot (https://zalo.me/...) ở mục Zalo.' },
      ],
      last: last.results, links,
    });
  }
  if (sub === 'zalo/owner-code' && method === 'POST') {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    await env.DB.prepare("INSERT INTO zalo_codes (code, user_id, expires_at) VALUES (?, 'owner', ?)").bind(code, Date.now() + 30 * 60_000).run();
    return json({ command: 'CHUWEB ' + code, expiresMin: 30 });
  }
  if (sub === 'zalo/test' && method === 'POST') {
    if (!env.config.zalo.ownerChat) throw new HttpError(400, 'Chưa có Zalo chủ web.');
    const r = await send(env, env.config.zalo.ownerChat, 'Tin nhắn thử từ trang quản trị: kết nối Zalo hoạt động tốt ✅');
    if (!r.ok) throw new HttpError(502, 'Gửi chưa được: ' + r.error);
    return json({ ok: true });
  }
  throw new HttpError(404, 'Không tìm thấy.');
}
