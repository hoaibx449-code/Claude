// Admin "Kiểm tra": try a key the moment it is pasted (before saving), or the saved one, with the smallest real
// call each provider allows, and say exactly what the provider answered. The key never leaves the Worker.
import { aiFetch, aiError } from './relay.ts';
import { everaiSample } from './voices.ts';
import { HttpError } from './util.ts';
import type { XEnv } from './worker.ts';

export type KeyTest = { ok: boolean; ms: number; detail: string; hint?: string };

export async function testKey(env: XEnv, name: string, typed: string, origin: string): Promise<KeyTest> {
  const key = typed.trim() || String((env as any)[name] || '');
  if (!key) return { ok: false, ms: 0, detail: 'Chưa có khoá: dán khoá vào ô rồi bấm Kiểm tra.' };
  const t0 = Date.now(), ms = () => Date.now() - t0, signal = AbortSignal.timeout(20_000);
  const bad = async (res: Response, hint?: string): Promise<KeyTest> => ({ ok: false, ms: ms(), detail: await aiError(res), hint });
  try {
    switch (name) {
      case 'GEMINI_API_KEY': {
        const model = env.config.models.geminiText || 'gemini-flash-latest';
        const res = await aiFetch(env, `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', signal,
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Trả lời đúng một chữ: OK' }] }], generationConfig: { maxOutputTokens: 20 } }) });
        if (!res.ok) return bad(res, res.status === 404 ? `Model ${model} không có với khoá này: đổi model ở Cài đặt → AI.` : 'Tạo khoá mới tại aistudio.google.com → Get API key.');
        return { ok: true, ms: ms(), detail: `Gemini (${model}) trả lời được.` };
      }
      case 'OPENAI_API_KEY': {
        const res = await aiFetch(env, 'https://api.openai.com/v1/models', { headers: { authorization: 'Bearer ' + key }, signal });
        if (!res.ok) return bad(res, 'Tạo khoá mới tại platform.openai.com → API keys và kiểm tra hạn mức (Billing).');
        const n = ((await res.json()) as any).data?.length || 0;
        return { ok: true, ms: ms(), detail: `OpenAI chấp nhận khoá (${n} model dùng được).` };
      }
      case 'OLLAMA_API_KEY': {
        const base = (env.config.models.ollamaUrl || 'https://ollama.com').replace(/\/$/, '');
        const res = await fetch(base + '/api/tags', { headers: { authorization: 'Bearer ' + key }, signal });
        if (!res.ok) return bad(res);
        return { ok: true, ms: ms(), detail: `Ollama chấp nhận khoá (${((await res.json()) as any).models?.length || 0} model).` };
      }
      case 'EVERAI_API_KEY': {
        const audio = await everaiSample(key, 'vi_female_thuytrang_mb', 'Xin chào.');
        return { ok: true, ms: ms(), detail: `EverAI đọc thử được (${Math.round(audio.byteLength / 1024)} KB).` };
      }
      case 'GOOGLE_TTS_API_KEY': {
        const res = await fetch('https://texttospeech.googleapis.com/v1/voices?languageCode=vi-VN&key=' + encodeURIComponent(key), { signal });
        if (!res.ok) return bad(res, 'Bật Cloud Text-to-Speech API cho dự án của khoá này trong Google Cloud Console.');
        return { ok: true, ms: ms(), detail: `Google Text-to-Speech chấp nhận khoá (${((await res.json()) as any).voices?.length || 0} giọng tiếng Việt).` };
      }
      case 'ELEVENLABS_API_KEY': {
        const res = await fetch('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': key }, signal });
        if (!res.ok) return bad(res);
        const j: any = await res.json(), sub = j.subscription || {};
        return { ok: true, ms: ms(), detail: `ElevenLabs chấp nhận khoá${sub.character_limit ? ` (đã dùng ${sub.character_count}/${sub.character_limit} ký tự)` : ''}.` };
      }
      case 'ZALO_BOT_TOKEN': {
        const res = await fetch(`https://bot-api.zaloplatforms.com/bot${key}/getMe`, { signal });
        const j: any = await res.json().catch(() => ({}));
        if (!res.ok || j.ok === false) return { ok: false, ms: ms(), detail: `Zalo từ chối token (HTTP ${res.status}${j.description ? ' – ' + j.description : ''}).`, hint: 'Lấy lại token trong Zalo Bot Creator.' };
        return { ok: true, ms: ms(), detail: `Zalo nhận token: bot "${j.result?.account_name || j.result?.display_name || j.result?.name || 'của bạn'}".` };
      }
      case 'SEPAY_API_KEY': {
        // SePay calls us with this key (nothing to call outward): say where, and when SePay last got through
        const last = await env.DB.prepare("SELECT MAX(ts) AS t FROM events WHERE type = 'sepay.webhook' AND ok = 1").first<any>().catch(() => null);
        const when = last?.t ? new Date(Number(last.t)).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '';
        return { ok: !!last?.t, ms: ms(), detail: when ? `SePay đã gọi về trang thành công lần gần nhất lúc ${when}.` : 'Chưa nhận được lần gọi nào từ SePay với khoá đúng.',
          hint: `Trong SePay → Webhooks: địa chỉ ${origin}/api/sepay/webhook, xác thực "API Key" = khoá này, rồi bấm "Gửi thử".` };
      }
    }
    throw new HttpError(400, 'Không có kiểm tra cho khoá này.');
  } catch (e: any) {
    if (e instanceof HttpError) throw e;
    return { ok: false, ms: ms(), detail: e?.name === 'TimeoutError' ? 'Nhà cung cấp không trả lời trong 20 giây.' : String(e?.message || e).slice(0, 240) };
  }
}
