// The bell: what happened to this person's things lately (videos, payments, community), plus, for
// admins, AI-team work waiting for review. Read from existing tables; nothing new is stored.
import type { Env } from './util.ts';
export type Note = { id: string; kind: 'video' | 'failed' | 'paid' | 'community' | 'hidden' | 'review'; title: string; text: string; at: number; href: string };
const DAY = 86400000;

export async function notifications(env: Env, userId: string, admin: boolean, now = Date.now()): Promise<Note[]> {
  const since = now - 30 * DAY;
  const [jobs, orders, shared, review] = await Promise.all([
    env.DB.prepare("SELECT j.id, j.project_id, j.status, j.error, j.finished_at, p.title FROM jobs j JOIN projects p ON p.id = j.project_id WHERE j.user_id = ? AND j.status IN ('done','failed') AND j.finished_at >= ? ORDER BY j.finished_at DESC LIMIT 15").bind(userId, since).all<any>(),
    env.DB.prepare("SELECT code, plan, amount, paid_at FROM orders WHERE user_id = ? AND status = 'paid' AND paid_at >= ? ORDER BY paid_at DESC LIMIT 5").bind(userId, since).all<any>(),
    env.DB.prepare('SELECT job_id, project_id, title, hidden, created_at FROM community WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 5').bind(userId, since).all<any>(),
    admin ? env.DB.prepare("SELECT COUNT(*) AS n, MAX(updated_at) AS at FROM council_jobs WHERE status = 'pending'").first<any>().catch(() => null) : Promise.resolve(null),
  ]);
  const notes: Note[] = [
    ...jobs.results.map((j: any): Note => j.status === 'done'
      ? { id: 'job:' + j.id, kind: 'video', title: 'Video đã dựng xong', text: j.title, at: Number(j.finished_at), href: `/xem/${j.project_id}/${j.id}` }
      : { id: 'job:' + j.id, kind: 'failed', title: 'Dựng video chưa thành công', text: j.title, at: Number(j.finished_at), href: '/p/' + j.project_id }),
    ...orders.results.map((o: any): Note => ({ id: 'order:' + o.code, kind: 'paid', title: 'Thanh toán thành công', text: `Đơn ${o.code} · ${Number(o.amount).toLocaleString('vi-VN')}đ`, at: Number(o.paid_at), href: '/tai-khoan' })),
    ...shared.results.map((c: any): Note => c.hidden
      ? { id: 'community:' + c.job_id, kind: 'hidden', title: 'Video cộng đồng đang bị ẩn', text: c.title, at: Number(c.created_at), href: '/cong-dong' }
      : { id: 'community:' + c.job_id, kind: 'community', title: 'Video đã lên Cộng đồng', text: c.title, at: Number(c.created_at), href: '/cong-dong' }),
  ];
  if (review && Number(review.n) > 0) notes.push({ id: 'review:' + review.at, kind: 'review', title: `${review.n} việc của Nhóm AI chờ duyệt`, text: 'Mở Nhóm AI để duyệt, sửa hoặc từ chối.', at: Number(review.at) || now, href: '/admin/nhom-ai' });
  return notes.sort((a, b) => b.at - a.at).slice(0, 20);
}
