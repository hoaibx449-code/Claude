// Script writing (OpenAI or Gemini, chosen per request) and line-art images.
// Model output is treated as data: it goes through cleanSpec() before use.
import { Buffer } from 'node:buffer';
import { type Env, HttpError } from './util.ts';
import { FORMAT_BRIEF, FORMAT_NAMES, NICHE_NAMES } from './intent.ts';

export type TextProvider = 'openai' | 'gemini';
export type ImageProvider = 'openai' | 'gemini';

export const LINE_ART_STYLE =
  'Hand-drawn black ink line art illustration, clean confident outlines, light cross-hatching only for shadows, ' +
  'no color, no gray fill, plain pure white background, no text, no letters, no frame, centered subject, 4:3 composition. Scene: ';

export type VisualMode = 'sketch' | 'mix' | 'images' | 'diagram';
export interface ScriptRequest {
  topic: string; seconds: number; tone: string; ratio: string; visual: VisualMode;
  /** admin's extra instructions */ extra?: string;
  /** the user's own script, already split into scenes: the AI only designs the pictures */
  scenes?: string[][];
  /** detected kind of video and topic area (see intent.ts) */
  format?: string; niche?: string;
}

const ICON_VOCAB = 'user, users, user-check, user-x, user-heart, user-star, friends, man, woman, baby-carriage, old, mood-happy, mood-sad, mood-cry, mood-angry, mood-confuzed, mood-sick, mood-nervous, mood-smile-beam, heart, heart-broken, heart-handshake, hearts, brain, bulb, bulb-off, message, message-circle, messages, speakerphone, microphone, thumb-up, thumb-down, hand-stop, hand-click, pointer, eye, eye-off, ear, search, zoom-question, question-mark, exclamation-mark, alert-triangle, alert-circle, info-circle, check, x, circle-check, circle-x, ban, lock, lock-open, key, shield, shield-check, fingerprint, home, building, building-skyscraper, building-bank, building-store, building-hospital, building-factory, school, briefcase, tent, cash, coin, coins, currency-dollar, pig-money, wallet, credit-card, receipt, receipt-tax, report-money, moneybag, basket, shopping-cart, shopping-bag, gift, tag, discount, percentage, calculator, chart-bar, chart-line, chart-pie, chart-arrows-vertical, trending-up, trending-down, arrow-up-right, arrow-down-right, scale, scale-outline, clock, alarm, hourglass, calendar, calendar-event, calendar-time, stopwatch, history, hourglass-high, device-mobile, device-laptop, device-desktop, device-tv, device-gamepad-2, wifi, world, cloud, database, server, robot, cpu, code, mail, phone, camera, photo, video, movie, music, headphones, car, bus, bike, plane, rocket, ship, truck, map, map-pin, route, road-sign, compass, globe, sun, moon, cloud-rain, snowflake, bolt, flame, droplet, leaf, plant, tree, seedling, mountain, beach, coffee, cup, tools-kitchen-2, pizza, apple, salad, bottle, beer, cake, candy, egg, fish, meat, milk, bed, zzz, run, walk, swimming, yoga, barbell, stretching, heartbeat, activity, pill, vaccine, stethoscope, first-aid-kit, virus, book, book-2, books, notebook, pencil, writing, certificate, award, trophy, medal, crown, star, stars, flag, target, target-arrow, puzzle, chess, chess-knight, dice-5, ladder, stairs-up, stairs-down, battery, battery-1, battery-4, plug, lamp, bell, bell-ringing, hammer, tool, tools, settings, adjustments, box, package, link, anchor, magnet, umbrella, paperclip, sparkles, confetti, balloon, mask, mood-crazy-happy, ghost, skull, bomb, fire-extinguisher, arrows-split, arrows-join, refresh, repeat, infinity, recycle, arrow-loop-right, arrows-exchange';

