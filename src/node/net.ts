// fetch with retries for transient network failures and 429/5xx answers.
// Only for requests that are safe to repeat (downloads, status checks, uploads by key).
export async function fetchRetry(url: string, init: RequestInit = {}, label = 'mạng', tries = 4): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) });
      if ((res.status === 429 || res.status >= 500) && i < tries - 1) { last = new Error(`HTTP ${res.status}`); await res.body?.cancel(); }
      else return res;
    } catch (e) { last = e; if (init.signal?.aborted) throw e; }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 1000 * 3 ** i));
  }
  throw new Error(`${label}: ${describe(last)}`);
}

/** Readable reason for undici's generic "fetch failed". */
export function describe(e: any): string {
  const c = e?.cause;
  return [e?.message, c?.code, c?.message].filter(Boolean).join(' · ') || String(e);
}
