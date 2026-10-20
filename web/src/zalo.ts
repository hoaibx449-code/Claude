import {addOwner,ownerRecipients} from './zalo-owners.ts';
import {downloadZaloImage} from './ocr.ts';
import {feedSubscription} from './image-feed.ts';
import {requireBudget} from './budget.ts';
import {imagePromptText} from './ai.ts';
import {createHunter} from './hunter.ts';
// Zalo Bot (bot-api.zaloplatforms.com, Telegram-style API). People can:
//  · link the bot to their web account with a short code, or just start chatting
//    (a Zalo-only account is created when the admin allows it);
//  · send a script ("KB ...") or a topic ("TAO ...") and get the finished video back as a link;
//  · check progress, list recent videos, pick frame/style/voice, mute notifications.
// The bot belongs to this site alone (no other site in between), as in the Zalo Bot SDK
// (github.com/hvduong2k5/zalo-bot-java-sdk): a direct webhook in production, long polling when the
// webhook cannot be used. The webhook is verified with the secret token Zalo sends back on every call.
import type { User } from './auth.ts';
import { LOOK_KEYS, vis, ZALO_WAYS, type Config } from './settings.ts';
import { body, type Env, HttpError, json, randomId, sha256, timingSafeEqual, useQuota } from './util.ts';
import { assistantAnswer, anyTextAI, type AssistantTurn, type TextProvider } from './ai.ts';
import { budgetState } from './budget.ts';
import { aiCost, logEvent } from './log.ts';
import { pushUser } from './push.ts';
import { createOrder, planOf } from './plans.ts';
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

// People type commands the way they speak: "Hướng dẫn", "trạng thái?", "Hủy kết nối", "KB: ...".
// Longest first, so "KICH BAN MAU" wins over "KICH BAN".
const PHRASES: [string, string][] = ([
  ['HUY KET NOI', 'HUYKETNOI'], ['HUY LIEN KET', 'HUYKETNOI'], ['BO KET NOI', 'HUYKETNOI'], ['BO LIEN KET', 'HUYKETNOI'],
  ['KICH BAN MAU', 'MAU'], ['MAU KICH BAN', 'MAU'], ['HUONG DAN', 'HUONGDAN'], ['TRO GIUP', 'GIUP'], ['XIN CHAO', 'XINCHAO'],
  ['TRANG THAI', 'TT'], ['TIEN DO', 'TT'], ['DANH SACH', 'DS'], ['DINH DANG', 'DINHDANG'], ['PHONG CACH', 'PHONGCACH'],
  ['BANG GIA', 'GIA'], ['MUA GOI', 'MUA'], ['DANG KY GOI', 'MUA'], ['DANG KY', 'MUA'], ['NANG CAP', 'MUA'], ['NHAN VIEN', 'NV'], ['GAP NHAN VIEN', 'NV'],
  ['GIONG DOC', 'GIONG'], ['KHUNG HINH', 'KHUNG'], ['KICH BAN', 'KICHBAN'], ['KET NOI', 'KETNOI'], ['CHU WEB', 'CHUWEB'], ['TAO VIDEO', 'TAO'],
] as [string, string][]).sort((a, b) => b[0].split(' ').length - a[0].split(' ').length);