function sketchSchema(ratio: string) {
  const portrait = ratio !== '16:9';
  return [
    'BẢNG VẼ TỰ DO: mỗi cảnh là MỘT BỐ CỤC VẼ TAY RIÊNG, nghĩ ra cho đúng ý câu thoại của cảnh đó, như một người vừa nói vừa phác ý lên bảng: chữ viết tay (từ khoá, con số), hình minh hoạ nét đơn (icon), người que chuyển động, mũi tên nối ý, khoanh tròn/gạch chân điểm nhấn, dấu ✗/✓, biểu đồ nhỏ. Video KHÔNG có phụ đề nên chữ trên bảng phải nêu được ý chính (ngắn).',
    'Mỗi cảnh 3-8 vật; mỗi cảnh một kiểu bố cục khác (ví dụ: tiêu đề + 3 icon nối mũi tên; người que + bong bóng thoại + icon; con số khổng lồ khoanh tròn; hai cột ✗/✓; chuỗi nguyên nhân → kết quả; biểu đồ có mũi tên và chú thích; ẩn dụ hình ảnh). Dùng ẩn dụ: tiền bay = icon cash + mũi tên đi ra; áp lực = người que sad + icon clock...',
    '"diagram":{"kind":"sketch","items":[...]} — items theo THỨ TỰ VẼ. KHỚP NHỊP: mỗi item nên có "line" (chỉ số câu thoại 0 hoặc 1) và "cue" (2-4 chữ CHÉP ĐÚNG từ câu thoại đó): vật được vẽ đúng lúc giọng đọc nói tới cụm từ ấy. Thứ tự vật theo thứ tự ý trong lời đọc:',
    '{"t":"text","id":"a","text":"≤6 chữ","x":50,"y":8,"size":"s|m|l|xl|xxl","color":"ink|accent|accent2|good"} (xxl cho con số lớn; accent = đỏ nhấn, accent2 = xanh) · ' +
    '{"t":"icon","id":"b","name":"tên icon","x":30,"y":40,"w":10-45 (% bề ngang),"label":"≤4 chữ (tuỳ chọn)"} · ' +
    '{"t":"person","id":"c","action":"idle|walk|run|wave|think|cheer|sad|point|shrug|jump","x":..,"y":..,"h":20-45 (% chiều cao),"facing":1|-1,"label":"≤2 chữ","bubble":"≤8 chữ (tuỳ chọn)"} (người que chuyển động thật) · ' +
    '{"t":"chart","kind":"bars|flow|compare|steps|number|plot",...trường như diagram ở trên (không title)...,"x":..,"y":..,"w":%,"h":%} · ' +
    '{"t":"arrow","from":"id","to":"id","curve":-1..1,"label":"≤3 chữ"} · {"t":"circle|underline|box|cross|check","on":"id"}',
    `x,y là TÂM của vật, tính theo % vùng vẽ (0-100). Vùng vẽ ${portrait ? 'DỌC (cao ≈ 1,7 lần rộng): xếp các vật theo chiều dọc, tiêu đề y≈6, nội dung y 20-90, mỗi hàng tối đa 2-3 vật' : 'NGANG (rộng ≈ 2 lần cao): xếp theo chiều ngang, tiêu đề y≈8, nội dung trải từ x 10 tới 90'}. Không để các vật chồng lên nhau; chừa khoảng trống giữa chúng.`,
    'Tên icon (tiếng Anh, chữ thường, nối gạch) chọn trong: ' + ICON_VOCAB + '. Có thể dùng tên icon Tabler khác nếu chắc chắn tồn tại.',
    portrait
      ? 'Ví dụ cảnh "Gửi 10 triệu, lãi 8%. 30 năm sau thành hơn 100 triệu.": {"kind":"sketch","items":[{"t":"text","id":"t","text":"Sức mạnh lãi kép","x":50,"y":6,"size":"l"},{"t":"underline","on":"t"},{"t":"icon","id":"p","name":"pig-money","x":24,"y":24,"w":26,"label":"10tr · 8%/năm","line":0,"cue":"Gửi 10 triệu"},{"t":"icon","id":"h","name":"hourglass","x":76,"y":24,"w":18,"label":"30 năm","line":1,"cue":"30 năm sau"},{"t":"arrow","from":"p","to":"h","line":0},{"t":"chart","kind":"bars","values":[21.6,46.6,100.6],"labels":["10 năm","20 năm","30 năm"],"unit":"tr","x":50,"y":66,"w":92,"h":42,"line":1,"cue":"hơn 100 triệu"}]}'
      : 'Ví dụ cảnh "Gửi 10 triệu, lãi 8%. 30 năm sau thành hơn 100 triệu.": {"kind":"sketch","items":[{"t":"text","id":"t","text":"Sức mạnh lãi kép","x":50,"y":8,"size":"l"},{"t":"underline","on":"t"},{"t":"icon","id":"p","name":"pig-money","x":14,"y":45,"w":13,"label":"10tr · 8%/năm","line":0,"cue":"Gửi 10 triệu"},{"t":"arrow","from":"p","to":"c","line":1},{"t":"chart","id":"c","kind":"bars","values":[21.6,46.6,100.6],"labels":["10 năm","20 năm","30 năm"],"unit":"tr","x":62,"y":58,"w":66,"h":72,"line":1,"cue":"30 năm sau"}]}',
  ].join('\n');
}

