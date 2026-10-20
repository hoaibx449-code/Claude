import {hunterPublic} from './hunter.ts';
import {solutionPage,solutionSitemap,solutionDownload,solutionList,cleanupSolutionFiles} from './solutions.ts';
import {secureResponse} from './security.ts';
import {feedPhoto,tickFeed} from './image-feed.ts';
import {googleFeedCallback} from './feed-google.ts';
import {bridgeReceive} from './feed-apps-script.ts';
import { creativeResult } from './creative.ts';
import { creationChoice, designIssues } from './creation-policy.ts';
// Nét Vẽ Studio API (Cloudflare Worker). Static pages are served from ./public.
import { consumeNonce, currentUser, endSession, newNonce, startSession, type User, verifyGoogleToken,loginNonceCookie,checkLoginBrowser } from './auth.ts';
import { drawImage, type ImageProvider, type TextProvider, writeScript, reviewDirectionFrames, isTextProvider, hasTextAI } from './ai.ts';
import {claimIllustrated,startIllustrated,assertIllustrated,voiceCache as illustratedVoiceCache} from '../../addons/faciup-illustrated/web.ts';
import {claimWhiteboard,startWhiteboard,assertWhiteboard,voiceCache} from '../../addons/faciup-whiteboard/web.ts';
import { startRunner } from './gcp.ts';
import { cleanSpec, LOOKS, STYLES } from './spec.ts';
import { LOOK_BRIEF } from './ai.ts';
import { clearVoiceFallback, recordRunnerCaps, recordVoiceFallback, voicePreview, voicesWithStatus, voiceUpload, browserVoice } from './voices.ts';
import { composeLook, composeScene, splitScript } from './compose.ts';
import { doodlePanels } from './doodles.ts';
import { chargeDoc, closeDocProject, creditRoutes, giveBackDocImage, openDocProject, refundDoc, useDocImage } from './credits.ts';
import { detectIntent, FORMATS, FORMAT_NAMES, FORMAT_STYLE, NICHES, NICHE_NAMES, NICHE_STYLE } from './intent.ts';
import { fillLegal } from './legal.ts';
import { aiCost, clientIp, imageCost, logEvent, routeName, summarize, voiceCost, type LogEntry } from './log.ts';
import { type Config, effectiveEnv, isAdmin, load, publicConfig, runnerSecrets, vis } from './settings.ts';
import { adminRoutes } from './admin.ts';
import { helpChat } from './help.ts';
import { budgetState, fitVoiceToBudget, requireBudget } from './budget.ts';
import { checkShare, followUps, keepWebhook, notifyJob, rememberOrigin, resumeZalo, shareLink, zaloUser, zaloWebhook, pollZalo, receiveMode } from './zalo.ts';
import { pushPublicKey, pushUser, validEndpoint } from './push.ts';
import { checkAllowed, checkSource, expireOrders, limitsFor, planOf, planRoutes, sepayWebhook } from './plans.ts';
import { affiliateScene, communityPublic, deleteVideo, introFor, serveObject, shareToCommunity, siteType, storedVideoKey, upload, videoKey } from './media.ts';
import { body, readBytes, type Env, HttpError, json, randomId, refundQuota, sha256, timingSafeEqual, today, useQuota } from './util.ts';

const MAX_ACTIVE_JOBS = 2;
const STALE_JOB_MS = 45 * 60_000;

/** Per-request context: who is calling, and a logger that never slows the response down. */
export interface Rc {
  userId: string | null; visitor: string | null; ip: string; ua: string | null; channel: LogEntry['channel'];
  /** set by handlers whose plain request log would be noise (polling) */
  quiet: boolean;
  log(type: string, extra?: Partial<LogEntry>): void;
  /** finish work after the response (ctx.waitUntil) */
  wait(p: Promise<unknown>): void;
}

// requests polled every few seconds: not worth a log row each
const QUIET = /^GET \/api\/(projects\/:id\/jobs|assets\/|me$|auth\/config)|^(PUT|POST) \/api\/runner\/jobs\/:id\/progress|^POST \/api\/events$/;

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const t0 = Date.now(), url = new URL(req.url), api = url.pathname.startsWith('/api/');
    // links sent by Zalo point back here (the render machine calls the same public address)
    if (api) rememberOrigin(url.origin);
    const rc: Rc = {
      userId: null, visitor: (req.headers.get('x-visitor') || '').replace(/[^a-z0-9]/gi, '').slice(0, 32) || null,
      ip: clientIp(req), ua: req.headers.get('user-agent'), quiet: false,
      channel: url.pathname.startsWith('/api/runner/') ? 'runner' : url.pathname === '/api/zalo/webhook' ? 'zalo' : 'web',
      log(type, extra = {}) { ctx.waitUntil(logEvent(env, { type, userId: rc.userId, visitor: rc.visitor, channel: rc.channel, ip: rc.ip, ua: rc.ua, ...extra })); },
      wait(p) { ctx.waitUntil(p.catch((e) => console.error(e))); },
    };
    let res: Response, error = '';
    try {
      res = await route(req, env, ctx, rc);
    } catch (e) {
      if (e instanceof HttpError) { res = json({ error: e.message, ...(e.extra || {}) }, e.status); error = e.message; }
      else { console.error(e); error = String((e as Error)?.stack || e).slice(0, 500); res = json({ error: 'Máy chủ gặp lỗi, thử lại sau ít phút.' }, 500); }
    }
    const name = `${req.method} ${routeName(url.pathname)}`;
    if (api && !rc.quiet && (!QUIET.test(name) || res.status >= 400)) {
      rc.log(res.status >= 500 ? 'error' : 'api', { path: name, ok: res.status < 400, ms: Date.now() - t0, data: error ? { status: res.status, error } : { status: res.status } });
    }
    return secureResponse(req,res);
  },
  // Safety net: if videos wait in the queue (e.g. a start request was lost), start the render machine.
  async scheduled(e: ScheduledController, env: Env, ctx: ExecutionContext) {
    const xenvZ = await effectiveEnv(env);
    if(new Date(e.scheduledTime).getUTCMinutes()===0)ctx.waitUntil(cleanupSolutionFiles(xenvZ).catch(err=>console.error('solutionFileCleanup',err)));
    ctx.waitUntil(tickFeed(xenvZ).catch(err=>console.error('imageFeed',err)));
    // Zalo without a webhook: every minute, ask for new messages (see pollZalo)
    if (xenvZ.config.zalo.enabled && (xenvZ as any).ZALO_BOT_TOKEN && (await receiveMode(xenvZ)) === 'poll') {
      const prc: Rc = { userId: null, visitor: null, ip: '', ua: null, channel: 'zalo', quiet: true,
        log(type, extra = {}) { ctx.waitUntil(logEvent(env, { type, channel: 'zalo', ...extra })); }, wait(p) { ctx.waitUntil(p); } };
      ctx.waitUntil(pollZalo(xenvZ, prc).catch((err) => console.error('pollZalo', err)));
    }
    // every minute: messages the webhook left for later (AI work does not fit in its 30 seconds),
    // tasks cut short, and replies Zalo did not take the first time
    if (xenvZ.config.zalo.enabled && (xenvZ as any).ZALO_BOT_TOKEN) {
      const zrc: Rc = { userId: null, visitor: null, ip: '', ua: null, channel: 'zalo', quiet: true,
        log(type, extra = {}) { ctx.waitUntil(logEvent(env, { type, channel: 'zalo', ...extra })); }, wait(p) { ctx.waitUntil(p); } };
      ctx.waitUntil(resumeZalo(xenvZ, zrc).catch((err) => console.error('resumeZalo', err)));
      const minute = new Date(e.scheduledTime).getUTCMinutes();
      // every 5 minutes: the webhook is still ours (put back if something moved or deleted it)
      if (minute % 5 === 0) ctx.waitUntil(keepWebhook(xenvZ, zrc).catch((err) => console.error('keepWebhook', err)));
      // once an hour: the one friendly follow-up to people who saw prices (only when the owner turned it on)
      if (minute === 17) ctx.waitUntil(followUps(xenvZ, zrc).catch((err) => console.error('followUps', err)));
    }
    // the rest runs every 10 minutes
    if (new Date(e.scheduledTime).getUTCMinutes() % 10 !== 0) return;
    // keep the activity log to the configured number of days
    const { config } = await load(env);
    ctx.waitUntil(env.DB.prepare('DELETE FROM events WHERE ts < ?').bind(Date.now() - config.logDays * 86_400_000).run().then(() => {}, (e) => console.error(e)));
    const xenv = await effectiveEnv(env);
    ctx.waitUntil(Promise.all([
      expireOrders(xenv),
      env.DB.prepare('DELETE FROM feed_image_tests WHERE created_at < ?').bind(Date.now()-30*86400000).run(),
      env.DB.prepare('DELETE FROM zalo_ocr WHERE created_at < ?').bind(Date.now()-7*86400000).run(),
      env.DB.prepare('DELETE FROM zalo_seen WHERE ts < ?').bind(Date.now() - 2 * 86_400_000).run(),
      env.DB.prepare('DELETE FROM zalo_codes WHERE expires_at < ?').bind(Date.now()).run(),
      env.DB.prepare('DELETE FROM usage WHERE day < ?').bind(new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)).run(),
      env.DB.prepare('DELETE FROM zalo_messages WHERE received_at < ?').bind(Date.now() - config.logDays * 86_400_000).run(),
      env.DB.prepare('DELETE FROM zalo_outbox WHERE created_at < ?').bind(Date.now() - config.logDays * 86_400_000).run(),
    ]).then(() => {}, (e) => console.error(e)));
    const waiting = await env.DB.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued' AND COALESCE(json_extract(spec,'$.look'),'') NOT IN ('whiteboard','illustrated') AND created_at < ?").bind(Date.now() - 90_000).first<any>();
    if (config.rendering.mode === 'cloud' && waiting?.n) ctx.waitUntil(startRunner(env).catch((e) => console.error(e)));
    const il=await env.DB.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status='queued' AND json_extract(spec,'$.look')='illustrated'").first<any>();if(config.rendering.mode === 'cloud' && il?.n)ctx.waitUntil(startIllustrated(env).catch(()=>{}));
    const wb=await env.DB.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status='queued' AND json_extract(spec,'$.look')='whiteboard'").first<any>();
    if(config.rendering.mode === 'cloud' && wb?.n)ctx.waitUntil(startWhiteboard(env).catch(e=>console.error(e)));
  },
};

export type XEnv = Env & { config: Config };