/** Command word (folded, upper case), the words after it (folded) and the original text after it. */
export function parseCommand(text: string) {
  const raw = String(text || '').trim();
  const words = fold(raw).split(/\s+/).filter(Boolean);
  const key = (w: string) => (w === '?' ? '?' : w.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  const keys = words.map(key);
  let n = keys.length ? 1 : 0, cmd = keys[0] || '';
  for (const [phrase, name] of PHRASES) {
    const p = phrase.split(' ');
    if (p.every((w, i) => keys[i] === w)) { n = p.length; cmd = name; break; }
  }
  const arg = n ? raw.replace(new RegExp(`^\\s*(?:\\S+(?:\\s+|$)){${n}}`), '').trim() : '';
  return { cmd, rest: words.slice(n), arg };
}
/** The 6-character code among the words after KETNOI / CHUWEB ("KETNOI ma ABC123" works too). */
const pickCode = (words: string[]) => { const w = words.map((x) => x.toUpperCase().replace(/[^A-Z0-9]/g, '')); return w.find((x) => /^[A-Z0-9]{6}$/.test(x)) || w[0] || ''; };
const COMMANDS = ['GIUP', 'HUONGDAN', 'HELP', 'START', 'MENU', '?', 'HD', 'XINCHAO', 'CHAO', 'HI', 'HELLO', 'TT', 'TRANGTHAI', 'DS', 'DANHSACH', 'KHUNG',
  'PROMPT', 'DINHDANG', 'DD', 'PHONGCACH', 'PC', 'GIONG', 'TAT', 'BAT', 'HUYKETNOI', 'MAU', 'TAO', 'KB', 'KICHBAN', 'KETNOI', 'CHUWEB', 'GIA', 'MUA', 'NV'];

/**
 * Messages whose answer needs the AI (a few seconds to a minute). A webhook call may only work
 * 30 seconds after it answered Zalo, so these are done by the minute job instead.
 */
export function needsAI(env: XEnv, text: string) {
  const { cmd, arg } = parseCommand(text);
  if(cmd==='PROMPT')return arg.length>=20||fold(arg).trim().toUpperCase()==='ANH';
  if (!anyTextAI(env)) return false;
  if (cmd === 'TAO') return !!arg && env.config.enabledSources.includes('topic');
  const script = cmd === 'KB' || cmd === 'KICHBAN' || (!COMMANDS.includes(cmd) && String(text || '').trim().length >= 120);
  return script;
}

async function send(env: XEnv, chatId: string, text: string, messageId?: string) {
  const id = randomId(16), now = Date.now();
  await env.DB.prepare('INSERT INTO zalo_outbox (id, chat_id, message_id, text, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, chatId, messageId || null, text.slice(0, 1900), 'pending', now, now).run();
  return deliverReply(env, id);
}

/** Marks a message to be sent with parse_mode "html" (bold, lists); only < and > need escaping here. */
const HTML = '\u0002H';
const escHtml = (t: string) => t.replace(/</g, '‹').replace(/>/g, '›');
/** A plain message with its key parts in bold: values after "•  Label:" lines, prices, and **…** the assistant marked. */
function richText(text: string) {
  return HTML + escHtml(text)
    .replace(/\*\*([^*\n]{1,80})\*\*/g, '<b>$1</b>')
    .replace(/^([•\-]\s*[^:\n]{1,30}:\s*)(.+)$/gm, '$1<b>$2</b>')
    .replace(/^(\d+\.\s+)([^:\n]{1,40}):/gm, '$1<b>$2</b>:');
}
const plain = (t: string) => t.replace(/<\/?b>/g, '');

async function deliverReply(env: XEnv, id: string, force = false) {
  const row = await env.DB.prepare(`UPDATE zalo_outbox SET status = 'sending', attempts = attempts + 1, updated_at = ?
    WHERE id = ? AND (attempts < 5 OR ?) AND (status IN ('pending','failed') OR (status = 'sending' AND updated_at < ?)) RETURNING *`)
    .bind(Date.now(), id, force ? 1 : 0, Date.now() - 120_000).first<any>();
  if (!row) return { ok: false, error: 'Tin đang gửi hoặc đã gửi.' };
  const token = (env as any).ZALO_BOT_TOKEN;
  const rich = String(row.text).startsWith(HTML), body = rich ? row.text.slice(HTML.length) : row.text;
  let result = token ? await zaloApi(token, 'sendMessage', rich ? { chat_id: row.chat_id, text: body, parse_mode: 'html' } : { chat_id: row.chat_id, text: body }) : { ok: false, status: 0, result: null, error: 'Chưa có Zalo Bot token.' };
  // formatting refused (older API, odd text): the same words without it, never no message
  if (!result.ok && rich && token) result = await zaloApi(token, 'sendMessage', { chat_id: row.chat_id, text: plain(body) });
  await env.DB.prepare("UPDATE zalo_outbox SET status = ?, error = ?, updated_at = ? WHERE id = ? AND status = 'sending' AND attempts = ?")
    .bind(result.ok ? 'sent' : 'failed', result.ok ? null : result.error, Date.now(), id, row.attempts).run();
  return result;
}

/** Web accounts of the site's admins (the admin list, or ADMIN_EMAIL). */
async function adminUsers(env: XEnv): Promise<string[]> {
  const emails = (env.config.admins.length ? env.config.admins : [env.ADMIN_EMAIL || '']).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!emails.length) return [];
  return (await env.DB.prepare(`SELECT id FROM users WHERE lower(email) IN (${emails.map(() => '?').join(',')})`).bind(...emails).all<any>()).results.map((r) => r.id);
}
/** Only the explicitly managed owner roster receives operational notifications. */
const ownerChats=ownerRecipients;

/** Notify only the active, explicitly managed owner roster; every attempt is logged. */
export async function notifyOwner(env: XEnv, kind: keyof Config['zalo']['notifyOwner'] | 'support', text: string) {
  const z = env.config.zalo;
  if (kind !== 'support' && !z.notifyOwner[kind]) return;
  let zalo = 0, push = 0, error = '';
  try {
    const { chats, admins } = await ownerChats(env);
    if (z.enabled && (env as any).ZALO_BOT_TOKEN) for (const c of chats) { const r = await send(env, c, '🔔 ' + text).catch((e) => ({ ok: false, error: String(e.message) })); if (r.ok) zalo++; else error = r.error || error; }
    for (const id of admins) { try { push += (await pushUser(env, id, { title: kind === 'order' ? 'Đơn hàng' : kind === 'support' ? 'Khách cần hỗ trợ' : 'Thông báo', body: text.slice(0, 200), url: kind === 'order' ? '/admin/don-hang' : '/admin/zalo' }, 'mailto:' + env.config.legal.email)).sent; } catch {} }
    if (!chats.length && !admins.length) error = 'Chưa có nơi nhận: nhắn CHUWEB <mã> cho bot, hoặc thêm Zalo trong danh sách Chủ web.';
    else if (!zalo && !push) error ||= chats.length ? 'Zalo chưa nhận tin' : 'Chưa có Zalo chủ web và chưa bật thông báo trên thiết bị của quản trị viên.';
  } catch (e: any) { error = String(e.message || e).slice(0, 200); }
  await logEvent(env, { type: 'owner.notify', channel: 'system', ok: !!(zalo || push), data: { kind, zalo, push, error: error || undefined, text: text.slice(0, 120) } }).catch(() => {});
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
  // Zalo sends the secret_token given to setWebhook in X-Bot-Api-Secret-Token; the SDK's example reads
  // X-Zalo-Signature; the address registered by "Kết nối webhook" also carries it (?s=) as a last resort
  const given = req.headers.get('x-bot-api-secret-token') || req.headers.get('x-zalo-signature') || new URL(req.url).searchParams.get('s') || '';
  if (!timingSafeEqual(given, secret)) return refuse(given ? 'sai mã bí mật: bấm "Kết nối webhook" lại' : 'thiếu mã bí mật: bấm "Kết nối webhook" lại');
  // the address Zalo really calls is the one the keeper must restore (installs connected before it existed)
  rc.wait((async () => { const st = (await zaloRecvStatus(env)) || {}, here = new URL(req.url).origin + '/api/zalo/webhook'; if (st.hook !== here) await recvState(env, { ...st, hook: here }); })());
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
  if(!event.isText&&event.text.startsWith('[ocr-image]')){
    rc.wait((async()=>{if(!await env.DB.prepare('SELECT 1 FROM zalo_outbox WHERE message_id=?').bind(id).first())await send(env,event.chatId,'Đã nhận ảnh. Mình sẽ đọc chữ trong ảnh và gửi lại để bạn kiểm tra; chưa tự đăng prompt.',id);})());
    return json({ok:true,recorded:true,deferred:true});
  }
  if (event.isText) rc.wait(typing(env, event.chatId));
  if (event.isText && needsAI(env, event.text)
    && (env.config.zalo.allowGuests || await env.DB.prepare('SELECT 1 FROM zalo_links WHERE chat_id = ?').bind(event.chatId).first())) {
    // the AI may take longer than the 30 seconds a webhook call gets: tell them now, the minute job does the rest
    rc.wait((async () => {
      const seen = await env.DB.prepare('SELECT 1 FROM zalo_outbox WHERE message_id = ? LIMIT 1').bind(id).first();
      if (!seen) await send(env, event.chatId, parseCommand(event.text).cmd==='PROMPT'?'Đã nhận prompt, mình đang đặt tiêu đề và phân loại…':'Đã nhận, mình đang viết kịch bản và chuẩn bị hình (khoảng 1–2 phút)…', id);
    })());
    return json({ ok: true, recorded: true, deferred: true });
  }
  rc.wait(processMessage(env, rc, id));
  return json({ ok: true, recorded: true });
}

export function normalizeMessage(payload: any) {
  const event = payload?.result || payload;
  const message = event?.message;
  const chatId = String(message?.chat?.id ?? message?.from?.id ?? '');
  if (!message || !chatId || chatId.length > 120) return null;
  const ev = String(event.event_name || '').slice(0, 80);
  // a picture with a caption is read as its caption; other kinds are kept as a short marker
  const caption = typeof message.caption === 'string' && message.caption.trim() ? message.caption : '';
  const text = typeof message.text === 'string' ? message.text : caption;
  const image=typeof message.photo_url==='string'?message.photo_url:typeof message.photo==='string'?message.photo:typeof message.photo?.url==='string'?message.photo.url:'';
  const kind = /image/.test(ev) || image ? 'image' : /sticker/.test(ev) || message.sticker ? 'sticker' : /voice/.test(ev) || message.voice_url ? 'voice' : /unsupported/.test(ev) ? 'unsupported' : '';
  return { chatId, id: String(message.message_id ?? event.update_id ?? '').slice(0, 160),
    name: String(message.from?.display_name || message.from?.name || '').slice(0, 60),
    text: kind==='image'&&image?'[ocr-image]'+JSON.stringify({url:image.slice(0,4000),caption:caption.slice(0,500)}):text ? text.slice(0, 20000) : kind ? `[${kind}]` : '', isText: kind==='image'?false:!!text,
    event: ev };
}

/** Thrown when the AI needs more time than a webhook call has: the minute job answers instead. */
class Defer extends Error {}

export async function processMessage(env: XEnv, rc: Rc, id: string, force = false, patient = false) {
  // (each message is counted once against the daily limit, on its first attempt)
  const row = await env.DB.prepare(`UPDATE zalo_messages SET status = 'processing', attempts = attempts + 1, updated_at = ?, error = NULL
    WHERE id = ? AND (attempts < 5 OR ?) AND (status IN ('received','failed') OR (status = 'processing' AND updated_at < ?)) RETURNING *`)
    .bind(Date.now(), id, force ? 1 : 0, Date.now() - 120_000).first<any>();
  if (!row) return;
  const messageRc: Rc = { ...rc, userId: null, log(type, extra = {}) { rc.log(type, { userId: messageRc.userId, ...extra }); } };
  try {
    await handleMessage(env, messageRc, row.chat_id, row.text, row.sender_name, !!row.is_text, id, row.attempts === 1, patient);
    await env.DB.prepare("UPDATE zalo_messages SET status = 'handled', updated_at = ? WHERE id = ? AND status = 'processing' AND attempts = ?").bind(Date.now(), id, row.attempts).run();
  } catch (error: any) {
    if (error instanceof Defer) {
      // back in the queue for the minute job (no "sorry" message: the real answer is coming)
      await env.DB.prepare("UPDATE zalo_messages SET status = 'received', error = ?, updated_at = ? WHERE id = ? AND status = 'processing'").bind('chờ AI trả lời (' + error.message + ')', Date.now(), id).run();
      messageRc.log('zalo.assistant.defer', { data: { message: id, why: error.message } });
      return;
    }
    const changed = await env.DB.prepare("UPDATE zalo_messages SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status = 'processing' AND attempts = ?").bind(String(error.message || 'Lỗi xử lý tin nhắn.').slice(0, 300), Date.now(), id, row.attempts).run();
    if (!changed.meta.changes) return;
    messageRc.log('zalo.processing', { ok: false, data: { message: id, error: String(error.message || 'Lỗi xử lý').slice(0, 200) } });
    // retried by the minute job: say sorry once, not on every attempt
    if (row.attempts === 1) await send(env, row.chat_id,'Chưa xử lý được tin nhắn. Bạn thử lại sau ít phút hoặc liên hệ chủ web.', id);
  }
}

export async function resumeZalo(env: XEnv, rc: Rc) {
  if (!env.config.zalo.enabled || !(env as any).ZALO_BOT_TOKEN) return;
  const messages = await env.DB.prepare("SELECT id FROM zalo_messages WHERE attempts < 5 AND (status IN ('received','failed') OR (status = 'processing' AND updated_at < ?)) ORDER BY received_at LIMIT 5").bind(Date.now() - 120_000).all<any>();
  // the minute job has time: the AI gets a long deadline here
  for (const row of messages.results) await processMessage(env, rc, row.id, false, true);
  const replies = await env.DB.prepare("SELECT id FROM zalo_outbox WHERE attempts < 5 AND (status IN ('pending','failed') OR (status = 'sending' AND updated_at < ?)) ORDER BY created_at LIMIT 5").bind(Date.now() - 120_000).all<any>();
  for (const row of replies.results) await deliverReply(env, row.id);
}

async function handleMessage(env: XEnv, rc: Rc, chatId: string, text: string, name: string, isText: boolean, messageId: string, firstTry = true, patient = false) {
  const z = env.config.zalo, t = z.templates;
  const reply = async (s: string) => { const r = await send(env, chatId, s, messageId); rc.log('zalo.reply', { ok: r.ok, data: { chat: chatId, message: messageId, error: r.ok ? undefined : r.error } }); return r; };
  // Consent commands bypass AI, commercial intents and daily chat quota, especially opt-out.
  if(isText){const consent=fold(text).trim().toUpperCase().replace(/\s+/g,' ');
    if(['NHAN ANH','DANG KY NHAN ANH','HUY NHAN ANH'].includes(consent))return reply(await feedSubscription(env,chatId,name,consent!=='HUY NHAN ANH'));
  }
  const link = await env.DB.prepare('SELECT l.user_id, l.prefs, l.notify, u.email, u.name FROM zalo_links l JOIN users u ON u.id = l.user_id WHERE l.chat_id = ?').bind(chatId).first<any>();
  rc.userId = link?.user_id || null;
  rc.log('zalo.message', { data: { chat: chatId, linked: !!link, text: text.startsWith('[ocr-image]')?'[image OCR]':text.slice(0, 200) } });
  const owner = (await ownerChats(env)).chats.includes(chatId);
  if(!isText&&(text.startsWith('[ocr-image]')||text==='[image OCR completed]')){
    if(!z.ocrEnabled)return reply('Đọc chữ từ ảnh đang tắt. Quản trị có thể bật ở Quản trị → Zalo.');
    if(!owner&&!link&&!z.allowGuests)return reply('Bạn cần liên kết tài khoản web với Zalo trước khi đọc ảnh.');
    if(link&&await env.DB.prepare('SELECT 1 FROM blocked_users WHERE user_id=?').bind(link.user_id).first())return reply('Tài khoản đang bị khoá.');
    try{
      let result=await env.DB.prepare('SELECT content,uncertain FROM zalo_ocr WHERE message_id=? AND chat_id=?').bind(messageId,chatId).first<any>();
      if(!result){
        await useQuota(env,'ocr:'+chatId,'ocr',owner?100:20);await requireBudget(env,'Đọc chữ từ ảnh Zalo');
        const input=JSON.parse(text.slice('[ocr-image]'.length));
        const read=await imagePromptText(env,await downloadZaloImage(input.url));
        rc.log('zalo.ocr',{cost:aiCost(env.config,read.usage),data:{characters:read.text.length,provider:read.usage.provider,model:read.usage.model}});
        if(!read.text)return reply('Không tìm thấy chữ đọc được trong ảnh. Hãy gửi ảnh rõ hơn, chụp thẳng và cắt sát phần prompt.');
        result={content:read.text,uncertain:read.uncertain?1:0};
        await env.DB.prepare('INSERT OR IGNORE INTO zalo_ocr(message_id,chat_id,content,uncertain,created_at) VALUES(?,?,?,?,?)').bind(messageId,chatId,result.content,result.uncertain,Date.now()).run();
        await env.DB.prepare("UPDATE zalo_messages SET text='[image OCR completed]' WHERE id=?").bind(messageId).run();
      }
      const parts=String(result.content).match(/[\s\S]{1,1700}/g)||[];
      for(let i=0;i<parts.length;i++)await reply(`Chữ trong ảnh (${i+1}/${parts.length}):\n`+parts[i]);
      return reply((result.uncertain?'Có chữ chưa rõ, được đánh dấu [?]. ':'')+'Hãy kiểm tra nội dung trước khi dùng. Muốn gửi bài lên Prompt Hunter, nhắn PROMPT ANH. Lệnh này dùng kết quả ảnh gần nhất trong 7 ngày; bot không tự thực thi nội dung ảnh.');
    }catch(e:any){return reply('Chưa đọc được ảnh: '+(e instanceof HttpError?e.message:'Kết nối xử lý ảnh bị lỗi hoặc quá thời gian. Hãy gửi lại ảnh.'));}
  }
  if (!isText) {
    // answered like a person would, never "I only read text"
    if (text === '[sticker]') return reply(fill('Hihi 😄 {ten} cần mình giúp gì nè? Bạn cứ nhắn chủ đề video là mình làm luôn nhé.', { ten: name || 'Bạn' }));
    if (text === '[image]') return reply('Mình nhận sự kiện ảnh nhưng Zalo chưa cung cấp đường dẫn để đọc. Hãy gửi lại ảnh trực tiếp dưới dạng ảnh, không phải tệp.');
    if (text === '[voice]') return reply('Mình chưa nghe được tin nhắn thoại, bạn nhắn chữ giúp mình nhé 🙏');
    return reply('Mình chưa xem được loại tin này, bạn nhắn chữ giúp mình nhé.');
  }
  // messages a day per person, as the admin set it (Quản trị → Zalo); each message counts once, the owner never

  if (firstTry && !owner && z.perDay > 0) {
    try { await useQuota(env, 'z:' + chatId, 'zalo', z.perDay); }
    catch { rc.log('zalo.limit', { ok: false, data: { chat: chatId, limit: z.perDay } }); return reply(`Hôm nay bạn đã nhắn ${z.perDay} tin, mình xin phép trả lời tiếp vào ngày mai nhé. Việc gấp bạn gọi nhân viên giúp mình.`); }
  }

  const lead = await getLead(env, chatId);
  let raw = text.trim();
  // "1", "số 2"… answers the numbered choices we offered last
  const num = raw.match(/^\s*(?:s[oố]\s*)?([1-9])\s*[.)!]?\s*$/i);
  if (num && lead.menu?.[Number(num[1]) - 1]) raw = lead.menu[Number(num[1]) - 1].say;
  const { cmd, rest, arg } = parseCommand(raw);

  if(cmd==='PROMPT'&&fold(arg).trim().toUpperCase()==='ANH'){
    if(!owner&&!link)return reply('Để gửi prompt từ ảnh, hãy liên kết tài khoản web với Zalo trước.');
    if(link&&await env.DB.prepare('SELECT 1 FROM blocked_users WHERE user_id=?').bind(link.user_id).first())return reply('Tài khoản đang bị khoá.');
    const read=await env.DB.prepare('SELECT message_id,content FROM zalo_ocr WHERE chat_id=? AND created_at>? ORDER BY created_at DESC LIMIT 1').bind(chatId,Date.now()-7*86400000).first<any>();
    if(!read)return reply('Chưa có kết quả OCR trong 7 ngày gần đây. Hãy gửi ảnh prompt trước.');
    try{const author={id:link?.user_id||'zalo-owner',name:name||'Người chia sẻ'},made=await createHunter(env,rc,author,{content:read.content},owner,'zalo-ocr:'+await sha256(chatId+'|'+read.message_id));
      return reply((made.status==='published'?'Đã đăng prompt từ ảnh.':'Đã gửi prompt từ ảnh, đang chờ quản trị duyệt.')+' '+origin(env)+'/prompt-hunter');
    }catch(e:any){return reply('Chưa gửi prompt từ ảnh: '+e.message);}
  }
  if(cmd==='PROMPT'){
    if(!owner)return reply('Lệnh PROMPT dành cho quản trị. Bạn có thể gửi bài tại trang Prompt Hunter trên web để được duyệt.');
    if(arg.length<20)return reply('Cú pháp: PROMPT <nội dung đầy đủ>. AI sẽ đặt tiêu đề và phân loại; sửa lại tại Quản trị → Prompt Hunter.');
    const author=link?.user_id?{id:link.user_id,name:name||'Quản trị'}:{id:'zalo-owner',name:'Quản trị'};
    try{const made=await createHunter(env,rc,author,{content:arg},true,'zalo:'+await sha256(chatId+'|'+messageId));return reply('Đã đăng Prompt Hunter. '+(made.ai==='failed'?'AI chưa phân loại được; hãy sửa tiêu đề và nhóm trong quản trị. ':'')+'Mở '+origin(env)+'/prompt-hunter');}
    catch(e:any){return reply('Chưa đăng prompt: '+e.message);}
  }

  // owner claims the bot (code from the admin page)
  if (cmd === 'CHUWEB') {
    const code = pickCode(rest);
    const row = code ? await env.DB.prepare("SELECT user_id FROM zalo_codes WHERE code = ? AND user_id = 'owner' AND expires_at > ?").bind(code, Date.now()).first() : null;
    // an admin's own linked Zalo needs no code
    const admin = !row && link && (await adminUsers(env)).includes(link.user_id);
    if (!row && !admin) return reply('Mã chủ web không đúng hoặc đã hết hạn. Tạo mã mới trong trang Quản trị → Zalo.');
    await saveOwnerChat(env, chatId);
    if (code) await env.DB.prepare('DELETE FROM zalo_codes WHERE code = ?').bind(code).run();
    rc.log('zalo.owner', { data: { chat: chatId } });
    return reply('Đã nhận bạn là chủ web. Mình sẽ báo người dùng mới, video lỗi, đơn hàng và khách cần hỗ trợ ở đây.\nTrả lời khách: TL <mã khách> <lời nhắn>.');
  }
  // link to a web account
  if (cmd === 'KETNOI') {
    const code = pickCode(rest);
    const row = await env.DB.prepare("SELECT user_id FROM zalo_codes WHERE code = ? AND user_id != 'owner' AND expires_at > ?").bind(code, Date.now()).first<any>();
    if (!row) return reply('Mã kết nối không đúng hoặc đã hết hạn. Mở web → Kết nối Zalo để lấy mã mới.');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM zalo_links WHERE chat_id = ? OR user_id = ?').bind(chatId, row.user_id),
      env.DB.prepare('INSERT INTO zalo_links (user_id, chat_id, name, linked_at, notify, prefs) VALUES (?, ?, ?, ?, 1, ?)').bind(row.user_id, chatId, name.slice(0, 60), Date.now(), '{}'),
      env.DB.prepare('DELETE FROM zalo_codes WHERE code = ?').bind(code),
    ]);
    const u = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(row.user_id).first<any>();
    rc.userId = row.user_id; rc.log('zalo.link', { data: { chat: chatId } });
    // the owner linking their own Zalo: owner news comes here from now on
    if ((await adminUsers(env)).includes(row.user_id)) await reply('Đã liên kết Zalo của tài khoản quản trị. Thêm Zalo vào danh sách Chủ web nếu muốn nhận thông báo vận hành.');
    return reply(fill(t.linked, { email: u?.email || '', ten: name }));
  }

  let user: User | null = link ? { id: link.user_id, email: link.email, name: link.name, picture: null } : null;
  if (user && await env.DB.prepare('SELECT 1 FROM blocked_users WHERE user_id = ?').bind(user.id).first()) return reply('Tài khoản đang bị khóa. Vui lòng liên hệ chủ web.');
  // choices made in conversation before an account existed live with the lead
  const prefs = { ...(lead.profile.prefs || {}), ...(link ? JSON.parse(link.prefs || '{}') : {}) };
  const help = () => reply(fill(t.help, { ten: name || link?.name || 'bạn' })+'\nNHẬN ẢNH: đăng ký ảnh mới · HỦY NHẬN ẢNH: dừng nhận.');
  // the owner answers a customer the assistant handed over: TL <mã khách> <lời nhắn>
  if (cmd === 'TL' && (await ownerChats(env)).chats.includes(chatId)) {
    const code = (rest[0] || '').toLowerCase(), msg = raw.replace(/^\s*\S+\s+\S+\s*/, '').trim();
    if (!/^[a-z0-9]{4,12}$/.test(code) || !msg) return reply('Gửi: TL <mã khách> <lời nhắn>. Mã khách có trong tin báo "Khách cần hỗ trợ".');
    const target = await env.DB.prepare("SELECT chat_id FROM zalo_messages WHERE lower(substr(chat_id, -6)) = ? ORDER BY received_at DESC LIMIT 1").bind(code).first<any>();
    if (!target) return reply('Không tìm thấy khách có mã ' + code + '.');
    const r = await send(env, target.chat_id, msg);
    // a person is answering this customer now: the assistant steps back for 30 minutes
    await saveLead(env, target.chat_id, { human_until: Date.now() + 30 * 60_000 });
    rc.log('zalo.handoff.reply', { ok: r.ok, data: { chat: target.chat_id } });
    return reply(r.ok ? 'Đã gửi cho khách ' + code + '.' : 'Chưa gửi được: ' + r.error);
  }
  const assistantOn = z.assistant.enabled && !!anyTextAI(env);
  // greetings and "?" get the menu; a free question goes to the assistant when it is on
  if (['GIUP', 'HUONGDAN', 'HELP', 'START', 'MENU', '?', 'HD'].includes(cmd)) return help();
  if (!cmd || (!assistantOn && ['XINCHAO', 'CHAO', 'HI', 'HELLO'].includes(cmd))) return reply(await withMenu(env, chatId, fill(t.welcome, { ten: name || 'bạn', troLy: z.assistant.name, thuongHieu: brandOf(env.config) }), START_MENU));

  const known = COMMANDS.includes(cmd) && !(assistantOn && ['XINCHAO', 'CHAO', 'HI', 'HELLO'].includes(cmd));
  // a long message is a script to film; with the assistant on, a long question is a question
  const longScript = !known && raw.length >= 120 && !(assistantOn && /\?/.test(raw));
  const ctx = (): AskCtx => ({ chatId, messageId, name, text: raw, user, link, prefs, reply, lead, firstTry, patient });
  // a free message: the AI assistant, or (AI off) answers recognised from the words
  const ask = async () => {
    // a member of staff took this chat over: pass the message on instead of answering over them
    if (lead.human_until && lead.human_until > Date.now()) {
      const code = chatId.slice(-6).toLowerCase();
      await notifyOwner(env, 'support', `Khách [${code}] ${name || ''} nhắn: "${raw.slice(0, 300)}"\nTrả lời: TL ${code} <lời nhắn>`);
      rc.log('zalo.handoff.forward', { data: { chat: chatId } });
      return;
    }
    return assistantOn ? assistantReply(env, rc, ctx()) : quickAnswer(env, rc, ctx(), 'trợ lý AI đang tắt');
  };
  if (!user) {
    // nothing to show or undo yet: answer without signing them up
    if (cmd === 'HUYKETNOI') return reply('Zalo này chưa kết nối tài khoản nào.');
    if (['TT', 'TRANGTHAI', 'DS', 'DANHSACH'].includes(cmd)) return reply('Zalo này chưa có video nào. Gửi KB + kịch bản để AI thiết kế video.');
    if (cmd === 'GIA') return reply(await quote(env, { chatId }));
    if (cmd === 'NV') return quickAnswer(env, rc, { ...ctx(), text: 'gặp nhân viên ' + arg });
    if (!known && !longScript) return ask();
    // any other real command (a video, or a choice of frame/voice/format/notifications) needs an account
    if (!z.allowGuests) return reply('Bạn cần kết nối tài khoản trước: mở web → Kết nối Zalo, rồi gửi mã cho mình.');
    user = await guestUser(env, chatId, name);
    rc.userId = user.id;
  }
  const savePrefs = (p: any) => env.DB.prepare('UPDATE zalo_links SET prefs = ? WHERE chat_id = ?').bind(JSON.stringify(p), chatId).run();

  switch (cmd) {
    case 'TT': case 'TRANGTHAI': return reply(await statusText(env,user));
    case 'DS': case 'DANHSACH': {
      const ps = (await env.DB.prepare('SELECT title, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5').bind(user.id).all<any>()).results;
      return reply(ps.length ? 'Video gần đây:\n' + ps.map((p, i) => `${i + 1}. ${p.title}`).join('\n') + `\nSửa chi tiết trên web: ${origin(env)}` : 'Chưa có video nào.');
    }
    case 'KHUNG': {
      const v = fold(rest.join(' ')).toLowerCase();
      if (!/ngang|doc|16|9/.test(v)) return reply(`Khung hiện tại: ${prefs.ratio === '16:9' ? 'ngang 16:9' : 'dọc 9:16'}.\nGõ KHUNG DOC (TikTok, Reels) hoặc KHUNG NGANG (YouTube).`);
      // "9:16" is tall even though it contains 16
      prefs.ratio = /ngang|16\s*[:x/]\s*9|^16$/.test(v) ? '16:9' : '9:16';
      await savePrefs(prefs);
      return reply(`Đã chọn khung ${prefs.ratio === '16:9' ? 'ngang 16:9 (YouTube)' : 'dọc 9:16 (TikTok, Reels)'}.`);
    }
    case 'DINHDANG': case 'DD': case 'PHONGCACH': case 'PC': {
      // the formats the admin lets people pick in Zalo (Quản trị → Zalo → Định dạng video qua Zalo)
      const c = env.config, looks = zaloWays(c), def = c.zalo.formats.default;
      if (looks.length < 2) return reply(`Video qua Zalo được dựng theo định dạng: ${wayName(c, wayFor(c, prefs))}.`);
      const n = Number(rest[0]);
      if (!rest.length) return reply(`Chọn định dạng video (gõ DINHDANG + số):\n0. ${wayName(c, def)} (mặc định)\n` + looks.map((k, i) => `${i + 1}. ${wayName(c, k)} — ${wayNote(c, k)}`).join('\n') + `\nĐang dùng: ${wayName(c, wayFor(c, prefs))}`);
      const want = fold(rest.join(' ')).toLowerCase();
      const pick = n === 0 && /^0$/.test(rest[0]) ? undefined : looks[n - 1] || looks.find((k) => fold(wayName(c, k)).toLowerCase().includes(want));
      if (n !== 0 && !pick) return reply('Không có định dạng đó. Gõ DINHDANG để xem danh sách.');
      prefs.look = pick; await savePrefs(prefs);
      return reply('Đã chọn định dạng: ' + wayName(c, wayFor(c, prefs)));
    }
    case 'GIONG': {
      const voices = env.config.voices.filter((v) => vis(env.config, 'voice:' + v.code) === 'on');
      const n = Number(rest[0]);
      if (!n) return reply('Chọn giọng đọc (gõ GIONG + số):\n' + voices.map((v, i) => `${i + 1}. ${v.label}`).join('\n'));
      if (!voices[n - 1]) return reply('Không có giọng số ' + n);
      prefs.voice = voices[n - 1].code; await savePrefs(prefs);
      return reply('Đã chọn giọng: ' + voices[n - 1].label);
    }
    case 'GIA': return reply(await quote(env, { chatId }, (await planOf(env, user.id)).plan.id));
    case 'MUA': {
      const want = arg ? wantedPlan(env.config, arg) : null;
      if (!want) return reply(await quote(env, { chatId }, (await planOf(env, user.id)).plan.id));
      return closeSale(env, rc, chatId, name, user, want, messageId);
    }
    case 'NV': return quickAnswer(env, rc, { ...ctx(), text: 'gặp nhân viên ' + arg });
    case 'TAT': case 'BAT':
      if(cmd==='TAT')await feedSubscription(env,chatId,name,false);
      await env.DB.prepare('UPDATE zalo_links SET notify = ? WHERE chat_id = ?').bind(cmd === 'BAT' ? 1 : 0, chatId).run();
      return reply(cmd === 'BAT' ? 'Đã bật thông báo video. Gõ NHẬN ẢNH nếu muốn đăng ký ảnh tự động.' : 'Đã tắt thông báo và hủy nhận ảnh tự động. Gõ BAT để bật thông báo video; NHẬN ẢNH để nhận ảnh lại.');
    case 'HUYKETNOI':
      await env.DB.prepare('DELETE FROM zalo_links WHERE chat_id = ?').bind(chatId).run();
      rc.log('zalo.unlink', { data: { chat: chatId } });
      return reply('Đã bỏ liên kết Zalo.');
    case 'MAU': return reply('Đã bỏ kịch bản mẫu. Gửi TAO + chủ đề hoặc KB + kịch bản để AI thiết kế video riêng.');
  }
  if (cmd === 'TAO') {
    if (!arg) return reply('Gửi: TAO + chủ đề. Ví dụ: TAO vì sao lương mãi không tăng');
    if (!env.config.enabledSources.includes('topic') || !anyTextAI(env)) return reply(t.noAI);
    return makeVideo(env, rc, user, chatId, 'topic', arg, prefs, !link, messageId);
  }
  if (cmd === 'KB' || cmd === 'KICHBAN' || longScript) {
    const script = cmd === 'KB' || cmd === 'KICHBAN' ? arg : raw;
    if (script.length < 20) return reply('Gửi: KB + kịch bản của bạn (ít nhất một câu).');
    const src = 'mine-ai';
    return makeVideo(env, rc, user, chatId, src, script, prefs, !link, messageId);
  }
  return ask();
}