const DIAGRAM_SCHEMA =
  '"diagram" là hình bàn tay vẽ từng nét, một trong: ' +
  '{"kind":"bars","title":"≤6 chữ","start":"(tuỳ chọn) số ban đầu ≤6 ký tự, vd 10tr","values":[số],"labels":["≤12 ký tự"],"unit":"tr|%|..."} — 2-5 cột, tự vẽ mũi tên từ số ban đầu, đường cong xu hướng và khoanh cột lớn nhất; dùng cho tăng trưởng, so sánh số liệu · ' +
  '{"kind":"flow","title":"...","items":["≤3 chữ","≤3 chữ","..."]} — 2-4 ô nối mũi tên, dùng cho nguyên nhân → hệ quả, vòng lặp · ' +
  '{"kind":"compare","title":"...","left":"≤3 chữ (cách sai)","right":"≤3 chữ (cách đúng)","leftNote":"≤10 chữ","rightNote":"≤10 chữ"} · ' +
  '{"kind":"steps","title":"...","items":["≤10 chữ", "..."]} (2-4 bước) · ' +
  '{"kind":"number","number":"≤6 ký tự, vd 90% hoặc 3 lần","caption":"≤10 chữ"} · ' +
  '{"kind":"statement","text":"câu chốt ≤14 chữ"} · ' +
  '{"kind":"plot","fn":"linear|exp|log|sin|square|sqrt|down|wave","values":[(tuỳ chọn) dãy số thật],"xLabel":"≤2 chữ","yLabel":"≤2 chữ","caption":"≤4 chữ"} — đồ thị hàm số có trục toạ độ (tăng trưởng, xu hướng, công thức, khoa học) · ' +
  '{"kind":"stick","title":"(tuỳ chọn)","actors":[{"action":"idle|walk|run|wave|think|cheer|sad|point|shrug|jump","label":"≤2 chữ, vd Bạn, Sếp"}],"bubble":"lời thoại ≤8 chữ (tuỳ chọn)","caption":"≤8 chữ (tuỳ chọn)"} — 1-2 người que CHUYỂN ĐỘNG THẬT (đi, chạy, vẫy tay, ăn mừng...), dùng cho tình huống, cảm xúc, nhân vật; người đầu tiên nói câu trong bubble. Chỉ dùng số liệu có thật hoặc ví dụ minh hoạ đã nói rõ là ví dụ';