async function route(req: Request, rawEnv: Env, ctx: ExecutionContext, rc: Rc): Promise<Response> {
  const url = new URL(req.url), path = url.pathname, method = req.method;
  if (!path.startsWith('/api/')) {
    if(path==='/kham-pha'||path.startsWith('/kham-pha/')||path.startsWith('/giai-phap/')||path.startsWith('/tai-nguyen/')||path==='/sitemap-solutions.xml'||path==='/robots.txt'){
      if(method!=='GET'&&method!=='HEAD')throw new HttpError(405,'Chỉ hỗ trợ đọc trang.');
      const env=await effectiveEnv(rawEnv);
      if(path==='/robots.txt')return new Response('User-agent: *\nDisallow: /api/\nDisallow: /tai-nguyen/\nSitemap: '+url.origin+'/sitemap-solutions.xml\n',{headers:{'content-type':'text/plain; charset=utf-8'}});
      if(path==='/sitemap-solutions.xml')return solutionSitemap(req,env);
      const file=path.match(/^\/tai-nguyen\/([a-f0-9]{24})$/);if(file)return solutionDownload(req,env,file[1]);
      const page=await solutionPage(req,env);if(page)return page;
      throw new HttpError(404,'Không tìm thấy trang.');
    }
    const asset=await rawEnv.ASSETS.fetch(req);
    if((path==='/'||path==='/index.html')&&asset.headers.get('content-type')?.includes('text/html')){
      try{
        const config=await load(rawEnv),headers=new Headers(asset.headers);
        headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-cache');
        return new HTMLRewriter().on('#loadingText',{element(el){el.setInnerContent(config.config.site.loadingText);}}).transform(new Response(asset.body,{status:asset.status,headers}));
      }catch(e){console.error('Loading text configuration unavailable',e);}
    }
    return asset;
  }
  const env = await effectiveEnv(rawEnv);
  if(path==='/api/solutions'&&method==='GET')return json(await solutionList(env,url));
  if(path.startsWith('/api/image-feed/bridge/'))return bridgeReceive(req,env,path.slice('/api/image-feed/bridge/'.length));
  if(path==='/api/image-feed/google/callback'&&method==='GET')return googleFeedCallback(req,env);
  const feedImage=path.match(/^\/api\/image-feed\/photo\/([a-f0-9]{64})$/);
  if(feedImage&&method==='GET')return feedPhoto(env,feedImage[1],url.searchParams.get('t')||'');
  if(path.startsWith('/api/illustrated-runner/')){const sub=path.slice('/api/illustrated-runner/'.length);const v=sub.match(/^voice\/([a-f0-9]{24})\/(\d+)$/);if(v)return illustratedVoiceCache(req,env,v[1],Number(v[2]));return sub==='claim'?claimIllustrated(req,env,rc):runner(req,env,sub,rc);}
  if(path.startsWith('/api/whiteboard-runner/')) {const sub=path.slice('/api/whiteboard-runner/'.length);const v=sub.match(/^voice\/([a-f0-9]{24})\/(\d+)$/);if(v)return voiceCache(req,env,v[1],Number(v[2]));return sub==='claim'?claimWhiteboard(req,env,rc):runner(req,env,sub,rc);}
  if (path.startsWith('/api/runner/')) return runner(req, env, path.slice('/api/runner/'.length), rc);

  // called by other services (verified inside), and the no-login share link for finished videos
  if (path === '/api/zalo/webhook' && method === 'POST') return zaloWebhook(req, env, rc);
  if (path === '/api/sepay/webhook' && method === 'POST') return sepayWebhook(req, env, rc);
  // home page pictures and sample videos (public, content-addressed so cached for a year)
  const site = path.match(/^\/api\/site\/([a-f0-9]{24})\.(png|jpg|webp|mp4|webm|mp3|m4a)$/);
  if (site && (method === 'GET' || method === 'HEAD')) { rc.quiet = true; return serveObject(env, req, `site/${site[1]}.${site[2]}`, siteType(site[2]), { 'cache-control': 'public, max-age=31536000, immutable' }); }
  // listen to a voice before choosing it (public; samples are cached)
  if (path === '/api/voices/preview' && method === 'GET') return voicePreview(req, env, rc);
  const sh = path.match(/^\/api\/share\/([a-f0-9]{24})$/);
  if (sh && method === 'GET') return shareVideo(env, rc, sh[1], url);
  // the cover picture of a shared video (sent as a photo in Zalo), signed like the video link
  const st = path.match(/^\/api\/share\/([a-f0-9]{24})\/thumb\.jpg$/);
  if (st && method === 'GET') {
    if (!(await checkShare(env, st[1], Number(url.searchParams.get('e')), url.searchParams.get('s') || ''))) throw new HttpError(403, 'Link đã hết hạn.');
    const job = await env.DB.prepare("SELECT user_id FROM jobs WHERE id = ? AND status = 'done'").bind(st[1]).first<any>();
    const obj = job ? await env.BUCKET.get(`thumb/${job.user_id}/${st[1]}.jpg`) : null;
    if (!obj) throw new HttpError(404, 'Chưa có ảnh bìa.');
    rc.quiet = true;
    return new Response(obj.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' } });
  }

  // Google sign-in by full-page redirect (works in installed apps and in-app browsers where popups hang)
  if (path === '/api/auth/google/start' && method === 'GET') {
    if (!env.GOOGLE_CLIENT_ID) throw new HttpError(503, 'Chủ trang chưa cấu hình đăng nhập Google.');
    const next = safeNext(url.searchParams.get('next'));
    const nonce = await newNonce(env);
    const q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: url.origin + '/api/auth/google/callback', response_type: 'id_token', response_mode: 'form_post',
      scope: 'openid email profile', nonce, state: nonce + '.' + btoa(next).replace(/=+$/, ''), prompt: 'select_account' });
    rc.log('auth.redirect');
    return new Response(null, { status: 302, headers: { location: 'https://accounts.google.com/o/oauth2/v2/auth?' + q,'set-cookie':loginNonceCookie(nonce),'cache-control':'no-store' } });
  }
  if (path === '/api/auth/google/callback' && method === 'POST') return googleCallback(req, env, rc, url);

  // Browser requests that change data must come from our own page (CSRF guard on top of SameSite cookies).
  if (method !== 'GET') {
    const origin = req.headers.get('origin');
    if (req.headers.get('x-nv') !== '1' || (origin && origin !== url.origin)) throw new HttpError(403, 'Yêu cầu không hợp lệ.');
  }
  const devAllowed = env.DEV_LOGIN === '1' && ['localhost', '127.0.0.1'].includes(url.hostname);

  // ---- sign-in
  if (path === '/api/auth/config' && method === 'GET') {
    const nonce=env.GOOGLE_CLIENT_ID?await newNonce(env):null;
    return json({ clientId: env.GOOGLE_CLIENT_ID || null, nonce, dev: devAllowed, ui: { ...publicConfig(env.config), voices: (await voicesWithStatus(env)).filter((v) => v.ready) }, ai: { gemini: !!env.GEMINI_API_KEY, openai: !!env.OPENAI_API_KEY, ollama: hasTextAI(env, 'ollama') } },200,nonce?{'set-cookie':loginNonceCookie(nonce)}:{});
  }
  if (path === '/api/auth/google' && method === 'POST') {
    if (!env.GOOGLE_CLIENT_ID) throw new HttpError(503, 'Chủ trang chưa cấu hình đăng nhập Google.');
    const b = await body<{ credential?: string; nonce?: string; consent?: boolean }>(req, 20_000);
    if (b.consent !== true) throw new HttpError(400, 'Bạn cần đồng ý Điều khoản và Chính sách bảo mật để đăng nhập.');
    checkLoginBrowser(req,String(b.nonce||''));
    await consumeNonce(env, String(b.nonce || ''));
    const u = await verifyGoogleToken(String(b.credential || ''), env.GOOGLE_CLIENT_ID, String(b.nonce));
    if (await blocked(env, u.id)) throw new HttpError(403, BLOCKED);
    const cookie = await startSession(env, u);
    rc.userId = u.id; await recordConsent(env, rc, u.id);
    rc.log('auth.login', { data: { method: 'google', email: u.email } });
    return json({ user: u }, 200, { 'set-cookie': cookie });
  }
  if (path === '/api/auth/dev' && method === 'POST') {
    if (!devAllowed) throw new HttpError(404, 'Không tìm thấy.');
    const db = await body<any>(req);
    if (db.consent !== true) throw new HttpError(400, 'Bạn cần đồng ý Điều khoản và Chính sách bảo mật để đăng nhập.');
    const email = String(db.email || 'dev@localhost').toLowerCase().slice(0, 100);
    const u = { id: 'dev-' + (await sha256(email)).slice(0, 16), email, name: 'Người thử', picture: null };
    const cookie = await startSession(env, u);
    rc.userId = u.id; await recordConsent(env, rc, u.id);
    rc.log('auth.login', { data: { method: 'dev', email } });
    return json({ user: u }, 200, { 'set-cookie': cookie });
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    const u = await currentUser(env, req);
    if (u) { rc.userId = u.id; rc.log('auth.logout'); }
    return json({ ok: true }, 200, { 'set-cookie': await endSession(env, req) });
  }

  // public: legal pages, and a free preview so people can try before signing in
  if (path === '/api/legal' && method === 'GET') {
    const l = env.config.legal, brand = env.config.brand.name + (env.config.brand.accent ? ' ' + env.config.brand.accent : '');
    return json({ version: l.version, company: l.company, email: l.email, address: l.address, taxId: l.taxId,
      terms: fillLegal(l.terms, l, brand), privacy: fillLegal(l.privacy, l, brand), refund: fillLegal(l.refund, l, brand) });
  }
  if (path === '/api/try' && method === 'POST') return tryPreview(req, env, rc);
  const tp = path.match(/^\/api\/templates\/([a-z0-9-]{2,30})$/);
  if (tp && method === 'GET') {
    const t = env.config.templates.find((x) => x.id === tp[1]);
    if (!t || vis(env.config, 'feature:templates') === 'hidden') throw new HttpError(404, 'Không tìm thấy mẫu.');
    rc.log('template.open', { data: { id: t.id } });
    return json({ template: t });
  }


  const user = await currentUser(env, req);
  if (user) rc.userId = user.id;
  const hunter=await hunterPublic(req,env,rc,path,user);if(hunter)return hunter;
  const pub = await communityPublic(req, env, rc, path, user);
  if (pub) return pub;
  // what people do in the page (guests included): views, clicks, errors
  if (path === '/api/events' && method === 'POST') return clientEvents(req, env, rc);
  // the help chat in the corner (guests included)
  if (path === '/api/help/chat' && method === 'POST') return helpChat(req, env, rc, user);
  if (!user) throw new HttpError(401, 'Bạn cần đăng nhập.');
  if (await blocked(env, user.id)) throw new HttpError(403, BLOCKED);
  if (path.startsWith('/api/admin/')) {
    if (!(await isAdmin(env, env.config, user))) throw new HttpError(403, 'Chỉ quản trị viên mới vào được trang này.');
    return adminRoutes(req, env, rawEnv, path.slice('/api/admin/'.length), method, rc, user);
  }
  return userRoutes(req, env, ctx, user, path, method, devAllowed, rc);
}

