// Ink Studio made entirely in the user's browser: the page runs the Python engine itself (Pyodide) and only asks
// the website for what needs its keys: AI answers (the prompts stay here, the browser sends a prompt name and its
// values) and the voice (Microsoft or EverAI, with the time of every word). Each job may ask a limited number of times.
import common from '../../ink/ink/prompts/common.md';
import strategy from '../../ink/ink/prompts/strategy.md';
import outline from '../../ink/ink/prompts/outline.md';
import write from '../../ink/ink/prompts/write.md';
import review from '../../ink/ink/prompts/review.md';
import hook from '../../ink/ink/prompts/hook.md';
import hookJudge from '../../ink/ink/prompts/hook_judge.md';
import storyboard from '../../ink/ink/prompts/storyboard.md';
import adapt from '../../ink/ink/prompts/adapt.md';
import fit from '../../ink/ink/prompts/fit.md';
import factcheck from '../../ink/ink/prompts/factcheck.md';
import { HttpError } from './util.ts';
import { microsoftSpeak, secMsGec, SEC_MS_GEC_VERSION } from './ink-voice.ts';
import { aiFetch, aiError } from './relay.ts';

const PROMPTS: Record<string, string> = { common, strategy, outline, write, review, hook, hook_judge: hookJudge, storyboard, adapt, fit, factcheck };

/** Python's str.format for the prompt templates: {name} is a value, {{ and }} are braces */
export function fillPrompt(ref: unknown) {
  const r = ref as { name?: string; kw?: Record<string, unknown> };
  const t = PROMPTS[String(r?.name || '')];
  if (!t) throw new HttpError(400, 'Không có mẫu câu hỏi này.');
  const kw = r.kw && typeof r.kw === 'object' ? r.kw : {};
  return t.replace(/\{\{|\}\}|\{([A-Za-z_]\w*)\}/g, (m, name) => (m === '{{' ? '{' : m === '}}' ? '}' : name in kw ? String(kw[name]) : m));
}

type Model = { provider: 'gemini' | 'openai'; model: string };
const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
/** ask the admin's model chain, starting at model `attempt` (a later attempt after a rejected answer moves on).
 * A busy model (429/503) gets one more try; the whole chain stays inside ~85 s so the page's request never hangs. */
