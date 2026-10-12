// Nét Vẽ Studio API (Cloudflare Worker). Static pages are served from ./public.
import { consumeNonce, currentUser, endSession, newNonce, startSession, User, verifyGoogleToken } from './auth.ts';
import { drawImage, ImageProvider, TextProvider, writeScript } from './ai.ts';
import { startRunner } from './gcp.ts';
import { cleanSpec, STYLES } from './spec.ts';
import { body, Env, HttpError, json, randomId, refundQuota, sha256, timingSafeEqual, today, useQuota } from './util.ts';

const MAX_ACTIVE_JOBS = 2;
const STALE_JOB_MS = 45 * 60_000;

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(req, env, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Máy chủ gặp lỗi, thử lại sau ít phút.' }, 500);
    }
  },
  // Safety net: if videos wait in the queue (e.g. a start request was lost), start the render machine.
  async scheduled(_e: ScheduledController, env: Env, ctx: ExecutionContext) {
    const waiting = await env.DB.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued' AND created_at < ?").bind(Date.now() - 90_000).first<any>();
    if (waiting?.n) ctx.waitUntil(startRunner(env).catch((e) => console.error(e)));
  },
};

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url), path = url.pathname, method = req.method;
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(req);
  if (path.startsWith('/api/runner/')) return runner(req, env, path.slice('/api/runner/'.length));

  // Browser requests that change data must come from our own page (CSRF guard on top of SameSite cookies).
  if (method !== 'GET') {
    const origin = req.headers.get('origin');
    if (req.headers.get('x-nv') !== '1' || (origin && origin !== url.origin)) throw new HttpError(403, 'Yêu cầu không hợp lệ.');
  }
  const devAllowed = env.DEV_LOGIN === '1' && ['localhost', '127.0.0.1'].includes(url.hostname);

  // ---- sign-in
  if (path === '/api/auth/config' && method === 'GET') {
    return json({ clientId: env.GOOGLE_CLIENT_ID || null, nonce: env.GOOGLE_CLIENT_ID ? await newNonce(env) : null, dev: devAllowed });
  }
  if (path === '/api/auth/google' && method === 'POST') {
    if (!env.GOOGLE_CLIENT_ID) throw new HttpError(503, 'Chủ trang chưa cấu hình đăng nhập Google.');
    const b = await body<{ credential?: string; nonce?: string }>(req, 20_000);
    await consumeNonce(env, String(b.nonce || ''));
    const u = await verifyGoogleToken(String(b.credential || ''), env.GOOGLE_CLIENT_ID, String(b.nonce));
    return json({ user: u }, 200, { 'set-cookie': await startSession(env, u) });
  }
  if (path === '/api/auth/dev' && method === 'POST') {
    if (!devAllowed) throw new HttpError(404, 'Không tìm thấy.');
    const email = String((await body(req)).email || 'dev@localhost').toLowerCase().slice(0, 100);
    const u = { id: 'dev-' + (await sha256(email)).slice(0, 16), email, name: 'Người thử', picture: null };
    return json({ user: u }, 200, { 'set-cookie': await startSession(env, u) });
  }
  if (path === '/api/auth/logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': await endSession(env, req) });

  const user = await currentUser(env, req);
  if (!user) throw new HttpError(401, 'Bạn cần đăng nhập.');
  return userRoutes(req, env, ctx, user, path, method, devAllowed);
}

const limits = (env: Env) => ({ script: Number(env.DAILY_SCRIPTS), image: Number(env.DAILY_IMAGES), render: Number(env.DAILY_RENDERS) });