interface AskCtx { chatId: string; messageId: string; name: string; text: string; user: User | null; link: any; prefs: any; reply: (s: string) => Promise<any>; lead: Lead;
  /** first time this message is handled (limits count once) */ firstTry?: boolean;
  /** handled by the minute job: the AI may take longer, and there is no later chance to defer to */ patient?: boolean }

// ---------------------------------------------------------------- what the assistant remembers about a person
const STAGES = ['new', 'interested', 'trying', 'quoted', 'customer', 'lost'] as const;
interface MenuItem { label: string; say: string }
interface Lead { stage: string; profile: Record<string, any>; menu: MenuItem[] | null; quoted_at: number | null; followups: number; optout: number; human_until: number | null }
async function getLead(env: XEnv, chatId: string): Promise<Lead> {
  const r = await env.DB.prepare('SELECT stage, profile, menu, quoted_at, followups, optout, human_until FROM zalo_leads WHERE chat_id = ?').bind(chatId).first<any>();
  const parse = (v: string | null, d: any) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
  return r ? { ...r, profile: parse(r.profile, {}), menu: parse(r.menu, null) } : { stage: 'new', profile: {}, menu: null, quoted_at: null, followups: 0, optout: 0, human_until: null };
}
async function saveLead(env: XEnv, chatId: string, patch: Partial<Lead>) {
  const l = { ...(await getLead(env, chatId)), ...patch };
  await env.DB.prepare(`INSERT INTO zalo_leads (chat_id, stage, profile, menu, quoted_at, followups, optout, human_until, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (chat_id) DO UPDATE SET stage = excluded.stage, profile = excluded.profile, menu = excluded.menu, quoted_at = excluded.quoted_at, followups = excluded.followups,
      optout = excluded.optout, human_until = excluded.human_until, updated_at = excluded.updated_at`)
    .bind(chatId, STAGES.includes(l.stage as any) ? l.stage : 'new', JSON.stringify(l.profile || {}).slice(0, 3000), l.menu ? JSON.stringify(l.menu).slice(0, 2000) : null,
      l.quoted_at ?? null, l.followups || 0, l.optout ? 1 : 0, l.human_until ?? null, Date.now()).run();
}
/** Numbered choices at the end of a message; "1" in the next message means the first one. */
async function withMenu(env: XEnv, chatId: string, text: string, items: MenuItem[]) {
  await saveLead(env, chatId, { menu: items.length ? items : null });
  // a text that already lists numbered choices (an older welcome template) keeps its own wording
  return items.length && !/\n\s*1[.)]/.test(text) ? text.trimEnd() + '\n' + items.map((x, i) => `${i + 1}. ${x.label}`).join('\n') : text;
}
const START_MENU: MenuItem[] = [
  { label: 'Làm thử một video miễn phí', say: 'mình muốn làm thử video' },
  { label: 'Xem video mẫu', say: 'cho mình xem video mẫu' },
  { label: 'Xem bảng giá', say: 'bảng giá thế nào' },
  { label: 'Nói chuyện với nhân viên', say: 'gặp nhân viên' },
];
/** The site's address, also from a scheduled job (where no request told it). */
async function siteUrl(env: XEnv) {
  if (origin(env)) return origin(env);
  const st = await zaloRecvStatus(env);
  try { return st?.hook ? new URL(st.hook).origin : ''; } catch { return ''; }
}
/** A few videos people made (community), each as a picture with its link: shows better than it tells. */
async function sendSamples(env: XEnv, rc: Rc, chatId: string, messageId?: string) {
  const token = (env as any).ZALO_BOT_TOKEN, web = await siteUrl(env);
  const rows = (await env.DB.prepare('SELECT c.job_id, c.title, c.user_id FROM community c WHERE c.hidden = 0 ORDER BY c.likes DESC, c.created_at DESC LIMIT 6').all<any>().catch(() => ({ results: [] as any[] }))).results;
  let sent = 0;
  for (const v of rows) {
    if (sent >= 3) break;
    if (!(await env.BUCKET.head(`thumb/${v.user_id}/${v.job_id}.jpg`))) continue;
    const link = await shareLink(env, web, v.job_id), photo = link.replace(`/api/share/${v.job_id}?`, `/api/share/${v.job_id}/thumb.jpg?`);
    const r = token ? await zaloApi(token, 'sendPhoto', { chat_id: chatId, photo, caption: `🎬 ${v.title}\nXem video: ${link}` }, 10_000) : { ok: false };
    if (r.ok) sent++;
  }
  rc.log('zalo.samples', { data: { chat: chatId, sent } });
  const text = sent ? 'Đó là vài video mọi người làm bằng bên mình đó ạ. Bạn định làm video về chủ đề gì, mình làm thử cho bạn xem luôn nhé?'
    : `Bạn xem video mẫu ngay trên trang chủ nhé: ${web}\nHoặc nhắn mình một chủ đề, mình làm thử miễn phí cho bạn xem luôn.`;
  return send(env, chatId, text, messageId);
}
// ---------------------------------------------------------------- selling in Zalo
const BANKS: Record<string, string> = { '970436': 'Vietcombank', '970415': 'VietinBank', '970418': 'BIDV', '970405': 'Agribank', '970422': 'MB Bank', '970407': 'Techcombank',
  '970416': 'ACB', '970432': 'VPBank', '970423': 'TPBank', '970403': 'Sacombank', '970437': 'HDBank', '970441': 'VIB', '970443': 'SHB', '970431': 'Eximbank', '970426': 'MSB',
  '970448': 'OCB', '970440': 'SeABank', '970449': 'LPBank', '970428': 'Nam A Bank', '970425': 'ABBANK', '970454': 'BVBank', '970452': 'KienlongBank', '970419': 'NCB', '963388': 'Timo' };