function systemPrompt(r: ScriptRequest) {
  if (r.scenes) return illustratePrompt(r);
  const scenes = Math.max(4, Math.min(14, Math.round(r.seconds / 5.5)));
  const visual = {
    sketch: 'Mọi cảnh dùng "diagram" kiểu "sketch" (bảng vẽ tự do, xem dưới).',
    images: 'Mọi cảnh dùng "panels": thường 1 khung; 2 khung chỉ khi cần đối lập hai hình.',
    diagram: 'Mọi cảnh dùng "diagram" (không dùng "panels"). Đa dạng kiểu: bars/flow/compare/steps/number cho ý và số liệu, stick (người que chuyển động) cho tình huống, nhân vật, cảm xúc (khoảng 1/4 số cảnh); statement chỉ cho câu chốt; không 2 cảnh liền nhau cùng kiểu.',
    mix: 'Cảnh có số liệu, so sánh, các bước, câu chốt hoặc tình huống đơn giản (stick) thì dùng "diagram"; cảnh kể chuyện cần hình chi tiết thì dùng "panels" (1 khung). Khoảng 50-70% cảnh là diagram.',
  }[r.visual];
  return [
    'Bạn là biên kịch video ngắn tiếng Việt kiểu "bàn tay vẽ" (whiteboard), chuyên viết video giữ chân người xem tới giây cuối. Viết đúng chủ đề người dùng đưa.',
    `Khoảng ${scenes} cảnh, tổng ~${r.seconds} giây lời đọc (~${Math.round(r.seconds * 2.6)} chữ). Mỗi cảnh 1-3 câu thoại, văn nói tự nhiên, xưng "bạn". Xen câu ngắn nhấn ý với câu dài giải thích, nối ý giữa các cảnh; không biến mọi câu thành khẩu hiệu hoặc thêm dấu ba chấm để kéo nhịp.`,
    'CẤU TRÚC BẮT BUỘC:',
    '1. HOOK (cảnh 1, ≤ 3 giây): một câu khiến người đang lướt phải dừng lại — câu hỏi chạm đúng nỗi đau, một sự thật bất ngờ, một mâu thuẫn ("càng... càng..."), hoặc lời hứa cụ thể. CẤM chào hỏi, cấm "hôm nay mình sẽ", cấm giới thiệu kênh.',
    '2. VÒNG LẶP TÒ MÒ (cảnh 1-2): gợi một điều chỉ được tiết lộ ở cuối (vd "điều thứ ba mới là thứ quyết định"), để người xem phải xem hết.',
    '3. THÂN BÀI: mỗi cảnh một ý, có ví dụ đời thường của người Việt; cứ 2-3 cảnh có một nhịp đảo chiều hoặc chi tiết bất ngờ. Không lan man.',
    '4. TRẢ LỜI vòng lặp tò mò rồi CHỐT bằng một câu ngắn, đáng nhớ, dễ trích lại.',
    '5. KÊU GỌI KHÉO (chỉ cảnh cuối, 1 câu, gắn với lợi ích của người xem): lưu lại ("lưu lại để lần sau…"), chia sẻ ("gửi cho người bạn đang…") hoặc bình luận bằng một câu hỏi dễ trả lời một chữ. Không xin like trực tiếp, không "nhớ đăng ký kênh".',
    'Số viết bằng chữ trong lời đọc khi đọc tự nhiên hơn. Không bịa số liệu, nghiên cứu, trích dẫn; nếu dùng con số minh hoạ thì nói rõ là ví dụ. Không đưa lời khuyên đầu tư, y tế, pháp lý cụ thể.',
    r.tone ? `Giọng văn: ${r.tone}.` : '',
    r.format ? 'DẠNG VIDEO (đã nhận diện, giữ đúng): ' + (FORMAT_NAMES as any)[r.format] + ' — ' + (FORMAT_BRIEF as any)[r.format] : '',
    r.niche && r.niche !== 'general' ? 'Ngách: ' + (NICHE_NAMES as any)[r.niche] + '. Dùng ví dụ, từ ngữ, ẩn dụ đúng ngách này.' : '',
    'HÌNH: ' + visual,
    r.extra ? 'YÊU CẦU THÊM CỦA CHỦ TRANG: ' + r.extra : '',
    '"panels": [{"prompt":"TIẾNG ANH, 1 hình minh hoạ đơn giản: chủ thể, hành động, đồ vật ẩn dụ; không chữ trong hình"}].',
    DIAGRAM_SCHEMA + '. Chữ trong diagram là tiếng Việt, rất ngắn, khớp ý câu thoại của cảnh.',
    r.visual === 'sketch' ? sketchSchema(r.ratio) : '',
    'Trả về DUY NHẤT JSON: {"title":"tiêu đề ≤ 70 ký tự gây tò mò","caption":"caption đăng bài ≤ 150 ký tự, kết bằng một câu hỏi mời bình luận","hashtags":["#tiengvietkhongdau", "... 5-8 thẻ"],"scenes":[{"lines":["câu 1","câu 2"],"panels":[...]} hoặc {"lines":[...],"diagram":{...}}]}',
  ].filter(Boolean).join('\n');
}