export async function askChain(env: any, chain: Model[], system: string, user: string, temperature: number, attempt: number) {
  const usable = chain.filter((m) => (m.provider === 'gemini' ? env.GEMINI_API_KEY : env.OPENAI_API_KEY));
  if (!usable.length) throw new HttpError(503, 'Trang chưa có khoá AI (Gemini hoặc OpenAI).');
  const errors: string[] = [], end = Date.now() + 85_000;
  for (let i = 0; i < usable.length && end - Date.now() > 8_000; i++) {
    const { provider, model } = usable[(attempt + i) % usable.length];
    try {
      for (let tryNo = 0; ; tryNo++) {
        const signal = AbortSignal.timeout(Math.min(60_000, end - Date.now()));
        const res = provider === 'gemini'
          ? await aiFetch(env, `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY }, signal,
            body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature, responseMimeType: 'application/json' } }) })
          : await aiFetch(env, 'https://api.openai.com/v1/chat/completions', {
            method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.OPENAI_API_KEY }, signal,
            body: JSON.stringify({ model, temperature, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
        if ((res.status === 429 || res.status === 503) && tryNo === 0 && end - Date.now() > 20_000) { await wait(4000); continue; }
        if (!res.ok) throw new Error(await aiError(res));
        const j: any = await res.json();
        const text = provider === 'gemini' ? (j.candidates?.[0]?.content?.parts || []).filter((p: any) => !p.thought).map((p: any) => p.text || '').join('') : j.choices?.[0]?.message?.content || '';
        if (text.trim()) return { text, provider, model };
        throw new Error('câu trả lời rỗng');
      }
    } catch (e: any) {
      errors.push(`${provider}/${model}: ${e?.name === 'TimeoutError' ? 'quá thời gian chờ' : String(e?.message || e).slice(0, 160)}`);
      // a refused key fails the same way for every model of that provider
      if (/HTTP 40[13]|API key not valid|API_KEY_INVALID/i.test(errors[errors.length - 1])) usable.splice(0, usable.length, ...usable.filter((m) => m.provider !== provider)), i = -1;
    }
  }
  throw new HttpError(502, 'AI chưa trả lời được: ' + errors.join(' | '));
}

/** the voice for a whole narration: MP3 bytes and [word, start, end] in seconds (EverAI gives no word times) */
export async function speak(env: any, voice: { provider: string; code: string }, text: string, rate: string, fallback: boolean) {
  const tries = voice.provider === 'everai' ? ['everai', ...(fallback ? ['microsoft'] : [])] : ['microsoft', ...(fallback && env.EVERAI_API_KEY ? ['everai'] : [])];
  const errors: string[] = [];
  for (const p of tries) {
    try {
      if (p === 'microsoft') { const r = await microsoftSpeak(text, voice.provider === 'microsoft' ? voice.code : 'vi-VN-HoaiMyNeural', rate); return { ...r, provider: 'microsoft', errors }; }
      if (!env.EVERAI_API_KEY) throw new Error('chưa có khoá EverAI');
      return { audio: await everai(env.EVERAI_API_KEY, voice.provider === 'everai' ? voice.code : 'vi_female_thuytrang_mb', text, rate), words: [] as [string, number, number][], provider: 'everai', errors };
    } catch (e: any) { errors.push(`${p}: ${String(e?.message || e).slice(0, 120)}`); }
  }
  throw new HttpError(502, 'Không đọc được giọng: ' + errors.join(' | '));
}

async function everai(key: string, code: string, text: string, rate: string) {
  const url = 'https://www.everai.vn/api/v1/tts', headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  const speed = Math.max(0.5, Math.min(2, 1 + (parseInt(rate, 10) || 0) / 100));
  const r = await fetch(url, { method: 'POST', headers, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ response_type: 'indirect', input_text: text.slice(0, 4900), voice_code: code, model_id: 'everai-v1.6', audio_type: 'mp3', bitrate: 128, speed_rate: Math.round(speed * 10) / 10, pitch_rate: 1, volume: 100 }) });
  const j: any = await r.json().catch(() => ({}));
  const find = (o: any, k: string): any => { if (!o || typeof o !== 'object') return undefined; if (o[k] != null && o[k] !== '') return o[k]; for (const x of Object.keys(o)) { const v = find(o[x], k); if (v != null) return v; } };
  const id = find(j.result, 'request_id');
  if (!r.ok || !id) throw new Error(`EverAI từ chối (HTTP ${r.status})`);
  for (let i = 0; i < 60; i++) {
    await new Promise((ok) => setTimeout(ok, 2000));
    const s: any = await (await fetch(`${url}/${encodeURIComponent(id)}`, { headers })).json().catch(() => ({}));
    const link = find(s, 'audio_link');
    if (link) return new Uint8Array(await (await fetch(String(link))).arrayBuffer());
    if (/FAIL|ERROR|CANCEL/i.test(String(find(s, 'status') || ''))) throw new Error('EverAI báo thất bại');
  }
  throw new Error('EverAI quá thời gian chờ');
}

/** every Microsoft neural voice (the list the Edge read-aloud uses), Vietnamese first */
export async function microsoftVoices() {
  const url = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0' }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new HttpError(502, `Microsoft trả lỗi HTTP ${r.status}.`);
  const list: any[] = await r.json();
  return list.map((v) => ({ code: String(v.ShortName), label: `${String(v.FriendlyName || v.ShortName).replace(/^Microsoft /, '').replace(/ Online \(Natural\).*$/, '')} · ${v.Gender === 'Male' ? 'nam' : 'nữ'} · ${v.Locale}`, vi: String(v.Locale).startsWith('vi') }))
    .sort((a, b) => Number(b.vi) - Number(a.vi) || a.code.localeCompare(b.code));
}