const vnd = (n: number) => n.toLocaleString('vi-VN') + 'đ';
/** Plans for sale, numbered the way the customer types them (MUA 1, MUA 2…). */
const forSale = (c: Config) => c.plans.filter((p) => p.visible && p.price > 0).sort((a, b) => a.price - b.price);
const brandOf = (c: Config) => `${c.brand.name} ${c.brand.accent}`.trim();
const minutes = (c: Config, s: number) => String(Math.round(Math.min(s, c.limits.maxSeconds) / 6) / 10).replace('.', ',');

/** The price list, with the customer's current plan marked. */
export function offerText(env: XEnv, currentId?: string) {
  const c = env.config, list = forSale(c), free = c.plans.find((p) => p.price === 0);
  const lines = [
    ...(free ? [`• ${free.name}: 0đ — ${free.limits.render} video/ngày, mỗi video tới ${minutes(c, free.maxSeconds)} phút${currentId === free.id || !currentId ? ' (bạn đang dùng)' : ''}`] : []),
    ...list.map((p, i) => `${i + 1}. ${p.name}: ${vnd(p.price)}${p.days === 30 ? '/tháng' : ` / ${p.days} ngày`}${p.listPrice > p.price ? ` (giá gốc ${vnd(p.listPrice)})` : ''}${p.yearPrice ? `, hoặc ${vnd(p.yearPrice)}/năm` : ''} — ${p.limits.render} video/ngày, mỗi video tới ${minutes(c, p.maxSeconds)} phút${p.limits.script ? `, ${p.limits.script} lượt AI viết kịch bản/ngày` : ''}${p.features.length ? ', ' + p.features.slice(0, 3).join(', ') : ''}${currentId === p.id ? ' (bạn đang dùng)' : ''}`),
  ];
  return fill(c.zalo.templates.offer, { thuongHieu: brandOf(c), goi: lines.join('\n'), goiNam: list.some((p) => p.yearPrice) ? ', thêm NAM để trả theo năm (vd: MUA 1 NAM)' : '' });
}
/** The price list as an answer: remembered as quoted (for the follow-up), and "1" then buys plan 1. */
async function quote(env: XEnv, x: { chatId: string }, currentId?: string) {
  const list = forSale(env.config);
  await saveLead(env, x.chatId, { quoted_at: Date.now(), stage: 'quoted', menu: list.map((p, i) => ({ label: p.name, say: `MUA ${i + 1}` })) });
  return richText(offerText(env, currentId));
}
/** "1", "2 năm", "chuyên nghiệp", "pro:year" → the order key, or null. */
export function wantedPlan(c: Config, words: string) {
  const list = forSale(c), t = fold(words).toLowerCase().trim();
  const year = /\bnam\b|\byear\b|:year/.test(t);
  const n = Number((t.match(/\d+/) || [])[0]);
  const p = (n && list[n - 1]) || list.find((x) => t.includes(fold(x.name).toLowerCase()) || t.split(/[\s:]+/).includes(x.id)) || (list.length === 1 && /\b(chot|lay|dong y|ok)\b/.test(t) ? list[0] : null);
  if (!p) return null;
  return year && p.yearPrice ? p.id + ':year' : p.id;
}
/** A nudge to the next plan up (used when a limit is reached), or '' when there is nothing to sell. */
async function upsellText(env: XEnv, user: User | null) {
  const c = env.config, list = forSale(c);
  if (!list.length || !c.payment.enabled) return '';
  const cur = user ? (await planOf(env, user.id)).plan : c.plans.find((p) => p.price === 0);
  const next = list.find((p) => p.limits.render > (cur?.limits.render || 0) || p.maxSeconds > (cur?.maxSeconds || 0));
  if (!next) return '';
  return fill(c.zalo.templates.upsell, { goiGoiY: next.name, giaGoiY: vnd(next.price) + (next.days === 30 ? '/tháng' : ''), loiIch: `${next.limits.render} video mỗi ngày, mỗi video tới ${minutes(c, next.maxSeconds)} phút`, soGoiY: list.indexOf(next) + 1 });
}
/**
 * Closing the sale: an order for the chosen plan, and everything needed to pay it right here in
 * Zalo — the VietQR picture (scan with any bank app) and the account, amount and transfer memo.
 */
async function closeSale(env: XEnv, rc: Rc, chatId: string, name: string, user: User | null, want: string, messageId?: string) {
  const c = env.config, z = c.zalo;
  if (!user) {
    if (!z.allowGuests) return send(env, chatId, 'Bạn kết nối tài khoản web trước nhé: mở web → Kết nối Zalo, rồi gửi mã cho mình. Hoặc mua trên web: ' + origin(env) + '/goi', messageId);
    user = await guestUser(env, chatId, name); rc.userId = user.id;
  }
  let o: any;
  try { o = await createOrder(env, rc, user, want); }
  catch (e: any) {
    await notifyOwner(env, 'support', `Khách [${chatId.slice(-6).toLowerCase()}] ${name || ''} muốn mua gói ${want} nhưng chưa tạo được đơn: ${e.message}. Trả lời: TL ${chatId.slice(-6).toLowerCase()} <lời nhắn>`);
    return send(env, chatId, (e.status === 503 ? 'Thanh toán trực tuyến đang tạm đóng' : 'Chưa tạo được đơn: ' + e.message) + '. Mình đã báo nhân viên, bạn chờ chút để được hỗ trợ nhé.', messageId);
  }
  const token = (env as any).ZALO_BOT_TOKEN;
  const text = fill(z.templates.payment, { ma: o.code, tenGoi: o.planName, soTien: vnd(o.amount), nganHang: BANKS[o.bank] || o.bank, stk: o.account, chuTk: o.accountName,
    kichHoat: o.auto ? 'Gói tự kích hoạt sau 1-2 phút khi nhận tiền, mình sẽ báo bạn ngay tại đây.' : 'Chuyển xong bạn nhắn "đã chuyển", nhân viên xác nhận và kích hoạt trong ít phút.' });
  // the QR first (one scan fills in bank, account, amount and memo), then the details to copy
  const qr = token ? await zaloApi(token, 'sendPhoto', { chat_id: chatId, photo: o.qr, caption: `Quét mã để thanh toán ${vnd(o.amount)} — ${o.planName}` }, 10_000) : { ok: false };
  rc.log('zalo.sale', { data: { chat: chatId, order: o.code, plan: o.plan, amount: o.amount, qr: qr.ok } });
  return send(env, chatId, richText(text + (qr.ok ? '' : `\nMã QR: ${o.qr}`)), messageId);
}
/** Tells a customer, on their Zalo, that their payment arrived (or other news about their account). */
export async function notifyCustomer(env: XEnv, userId: string, kind: 'paid', vars: Record<string, string>) {
  const z = env.config.zalo;
  if (!z.enabled || !(env as any).ZALO_BOT_TOKEN) return;
  const link = await env.DB.prepare('SELECT chat_id FROM zalo_links WHERE user_id = ?').bind(userId).first<any>();
  if (!link) return;
  if (kind === 'paid') {
    await saveLead(env, link.chat_id, { stage: 'customer' }).catch(() => {});
    if (z.stickers.thanks) await zaloApi((env as any).ZALO_BOT_TOKEN, 'sendSticker', { chat_id: link.chat_id, sticker: z.stickers.thanks }, 5000);
  }
  await send(env, link.chat_id, fill(z.templates[kind], { ...vars, han: vars.han ? ' đến ' + vars.han : '' })).catch(() => {});
}