/** The user wrote the narration; the AI only designs a picture for each scene. */
function illustratePrompt(r: ScriptRequest) {
  return [
    'Bạn là hoạ sĩ minh hoạ video "bàn tay vẽ" tiếng Việt. Người dùng đã có kịch bản, chia sẵn thành cảnh. GIỮ NGUYÊN lời thoại, KHÔNG viết lại; chỉ thiết kế hình cho từng cảnh, đúng thứ tự, đúng số cảnh.',
    DIAGRAM_SCHEMA + '. Chữ trong hình là tiếng Việt, rất ngắn, khớp ý câu thoại của cảnh.',
    sketchSchema(r.ratio),
    r.format ? 'DẠNG VIDEO: ' + (FORMAT_NAMES as any)[r.format] + ' — ' + (FORMAT_BRIEF as any)[r.format] : '',
    r.extra ? 'YÊU CẦU THÊM CỦA CHỦ TRANG: ' + r.extra : '',
    `Trả về DUY NHẤT JSON: {"title":"tiêu đề ≤ 70 ký tự gây tò mò","caption":"caption đăng bài ≤ 150 ký tự, kết bằng câu hỏi","hashtags":["#..."],"scenes":[{"diagram":{"kind":"sketch","items":[...]}}, ... đúng ${r.scenes!.length} cảnh]}`,
  ].filter(Boolean).join('\n');
}

function parseJson(text: string) {
  const t = text.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { return null; }
}

export interface AiUsage { provider: TextProvider; model: string; tokensIn: number; tokensOut: number; tries: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const list = (v?: string) => (v || '').split(',').map((x) => x.trim()).filter(Boolean);

/** One chat call; throws an error carrying `status` so callers can decide to retry or switch model. */
async function callText(env: Env, provider: TextProvider, model: string, sys: string, user: string) {
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
    });
    if (!res.ok) throw Object.assign(new Error(`OpenAI ${model}: HTTP ${res.status}`), { status: res.status });
    const j: any = await res.json();
    return { text: j.choices?.[0]?.message?.content || '', tokensIn: j.usage?.prompt_tokens || 0, tokensOut: j.usage?.completion_tokens || 0 };
  }
  const flash = /flash/.test(model);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY!, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text: user }] }],
      // no hidden "thinking" on flash models: faster and cheaper, the brief is explicit enough
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192, ...(flash && /2\.5/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
    }),
  });
  if (!res.ok) throw Object.assign(new Error(`Gemini ${model}: HTTP ${res.status}`), { status: res.status });
  const j: any = await res.json();
  return { text: (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join(''), tokensIn: j.usageMetadata?.promptTokenCount || 0, tokensOut: j.usageMetadata?.candidatesTokenCount || 0 };
}

/**
 * Write (or illustrate) a script. Tries the chosen provider's model, retries once on overload,
 * moves to the fallback models, then to the other provider when it has a key, and repairs
 * malformed JSON once. Returns the parsed script and what it cost.
 */