async function getProject(env: Env, user: User, id: string) {
  const p = await env.DB.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').bind(id, user.id).first<any>();
  if (!p) throw new HttpError(404, 'Không tìm thấy dự án.');
  return { ...p, spec: JSON.parse(p.spec) };
}
async function saveSpec(env: Env, user: User, id: string, spec: any) {
  await env.DB.prepare('UPDATE projects SET spec = ?, title = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .bind(JSON.stringify(spec), spec.title, Date.now(), id, user.id).run();
}

async function userRoutes(req: Request, env: Env, ctx: ExecutionContext, user: User, path: string, method: string, devAllowed: boolean): Promise<Response> {
  if (path === '/api/me' && method === 'GET') {
    const used = await env.DB.prepare('SELECT kind, n FROM usage WHERE user_id = ? AND day = ?').bind(user.id, today()).all<any>();
    return json({ user, limits: limits(env), used: Object.fromEntries(used.results.map((r) => [r.kind, r.n])), ai: { gemini: !!env.GEMINI_API_KEY, openai: !!env.OPENAI_API_KEY } });
  }

  if (path === '/api/projects' && method === 'GET') {
    const r = await env.DB.prepare(
      `SELECT p.id, p.title, p.updated_at,
         (SELECT status FROM jobs j WHERE j.project_id = p.id ORDER BY created_at DESC LIMIT 1) AS last_job
       FROM projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC LIMIT 100`,
    ).bind(user.id).all();
    return json({ projects: r.results });
  }

  if (path === '/api/projects/generate' && method === 'POST') {
    const b = await body<any>(req, 10_000);
    const topic = String(b.topic || '').trim().slice(0, 3000);
    if (topic.length < 5) throw new HttpError(400, 'Nhập chủ đề hoặc nội dung (ít nhất vài chữ).');
    const provider: TextProvider | 'mock' = b.provider === 'openai' ? 'openai' : b.provider === 'mock' && devAllowed ? 'mock' : 'gemini';
    const seconds = Math.max(15, Math.min(180, Number(b.seconds) || 45));
    let raw: any;
    if (provider === 'mock') raw = sampleScript(topic);
    else {
      await useQuota(env, user.id, 'script', limits(env).script);
      try { raw = await writeScript(env, provider, { topic, seconds, tone: String(b.tone || '').slice(0, 200), ratio: b.ratio, visual: ['images', 'diagram'].includes(b.visual) ? b.visual : 'mix' }); }
      catch (e) { await refundQuota(env, user.id, 'script'); throw e; }
    }
    const spec = cleanSpec({ ...raw, visual: b.visual, ratio: b.ratio, style: b.style, tool: b.tool, channel: b.channel, episode: b.episode, voice: { provider: 'everai', voiceId: b.voiceId, speed: Number(b.speed) || 1 } }, user.id);
    const id = randomId(12), now = Date.now();
    await env.DB.prepare('INSERT INTO projects (id, user_id, title, spec, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, user.id, spec.title, JSON.stringify(spec), now, now).run();
    return json({ id, spec });
  }

  const m = path.match(/^\/api\/projects\/([a-f0-9]{24})(\/[a-z]+)?$/);
  if (m) {
    const id = m[1], sub = m[2] || '';
    const p = await getProject(env, user, id);
    if (!sub && method === 'GET') return json({ id, spec: p.spec, updated_at: p.updated_at });
    if (!sub && method === 'PUT') {
      const spec = cleanSpec((await body<any>(req)).spec, user.id);
      await saveSpec(env, user, id, spec);
      return json({ id, spec });
    }
    if (!sub && method === 'DELETE') {
      const jobs = await env.DB.prepare('SELECT id FROM jobs WHERE project_id = ?').bind(id).all<any>();
      for (const j of jobs.results) await env.BUCKET.delete([`video/${user.id}/${j.id}.mp4`, `video/${user.id}/${j.id}.srt`]);
      await env.DB.prepare('DELETE FROM jobs WHERE project_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').bind(id, user.id).run();
      return json({ ok: true });
    }
    if (sub === '/image' && method === 'POST') {
      const b = await body<any>(req, 2_000);
      const sc = p.spec.scenes[Number(b.scene)], panel = sc?.panels[Number(b.panel)];
      if (!panel) throw new HttpError(400, 'Không tìm thấy khung hình.');
      if (!panel.prompt) throw new HttpError(400, 'Khung hình chưa có mô tả để vẽ.');
      const provider: ImageProvider = b.provider === 'openai' ? 'openai' : 'gemini';
      const base = `img/${user.id}/${(await sha256(provider + '\n' + panel.prompt)).slice(0, 24)}`;
      let key = (await env.BUCKET.head(base + '.webp')) ? base + '.webp' : (await env.BUCKET.head(base + '.png')) ? base + '.png' : '';
      if (!key) {
        await useQuota(env, user.id, 'image', limits(env).image);
        try {
          const img = await drawImage(env, provider, panel.prompt);
          key = `${base}.${img.ext}`;
          await env.BUCKET.put(key, img.bytes, { httpMetadata: { contentType: img.type } });
        } catch (e) { await refundQuota(env, user.id, 'image'); throw e; }
      }
      panel.image = 'r2:' + key;
      await saveSpec(env, user, id, p.spec);
      return json({ image: panel.image, spec: p.spec });
    }
    if (sub === '/render' && method === 'POST') {
      const missing = p.spec.scenes.reduce((n: number, sc: any) => n + sc.panels.filter((x: any) => !String(x.image).startsWith('r2:')).length, 0);
      if (missing) throw new HttpError(409, `Còn ${missing} khung chưa có tranh AI. Bấm "Vẽ tất cả bằng AI" hoặc đổi cảnh đó sang sơ đồ.`);
      const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM jobs WHERE user_id = ? AND status IN ('queued','running')").bind(user.id).first<any>();
      if (active.n >= MAX_ACTIVE_JOBS) throw new HttpError(429, 'Bạn đang có video chờ dựng. Đợi xong rồi dựng tiếp nhé.');
      await useQuota(env, user.id, 'render', limits(env).render);
      const jobId = randomId(12);
      await env.DB.prepare("INSERT INTO jobs (id, project_id, user_id, status, spec, created_at) VALUES (?, ?, ?, 'queued', ?, ?)")
        .bind(jobId, id, user.id, JSON.stringify(p.spec), Date.now()).run();
      ctx.waitUntil(startRunner(env).catch((e) => console.error('startRunner', e)));
      return json({ job: { id: jobId, status: 'queued', progress: 0 } });
    }
    if (sub === '/jobs' && method === 'GET') {
      const r = await env.DB.prepare('SELECT id, status, progress, error, created_at, finished_at FROM jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 10').bind(id).all();
      const queued = await env.DB.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued'").first<any>();
      return json({ jobs: r.results, queueLength: queued.n });
    }
  }

  const f = path.match(/^\/api\/jobs\/([a-f0-9]{24})\/(video|srt)$/);
  if (f && method === 'GET') {
    const job = await env.DB.prepare("SELECT id FROM jobs WHERE id = ? AND user_id = ? AND status = 'done'").bind(f[1], user.id).first();
    if (!job) throw new HttpError(404, 'Video chưa sẵn sàng.');
    const ext = f[2] === 'video' ? 'mp4' : 'srt';
    const obj = await env.BUCKET.get(`video/${user.id}/${f[1]}.${ext}`);
    if (!obj) throw new HttpError(404, 'Không tìm thấy tệp.');
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

  if (path === '/api/styles' && method === 'GET') return json({ styles: STYLES });
  throw new HttpError(404, 'Không tìm thấy.');
}

// ---- render machines: pull a job, fetch assets, upload the result. Auth: Bearer RUNNER_TOKEN.
async function runner(req: Request, env: Env, sub: string): Promise<Response> {
  const auth = req.headers.get('authorization') || '';
  if (!env.RUNNER_TOKEN || env.RUNNER_TOKEN.length < 32 || !timingSafeEqual(auth, `Bearer ${env.RUNNER_TOKEN}`)) throw new HttpError(401, 'Không có quyền.');
  const now = Date.now();

  if (sub === 'claim' && req.method === 'POST') {
    const name = String((await body(req, 1_000)).runner || 'runner').slice(0, 60);
    await env.DB.prepare("UPDATE jobs SET status = 'queued', runner = NULL WHERE status = 'running' AND started_at < ?").bind(now - STALE_JOB_MS).run();
    const job = await env.DB.prepare(
      `UPDATE jobs SET status = 'running', started_at = ?, runner = ?, progress = 0
       WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1) AND status = 'queued'
       RETURNING id, spec`,
    ).bind(now, name).first<any>();
    return json(job ? { job: { id: job.id, spec: JSON.parse(job.spec) } } : { job: null });
  }
  if (sub === 'asset' && req.method === 'GET') {
    const key = new URL(req.url).searchParams.get('key') || '';
    if (!/^img\/[^/]+\/[a-f0-9]{24}\.(png|jpg|webp)$/.test(key)) throw new HttpError(400, 'Khoá tệp không hợp lệ.');
    const obj = await env.BUCKET.get(key);
    if (!obj) throw new HttpError(404, 'Không tìm thấy.');
    return new Response(obj.body);
  }
  const m = sub.match(/^jobs\/([a-f0-9]{24})\/(progress|video|srt|done|fail)$/);
  if (!m) throw new HttpError(404, 'Không tìm thấy.');
  const job = await env.DB.prepare("SELECT id, user_id FROM jobs WHERE id = ? AND status = 'running'").bind(m[1]).first<any>();
  if (!job) throw new HttpError(409, 'Việc này không còn ở trạng thái đang dựng.');
  if (m[2] === 'progress') {
    const pct = Math.max(0, Math.min(99, Math.round(Number((await body(req, 1_000)).progress) || 0)));
    await env.DB.prepare('UPDATE jobs SET progress = ?, started_at = ? WHERE id = ?').bind(pct, now, job.id).run();
    return json({ ok: true });
  }
  if ((m[2] === 'video' || m[2] === 'srt') && req.method === 'PUT') {
    const ext = m[2] === 'video' ? 'mp4' : 'srt';
    await env.BUCKET.put(`video/${job.user_id}/${job.id}.${ext}`, req.body, { httpMetadata: { contentType: ext === 'mp4' ? 'video/mp4' : 'text/plain' } });
    return json({ ok: true });
  }
  if (m[2] === 'done') {
    if (!(await env.BUCKET.head(`video/${job.user_id}/${job.id}.mp4`))) throw new HttpError(400, 'Chưa tải video lên.');
    await env.DB.prepare("UPDATE jobs SET status = 'done', progress = 100, finished_at = ? WHERE id = ?").bind(now, job.id).run();
    return json({ ok: true });
  }
  if (m[2] === 'fail') {
    const error = String((await body(req, 5_000)).error || 'Dựng video thất bại.').slice(0, 300);
    await env.DB.prepare("UPDATE jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").bind(error, now, job.id).run();
    await refundQuota(env, job.user_id, 'render');
    return json({ ok: true });
  }
  throw new HttpError(405, 'Không hỗ trợ.');
}

/** Offline script for local development (DEV_LOGIN only): no AI key needed. */
function sampleScript(topic: string) {
  return {
    title: topic.slice(0, 60),
    caption: 'Bạn đang ở bước nào trong 3 bước này? Bình luận một con số nhé.',
    hashtags: ['#thoiquen', '#phattrienbanthan', '#taichinhcanhan'],
    scenes: [
      { lines: ['Bạn bận rộn cả ngày mà cuối năm vẫn đứng yên?', 'Điều thứ ba sẽ khiến bạn bất ngờ.'], panels: [{ prompt: 'a busy person running in circles' }] },
      { lines: ['Mỗi ngày tốt hơn một phần trăm, sau một năm bạn giỏi gấp ba mươi bảy lần.'], diagram: { kind: 'number', number: '37 lần', caption: 'tốt hơn 1% mỗi ngày trong 1 năm' } },
      { lines: ['Người làm theo cảm hứng và người làm theo thói quen khác nhau thế nào?'], diagram: { kind: 'compare', title: 'Hai kiểu người', left: 'Cảm hứng', right: 'Thói quen', leftNote: 'Làm vài hôm rồi bỏ', rightNote: 'Đều đặn dù không hứng' } },
      { lines: ['Bắt đầu bằng ba bước.'], diagram: { kind: 'steps', title: '3 bước nhỏ', items: ['Chọn một việc 15 phút', 'Gắn vào việc có sẵn', 'Đánh dấu mỗi ngày'] } },
      { lines: ['Lưu video này lại, tối nay làm bước một nhé.'], diagram: { kind: 'statement', text: 'Nhỏ nhưng đều thắng lớn nhưng bỏ dở' } },
    ],
  };
}