// ---------------------------------------------------------------- answers without AI
// When the AI is off, out of quota or failing, the bot still answers like a person who knows the
// shop: it recognises what the message is about and replies from the real settings.
export function guessIntent(text: string) {
  const t = ' ' + fold(text).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const has = (...w: string[]) => w.some((x) => t.includes(' ' + x + ' '));
  if (has('da chuyen', 'da ck', 'chuyen roi', 'ck roi', 'da thanh toan', 'thanh toan roi')) return 'paid';
  if (has('dung nhan', 'khong can nua', 'dung lam phien', 'dung gui', 'khong nhan tin nua', 'huy theo doi')) return 'optout';
  // upset or rude: read with the accents (folded, "ngu" would also catch "ngủ" in a video topic)
  const low = ' ' + String(text).toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ') + ' ';
  if (/ (ngu|đần|dốt|ngáo|tệ quá|quá tệ|chán quá|lừa đảo|vô dụng|bực|thất vọng|chậm quá|ba láp|vớ vẩn|nhảm nhí|đm|dm|vl|vcl|cút) /.test(low) || / (không|ko|k) hiểu (gì|j) /.test(low)) return 'upset';
  if (has('video mau', 'xem mau', 'vi du', 'demo', 'xem thu', 'cho xem', 'trong the nao', 'nhu the nao')) return 'samples';
  if (has('mua', 'chot', 'dang ky', 'nang cap', 'lay goi', 'muon mua', 'thanh toan', 'chuyen khoan', 'ck')) return 'buy';
  if (has('hoan tien', 'hoan lai', 'refund', 'tra lai tien')) return 'refund';
  if (has('nhan vien', 'nguoi that', 'tu van vien', 'gap admin', 'ad oi', 'admin oi', 'goi dien', 'hotline')) return 'human';
  if (has('het luot', 'het roi', 'het het', 'gioi han', 'het han muc', 'qua dai', 'bi gioi han')) return 'limit';
  if (has('gia', 'bao nhieu', 'bang gia', 'goi', 'chi phi', 'phi', 'bao nhieu tien', 'vip', 'pro', 'khuyen mai', 'giam gia')) return 'price';
  if (has('bao lau', 'xong chua', 'tien do', 'video dau', 'toi dau', 'lau qua', 'chua xong', 'chua nhan')) return 'status';
  if (has('lam video', 'tao video', 'video ve', 'lam giup', 'kich ban', 'lam clip', 'dung video')) return 'make';
  if (has('ban la ai', 'ai vay', 'lam duoc gi', 'lam gi', 'la gi', 'bot', 'giup gi', 'ho tro gi', 'dich vu')) return 'who';
  if (/^ (chao|xin chao|alo|hi|hello|shop|ad|admin|ban oi|em oi|e oi|oi|co ai|hey)\b/.test(t) || t.trim().length <= 8) return 'greet';
  return 'other';
}
async function quickAnswer(env: XEnv, rc: Rc, x: AskCtx, why = '') {
  const c = env.config, z = c.zalo, t = z.templates, code = x.chatId.slice(-6).toLowerCase();
  const welcome = () => fill(t.welcome, { ten: x.name || 'bạn', troLy: z.assistant.name, thuongHieu: brandOf(c) });
  const intent = guessIntent(x.text);
  rc.log('zalo.quick', { data: { chat: x.chatId, intent, why: why || undefined } });
  const cur = x.user ? (await planOf(env, x.user.id)).plan.id : undefined;
  switch (intent) {
    case 'buy': {
      const want = wantedPlan(c, x.text);
      if (want) return closeSale(env, rc, x.chatId, x.name, x.user, want, x.messageId);
      return x.reply(forSale(c).length ? await quote(env, x, cur) : 'Hiện mọi người đang dùng miễn phí trong hạn mức mỗi ngày, chưa cần mua gói nhé.');
    }
    case 'price': return x.reply(forSale(c).length ? await quote(env, x, cur) : 'Hiện mọi người đang dùng miễn phí trong hạn mức mỗi ngày.');
    case 'samples': return sendSamples(env, rc, x.chatId, x.messageId);
    case 'upset': {
      // like a person would: own it, ask what went wrong, bring in a human
      await notifyOwner(env, 'support', `Khách đang không hài lòng [${code}] ${x.name || ''}: "${x.text.slice(0, 200)}"\nTrả lời khách: TL ${code} <lời nhắn>`);
      return x.reply(`Mình xin lỗi vì đã làm bạn khó chịu 🙏 Chắc mình trả lời chưa đúng ý bạn rồi. Bạn nói giúp mình đang cần gì hoặc chỗ nào chưa ổn nhé, mình cũng đã báo nhân viên vào hỗ trợ bạn ngay.`);
    }
    case 'optout': await feedSubscription(env,x.chatId,x.name,false); await saveLead(env, x.chatId, { optout: 1 }); return x.reply('Dạ mình ghi nhận rồi, sẽ không nhắn trước cho bạn nữa. Khi cần làm video bạn cứ nhắn mình nhé.');
    case 'limit': { const up = await upsellText(env, x.user); return x.reply('Mỗi gói có hạn mức video mỗi ngày và độ dài tối đa mỗi video; lượt dựng được làm mới mỗi ngày. ' + (up || 'Gõ GIA để xem các gói.')); }
    case 'status': return x.reply(await statusText(env, x.user));
    case 'make': return x.reply('Bạn muốn làm video về chủ đề gì ạ? Bạn chỉ cần nhắn chủ đề (vd: "5 thói quen buổi sáng") hoặc dán nguyên kịch bản của bạn, mình làm luôn và gửi link về đây.');
    case 'refund': await notifyOwner(env, 'support', `Khách hỏi hoàn tiền [${code}] ${x.name || ''}: "${x.text.slice(0, 200)}"\nTrả lời khách: TL ${code} <lời nhắn>`);
      return x.reply(`Chính sách hoàn tiền xem tại ${origin(env)}/hoan-tien. Mình đã báo nhân viên để hỗ trợ trường hợp của bạn, bạn chờ chút nhé.`);
    case 'paid': await notifyOwner(env, 'order', `Khách báo đã chuyển khoản [${code}] ${x.name || ''}: "${x.text.slice(0, 200)}"\nKiểm tra ở Quản trị → Đơn hàng. Trả lời: TL ${code} <lời nhắn>`);
      return x.reply('Cảm ơn bạn! Mình đã báo nhân viên kiểm tra giao dịch. Gói sẽ được kích hoạt ngay khi nhận tiền và mình báo bạn tại đây.');
    case 'human': await notifyOwner(env, 'support', `Khách cần gặp nhân viên [${code}] ${x.name || ''}: "${x.text.slice(0, 200)}"\nTrả lời khách: TL ${code} <lời nhắn>`);
      return x.reply('Mình đã báo nhân viên, bạn chờ chút sẽ có người trả lời ngay tại đây nhé.');
    case 'who': case 'greet':
      if (z.stickers.welcome) await zaloApi((env as any).ZALO_BOT_TOKEN, 'sendSticker', { chat_id: x.chatId, sticker: z.stickers.welcome }, 5000);
      return x.reply(await withMenu(env, x.chatId, welcome(), START_MENU));
    default:
      if (z.assistant.handoff) await notifyOwner(env, 'support', `Trợ lý chưa trả lời được [${code}] ${x.name || ''}: "${x.text.slice(0, 200)}"${why ? ' (' + why + ')' : ''}\nTrả lời khách: TL ${code} <lời nhắn>`);
      // not sure what they want: ask, with a few easy choices, instead of guessing
      return x.reply(await withMenu(env, x.chatId, `Mình chưa chắc đã hiểu đúng ý bạn${z.assistant.handoff ? ' (mình cũng đã báo nhân viên xem giúp)' : ''}. Bạn đang cần:`, [...START_MENU.slice(0, 3), { label: 'Hỏi video của mình tới đâu rồi', say: 'video của tôi tới đâu rồi' }]));
  }
}
async function statusText(env: XEnv, user: User | null) {
  if (!user) return 'Bạn chưa có video nào. Gửi TAO + chủ đề để làm video đầu tiên nhé.';
  const jobs = (await env.DB.prepare("SELECT j.id, j.status, j.progress, j.error, p.title FROM jobs j JOIN projects p ON p.id = j.project_id WHERE j.user_id = ? ORDER BY j.created_at DESC LIMIT 3").bind(user.id).all<any>()).results;
  if (!jobs.length) {
    const drafts=(await env.DB.prepare("SELECT DISTINCT p.id,p.title,p.updated_at FROM projects p JOIN zalo_messages m ON m.project_id=p.id WHERE p.user_id=? AND NOT EXISTS(SELECT 1 FROM jobs j WHERE j.project_id=p.id) ORDER BY p.updated_at DESC LIMIT 3").bind(user.id).all<any>()).results;
    if(drafts.length)return 'Chưa có tác vụ dựng MP4. Các bản nháp đã chuẩn bị qua Zalo:\n'+drafts.map(p=>`• ${p.title}: chưa dựng\n${origin(env)}/p/${p.id}`).join('\n')+'\nMở dự án trên web để dựng video.';
    return 'Chưa có tác vụ dựng video nào trong hệ thống. Yêu cầu thiết kế có thể đang chờ AI xử lý hoặc đã lỗi; chưa thể khẳng định đang dựng MP4.';
  }
  const names: Record<string, string> = { queued: 'đang chờ dựng', running: 'đang dựng', done: 'đã xong', failed: 'bị lỗi' };
  const lines = await Promise.all(jobs.map(async (j) => `• ${j.title}: ${names[j.status] || j.status}${j.status === 'running' ? ` ${j.progress}%` : ''}${j.status === 'done' ? '\n  ' + (await shareLink(env, origin(env), j.id)) : ''}${j.status==='failed'&&j.error?' ('+j.error+')':''}`));
  return lines.join('\n');
}

// ---------------------------------------------------------------- video formats in Zalo
const CLASSIC: Record<string, [string, string, string]> = {
  auto: ['Tự động đa dạng', 'mỗi video một cách vẽ hợp với nội dung', ''],
  'classic-sketch': ['Whiteboard', 'AI thiết kế cảnh theo nội dung', 'sketch'],
  'classic-diagram': ['Biểu đồ vẽ tay', 'biểu đồ, số liệu được tay vẽ từng nét', 'diagram'],
  classic: ['Tranh doodle', 'mỗi câu một bức tranh vẽ tay lớn', 'doodle'],
};
export const wayName = (c: Config, k: string) => (k === 'web' ? 'Mặc định của web' : CLASSIC[k]?.[0] || c.labels.looks[k] || k);
const wayNote = (c: Config, k: string) => CLASSIC[k]?.[1] || c.labels.lookNotes[k] || '';
/** A way still switched on for the site (an admin may have hidden a format or a kind of picture). */
const wayOn = (c: Config, k: string) => ['auto','classic-sketch','kinetic'].includes(k) && (k === 'auto' ? true : CLASSIC[k] ? vis(c, 'visual:' + CLASSIC[k][2]) === 'on' : vis(c, 'look:' + k) === 'on');
/** The formats people may pick in Zalo, in the admin's order. */
export function zaloWays(c: Config) { return c.zalo.formats.allowed.filter((k) => ZALO_WAYS.includes(k as any) && wayOn(c, k)); }
/** What createProject needs for a way: a format, "auto", or the classic board with its kind of picture. */
function wayOptions(k: string): { look?: string; visual?: string } {
  if (k === 'auto') return { look: 'auto' };
  if (CLASSIC[k]) return { look: 'classic-sketch', visual: 'sketch' };
  return k === 'kinetic' ? { look: k } : { look: 'classic-sketch', visual: 'sketch' };
}
/** The way for this person's next video: their own pick if still allowed, otherwise the admin's default. */
function wayFor(c: Config, prefs: any) {
  const ways = zaloWays(c), d = c.zalo.formats.default;
  if (prefs?.look && ways.includes(prefs.look) && ways.length > 1) return prefs.look;
  return d === 'web' || wayOn(c, d) ? d : 'web';
}

const money = (n: number) => n.toLocaleString('vi-VN') + 'đ';

/** What the assistant may say about the site: only real facts from the settings. */
function siteFacts(env: XEnv) {
  const c = env.config, brand = `${c.brand.name} ${c.brand.accent}`.trim();
  const plans = c.plans.filter((p) => p.visible).map((p) => `- ${p.name}: ${p.price ? money(p.price) + (p.days === 30 ? '/tháng' : ` cho ${p.days} ngày`) : 'miễn phí'}${p.yearPrice ? `, hoặc ${money(p.yearPrice)}/năm` : ''}; ${p.limits.render} video/ngày, mỗi video tối đa ${String(Math.round(Math.min(p.maxSeconds, c.limits.maxSeconds) / 6) / 10).replace('.', ',')} phút${p.limits.script ? `, ${p.limits.script} lượt AI viết kịch bản/ngày` : ''}${p.features.length ? '; ' + p.features.join(', ') : ''}`).join('\n');
  const looks = LOOK_KEYS.filter((k) => vis(c, 'look:' + k) === 'on').map((k) => `${c.labels.looks[k]} (${c.labels.lookNotes[k]})`).join('; ');
  const web = origin(env);
  return [`Tên dịch vụ: ${brand}. ${c.brand.tagline}`, `Trang web: ${web}. Bảng giá: ${web}/goi. Điều khoản: ${web}/dieu-khoan. Hoàn tiền: ${web}/hoan-tien.`,
    `Các gói:\n${plans}`, c.payment.enabled ? 'Thanh toán: chuyển khoản qua mã VietQR, ngay trong Zalo (hệ thống gửi mã khi khách đồng ý mua) hoặc trên web mục Bảng giá; gói tự kích hoạt sau 1-2 phút khi tiền về. Không nhận thẻ.' : 'Hiện chưa mở thanh toán trực tuyến.',
    `Định dạng video: ${looks}.`, `Định dạng khi tạo qua Zalo: ${zaloWays(c).length > 1 ? zaloWays(c).map((k) => wayName(c, k)).join(', ') + ' (gõ DINHDANG để chọn)' : wayName(c, c.zalo.formats.default)}; mặc định ${wayName(c, c.zalo.formats.default)}.`, 'Video MP4 1080p, khung dọc 9:16 hoặc ngang 16:9, giọng đọc tiếng Việt, phụ đề. Xem trước ngay trên web, dựng xong trong vài phút, link xem/tải gửi về Zalo.',
    `Mã gói để chốt đơn: ${forSale(c).map((p) => `${p.id} = ${p.name}`).join('; ') || 'không có gói trả phí'}. Khách đồng ý mua là nhận ngay mã QR chuyển khoản trong Zalo, không cần lên web.`,
    'Trong Zalo khách chỉ cần nói tự nhiên: nhắn chủ đề để làm video, dán kịch bản để dựng đúng lời, hỏi giá, hỏi video tới đâu. (Lệnh tắt như TAO, KB, GIA, TT vẫn dùng được nhưng không cần nhắc.)', c.legal.email && !/example\.(com|org)$/i.test(c.legal.email) ? `Email hỗ trợ: ${c.legal.email}` : ''].filter(Boolean).join('\n');
}

