import {hunterAdmin} from './hunter.ts';
import {councilAdmin} from './council.ts';
import {inkAdmin} from './ink.ts';
import {solutionAdmin} from './solutions.ts';
import {feedAdmin} from './image-feed.ts';
import {googleFeedAdmin} from './feed-google.ts';
import {ownerAdmin} from './zalo-owners.ts';
import {feedTestAdmin} from './feed-test.ts';
import {bridgeAdmin} from './feed-apps-script.ts';
// Admin API: settings, users, activity log, analytics. Every route here is admin-only
// (checked in worker.ts before dispatch) and every change is itself logged.
import { aiCost } from './log.ts';
import { analyzeSample, checkGateway, clearDown, downState, LOOK_BRIEF, planNotes, textPlan, type TextProvider } from './ai.ts';
import { setVoiceFallback, testEverAI, testVoice, voiceCatalog, voiceFallbackAllowed, voiceStatus, voicesWithStatus } from './voices.ts';
import type { User } from './auth.ts';
import { clearCache, effectiveEnv, isAdmin, save as saveSettings, secretStatus, SECRET_NAMES } from './settings.ts';
import { testKey } from './key-test.ts';
import { body, type Env, HttpError, json, today } from './util.ts';
import type { Rc, XEnv } from './worker.ts';
import { connectWebhook, zaloAdmin } from './zalo.ts';
import { plansAdmin } from './plans.ts';
import { communityAdmin, uploadSite } from './media.ts';
import { queueRender } from './worker.ts';
import { budgetState } from './budget.ts';
import { creditsAdmin } from './credits.ts';

const DAY = 86_400_000, TZ = 7 * 3_600_000; // days are counted in Vietnam time

/** Filters shared by the log list and its CSV export. */
function eventFilter(url: URL) {
  const q = url.searchParams, where: string[] = [], args: unknown[] = [];
  const add = (sql: string, ...v: unknown[]) => { where.push(sql); args.push(...v); };
  if (q.get('user')) add('e.user_id = ?', q.get('user'));
  if (q.get('email')) add('u.email LIKE ?', '%' + q.get('email')!.toLowerCase() + '%');
  if (q.get('visitor')) add('e.visitor = ?', q.get('visitor'));
  if (q.get('project')) add('e.project_id = ?', q.get('project'));
  if (q.get('type')) add('e.type LIKE ?', q.get('type')!.replace(/\*/g, '%'));
  if (q.get('channel')) add('e.channel = ?', q.get('channel'));
  if (q.get('ok') === '0') add('e.ok = 0');
  if (q.get('q')) add('(e.path LIKE ? OR e.data LIKE ?)', '%' + q.get('q') + '%', '%' + q.get('q') + '%');
  if (q.get('from')) add('e.ts >= ?', Date.parse(q.get('from')!) - TZ);
  if (q.get('to')) add('e.ts < ?', Date.parse(q.get('to')!) - TZ + DAY);
  if (q.get('before')) add('e.id < ?', Number(q.get('before')));
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}