export async function writeScript(env: Env, provider: TextProvider, r: ScriptRequest): Promise<any> {
  const sys = systemPrompt(r);
  const user = r.scenes ? 'KỊCH BẢN:\n' + r.scenes.map((l, i) => `Cảnh ${i + 1}: ` + l.map((x, k) => `[câu ${k}] ${x}`).join(' ')).join('\n') : 'CHỦ ĐỀ: ' + r.topic;
  const has = (p: TextProvider) => !!(p === 'openai' ? env.OPENAI_API_KEY : env.GEMINI_API_KEY);
  const plan: [TextProvider, string][] = [];
  for (const p of [provider, provider === 'openai' ? 'gemini' : 'openai'] as TextProvider[]) {
    if (!has(p)) continue;
    const models = p === 'openai' ? [env.OPENAI_TEXT_MODEL, ...list(env.OPENAI_TEXT_FALLBACK)] : [env.GEMINI_TEXT_MODEL, ...list(env.GEMINI_TEXT_FALLBACK)];
    for (const m of [...new Set(models.filter(Boolean))]) plan.push([p, m]);
  }
  if (!plan.length) throw new HttpError(503, 'Chưa có khoá AI nào. Hãy dùng "Kịch bản của tôi + tự minh hoạ" (miễn phí) hoặc nhờ quản trị nhập khoá.');
  const usage: AiUsage = { provider, model: '', tokensIn: 0, tokensOut: 0, tries: 0 };
  let lastErr = '';
  for (const [p, model] of plan) {
    for (let attempt = 0; attempt < 2; attempt++) {
      usage.tries++;
      try {
        const res = await callText(env, p, model, sys, user);
        Object.assign(usage, { provider: p, model }); usage.tokensIn += res.tokensIn; usage.tokensOut += res.tokensOut;
        let out = parseJson(res.text);
        if (!out || !Array.isArray(out.scenes)) {
          // one repair round: send the broken answer back
          const fix = await callText(env, p, model, 'Sửa đoạn sau thành JSON hợp lệ đúng cấu trúc yêu cầu ban đầu. Giữ nguyên nội dung. Chỉ trả JSON.', res.text.slice(0, 30000));
          usage.tokensIn += fix.tokensIn; usage.tokensOut += fix.tokensOut;
          out = parseJson(fix.text);
        }
        if (out && Array.isArray(out.scenes) && out.scenes.length) return { ...out, _usage: usage };
        lastErr = 'AI trả về chưa đúng định dạng';
        break; // try the next model
      } catch (e: any) {
        lastErr = e.message;
        if (e.status === 401 || e.status === 403) break; // bad key: this provider is out
        if (e.status === 429 || e.status >= 500) { await sleep(700 * (attempt + 1)); continue; }
        break;
      }
    }
  }
  throw new HttpError(502, `AI chưa viết được kịch bản (${lastErr}). Thử lại sau ít phút, hoặc dùng chế độ miễn phí.`);
}

export interface DrawnImage { bytes: Uint8Array; type: 'image/webp' | 'image/png'; ext: 'webp' | 'png' }

// Images arrive as base64 inside JSON. Ask for compressed WebP and decode with the native
// Buffer: decoding a multi-MB PNG in plain JS exceeds the Workers CPU limit.
export async function drawImage(env: Env, provider: ImageProvider, prompt: string): Promise<DrawnImage> {
  const full = LINE_ART_STYLE + prompt;
  const reason = async (res: Response) => ((await res.text()).match(/"message":\s*"([^"]{0,200})/)?.[1] || `HTTP ${res.status}`);
  if (provider === 'openai') {
    if (!env.OPENAI_API_KEY) throw new HttpError(503, 'Chủ trang chưa cấu hình khoá OpenAI.');
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: env.OPENAI_IMAGE_MODEL, prompt: full, size: '1536x1024', quality: env.OPENAI_IMAGE_QUALITY || 'medium', output_format: 'webp', output_compression: 85, n: 1 }),
    });
    if (!res.ok) throw new HttpError(502, `OpenAI chưa vẽ được ảnh: ${await reason(res)}`);
    const b64 = ((await res.json()) as any).data?.[0]?.b64_json;
    if (!b64) throw new HttpError(502, 'OpenAI không trả về ảnh.');
    return { bytes: new Uint8Array(Buffer.from(b64, 'base64')), type: 'image/webp', ext: 'webp' };
  }
  if (!env.GEMINI_API_KEY) throw new HttpError(503, 'Chủ trang chưa cấu hình khoá Gemini.');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_IMAGE_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: full }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:3' } } }),
  });
  if (!res.ok) throw new HttpError(502, `Gemini chưa vẽ được ảnh: ${await reason(res)}`);
  const part = (((await res.json()) as any).candidates?.[0]?.content?.parts || []).find((p: any) => p.inlineData?.data);
  if (!part) throw new HttpError(502, 'Gemini không trả về ảnh (mô tả có thể bị bộ lọc an toàn chặn).');
  return { bytes: new Uint8Array(Buffer.from(part.inlineData.data, 'base64')), type: 'image/png', ext: 'png' };
}
