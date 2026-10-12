// Activity log: every request, every step of a video (script → images → render → delivery),
// what each AI call cost, errors, and the user's own clicks in the page. Stored in D1 so the
// admin can filter, follow one user's timeline, see funnels and export CSV.
import type { Config } from './settings.ts';
import type { Env } from './util.ts';

export interface LogEntry {
  type: string;            // e.g. api, auth.login, project.create, render.done, ai.script, ui.click
  userId?: string | null;
  visitor?: string | null; // anonymous browser id for guests
  channel?: 'web' | 'zalo' | 'runner' | 'system';
  path?: string;
  ok?: boolean;
  ms?: number;
  cost?: number;           // VND
  projectId?: string | null;
  data?: unknown;
  ip?: string | null;
  ua?: string | null;
}

/** Keys that must never reach the log. */
const SECRET = /key|token|secret|password|credential|authorization|cookie/i;

/** Short, safe summary of any value: secrets masked, images and long text cut. */
export function summarize(v: unknown, depth = 0): unknown {
  if (v == null || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.startsWith('data:') ? '[ảnh]' : v.length > 300 ? v.slice(0, 300) + '…' : v;
  if (depth > 3) return '…';
  if (Array.isArray(v)) return v.length > 12 ? [...v.slice(0, 12).map((x) => summarize(x, depth + 1)), `(+${v.length - 12})`] : v.map((x) => summarize(x, depth + 1));
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as object).slice(0, 40)) out[k] = SECRET.test(k) ? '***' : k === 'scenes' && Array.isArray(x) ? `[${x.length} cảnh]` : summarize(x, depth + 1);
    return out;
  }
  return String(v);
}

export async function logEvent(env: Env, e: LogEntry) {
  try {
    const data = e.data === undefined ? null : JSON.stringify(summarize(e.data)).slice(0, 4000);
    await env.DB.prepare(
      `INSERT INTO events (ts, user_id, visitor, channel, type, path, ok, ms, cost, project_id, data, ip, ua)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(Date.now(), e.userId || null, e.visitor || null, e.channel || 'web', e.type.slice(0, 60), e.path?.slice(0, 120) || null,
      e.ok === false ? 0 : 1, e.ms == null ? null : Math.round(e.ms), e.cost == null ? null : Math.round(e.cost * 100) / 100,
      e.projectId || null, data, e.ip || null, e.ua?.slice(0, 160) || null).run();
  } catch (err) {
    console.error('log failed', err);
  }
}

/** Client address, coarsened (last block dropped) so the log is useful without storing exact IPs. */
export function clientIp(req: Request) {
  const ip = req.headers.get('cf-connecting-ip') || '';
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + '::';
  return ip.replace(/\.\d+$/, '.0');
}

/** Route name with ids replaced, so requests group well ("/api/projects/:id/render"). */
export const routeName = (path: string) => path.replace(/[a-f0-9]{24}/g, ':id').replace(/\/img\/[^/]+\/[^/]+$/, '/img/:file');

/** VND cost of an AI text call from the admin's price table. */
export function aiCost(config: Config, u: { model: string; tokensIn: number; tokensOut: number }) {
  const prices = config.costs.models;
  const key = Object.keys(prices).filter((k) => u.model.startsWith(k)).sort((a, b) => b.length - a.length)[0] || '*';
  const [pin, pout] = prices[key] || prices['*'] || [0.5, 2];
  return ((u.tokensIn * pin + u.tokensOut * pout) / 1e6) * config.costs.usdVnd;
}

export function imageCost(config: Config, provider: string) {
  return (provider === 'openai' ? config.costs.imageOpenai : config.costs.imageGemini) * config.costs.usdVnd;
}

/** Voice cost of a rendered video, from the number of characters read. */
export function voiceCost(config: Config, provider: string, chars: number) {
  if (provider === 'everai') return (chars / 1000) * config.costs.everaiPer1000;
  if (provider === 'google') return (chars / 1e6) * config.costs.googleTtsPerM * config.costs.usdVnd;
  if (provider === 'elevenlabs') return (chars / 1000) * config.costs.elevenPer1000 * config.costs.usdVnd;
  return 0;
}