export async function adminRoutes(req: Request, env: XEnv, rawEnv: Env, sub: string, method: string, rc: Rc, admin: User): Promise<Response> {
  const url = new URL(req.url);
  const council=await councilAdmin(req,env,sub,admin,rc);if(council)return council;
  const ink=await inkAdmin(req,env,sub,rc);if(ink)return ink;
  const solution=await solutionAdmin(req,env,rc,sub);if(solution)return solution;
  const owners=await ownerAdmin(req,env,sub);if(owners)return owners;
  const feedTest=await feedTestAdmin(req,env,admin,sub);if(feedTest)return feedTest;
  const bridge=await bridgeAdmin(req,env,sub);if(bridge)return bridge;
  const google=await googleFeedAdmin(req,env,admin,sub);if(google)return google;
  const feed=await feedAdmin(req,env,sub);if(feed)return feed;
  const hunter=await hunterAdmin(req,env,rc,sub);if(hunter)return hunter;

  if (sub === 'renders' && method === 'GET') {
    const jobs = await env.DB.prepare(`SELECT j.id, j.project_id, j.user_id, j.status, j.progress, j.error, j.created_at, j.started_at, j.finished_at,
      p.title, u.email, jp.phase, jp.message, jp.updated_at AS heartbeat_at FROM jobs j
      LEFT JOIN projects p ON p.id = j.project_id LEFT JOIN users u ON u.id = j.user_id LEFT JOIN job_progress jp ON jp.job_id = j.id
      ORDER BY j.created_at DESC LIMIT 100`).all<any>();
    const counts = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM jobs GROUP BY status').all<any>();
    return json({ jobs: jobs.results, counts: Object.fromEntries(counts.results.map((row) => [row.status, row.n])) });
  }
  const retryJob = sub.match(/^renders\/([a-f0-9]{24})\/retry$/);
  if (retryJob && method === 'POST') {
    const row = await env.DB.prepare("SELECT j.*, u.email, u.name FROM jobs j JOIN users u ON u.id = j.user_id WHERE j.id = ? AND j.status = 'failed'").bind(retryJob[1]).first<any>();
    if (!row) throw new HttpError(409, 'Chỉ thử lại video đã dựng thất bại.');
    if (await env.DB.prepare('SELECT 1 FROM blocked_users WHERE user_id = ?').bind(row.user_id).first()) throw new HttpError(403, 'Tài khoản đang bị khóa.');
    const job = await queueRender(env, rc, { id: row.user_id, email: row.email, name: row.name, picture: null }, row.project_id, JSON.parse(row.spec));
    rc.log('admin.render.retry', { projectId: row.project_id, data: { previous: row.id, job: job.id } });
    return json({ job });
  }

  if (sub === 'site-media' && method === 'POST') return uploadSite(req, env, rc);
  if (sub === 'budget' && method === 'GET') {
    const state = await budgetState(env, true);
    const top = await env.DB.prepare('SELECT type, COUNT(*) AS n, ROUND(SUM(cost)) AS cost FROM events WHERE cost > 0 AND ts > ? GROUP BY type ORDER BY cost DESC LIMIT 10').bind(Date.now() - 30 * 86_400_000).all<any>();
    return json({ ...state, top: top.results });
  }
  if (sub === 'settings' && method === 'GET') return json({ config: env.config, secrets: await secretStatus(rawEnv), briefs: LOOK_BRIEF });
  // training page: AI reads a sample (frames taken in the admin's browser + notes) and proposes a format
  if (sub === 'train/analyze' && method === 'POST') {
    const b = await body<any>(req, 6_000_000);
    const frames = (Array.isArray(b.frames) ? b.frames : []).filter((f: unknown) => typeof f === 'string' && f.length < 1_500_000).slice(0, 6);
    const out = await analyzeSample(env, frames, String(b.notes || '').slice(0, 2000), env.config.defaults.textAI === 'openai' ? 'openai' : 'gemini').catch((e) => {
      // every model's answer, so the log says which key or model is the problem
      rc.log('admin.train', { ok: false, data: { frames: frames.length, error: String(e.message).slice(0, 200), tried: e.extra?.tried } }); throw e; });
    rc.log('admin.train', { cost: aiCost(env.config, { model: '', tokensIn: out._usage.tokensIn, tokensOut: out._usage.tokensOut }), data: { frames: frames.length, base: out.base } });
    return json(out);
  }
  if (sub === 'ai/check' && method === 'GET') {
    // one gateway (?p=gemini|openai|ollama) or the fallback plan (?p=plan); every model is asked a
    // tiny JSON question so the page shows which ones answer, how fast, and why the others do not
    const which = new URL(req.url).searchParams.get('p') || 'plan';
    if (which === 'plan') return json({ order: planNotes(env, env.config.defaults.textAI as TextProvider), plan: textPlan(env, env.config.defaults.textAI as TextProvider).map(([p, m]) => ({ provider: p, model: m })), paused: downState() });
    if (!['gemini', 'openai', 'ollama'].includes(which)) throw new HttpError(400, 'Cổng không hợp lệ.');
    clearDown();
    return json(await checkGateway(env, which as TextProvider));
  }
  if (sub === 'voices/test' && method === 'POST') {
    // one voice read for real (the admin hears the sample right away); no voice given = the EverAI key check
    const b = await body<any>(req, 500), code = String(b.code || '').trim(), provider = String(b.provider || 'everai');
    if (!code) { const r = await testEverAI(env); rc.log('admin.voice.test', { ok: r.ok, data: { error: r.error } }); return json(r); }
    if (!/^[A-Za-z0-9_-]{3,60}$/.test(code)) throw new HttpError(400, 'Mã giọng không hợp lệ.');
    const r = await testVoice(env, provider, code);
    rc.log('admin.voice.test', { ok: r.ok, data: { provider, code, error: r.error } });
    let audio = ''; if (r.audio) { let bin = ''; for (let i = 0; i < r.audio.length; i += 0x8000) bin += String.fromCharCode(...r.audio.subarray(i, i + 0x8000)); audio = btoa(bin); }
    return json({ ok: r.ok, ms: r.ms, error: r.error, audio });
  }
  if (sub === 'keys/test' && method === 'POST') {
    const b = await body<any>(req, 4_000), name = String(b.name || '');
    if (!(SECRET_NAMES as readonly string[]).includes(name)) throw new HttpError(400, 'Khoá không hợp lệ.');
    const r = await testKey(env, name, String(b.value || ''), new URL(req.url).origin);
    rc.log('admin.key.test', { ok: r.ok, data: { name, typed: !!b.value, detail: r.detail.slice(0, 200) } });
    return json(r);
  }
  if (sub === 'voices/catalog' && method === 'GET') return json(await voiceCatalog(env, new URL(req.url).searchParams.get('p') || 'everai'));
  if (sub === 'voices/fallback' && method === 'PUT') { const b = await body<any>(req, 100); await setVoiceFallback(env, b.on === true); return json({ ok: true }); }
  if (sub === 'voices' && method === 'GET') return json({ status: await voiceStatus(env), voices: await voicesWithStatus(env), fallback: await voiceFallbackAllowed(env) });
  if (sub === 'settings' && method === 'PUT') {
    // the whole configuration travels each time (templates, assistant knowledge, trained formats…): room to grow
    const b = await body<any>(req, 1_000_000);
    const before = env.config;
    const config = await saveSettings(rawEnv, b.config, b.secrets || {});
    clearDown(); // a new key or model gets a fresh chance at once
    clearCache();
    // which sections changed, and which keys were set or removed (never their values)
    const changed = Object.keys(config).filter((k) => JSON.stringify((config as any)[k]) !== JSON.stringify((before as any)[k]));
    const keys = Object.entries(b.secrets || {}).map(([k, v]) => `${k}:${v === null ? 'xoá' : v ? 'đặt' : ''}`).filter((x) => !x.endsWith(':'));
    rc.log('admin.settings', { data: { changed, keys } });
    // webhook mode: register it with Zalo right away (choosing the mode alone used to leave the bot deaf)
    let zalo: any = null;
    const fresh = await effectiveEnv(rawEnv);
    if (fresh.config.zalo.enabled && fresh.config.zalo.receive !== 'poll' && (fresh as any).ZALO_BOT_TOKEN && url.protocol === 'https:') {
      try { zalo = await connectWebhook(fresh, rc, url.origin); } catch (e: any) { zalo = { ok: false, error: e.message }; }
    }
    return json({ config, secrets: await secretStatus(rawEnv), zalo });
  }

  // ---- analytics overview
  if (sub === 'overview' && method === 'GET') {
    const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days')) || 30));
    const since = Date.now() - days * DAY;
    const one = async (sql: string, ...a: unknown[]) => (await env.DB.prepare(sql).bind(...a).first<any>()) || {};
    const all = async (sql: string, ...a: unknown[]) => (await env.DB.prepare(sql).bind(...a).all<any>()).results;
    const [users, active, totals, series, funnel, formats, niches, sources, styles, errors, slow, jobs] = await Promise.all([
      one('SELECT COUNT(*) AS all_users, SUM(created_at >= ?) AS new_users FROM users', since),
      one("SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE ts >= ? AND user_id IS NOT NULL", since),
      one(`SELECT SUM(type = 'project.create') AS projects, SUM(type = 'render.done') AS renders, SUM(type = 'render.fail') AS failed,
             SUM(type = 'ai.script') AS scripts, SUM(type = 'ai.image') AS images, SUM(ok = 0) AS errors, ROUND(SUM(CASE WHEN cost > 0 THEN cost ELSE 0 END)) AS cost,
             AVG(CASE WHEN type = 'render.done' THEN json_extract(data, '$.totalSec') END) AS avg_total_sec,
             SUM(type = 'zalo.message') AS zalo
           FROM events WHERE ts >= ?`, since),
      all(`SELECT (ts + ${TZ}) / ${DAY} AS d, COUNT(DISTINCT user_id) AS active, SUM(type = 'auth.login') AS logins, SUM(type = 'project.create') AS projects,
             SUM(type = 'render.done') AS renders, SUM(type = 'render.fail') AS failed, SUM(ok = 0) AS errors, ROUND(SUM(CASE WHEN cost > 0 THEN cost ELSE 0 END)) AS cost
           FROM events WHERE ts >= ? GROUP BY d ORDER BY d`, since),
      one(`SELECT COUNT(DISTINCT CASE WHEN type = 'ui.view' THEN COALESCE(visitor, user_id) END) AS visitors,
             COUNT(DISTINCT CASE WHEN type = 'auth.login' THEN user_id END) AS logged_in,
             COUNT(DISTINCT CASE WHEN type = 'project.create' THEN user_id END) AS created,
             COUNT(DISTINCT CASE WHEN type = 'render.queue' THEN user_id END) AS rendered,
             COUNT(DISTINCT CASE WHEN type = 'render.done' THEN user_id END) AS got_video,
             COUNT(DISTINCT CASE WHEN type = 'video.download' THEN user_id END) AS downloaded
           FROM events WHERE ts >= ?`, since),
      all("SELECT json_extract(data, '$.format') AS k, COUNT(*) AS n FROM events WHERE type = 'project.create' AND ts >= ? GROUP BY k ORDER BY n DESC", since),
      all("SELECT json_extract(data, '$.niche') AS k, COUNT(*) AS n FROM events WHERE type = 'project.create' AND ts >= ? GROUP BY k ORDER BY n DESC", since),
      all("SELECT json_extract(data, '$.source') AS k, COUNT(*) AS n FROM events WHERE type = 'project.create' AND ts >= ? GROUP BY k ORDER BY n DESC", since),
      all("SELECT json_extract(data, '$.style') AS k, COUNT(*) AS n FROM events WHERE type = 'project.create' AND ts >= ? GROUP BY k ORDER BY n DESC", since),
      all("SELECT COALESCE(path, type) AS k, COUNT(*) AS n, MAX(ts) AS last FROM events WHERE ok = 0 AND ts >= ? GROUP BY k ORDER BY n DESC LIMIT 12", since),
      all("SELECT path AS k, COUNT(*) AS n, ROUND(AVG(ms)) AS avg_ms, MAX(ms) AS max_ms FROM events WHERE type = 'api' AND ts >= ? GROUP BY path ORDER BY avg_ms DESC LIMIT 10", since),
      one("SELECT SUM(status = 'queued') AS queued, SUM(status = 'running') AS running FROM jobs"),
    ]);
    const secrets = await secretStatus(rawEnv);
    const setup = [
      { k: 'Đăng nhập Google', ok: !!env.GOOGLE_CLIENT_ID },
      { k: 'AI viết (Gemini, OpenAI hoặc Ollama)', ok: !!(secrets.GEMINI_API_KEY || secrets.OPENAI_API_KEY || env.config.models.ollamaUrl), note: 'Không bắt buộc: chế độ miễn phí vẫn chạy' },
      { k: 'Giọng đọc (EverAI / Google)', ok: !!(secrets.EVERAI_API_KEY || secrets.GOOGLE_TTS_API_KEY) || !!env.config.voices.find((v) => v.provider === 'free'), note: 'Không có khoá thì dùng giọng máy miễn phí' },
      { k: 'Máy dựng tự bật (Cloud Run)', ok: !!(env.GCP_TRIGGER_KEY && env.GCP_PROJECT) },
      { k: 'Zalo Bot', ok: !!(env.config.zalo.enabled && (secrets as any).ZALO_BOT_TOKEN) },
      { k: 'Thanh toán chuyển khoản', ok: !!(env.config.payment.enabled && env.config.payment.account) },
    ];
    return json({ days, users, active: active.n || 0, totals, series, funnel, formats, niches, sources, styles, errors, slow, jobs, setup });
  }

  // ---- activity log
  if (sub === 'events' && method === 'GET') {
    const f = eventFilter(url);
    const rows = (await env.DB.prepare(
      `SELECT e.*, u.email FROM events e LEFT JOIN users u ON u.id = e.user_id ${f.sql} ORDER BY e.id DESC LIMIT 200`,
    ).bind(...f.args).all<any>()).results;
    const types = (await env.DB.prepare('SELECT type, COUNT(*) AS n FROM events WHERE ts >= ? GROUP BY type ORDER BY n DESC').bind(Date.now() - 30 * DAY).all<any>()).results;
    return json({ events: rows, types });
  }
  if (sub === 'events.csv' && method === 'GET') {
    const f = eventFilter(url);
    const rows = (await env.DB.prepare(
      `SELECT e.id, e.ts, u.email, e.user_id, e.visitor, e.channel, e.type, e.path, e.ok, e.ms, e.cost, e.project_id, e.data, e.ip
       FROM events e LEFT JOIN users u ON u.id = e.user_id ${f.sql} ORDER BY e.id DESC LIMIT 20000`,
    ).bind(...f.args).all<any>()).results;
    const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = ['id', 'thoi_gian', 'email', 'user_id', 'visitor', 'kenh', 'loai', 'duong_dan', 'ok', 'ms', 'chi_phi_vnd', 'du_an', 'chi_tiet', 'ip'];
    const lines = rows.map((r) => [r.id, new Date(r.ts + TZ).toISOString().replace('T', ' ').slice(0, 19), r.email, r.user_id, r.visitor, r.channel, r.type, r.path, r.ok, r.ms, r.cost, r.project_id, r.data, r.ip].map(cell).join(','));
    rc.log('admin.export', { data: { rows: rows.length, filter: url.search } });
    return new Response('﻿' + [head.join(','), ...lines].join('\n'), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="nhat-ky-${today()}.csv"`, 'cache-control': 'no-store' },
    });
  }

  // ---- users
  if (sub === 'users' && method === 'GET') {
    const r = await env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.created_at,
         (SELECT MAX(ts) FROM events e WHERE e.user_id = u.id) AS last_seen,
         (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS projects,
         (SELECT COUNT(*) FROM jobs j WHERE j.user_id = u.id AND j.status = 'done') AS videos,
         (SELECT COALESCE(SUM(n), 0) FROM usage g WHERE g.user_id = u.id AND g.day = ? AND g.kind IN ('script','image','render')) AS today,
         (SELECT ROUND(COALESCE(SUM(CASE WHEN cost > 0 THEN cost END), 0)) FROM events e WHERE e.user_id = u.id) AS cost,
         (SELECT plan FROM user_plans up WHERE up.user_id = u.id AND up.expires_at > ?) AS plan,
         (SELECT balance FROM credits cr WHERE cr.user_id = u.id) AS credits,
         EXISTS (SELECT 1 FROM blocked_users b WHERE b.user_id = u.id) AS blocked,
         EXISTS (SELECT 1 FROM zalo_links z WHERE z.user_id = u.id) AS zalo
       FROM users u ORDER BY u.created_at DESC LIMIT 1000`,
    ).bind(today(), Date.now()).all();
    const jobs = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM jobs WHERE created_at > ? GROUP BY status').bind(Date.now() - 7 * DAY).all<any>();
    return json({ users: r.results, jobs7d: Object.fromEntries(jobs.results.map((j) => [j.status, j.n])) });
  }
  const u = sub.match(/^users\/([A-Za-z0-9_-]{1,80})$/);
  if (u && method === 'GET') {
    const id = u[1];
    const user = await env.DB.prepare('SELECT id, email, name, created_at, EXISTS(SELECT 1 FROM blocked_users b WHERE b.user_id=users.id) AS blocked FROM users WHERE id = ?').bind(id).first<any>();
    if (!user) throw new HttpError(404, 'Không tìm thấy người dùng.');
    const [projects, jobs, events, usage, money, plan] = await Promise.all([
      env.DB.prepare('SELECT id, title, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50').bind(id).all<any>(),
      env.DB.prepare('SELECT id, project_id, status, error, created_at, finished_at FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(id).all<any>(),
      env.DB.prepare('SELECT id, ts, channel, type, path, ok, ms, cost, project_id, data FROM events WHERE user_id = ? ORDER BY id DESC LIMIT 300').bind(id).all<any>(),
      env.DB.prepare('SELECT day, kind, n FROM usage WHERE user_id = ? ORDER BY day DESC LIMIT 60').bind(id).all<any>(),
      env.DB.prepare("SELECT ROUND(COALESCE(SUM(CASE WHEN cost > 0 THEN cost END), 0)) AS cost, COUNT(*) AS events, SUM(ok = 0) AS errors FROM events WHERE user_id = ?").bind(id).first<any>(),
      env.DB.prepare('SELECT plan, expires_at FROM user_plans WHERE user_id = ?').bind(id).first<any>(),
    ]);
    const credit=await env.DB.prepare('SELECT balance FROM credits WHERE user_id=?').bind(user.id).first<{balance:number}>();
    return json({ user:{...user,credits:credit?.balance||0}, projects: projects.results, jobs: jobs.results, events: events.results, usage: usage.results, totals: money, plan });
  }
  const cr = sub.match(/^users\/([A-Za-z0-9_-]{1,80})\/credits$/);
  if (cr && method === 'POST') return creditsAdmin(req, env, rc, cr[1]);
  const b = sub.match(/^users\/([A-Za-z0-9_-]{1,80})\/block$/);
  if (b && method === 'POST') {
    const on = !!(await body<any>(req, 1_000)).blocked;
    if (on) {
      const target = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(b[1]).first<any>();
      if (b[1] === admin.id || (await isAdmin(env, env.config, { id: b[1], email: target?.email || '', name: null, picture: null })))
        throw new HttpError(400, 'Không thể khoá tài khoản quản trị.');
      await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO blocked_users (user_id, blocked_at) VALUES (?, ?)').bind(b[1], Date.now()),
        env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(b[1]),
      ]);
    } else await env.DB.prepare('DELETE FROM blocked_users WHERE user_id = ?').bind(b[1]).run();
    rc.log('admin.block', { data: { user: b[1], blocked: on } });
    return json({ ok: true });
  }

  if (sub.startsWith('community')) { const r = await communityAdmin(req, env, sub, method, rc); if (r) return r; }
  if (sub.startsWith('zalo')) return zaloAdmin(req, env, rawEnv, sub, method, rc);
  if (sub.startsWith('plans') || sub.startsWith('orders') || sub.startsWith('grant')) return plansAdmin(req, env, sub, method, rc);
  throw new HttpError(404, 'Không tìm thấy.');
}
