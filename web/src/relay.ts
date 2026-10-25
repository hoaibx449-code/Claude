/**
 * AI requests from a fixed place in the US. Cloudflare answers each visitor from a nearby data centre, and from
 * some of them (e.g. Hong Kong) Google and OpenAI refuse the request ("User location is not supported"). When that
 * happens the request is sent again through this Durable Object, which lives in North America.
 */
import type { Env } from './util.ts';

const HOSTS = new Set(['generativelanguage.googleapis.com', 'api.openai.com']);
const LOCATION = /location is not supported|unsupported_country|country, region, or territory not supported/i;
let viaRelayUntil = 0;

export class AiRelay {
  constructor(_state: unknown, _env: unknown) {}
  async fetch(req: Request) {
    if (!HOSTS.has(new URL(req.url).hostname)) return new Response('host not allowed', { status: 403 });
    return fetch(req);
  }
}

async function relayed(env: Env, url: string, init: RequestInit) {
  const ns = env.AI_RELAY!, stub = ns.get(ns.idFromName('us'), { locationHint: 'wnam' });
  return stub.fetch(new Request(url, init));
}

/** fetch an AI provider; refused for the visitor's location → the same request again from the US */
export async function aiFetch(env: Env, url: string, init: RequestInit): Promise<Response> {
  if (env.AI_RELAY && viaRelayUntil > Date.now()) return relayed(env, url, init);
  const res = await fetch(url, init);
  if (!env.AI_RELAY || (res.status !== 400 && res.status !== 403) || !LOCATION.test(await res.clone().text())) return res;
  viaRelayUntil = Date.now() + 60 * 60_000;
  return relayed(env, url, init);
}

/** the provider's own reason for a refused request, short and without anything key-like */
export async function aiError(res: Response) {
  const t = await res.text().catch(() => '');
  let m = '';
  try { const j = JSON.parse(t); m = j.error?.message || j.error?.status || j.message || ''; } catch { m = t; }
  m = String(m).replace(/\s+/g, ' ').replace(/(AIza|sk-)[\w-]{8,}/g, '***').trim().slice(0, 140);
  return `HTTP ${res.status}${m ? ' – ' + m : ''}`;
}