/** The customer, as far as this chat knows them. */
async function customerFacts(env: XEnv, x: AskCtx) {
  if (!x.user) return `Khách ${x.name || ''} chưa có tài khoản (chưa tạo video nào, chưa kết nối web).`;
  const { plan, expires } = await planOf(env, x.user.id);
  const used = await env.DB.prepare("SELECT n FROM usage WHERE user_id = ? AND day = ? AND kind = 'render'").bind(x.user.id, new Date().toISOString().slice(0, 10)).first<any>();
  const jobs = (await env.DB.prepare('SELECT j.status, j.progress, j.error, j.created_at, p.title FROM jobs j JOIN projects p ON p.id = j.project_id WHERE j.user_id = ? ORDER BY j.created_at DESC LIMIT 3').bind(x.user.id).all<any>()).results;
  const names: Record<string, string> = { queued: 'đang chờ dựng', running: 'đang dựng', done: 'đã xong (gõ TT để nhận link)', failed: 'lỗi' };
  return [`Khách: ${x.name || x.user.name || ''}${x.user.email.startsWith('zalo:') ? ' (chỉ dùng Zalo)' : ` (tài khoản web ${x.user.email})`}.`,
    `Gói hiện tại: ${plan.name}${expires ? ' đến ' + new Date(expires).toLocaleDateString('vi-VN') : ''}; hôm nay đã dựng ${used?.n || 0}/${plan.limits.render} video.`,
    jobs.length ? 'Video gần đây: ' + jobs.map((j) => `"${j.title}" ${names[j.status] || j.status}${j.status === 'running' ? ' ' + j.progress + '%' : ''}${j.status === 'failed' && j.error ? ' (' + String(j.error).slice(0, 80) + ')' : ''}`).join('; ') : 'Chưa có video nào.'].join('\n');
}

/** The last few turns of this chat (what the customer said, what we answered), oldest first. */
async function chatHistory(env: XEnv, chatId: string, exceptId: string): Promise<AssistantTurn[]> {
  const since = Date.now() - 24 * 3600_000;
  const ins = (await env.DB.prepare('SELECT id, text, received_at AS ts FROM zalo_messages WHERE chat_id = ? AND id != ? AND is_text = 1 AND received_at > ? ORDER BY received_at DESC LIMIT 8').bind(chatId, exceptId, since).all<any>()).results;
  const outs = (await env.DB.prepare("SELECT text, created_at AS ts FROM zalo_outbox WHERE chat_id = ? AND created_at > ? AND status = 'sent' ORDER BY created_at DESC LIMIT 8").bind(chatId, since).all<any>()).results;
  return [...ins.map((r) => ({ role: 'user' as const, text: String(r.text || ''), ts: r.ts })), ...outs.map((r) => ({ role: 'bot' as const, text: String(r.text || ''), ts: r.ts }))]
    .sort((a, b) => a.ts - b.ts).slice(-10).map(({ role, text }) => ({ role, text }));
}

/**
 * A free question answered like a member of staff: real facts about the site and the customer,
 * the recent conversation, the owner's own notes. It can start a video, report status, or hand
 * the chat to the owner (who answers with TL <mã> <lời>).
 */
async function assistantReply(env: XEnv, rc: Rc, x: AskCtx) {
  const z = env.config.zalo, a = z.assistant, c = env.config, code = x.chatId.slice(-6).toLowerCase();
  const owner = (await ownerChats(env)).chats.includes(x.chatId);
  try { if (!owner && x.firstTry !== false) await useQuota(env, 'z:' + x.chatId, 'chat', a.perDay); }
  catch { rc.log('zalo.limit', { ok: false, data: { chat: x.chatId, kind: 'ai', limit: a.perDay } }); return quickAnswer(env, rc, x, `khách đã dùng hết ${a.perDay} câu AI hôm nay (Quản trị → Zalo → Số câu AI trả lời)`); }
  if ((await budgetState(env)).over) return quickAnswer(env, rc, x, 'hết ngân sách AI');
  const ways = zaloWays(c);
  if (x.patient) await typing(env, x.chatId); // still preparing: keep "đang nhập…" on screen
  const sys = [
    `Bạn là ${a.name}, nhân viên tư vấn bán hàng và chăm sóc khách hàng của dịch vụ dưới đây, đang nhắn tin với khách qua Zalo.`,
    a.persona ? 'PHONG CÁCH: ' + a.persona : '',
    'SỰ THẬT VỀ DỊCH VỤ (chỉ nói những điều có ở đây, không bịa giá, khuyến mãi hay tính năng):\n' + siteFacts(env),
    a.knowledge ? 'GHI CHÚ CỦA CHỦ WEB (ưu tiên khi trả lời):\n' + a.knowledge : '',
    'THÔNG TIN KHÁCH:\n' + await customerFacts(env, x),
    'TRẠNG THÁI THỰC: chế độ dựng '+c.rendering.mode+'. '+(c.rendering.mode==='browser'?'Chỉ xuất MP4 khi người dùng mở web, bấm dựng và giữ tab mở. Zalo chỉ chuẩn bị bản nháp.':'Tác vụ phải được ghi vào hàng chờ trước khi máy dựng nhận.')+' Không tự khẳng định đã tạo, đang dựng hoặc đã hoàn tất video từ lời nói; chỉ hệ thống xác nhận sau khi ghi dữ liệu. Không hứa tự gửi MP4 khi đang dùng trình duyệt.',
    `ĐIỀU BẠN ĐÃ BIẾT VỀ KHÁCH (giai đoạn: ${x.lead.stage}): ${JSON.stringify({ ...x.lead.profile, prefs: undefined })}`,
    'CÁCH NÓI CHUYỆN: như một người thật đang nhắn Zalo: tự nhiên, ấm áp, ngắn (2-4 câu, dưới 600 ký tự), mỗi lần chỉ hỏi MỘT câu. Có thể in đậm 1-2 cụm quan trọng bằng **…** (giá, tên gói); không dùng markdown khác. Có thể dùng 1 emoji. ' +
      'KHÔNG bắt khách gõ lệnh (không nói "gõ TAO…", "gõ MUA…"): khách cứ nói bình thường là bạn hiểu và làm. Không hỏi lại điều đã biết ở trên.',
    'SÁT Ý KHÁCH (quan trọng nhất): câu đầu tiên trả lời THẲNG điều khách vừa hỏi, bằng thông tin cụ thể (giá, số video, thời lượng, cách làm) lấy từ SỰ THẬT ở trên. Nhắc lại đúng chi tiết khách nói (chủ đề, sản phẩm, kênh, số lượng) để khách thấy được lắng nghe. ' +
      'Khách hỏi nhiều ý thì trả lời đủ từng ý. CẤM câu chung chung kiểu "bên mình có nhiều gói phù hợp", "bạn cần gì cứ nhắn", "mình hỗ trợ nhiều loại video" mà không nói cụ thể. ' +
      'Khách hỏi bạn là người hay máy: nói thật bạn là trợ lý AI của dịch vụ, có nhân viên thật hỗ trợ khi cần. ' +
      'Khách bực bội, chê bai hay nói nặng lời: không cãi, không đưa menu; nhận lỗi ngắn gọn, đoán điều khiến khách bực từ hội thoại (trả lời sai, chậm, video lỗi…) và hỏi lại đúng chỗ đó; nếu khách vẫn bực thì intent "human".',
    'VÍ DỤ. Khách: "làm video bán mỹ phẩm được ko". TỐT: "Được bạn nhé! Với mỹ phẩm mình hay làm video 30-45 giây theo mạch **nỗi lo về da → giải pháp → sản phẩm**, có ảnh sản phẩm thật và mã QR mua hàng ở cuối. Bạn đang bán dòng sản phẩm nào, mình làm thử một video miễn phí cho bạn xem luôn?" ' +
      'XẤU: "Dạ được ạ, bên mình hỗ trợ làm nhiều loại video, bạn cần gì cứ nhắn mình nhé." Khách: "1 tháng làm được bao nhiêu video". TỐT: nêu đúng số video/ngày của từng gói theo SỰ THẬT và gợi ý gói hợp với nhu cầu khách đã nói.',
    'BÁN HÀNG KIỂU TƯ VẤN: (1) hiểu khách làm video để làm gì (kênh nào, lĩnh vực, bao nhiêu video/tuần); (2) gợi ý cách làm phù hợp, đề nghị LÀM THỬ MIỄN PHÍ ngay hoặc XEM MẪU; ' +
      '(3) khi khách quan tâm giá, hết lượt hoặc cần video dài/nhiều: tư vấn đúng một gói hợp nhu cầu, nêu lợi ích cụ thể theo nhu cầu của họ; (4) khách đồng ý thì chốt. ' +
      'Xử lý băn khoăn (đắt, chưa tin chất lượng, chưa cần) bằng lợi ích thật và mời làm thử. Không ép, không hứa điều không có. Không xin mật khẩu, số thẻ, OTP.',
    'KHI CHƯA RÕ khách muốn gì: intent "clarify", hỏi lại một câu ngắn; nếu hợp thì đưa 2-4 lựa chọn ngắn trong "options" (hệ thống tự đánh số, khách trả lời bằng số; đừng tự đánh số trong reply).',
    'Trả DUY NHẤT JSON, trường "hieu" viết TRƯỚC: {"hieu":"khách đang muốn gì, 1 câu","reply":"lời nhắn","intent":"chat|clarify|make_video|samples|settings|status|buy|human|optout","topic":"","plan":"","options":[],"ratio":"","voice":"","look":"","profile":{},"stage":""}',
    `Ý nghĩa: make_video = khách nhờ làm video và ĐÃ RÕ chủ đề${a.makeVideos ? ' (hệ thống sẽ kiểm tra và ghi nhận yêu cầu; không tự nhận đang dựng)' : ' (hiện chưa tự làm: mời khách nhắn kịch bản)'}, "topic" = chủ đề đầy đủ bằng lời của khách; ` +
      'samples = khách muốn xem video mẫu / xem trông thế nào (hệ thống gửi ảnh và link video mẫu sau reply); settings = khách muốn đổi khung, giọng hoặc định dạng cho video sau; status = hỏi video của họ tới đâu; ' +
      `buy = khách đồng ý mua / muốn thanh toán, "plan" = mã gói (thêm ":year" nếu trả theo năm), hệ thống gửi mã QR ngay sau reply; human = khiếu nại, lỗi thanh toán, hoàn tiền, đòi gặp người thật, hoặc bạn không chắc${a.handoff ? ' (nói đã báo nhân viên)' : ''}; optout = khách không muốn được nhắn nữa.`,
    'Nếu khách nói rõ: "ratio" = "9:16" (dọc: TikTok, Reels, Shorts) hoặc "16:9" (ngang: YouTube); "voice" = "nam" hoặc "nu"; ' + (ways.length > 1 ? `"look" = một mã định dạng trong: ${ways.map((k) => `${k} (${wayName(c, k)})`).join(', ')}. ` : '') + 'Không rõ thì để trống.',
    '"profile": điều mới biết về khách, mỗi giá trị ≤ 10 chữ, khoá trong: ten, linhVuc, kenh, mucDich, soLuong, nganSach, banKhoan, goi. "stage": new|interested|trying|quoted|customer|lost.',
  ].filter(Boolean).join('\n\n');
  let ans;
  // the AI the admin chose: the assistant's own choice, otherwise the site's (AI viết kịch bản)
  const provider = (a.ai !== 'auto' ? a.ai : c.defaults.textAI) as TextProvider;
  // a webhook call may only work about 30 seconds: 22 of them for the AI; the minute job allows 45
  try { ans = await assistantAnswer(env, sys, await chatHistory(env, x.chatId, x.messageId), x.text, provider, x.patient ? 45_000 : 22_000); }
  catch (e: any) {
    const why = String(e.message || e).slice(0, 200);
    rc.log('zalo.assistant', { ok: false, data: { chat: x.chatId, error: why, patient: !!x.patient } });
    // slow or briefly overloaded: the minute job asks again with more time (a real answer within a minute)
    if (!x.patient && !/quota|429|401|403|key|khoá/i.test(why)) throw new Defer(why);
    // no AI at all (quota, wrong key, outage): still answer from the words, never silence
    return quickAnswer(env, rc, x, /quota|429/.test(why) ? 'AI hết hạn mức' : /chậm|timeout|abort/i.test(why) ? 'AI quá chậm' : 'AI lỗi: ' + why.slice(0, 80));
  }
  rc.log('ai.chat', { cost: aiCost(c, { model: ans.usage.model, tokensIn: ans.usage.tokensIn, tokensOut: ans.usage.tokensOut }), data: { chat: x.chatId, intent: ans.intent, ...ans.usage } });
  const ex = ans.extra || {};
  // remember what was learned, and the choices made in conversation
  const profile = { ...x.lead.profile };
  if (ex.profile && typeof ex.profile === 'object') for (const [k, v] of Object.entries(ex.profile).slice(0, 12)) if (/^[a-zA-Z]{2,20}$/.test(k) && typeof v === 'string' && v.trim()) profile[k] = v.trim().slice(0, 80);
  const prefs = { ...(profile.prefs || {}) };
  if (ex.ratio === '9:16' || ex.ratio === '16:9') prefs.ratio = ex.ratio;
  if (ex.voice === 'nam' || ex.voice === 'nu') {
    const want = ex.voice === 'nam' ? /\bnam\b/i : /\bnữ\b/i, v = c.voices.filter((v) => vis(c, 'voice:' + v.code) === 'on').find((v) => want.test(v.label));
    if (v) prefs.voice = v.code;
  }
  if (typeof ex.look === 'string' && ways.includes(ex.look)) prefs.look = ex.look;
  profile.prefs = prefs;
  if (x.link && JSON.stringify(prefs) !== JSON.stringify(x.prefs)) await env.DB.prepare('UPDATE zalo_links SET prefs = ? WHERE chat_id = ?').bind(JSON.stringify({ ...x.prefs, ...prefs }), x.chatId).run();
  const options: MenuItem[] = Array.isArray(ex.options) ? ex.options.filter((o: unknown) => typeof o === 'string' && o.trim()).slice(0, 4).map((o: string) => ({ label: o.trim().slice(0, 80), say: o.trim().slice(0, 200) })) : [];
  await saveLead(env, x.chatId, { profile, stage: STAGES.includes(ex.stage) ? ex.stage : x.lead.stage, menu: options.length ? options : null, ...(ans.intent === 'optout' ? { optout: 1 } : {}) });
  // Only persisted actions may be acknowledged; model prose is never job-state evidence.
  if(ans.intent==='status')return x.reply(await statusText(env,x.user));
  if(ans.intent==='make_video'){
    if(!a.makeVideos||!c.enabledSources.includes('topic'))return x.reply('Tự tạo video qua hội thoại hiện đang tắt. Bạn có thể tạo dự án trên web: '+origin(env)+'/tao');
    if(ans.topic.length<5)return x.reply('Bạn muốn video về chủ đề gì? Hãy gửi nội dung hoặc kịch bản cụ thể.');
    const now=Date.now();
    await env.DB.prepare("INSERT OR IGNORE INTO zalo_messages (id, chat_id, sender_name, text, is_text, status, received_at, updated_at) VALUES (?, ?, ?, ?, 1, 'received', ?, ?)")
      .bind(x.messageId+'-tao',x.chatId,x.name,'TAO '+ans.topic,now,now).run();
    await saveLead(env,x.chatId,{stage:x.lead.stage==='new'||x.lead.stage==='interested'?'trying':x.lead.stage});
    rc.log('zalo.assistant.video',{data:{chat:x.chatId,topic:ans.topic.slice(0,120)}});
    const manual=c.rendering.mode==='browser'||!c.zalo.autoRender;
    return x.reply(manual?'Đã ghi nhận yêu cầu vào hàng chờ thiết kế. Hiện chưa dựng MP4: hệ thống đang dùng chế độ mở web để dựng. Khi bản nháp sẵn sàng, mình sẽ gửi liên kết để bạn mở và xuất video.':'Đã ghi nhận yêu cầu vào hàng chờ thiết kế. Chưa có tác vụ dựng MP4; mình sẽ báo khi thiết kế xong và tác vụ dựng được tạo.');
  }
  const text = ans.reply.trim();
  const full = options.length ? text + '\n' + options.map((o, i) => `${i + 1}. ${o.label}`).join('\n') : text;
  await x.reply(/\*\*[^*]+\*\*/.test(full) ? richText(full) : full);

  if (ans.intent === 'human' && a.handoff) await notifyOwner(env, 'support', `Khách cần hỗ trợ [${code}] ${x.name || ''}: "${x.text.slice(0, 300)}"\nTrợ lý đã trả lời: "${ans.reply.slice(0, 200)}"\nTrả lời khách: TL ${code} <lời nhắn>`);
  if (ans.intent === 'samples') return sendSamples(env, rc, x.chatId);
  if (ans.intent === 'buy') {
    const want = wantedPlan(c, ans.plan || x.text);
    if (want) return closeSale(env, rc, x.chatId, x.name, x.user, want, x.messageId);
    if (forSale(c).length) return x.reply(await quote(env, x));
  }

}

