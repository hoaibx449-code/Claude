// Plans, limits and bank-transfer payments.
// Each user is on the free plan unless a paid plan is active. A plan sets daily limits and
// which styles / voices / ways of starting are allowed. Payment: the user gets a VietQR code
// whose transfer memo is the order code; SePay calls our webhook when the money arrives and
// the plan is activated at once (the admin can also confirm by hand).
import type { User } from './auth.ts';
import { type Plan, selling } from './settings.ts';
import { body, type Env, HttpError, json, timingSafeEqual } from './util.ts';
import type { Rc, XEnv } from './worker.ts';
import { notifyOwner } from './zalo.ts';

const DAY = 86_400_000;
const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export async function planOf(env: XEnv, userId: string): Promise<{ plan: Plan; expires: number | null }> {
  const row = await env.DB.prepare('SELECT plan, expires_at FROM user_plans WHERE user_id = ? AND expires_at > ?').bind(userId, Date.now()).first<any>();
  const plans = env.config.plans;
  const paid = row && plans.find((p) => p.id === row.plan);
  return paid ? { plan: paid, expires: row.expires_at } : { plan: plans.find((p) => p.price === 0) || plans[0], expires: null };
}

export async function limitsFor(env: XEnv, userId: string) {
  return (await planOf(env, userId)).plan.limits;
}

const allows = (list: 'all' | string[], key: string) => list === 'all' || list.includes(key);

/** Cheapest visible plan that would allow what was blocked (for a targeted upgrade message). */
function upgradeFor(env: XEnv, test: (p: Plan) => boolean) {
  if (!selling(env.config)) return {};
  const p = env.config.plans.filter((x) => x.visible && x.price > 0 && test(x)).sort((a, b) => a.price - b.price)[0];
  return p ? { upgrade: { id: p.id, name: p.name, price: p.price } } : {};
}

/** Throws a 402 with an upgrade suggestion when the user's plan does not cover this video. */
export async function checkAllowed(env: XEnv, user: User, spec: any) {
  const { plan } = await planOf(env, user.id);
  const seconds = spec.scenes.reduce((n: number, sc: any) => n + sc.lines.join(' ').split(/\s+/).length, 0) / 2.6;
  if (!allows(plan.styles, spec.style)) {
    throw new HttpError(402, `Phong cách "${env.config.labels.styles[spec.style] || spec.style}" thuộc gói cao hơn.`, upgradeFor(env, (p) => allows(p.styles, spec.style)));
  }
  if (spec.voice?.voiceId && !allows(plan.voices, spec.voice.voiceId)) {
    throw new HttpError(402, 'Giọng đọc này thuộc gói cao hơn. Chọn giọng khác hoặc nâng cấp.', upgradeFor(env, (p) => allows(p.voices, spec.voice.voiceId)));
  }
  const cap = env.config.limits.maxSeconds;
  if (seconds > cap * 1.15) throw new HttpError(400, `Video dài khoảng ${Math.round(seconds / 60)} phút, hệ thống cho tối đa ${Math.round(cap / 60)} phút. Hãy rút gọn kịch bản.`);
  if (seconds > plan.maxSeconds * 1.15) {
    throw new HttpError(402, `Video dài khoảng ${Math.round(seconds)} giây, gói ${plan.name} cho tối đa ${plan.maxSeconds} giây.`, upgradeFor(env, (p) => p.maxSeconds >= seconds));
  }
}

export async function checkSource(env: XEnv, user: User, source: string) {
  const { plan } = await planOf(env, user.id);
  if (!allows(plan.sources, source)) {
    throw new HttpError(402, `"${env.config.labels.sources[source] || source}" thuộc gói cao hơn.`, upgradeFor(env, (p) => allows(p.sources, source)));
  }
}

function qrUrl(env: XEnv, amount: number, memo: string) {
  const p = env.config.payment;
  return `https://img.vietqr.io/image/${p.bank}-${p.account}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(p.accountName)}`;
}

/** Activate (or extend) a plan for a user. */
async function grant(env: Env, userId: string, plan: Plan, days: number, by: string) {
  const cur = await env.DB.prepare('SELECT plan, expires_at FROM user_plans WHERE user_id = ?').bind(userId).first<any>();
  const from = cur && cur.plan === plan.id && cur.expires_at > Date.now() ? cur.expires_at : Date.now();
  const until = from + days * DAY;
  await env.DB.prepare(`INSERT INTO user_plans (user_id, plan, expires_at, granted_by) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET plan = excluded.plan, expires_at = excluded.expires_at, granted_by = excluded.granted_by`).bind(userId, plan.id, until, by).run();
  return until;
}