const BLOCKED = 'Tài khoản này đã bị khoá. Liên hệ quản trị viên.';

/** Where to land after signing in: a path of this site only. */
function safeNext(v: string | null) {
  const n = String(v || '/');
  return /^\/(?!\/)[\w\-./#?=&%]{0,200}$/.test(n) ? n : '/';
}

async function googleCallback(req: Request, env: XEnv, rc: Rc, url: URL) {
  const back = (next: string, err?: string) => new Response(null, { status: 303, headers: { location: err ? `/#/dang-nhap-loi?m=${encodeURIComponent(err)}` : next } });
  try {
    if(!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))throw new HttpError(415,'Định dạng đăng nhập không hợp lệ.');
    const form = new URLSearchParams(new TextDecoder().decode(await readBytes(req,20000)));
    if (form.get('error')) return back('/', 'Bạn đã huỷ đăng nhập Google.');
    const [nonce, enc] = String(form.get('state') || '').split('.');
    checkLoginBrowser(req,nonce);
    await consumeNonce(env, nonce);
    let next = '/';
    try { next = safeNext(atob(enc || '')); } catch { /* keep home */ }
    const u = await verifyGoogleToken(String(form.get('id_token') || ''), env.GOOGLE_CLIENT_ID!, nonce);
    if (await blocked(env, u.id)) return back('/', BLOCKED);
    const cookie = await startSession(env, u);
    // continuing past "By continuing you agree to the Terms and Privacy Policy" is the consent
    rc.userId = u.id; await recordConsent(env, rc, u.id);
    rc.log('auth.login', { data: { method: 'google-redirect', email: u.email } });
    return new Response(null, { status: 303, headers: { location: next, 'set-cookie': cookie } });
  } catch (e: any) {
    rc.log('auth.login', { ok: false, data: { method: 'google-redirect', error: String(e?.message || e).slice(0, 200) } });
    return back('/', e instanceof HttpError ? e.message : 'Đăng nhập chưa thành công, thử lại nhé.');
  }
}
const blocked = async (env: Env, id: string) => !!(await env.DB.prepare('SELECT 1 AS b FROM blocked_users WHERE user_id = ?').bind(id).first());


async function getProject(env: Env, user: User, id: string) {
  const p = await env.DB.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').bind(id, user.id).first<any>();
  if (!p) throw new HttpError(404, 'Không tìm thấy dự án.');
  return { ...p, spec: JSON.parse(p.spec) };
}
async function saveSpec(env: Env, user: User, id: string, spec: any, expected?: number) {
  if (expected !== undefined) {
    const r = await env.DB.prepare('UPDATE projects SET spec = ?, title = ?, updated_at = ? WHERE id = ? AND user_id = ? AND updated_at = ?').bind(JSON.stringify(spec), spec.title, Date.now(), id, user.id, expected).run();
    if (!r.meta.changes) throw new HttpError(409, 'Video đã thay đổi. Tải lại trước khi áp dụng đề xuất.');
    return;
  }
  await env.DB.prepare('UPDATE projects SET spec = ?, title = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .bind(JSON.stringify(spec), spec.title, Date.now(), id, user.id).run();
}

async function recordConsent(env: Env & { config: Config }, rc: Rc, userId: string) {
  await env.DB.prepare('INSERT OR IGNORE INTO consents (user_id, version, accepted_at, ip, ua) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, env.config.legal.version, Date.now(), rc.ip, rc.ua?.slice(0, 160) || null).run();
  rc.log('consent', { data: { version: env.config.legal.version } });
}

/** Free preview for anyone (no account): the user's script designed by rules, not saved. */
async function tryPreview(req: Request, env: XEnv, rc: Rc) {
  const b = await body<any>(req, 25_000);
  const text = String(b.text || '').trim().slice(0, 6000);
  if (text.length < 10) throw new HttpError(400, 'Nhập vài câu kịch bản để xem thử.');
  await useQuota(env, 'ip:' + rc.ip, 'try', 60);
  const scenes = splitScript(text).slice(0, 12);
  if (!scenes.length) throw new HttpError(400, 'Không tách được câu nào.');
  const it = detectIntent(text);
  const format = FORMATS.includes(b.format) ? b.format : it.format;
  const style = env.config.enabledStyles.includes(b.style) ? b.style : FORMAT_STYLE[format as keyof typeof FORMAT_STYLE] || NICHE_STYLE[it.niche];
  const look = LOOKS.includes(b.look) && b.look !== 'doc' && vis(env.config, 'look:' + b.look) === 'on' ? b.look : undefined;
  const composed = look ? composeLook({ look, scenes: scenes.map((lines) => ({ lines })) }) : null;
  const spec = cleanSpec({ title: scenes[0][0].replace(/[.!?…]+$/, '').slice(0, 70), scenes: composed ? composed.scenes : scenes.map((lines) => ({ lines })), visual: 'sketch', format, niche: it.niche,
    ratio: b.ratio === '16:9' ? '16:9' : '9:16', style: env.config.enabledStyles.includes(style) ? style : env.config.defaults.style, channel: env.config.brand.name,
    look, skin: b.skin, sides: composed?.sides, chatName: composed?.chatName, cast: composed?.cast }, 'guest');
  rc.log('try.preview', { data: { format, niche: it.niche, style: spec.style, scenes: spec.scenes.length, chars: text.length } });
  return json({ spec, formatName: FORMAT_NAMES[format as keyof typeof FORMAT_NAMES], nicheName: NICHE_NAMES[it.niche] });
}

/** Everything we hold about the user, as one JSON file (right to a copy of one's data). */
async function exportAccount(env: XEnv, rc: Rc, user: User) {
  const q = (sql: string) => env.DB.prepare(sql).bind(user.id).all<any>().then((r) => r.results);
  const [profile, projects, jobs, orders, plans, consents, zalo, events, prompts] = await Promise.all([
    env.DB.prepare('SELECT id, email, name, picture, created_at FROM users WHERE id = ?').bind(user.id).first(),
    q('SELECT id, title, spec, created_at, updated_at FROM projects WHERE user_id = ?'), q('SELECT id, project_id, status, error, created_at, finished_at FROM jobs WHERE user_id = ?'),
    q('SELECT code, plan, amount, status, created_at, paid_at FROM orders WHERE user_id = ?'), q('SELECT plan, expires_at FROM user_plans WHERE user_id = ?'),
    q('SELECT version, accepted_at FROM consents WHERE user_id = ?'), q('SELECT name, linked_at, notify FROM zalo_links WHERE user_id = ?'),
    q('SELECT ts, channel, type, path, data FROM events WHERE user_id = ? ORDER BY id DESC LIMIT 5000'),
    q('SELECT * FROM hunter_prompts WHERE user_id=?'),
  ]);
  rc.log('account.export');
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), profile, prompts, projects: projects.map((p: any) => ({ ...p, spec: JSON.parse(p.spec) })), jobs, orders, plans, consents, zalo, events }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="du-lieu-cua-toi.json"`, 'cache-control': 'no-store' },
  });
}

/** Delete the account and its content. Payment records stay (accounting law) but lose the link to the person. */
async function deleteAccount(env: XEnv, rc: Rc, user: User) {
  const jobs = (await env.DB.prepare('SELECT id FROM jobs WHERE user_id = ?').bind(user.id).all<any>()).results;
  for (const job of jobs) await deleteVideo(env, user.id, job.id);
  let cursor: string | undefined;
  do {
    const l = await env.BUCKET.list({ prefix: `img/${user.id}/`, cursor });
    if (l.objects.length) await env.BUCKET.delete(l.objects.map((o) => o.key));
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
  do {
    const l = await env.BUCKET.list({ prefix: `up/${user.id}/`, cursor });
    if (l.objects.length) await env.BUCKET.delete(l.objects.map((o) => o.key));
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
  const anon = 'deleted-' + (await sha256(user.id)).slice(0, 12);
  await env.DB.batch([
    env.DB.prepare('UPDATE zalo_owners SET active=0,updated_at=? WHERE chat_id IN (SELECT chat_id FROM zalo_links WHERE user_id=?)').bind(Date.now(),user.id),
    env.DB.prepare('DELETE FROM feed_image_tests WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM image_feed_deliveries WHERE chat_id IN (SELECT chat_id FROM zalo_links WHERE user_id = ?)').bind(user.id),
    env.DB.prepare('DELETE FROM image_feed_subscribers WHERE chat_id IN (SELECT chat_id FROM zalo_links WHERE user_id = ?)').bind(user.id),
    env.DB.prepare('DELETE FROM zalo_ocr WHERE chat_id IN (SELECT chat_id FROM zalo_links WHERE user_id = ?)').bind(user.id),
    env.DB.prepare('DELETE FROM zalo_messages WHERE chat_id IN (SELECT chat_id FROM zalo_links WHERE user_id = ?)').bind(user.id),
    env.DB.prepare('DELETE FROM zalo_outbox WHERE chat_id IN (SELECT chat_id FROM zalo_links WHERE user_id = ?)').bind(user.id),
    env.DB.prepare('DELETE FROM jobs WHERE user_id = ?').bind(user.id), env.DB.prepare('DELETE FROM projects WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id), env.DB.prepare('DELETE FROM zalo_links WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM usage WHERE user_id = ?').bind(user.id), env.DB.prepare('DELETE FROM user_plans WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM consents WHERE user_id = ?').bind(user.id), env.DB.prepare('DELETE FROM community WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM community_likes WHERE user_id = ?').bind(user.id), env.DB.prepare('UPDATE orders SET user_id = ? WHERE user_id = ?').bind(anon, user.id),
    env.DB.prepare('UPDATE events SET user_id = NULL, ip = NULL, ua = NULL WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM hunter_reports WHERE user_id=?').bind(user.id),
    env.DB.prepare('DELETE FROM hunter_reports WHERE prompt_id IN (SELECT id FROM hunter_prompts WHERE user_id=?)').bind(user.id),
    env.DB.prepare('DELETE FROM hunter_prompts WHERE user_id=?').bind(user.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  rc.userId = null; rc.log('account.delete', { data: { videos: jobs.length } });
}

async function clientEvents(req: Request, env: XEnv, rc: Rc) {
  const b = await body<any>(req, 30_000);
  const list = (Array.isArray(b.events) ? b.events : []).slice(0, 30);
  // a browser may send at most 2000 events a day
  const who = rc.userId || (rc.visitor ? 'v:' + rc.visitor : null);
  if (!who || !list.length) return json({ ok: true });
  // per browser and per network: a page cannot flood the log by changing its visitor id
  try { await useQuota(env, who, 'events', 2000); await useQuota(env, 'ip:' + rc.ip, 'events', 6000); } catch { return json({ ok: true, dropped: true }); }
  const stmts = list.filter((e: any) => /^ui\.[a-z_.]{2,40}$/.test(String(e?.type))).map((e: any) => env.DB.prepare(
    `INSERT INTO events (ts, user_id, visitor, channel, type, path, ok, ms, project_id, data, ip, ua) VALUES (?, ?, ?, 'web', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(Math.min(Date.now(), Number(e.ts) || Date.now()), rc.userId, rc.visitor, e.type, String(e.path || '').slice(0, 120) || null, e.type === 'ui.error' ? 0 : 1,
    Number.isFinite(e.ms) ? Math.round(e.ms) : null, /^[a-f0-9]{24}$/.test(e.project || '') ? e.project : null,
    JSON.stringify(summarize(e.data ?? null)).slice(0, 2000), rc.ip, rc.ua?.slice(0, 160) || null));
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true });
}