async function makeVideo(env: XEnv, rc: Rc, user: User, chatId: string, source: string, text: string, prefs: any, guest: boolean, messageId: string) {
  const t = env.config.zalo.templates;
  try {
    if (await env.DB.prepare('SELECT 1 FROM blocked_users WHERE user_id = ?').bind(user.id).first()) return send(env, chatId, 'Tài khoản đang bị khóa. Vui lòng liên hệ chủ web.', messageId);
    const checkpoint = await env.DB.prepare('SELECT project_id, job_id FROM zalo_messages WHERE id = ?').bind(messageId).first<any>();
    if (checkpoint?.job_id) return send(env, chatId, 'Video này đã vào hàng chờ. Gõ TT để xem tiến độ.', messageId);
    // one "received" per message, even when it is retried or was already acknowledged by the webhook
    if (!(await env.DB.prepare('SELECT 1 FROM zalo_outbox WHERE message_id = ? LIMIT 1').bind(messageId).first())) await send(env, chatId, 'Đã nhận, mình đang chuẩn bị kịch bản và hình…', messageId);
    const existing = checkpoint?.project_id ? await env.DB.prepare('SELECT id, spec FROM projects WHERE id = ? AND user_id = ?').bind(checkpoint.project_id, user.id).first<any>() : null;
    const p = existing ? { id: existing.id, spec: JSON.parse(existing.spec), note: '' } : await createProject(env, rc, user, { source, topic: text, ratio: prefs.ratio, style: prefs.style || 'auto', voiceId: prefs.voice, channel: '', visual: 'sketch', ...wayOptions(wayFor(env.config, prefs)) });
    await env.DB.prepare('UPDATE zalo_messages SET project_id = ? WHERE id = ?').bind(p.id, messageId).run();
    if (env.config.rendering.mode === 'browser' || !env.config.zalo.autoRender) return send(env, chatId, `Bản nháp "${p.spec.title}" đã sẵn sàng (${p.spec.scenes.length} cảnh), chưa xuất MP4. Bạn cần mở web, bấm dựng video và giữ tab mở đến khi hoàn tất: ${origin(env)}/p/${p.id}`, messageId);
    const queued = await env.DB.prepare("SELECT id FROM jobs WHERE project_id = ? AND user_id = ? AND status IN ('queued','running','done') ORDER BY created_at DESC LIMIT 1").bind(p.id, user.id).first<any>();
    const job = queued || await queueRender(env, rc, user, p.id, p.spec);
    await env.DB.prepare('UPDATE zalo_messages SET job_id = ? WHERE id = ?').bind(job.id, messageId).run();
    await send(env,chatId,`Video "${p.spec.title}" đã có tác vụ trong hàng chờ dựng. Mã tác vụ: ${job.id}. Gõ TT để xem trạng thái thực tế; khi máy dựng hoàn tất, mình sẽ gửi liên kết.`+(guest?'':`\nMở dự án: ${origin(env)}/p/${p.id}`)+(p.note?'\n'+p.note:''),messageId);
  } catch (e: any) {
    rc.log('zalo.create', { ok: false, data: { error: e.message } });
    await env.DB.prepare('UPDATE zalo_messages SET error = ? WHERE id = ?').bind(String(e.message || 'Lỗi tạo video').slice(0, 300), messageId).run();
    // AI outages are told plainly, without model names or HTTP codes
    const busy = !(e instanceof HttpError) || e.status >= 500;
    // a limit of the plan (videos a day, length): offer the plan that lifts it
    const up = !busy && (e.status === 429 || e.status === 402) ? await upsellText(env, user).catch(() => '') : '';
    await send(env, chatId, 'Chưa tạo được video: ' + (busy ? 'AI chưa thiết kế được video. Vui lòng kiểm tra kết nối AI hoặc thử lại sau; hệ thống không dựng theo mẫu thay thế.' : e.message) + (up ? '\n' + up : ''), messageId);
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
    await send(env, chatId, `Chào ${name || 'bạn'}! Mình là trợ lý AI tự động của ${brandOf(env.config)} (có nhân viên thật hỗ trợ khi cần). Khi tiếp tục trò chuyện, bạn đồng ý Điều khoản (${origin(env)}/dieu-khoan) và Chính sách bảo mật (${origin(env)}/bao-mat). Gõ HUYKETNOI bất cứ lúc nào để ngừng.`);
    await notifyOwner(env, 'signup', `Người dùng mới qua Zalo: ${name || chatId}`);
  }
  return { id, email: `zalo:${chatId}`, name, picture: null };
}

/**
 * Register this site as the bot's webhook (setWebhook with url + secret_token, as the Zalo Bot doc
 * describes; the secret travels in the X-Bot-Api-Secret-Token header only) and check it took.
 * Done by the "Kết nối webhook" button and automatically whenever the admin saves the webhook mode.
 */
export async function connectWebhook(env: XEnv, rc: Rc, siteOrigin: string) {
  const token = (env as any).ZALO_BOT_TOKEN;
  if (!token) throw new HttpError(400, 'Nhập Zalo Bot token ở mục Khoá API trước.');
  if (!env.config.zalo.enabled) throw new HttpError(400, 'Bật tính năng Zalo và lưu cài đặt trước khi kết nối webhook.');
  if (!siteOrigin.startsWith('https://')) throw new HttpError(400, 'Zalo chỉ gọi địa chỉ HTTPS. Mở trang quản trị bằng tên miền thật rồi kết nối.');
  const before = await zaloApi(token, 'getWebhookInfo');
  const secret = await webhookSecret(env), hook = `${siteOrigin}/api/zalo/webhook`;
  const r = await zaloApi(token, 'setWebhook', { url: hook, secret_token: secret });
  const info = await zaloApi(token, 'getWebhookInfo');
  const saved = String(info.result?.url || '');
  rc.log('admin.zalo.connect', { ok: r.ok, data: { error: r.error, before: hookPath(before.result?.url), url: hookPath(saved) } });
  if (!r.ok) throw new HttpError(502, 'Zalo từ chối đăng ký webhook: ' + r.error);
  if (info.ok && saved && hookPath(saved) !== hook) throw new HttpError(502, 'Zalo báo đã nhận nhưng webhook vẫn trỏ về: ' + hookPath(saved));
  await recvState(env, { ...((await zaloRecvStatus(env)) || {}), mode: 'webhook', connected: Date.now(), hook, lost: false });
  return { ok: true, url: hook, before: hookPath(before.result?.url) || null, info: info.result ? { ...info.result, url: hookPath(saved) } : null };
}

/** Webhook address without the secret query, safe to show and compare. */
const hookPath = (u: unknown) => String(u || '').split('?')[0];

let originCache = '';
/** Public address of the site (from the last request). */
export function origin(env: XEnv) { return (env as any).PUBLIC_URL || originCache; }
export function rememberOrigin(o: string) { if (o.startsWith('https://')) originCache = o; }