async function confirmOrder(env: XEnv, rc: Rc, code: string, paid: number, ref: string, via: string) {
  if (!Number.isFinite(paid) || paid <= 0 || !ref) return null;
  const now = Date.now(), cutoff = now - env.config.payment.expiryDays * DAY;
  const o = await env.DB.prepare("SELECT * FROM orders WHERE code = ? AND status = 'pending' AND amount <= ? AND created_at > ?")
    .bind(code, paid, cutoff).first<any>();
  if (!o) return null;
  const plan = env.config.plans.find((p) => p.id === o.plan);
  if (!plan) return null;
  // D1 batch is transactional: credit and mark paid together, and serialize retries.
  // Every statement rechecks pending state, including after another request wins.
  const receipt = via === 'admin' ? 'admin:' + code : 'sepay:' + ref.slice(0, 80);
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO payment_receipts (ref, order_code, received_at)
      SELECT ?, code, ? FROM orders WHERE code = ? AND status = 'pending' AND amount <= ? AND created_at > ?
      ON CONFLICT(ref) DO NOTHING`).bind(receipt, now, code, paid, cutoff),
    env.DB.prepare(`INSERT INTO user_plans (user_id, plan, expires_at, granted_by)
      SELECT user_id, ?, ?, ? FROM orders WHERE code = ? AND status = 'pending'
      AND EXISTS (SELECT 1 FROM payment_receipts WHERE ref = ? AND order_code = orders.code)
      ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan,
      expires_at = (CASE WHEN user_plans.plan = excluded.plan AND user_plans.expires_at > ? THEN user_plans.expires_at ELSE ? END) + ?,
      granted_by = excluded.granted_by`).bind(plan.id, now + (plan.days || 30) * DAY, 'order:' + code, code, receipt, now, now, (plan.days || 30) * DAY),
    env.DB.prepare(`UPDATE orders SET status = 'paid', paid_at = ?, ref = ?, via = ? WHERE code = ? AND status = 'pending'
      AND EXISTS (SELECT 1 FROM payment_receipts WHERE ref = ? AND order_code = orders.code)`)
      .bind(now, ref.slice(0, 80), via, code, receipt),
  ]);
  if (!results[2].meta.changes) return null;
  const until = (await env.DB.prepare('SELECT expires_at FROM user_plans WHERE user_id = ?').bind(o.user_id).first<any>())?.expires_at;
  rc.userId = o.user_id;
  rc.log('order.paid', { data: { code, plan: plan.id, amount: o.amount, via, until } });
  await notifyOwner(env, 'order', `Đã nhận ${o.amount.toLocaleString('vi-VN')}đ cho đơn ${code} (gói ${plan.name}).`);
  return o;
}

// ---------------------------------------------------------------- user
export async function planRoutes(req: Request, env: XEnv, rc: Rc, user: User, path: string, method: string): Promise<Response> {
  if (path === '/api/plans' && method === 'GET') {
    const { plan, expires } = await planOf(env, user.id);
    const orders = (await env.DB.prepare('SELECT code, plan, amount, status, created_at, paid_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').bind(user.id).all<any>()).results;
    return json({ current: { id: plan.id, name: plan.name, expires, limits: plan.limits }, orders, payment: env.config.payment.enabled ? { note: env.config.payment.note } : null });
  }
  if (path === '/api/orders' && method === 'POST') {
    const p = env.config.payment;
    if (!p.enabled || !p.account) throw new HttpError(503, 'Thanh toán đang tạm đóng. Liên hệ quản trị viên.');
    const want = String((await body<any>(req, 500)).plan);
    const plan = env.config.plans.find((x) => x.id === want && x.visible && x.price > 0);
    if (!plan) throw new HttpError(400, 'Gói không hợp lệ.');
    // reuse a pending order for the same plan instead of piling up new ones
    let o = await env.DB.prepare("SELECT * FROM orders WHERE user_id = ? AND plan = ? AND status = 'pending' AND created_at > ?").bind(user.id, plan.id, Date.now() - p.expiryDays * DAY).first<any>();
    if (!o) {
      const code = p.prefix + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE[b % CODE.length]).join('');
      o = { code, plan: plan.id, amount: plan.price, status: 'pending', created_at: Date.now() };
      await env.DB.prepare("INSERT INTO orders (code, user_id, plan, amount, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)").bind(code, user.id, plan.id, plan.price, o.created_at).run();
      rc.log('order.create', { data: { code, plan: plan.id, amount: plan.price } });
      rc.wait(notifyOwner(env, 'order', `Đơn mới ${code}: gói ${plan.name}, ${plan.price.toLocaleString('vi-VN')}đ — ${user.email}`));
    }
    return json({ order: { ...o, qr: qrUrl(env, o.amount, o.code), bank: p.bank, account: p.account, accountName: p.accountName, memo: o.code, expires: o.created_at + p.expiryDays * DAY, note: p.note, holdMinutes: p.holdMinutes, planName: plan.name } });
  }
  const m = path.match(/^\/api\/orders\/([A-Z0-9]{6,12})(\/cancel)?$/);
  if (m) {
    const o = await env.DB.prepare('SELECT code, plan, amount, status, created_at, paid_at FROM orders WHERE code = ? AND user_id = ?').bind(m[1], user.id).first<any>();
    if (!o) throw new HttpError(404, 'Không tìm thấy đơn.');
    if (m[2] && method === 'POST') {
      await env.DB.prepare("UPDATE orders SET status = 'cancelled' WHERE code = ? AND status = 'pending'").bind(o.code).run();
      rc.log('order.cancel', { data: { code: o.code } });
      return json({ ok: true });
    }
    return json({ order: o });
  }
  throw new HttpError(404, 'Không tìm thấy.');
}

// ---------------------------------------------------------------- SePay → our webhook
export async function sepayWebhook(req: Request, env: XEnv, rc: Rc): Promise<Response> {
  const key = (env as any).SEPAY_API_KEY;
  const auth = (req.headers.get('authorization') || '').replace(/^apikey\s+/i, '');
  if (!key || !timingSafeEqual(auth, key)) { rc.log('sepay.webhook', { ok: false, data: { error: 'sai API key' } }); throw new HttpError(401, 'Không có quyền.'); }
  const b = await body<any>(req, 20_000);
  rc.channel = 'system';
  if (!env.config.payment.enabled || b.transferType !== 'in' || String(b.accountNumber || '') !== env.config.payment.account) return json({ success: true });
  const prefix = env.config.payment.prefix;
  const text = `${b.content || ''} ${b.description || ''} ${b.code || ''}`.toUpperCase();
  const code = text.match(new RegExp(prefix + `[${CODE}]{6}`))?.[0];
  rc.log('sepay.webhook', { data: { id: b.id, amount: b.transferAmount, code: code || null, content: String(b.content || '').slice(0, 120) } });
  if (code) await confirmOrder(env, rc, code, Number(b.transferAmount), String(b.id || b.referenceCode || ''), 'sepay');
  return json({ success: true });
}

/** Expire forgotten orders (scheduled). */
export async function expireOrders(env: XEnv) {
  await env.DB.prepare("UPDATE orders SET status = 'expired' WHERE status = 'pending' AND created_at < ?").bind(Date.now() - env.config.payment.expiryDays * DAY).run();
}

// ---------------------------------------------------------------- admin
export async function plansAdmin(req: Request, env: XEnv, sub: string, method: string, rc: Rc): Promise<Response> {
  if (sub === 'orders' && method === 'GET') {
    const rows = (await env.DB.prepare('SELECT o.*, u.email FROM orders o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 300').all<any>()).results;
    const sum = await env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS revenue, COUNT(*) AS paid FROM orders WHERE status = 'paid' AND paid_at > ?").bind(Date.now() - 30 * DAY).first<any>();
    const cost = await env.DB.prepare('SELECT ROUND(COALESCE(SUM(cost), 0)) AS cost FROM events WHERE ts > ? AND cost > 0').bind(Date.now() - 30 * DAY).first<any>();
    return json({ orders: rows, last30: { revenue: sum?.revenue || 0, paid: sum?.paid || 0, cost: cost?.cost || 0 } });
  }
  const m = sub.match(/^orders\/([A-Z0-9]{6,12})\/(confirm|cancel)$/);
  if (m && method === 'POST') {
    if (m[2] === 'cancel') {
      await env.DB.prepare("UPDATE orders SET status = 'cancelled' WHERE code = ? AND status = 'pending'").bind(m[1]).run();
      rc.log('admin.order.cancel', { data: { code: m[1] } });
      return json({ ok: true });
    }
    const o = await env.DB.prepare('SELECT amount FROM orders WHERE code = ?').bind(m[1]).first<any>();
    if (!o) throw new HttpError(404, 'Không tìm thấy đơn.');
    const done = await confirmOrder(env, rc, m[1], o.amount, 'thủ công', 'admin');
    if (!done) throw new HttpError(409, 'Đơn không còn ở trạng thái chờ.');
    return json({ ok: true });
  }
  if (sub === 'grant' && method === 'POST') {
    const b = await body<any>(req, 1_000);
    const plan = env.config.plans.find((p) => p.id === b.plan);
    if (!plan) throw new HttpError(400, 'Gói không hợp lệ.');
    const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(String(b.user)).first<any>();
    if (!user) throw new HttpError(404, 'Không tìm thấy người dùng.');
    if (plan.price === 0) {
      await env.DB.prepare('DELETE FROM user_plans WHERE user_id = ?').bind(user.id).run();
      rc.log('admin.grant', { data: { user: user.id, plan: plan.id } });
      return json({ ok: true });
    }
    const until = await grant(env, user.id, plan, Math.max(1, Math.min(3650, Number(b.days) || plan.days || 30)), 'admin');
    rc.log('admin.grant', { data: { user: user.id, plan: plan.id, until } });
    return json({ ok: true, until });
  }
  throw new HttpError(404, 'Không tìm thấy.');
}
