// Script writing (OpenAI or Gemini, chosen per request) and line-art images.
// Model output is treated as data: it goes through cleanSpec() before use.
import { Env, HttpError } from './util.ts';

export type TextProvider = 'openai' | 'gemini';
export type ImageProvider = 'openai' | 'gemini';

export const LINE_ART_STYLE =
  'Hand-drawn black ink line art illustration, clean confident outlines, light cross-hatching only for shadows, ' +
  'no color, no gray fill, plain pure white background, no text, no letters, no frame, centered subject, 4:3 composition. Scene: ';

export interface ScriptRequest { topic: string; seconds: number; tone: string; ratio: string }

function systemPrompt(r: ScriptRequest) {
  const scenes = Math.max(3, Math.min(14, Math.round(r.seconds / 6)));
  return [
    'Bạn là biên kịch video ngắn tiếng Việt kiểu "bàn tay vẽ" (whiteboard). Viết kịch bản theo đúng chủ đề người dùng đưa.',
    `Khoảng ${scenes} cảnh, tổng ~${r.seconds} giây lời đọc (~${Math.round(r.seconds * 2.6)} chữ).`,
    'Mỗi cảnh: 1-2 câu thoại ngắn, văn nói tự nhiên, xưng "bạn"; mỗi câu ≤ 18 chữ; số viết bằng chữ khi đọc tự nhiên hơn.',
    'Cảnh 1 là câu mở gây tò mò hoặc chạm vào vấn đề của người xem, không chào hỏi. Cảnh cuối chốt một ý đáng nhớ.',
    'Mỗi cảnh có 1-2 khung hình; mỗi khung có "prompt" TIẾNG ANH mô tả một hình minh hoạ đơn giản (chủ thể, hành động, đồ vật ẩn dụ), không có chữ trong hình.',
    'Không bịa số liệu, nghiên cứu hay trích dẫn. Không đưa lời khuyên đầu tư, y tế, pháp lý cụ thể.',
    r.tone ? `Giọng văn: ${r.tone}.` : '',
    'Trả về DUY NHẤT JSON: {"title":"tiêu đề ≤ 70 ký tự","scenes":[{"lines":["câu 1","câu 2"],"panels":[{"prompt":"..."},{"prompt":"..."}]}]}',
  ].filter(Boolean).join('\n');
}

function parseJson(text: string) {
  const t = text.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { return null; }
}

export async function writeScript(env: Env, provider: TextProvider, r: ScriptRequest) {
  const sys = systemPrompt(r), user = 'CHỦ ĐỀ: ' + r.topic;
  let text = '';
  if (provider === 'openai') {
    if (!env.OPENAI_API_KEY) throw new HttpError(503, 'Chủ trang chưa cấu hình khoá OpenAI.');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: env.OPENAI_TEXT_MODEL, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
    });
    if (!res.ok) throw new HttpError(502, `OpenAI chưa viết được kịch bản (HTTP ${res.status}). Thử lại hoặc đổi sang Gemini.`);
    text = ((await res.json()) as any).choices?.[0]?.message?.content || '';
  } else {
    if (!env.GEMINI_API_KEY) throw new HttpError(503, 'Chủ trang chưa cấu hình khoá Gemini.');
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_TEXT_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json' } }),
    });
    if (!res.ok) throw new HttpError(502, `Gemini chưa viết được kịch bản (HTTP ${res.status}). Thử lại hoặc đổi sang OpenAI.`);
    text = (((await res.json()) as any).candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
  }
  const out = parseJson(text);
  if (!out || !Array.isArray(out.scenes)) throw new HttpError(502, 'AI trả về chưa đúng định dạng, bấm tạo lại giúp mình.');
  return out;
}

export async function drawImage(env: Env, provider: ImageProvider, prompt: string): Promise<Uint8Array> {
  const full = LINE_ART_STYLE + prompt;
  const decode = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (provider === 'openai') {
    if (!env.OPENAI_API_KEY) throw new HttpError(503, 'Chủ trang chưa cấu hình khoá OpenAI.');
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: env.OPENAI_IMAGE_MODEL, prompt: full, size: '1536x1024', quality: 'medium', n: 1 }),
    });
    if (!res.ok) throw new HttpError(502, `OpenAI chưa vẽ được ảnh (HTTP ${res.status}).`);
    const b64 = ((await res.json()) as any).data?.[0]?.b64_json;
    if (!b64) throw new HttpError(502, 'OpenAI không trả về ảnh.');
    return decode(b64);
  }
  if (!env.GEMINI_API_KEY) throw new HttpError(503, 'Chủ trang chưa cấu hình khoá Gemini.');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_IMAGE_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: full }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:3' } } }),
  });
  if (!res.ok) throw new HttpError(502, `Gemini chưa vẽ được ảnh (HTTP ${res.status}).`);
  const part = (((await res.json()) as any).candidates?.[0]?.content?.parts || []).find((p: any) => p.inlineData?.data);
  if (!part) throw new HttpError(502, 'Gemini không trả về ảnh (mô tả có thể bị bộ lọc an toàn chặn).');
  return decode(part.inlineData.data);
}
