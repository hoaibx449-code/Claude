// Zalo Bot (bot-api.zaloplatforms.com, Telegram-style API). People can:
//  · link the bot to their web account with a short code, or just start chatting
//    (a Zalo-only account is created when the admin allows it);
//  · send a script ("KB ...") or a topic ("TAO ...") and get the finished video back as a link;
//  · check progress, list recent videos, pick frame/style/voice, mute notifications.
// The webhook is verified with the secret token header Zalo sends back on every call.
import type { User } from './auth.ts';
import { LOOK_KEYS, vis, type Config } from './settings.ts';
import { body, type Env, HttpError, json, randomId, sha256, timingSafeEqual, useQuota } from './util.ts';
import { createProject, queueRender, type Rc, type XEnv } from './worker.ts';

const API = 'https://bot-api.zaloplatforms.com/bot';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SHARE_DAYS = 7;

/** Tokens are often pasted with spaces, quotes or a leading "bot" copied from an example URL. */
export const cleanToken = (t: string) => String(t || '').trim().replace(/^["']|["']$/g, '').replace(/^bot(?=\d)/i, '').trim();

export async function zaloApi(token: string, method: string, payload: unknown = {}, timeoutMs = 10_000): Promise<{ ok: boolean; status: number; result: any; error: string }> {
  token = cleanToken(token);
  try {
    const res = await fetch(`${API}${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs) });
    const j: any = await res.json().catch(() => ({}));
    const ok = res.ok && j.ok === true;
    return { ok, status: res.status, result: j.result, error: ok ? '' : String(j.description || j.message || `Zalo không xác nhận thành công (HTTP ${res.status})`).replaceAll(token, '[token]').slice(0, 300) };
  } catch (e: any) {
    return { ok: false, status: 0, result: null, error: 'không gọi được Zalo: ' + String(e.message || e).replaceAll(token, '[token]').slice(0, 120) };
  }
}

async function hmacHex(secret: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Secret Zalo must echo in X-Bot-Api-Secret-Token (derived, so nothing extra to store). */
export const webhookSecret = async (env: Env) => {
  if (!env.RUNNER_TOKEN || env.RUNNER_TOKEN.length < 32) throw new HttpError(503, 'RUNNER_TOKEN cần ít nhất 32 ký tự để bảo vệ webhook.');
  return (await hmacHex(env.RUNNER_TOKEN, 'zalo-webhook')).slice(0, 48);
};

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

async function send(env: XEnv, chatId: string, text: string, messageId?: string) {
  const id = randomId(16), now = Date.now();
  await env.DB.prepare('INSERT INTO zalo_outbox (id, chat_id, message_id, text, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, chatId, messageId || null, text.slice(0, 1900), 'pending', now, now).run();
  return deliverReply(env, id);
}

async function deliverReply(env: XEnv, id: string, force = false) {
  const row = await env.DB.prepare(`UPDATE zalo_outbox SET status = 'sending', attempts = attempts + 1, updated_at = ?
    WHERE id = ? AND (attempts < 5 OR ?) AND (status IN ('pending','failed') OR (status = 'sending' AND updated_at < ?)) RETURNING *`)
    .bind(Date.now(), id, force ? 1 : 0, Date.now() - 120_000).first<any>();
  if (!row) return { ok: false, error: 'Tin đang gửi hoặc đã gửi.' };
  const token = (env as any).ZALO_BOT_TOKEN;
  const result = token ? await zaloApi(token, 'sendMessage', { chat_id: row.chat_id, text: row.text }) : { ok: false, error: 'Chưa có Zalo Bot token.' };
  await env.DB.prepare("UPDATE zalo_outbox SET status = ?, error = ?, updated_at = ? WHERE id = ? AND status = 'sending' AND attempts = ?")
    .bind(result.ok ? 'sent' : 'failed', result.ok ? null : result.error, Date.now(), id, row.attempts).run();
  return result;
}

/** Tell the owner about something (if they claimed the bot and want this kind of news). */
export async function notifyOwner(env: XEnv, kind: keyof Config['zalo']['notifyOwner'], text: string) {
  const z = env.config.zalo;
  if (z.enabled && z.ownerChat && z.notifyOwner[kind]) await send(env, z.ownerChat, '🔔 ' + text).catch(() => {});
}

// ---------------------------------------------------------------- webhook
// Zalo stops calling (or refuses to save) a webhook that keeps answering with errors, so every
// answer to Zalo is HTTP 200; what went wrong is recorded in the log and shown on the admin page.
export async function zaloWebhook(req: Request, env: XEnv, rc: Rc): Promise<Response> {
  const token = (env as any).ZALO_BOT_TOKEN;
  const refuse = (error: string, extra: Record<string, unknown> = {}) => { rc.log('zalo.webhook', { ok: false, data: { error, ...extra } }); return json({ ok: false, error }); };
  if (!env.config.zalo.enabled) return refuse('Tính năng Zalo đang tắt (Quản trị → Zalo → Bật).');
  if (!token) return refuse('Chưa có Zalo Bot token.');
  if (!env.RUNNER_TOKEN || env.RUNNER_TOKEN.length < 32) return refuse('RUNNER_TOKEN chưa hợp lệ.');
  const secret = await webhookSecret(env);
  const given = req.headers.get('x-bot-api-secret-token') || new URL(req.url).searchParams.get('s') || '';
  if (!timingSafeEqual(given, secret)) return refuse(given ? 'sai mã bí mật: bấm "Kết nối webhook" lại' : 'thiếu mã bí mật: bấm "Kết nối webhook" lại');
  let b: any;
  try { b = await body<any>(req, 50_000); } catch { return refuse('Nội dung không phải JSON.'); }
  const event = normalizeMessage(b);
  if (!event) return refuse('Payload không có message/chat_id của Zalo Bot Platform.', { event: String(b?.event_name || b?.result?.event_name || '').slice(0, 80), keys: Object.keys(b?.result || b || {}).slice(0, 8).join(',') });
  if (event.event && !event.event.includes('received')) { rc.log('zalo.ignored', { data: { event: event.event } }); return json({ ok: true, ignored: true }); }
  const id = event.id || randomId(16), now = Date.now();
  await env.DB.prepare(`INSERT OR IGNORE INTO zalo_messages (id, chat_id, sender_name, text, is_text, status, received_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'received', ?, ?)`)
    .bind(id, event.chatId, event.name, event.text, event.isText ? 1 : 0, now, now).run();
  rc.log('zalo.received', { data: { message: id, chat: event.chatId, event: event.event } });
  rc.quiet = true;
  rc.wait(processMessage(env, rc, id));
  return json({ ok: true, recorded: true });
}

export function normalizeMessage(payload: any) {
  const event = payload?.result || payload;
  const message = event?.message;
  const chatId = String(message?.chat?.id ?? message?.from?.id ?? '');
  if (!message || !chatId || chatId.length > 120) return null;
  return { chatId, id: String(message.message_id ?? event.update_id ?? '').slice(0, 160),
    name: String(message.from?.display_name || message.from?.name || '').slice(0, 60),
    text: typeof message.text === 'string' ? message.text.slice(0, 20000) : '', isText: typeof message.text === 'string',
    event: String(event.event_name || '').slice(0, 80) };
}

export async function processMessage(env: XEnv, rc: Rc, id: string, force = false) {
  const row = await env.DB.prepare(`UPDATE zalo_messages SET status = 'processing', attempts = attempts + 1, updated_at = ?, error = NULL
    WHERE id = ? AND (attempts < 5 OR ?) AND (status IN ('received','failed') OR (status = 'processing' AND updated_at < ?)) RETURNING *`)
    .bind(Date.now(), id, force ? 1 : 0, Date.now() - 120_000).first<any>();
  if (!row) return;
  const messageRc: Rc = { ...rc, userId: null, log(type, extra = {}) { rc.log(type, { userId: messageRc.userId, ...extra }); } };
  try {
    await handleMessage(env, messageRc, row.chat_id, row.text, row.sender_name, !!row.is_text, id);
    await env.DB.prepare("UPDATE zalo_messages SET status = 'handled', updated_at = ? WHERE id = ? AND status = 'processing' AND attempts = ?").bind(Date.now(), id, row.attempts).run();
  } catch (error: any) {
    const changed = await env.DB.prepare("UPDATE zalo_messages SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status = 'processing' AND attempts = ?").bind(String(error.message || 'Lỗi xử lý tin nhắn.').slice(0, 300), Date.now(), id, row.attempts).run();
    if (!changed.meta.changes) return;
    messageRc.log('zalo.processing', { ok: false, data: { message: id, error: String(error.message || 'Lỗi xử lý').slice(0, 200) } });
    await send(env, row.chat_id, 'Chưa xử lý được tin nhắn. Bạn thử lại sau ít phút hoặc liên hệ chủ web.', id);
  }
}

export async function resumeZalo(env: XEnv, rc: Rc) {
  if (!env.config.zalo.enabled || !(env as any).ZALO_BOT_TOKEN) return;
  const messages = await env.DB.prepare("SELECT id FROM zalo_messages WHERE attempts < 5 AND (status IN ('received','failed') OR (status = 'processing' AND updated_at < ?)) ORDER BY received_at LIMIT 2").bind(Date.now() - 120_000).all<any>();
  for (const row of messages.results) await processMessage(env, rc, row.id);
  const replies = await env.DB.prepare("SELECT id FROM zalo_outbox WHERE attempts < 5 AND (status IN ('pending','failed') OR (status = 'sending' AND updated_at < ?)) ORDER BY created_at LIMIT 5").bind(Date.now() - 120_000).all<any>();
  for (const row of replies.results) await deliverReply(env, row.id);
}

async function handleMessage(env: XEnv, rc: Rc, chatId: string, text: string, name: string, isText: boolean, messageId: string) {
  const z = env.config.zalo, t = z.templates;
  const reply = async (s: string) => { const r = await send(env, chatId, s, messageId); rc.log('zalo.reply', { ok: r.ok, data: { chat: chatId, message: messageId, error: r.ok ? undefined : r.error } }); return r; };
  const link = await env.DB.prepare('SELECT l.user_id, l.prefs, l.notify, u.email, u.name FROM zalo_links l JOIN users u ON u.id = l.user_id WHERE l.chat_id = ?').bind(chatId).first<any>();
  rc.userId = link?.user_id || null;
  rc.log('zalo.message', { data: { chat: chatId, linked: !!link, text: text.slice(0, 200) } });
  if (!isText) return reply('Mình chỉ đọc được tin nhắn chữ. Gõ HUONGDAN để xem cách dùng.');
  // per chat: at most 60 messages a day
  try { await useQuota(env, 'z:' + chatId, 'zalo', 60); } catch { return reply('Bạn đã dùng hết lượt nhắn bot hôm nay. Thử lại vào ngày mai nhé.'); }

  const raw = text.trim(), plain = fold(raw).trim();
  const [cmd0, ...rest] = plain.split(/\s+/);
  const cmd = cmd0.replace(/^\//, '').toUpperCase();
  const arg = raw.match(/^\S+\s+([\s\S]*)$/)?.[1].trim() || '';

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
  if (user && await env.DB.prepare('SELECT 1 FROM blocked_users WHERE user_id = ?').bind(user.id).first()) return reply('Tài khoản đang bị khóa. Vui lòng liên hệ chủ web.');
  const prefs = link ? JSON.parse(link.prefs || '{}') : {};
  const help = () => reply(fill(t.help, { ten: name || link?.name || 'bạn' }));
  if (!cmd || ['GIUP', 'HUONGDAN', 'HELP', 'START', 'MENU', '?', 'HD', 'XINCHAO', 'CHAO', 'HI', 'HELLO'].includes(cmd)) return help();

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
    case 'DINHDANG': case 'DD': case 'PHONGCACH': case 'PC': {
      // video formats; the documentary needs pictures drawn on the web first, so it is not offered here
      const looks = LOOK_KEYS.filter((k) => k !== 'doc' && vis(env.config, 'look:' + k) === 'on');
      const n = Number(rest[0]);
      if (!rest.length) return reply('Chọn định dạng video (gõ DINHDANG + số):\n0. Mặc định của web\n' + looks.map((k, i) => `${i + 1}. ${env.config.labels.looks[k]} — ${env.config.labels.lookNotes[k]}`).join('\n'));
      const want = fold(rest.join(' ')).toLowerCase();
      prefs.look = n === 0 ? undefined : looks[n - 1] || looks.find((k) => fold(env.config.labels.looks[k]).toLowerCase().includes(want));
      await savePrefs(prefs);
      return reply('Đã chọn định dạng: ' + (prefs.look ? env.config.labels.looks[prefs.look] : 'mặc định của web'));
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
      return makeVideo(env, rc, user, chatId, 'mine-free', tpl.text, prefs, !link, messageId);
    }
  }
  if (cmd === 'TAO') {
    if (!arg) return reply('Gửi: TAO + chủ đề. Ví dụ: TAO vì sao lương mãi không tăng');
    if (!env.config.enabledSources.includes('topic') || !(env.GEMINI_API_KEY || env.OPENAI_API_KEY)) return reply(t.noAI);
    return makeVideo(env, rc, user, chatId, 'topic', arg, prefs, !link, messageId);
  }
  if (cmd === 'KB' || cmd === 'KICHBAN' || raw.length >= 120) {
    const script = cmd === 'KB' || cmd === 'KICHBAN' ? arg : raw;
    if (script.length < 20) return reply('Gửi: KB + kịch bản của bạn (ít nhất một câu).');
    const src = z.scriptSource === 'mine-ai' && (env.GEMINI_API_KEY || env.OPENAI_API_KEY) ? 'mine-ai' : 'mine-free';
    return makeVideo(env, rc, user, chatId, src, script, prefs, !link, messageId);
  }
  return reply(t.unknown);
}

async function makeVideo(env: XEnv, rc: Rc, user: User, chatId: string, source: string, text: string, prefs: any, guest: boolean, messageId: string) {
  const t = env.config.zalo.templates;
  try {
    if (await env.DB.prepare('SELECT 1 FROM blocked_users WHERE user_id = ?').bind(user.id).first()) return send(env, chatId, 'Tài khoản đang bị khóa. Vui lòng liên hệ chủ web.', messageId);
    const checkpoint = await env.DB.prepare('SELECT project_id, job_id FROM zalo_messages WHERE id = ?').bind(messageId).first<any>();
    if (checkpoint?.job_id) return send(env, chatId, 'Video này đã vào hàng chờ. Gõ TT để xem tiến độ.', messageId);
    await send(env, chatId, 'Đã nhận, mình đang chuẩn bị kịch bản và hình…', messageId);
    const existing = checkpoint?.project_id ? await env.DB.prepare('SELECT id, spec FROM projects WHERE id = ? AND user_id = ?').bind(checkpoint.project_id, user.id).first<any>() : null;
    const p = existing ? { id: existing.id, spec: JSON.parse(existing.spec), note: '' } : await createProject(env, rc, user, { source, topic: text, ratio: prefs.ratio, style: prefs.style || 'auto', voiceId: prefs.voice, visual: 'sketch', channel: '', look: prefs.look && prefs.look !== 'doc' ? prefs.look : undefined });
    await env.DB.prepare('UPDATE zalo_messages SET project_id = ? WHERE id = ?').bind(p.id, messageId).run();
    if (!env.config.zalo.autoRender) return send(env, chatId, `Kịch bản "${p.spec.title}" đã sẵn sàng (${p.spec.scenes.length} cảnh). Mở web để xem và dựng: ${origin(env)}/#/p/${p.id}`, messageId);
    const queued = await env.DB.prepare("SELECT id FROM jobs WHERE project_id = ? AND user_id = ? AND status IN ('queued','running','done') ORDER BY created_at DESC LIMIT 1").bind(p.id, user.id).first<any>();
    const job = queued || await queueRender(env, rc, user, p.id, p.spec);
    await env.DB.prepare('UPDATE zalo_messages SET job_id = ? WHERE id = ?').bind(job.id, messageId).run();
    const queue = await env.DB.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running')").first<any>();
    await send(env, chatId, fill(t.queued, {
      tieuDe: p.spec.title, canh: p.spec.scenes.length, dang: p.spec.ratio === '16:9' ? 'khung ngang' : 'khung dọc', hangCho: queue?.n || 1,
      suaWeb: guest ? '' : `\nSửa trên web: ${origin(env)}/#/p/${p.id}`,
    }) + (p.note ? '\n' + p.note : ''), messageId);
  } catch (e: any) {
    rc.log('zalo.create', { ok: false, data: { error: e.message } });
    await env.DB.prepare('UPDATE zalo_messages SET error = ? WHERE id = ?').bind(String(e.message || 'Lỗi tạo video').slice(0, 300), messageId).run();
    await send(env, chatId, 'Chưa tạo được video: ' + (e instanceof HttpError ? e.message : 'máy chủ đang bận, thử lại sau ít phút.'), messageId);
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

/** Webhook address without the secret query, safe to show and compare. */
const hookPath = (u: unknown) => String(u || '').split('?')[0];

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
  const source = await env.DB.prepare('SELECT id FROM zalo_messages WHERE job_id = ? LIMIT 1').bind(job.id).first<any>();
  const r = await send(env, link.chat_id, text, source?.id);
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
    if (!env.config.zalo.enabled) throw new HttpError(400, 'Bật tính năng Zalo và lưu cài đặt trước khi kết nối webhook.');
    if (url.protocol !== 'https:') throw new HttpError(400, 'Zalo chỉ gọi địa chỉ HTTPS. Mở trang quản trị bằng tên miền thật rồi kết nối.');
    const before = await zaloApi(token, 'getWebhookInfo');
    const secret = await webhookSecret(rawEnv);
    // the secret also rides in the address: Zalo sends the header, the query is a fallback
    const hook = `${url.origin}/api/zalo/webhook?s=${secret}`;
    const r = await zaloApi(token, 'setWebhook', { url: hook, secret_token: secret });
    const info = await zaloApi(token, 'getWebhookInfo');
    const saved = String(info.result?.url || '');
    rc.log('admin.zalo.connect', { ok: r.ok, data: { error: r.error, before: hookPath(before.result?.url), url: hookPath(saved) } });
    if (!r.ok) throw new HttpError(502, 'Zalo từ chối đăng ký webhook: ' + r.error);
    if (info.ok && saved && hookPath(saved) !== hookPath(hook)) throw new HttpError(502, 'Zalo báo đã nhận nhưng webhook vẫn trỏ về: ' + hookPath(saved));
    await recvState(env, { mode: 'webhook', connected: Date.now() });
    return json({ ok: true, url: hookPath(hook), before: hookPath(before.result?.url) || null, info: info.result ? { ...info.result, url: hookPath(saved) } : null });
  }
  if (sub === 'zalo/check' && method === 'GET') {
    const me = token ? await zaloApi(token, 'getMe') : null;
    const info = token ? await zaloApi(token, 'getWebhookInfo') : null;
    const last = await env.DB.prepare("SELECT ts, ok, data FROM events WHERE type LIKE 'zalo.%' ORDER BY id DESC LIMIT 10").all<any>();
    const links = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(user_id LIKE \'zl-%\') AS guests FROM zalo_links').first<any>();
    const expected = `${url.origin}/api/zalo/webhook`;
    const inbox = await env.DB.prepare('SELECT id, chat_id, status, error, received_at FROM zalo_messages ORDER BY received_at DESC LIMIT 1').first<any>();
    const reply = await env.DB.prepare('SELECT status, error, updated_at FROM zalo_outbox ORDER BY created_at DESC LIMIT 1').first<any>();
    const lastCall = await env.DB.prepare("SELECT ts, ok, data FROM events WHERE type IN ('zalo.webhook','zalo.received','zalo.ignored') ORDER BY id DESC LIMIT 1").first<any>();
    return json({
      steps: [
        { k: 'Bật tính năng Zalo', ok: env.config.zalo.enabled, fix: 'Bật ở mục Zalo rồi lưu.' },
        { k: 'Token hợp lệ', ok: !!me?.ok, detail: me?.result?.account_name || me?.result?.display_name || me?.error || 'chưa nhập token', fix: 'Lấy token trong Zalo Bot Creator và dán vào Khoá API.' },
        { k: 'Webhook trỏ về web này (bỏ qua nếu dùng hỏi định kỳ)', ok: hookPath(info?.result?.url) === expected || (await receiveMode(env)) === 'poll', detail: hookPath(info?.result?.url) || '(chưa có)', fix: 'Bấm "Kết nối webhook". Bot chỉ có một webhook: nếu đang trỏ về Apps Script/FACIUP hay web khác thì web này không nhận được tin.' },
        { k: 'Zalo đã gọi tới web này (bỏ qua nếu dùng hỏi định kỳ)', ok: (!!lastCall && lastCall.ok !== 0) || (await receiveMode(env)) === 'poll', detail: lastCall ? `${new Date(lastCall.ts).toLocaleString('vi-VN')} · ${lastCall.ok ? 'hợp lệ' : (JSON.parse(lastCall.data || '{}').error || 'bị từ chối')}` : 'Chưa có lần gọi nào.', fix: lastCall ? 'Sửa theo lỗi ở trên rồi nhắn lại GIUP.' : 'Zalo chưa gọi tới. Kiểm tra: (1) webhook đúng địa chỉ; (2) trong Zalo Bot Creator đã bật nhận sự kiện tin nhắn (message.text.received); (3) Cloudflare không chặn (tắt Bot Fight Mode / Under Attack cho /api/zalo/webhook); (4) bạn đang nhắn đúng bot có token này.' },
        { k: 'Web đã ghi nhận tin nhắn', ok: !!inbox, detail: inbox ? `Tin gần nhất: ${inbox.status}${inbox.error ? ' — ' + inbox.error : ''}` : 'Chưa có tin nhắn được ghi nhận.', fix: 'Nhắn GIUP cho bot rồi bấm Kiểm tra lại. Nếu không nhận, kiểm tra webhook và token.' },
        { k: 'Phản hồi gần nhất gửi thành công', ok: reply?.status === 'sent', detail: reply ? `${reply.status}${reply.error ? ' — ' + reply.error : ''}` : 'Chưa gửi phản hồi.', fix: 'Xem Hộp thư Zalo để thử gửi lại phản hồi lỗi.' },
        { k: 'Chủ web đã nhận bot (để nhận thông báo quản trị)', ok: !!env.config.zalo.ownerChat, fix: 'Tạo mã chủ web và gửi CHUWEB <mã> cho bot. Khách vẫn dùng bot khi chưa có chat chủ web.' },
        { k: 'Liên kết bot cho người dùng', ok: !!env.config.zalo.botLink, fix: 'Dán đường dẫn bot (https://zalo.me/...) ở mục Zalo.' },
      ],
      last: last.results, links, recv: { mode: await receiveMode(env), status: await zaloRecvStatus(env) },
    });
  }
  if (sub === 'zalo/inbox' && method === 'GET') {
    const messages = await env.DB.prepare('SELECT id, chat_id, sender_name, text, status, received_at, updated_at, attempts, error, project_id, job_id FROM zalo_messages ORDER BY received_at DESC LIMIT 50').all<any>();
    const replies = await env.DB.prepare('SELECT id, chat_id, message_id, text, status, updated_at, attempts, error FROM zalo_outbox ORDER BY created_at DESC LIMIT 50').all<any>();
    return json({ messages: messages.results, replies: replies.results });
  }
  if (sub === 'zalo/retry' && method === 'POST') {
    const input = await body<any>(req, 500);
    if (input.replyId) {
      const changed = await env.DB.prepare("UPDATE zalo_outbox SET status = 'pending' WHERE id = ? AND status = 'failed'").bind(String(input.replyId)).run();
      if (!changed.meta.changes) throw new HttpError(409, 'Phản hồi này không ở trạng thái lỗi.');
      const result = await deliverReply(env, String(input.replyId), true);
      rc.log('admin.zalo.retry', { ok: result.ok, data: { reply: input.replyId } });
      return json(result);
    }
    const changed = await env.DB.prepare("UPDATE zalo_messages SET status = 'received' WHERE id = ? AND (status = 'failed' OR (status = 'processing' AND updated_at < ?))").bind(String(input.messageId || ''), Date.now() - 120_000).run();
    if (!changed.meta.changes) throw new HttpError(409, 'Chỉ thử lại tin lỗi hoặc tác vụ đã hết hạn.');
    rc.wait(processMessage(env, rc, String(input.messageId), true));
    rc.log('admin.zalo.retry', { data: { message: input.messageId } });
    return json({ ok: true, queued: true });
  }
  if (sub === 'zalo/owner-code' && method === 'POST') {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    await env.DB.prepare("INSERT INTO zalo_codes (code, user_id, expires_at) VALUES (?, 'owner', ?)").bind(code, Date.now() + 30 * 60_000).run();
    return json({ command: 'CHUWEB ' + code, expiresMin: 30 });
  }
  if (sub === 'zalo/simulate' && method === 'POST') {
    // run a message through the same path as a real one, answering in the owner's chat
    if (!env.config.zalo.ownerChat) throw new HttpError(400, 'Chưa có Zalo chủ web: tạo mã chủ web và nhắn CHUWEB <mã> cho bot trước.');
    const text = String((await body<any>(req, 2000)).text || 'GIUP').slice(0, 1000);
    const id = 'sim-' + randomId(8), now = Date.now();
    await env.DB.prepare("INSERT INTO zalo_messages (id, chat_id, sender_name, text, is_text, status, received_at, updated_at) VALUES (?, ?, 'Mô phỏng', ?, 1, 'received', ?, ?)")
      .bind(id, env.config.zalo.ownerChat, text, now, now).run();
    await processMessage(env, rc, id);
    const reply = await env.DB.prepare('SELECT status, error, text FROM zalo_outbox WHERE message_id = ? ORDER BY created_at DESC LIMIT 1').bind(id).first<any>();
    return json({ ok: reply?.status === 'sent', reply });
  }
  if (sub === 'zalo/test' && method === 'POST') {
    if (!env.config.zalo.ownerChat) throw new HttpError(400, 'Chưa có Zalo chủ web.');
    const r = await send(env, env.config.zalo.ownerChat, 'Tin nhắn thử từ trang quản trị: kết nối Zalo hoạt động tốt ✅');
    if (!r.ok) throw new HttpError(502, 'Gửi chưa được: ' + r.error);
    return json({ ok: true });
  }
  throw new HttpError(404, 'Không tìm thấy.');
}

// ---------------------------------------------------------------- receiving without a webhook
// A webhook only works when Zalo can reach the site (address saved, message events switched on,
// no firewall in the way). Polling asks Zalo for new messages every minute from the scheduled
// job instead, so the bot answers even when the webhook is missing or broken. "auto" keeps the
// webhook while it is proven to work (a valid call in the last 3 days) and polls otherwise.

async function recvState(env: XEnv, v: Record<string, unknown>) {
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('zalo:recv', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify({ ...v, at: Date.now() }), Date.now()).run();
}
export async function zaloRecvStatus(env: XEnv) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'zalo:recv'").first<any>();
  try { return JSON.parse(r?.value || 'null'); } catch { return null; }
}

/** Which way messages come in right now. */
export async function receiveMode(env: XEnv): Promise<'webhook' | 'poll'> {
  const want = env.config.zalo.receive || 'auto';
  if (want !== 'auto') return want;
  // the admin just connected the webhook: it has 15 minutes to deliver a first message (Zalo's
  // calls can be blocked on the way, e.g. by a firewall rule), after which polling takes over
  const st = await zaloRecvStatus(env);
  if (st?.mode === 'webhook' && st.connected && Date.now() - st.connected < 15 * 60_000) return 'webhook';
  const ok = await env.DB.prepare("SELECT ts FROM events WHERE type IN ('zalo.received','zalo.ignored') AND channel = 'zalo' AND ts > ? AND json_extract(data, '$.via') IS NOT 'poll' ORDER BY id DESC LIMIT 1").bind(Date.now() - 3 * 86_400_000).first<any>();
  return ok ? 'webhook' : 'poll';
}

/**
 * Ask Zalo for new messages for about `budgetMs` (long polling), record and answer each.
 * Called every minute by the scheduled job when the mode is "poll".
 */
export async function pollZalo(env: XEnv, rc: Rc, budgetMs = 45_000) {
  const token = (env as any).ZALO_BOT_TOKEN;
  if (!env.config.zalo.enabled || !token) return { polled: 0 };
  // a webhook and polling cannot both be on: drop a webhook that is set but not working
  const info = await zaloApi(token, 'getWebhookInfo');
  if (info.ok && info.result?.url) {
    const del = await zaloApi(token, 'deleteWebhook');
    rc.log('zalo.poll.unhook', { ok: del.ok, data: { url: hookPath(info.result.url), error: del.error || undefined } });
  }
  const until = Date.now() + budgetMs;
  let got = 0, lastError = '';
  while (Date.now() < until - 3000) {
    const wait = Math.max(1, Math.min(25, Math.floor((until - Date.now()) / 1000) - 3));
    const r = await zaloApi(token, 'getUpdates', { timeout: wait }, (wait + 5) * 1000);
    if (!r.ok) {
      // "no updates" ends a long poll quietly on some versions of the API
      if (/timeout|no update|408/i.test(r.error) || r.status === 408) continue;
      lastError = r.error; break;
    }
    const updates = Array.isArray(r.result) ? r.result : r.result ? [r.result] : [];
    for (const u of updates) {
      const event = normalizeMessage(u);
      if (!event) continue;
      if (event.event && !event.event.includes('received')) continue;
      const id = event.id || randomId(16), now = Date.now();
      const ins = await env.DB.prepare(`INSERT OR IGNORE INTO zalo_messages (id, chat_id, sender_name, text, is_text, status, received_at, updated_at) VALUES (?, ?, ?, ?, ?, 'received', ?, ?)`)
        .bind(id, event.chatId, event.name, event.text, event.isText ? 1 : 0, now, now).run();
      if (!ins.meta.changes) continue;
      got++;
      rc.log('zalo.received', { data: { message: id, chat: event.chatId, event: event.event, via: 'poll' } });
      await processMessage(env, rc, id);
    }
  }
  await recvState(env, { mode: 'poll', ok: !lastError, error: lastError || undefined, got });
  return { polled: got, error: lastError };
}