async function saveOwnerChat(env: XEnv, chatId: string) {
  await addOwner(env,chatId);
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
  if (ok && (await env.BUCKET.head(`thumb/${job.user_id}/${job.id}.jpg`))) {
    const web = await siteUrl(env), share = await shareLink(env, web, job.id);
    const photo = share.replace(`/api/share/${job.id}?`, `/api/share/${job.id}/thumb.jpg?`);
    const p = await zaloApi((env as any).ZALO_BOT_TOKEN, 'sendPhoto', { chat_id: link.chat_id, photo, caption: text.slice(0, 1900) }, 10_000);
    rc.log('zalo.notify', { ok: p.ok, projectId: job.project_id, data: { job: job.id, done: true, photo: true, error: p.ok ? undefined : p.error } });
    if (p.ok) return;
  }
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
    const r = await connectWebhook(env, rc, url.origin);
    return json(r);
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
        { k: 'Token hợp lệ', ok: !!me?.ok, detail: me?.ok ? [me.result?.display_name, me.result?.account_name, me.result?.id && 'id ' + me.result.id].filter(Boolean).join(' · ') : me?.error || 'chưa nhập token', fix: 'Lấy token trong Zalo Bot Creator và dán vào Khoá API.' },
        // the link people open must be the bot this token answers for, or their messages go to another bot
        ...(me?.ok && me.result?.id && /zalo\.me\/\d+/.test(env.config.zalo.botLink) ? [{ k: 'Đường dẫn bot đúng bot của token', ok: env.config.zalo.botLink.includes(String(me.result.id)), detail: `token: ${me.result.id} · đường dẫn: ${env.config.zalo.botLink}`, fix: 'Người dùng đang nhắn một bot khác với bot của token. Dán đúng token của bot ở đường dẫn, hoặc sửa đường dẫn bot.' }] : []),
        { k: 'Webhook trỏ về web này (bỏ qua nếu dùng hỏi định kỳ)', ok: hookPath(info?.result?.url) === expected || (await receiveMode(env)) === 'poll', detail: hookPath(info?.result?.url) || '(chưa có)', fix: 'Bấm "Kết nối webhook". Bot chỉ có một webhook: nếu đang trỏ về web khác (ví dụ Apps Script cũ) thì web này không nhận được tin. Bấm nút này để chuyển bot về đây.' },
        { k: 'Zalo đã gọi tới web này (bỏ qua nếu dùng hỏi định kỳ)', ok: (!!lastCall && lastCall.ok !== 0) || (await receiveMode(env)) === 'poll', detail: lastCall ? `${new Date(lastCall.ts).toLocaleString('vi-VN')} · ${lastCall.ok ? 'hợp lệ' : (JSON.parse(lastCall.data || '{}').error || 'bị từ chối')}` : 'Chưa có lần gọi nào.', fix: lastCall ? 'Sửa theo lỗi ở trên rồi nhắn lại GIUP.' : 'Zalo chưa gọi tới. Kiểm tra: (1) webhook đúng địa chỉ; (2) trong Zalo Bot Creator đã bật nhận sự kiện tin nhắn (message.text.received); (3) Cloudflare không chặn (tắt Bot Fight Mode / Under Attack cho /api/zalo/webhook); (4) bạn đang nhắn đúng bot có token này.' },
        { k: 'Web đã ghi nhận tin nhắn', ok: !!inbox, detail: inbox ? `Tin gần nhất: ${inbox.status}${inbox.error ? ' — ' + inbox.error : ''}` : 'Chưa có tin nhắn được ghi nhận.', fix: 'Nhắn GIUP cho bot rồi bấm Kiểm tra lại. Nếu không nhận, kiểm tra webhook và token.' },
        { k: 'Phản hồi gần nhất gửi thành công', ok: reply?.status === 'sent', detail: reply ? `${reply.status}${reply.error ? ' — ' + reply.error : ''}` : 'Chưa gửi phản hồi.', fix: 'Xem Hộp thư Zalo để thử gửi lại phản hồi lỗi.' },
        { k: 'Có Zalo nhận thông báo của chủ web (đơn hàng, người dùng mới, khách cần hỗ trợ)', ok: (await ownerChats(env)).chats.length > 0, detail: `${(await ownerChats(env)).chats.length} Zalo nhận tin`, fix: 'Quản trị → Zalo → Chủ web: thêm người nhận hoặc tạo mã CHUWEB. Liên kết tài khoản quản trị không tự đăng ký thông báo.' },
        await (async () => { const n = await env.DB.prepare("SELECT ts, ok, data FROM events WHERE type = 'owner.notify' ORDER BY id DESC LIMIT 1").first<any>(); const d = n ? JSON.parse(n.data || '{}') : {};
          return { k: 'Thông báo gần nhất tới chủ web', ok: !!n?.ok, detail: n ? `${new Date(n.ts).toLocaleString('vi-VN')} · Zalo ${d.zalo || 0}, thiết bị ${d.push || 0}${d.error ? ' · ' + d.error : ''} · ${d.text || ''}` : 'Chưa có.', fix: 'Bấm "Gửi tin thử cho chủ web" sau khi có Zalo nhận tin.' }; })(),
        { k: 'Liên kết bot cho người dùng', ok: !!env.config.zalo.botLink, fix: 'Dán đường dẫn bot (https://zalo.me/...) ở mục Zalo.' },
      ],
      last: last.results, links, recv: { mode: await receiveMode(env), status: await zaloRecvStatus(env) },
      bot: me?.ok ? { id: me.result?.id, name: me.result?.account_name, display: me.result?.display_name } : null,
      webhook: info?.result ? { ...info.result, url: hookPath(info.result.url) } : info?.error || null,
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
    const testOwner=(await ownerChats(env)).chats[0];
    if (!testOwner) throw new HttpError(400, 'Chưa có Zalo chủ web đang hoạt động. Thêm trong Quản trị → Zalo → Chủ web.');
    const text = String((await body<any>(req, 2000)).text || 'GIUP').slice(0, 1000);
    const id = 'sim-' + randomId(8), now = Date.now(), t0 = Date.now();
    await env.DB.prepare("INSERT INTO zalo_messages (id, chat_id, sender_name, text, is_text, status, received_at, updated_at) VALUES (?, ?, 'Mô phỏng', ?, 1, 'received', ?, ?)")
      .bind(id, testOwner, text, now, now).run();
    // watch which way the answer came: the AI, or the prepared answers (and why)
    const seen: { type: string; data?: any }[] = [];
    const watch: Rc = { ...rc, log(type, extra = {}) { seen.push({ type, data: (extra as any).data }); rc.log(type, extra); } };
    await processMessage(env, watch, id, false, true);
    const replies = (await env.DB.prepare('SELECT status, error, text FROM zalo_outbox WHERE message_id = ? ORDER BY created_at').bind(id).all<any>()).results;
    const ai = seen.find((e) => e.type === 'ai.chat'), quick = seen.find((e) => e.type === 'zalo.quick'), fail = seen.find((e) => e.type === 'zalo.assistant');
    return json({ ok: replies.some((r) => r.status === 'sent'), replies: replies.map((r) => ({ ...r, text: String(r.text).replace(/^\u0002H/, '') })), ms: Date.now() - t0,
      path: ai ? 'ai' : quick ? 'rules' : 'command', model: ai?.data?.model, intent: ai?.data?.intent || quick?.data?.intent, why: quick?.data?.why || fail?.data?.error || null,
      assistantOn: env.config.zalo.assistant.enabled && !!anyTextAI(env) });
  }
  if (sub === 'zalo/test' && method === 'POST') {
    await notifyOwner(env, 'support', 'Tin nhắn thử từ trang quản trị: thông báo cho chủ web hoạt động ✅');
    const n = await env.DB.prepare("SELECT ok, data FROM events WHERE type = 'owner.notify' ORDER BY id DESC LIMIT 1").first<any>();
    const d = n ? JSON.parse(n.data || '{}') : {};
    if (!n?.ok) throw new HttpError(502, 'Chưa gửi được: ' + (d.error || 'không rõ'));
    return json({ ok: true, zalo: d.zalo, push: d.push });
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
  // A quiet bot is not a broken webhook: the old "auto" mode switched to polling (and deleted the
  // webhook) after 15 minutes without messages, which is why the webhook kept disappearing.
  // Now polling happens only when the admin chose it; the webhook is guarded by keepWebhook().
  return env.config.zalo.receive === 'poll' ? 'poll' : 'webhook';
}

/**
 * Every few minutes: is the bot's webhook still ours? Something else holding the same token (an old
 * Apps Script, n8n, a test copy of the site) can move or delete it. Put it back at once, write down
 * where it pointed (so the culprit is known), and tell the owner, at most once an hour.
 */
export async function keepWebhook(env: XEnv, rc: Rc) {
  const token = (env as any).ZALO_BOT_TOKEN, z = env.config.zalo;
  if (!z.enabled || !token || z.receive === 'poll' || !z.keepWebhook) return { checked: false };
  const st = (await zaloRecvStatus(env)) || {};
  // where it should point: the address connected before, else this site's own address
  const site = origin(env), base = (st.hook as string | undefined) || (site ? site + '/api/zalo/webhook' : '');
  if (!base) return { checked: false }; // the site's address is not known yet (no visit since the last restart)
  const info = await zaloApi(token, 'getWebhookInfo');
  if (!info.ok) return { checked: false, error: info.error }; // Zalo unreachable: do not guess
  const found = hookPath(info.result?.url);
  if (found === base) {
    if (st.lost) await recvState(env, { ...st, lost: false });
    return { checked: true, ok: true };
  }
  const secret = await webhookSecret(env);
  const r = await zaloApi(token, 'setWebhook', { url: base, secret_token: secret });
  if (!st.hook) {
    // never registered before (e.g. switched from polling): connect quietly, nothing was "lost"
    rc.log('zalo.webhook.connect', { ok: r.ok, data: { url: base, error: r.error || undefined } });
    await recvState(env, { ...st, hook: base, mode: 'webhook', connected: Date.now(), error: r.ok ? undefined : r.error });
    return { checked: true, ok: r.ok, found };
  }
  rc.log('zalo.webhook.restore', { ok: r.ok, data: { found: found || '(đã bị xoá)', error: r.error || undefined } });
  const now = Date.now(), tell = !st.toldAt || now - st.toldAt > 3600_000;
  await recvState(env, { ...st, hook: base, mode: 'webhook', lost: true, lostAt: now, found: found || '', restored: r.ok, error: r.ok ? undefined : r.error, toldAt: tell ? now : st.toldAt, losses: (st.losses || 0) + 1 });
  if (tell) {
    await notifyOwner(env, 'support', `⚠️ Webhook Zalo vừa bị ${found ? 'chuyển sang ' + found : 'xoá'}. ${r.ok ? 'Web đã tự kết nối lại, khách vẫn nhắn bình thường.' : 'Web chưa kết nối lại được: ' + r.error}`
      + `
Đã xảy ra ${(st.losses || 0) + 1} lần. Nguyên nhân thường là một hệ thống khác dùng chung token bot (Apps Script, n8n, bản chạy thử). Hãy gỡ token khỏi nơi đó.`).catch(() => {});
  }
  return { checked: true, ok: r.ok, found };
}

/**
 * Ask Zalo for new messages for about `budgetMs` (long polling), record and answer each.
 * Called every minute by the scheduled job when the mode is "poll".
 */
/** Shows "đang nhập…" in the customer's chat at once, while the answer is prepared. */
function typing(env: XEnv, chatId: string) {
  const token = (env as any).ZALO_BOT_TOKEN;
  return token ? zaloApi(token, 'sendChatAction', { chat_id: chatId, action: 'typing' }, 4000).then(() => {}, () => {}) : Promise.resolve();
}

/**
 * Listen for about `budgetMs` (long polling). The minute job calls this every minute: it listens
 * for almost the whole minute (a message is picked up the moment it arrives), answers each message
 * alongside instead of in turn (so listening never stops while the AI writes), and a lock keeps two
 * minutes from listening at once.
 */
export async function pollZalo(env: XEnv, rc: Rc, budgetMs = 57_000) {
  const token = (env as any).ZALO_BOT_TOKEN;
  if (!env.config.zalo.enabled || !token) return { polled: 0 };
  // a webhook and polling cannot both be on: drop a webhook that is set but not working
  const info = await zaloApi(token, 'getWebhookInfo');
  if (info.ok && info.result?.url) {
    // a webhook of another site: moving the bot here is the admin's call ("Kết nối webhook"), never automatic
    let host = ''; try { host = new URL(String(info.result.url)).host; } catch {}
    const mine = (() => { try { return new URL(origin(env)).host; } catch { return ''; } })();
    if (host && mine && host !== mine) {
      await recvState(env, { mode: 'poll', ok: false, error: `Bot đang có webhook của web khác (${host}). Bấm "Kết nối webhook" trong Quản trị → Zalo để chuyển bot về web này.` });
      return { polled: 0, error: 'foreign webhook' };
    }
    const del = await zaloApi(token, 'deleteWebhook');
    rc.log('zalo.poll.unhook', { ok: del.ok, data: { url: hookPath(info.result.url), error: del.error || undefined } });
  }
  const until = Date.now() + budgetMs;
  // one listener at a time: the next minute starts listening right when this one stops
  const lock = await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('zalo:poll-lock', ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE CAST(settings.value AS INTEGER) < ? RETURNING value`).bind(String(until), Date.now(), Date.now()).first();
  if (!lock) return { polled: 0, error: 'busy' };
  let got = 0, lastError = '';
  const work: Promise<unknown>[] = [];
  while (Date.now() < until - 2500) {
    const wait = Math.max(1, Math.min(25, Math.floor((until - Date.now()) / 1000) - 2));
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
      if(!event.isText&&event.text.startsWith('[ocr-image]')){work.push(send(env,event.chatId,'Đã nhận ảnh, đang chờ đọc chữ. Mình sẽ gửi nội dung để bạn kiểm tra trước khi đăng.',id));continue;}
      if (event.isText) work.push(typing(env, event.chatId));
      work.push(processMessage(env, rc, id).catch((e) => console.error('zalo message', e)));
    }
  }
  await env.DB.prepare("UPDATE settings SET value = '0' WHERE key = 'zalo:poll-lock' AND value = ?").bind(String(until)).run().catch(() => {});
  await Promise.all(work);
  await recvState(env, { mode: 'poll', ok: !lastError, error: lastError || undefined, got });
  return { polled: got, error: lastError };
}

/**
 * The one follow-up a good salesperson sends: to people who saw prices but did not buy, after
 * some quiet hours, only once, never to someone who asked not to be messaged or already bought.
 * Off unless the owner turns it on (Quản trị → Zalo).
 */
export async function followUps(env: XEnv, rc: Rc) {
  const f = env.config.zalo.followup;
  if (!f.enabled || !env.config.zalo.enabled || !(env as any).ZALO_BOT_TOKEN) return { sent: 0 };
  const now = Date.now(), quiet = f.hours * 3600_000;
  const rows = (await env.DB.prepare(`SELECT l.chat_id, l.profile FROM zalo_leads l
    WHERE l.quoted_at < ? AND l.quoted_at > ? AND l.followups = 0 AND l.optout = 0 AND l.stage NOT IN ('customer','lost')
      AND (l.human_until IS NULL OR l.human_until < ?)
      AND NOT EXISTS (SELECT 1 FROM zalo_messages m WHERE m.chat_id = l.chat_id AND m.received_at > ?)
      AND NOT EXISTS (SELECT 1 FROM zalo_links k JOIN user_plans p ON p.user_id = k.user_id WHERE k.chat_id = l.chat_id AND p.expires_at > ?)
    LIMIT 20`).bind(now - quiet, now - 7 * 86_400_000, now, now - quiet, now).all<any>()).results;
  let sent = 0;
  for (const r of rows) {
    const p = (() => { try { return JSON.parse(r.profile || '{}'); } catch { return {}; } })();
    const name = (await env.DB.prepare('SELECT sender_name FROM zalo_messages WHERE chat_id = ? ORDER BY received_at DESC LIMIT 1').bind(r.chat_id).first<any>())?.sender_name;
    await env.DB.prepare('UPDATE zalo_leads SET followups = followups + 1, last_followup = ? WHERE chat_id = ?').bind(now, r.chat_id).run();
    const res = await send(env, r.chat_id, fill(f.text, { ten: p.ten || name || 'bạn', goi: p.goi || 'video' }));
    if (res.ok) sent++;
  }
  if (rows.length) rc.log('zalo.followup', { data: { sent, due: rows.length } });
  return { sent };
}