async function userRoutes(req: Request, env: XEnv, ctx: ExecutionContext, user: User, path: string, method: string, devAllowed: boolean, rc: Rc): Promise<Response> {
  if (path === '/api/me' && method === 'GET') {
    const used = await env.DB.prepare('SELECT kind, n FROM usage WHERE user_id = ? AND day = ?').bind(user.id, today()).all<any>();
    const { plan, expires } = await planOf(env, user.id);
    const zalo = env.config.zalo.enabled ? await env.DB.prepare('SELECT notify FROM zalo_links WHERE user_id = ?').bind(user.id).first<any>() : null;
    const consent = await env.DB.prepare('SELECT 1 FROM consents WHERE user_id = ? AND version = ?').bind(user.id, env.config.legal.version).first();
    return json({ user, needConsent: !consent, limits: plan.limits, plan: { id: plan.id, name: plan.name, expires, maxSeconds: plan.maxSeconds }, zaloLinked: !!zalo, used: Object.fromEntries(used.results.map((r) => [r.kind, r.n])), ai: { gemini: !!env.GEMINI_API_KEY, openai: !!env.OPENAI_API_KEY, ollama: hasTextAI(env, 'ollama') },
      ui: { ...publicConfig(env.config), voices: (await voicesWithStatus(env)).filter((v) => v.ready) }, admin: await isAdmin(env, env.config, user) });
  }

  if (path === '/api/voice-upload' && method === 'POST') return voiceUpload(req, env, rc, user);
  if (path === '/api/account/export' && method === 'GET') return exportAccount(env, rc, user);
  if (path === '/api/account/delete' && method === 'POST') {
    if ((await body<any>(req, 200)).confirm !== 'XOA') throw new HttpError(400, 'Gõ XOA để xác nhận.');
    if (await isAdmin(env, env.config, user)) throw new HttpError(400, 'Tài khoản quản trị không tự xoá được. Thêm quản trị viên khác trước.');
    await deleteAccount(env, rc, user);
    return json({ ok: true }, 200, { 'set-cookie': await endSession(env, req) });
  }
  if (path === '/api/consent' && method === 'POST') { await recordConsent(env, rc, user.id); return json({ ok: true }); }
  if (path.startsWith('/api/zalo/')) return zaloUser(req, env, rc, user, path.slice('/api/zalo/'.length), method);
  // notifications on this device when a video is ready (Web Push)
  if (path === '/api/push/key' && method === 'GET') return json({ key: await pushPublicKey(env) });
  if (path === '/api/push/subscribe' && method === 'POST') {
    const b = await body<any>(req, 4000);
    if (!validEndpoint(b?.endpoint)) throw new HttpError(400, 'Trình duyệt này chưa hỗ trợ thông báo.');
    await env.DB.prepare('INSERT INTO push_subs (endpoint, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id').bind(String(b.endpoint), user.id, Date.now()).run();
    rc.log('push.subscribe');
    return json({ ok: true });
  }
  if (path === '/api/push/subscribe' && method === 'DELETE') {
    const b = await body<any>(req, 4000).catch(() => ({}));
    await env.DB.prepare('DELETE FROM push_subs WHERE user_id = ? AND (endpoint = ? OR ? = \'\')').bind(user.id, String(b?.endpoint || ''), String(b?.endpoint || '')).run();
    return json({ ok: true });
  }
  if (path === '/api/push/latest' && method === 'GET') {
    const n = await env.DB.prepare('SELECT title, body, url, ts FROM push_notes WHERE user_id = ?').bind(user.id).first<any>();
    return json({ note: n || null });
  }
  if (path === '/api/push/test' && method === 'POST') {
    const r = await pushUser(env, user.id, { title: 'Thông báo đã bật', body: 'Khi video dựng xong, bạn sẽ nhận tin ở đây.', url: '/#/' }, 'mailto:' + env.config.legal.email);
    return json(r);
  }
  // a link anyone can open (7 days): to send the finished video through Zalo or any app
  const jl = path.match(/^\/api\/jobs\/([a-f0-9]{24})\/link$/);
  if (jl && method === 'GET') {
    const job = await env.DB.prepare("SELECT id FROM jobs WHERE id = ? AND user_id = ? AND status = 'done'").bind(jl[1], user.id).first<any>();
    if (!job) throw new HttpError(404, 'Video chưa dựng xong.');
    return json({ url: await shareLink(env, new URL(req.url).origin, job.id) });
  }
  if (path === '/api/plans' || path.startsWith('/api/orders')) {
    if (vis(env.config, 'feature:plans') !== 'on') throw new HttpError(403, 'Gói cước đang tắt.');
    return planRoutes(req, env, rc, user, path, method);
  }
  if (path === '/api/projects' && method === 'GET') {
    const r = await env.DB.prepare(
      `SELECT p.id, p.title, p.updated_at, json_extract(p.spec, '$.ratio') AS ratio, json_extract(p.spec, '$.style') AS style, json_extract(p.spec, '$.mode') AS mode,
         (SELECT status FROM jobs j WHERE j.project_id = p.id ORDER BY created_at DESC LIMIT 1) AS last_job,
         (SELECT progress FROM jobs j WHERE j.project_id = p.id ORDER BY created_at DESC LIMIT 1) AS last_progress,
         (SELECT id FROM jobs j WHERE j.project_id = p.id AND j.status = 'done' ORDER BY created_at DESC LIMIT 1) AS done_job,
         (SELECT 1 FROM community c WHERE c.project_id = p.id LIMIT 1) AS shared
       FROM projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC LIMIT 200`,
    ).bind(user.id).all();
    return json({ projects: r.results });
  }

  // live "what kind of video is this" while the user types (free, rules only)
  if (path === '/api/intent' && method === 'POST') {
    rc.quiet = true;
    const it = detectIntent(String((await body<any>(req, 25_000)).text || '').slice(0, 20000));
    return json({ format: it.format, niche: it.niche, formatName: FORMAT_NAMES[it.format], nicheName: NICHE_NAMES[it.niche], style: FORMAT_STYLE[it.format] || NICHE_STYLE[it.niche], hook: it.hook, cta: it.cta });
  }

  if (path === '/api/projects/generate' && method === 'POST') {
    const b = await body<any>(req, 40_000);
    return json(await createProject(env, rc, user, b, devAllowed));
  }

  const m = path.match(/^\/api\/projects\/([a-f0-9]{24})(\/[a-z-]+)?$/);
  if (m) {
    const id = m[1], sub = m[2] || '';
    const p = await getProject(env, user, id);
    if (!sub && method === 'GET') return json({ id, spec: p.spec, updated_at: p.updated_at });
    if (!sub && method === 'PUT') {
      const saveRequest = await body<any>(req);
      let input = saveRequest.spec;
      if (input?.voice) input.voice = voiceFor(env.config, input.voice.voiceId, input.voice.speed);
      // a documentary is paid when it is created; other formats can be switched freely
      if (input?.look === 'doc' && p.spec.look !== 'doc') throw new HttpError(403, 'Phim tài liệu cần tạo video mới (tính credit riêng).');
      if (p.spec.look === 'doc' && input?.look !== 'doc') throw new HttpError(403, 'Không đổi phim tài liệu sang định dạng khác; hãy tạo video mới.');
      if (input?.look && input.look !== p.spec.look && LOOKS.includes(input.look)) {
        if (vis(env.config, 'look:' + input.look) !== 'on') throw new HttpError(403, 'Định dạng này đang tắt.');
        const c = composeLook({ look: input.look, scenes: (input.scenes || []).map((sc: any) => ({ lines: sc.lines || [] })), sides: undefined, chatName: undefined });
        input = { ...input, scenes: c.scenes, sides: c.sides, chatName: c.chatName, cast: c.cast, skin: undefined };
      }
      const spec = cleanSpec(input, user.id);
      await saveSpec(env, user, id, spec, typeof saveRequest.expectedUpdatedAt === 'number' ? saveRequest.expectedUpdatedAt : undefined);
      rc.log('project.save', { projectId: id, data: { scenes: spec.scenes.length, style: spec.style, ratio: spec.ratio, subtitles: spec.subtitles } });
      return json({ id, spec });
    }
    if (sub === '/browser-audio' && method === 'POST') {
      await checkAllowed(env, user, p.spec);
      const b = await body<any>(req, 1000);
      return browserVoice(env, rc, user, id, p.spec, b.scene);
    }
    if (sub === '/review-direction' && method === 'POST') {
      if (p.spec.look !== 'director') throw new HttpError(400, 'Rà soát hình dành cho chế độ AI đạo diễn.');
      await requireBudget(env, 'AI rà soát bản dựng');
      const b = await body<any>(req, 2_500_000);
      // Return a proposal only. Applying it uses the normal validated save route.
      if (b.updatedAt !== p.updated_at) throw new HttpError(409, 'Video đã thay đổi. Tải lại trước khi rà soát.');
      await useQuota(env, user.id, 'script', (await limitsFor(env, user.id)).script);
      try {
        const r = await reviewDirectionFrames(env, Array.isArray(b.frames) ? b.frames : [], p.spec.scenes, env.config.defaults.textAI as TextProvider);
        rc.log('ai.review', { projectId: id, cost: aiCost(env.config, r._usage), data: r._usage });
        return json({ scenes: r.scenes, notes: r.notes });
      } catch (e) { await refundQuota(env, user.id, 'script'); throw e; }
    }
    if (!sub && method === 'DELETE') {
      const jobs = await env.DB.prepare('SELECT id FROM jobs WHERE project_id = ?').bind(id).all<any>();
      for (const j of jobs.results) await deleteVideo(env, user.id, j.id);
      await env.DB.prepare('DELETE FROM jobs WHERE project_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').bind(id, user.id).run();
      await closeDocProject(env, rc, id);
      rc.log('project.delete', { projectId: id, data: { title: p.title } });
      return json({ ok: true });
    }
    if (sub === '/duplicate' && method === 'POST') {
      if (vis(env.config, 'feature:duplicate') !== 'on') throw new HttpError(403, 'Tính năng nhân bản đang tắt.');
      const b = await body<any>(req, 500);
      const spec = { ...p.spec };
      if (b.ratio === '9:16' || b.ratio === '16:9') spec.ratio = b.ratio;
      spec.title = (p.spec.title + (spec.ratio !== p.spec.ratio ? (spec.ratio === '16:9' ? ' (ngang)' : ' (dọc)') : ' (bản sao)')).slice(0, 100);
      const clean = cleanSpec(spec, user.id), nid = randomId(12), now = Date.now();
      await env.DB.prepare('INSERT INTO projects (id, user_id, title, spec, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(nid, user.id, clean.title, JSON.stringify(clean), now, now).run();
      rc.log('project.duplicate', { projectId: nid, data: { from: id, ratio: clean.ratio } });
      return json({ id: nid });
    }
    if (sub === '/revise' && method === 'POST') {
      if (!p.spec.creative) throw new HttpError(409,'Hãy tạo một dự án bằng mô tả sáng tạo để dùng yêu cầu chỉnh sửa.');
      const b = await body<any>(req,10000), feedback = String(b.feedback || '').trim().slice(0,1200);
      if (feedback.length < 5) throw new HttpError(400,'Hãy mô tả điều bạn muốn chỉnh.');
      if (b.updatedAt !== p.updated_at) throw new HttpError(409,'Dự án đã thay đổi. Tải lại trước khi yêu cầu AI.');
      await checkSource(env,user,'mine-ai');
      await requireBudget(env,'AI chỉnh sửa video');
      await useQuota(env,user.id,'script',(await limitsFor(env,user.id)).script);
      try {
        const creative = {...p.spec.creative, wish:p.spec.creative.wish+'\nCÁC GÓP Ý TRƯỚC: '+JSON.stringify(p.spec.creative.feedback || [])+'\nGÓP Ý MỚI: '+feedback};
        const out = await writeScript(env,env.config.defaults.textAI as TextProvider,{topic:'',seconds:0,tone:'',ratio:p.spec.ratio,visual:'sketch',scenes:p.spec.scenes.map((s:any)=>s.lines),creative,creativeRuntime:{styles:env.config.enabledStyles,renderMode:env.config.rendering.mode},extra:env.config.promptExtra});
        const plan=creativeResult(out);
        if(!env.config.enabledStyles.includes(out.style))throw new HttpError(422,'AI chọn phong cách đang tắt. Hãy yêu cầu một hướng khác.');
        const spec=cleanSpec({...p.spec,mode:out.mode,style:out.style,palette:out.palette,transition:out.transition,scenes:p.spec.scenes.map((s:any,i:number)=>({...out.scenes[i],lines:s.lines})),creative:{...p.spec.creative,...plan,feedback:[...(p.spec.creative.feedback||[]),feedback]}},user.id,'creative');
        rc.log('ai.revise',{projectId:id,cost:aiCost(env.config,out._usage),data:{scenes:spec.scenes.length}});
        return json({spec,updatedAt:p.updated_at});
      } catch(e) {await refundQuota(env,user.id,'script');throw e;}
    }
    if (sub === '/compose' && method === 'POST') {
      const si = Number((await body<any>(req, 1_000)).scene);
      const sc = p.spec.scenes[si];
      if (!sc) throw new HttpError(400, 'Không tìm thấy cảnh.');
      creationChoice({ source: 'mine-ai', look: p.spec.look || 'classic-sketch' });
      await checkSource(env, user, 'mine-ai');
      await requireBudget(env, 'AI thiết kế lại cảnh');
      await useQuota(env, user.id, 'script', (await limitsFor(env, user.id)).script);
      let out: any;
      try {
        out = await writeScript(env, env.config.defaults.textAI as TextProvider, { topic: '', seconds: 0, tone: '', ratio: p.spec.ratio, visual: 'sketch', scenes: [sc.lines], look: p.spec.look, creative: p.spec.creative, creativeRuntime:{styles:env.config.enabledStyles,renderMode:env.config.rendering.mode}, extra: env.config.promptExtra });
        const issues = designIssues({ scenes: [{ ...out.scenes?.[0], lines: sc.lines }] }, p.spec.look, 1, !!p.spec.creative);
        if (issues.length) throw new HttpError(502, 'AI chưa thiết kế được cảnh đạt yêu cầu. Cảnh cũ được giữ nguyên.');
      } catch (e) { await refundQuota(env, user.id, 'script'); throw e; }
      if(p.spec.creative && p.spec.mode==='kinetic' && out.scenes[0].diagram?.items?.some((it:any)=>it.t==='vector'))p.spec.mode=out.mode;
      p.spec.scenes[si] = { ...sc, diagram: out.scenes[0].diagram, x: out.scenes[0].x, panels: [] };
      const spec = cleanSpec(p.spec, user.id, p.spec.creative ? 'creative' : true);
      await saveSpec(env, user, id, spec, p.updated_at);
      rc.log('ai.scene', { projectId: id, cost: aiCost(env.config, out._usage), data: { scene: si } });
      return json({ spec });
    }
    if (sub === '/image' && method === 'POST') {
      const b = await body<any>(req, 2_000);
      const sc = p.spec.scenes[Number(b.scene)], panel = sc?.panels[Number(b.panel)];
      if (!panel) throw new HttpError(400, 'Không tìm thấy khung hình.');
      if (!panel.prompt) throw new HttpError(400, 'Khung hình chưa có mô tả để vẽ.');
      if (vis(env.config, 'feature:imageAI') !== 'on') throw new HttpError(403, 'Tranh AI đang tắt. Hãy dùng bảng vẽ tự do.');
      const provider: ImageProvider = (b.provider === 'openai' || b.provider === 'gemini') && vis(env.config, 'ai:' + b.provider) === 'on' ? b.provider : (env.config.defaults.imageAI as ImageProvider);
      const base = `img/${user.id}/${(await sha256(provider + '\n' + (p.spec.look==='illustrated'?'cartoon:':'') + panel.prompt)).slice(0, 24)}`;
      let key = (await env.BUCKET.head(base + '.webp')) ? base + '.webp' : (await env.BUCKET.head(base + '.png')) ? base + '.png' : '';
      const docLook = p.spec.look === 'doc';
      if (!key) {
        if (docLook) {
          if (!(await useDocImage(env, id))) throw new HttpError(402, 'Phim tài liệu này đã dùng hết lượt vẽ ảnh đã trả. Tạo video mới hoặc dùng lại ảnh đã vẽ.', { needCredits: true });
        } else {
          await requireBudget(env, 'vẽ tranh AI');
          await useQuota(env, user.id, 'image', (await limitsFor(env, user.id)).image);
        }
        try {
          const t0 = Date.now();
          const img = await drawImage(env, provider, panel.prompt, p.spec.look==='illustrated'?'cartoon':docLook ? 'photo' : 'line', p.spec.ratio !== '16:9');
          key = `${base}.${img.ext}`;
          await env.BUCKET.put(key, img.bytes, { httpMetadata: { contentType: img.type } });
          rc.log('ai.image', { projectId: id, ms: Date.now() - t0, cost: imageCost(env.config, provider), data: { provider, bytes: img.bytes.length, prompt: panel.prompt } });
        } catch (e: any) { if (docLook) await giveBackDocImage(env, id); else await refundQuota(env, user.id, 'image'); rc.log('ai.image', { projectId: id, ok: false, data: { provider, error: e.message } }); throw e; }
      }
      panel.image = 'r2:' + key;
      await saveSpec(env, user, id, p.spec);
      return json({ image: panel.image, spec: p.spec });
    }
    if (sub === '/render' && method === 'POST') return json({ job: await queueRender(env, rc, user, id, p.spec) });
    if (sub === '/jobs' && method === 'GET') {
      const r = await env.DB.prepare(`SELECT jobs.id, status, progress, error, created_at, started_at, finished_at, jp.phase, jp.message, jp.updated_at AS heartbeat_at,
        (SELECT 1 FROM community c WHERE c.job_id = jobs.id) AS shared FROM jobs LEFT JOIN job_progress jp ON jp.job_id = jobs.id
        WHERE project_id = ? ORDER BY created_at DESC LIMIT 10`).bind(id).all();
      const queued = await env.DB.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued'").first<any>();
      return json({ jobs: r.results, queueLength: queued.n });
    }
  }

  // a frame of the finished video (made by the render machine), for the video list
  const th = path.match(/^\/api\/jobs\/([a-f0-9]{24})\/thumb$/);
  if (th && method === 'GET') {
    rc.quiet = true;
    const obj = await env.BUCKET.get(`thumb/${user.id}/${th[1]}.jpg`);
    if (!obj) throw new HttpError(404, 'Chưa có ảnh.');
    return new Response(obj.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400' } });
  }
  const f = path.match(/^\/api\/jobs\/([a-f0-9]{24})\/(video|srt)$/);
  if (f && method === 'GET') {
    const job = await env.DB.prepare("SELECT id FROM jobs WHERE id = ? AND user_id = ? AND status = 'done'").bind(f[1], user.id).first();
    if (!job) throw new HttpError(404, 'Video chưa sẵn sàng.');
    const ext = f[2] === 'video' ? 'mp4' : 'srt';
    if (ext === 'mp4' && new URL(req.url).searchParams.get('inline') === '1') {
      // watching in the page: streamed with seeking, logged once (not every range request)
      if (!req.headers.get('range') || /^bytes=0-/.test(req.headers.get('range') || '')) rc.log('video.play', { data: { job: f[1] } }); else rc.quiet = true;
      return serveObject(env, req, await storedVideoKey(env, user.id, f[1], 'mp4'), 'video/mp4', { 'cache-control': 'private, max-age=3600', 'content-disposition': 'inline' });
    }
    const obj = await env.BUCKET.get(await storedVideoKey(env, user.id, f[1], ext));
    if (!obj) throw new HttpError(404, 'Không tìm thấy tệp.');
    rc.log('video.download', { data: { job: f[1], kind: f[2] } });
    return new Response(obj.body, { headers: {
      'content-type': ext === 'mp4' ? 'video/mp4' : 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="net-ve-${f[1].slice(0, 8)}.${ext}"`,
      'cache-control': 'private, no-store',
    } });
  }

  const a = path.match(/^\/api\/assets\/(img\/([^/]+)\/[a-f0-9]{24}\.(?:png|jpg|webp))$/);
  if (a && method === 'GET') {
    if (a[2] !== user.id) throw new HttpError(404, 'Không tìm thấy.');
    const obj = await env.BUCKET.get(a[1]);
    if (!obj) throw new HttpError(404, 'Không tìm thấy.');
    return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'image/png', 'cache-control': 'private, max-age=86400' } });
  }

  if (path === '/api/uploads' && method === 'POST') return upload(req, env, rc, user);
  if (path === '/api/credits') return creditRoutes(req, env, rc, user, method);
  const md = path.match(/^\/api\/media\/(up\/([^/]+)\/[a-f0-9]{24}\.(?:png|jpg|webp))$/);
  if (md && method === 'GET') {
    if (md[2] !== user.id) throw new HttpError(404, 'Không tìm thấy.');
    rc.quiet = true;
    const obj = await env.BUCKET.get(md[1]);
    if (!obj) throw new HttpError(404, 'Không tìm thấy.');
    return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'image/png', 'cache-control': 'private, max-age=31536000, immutable' } });
  }
  const js = path.match(/^\/api\/jobs\/([a-f0-9]{24})\/share$/);
  if (js && method === 'POST') return shareToCommunity(req, env, rc, user, js[1]);
  if (path === '/api/styles' && method === 'GET') return json({ styles: STYLES });
  throw new HttpError(404, 'Không tìm thấy.');
}

// ---- render machines: pull a job, fetch assets, upload the result. Auth: Bearer RUNNER_TOKEN.
export async function runner(req: Request, env: XEnv, sub: string, rc: Rc): Promise<Response> {
  const auth = req.headers.get('authorization') || '';
  if (!env.RUNNER_TOKEN || env.RUNNER_TOKEN.length < 32 || !timingSafeEqual(auth, `Bearer ${env.RUNNER_TOKEN}`)) throw new HttpError(401, 'Không có quyền.');
  const now = Date.now();

  // voice keys entered on the admin page (sent only to the render machine, over HTTPS, with its token)
  if (sub === 'config' && req.method === 'GET') return json({ env: await runnerSecrets(env) });
  if (sub === 'claim' && req.method === 'POST') {
    const cb = await body<any>(req, 1_000);
    const name = String(cb.runner || 'runner').slice(0, 60);
    if (cb.caps) await recordRunnerCaps(env, cb.caps);
    const lease = 'lease-' + randomId(16);
    await env.DB.prepare("UPDATE jobs SET status = 'queued', runner = NULL WHERE status = 'running' AND started_at < ?").bind(now - STALE_JOB_MS).run();
    const job = await env.DB.prepare(
      `UPDATE jobs SET status = 'running', started_at = ?, runner = ?, progress = 0
       WHERE id = (SELECT id FROM jobs WHERE status = 'queued' AND COALESCE(json_extract(spec,'$.look'),'') NOT IN ('whiteboard','illustrated') ORDER BY created_at LIMIT 1) AND status = 'queued'
       RETURNING id, spec, user_id, project_id, created_at`,
    ).bind(now, lease).first<any>();
    if (!job) { rc.quiet = true; return json({ job: null }); }
    rc.userId = job.user_id;
    rc.log('render.start', { projectId: job.project_id, data: { job: job.id, runner: name, waitedSec: Math.round((now - job.created_at) / 1000) } });
    return json({ job: { id: job.id, lease, spec: JSON.parse(job.spec) } });
  }
  if (sub === 'asset' && req.method === 'GET') {
    const key = new URL(req.url).searchParams.get('key') || '';
    if (!/^((img|up)\/[^/]+\/[a-f0-9]{24}\.(png|jpg|webp)|voice\/[\w-]+\/[a-f0-9]{24}\.(mp3|m4a|wav))$/.test(key)) throw new HttpError(400, 'Khoá tệp không hợp lệ.');
    const obj = await env.BUCKET.get(key);
    if (!obj) throw new HttpError(404, 'Không tìm thấy.');
    return new Response(obj.body);
  }
  const m = sub.match(/^jobs\/([a-f0-9]{24})\/(progress|video|srt|thumb|done|fail)$/);
  if (!m) throw new HttpError(404, 'Không tìm thấy.');
  const expectedMethod = m[2] === 'video' || m[2] === 'srt' || m[2] === 'thumb' ? 'PUT' : 'POST';
  if (req.method !== expectedMethod) throw new HttpError(405, 'Không hỗ trợ.');
  const lease = req.headers.get('x-nv-lease') || '';
  const job = await env.DB.prepare("SELECT id, user_id, project_id, created_at, spec, runner, status FROM jobs WHERE id = ? AND runner = ?").bind(m[1], lease).first<any>();
  // Acknowledging a terminal action is idempotent if its first response was lost.
  if (job && ((m[2] === 'done' && job.status === 'done') || (m[2] === 'fail' && job.status === 'failed'))) return json({ ok: true });
  if (!job || job.status !== 'running') throw new HttpError(409, 'Việc này không còn ở trạng thái đang dựng.');
  rc.userId = job.user_id;
  if (m[2] === 'progress') {
    const update = await body<any>(req, 1_000);
    const pct = Math.max(0, Math.min(99, Math.round(Number(update.progress) || 0)));
    const changed = await env.DB.prepare("UPDATE jobs SET progress = ?, started_at = ? WHERE id = ? AND status = 'running' AND runner = ?").bind(pct, now, job.id, lease).run();
    if (!changed.meta.changes) throw new HttpError(409, 'Lượt dựng đã hết hạn.');
    const phase = ['preparing','images','voice','rendering','uploading'].includes(update.phase) ? update.phase : 'rendering';
    await env.DB.prepare(`INSERT INTO job_progress (job_id, phase, message, updated_at) SELECT ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM jobs WHERE id = ? AND status = 'running' AND runner = ?)
      ON CONFLICT(job_id) DO UPDATE SET phase = excluded.phase, message = excluded.message, updated_at = excluded.updated_at`)
      .bind(job.id, phase, String(update.message || '').slice(0, 160), now, job.id, lease).run();
    return json({ ok: true });
  }
  if (m[2] === 'thumb') {
    if (Number(req.headers.get('content-length')) > 600_000) throw new HttpError(413, 'Ảnh quá lớn.');
    await env.BUCKET.put(`thumb/${job.user_id}/${job.id}.jpg`, req.body, { httpMetadata: { contentType: 'image/jpeg' } });
    return json({ ok: true });
  }
  if ((m[2] === 'video' || m[2] === 'srt') && req.method === 'PUT') {
    const ext = m[2] === 'video' ? 'mp4' : 'srt';
    await env.BUCKET.put(videoKey(job.user_id, job.id, ext, lease), req.body, { httpMetadata: { contentType: ext === 'mp4' ? 'video/mp4' : 'text/plain' } });
    return json({ ok: true });
  }
  if (m[2] === 'done') {
    if (!(await env.BUCKET.head(videoKey(job.user_id, job.id, 'mp4', lease))) || !(await env.BUCKET.head(videoKey(job.user_id, job.id, 'srt', lease)))) throw new HttpError(400, 'Chưa tải đủ video và phụ đề lên.');
    const changed = await env.DB.prepare("UPDATE jobs SET status = 'done', progress = 100, finished_at = ? WHERE id = ? AND status = 'running' AND runner = ?").bind(now, job.id, lease).run();
    if (!changed.meta.changes) throw new HttpError(409, 'Lượt dựng đã hết hạn.');
    // the runner reports how long the render took and how much was read aloud
    const r = await body<any>(req, 5_000).catch(() => ({}));
    const spec = JSON.parse(job.spec), provider = String(r.voice || spec.voice?.provider || '');
    // a chosen voice that could not be used was read by its stand-in: tell the admin page
    if (provider.includes('→')) await recordVoiceFallback(env, provider, String(r.voiceError || ''));
    // the voice read for real again: it is no longer shown as failing
    else if (provider === 'everai') await clearVoiceFallback(env);
    const chars = Number(r.chars) || spec.scenes.reduce((n: number, sc: any) => n + sc.lines.join(' ').length, 0);
    rc.log('render.done', { projectId: job.project_id, ms: (Number(r.seconds) || 0) * 1000, cost: r.cachedVoice ? 0 : voiceCost(env.config, provider, chars),
      data: { job: job.id, videoSec: r.duration, renderSec: r.seconds, totalSec: Math.round((now - job.created_at) / 1000), voice: provider, chars, cachedVoice: !!r.cachedVoice } });
    await afterJob(env, rc, job, true, '', Number(r.duration) || 0);
    return json({ ok: true });
  }
  if (m[2] === 'fail') {
    const error = String((await body(req, 5_000)).error || 'Dựng video thất bại.').slice(0, 300);
    const changed = await env.DB.prepare("UPDATE jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ? AND status = 'running' AND runner = ?").bind(error, now, job.id, lease).run();
    if (!changed.meta.changes) throw new HttpError(409, 'Lượt dựng đã hết hạn.');
    await refundQuota(env, job.user_id, 'render');
    rc.log('render.fail', { ok: false, projectId: job.project_id, data: { job: job.id, error } });
    await afterJob(env, rc, job, false, error);
    return json({ ok: true });
  }
  throw new HttpError(405, 'Không hỗ trợ.');
}

/** Finished video through a signed link (sent by Zalo): plays in the browser, no login. */
async function shareVideo(env: XEnv, rc: Rc, jobId: string, url: URL) {
  if (!(await checkShare(env, jobId, Number(url.searchParams.get('e')), url.searchParams.get('s') || ''))) throw new HttpError(403, 'Link đã hết hạn. Gõ TT trong Zalo để lấy link mới.');
  const job = await env.DB.prepare("SELECT user_id, project_id FROM jobs WHERE id = ? AND status = 'done'").bind(jobId).first<any>();
  if (!job) throw new HttpError(404, 'Video không còn.');
  const obj = await env.BUCKET.get(await storedVideoKey(env, job.user_id, jobId, 'mp4'));
  if (!obj) throw new HttpError(404, 'Video không còn.');
  rc.userId = job.user_id; rc.channel = 'zalo';
  rc.log('video.download', { projectId: job.project_id, data: { job: jobId, kind: 'share' } });
  return new Response(obj.body, { headers: { 'content-type': 'video/mp4', 'content-disposition': `inline; filename="video-${jobId.slice(0, 8)}.mp4"`, 'cache-control': 'private, max-age=3600' } });
}

/** After a render: tell the user where they asked to be told (Zalo). */
async function afterJob(env: XEnv, rc: Rc, job: any, ok: boolean, error = '', seconds = 0) {
  // the user's phone or computer first (no third party), then Zalo for those who linked it
  try {
    const title = JSON.parse(job.spec).title || 'Video';
    const r = await pushUser(env, job.user_id, ok ? { title: 'Video đã xong ✓', body: `"${title}" đã dựng xong. Bấm để xem và tải về.`, url: `/#/p/${job.project_id}` }
      : { title: 'Video chưa dựng được', body: `"${title}": ${String(error).slice(0, 120)}`, url: `/#/p/${job.project_id}` }, 'mailto:' + env.config.legal.email);
    if (r.devices) rc.log('push.notify', { projectId: job.project_id, data: { job: job.id, done: ok, ...r } });
  } catch (e: any) { rc.log('push.notify', { ok: false, data: { error: e.message } }); }
  try { await notifyJob(env, rc, job, ok, error, seconds); } catch (e: any) { rc.log('zalo.notify', { ok: false, data: { error: e.message } }); }
}

/** Voice picked in the editor: its provider comes from the admin's voice list. */
function voiceFor(config: Config, voiceId: unknown, speed: unknown) {
  const usable = config.voices.filter((x) => (config.visibility['voice:' + x.code] || 'on') === 'on');
  const v = usable.find((x) => x.code === voiceId) || usable.find((x) => x.code === config.defaults.voice) || usable[0] || config.voices[0];
  return { provider: v.provider, voiceId: v.code, speed: Number(speed) || 1 };
}

/** New project from a topic or the user's own script (web and Zalo share this). */
export async function createProject(env: XEnv, rc: Rc, user: User, b: any, devAllowed = false) {
    b = creationChoice(b);
    const D = env.config.defaults;
    // a format made on the training page: its built-in base plus the extra brief (test stage: admins only)
    let brief: string | undefined;
    if (typeof b.look === 'string' && b.look.startsWith('f:')) {
      const f = env.config.formats.find((x) => 'f:' + x.id === b.look);
      if (!f || f.stage === 'idea' || (f.stage === 'test' && !(await isAdmin(env, env.config, user)))) throw new HttpError(403, 'Định dạng này chưa mở.');
      b = { ...b, look: f.base };
      brief = (env.config.briefs[f.base] || LOOK_BRIEF[f.base]) + `\nĐỊNH DẠNG RIÊNG "${f.name}": ${f.brief}`;
    }
    if (!brief && typeof b.look === 'string' && env.config.briefs[b.look]) brief = env.config.briefs[b.look];
    const source = ['topic', 'mine-ai', 'mine-free'].includes(b.source) ? b.source : D.source;
    if (!env.config.enabledSources.includes(source)) throw new HttpError(403, vis(env.config, 'source:' + source) === 'dev' ? 'Cách tạo này đang phát triển, sắp ra mắt.' : 'Cách tạo video này đang tắt.');
    await checkSource(env, user, source);
    const text = String(b.topic || '').trim().slice(0, source === 'topic' ? 3000 : 20000);
    if (text.length < 5) throw new HttpError(400, source === 'topic' ? 'Nhập chủ đề (ít nhất vài chữ).' : 'Dán kịch bản của bạn vào ô (ít nhất một câu).');
    // options the admin hid or marked "in development" are never used, whatever the page sent
    const on = (k: string) => vis(env.config, k) === 'on';
    // "tự động đa dạng": the words choose how the video is drawn, never the user's last way twice
    if (b.look === 'auto' && on('look:director')) b = { ...b, look: 'director' };
    if (b.look === 'auto') b = { ...b, ...(await autoLook(env, user, text, on)) };
    const visual = ['doodle', 'sketch', 'images', 'diagram', 'mix'].includes(b.visual) && on('visual:' + b.visual) ? b.visual : D.visual;
    const ratio = (b.ratio === '16:9' || b.ratio === '9:16') && on('ratio:' + b.ratio) ? b.ratio : D.ratio;
    // which AI writes and draws is the admin's choice (Quản trị → Cài đặt), not the visitor's
    if (b.provider !== 'mock') b.provider = undefined;
    // what kind of video the words ask for (the user may override it)
    const intent = detectIntent(text);
    const format = FORMATS.includes(b.format) ? b.format : intent.format;
    const niche = NICHES.includes(b.niche) ? b.niche : intent.niche;
    let raw: any, note = '', usage: any = null;
    // reference character and affiliate product: the user's uploaded pictures
    const media: Record<string, string> = {};
    if (b.character && on('feature:character')) media.nv = String(b.character);
    const aff = b.affiliate && on('feature:affiliate') && /^https?:\/\/\S{3,300}$/.test(String(b.affiliate.link || ''))
      ? { link: String(b.affiliate.link), product: String(b.affiliate.product || '').slice(0, 80), price: String(b.affiliate.price || '').slice(0, 30), image: b.affiliate.image ? (media.sp = String(b.affiliate.image), 'sp') : undefined } : null;
    let mode = ['hand', 'motion', 'math', 'kinetic'].includes(b.mode) && on('mode:' + b.mode) ? b.mode : on('mode:' + D.mode) ? D.mode : 'hand';
    // video format: new videos use one unless the page asked for the classic hand-drawn board (look: "")
    const look: string | undefined = b.look === '' || b.look === 'classic' ? undefined : LOOKS.includes(b.look) && on('look:' + b.look) ? b.look : b.look === undefined && on('look:' + D.look) ? D.look : undefined;
    if (b.look && LOOKS.includes(b.look) && !on('look:' + b.look)) throw new HttpError(403, 'Định dạng video này đang tắt.');
    if(look==='illustrated'&&['mine-free','template'].includes(source))throw new HttpError(409,'Phong cách nhiều lớp cần AI thiết kế cảnh. Chọn Kịch bản của tôi + AI minh họa; lời đọc của bạn được giữ nguyên.');
    const recentDirections: string[] = [];
    // the user's last looks, so the AI gives each new video its own identity
    const recentStyles: string[] = [];
    if (b.creative) {
      const recent = await env.DB.prepare('SELECT spec FROM projects WHERE user_id = ? ORDER BY created_at DESC LIMIT 4').bind(user.id).all<any>();
      for (const row of recent.results || []) { try { const st = JSON.parse(row.spec).style; if (st && !recentStyles.includes(st)) recentStyles.push(st); } catch {} }
    }
    if (look === 'director') {
      const recent = await env.DB.prepare('SELECT spec FROM projects WHERE user_id = ? ORDER BY created_at DESC LIMIT 5').bind(user.id).all<any>();
      for (const row of recent.results || []) { try { const p = JSON.parse(row.spec); if (p.look === 'director') recentDirections.push(p.scenes.map((s: any) => s.direction?.composition || '').join(',')); } catch {} }
    }
    const illustratedExtra=look==='illustrated'&&b.illustratedCharacter?'\nYÊU CẦU NHÂN VẬT/CHỦ THỂ CỦA KHÁCH: '+String(b.illustratedCharacter).slice(0,800):'';
    // the documentary is paid first (plan allowance or credits); given back if the script fails
    const chargeRef = look === 'doc' ? 'doc-' + randomId(8) : '';
    if (look === 'doc') await chargeDoc(env, rc, user, chargeRef);
    try {
    if (source !== 'topic') {
      // the user's own words, split into scenes; pictures are designed by rules (free) or by the AI
      const scenes = splitScript(text);
      if (!scenes.length) throw new HttpError(400, 'Không tách được câu nào từ kịch bản.');
      raw = { title: scenes[0][0].replace(/[.!?…]+$/, '').slice(0, 70), scenes: scenes.map((lines) => ({ lines })) };
      if (source === 'mine-ai') {
        await requireBudget(env, 'AI thiết kế cảnh');
        const provider = isTextProvider(b.provider) ? b.provider : (D.textAI as TextProvider);
        await useQuota(env, user.id, 'script', (await limitsFor(env, user.id)).script);
        try {
          const out = await writeScript(env, provider, { topic: '', seconds: 0, tone: '', ratio, visual: 'sketch', extra: env.config.promptExtra+illustratedExtra, scenes, format, niche, look, brief, recentDirections, creative: b.creative, creativeRuntime:{styles:env.config.enabledStyles,renderMode:env.config.rendering.mode,recent:recentStyles} });
          usage = out._usage;
          // the narration always stays the user's own words
          raw = { ...out, title: out.title || raw.title, scenes: scenes.map((lines, i) => ({ lines, direction: out.scenes?.[i]?.direction, diagram: out.scenes?.[i]?.diagram, x: out.scenes?.[i]?.x, act: out.scenes?.[i]?.act, pause: out.scenes?.[i]?.pause, panels: out.scenes?.[i]?.panels })) };
        } catch (e: any) {
          await refundQuota(env, user.id, 'script');
          rc.log('ai.design.failed', { ok: false, data: { source, error: String(e.message).slice(0, 200) } });
          if (e.status === 422) throw e;
          throw new HttpError(502, 'AI chưa hoàn thành thiết kế đạt yêu cầu. Nội dung của bạn được giữ trong ô nhập; hãy thử lại hoặc điều chỉnh mô tả. Không tạo bản dựng theo mẫu thay thế.');
        }
      }
    } else {
      const provider: TextProvider | 'mock' = b.provider === 'mock' && devAllowed ? 'mock' : isTextProvider(b.provider) ? b.provider : (D.textAI as TextProvider);
      const seconds = Math.max(15, Math.min(env.config.limits.maxSeconds, (await planOf(env, user.id)).plan.maxSeconds, Number(b.seconds) || D.seconds));
      if (provider === 'mock') raw = sampleScript(text);
      else {
        await requireBudget(env, 'AI viết kịch bản');
        await useQuota(env, user.id, 'script', (await limitsFor(env, user.id)).script);
        try {
          raw = await writeScript(env, provider, { topic: text, seconds, tone: String(b.tone || '').slice(0, 200), ratio, visual, extra: env.config.promptExtra + affiliateBrief(aff)+illustratedExtra, format: aff ? 'sales' : format, niche, look, brief, recentDirections, creative: b.creative, creativeRuntime:{styles:env.config.enabledStyles,renderMode:env.config.rendering.mode,recent:recentStyles} });
          usage = raw._usage;
        } catch (e) { await refundQuota(env, user.id, 'script'); throw e; }
      }
    }
    const problems = designIssues(raw, look, source === 'mine-ai' ? splitScript(text).length : undefined, !!b.creative);
    if (problems.length) throw new HttpError(502, 'Thiết kế AI chưa đạt: ' + problems.slice(0, 3).join('; ') + '. Chưa tạo dự án; hãy thử lại.');
    if(look==='illustrated'&&raw.scenes?.some((s:any)=>!s.x?.illustrated?.layers?.length))throw new HttpError(502,'AI chưa thiết kế đủ các lớp. Kịch bản của bạn vẫn ở ô nhập; hãy thử thiết kế lại.');
    const creativePlan = b.creative ? creativeResult(raw) : undefined;
    if (b.creative) {
      mode = raw.mode;

    }
    const autoStyle = FORMAT_STYLE[format as keyof typeof FORMAT_STYLE] || NICHE_STYLE[niche as keyof typeof NICHE_STYLE];
    // each kind of animation has a look made for it; "auto" picks it (or the one for the topic)
    const modeStyle = ({ motion: 'cosmos', math: 'manim', kinetic: 'bold' } as Record<string, string>)[mode];
    const auto = modeStyle && env.config.enabledStyles.includes(modeStyle) ? modeStyle : autoStyle;
    const style = b.creative ? raw.style : env.config.enabledStyles.includes(b.style) ? b.style : (b.style === 'auto' || !b.style) && env.config.enabledStyles.includes(auto) ? auto : D.style;
    if (aff && raw.scenes?.length && !look) raw.scenes = [...raw.scenes, affiliateScene(aff, ratio === '9:16')];
    if (!look && visual === 'doodle') {
      // classic hand drawing: one picture per line (an Open Doodle or the video's hand-drawn person acting the words), revealed by the hand; no subtitles unless asked
      const panels = doodlePanels((raw.scenes || []).map((sc: any) => sc.lines || []));
      raw = { ...raw, scenes: (raw.scenes || []).map((sc: any, i: number) => ({ lines: sc.lines, panels: panels[i] })) };
    }
    if (look) {
      // fill what the AI (or nobody) gave: free rules per format
      const c = composeLook({ look, recentDirections: recentDirections.flatMap((x) => x.split(',')), scenes: (raw.scenes || []).map((sc: any) => ({ lines: sc.lines || [], x: sc.x, pause: sc.pause, panels: sc.panels, act: sc.act, direction: sc.direction })), sides: raw.sides, chatName: raw.chatName, cast: raw.cast });
      raw = { ...raw, scenes: c.scenes, sides: c.sides, chatName: c.chatName, cast: c.cast };
    }
    const music = b.music === 'none' ? undefined : (env.config.music.find((m) => m.id === b.music) || (b.music === undefined || b.music === 'auto'
      ? (D.music === 'none' ? undefined : env.config.music.find((m) => m.id === D.music) || env.config.music[hashText(text) % Math.max(1, env.config.music.length)]) : undefined))?.file;
    const spec: any = cleanSpec({ ...raw, audio:b.audio, creative: b.creative ? {...b.creative, ...creativePlan} : undefined, format: aff ? 'sales' : format, niche, visual, ratio, subtitles: typeof b.subtitles === 'boolean' ? b.subtitles : D.subtitles,
      style: !look && visual === 'doodle' && (!b.style || b.style === 'auto') && env.config.enabledStyles.includes('notebook') ? 'notebook' : style, tool: b.tool, channel: b.channel ?? D.channel, episode: b.episode, mode, media, character: media.nv ? 'nv' : undefined, affiliate: aff,
      voice: voiceFor(env.config, b.voiceId, Number(b.speed) || 1), look, skin: b.skin, music, sfx: b.sfx !== false }, user.id, b.creative ? 'creative' : true);
    const wantIntro = typeof b.intro === 'boolean' ? b.intro : D.intro;
    if (wantIntro && !['director','whiteboard','illustrated'].includes(look||'') && on('feature:intro')) spec.intro = introFor(spec);
    if (usage) rc.log('ai.script', { cost: aiCost(env.config, usage), data: { source, format, niche, ...usage } });
    const id = randomId(12), now = Date.now();
    await env.DB.prepare('INSERT INTO projects (id, user_id, title, spec, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, user.id, spec.title, JSON.stringify(spec), now, now).run();
    if (look === 'doc') await openDocProject(env, id, user.id, chargeRef);
    rc.log('project.create', { projectId: id, data: { look, source, format, niche, style: spec.style, mode, intro: !!spec.intro, character: !!spec.character, affiliate: !!spec.affiliate, ratio, visual, scenes: spec.scenes.length, chars: text.length, via: rc.channel, note: note || undefined } });
  return { id, spec, note };
    } catch (e) { if (chargeRef) await refundDoc(env, rc, user.id, chargeRef); throw e; }
}

/**
 * How a video is told when the user leaves it to us: dialogue → characters acting, figures →
 * hand-drawn charts, otherwise a sketchnote or doodle pictures; the way of the user's previous
 * video is skipped when another one fits, so a channel does not look the same every time.
 */
export async function autoLook(env: XEnv, user: User, text: string, on: (k: string) => boolean): Promise<{ look: string; visual?: string }> {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const talk = lines.filter((l) => /^[-–—•]\s|^[\p{L} ]{2,16}:\s|^[“"]/u.test(l)).length;
  const figures = (text.match(/\d+([.,]\d+)?\s*(%|phần trăm|triệu|nghìn|tỷ|đ\b|k\b|lần)/giu) || []).length;
  const ways: { look: string; visual?: string }[] = [];
  if (talk >= 2 && on('look:act')) ways.push({ look: 'act' });
  if (figures >= 3 && on('visual:diagram')) ways.push({ look: '', visual: 'diagram' });
  for (const w of [{ look: '', visual: 'sketch' }, { look: '', visual: 'doodle' }, ...(on('look:act') ? [{ look: 'act' }] : [])]) if ((w.look !== '' || on('visual:' + w.visual)) && !ways.some((x) => x.look === w.look && x.visual === w.visual)) ways.push(w);
  const last = await env.DB.prepare('SELECT spec FROM projects WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(user.id).first<any>().catch(() => null);
  let prev: any = null; try { prev = last ? JSON.parse(last.spec) : null; } catch {}
  const same = (w: { look: string; visual?: string }) => prev && (w.look ? prev.look === w.look : !prev.look && prev.visual === w.visual);
  return ways.find((w) => !same(w)) || ways[0] || { look: '' };
}

const hashText = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; };

/** Put a project in the render queue and wake the render machine. */
export async function queueRender(env: XEnv, rc: Rc, user: User, id: string, spec: any) {
  if(env.config.rendering.mode==='browser')throw new HttpError(409,'Đang dùng máy dựng trình duyệt. Mở dự án trên website và bấm Xuất video tại đó.');
  if(spec.look==='whiteboard')assertWhiteboard(spec);
  if(spec.look==='illustrated')assertIllustrated(spec);
  const missing = spec.scenes.reduce((n: number, sc: any) => n + sc.panels.filter((x: any) => !/^(r2|doodle|peep):/.test(String(x.image))).length, 0);
  if (missing) throw new HttpError(409, `Còn ${missing} khung chưa có tranh AI. Bấm "Vẽ tất cả bằng AI" hoặc đổi cảnh đó sang bảng vẽ.`);
  await checkAllowed(env, user, spec);
  const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM jobs WHERE user_id = ? AND status IN ('queued','running')").bind(user.id).first<any>();
  if (active.n >= MAX_ACTIVE_JOBS) throw new HttpError(429, 'Bạn đang có video chờ dựng. Đợi xong rồi dựng tiếp nhé.');
  // a paid voice that would break the spending cap becomes the basic voice (this render only)
  spec = { ...spec };
  const note = await fitVoiceToBudget(env, spec);
  if (note) rc.log('budget.voice', { projectId: id, data: { note } });
  await useQuota(env, user.id, 'render', (await limitsFor(env, user.id)).render);
  const jobId = randomId(12);
  try {
    const inserted = await env.DB.prepare(`INSERT INTO jobs (id, project_id, user_id, status, spec, created_at)
      SELECT ?, ?, ?, 'queued', ?, ? WHERE (SELECT COUNT(*) FROM jobs WHERE user_id = ? AND status IN ('queued','running')) < ?`)
      .bind(jobId, id, user.id, JSON.stringify({ ...spec, _via: rc.channel }), Date.now(), user.id, MAX_ACTIVE_JOBS).run();
    if (!inserted.meta.changes) throw new HttpError(429, 'Bạn đang có video chờ dựng. Đợi xong rồi dựng tiếp nhé.');
  } catch (error) { await refundQuota(env, user.id, 'render'); throw error; }
  if(env.config.rendering.mode==='cloud')rc.wait((spec.look==='illustrated'?startIllustrated(env):spec.look==='whiteboard'?startWhiteboard(env):startRunner(env)).catch((e) => { rc.log('render.trigger', { ok: false, data: { error: String(e.message || e) } }); }));
  rc.log('render.queue', { projectId: id, data: { job: jobId, scenes: spec.scenes.length, chars: spec.scenes.reduce((n: number, sc: any) => n + sc.lines.join(' ').length, 0), voice: spec.voice, style: spec.style, via: rc.channel } });
  return { id: jobId, status: 'queued', progress: 0, note };
}

function affiliateBrief(a: { product?: string; price?: string } | null) {
  return a ? `\nĐây là video tiếp thị liên kết cho sản phẩm "${a.product || 'sản phẩm'}"${a.price ? ` (giá ${a.price})` : ''}: nêu vấn đề người xem gặp, lợi ích cụ thể của sản phẩm, bằng chứng/cảm nhận, rồi kêu gọi mua. Trung thực, không phóng đại, không hứa hẹn sai sự thật.` : '';
}

/** Offline script for local development (DEV_LOGIN only): no AI key needed. */
function sampleScript(topic: string) {
  return {
    title: topic.slice(0, 60),
    caption: 'Bạn đang ở bước nào trong 3 bước này? Bình luận một con số nhé.',
    hashtags: ['#thoiquen', '#phattrienbanthan', '#taichinhcanhan'],
    scenes: [
      { lines: ['Bạn bận rộn cả ngày mà cuối năm vẫn đứng yên?', 'Điều thứ ba sẽ khiến bạn bất ngờ.'], panels: [{ prompt: 'a busy person running in circles' }] },
      { lines: ['Gửi mười triệu, lãi tám phần trăm, ba mươi năm sau thành hơn trăm triệu.'], diagram: { kind: 'bars', title: 'Sức mạnh lãi kép', start: '10tr', values: [21.6, 46.6, 100.6], labels: ['10 năm', '20 năm', '30 năm'], unit: 'tr' } },
      { lines: ['Hết tiền thì vay, vay thì trả lãi, trả lãi lại hết tiền.'], diagram: { kind: 'flow', title: 'Vòng lặp nghèo', items: ['Hết tiền', 'Vay nóng', 'Trả lãi', 'Lại hết tiền'] } },
      { lines: ['Người làm theo cảm hứng và người làm theo thói quen khác nhau thế nào?'], diagram: { kind: 'compare', title: 'Hai kiểu người', left: 'Cảm hứng', right: 'Thói quen', leftNote: 'Làm vài hôm rồi bỏ', rightNote: 'Đều đặn dù không hứng' } },
      { lines: ['Người đều đặn cứ thế đi tới, và một ngày bạn sẽ thấy mình về đích.'], diagram: { kind: 'stick', title: 'Đi đều', actors: [{ action: 'walk', label: 'Bạn' }, { action: 'cheer', label: 'Đích' }], bubble: 'Mỗi ngày một chút!', caption: 'Chậm mà chắc' } },
      { lines: ['Bắt đầu bằng ba bước.'], diagram: { kind: 'steps', title: '3 bước nhỏ', items: ['Chọn một việc 15 phút', 'Gắn vào việc có sẵn', 'Đánh dấu mỗi ngày'] } },
      { lines: ['Lưu video này lại, tối nay làm bước một nhé.'], diagram: { kind: 'statement', text: 'Nhỏ nhưng đều thắng lớn nhưng bỏ dở' } },
    ],
  };
}
