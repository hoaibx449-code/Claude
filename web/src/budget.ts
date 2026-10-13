// Spending cap for paid APIs (AI text, AI pictures, paid voices). Costs come from the activity log
// (events.cost, VND), so the cap follows the price table on the admin page. Over the cap the site
// keeps working on its free paths instead of failing: rule-based pictures and the basic voice.
import { voiceCost } from './log.ts';
import { HttpError } from './util.ts';
import type { XEnv } from './worker.ts';

const VN = 7 * 3_600_000;
const startOfDay = (now: number) => Math.floor((now + VN) / 86_400_000) * 86_400_000 - VN;
const startOfMonth = (now: number) => { const d = new Date(now + VN); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - VN; };

let cached: { at: number; day: number; month: number } | null = null;

/** VND spent today and this month (Vietnam time); cached for 30 s per Worker instance. */
export async function spent(env: XEnv, fresh = false) {
  const now = Date.now();
  if (!fresh && cached && now - cached.at < 30_000) return cached;
  const r = await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN ts >= ? THEN cost END), 0) AS day, COALESCE(SUM(cost), 0) AS month
    FROM events WHERE ts >= ? AND cost > 0`).bind(startOfDay(now), startOfMonth(now)).first<any>();
  cached = { at: now, day: Math.round(r?.day || 0), month: Math.round(r?.month || 0) };
  return cached;
}

export async function budgetState(env: XEnv, fresh = false) {
  const b = env.config.budget, s = await spent(env, fresh);
  const over = (b.dailyVnd > 0 && s.day >= b.dailyVnd) || (b.monthlyVnd > 0 && s.month >= b.monthlyVnd);
  const pct = Math.max(b.dailyVnd ? s.day / b.dailyVnd : 0, b.monthlyVnd ? s.month / b.monthlyVnd : 0) * 100;
  return { ...s, over, warn: !over && pct >= b.warnPct, pct: Math.round(pct) };
}

/** Before a paid AI call: refuse politely when the site has reached its cap. */
export async function requireBudget(env: XEnv, what: string) {
  if ((await budgetState(env)).over) throw new HttpError(503, `Hệ thống đã dùng hết ngân sách AI hôm nay nên tạm dừng ${what}. Bạn vẫn dùng được "Kịch bản của tôi + tự minh hoạ" với giọng cơ bản.`);
}

/** Estimated voice cost of a video (VND). */
export const videoVoiceCost = (env: XEnv, spec: any) =>
  voiceCost(env.config, spec?.voice?.provider || '', (spec?.scenes || []).reduce((n: number, sc: any) => n + (sc.lines || []).join(' ').length, 0) + String(spec?.intro?.title || '').length);

/**
 * Before queueing a render: a paid voice that would break the cap (site-wide or per video) is
 * swapped for the basic voice. Returns the note to show, or '' when nothing changed.
 */
export async function fitVoiceToBudget(env: XEnv, spec: any) {
  const cost = videoVoiceCost(env, spec);
  if (!cost) return '';
  const b = env.config.budget, state = await budgetState(env);
  const tooMuch = (b.perVideoVnd > 0 && cost > b.perVideoVnd) || state.over
    || (b.dailyVnd > 0 && state.day + cost > b.dailyVnd) || (b.monthlyVnd > 0 && state.month + cost > b.monthlyVnd);
  if (!tooMuch) return '';
  const free = env.config.voices.find((v) => v.provider === 'free' && (env.config.visibility['voice:' + v.code] || 'on') !== 'hidden') || env.config.voices.find((v) => v.provider === 'free');
  if (!free) return '';
  spec.voice = { ...spec.voice, provider: 'free', voiceId: free.code };
  return b.perVideoVnd > 0 && cost > b.perVideoVnd
    ? `Video dài nên giọng trả phí (ước tính ${Math.round(cost).toLocaleString('vi-VN')}đ) vượt mức cho một video; đã dùng giọng cơ bản.`
    : 'Ngân sách giọng đọc hôm nay đã gần hết; video này dùng giọng cơ bản.';
}
