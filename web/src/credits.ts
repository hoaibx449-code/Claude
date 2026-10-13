// Documentary credits. The documentary format draws one AI photograph per scene, which costs
// about ten times the other formats, so it is never free: each video takes either one video of
// the plan's monthly allowance (VIP plans) or `creditsPerVideo` credits bought in packs or
// granted by the admin. The charge happens before any AI call and covers a fixed number of
// pictures (redraws included); a project deleted before any picture was drawn is refunded.
import type { User } from './auth.ts';
import { selling } from './settings.ts';
import { body, HttpError, json } from './util.ts';
import type { Rc, XEnv } from './worker.ts';
import { planOf } from './plans.ts';

const monthStart = () => { const d = new Date(Date.now() + 7 * 3_600_000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 7 * 3_600_000; };

export async function creditState(env: XEnv, userId: string) {
  const { plan } = await planOf(env, userId);
  const bal = await env.DB.prepare('SELECT balance FROM credits WHERE user_id = ?').bind(userId).first<any>();
  const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM credit_log WHERE user_id = ? AND reason = 'plan' AND ts >= ?").bind(userId, monthStart()).first<any>();
  const monthly = plan.docPerMonth || 0;
  return { balance: bal?.balance || 0, monthly, monthlyLeft: Math.max(0, monthly - (used?.n || 0)), perVideo: env.config.doc.creditsPerVideo, images: env.config.doc.imagesPerVideo };
}

/** Pay for one documentary video; throws 402 with a clear way forward when nothing is left. */
export async function chargeDoc(env: XEnv, rc: Rc, user: User, ref: string) {
  const s = await creditState(env, user.id), now = Date.now();
  if (s.monthlyLeft > 0) {
    await env.DB.prepare("INSERT INTO credit_log (user_id, delta, reason, ref, ts) VALUES (?, 0, 'plan', ?, ?)").bind(user.id, ref, now).run();
    rc.log('credit.doc', { data: { source: 'plan', ref } });
    return 'plan';
  }
  const n = env.config.doc.creditsPerVideo;
  const r = await env.DB.prepare('UPDATE credits SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND balance >= ?').bind(n, now, user.id, n).run();
  if (!r.meta.changes) {
    const how = selling(env.config) && env.config.doc.packs.length ? 'Mua thêm credit ở trang Gói cước, hoặc nâng cấp gói VIP có sẵn phim tài liệu mỗi tháng.' : 'Bản Beta: liên hệ quản trị để được cấp credit.';
    throw new HttpError(402, `Phim tài liệu AI cần ${n} credit cho mỗi video (bạn còn ${s.balance}). ${how}`, { needCredits: true });
  }
  await env.DB.prepare("INSERT INTO credit_log (user_id, delta, reason, ref, ts) VALUES (?, ?, 'doc', ?, ?)").bind(user.id, -n, ref, now).run();
  rc.log('credit.doc', { data: { source: 'credits', ref, credits: n } });
  return 'credits';
}

/** Give back what a documentary took (AI failed, or deleted before any picture). */
export async function refundDoc(env: XEnv, rc: Rc, userId: string, ref: string) {
  const row = await env.DB.prepare("SELECT id, delta, reason FROM credit_log WHERE user_id = ? AND ref = ? AND reason IN ('plan','doc') ORDER BY id DESC LIMIT 1").bind(userId, ref).first<any>();
  if (!row) return;
  const now = Date.now();
  if (row.reason === 'plan') await env.DB.prepare('DELETE FROM credit_log WHERE id = ?').bind(row.id).run();
  else await env.DB.batch([
    env.DB.prepare('UPDATE credits SET balance = balance + ?, updated_at = ? WHERE user_id = ?').bind(-row.delta, now, userId),
    env.DB.prepare("UPDATE credit_log SET reason = 'refunded' WHERE id = ?").bind(row.id),
    env.DB.prepare("INSERT INTO credit_log (user_id, delta, reason, ref, ts) VALUES (?, ?, 'refund', ?, ?)").bind(userId, -row.delta, ref, now),
  ]);
  rc.log('credit.refund', { data: { ref } });
}

/** A documentary project starts with a picture allowance (its own budget, not the daily image quota). */
export async function openDocProject(env: XEnv, projectId: string, userId: string, chargeRef: string) {
  await env.DB.prepare('INSERT OR REPLACE INTO doc_projects (project_id, user_id, charge_ref, images_left, images_total, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(projectId, userId, chargeRef, env.config.doc.imagesPerVideo, env.config.doc.imagesPerVideo, Date.now()).run();
}
/** Take one picture from the project's allowance; false when it is used up. */
export async function useDocImage(env: XEnv, projectId: string) {
  const r = await env.DB.prepare('UPDATE doc_projects SET images_left = images_left - 1 WHERE project_id = ? AND images_left > 0').bind(projectId).run();
  return r.meta.changes > 0;
}
export async function giveBackDocImage(env: XEnv, projectId: string) {
  await env.DB.prepare('UPDATE doc_projects SET images_left = MIN(images_total, images_left + 1) WHERE project_id = ?').bind(projectId).run();
}
/** On delete: refund when no picture was drawn yet. */
export async function closeDocProject(env: XEnv, rc: Rc, projectId: string) {
  const d = await env.DB.prepare('SELECT * FROM doc_projects WHERE project_id = ?').bind(projectId).first<any>();
  if (!d) return;
  if (d.images_left >= d.images_total) await refundDoc(env, rc, d.user_id, d.charge_ref);
  await env.DB.prepare('DELETE FROM doc_projects WHERE project_id = ?').bind(projectId).run();
}

export async function addCredits(env: XEnv, userId: string, delta: number, reason: string, ref: string | null) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO credits (user_id, balance, updated_at) VALUES (?, MAX(0, ?), ?) ON CONFLICT (user_id) DO UPDATE SET balance = MAX(0, credits.balance + ?), updated_at = excluded.updated_at')
      .bind(userId, delta, now, delta),
    env.DB.prepare('INSERT INTO credit_log (user_id, delta, reason, ref, ts) VALUES (?, ?, ?, ?, ?)').bind(userId, delta, reason, ref, now),
  ]);
}

// ---------------------------------------------------------------- routes
export async function creditRoutes(req: Request, env: XEnv, rc: Rc, user: User, method: string) {
  if (method !== 'GET') throw new HttpError(405, 'Không hỗ trợ.');
  const s = await creditState(env, user.id);
  return json({ ...s, packs: selling(env.config) ? env.config.doc.packs : [] });
}

export async function creditsAdmin(req: Request, env: XEnv, rc: Rc, userId: string) {
  const b = await body<any>(req, 500);
  const delta = Math.round(Number(b.delta));
  if (!Number.isFinite(delta) || !delta || Math.abs(delta) > 10_000) throw new HttpError(400, 'Số credit không hợp lệ.');
  if (!(await env.DB.prepare('SELECT 1 FROM users WHERE id = ?').bind(userId).first())) throw new HttpError(404, 'Không tìm thấy người dùng.');
  await addCredits(env, userId, delta, 'admin', String(b.note || '').slice(0, 80) || null);
  rc.log('admin.credits', { data: { user: userId, delta } });
  return json(await creditState(env, userId));
}
