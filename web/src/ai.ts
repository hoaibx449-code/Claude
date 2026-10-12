// Script writing (OpenAI or Gemini, chosen per request) and line-art images.
// Model output is treated as data: it goes through cleanSpec() before use.
import { Env, HttpError } from './util.ts';

export type TextProvider = 'openai' | 'gemini';
export type ImageProvider = 'openai' | 'gemini';

export const LINE_ART_STYLE =
  'Hand-drawn black ink line art illustration, clean confident outlines, light cross-hatching only for shadows, ' +
  'no color, no gray fill, plain pure white background, no text, no letters, no frame, centered subject, 4:3 composition. Scene: ';

export type VisualMode = 'mix' | 'images' | 'diagram';
export interface ScriptRequest { topic: string; seconds: number; tone: string; ratio: string; visual: VisualMode }

const DIAGRAM_SCHEMA =
  '"diagram": một trong: {"kind":"bars","title":"≤6 chữ","values":[số],"labels":["≤12 ký tự"],"unit":"tr|%|..."} (2-5 cột, chỉ số liệu có thật hoặc ví dụ minh hoạ nói rõ là ví dụ) · ' +
  '{"kind":"compare","title":"...","left":"≤3 chữ (cách sai)","right":"≤3 chữ (cách đúng)","leftNote":"≤10 chữ","rightNote":"≤10 chữ"} · ' +
  '{"kind":"steps","title":"...","items":["≤10 chữ", "..."]} (2-4 bước) · ' +
  '{"kind":"number","number":"≤6 ký tự, vd 90% hoặc 3 lần","caption":"≤10 chữ"} · ' +
  '{"kind":"statement","text":"câu chốt ≤14 chữ"}';

function systemPrompt(r: ScriptRequest) {
  const scenes = Math.max(4, Math.min(14, Math.round(r.seconds / 5.5)));
  const visual = {
    images: 'Mọi cảnh dùng "panels": thường 1 khung; 2 khung chỉ khi cần đối lập hai hình.',
    diagram: 'Mọi cảnh dùng "diagram" (không dùng "panels").',
    mix: 'Cảnh có số liệu, so sánh, các bước hoặc câu chốt thì dùng "diagram"; cảnh kể tình huống, cảm xúc thì dùng "panels" (1 khung). Khoảng 40-60% cảnh là diagram.',
  }[r.visual];
  return [
    'Bạn là biên kịch video ngắn tiếng Việt kiểu "bàn tay vẽ" (whiteboard), chuyên viết video giữ chân người xem tới giây cuối. Viết đúng chủ đề người dùng đưa.',
    `Khoảng ${scenes} cảnh, tổng ~${r.seconds} giây lời đọc (~${Math.round(r.seconds * 2.6)} chữ). Mỗi cảnh 1-2 câu thoại, văn nói tự nhiên, xưng "bạn", mỗi câu ≤ 18 chữ.`,
    'CẤU TRÚC BẮT BUỘC:',
    '1. HOOK (cảnh 1, ≤ 3 giây): một câu khiến người đang lướt phải dừng lại — câu hỏi chạm đúng nỗi đau, một sự thật bất ngờ, một mâu thuẫn ("càng... càng..."), hoặc lời hứa cụ thể. CẤM chào hỏi, cấm "hôm nay mình sẽ", cấm giới thiệu kênh.',
    '2. VÒNG LẶP TÒ MÒ (cảnh 1-2): gợi một điều chỉ được tiết lộ ở cuối (vd "điều thứ ba mới là thứ quyết định"), để người xem phải xem hết.',
    '3. THÂN BÀI: mỗi cảnh một ý, có ví dụ đời thường của người Việt; cứ 2-3 cảnh có một nhịp đảo chiều hoặc chi tiết bất ngờ. Không lan man.',
    '4. TRẢ LỜI vòng lặp tò mò rồi CHỐT bằng một câu ngắn, đáng nhớ, dễ trích lại.',
    '5. KÊU GỌI KHÉO (chỉ cảnh cuối, 1 câu, gắn với lợi ích của người xem): lưu lại ("lưu lại để lần sau…"), chia sẻ ("gửi cho người bạn đang…") hoặc bình luận bằng một câu hỏi dễ trả lời một chữ. Không xin like trực tiếp, không "nhớ đăng ký kênh".',
    'Số viết bằng chữ trong lời đọc khi đọc tự nhiên hơn. Không bịa số liệu, nghiên cứu, trích dẫn; nếu dùng con số minh hoạ thì nói rõ là ví dụ. Không đưa lời khuyên đầu tư, y tế, pháp lý cụ thể.',
    r.tone ? `Giọng văn: ${r.tone}.` : '',
    'HÌNH: ' + visual,
    '"panels": [{"prompt":"TIẾNG ANH, 1 hình minh hoạ đơn giản: chủ thể, hành động, đồ vật ẩn dụ; không chữ trong hình"}].',
    DIAGRAM_SCHEMA + '. Chữ trong diagram là tiếng Việt, rất ngắn, khớp ý câu thoại của cảnh.',
    'Trả về DUY NHẤT JSON: {"title":"tiêu đề ≤ 70 ký tự gây tò mò","caption":"caption đăng bài ≤ 150 ký tự, kết bằng một câu hỏi mời bình luận","hashtags":["#tiengvietkhongdau", "... 5-8 thẻ"],"scenes":[{"lines":["câu 1","câu 2"],"panels":[...]} hoặc {"lines":[...],"diagram":{...}}]}',
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
      body: JSON.stringify({ model: env.OPENAI_IMAGE_MODEL, prompt: full, size: '1536x1024', quality: env.OPENAI_IMAGE_QUALITY || 'medium', n: 1 }),
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
