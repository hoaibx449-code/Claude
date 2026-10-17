import { creativePrompt, creativeResult, type CreativeBrief } from './creative.ts';
import { designIssues } from './creation-policy.ts';
import { DIRECTOR_BRIEF, planDirections, directionIssues, cleanDirection } from '../../src/engine/director.ts';
import {ILLUSTRATED_BRIEF} from '../../addons/faciup-illustrated/schema.ts';
import { ACT_BRIEF } from './act.ts';
// Script writing (OpenAI or Gemini, chosen per request) and line-art images.
// Model output is treated as data: it goes through cleanSpec() before use.
import { Buffer } from 'node:buffer';
import { type Env, HttpError } from './util.ts';
import { FORMAT_BRIEF, FORMAT_NAMES, NICHE_NAMES } from './intent.ts';

export type TextProvider = 'openai' | 'gemini' | 'ollama';
export type ImageProvider = 'openai' | 'gemini';

export const LINE_ART_STYLE =
  'Hand-drawn black ink line art illustration, clean confident outlines, light cross-hatching only for shadows, ' +
  'no color, no gray fill, plain pure white background, no text, no letters, no frame, centered subject, 4:3 composition. Scene: ';

export type VisualMode = 'doodle' | 'sketch' | 'mix' | 'images' | 'diagram';

/** Documentary pictures: photographic, not line art. */
export const PHOTO_STYLE =
  'Cinematic documentary photograph, realistic, natural light, shallow depth of field, rich but natural colours, ' +
  'vertical-friendly composition with the subject centred, no text, no letters, no watermark, no logos. Scene: ';

const ICON_HINT = 'Tên icon là tên bộ Tabler Icons tiếng Anh, viết thường, gạch nối (vd cash, pig-money, wallet, brain, clock, home, briefcase, coffee, shopping-cart, building-bank, trending-up, trending-down, heart, target-arrow, bulb, mood-sad, mood-happy, school, book).';
/** What each format needs from the writer, and the per-scene "x" data it reads. */
import {whiteboardDirections} from '../../addons/faciup-whiteboard/brief.js';
export const LOOK_BRIEF: Record<string, string> = {
  director: DIRECTOR_BRIEF,
  act: ACT_BRIEF, illustrated:ILLUSTRATED_BRIEF,
  whiteboard: whiteboardDirections()+' Mỗi cảnh có x:{whiteboard:{title,meaning,objects}}, không panels. Giữ nguyên lời người dùng.',
  kinetic: 'ĐỊNH DẠNG: CHỮ BÙNG NỔ. Câu ngắn, mạnh, có con số cụ thể; mỗi câu ≤ 14 chữ. Mỗi cảnh có "x":{"icon":"icon chính","keys":["1-3 từ cần nhấn, đúng như trong câu"]}.',
  split: 'ĐỊNH DẠNG: HAI BÊN ĐỐI LẬP. Ở gốc JSON có "sides":{"a":"tên bên sai/nghèo/trước (≤ 20 ký tự)","b":"tên bên đúng/giàu/sau"}. Mỗi cảnh thân bài có đúng 2 câu: câu 1 nói bên A làm gì, câu 2 nói bên B làm gì, và "x":{"a":"bên A làm gì (≤ 40 ký tự)","b":"bên B làm gì","aIcon":"icon","bIcon":"icon","aValue":"(tuỳ chọn) kết quả bên A, vd 0đ","bValue":"(tuỳ chọn) kết quả bên B"}. Cảnh mở và kết chỉ cần "lines".',
  chat: 'ĐỊNH DẠNG: TIN NHẮN DRAMA. Kể câu chuyện bằng tin nhắn giữa "mình" và một người thân. Ở gốc JSON có "chatName":"tên người kia (vd Vợ yêu, Sếp, Mẹ, Bạn thân)". Mỗi câu thoại là một tin nhắn ngắn, văn nói; "x":{"chat":[{"who":"a hoặc b","text":"đúng nguyên câu thoại"}]} với a là người kia, b là mình. Cảnh cuối thêm "x":{"card":"câu bài học, là một trong các câu thoại của cảnh"}.',
  story: 'ĐỊNH DẠNG: KỂ CHUYỆN NGƯỜI QUE. Một nhân vật xuyên suốt, mỗi cảnh ở một nơi. Mỗi cảnh có "x":{"place":{"icon":"icon nơi chốn (home, briefcase, coffee, building-bank, school, shopping-cart, barbell, trees)","label":"tên nơi ≤ 14 ký tự"},"action":"idle|walk|run|wave|think|cheer|sad|point|shrug|jump","say":"lời nhân vật nói ≤ 30 ký tự","money":true nếu cảnh nói về tiêu tiền,"icons":["≤ 2 icon đồ vật"]}.',
  data: 'ĐỊNH DẠNG: CON SỐ BIẾT NÓI. Phần lớn cảnh xoay quanh một con số. Cảnh có số dùng "x":{"stat":{"value":số (không dấu chấm),"unit":"đ|triệu|%|lần|...","label":"con số này là gì ≤ 24 ký tự","parts":[{"label":"≤ 20 ký tự","value":số}] (tuỳ chọn, 2-5 phần, cùng đơn vị)}}. Con số phải là ví dụ minh hoạ và nói rõ là ví dụ, không bịa thống kê.',
  quiz: 'ĐỊNH DẠNG: ĐỐ VUI ĐẾM NGƯỢC. Xen kẽ cảnh HỎI và cảnh ĐÁP. Cảnh hỏi: đúng 1 câu hỏi, "pause":3, "x":{"quiz":{"q":"đúng câu hỏi","options":["2-4 đáp án rất ngắn"],"answer":chỉ số đáp án đúng (từ 0)}}. Cảnh đáp ngay sau: 1-2 câu giải thích, "x":{"quiz":{giống cảnh hỏi, thêm "reveal":true}}. Cảnh cuối mời bình luận đáp án.',
  doc: 'ĐỊNH DẠNG: PHIM TÀI LIỆU. Giọng kể điềm tĩnh, giàu hình ảnh, có bối cảnh thời gian và nơi chốn. Mỗi cảnh có "panels":[{"prompt":"TIẾNG ANH: mô tả một ảnh chụp điện ảnh chân thực cho cảnh này (bối cảnh, nhân vật, ánh sáng, góc máy), không chữ trong ảnh"}].',
};
export interface ScriptRequest {
  creative?: CreativeBrief;
  creativeRuntime?: {styles:string[];renderMode:string;recent?:string[]};
  topic: string; seconds: number; tone: string; ratio: string; visual: VisualMode;
  /** admin's extra instructions */ extra?: string;
  /** the user's own script, already split into scenes: the AI only designs the pictures */
  scenes?: string[][];
  /** detected kind of video and topic area (see intent.ts) */
  format?: string; niche?: string;
  /** video format (src/engine/looks.ts): asks for its scene data instead of drawings */
  look?: string;
  /** the format's brief as set on the training page (replaces the built-in one) */
  brief?: string;
  recentDirections?: string[];
}

const ICON_VOCAB = 'user, users, user-check, user-x, user-heart, user-star, friends, man, woman, baby-carriage, old, mood-happy, mood-sad, mood-cry, mood-angry, mood-confuzed, mood-sick, mood-nervous, mood-smile-beam, heart, heart-broken, heart-handshake, hearts, brain, bulb, bulb-off, message, message-circle, messages, speakerphone, microphone, thumb-up, thumb-down, hand-stop, hand-click, pointer, eye, eye-off, ear, search, zoom-question, question-mark, exclamation-mark, alert-triangle, alert-circle, info-circle, check, x, circle-check, circle-x, ban, lock, lock-open, key, shield, shield-check, fingerprint, home, building, building-skyscraper, building-bank, building-store, building-hospital, building-factory, school, briefcase, tent, cash, coin, coins, currency-dollar, pig-money, wallet, credit-card, receipt, receipt-tax, report-money, moneybag, basket, shopping-cart, shopping-bag, gift, tag, discount, percentage, calculator, chart-bar, chart-line, chart-pie, chart-arrows-vertical, trending-up, trending-down, arrow-up-right, arrow-down-right, scale, scale-outline, clock, alarm, hourglass, calendar, calendar-event, calendar-time, stopwatch, history, hourglass-high, device-mobile, device-laptop, device-desktop, device-tv, device-gamepad-2, wifi, world, cloud, database, server, robot, cpu, code, mail, phone, camera, photo, video, movie, music, headphones, car, bus, bike, plane, rocket, ship, truck, map, map-pin, route, road-sign, compass, globe, sun, moon, cloud-rain, snowflake, bolt, flame, droplet, leaf, plant, tree, seedling, mountain, beach, coffee, cup, tools-kitchen-2, pizza, apple, salad, bottle, beer, cake, candy, egg, fish, meat, milk, bed, zzz, run, walk, swimming, yoga, barbell, stretching, heartbeat, activity, pill, vaccine, stethoscope, first-aid-kit, virus, book, book-2, books, notebook, pencil, writing, certificate, award, trophy, medal, crown, star, stars, flag, target, target-arrow, puzzle, chess, chess-knight, dice-5, ladder, stairs-up, stairs-down, battery, battery-1, battery-4, plug, lamp, bell, bell-ringing, hammer, tool, tools, settings, adjustments, box, package, link, anchor, magnet, umbrella, paperclip, sparkles, confetti, balloon, mask, mood-crazy-happy, ghost, skull, bomb, fire-extinguisher, arrows-split, arrows-join, refresh, repeat, infinity, recycle, arrow-loop-right, arrows-exchange';

const freeVectorSchema = `SCHEMA BẢN VẼ TỰ DO: diagram:{kind:"sketch",items:[...]}, tối đa 18 vật/cảnh.
Mỗi vật có id (ngắn), line (chỉ số câu), cue (cụm từ có trong lời), thứ tự vẽ là thứ tự mảng.
Chữ: {t:"text",text:"ngắn",x:50,y:20,w:80,size:"s|m|l|xl|xxl",color:"#112233"}.
Hình tự vẽ: {t:"vector",x:50,y:50,w:60,h:40,paths:[[[0,0],[100,0],[100,100],[0,100],[0,0]]],color:"#112233",fill:false,stroke:3}.
x,y là tâm, w,h là phần trăm vùng vẽ. Mỗi điểm trong paths là tọa độ 0..100 tương đối bên trong vật. Tối đa 24 đường, 160 điểm/đường, tổng 1200 điểm/vật. Tự vẽ đường cong bằng các điểm liên tiếp. fill:true tô kín từng đường, giữ nguyên thứ tự lớp để chủ động chồng hình. Dùng nhiều vector màu khác nhau để tạo hình nhiều lớp. Không cần đường bao hình chữ nhật nếu ý tưởng không yêu cầu.
Mũi tên: {t:"arrow",from:"id1",to:"id2",color:"accent"}; đánh dấu t:circle/underline/box/cross/check với on:"id".
Chuyển động riêng với mode motion: thêm motion:{dx:10,dy:-5,rotate:20,scale:1.2} cho vật; dịch theo % khung hình từ vị trí ban đầu đến vị trí cuối trong cảnh, dx/dy từ -30..30, góc -180..180, scale .25..2. Chọn có chủ đích, không cho mọi vật nhấp nhô giống nhau. Các lớp tạo cùng vật phải có cùng motion. Không dùng thư viện icon/person/chart hoặc mẫu ví dụ. Tự nghĩ hình minh hoạ phù hợp từng lời.`;
function sketchSchema(ratio: string) {
  const portrait = ratio !== '16:9';
  return [
    'BẢNG VẼ TỰ DO: mỗi cảnh là MỘT BỐ CỤC VẼ TAY RIÊNG, nghĩ ra cho đúng ý câu thoại của cảnh đó, như một người vừa nói vừa phác ý lên bảng: chữ viết tay (từ khoá, con số), hình minh hoạ nét đơn (icon), người que chuyển động, mũi tên nối ý, khoanh tròn/gạch chân điểm nhấn, dấu ✗/✓, biểu đồ nhỏ. Video KHÔNG có phụ đề nên chữ trên bảng phải nêu được ý chính (ngắn).',
    'Mỗi cảnh 3-8 vật; mỗi cảnh một kiểu bố cục khác (ví dụ: tiêu đề + 3 icon nối mũi tên; người que + bong bóng thoại + icon; con số khổng lồ khoanh tròn; hai cột ✗/✓; chuỗi nguyên nhân → kết quả; biểu đồ có mũi tên và chú thích; ẩn dụ hình ảnh). Dùng ẩn dụ: tiền bay = icon cash + mũi tên đi ra; áp lực = người que sad + icon clock...',
    '"diagram":{"kind":"sketch","items":[...]} — items theo THỨ TỰ VẼ. KHỚP NHỊP: mỗi item nên có "line" (chỉ số câu thoại 0 hoặc 1) và "cue" (2-4 chữ CHÉP ĐÚNG từ câu thoại đó): vật được vẽ đúng lúc giọng đọc nói tới cụm từ ấy. Thứ tự vật theo thứ tự ý trong lời đọc:',
    '{"t":"text","id":"a","text":"≤6 chữ","x":50,"y":8,"size":"s|m|l|xl|xxl","color":"ink|accent|accent2|good"} (xxl cho con số lớn; accent = đỏ nhấn, accent2 = xanh) · ' +
    '{"t":"icon","id":"b","name":"tên icon","x":30,"y":40,"w":10-45 (% bề ngang),"label":"≤4 chữ (tuỳ chọn)"} · ' +
    '{"t":"person","id":"c","action":"idle|walk|run|wave|think|cheer|sad|point|shrug|jump","x":..,"y":..,"h":20-45 (% chiều cao),"facing":1|-1,"label":"≤2 chữ","bubble":"≤8 chữ (tuỳ chọn)"} (người que chuyển động thật) · ' +
    '{"t":"chart","kind":"bars|flow|compare|steps|number|plot|pie",...trường như diagram ở trên (không title)...,"x":..,"y":..,"w":%,"h":%} · ' +
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
  '{"kind":"pie","values":[2-5 số],"labels":["≤3 chữ"...],"caption":"≤4 chữ"} — biểu đồ tròn chia phần (tỉ lệ, cơ cấu, chi tiêu) · ' +
  '{"kind":"stick","title":"(tuỳ chọn)","actors":[{"action":"idle|walk|run|wave|think|cheer|sad|point|shrug|jump","label":"≤2 chữ, vd Bạn, Sếp"}],"bubble":"lời thoại ≤8 chữ (tuỳ chọn)","caption":"≤8 chữ (tuỳ chọn)"} — 1-2 người que CHUYỂN ĐỘNG THẬT (đi, chạy, vẫy tay, ăn mừng...), dùng cho tình huống, cảm xúc, nhân vật; người đầu tiên nói câu trong bubble. Chỉ dùng số liệu có thật hoặc ví dụ minh hoạ đã nói rõ là ví dụ';

function systemPrompt(r: ScriptRequest) {
  if (r.creative) return creativePrompt(r.creative, !!r.scenes, r.seconds, r.ratio, r.creativeRuntime) + '\n' + freeVectorSchema + '\nRiêng yêu cầu sáng tạo: số vật và số chữ theo dụng ý, cho phép cảnh chỉ có chữ; các ví dụ schema chỉ minh hoạ cú pháp, không sao chép bố cục.' + (r.extra ? '\nChỉ dẫn bổ sung: '+r.extra : '');
  if (r.look === 'director') return [
    r.scenes ? 'Giữ nguyên lời đọc và số cảnh; chỉ thiết kế direction cho từng cảnh.' : `Viết video tiếng Việt về đúng chủ đề, khoảng ${Math.max(4, Math.min(14, Math.round(r.seconds / 6)))} cảnh, tổng khoảng ${r.seconds} giây lời đọc = khoảng ${narrationTarget(r.seconds)} chữ (bắt buộc đủ độ dài), mỗi cảnh 1-3 câu. Nhịp dài ngắn theo ý, không buộc mọi video cùng công thức hook/danh sách/CTA.`,
    DIRECTOR_BRIEF, r.brief || '', r.extra || '', r.tone ? 'Giọng văn: ' + r.tone : '',
    r.ratio === '16:9' ? 'Khung ngang: ưu tiên mối quan hệ trái-phải.' : 'Khung dọc: giữ chữ ngắn, phân tầng hình rõ ràng.',
    r.recentDirections?.length ? 'Bố cục các video gần đây (tránh dùng lại chuỗi): ' + r.recentDirections.join('; ') : '',
    'Chỉ trả JSON {"title":"...","caption":"...","hashtags":[],"scenes":[{"lines":["..."],"direction":{...}}]}.'
  ].filter(Boolean).join('\n');
  if (r.scenes) return illustratePrompt(r);
  const scenes = Math.max(4, Math.min(14, Math.round(r.seconds / 5.5)));
  const visual = {
    doodle: 'Không cần mô tả hình: tranh được chọn tự động theo lời. Mỗi cảnh chỉ cần "lines" (1-2 câu, mỗi câu một ý có hình ảnh cụ thể).',
    sketch: 'Mọi cảnh dùng "diagram" kiểu "sketch" (bảng vẽ tự do, xem dưới).',
    images: 'Mọi cảnh dùng "panels": thường 1 khung; 2 khung chỉ khi cần đối lập hai hình.',
    diagram: 'Mọi cảnh dùng "diagram" (không dùng "panels"). Đa dạng kiểu: bars/flow/compare/steps/number cho ý và số liệu, stick (người que chuyển động) cho tình huống, nhân vật, cảm xúc (khoảng 1/4 số cảnh); statement chỉ cho câu chốt; không 2 cảnh liền nhau cùng kiểu.',
    mix: 'Cảnh có số liệu, so sánh, các bước, câu chốt hoặc tình huống đơn giản (stick) thì dùng "diagram"; cảnh kể chuyện cần hình chi tiết thì dùng "panels" (1 khung). Khoảng 50-70% cảnh là diagram.',
  }[r.visual];
  return [
    'Bạn là biên kịch video ngắn tiếng Việt kiểu "bàn tay vẽ" (whiteboard), chuyên viết video giữ chân người xem tới giây cuối. Viết đúng chủ đề người dùng đưa.',
    `Khoảng ${scenes} cảnh, tổng ~${r.seconds} giây lời đọc (~${Math.round(r.seconds * 2.6)} chữ). Mỗi cảnh 1-3 câu thoại, văn nói tự nhiên, xưng "bạn". Xen câu ngắn nhấn ý với câu dài giải thích, nối ý giữa các cảnh; không biến mọi câu thành khẩu hiệu hoặc thêm dấu ba chấm để kéo nhịp.`,
    'Chọn cấu trúc kể từ ý nghĩa nội dung. Không áp một công thức hook/vòng lặp tò mò/danh sách/CTA cho mọi video. Không bắt buộc kêu gọi tương tác.',
    'Mỗi cảnh phải có một mục đích minh hoạ cụ thể; thay đổi mật độ, vị trí và nhịp xuất hiện theo câu nói. Không lặp một bố cục rồi chỉ thay chữ/icon. Nếu không có dữ liệu, không tự vẽ biểu đồ giả.',
    'Các cách mở/thân/kết sau là gợi ý, chỉ dùng khi phù hợp:',
    '1. HOOK (cảnh 1, ≤ 3 giây): một câu khiến người đang lướt phải dừng lại — câu hỏi chạm đúng nỗi đau, một sự thật bất ngờ, một mâu thuẫn ("càng... càng..."), hoặc lời hứa cụ thể. CẤM chào hỏi, cấm "hôm nay mình sẽ", cấm giới thiệu kênh.',
    '2. VÒNG LẶP TÒ MÒ (cảnh 1-2): gợi một điều chỉ được tiết lộ ở cuối (vd "điều thứ ba mới là thứ quyết định"), để người xem phải xem hết.',
    '3. THÂN BÀI: mỗi cảnh một ý, có ví dụ đời thường của người Việt; cứ 2-3 cảnh có một nhịp đảo chiều hoặc chi tiết bất ngờ. Không lan man.',
    '4. TRẢ LỜI vòng lặp tò mò rồi CHỐT bằng một câu ngắn, đáng nhớ, dễ trích lại.',
    '5. KÊU GỌI KHÉO (chỉ cảnh cuối, 1 câu, gắn với lợi ích của người xem): lưu lại ("lưu lại để lần sau…"), chia sẻ ("gửi cho người bạn đang…") hoặc bình luận bằng một câu hỏi dễ trả lời một chữ. Không xin like trực tiếp, không "nhớ đăng ký kênh".',
    'Số viết bằng chữ trong lời đọc khi đọc tự nhiên hơn. Không bịa số liệu, nghiên cứu, trích dẫn; nếu dùng con số minh hoạ thì nói rõ là ví dụ. Không đưa lời khuyên đầu tư, y tế, pháp lý cụ thể.',
    r.tone ? `Giọng văn: ${r.tone}.` : '',
    r.format ? 'Mục đích nội dung (tham khảo, không áp đặt bố cục): ' + (FORMAT_NAMES as any)[r.format] : '',
    r.niche && r.niche !== 'general' ? 'Ngách: ' + (NICHE_NAMES as any)[r.niche] + '. Dùng ví dụ, từ ngữ, ẩn dụ đúng ngách này.' : '',
    r.look ? (r.brief || LOOK_BRIEF[r.look]) + ' ' + ICON_HINT : 'HÌNH: ' + visual,
    r.extra ? 'YÊU CẦU THÊM CỦA CHỦ TRANG: ' + r.extra : '',
    r.look || r.visual === 'doodle' ? '' : '"panels": [{"prompt":"TIẾNG ANH, 1 hình minh hoạ đơn giản: chủ thể, hành động, đồ vật ẩn dụ; không chữ trong hình"}].',
    r.look || r.visual === 'doodle' ? '' : DIAGRAM_SCHEMA + '. Chữ trong diagram là tiếng Việt, rất ngắn, khớp ý câu thoại của cảnh.',
    !r.look && r.visual === 'sketch' ? sketchSchema(r.ratio) : '',
    r.look === 'act' ? 'Trả về DUY NHẤT JSON: {"title":"tiêu đề ≤ 70 ký tự gây tò mò","caption":"caption ≤ 150 ký tự, kết bằng câu hỏi","hashtags":["#... 5-8 thẻ"],"cast":[...],"scenes":[{"lines":["câu 1","câu 2"],"act":{...}}]}'
      : r.look ? 'Trả về DUY NHẤT JSON: {"title":"tiêu đề ≤ 70 ký tự gây tò mò","caption":"caption ≤ 150 ký tự, kết bằng câu hỏi","hashtags":["#... 5-8 thẻ"], (các trường gốc của định dạng nếu có), "scenes":[{"lines":["câu 1","câu 2"],"x":{...}}]}' : '',
    r.look ? '' : 'Trả về DUY NHẤT JSON: {"title":"tiêu đề ≤ 70 ký tự gây tò mò","caption":"caption đăng bài ≤ 150 ký tự, kết bằng một câu hỏi mời bình luận","hashtags":["#tiengvietkhongdau", "... 5-8 thẻ"],"scenes":[{"lines":["câu 1","câu 2"],"panels":[...]} hoặc {"lines":[...],"diagram":{...}}]}',
  ].filter(Boolean).join('\n');
}

/** The user wrote the narration; the AI only designs a picture for each scene. */
function illustratePrompt(r: ScriptRequest) {
  if (r.look) return [
    'Người dùng đã có kịch bản tiếng Việt, chia sẵn thành cảnh. GIỮ NGUYÊN lời thoại, KHÔNG viết lại; chỉ thêm dữ liệu hình cho từng cảnh, đúng thứ tự, đúng số cảnh.',
    (r.brief || LOOK_BRIEF[r.look]) + ' ' + ICON_HINT,
    r.extra ? 'YÊU CẦU THÊM CỦA CHỦ TRANG: ' + r.extra : '',
    r.look === 'act' ? `Trả về DUY NHẤT JSON: {"title":"tiêu đề ≤ 70 ký tự gây tò mò","caption":"caption ≤ 150 ký tự, kết bằng câu hỏi","hashtags":["#..."],"cast":[...],"scenes":[{"act":{...}}, ... đúng ${r.scenes!.length} cảnh, "at" dùng L0/L1 theo câu của cảnh]}`
      : `Trả về DUY NHẤT JSON: {"title":"tiêu đề ≤ 70 ký tự gây tò mò","caption":"caption ≤ 150 ký tự, kết bằng câu hỏi","hashtags":["#..."], (các trường gốc của định dạng nếu có), "scenes":[{"x":{...}}, ... đúng ${r.scenes!.length} cảnh, cảnh đố vui có thêm "pause"]}`,
  ].filter(Boolean).join('\n');
  return [
    'Bạn là hoạ sĩ minh hoạ video "bàn tay vẽ" tiếng Việt. Người dùng đã có kịch bản, chia sẵn thành cảnh. GIỮ NGUYÊN lời thoại, KHÔNG viết lại; chỉ thiết kế hình cho từng cảnh, đúng thứ tự, đúng số cảnh.',
    DIAGRAM_SCHEMA + '. Chữ trong hình là tiếng Việt, rất ngắn, khớp ý câu thoại của cảnh.',
    sketchSchema(r.ratio),
    r.format ? 'Mục đích nội dung (tham khảo): ' + (FORMAT_NAMES as any)[r.format] : '',
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
/**
 * How much hidden "thinking" a Gemini model may do before answering (it counts against the output
 * limit and the wait): none on 2.5 Flash, a little on 2.5 Pro, "low" on Gemini 3.
 */
export function geminiThinking(model: string): Record<string, unknown> {
  if (/2\.5/.test(model)) return { thinkingConfig: { thinkingBudget: /flash/.test(model) ? 0 : 1024 } };
  if (/gemini-3/.test(model)) return { thinkingConfig: { thinkingLevel: 'low' } };
  return {};
}
/** POST to Gemini; when a model refuses the thinking setting, ask again without it. */
async function geminiPost(env: Env, model: string, body: any, timeoutMs: number) {
  const go = (b: any) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'x-goog-api-key': env.GEMINI_API_KEY!, 'content-type': 'application/json' }, signal: AbortSignal.timeout(timeoutMs), body: JSON.stringify(b) });
  let res = await go(body);
  if (res.status === 400 && body.generationConfig?.thinkingConfig) {
    const t = await res.clone().text();
    if (/thinking/i.test(t)) { const { thinkingConfig, ...gc } = body.generationConfig; res = await go({ ...body, generationConfig: gc }); }
  }
  return res;
}
const list = (v?: string) => (v || '').split(',').map((x) => x.trim()).filter(Boolean);

/**
 * The order in which text models are tried, following the system's own choice: the provider the
 * admin picked (Quản trị → Cài đặt → AI viết kịch bản, or a feature's own choice), its main model then
 * its fallback models (Cài đặt → Mô hình AI), and only then the other provider if it has a key.
 */
// A provider whose key is refused, or a model that is overloaded or gone, is skipped for a while
// instead of being asked (and failing) before every answer.
const down = new Map<string, number>();
export function noteFailure(provider: TextProvider, model: string, status: number, text = '') {
  const now = Date.now();
  if (status === 401 || status === 403) down.set(provider, now + 10 * 60_000);
  // "exceeded your current quota" is the whole key for the day, not one busy model
  else if (status === 429 && /quota|billing/i.test(text)) down.set(provider, now + 30 * 60_000);
  else if (status === 404 || /no longer available|not found|not supported/i.test(text)) down.set(provider + ':' + model, now + 30 * 60_000);
  else if (status === 429 || status === 503) down.set(provider + ':' + model, now + 60_000);
}
const isDown = (p: string, m: string) => [p, p + ':' + m].some((k) => (down.get(k) || 0) > Date.now());
/** A refused key or a used-up quota: the provider's other models would fail the same way. */
export const providerOut = (p: string) => (down.get(p) || 0) > Date.now();
/** What is paused right now and until when (admin connection check). */
export const downState = () => [...down].filter(([, t]) => t > Date.now()).map(([k, t]) => ({ key: k, until: t }));
export const clearDown = () => down.clear();
const PROVIDER_NAME: Record<TextProvider, string> = { gemini: 'Gemini', openai: 'OpenAI', ollama: 'Ollama' };
/** Why each provider in the order will or will not be asked (shown with "AI chưa viết được"). */
export function planNotes(env: Env, provider: TextProvider) {
  const order = [...new Set([provider, ...list(env.AI_ORDER).filter(isTextProvider), ...TEXT_PROVIDERS])];
  return order.map((p) => ({ provider: p, name: PROVIDER_NAME[p], ready: hasTextAI(env, p),
    why: hasTextAI(env, p) ? (providerOut(p) ? 'đang tạm nghỉ do lỗi khoá/hết hạn mức' : '') : p === 'ollama' ? 'chưa nhập địa chỉ hoặc khoá Ollama' : 'chưa có khoá' }));
}
/** "Gemini: HTTP 429 (hết hạn mức); Ollama: chưa nhập địa chỉ…" */
function triedSummary(env: Env, provider: TextProvider, tried: Map<string, string>) {
  return planNotes(env, provider).map((n) => `${n.name}: ${tried.get(n.provider) || n.why || 'chưa thử'}`).join('; ');
}
const errText = (e: any) => String(e?.message || e).replace(/^(Gemini|OpenAI|Ollama) /, '').slice(0, 140) + (e?.status === 429 ? ' — quá tải hoặc hết hạn mức' : e?.status === 401 || e?.status === 403 ? ' — khoá bị từ chối' : e?.status === 404 ? ' — không có model này' : '');

const TEXT_PROVIDERS: TextProvider[] = ['gemini', 'openai', 'ollama'];
/** Whether a provider can be asked: a key (Gemini, OpenAI) or a server address (Ollama). */
export function hasTextAI(env: Env, p: TextProvider) {
  return p === 'openai' ? !!env.OPENAI_API_KEY : p === 'gemini' ? !!env.GEMINI_API_KEY : !!(env.OLLAMA_URL && env.OLLAMA_TEXT_MODEL);
}
/** Whether any AI can write: used to switch AI features on or off. */
export const anyTextAI = (env: Env) => TEXT_PROVIDERS.some((p) => hasTextAI(env, p));
export const isTextProvider = (v: unknown): v is TextProvider => TEXT_PROVIDERS.includes(v as TextProvider);

/**
 * The order models are tried in: the provider asked for (a feature's own choice), then the order set
 * in Quản trị → Cài đặt → Thứ tự AI; each provider's main model, then its fallback models. Providers
 * without a key or address are skipped.
 */
export function textPlan(env: Env, provider: TextProvider): [TextProvider, string][] {
  const order = [...new Set([provider, ...list(env.AI_ORDER).filter(isTextProvider), ...TEXT_PROVIDERS])];
  const models = (p: TextProvider) => p === 'openai' ? [env.OPENAI_TEXT_MODEL, ...list(env.OPENAI_TEXT_FALLBACK)]
    : p === 'gemini' ? [env.GEMINI_TEXT_MODEL, ...list(env.GEMINI_TEXT_FALLBACK)] : [env.OLLAMA_TEXT_MODEL || '', ...list(env.OLLAMA_TEXT_FALLBACK)];
  const plan: [TextProvider, string][] = [];
  for (const p of order) {
    if (!hasTextAI(env, p)) continue;
    for (const m of [...new Set(models(p).filter(Boolean))]) plan.push([p, m]);
  }
  // working ones first; if everything is marked down, still try them all
  const up = plan.filter(([p, m]) => !isDown(p, m));
  return up.length ? up : plan;
}

/** Ollama chat (own server or Ollama Cloud): JSON answer, optional bearer key. */
async function ollamaChat(env: Env, model: string, messages: any[], maxTokens: number, timeoutMs: number) {
  const res = await fetch(env.OLLAMA_URL + '/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(env.OLLAMA_API_KEY ? { authorization: `Bearer ${env.OLLAMA_API_KEY}` } : {}) },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model, messages, stream: false, format: 'json', options: { num_predict: Math.min(maxTokens, 16384) } }),
  });
  if (!res.ok) { const t = await res.text().catch(() => ''); noteFailure('ollama', model, res.status, t); throw Object.assign(new Error(`Ollama ${model}: HTTP ${res.status} ${t.slice(0, 120)}`), { status: res.status }); }
  const j: any = await res.json();
  return { text: j.message?.content || '', tokensIn: j.prompt_eval_count || 0, tokensOut: j.eval_count || 0, finish: j.done_reason === 'length' ? 'MAX_TOKENS' : '' };
}

/** One chat call; throws an error carrying `status` so callers can decide to retry or switch model. */
async function callText(env: Env, provider: TextProvider, model: string, sys: string, user: string, maxTokens = 16384, timeoutMs?: number) {
  if (provider === 'ollama') return ollamaChat(env, model, [{ role: 'system', content: sys }, { role: 'user', content: user }], maxTokens, timeoutMs || (maxTokens < 4000 ? 25_000 : 120_000));
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, response_format: { type: 'json_object' }, max_tokens: Math.min(maxTokens, 16000), messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
    if (!res.ok) { const t = await res.text().catch(() => ''); noteFailure('openai', model, res.status, t); throw Object.assign(new Error(`OpenAI ${model}: HTTP ${res.status}`), { status: res.status }); }
    const j: any = await res.json();
    return { text: j.choices?.[0]?.message?.content || '', tokensIn: j.usage?.prompt_tokens || 0, tokensOut: j.usage?.completion_tokens || 0 };
  }
  // little hidden "thinking": faster and cheaper, the brief is explicit enough
  const res = await geminiPost(env, model, {
    systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens, ...geminiThinking(model) },
  }, timeoutMs || (maxTokens < 4000 ? 25_000 : 120_000));
  if (!res.ok) { const t = await res.text().catch(() => ''); noteFailure('gemini', model, res.status, t); throw Object.assign(new Error(`Gemini ${model}: HTTP ${res.status}`), { status: res.status }); }
  const j: any = await res.json();
  return { text: (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join(''), tokensIn: j.usageMetadata?.promptTokenCount || 0, tokensOut: j.usageMetadata?.candidatesTokenCount || 0 };
}

/**
 * Write (or illustrate) a script. Tries the chosen provider's model, retries once on overload,
 * moves to the fallback models, then to the other provider when it has a key, and repairs
 * malformed JSON once. Returns the parsed script and what it cost.
 */
/** Vietnamese narration speed used to size scripts: about 2.6 spoken words (syllables) a second. */
export const WORDS_PER_SECOND = 2.6;
export const narrationTarget = (seconds: number) => Math.round(seconds * WORDS_PER_SECOND);
export const narrationWords = (out: any) => (out?.scenes || []).reduce((n: number, sc: any) => n + (Array.isArray(sc?.lines) ? sc.lines : []).join(' ').split(/\s+/).filter(Boolean).length, 0);

export async function writeScript(env: Env, provider: TextProvider, r: ScriptRequest): Promise<any> {
  const sys = systemPrompt(r);
  const user = r.scenes ? 'KỊCH BẢN:\n' + r.scenes.map((l, i) => `Cảnh ${i + 1}: ` + l.map((x, k) => `[câu ${k}] ${x}`).join(' ')).join('\n') : 'CHỦ ĐỀ: ' + r.topic;
  const plan = textPlan(env, provider);
  if (!plan.length) throw new HttpError(503, 'Chưa có khoá AI nào. Nhờ quản trị cấu hình kết nối AI để thiết kế video.');
  const usage: AiUsage = { provider, model: '', tokensIn: 0, tokensOut: 0, tries: 0 };
  let lastErr = '';
  const tried = new Map<string, string>();
  for (const [p, model] of plan) {
    if (providerOut(p) && plan.some(([q]) => q !== p && !providerOut(q))) { tried.set(p, tried.get(p) || 'tạm nghỉ do lỗi khoá/hết hạn mức'); continue; }
    for (let attempt = 0; attempt < 2; attempt++) {
      usage.tries++;
      try {
        const res = await callText(env, p, model, sys, user);
        Object.assign(usage, { provider: p, model }); usage.tokensIn += res.tokensIn; usage.tokensOut += res.tokensOut;
        let out = parseJson(res.text);
        if (r.creative && out?.cannotFulfill) creativeResult(out);
        if (!out || !Array.isArray(out.scenes)) {
          // one repair round: send the broken answer back
          const fix = await callText(env, p, model, 'Sửa đoạn sau thành JSON hợp lệ đúng cấu trúc yêu cầu ban đầu. Giữ nguyên nội dung. Chỉ trả JSON.', res.text.slice(0, 30000));
          usage.tokensIn += fix.tokensIn; usage.tokensOut += fix.tokensOut;
          out = parseJson(fix.text);
        }
        if (out && Array.isArray(out.scenes) && out.scenes.length && !r.scenes && r.seconds >= 30) {
          // models often write far less than asked (19 s for a 60 s video): one pass to reach the length
          const want = narrationTarget(r.seconds), have = narrationWords(out);
          if (have < want * 0.75) {
            try {
              const more = await callText(env, p, model, sys + `\nLỜI ĐỌC QUÁ NGẮN: bản dưới có ${have} chữ (~${Math.round(have / WORDS_PER_SECOND)} giây), cần khoảng ${want} chữ (~${r.seconds} giây). Viết lại TOÀN BỘ JSON đúng cấu trúc cũ: thêm cảnh và câu có nội dung thật (ví dụ, giải thích, bước làm, số liệu), không lặp ý, không kéo dài bằng từ đệm. Chỉ trả JSON.`, JSON.stringify(out).slice(0, 30000));
              usage.tokensIn += more.tokensIn; usage.tokensOut += more.tokensOut;
              const longer = parseJson(more.text);
              if (Array.isArray(longer?.scenes) && narrationWords(longer) > have) out = { ...out, ...longer };
            } catch { /* keep the shorter script rather than fail */ }
          }
        }
        if (out && Array.isArray(out.scenes) && out.scenes.length) {
          if (r.look === 'director') {
            const original = r.scenes || out.scenes.map((s: any) => Array.isArray(s.lines) ? s.lines.slice(0, 3) : []);
            out.scenes = original.map((lines: string[], i: number) => ({ lines, direction: out.scenes[i]?.direction }));
            const issues = out.scenes.flatMap((s: any, i: number) => {
              const d = cleanDirection(s.direction, s.lines);
              return !d ? [`Cảnh ${i + 1}: thiếu thiết kế`] : directionIssues(d).map((x) => `Cảnh ${i + 1}: ${x}`);
            });
            const repeated = out.scenes.some((s: any, i: number) => i > 0 && s.direction?.composition === out.scenes[i - 1].direction?.composition);
            if (issues.length || repeated) {
              // One bounded critique/repair pass; preserve the narration even if repair changes it.
              try {
                const fix = await callText(env, p, model, DIRECTOR_BRIEF + '\nRà soát storyboard. Sửa chồng chữ/vật và chuỗi cảnh lặp. Giữ lời đọc. Trả JSON {scenes:[{direction:...}]}.', JSON.stringify({ issues, repeated, scenes: out.scenes }));
                usage.tokensIn += fix.tokensIn; usage.tokensOut += fix.tokensOut;
                const revised = parseJson(fix.text);
                if (revised?.scenes?.length === original.length) out.scenes = original.map((lines: string[], i: number) => ({ lines, direction: revised.scenes[i]?.direction || out.scenes[i].direction }));
              } catch { /* retain the first design; bounded local repair below */ }
            }
            out.scenes = planDirections(out.scenes, r.recentDirections?.flatMap((x) => x.split(',')).slice(0, 4));
          }
          if (r.creative) creativeResult(out);
          if (!r.look || r.look === 'kinetic') {
            const check = (value: any) => designIssues(r.scenes ? {...value,scenes:(value.scenes||[]).map((s:any,i:number)=>({...s,lines:r.scenes?.[i]||[]}))} : value,r.look,r.scenes?.length,!!r.creative);
            let issues = check(out);
            if (issues.length && r.creative) {
              const fixed = await callText(env,p,model,sys+'\nSỬA CẤU TRÚC theo lỗi trả về. Mỗi cảnh dùng diagram:{kind:"sketch",items:[...]}; nếu cần biểu đồ, tự vẽ bằng vector và chữ; không dùng chart, icon hoặc person có sẵn. Tối đa 18 vật/cảnh. Giữ yêu cầu sáng tạo, mode/style/approach và nguyên lời đọc. Trả toàn bộ JSON đã sửa.',JSON.stringify({issues,originalNarration:r.scenes,design:out}));
              usage.tokensIn+=fixed.tokensIn;usage.tokensOut+=fixed.tokensOut;
              const revised=parseJson(fixed.text);
              if(revised?.scenes){out={...out,...revised};creativeResult(out);issues=check(out);}
            }
            if (issues.length) { lastErr = issues.slice(0, 3).join('; '); break; }
          }
          return { ...out, _usage: usage };
        }
        lastErr = 'AI trả về chưa đúng định dạng';
        tried.set(p, `${model}: trả về chưa đúng định dạng`);
        break; // try the next model
      } catch (e: any) {
        if (e.status === 422) throw e;
        lastErr = e.message; tried.set(p, errText(e));
        if (providerOut(p) || e.status === 401 || e.status === 403) break; // bad key or no quota: this provider is out
        if ((e.status === 429 || e.status >= 500) && attempt === 0) { await sleep(700); continue; }
        break;
      }
    }
  }
  throw new HttpError(502, `AI chưa viết được kịch bản. Đã thử theo thứ tự — ${triedSummary(env, provider, tried) || lastErr}. Quản trị: kiểm tra ở Cài đặt → Kiểm tra kết nối. Không tạo bản dựng theo mẫu thay thế.`);
}

export interface DrawnImage { bytes: Uint8Array; type: 'image/webp' | 'image/png'; ext: 'webp' | 'png' }

// Images arrive as base64 inside JSON. Ask for compressed WebP and decode with the native
// Buffer: decoding a multi-MB PNG in plain JS exceeds the Workers CPU limit.
export async function drawImage(env: Env, provider: ImageProvider, prompt: string, kind: 'line' | 'photo' | 'cartoon' = 'line', portrait = true): Promise<DrawnImage> {
  const photo = kind === 'photo';
  const full = (kind==='cartoon'?'Colorful expressive 2D cartoon illustration, clean organic outlines, subtle shading, full intact subject, isolated on pure white background, centered square composition, no text, no letters, no logos, no frame. Depict exactly this subject: ':kind === 'photo' ? PHOTO_STYLE : LINE_ART_STYLE) + prompt;
  const reason = async (res: Response) => ((await res.text()).match(/"message":\s*"([^"]{0,200})/)?.[1] || `HTTP ${res.status}`);
  if (provider === 'openai') {
    if (!env.OPENAI_API_KEY) throw new HttpError(503, 'Chủ trang chưa cấu hình khoá OpenAI.');
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: env.OPENAI_IMAGE_MODEL, prompt: full, size: kind==='cartoon'?'1024x1024':photo && portrait ? '1024x1536' : '1536x1024', quality: env.OPENAI_IMAGE_QUALITY || 'medium', output_format: 'webp', output_compression: 85, n: 1 }),
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
    body: JSON.stringify({ contents: [{ parts: [{ text: full }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: kind==='cartoon'?'1:1':photo ? (portrait ? '9:16' : '16:9') : '4:3' } } }),
  });
  if (!res.ok) throw new HttpError(502, `Gemini chưa vẽ được ảnh: ${await reason(res)}`);
  const part = (((await res.json()) as any).candidates?.[0]?.content?.parts || []).find((p: any) => p.inlineData?.data);
  if (!part) throw new HttpError(502, 'Gemini không trả về ảnh (mô tả có thể bị bộ lọc an toàn chặn).');
  return { bytes: new Uint8Array(Buffer.from(part.inlineData.data, 'base64')), type: 'image/png', ext: 'png' };
}

// ---------------------------------------------------------------- training page: learn a format from a sample
export interface FormatProposal { name: string; summary: string; base: string; structure: string[]; pacing: string; visuals: string; audio: string; brief: string; stages: string[] }

/**
 * Look at a sample video (a few frames the admin's browser took from it, plus notes) and propose
 * a new format: what makes it work, which built-in format it builds on, and the brief to add.
 */
/** One call with pictures (training page). Throws with `status`; `finish` tells why an answer stopped. */
async function callVision(env: Env, provider: TextProvider, model: string, sys: string, text: string, imgs: { mime: string; data: string }[]) {
  if (provider === 'ollama') return ollamaChat(env, model, [{ role: 'system', content: sys }, { role: 'user', content: text, images: imgs.map((i) => i.data) }], 4096, 120_000);
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({ model, response_format: { type: 'json_object' }, max_tokens: 4096, messages: [{ role: 'system', content: sys },
        { role: 'user', content: [{ type: 'text', text }, ...imgs.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}`, detail: 'low' } }))] }] }),
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok) { noteFailure('openai', model, res.status, j.error?.message); throw Object.assign(new Error(`OpenAI ${model}: ${j.error?.message || 'HTTP ' + res.status}`), { status: res.status }); }
    return { text: j.choices?.[0]?.message?.content || '', finish: j.choices?.[0]?.finish_reason || '', tokensIn: j.usage?.prompt_tokens || 0, tokensOut: j.usage?.completion_tokens || 0 };
  }
  // models "think" first and that counts against the output limit: with pictures it used to eat the
  // whole budget, leaving a cut JSON ("chưa phân tích được"). Keep thinking low, leave room to answer.
  const res = await geminiPost(env, model, { systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text }, ...imgs.map((i) => ({ inlineData: { mimeType: i.mime, data: i.data } }))] }],
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 16384, ...geminiThinking(model) } }, 120_000);
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) { noteFailure('gemini', model, res.status, j.error?.message); throw Object.assign(new Error(`Gemini ${model}: ${j.error?.message || 'HTTP ' + res.status}`), { status: res.status }); }
  const c = j.candidates?.[0];
  if (!c) throw Object.assign(new Error(`Gemini ${model}: không có câu trả lời${j.promptFeedback?.blockReason ? ' (chặn: ' + j.promptFeedback.blockReason + ')' : ''}`), { status: 400 });
  return { text: (c.content?.parts || []).map((p: any) => p.text || '').join(''), finish: c.finishReason === 'STOP' ? '' : c.finishReason || '', tokensIn: j.usageMetadata?.promptTokenCount || 0, tokensOut: j.usageMetadata?.candidatesTokenCount || 0 };
}

export async function analyzeSample(env: Env, frames: string[], notes: string, provider: TextProvider = 'gemini'): Promise<FormatProposal & { _usage: { provider: string; tokensIn: number; tokensOut: number } }> {
  const looks = Object.entries(LOOK_BRIEF).map(([k, v]) => `- ${k}: ${v.slice(0, 160)}`).join('\n');
  const sys = [
    'Bạn là đạo diễn video ngắn (TikTok, Reels, Shorts) và nhà thiết kế hệ thống dựng video tự động.',
    'Phân tích video mẫu (các khung hình theo thứ tự thời gian và ghi chú của chủ trang) để đề xuất MỘT định dạng video mới cho máy dựng tự động tiếng Việt.',
    'Máy dựng có các định dạng gốc:\n' + looks,
    'Chọn định dạng gốc gần nhất làm nền ("base"), rồi viết "brief": lời dặn thêm cho AI biên kịch để video ra giống mẫu (nhịp, bố cục, cách kể, hành động nhân vật, chữ trên hình, âm thanh). Viết tiếng Việt, cụ thể, có thể làm được với định dạng gốc; không đòi hỏi thứ máy dựng không có.',
    'Trả DUY NHẤT JSON: {"name":"tên định dạng ≤ 30 ký tự","summary":"vì sao mẫu này giữ chân người xem (2-3 câu)","base":"một mã định dạng gốc","structure":["các phần của video theo thứ tự"],"pacing":"nhịp: độ dài cảnh, khi nào có bước ngoặt","visuals":"hình ảnh, nhân vật, bố cục, chữ","audio":"giọng, nhạc, hiệu ứng","brief":"lời dặn cho AI (≤ 1200 ký tự)","stages":["các bước triển khai từ thử nghiệm tới phát hành"]}',
  ].join('\n');
  const text = 'GHI CHÚ CỦA CHỦ TRANG: ' + (notes || '(không có)') + (frames.length ? `\nCó ${frames.length} khung hình đính kèm theo thứ tự.` : '\nKhông có khung hình, chỉ dựa vào ghi chú.');
  const imgs = frames.slice(0, 6).map((d) => { const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(d); return m ? { mime: m[1], data: m[2] } : null; }).filter(Boolean) as { mime: string; data: string }[];
  let out: any = null, usage = { provider: '', tokensIn: 0, tokensOut: 0 };
  if (!env.GEMINI_API_KEY && !env.OPENAI_API_KEY) throw new HttpError(503, 'Cần khoá Gemini hoặc OpenAI để phân tích mẫu.');
  // every model in turn (main, then fallbacks, then the other provider); one retry when busy
  const plan = textPlan(env, provider);
  const errors: string[] = [];
  for (const [p, model] of plan) {
    for (let attempt = 0; attempt < 2 && !out; attempt++) {
      try {
        const r = await callVision(env, p, model, sys, text, imgs);
        usage = { provider: p, tokensIn: usage.tokensIn + r.tokensIn, tokensOut: usage.tokensOut + r.tokensOut };
        out = parseJson(r.text);
        if (!out) { errors.push(`${model}: trả lời không phải JSON${r.finish ? ' (' + r.finish + ')' : ''}`); break; }
      } catch (e: any) {
        errors.push(String(e.message || e).slice(0, 160));
        if (e.status === 429 || e.status >= 500) { await sleep(1500); continue; }
        break;
      }
    }
    if (out) break;
  }
  if (!out) throw new HttpError(502, 'AI chưa phân tích được mẫu: ' + (errors.at(-1) || 'không rõ lý do') + '. Thử lại sau ít phút, hoặc bớt khung hình / thêm ghi chú.', { tried: errors.slice(0, 6) });
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => s(x, 200)).filter(Boolean).slice(0, 10) : []);
  return { name: s(out.name, 40) || 'Định dạng mới', summary: s(out.summary, 600), base: Object.keys(LOOK_BRIEF).includes(out.base) && out.base !== 'doc' ? out.base : 'act',
    structure: arr(out.structure), pacing: s(out.pacing, 500), visuals: s(out.visuals, 600), audio: s(out.audio, 400), brief: s(out.brief, 3000), stages: arr(out.stages), _usage: usage };
}


// ---------------------------------------------------------------- Zalo assistant
/** Actual rendered frames, paired with the source graph. Suggestions never replace narration. */
export async function reviewDirectionFrames(env: Env, frames: string[], scenes: any[], provider: TextProvider) {
  if (!frames.length || frames.length > 6 || frames.some((f) => !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(f) || f.length > 400000)) throw new HttpError(400, 'Cần 1–6 ảnh xem trước JPEG hợp lệ.');
  const imgs = frames.map((f) => ({ mime: 'image/jpeg', data: f.split(',')[1] }));
  const sys = DIRECTOR_BRIEF + '\nĐây là khung hình thực đã dựng theo storyboard. Kiểm tra chữ tràn, chồng vật, minh hoạ không khớp lời và cảnh lặp. Chỉ đề xuất sửa direction; không sửa lời đọc. Trả JSON {notes:["nhận xét cụ thể"],scenes:[{direction:...}]} đúng số cảnh.';
  let last = '';
  for (const [p, model] of textPlan(env, provider)) {
    try {
      const r = await callVision(env, p, model, sys, JSON.stringify(scenes.map((s) => ({ lines: s.lines, direction: s.direction }))), imgs);
      const out = parseJson(r.text);
      if (!out || !Array.isArray(out.scenes) || out.scenes.length !== scenes.length) { last = 'AI trả thiếu cảnh.'; continue; }
      return { scenes: planDirections(scenes.map((s, i) => ({ ...s, direction: out.scenes[i]?.direction || s.direction }))),
        notes: (Array.isArray(out.notes) ? out.notes : []).filter((x: any) => typeof x === 'string').slice(0, 8).map((x: string) => x.slice(0, 300)),
        _usage: { provider: p, model, tokensIn: r.tokensIn, tokensOut: r.tokensOut, tries: 1 } };
    } catch (e: any) { last = String(e.message); }
  }
  throw new HttpError(502, 'Chưa rà soát được bản dựng: ' + last.slice(0, 160));
}

export interface AssistantTurn { role: 'user' | 'bot'; text: string }
export interface AssistantAnswer { reply: string; intent: 'chat' | 'make_video' | 'status' | 'human' | 'buy' | 'clarify' | 'samples' | 'settings' | 'optout'; topic: string; plan: string; usage: { provider: string; model: string; tokensIn: number; tokensOut: number }
  /** everything else the model returned (customer profile, stage, chosen frame/voice/format…) */ extra: Record<string, any> }

/**
 * One answer of the staff-like assistant: a short reply plus what the person wants (a video, their
 * status, a human). Tries the text model, its fallbacks, then the other provider.
 */
/**
 * A chat answer within `deadlineMs` in total: a webhook call may only work about 30 seconds after
 * answering Zalo, so a slow or overloaded model is cut off and the caller answers without AI instead
 * of the customer waiting for nothing.
 */
export async function assistantAnswer(env: Env, sys: string, history: AssistantTurn[], question: string, provider: TextProvider = 'gemini', deadlineMs = 18_000): Promise<AssistantAnswer> {
  const plan = textPlan(env, provider), end = Date.now() + deadlineMs;
  if (!plan.length) throw new HttpError(503, 'Chưa có khoá AI.');
  const convo = history.slice(-10).map((t) => `${t.role === 'user' ? 'KHÁCH' : 'BẠN'}: ${t.text.slice(0, 600)}`).join('\n');
  const user = (convo ? 'HỘI THOẠI GẦN ĐÂY:\n' + convo + '\n\n' : '') + 'TIN MỚI CỦA KHÁCH: ' + question.slice(0, 2000);
  let last = '';
  for (const [p, model] of plan) {
    if (providerOut(p) && plan.some(([q]) => q !== p && !providerOut(q))) continue;
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = end - Date.now();
      if (left < 3000) throw new HttpError(504, 'AI trả lời quá chậm: ' + (last || 'hết thời gian'));
      try {
        // a short answer: little to generate; one model may use at most 12 seconds of the budget
        const r = await callText(env, p, model, sys, user, 2048, Math.min(left - 500, 12_000));
        const j = parseJson(r.text);
        if (!j || typeof j.reply !== 'string' || !j.reply.trim()) { last = `${model}: trả lời không đúng dạng`; break; }
        const intent = ['chat', 'make_video', 'status', 'human', 'buy', 'clarify', 'samples', 'settings', 'optout'].includes(j.intent) ? j.intent : 'chat';
        const { reply: _r, intent: _i, topic: _t, plan: _p, ...extra } = j;
        return { reply: j.reply.trim().slice(0, 1500), intent, topic: typeof j.topic === 'string' ? j.topic.trim().slice(0, 300) : '', plan: typeof j.plan === 'string' ? j.plan.trim().slice(0, 40) : '', usage: { provider: p, model, tokensIn: r.tokensIn, tokensOut: r.tokensOut }, extra };
      } catch (e: any) {
        last = String(e.message || e).slice(0, 160);
        // a busy model is not waited for: the next one answers now
        break;
      }
    }
  }
  throw new HttpError(502, 'AI chưa trả lời được: ' + last);
}

export interface GatewayCheck {
  provider: TextProvider; name: string; configured: boolean; address?: string; key: boolean; ms?: number; status?: number; error?: string; hint?: string;
  models: string[]; tests: { model: string; role: string; ok: boolean; status?: number; ms: number; error?: string }[];
}
/**
 * Connection check for one AI gateway: lists the models the key may use, then asks each chosen model
 * (main and fallbacks) for a tiny JSON answer. Errors are explained in plain words for the admin.
 */
export async function checkGateway(env: Env, p: TextProvider): Promise<GatewayCheck> {
  const out: GatewayCheck = { provider: p, name: PROVIDER_NAME[p], configured: hasTextAI(env, p), key: !!(p === 'gemini' ? env.GEMINI_API_KEY : p === 'openai' ? env.OPENAI_API_KEY : env.OLLAMA_API_KEY), models: [], tests: [] };
  const chosen = p === 'gemini' ? [env.GEMINI_TEXT_MODEL, ...list(env.GEMINI_TEXT_FALLBACK)] : p === 'openai' ? [env.OPENAI_TEXT_MODEL, ...list(env.OPENAI_TEXT_FALLBACK)] : [env.OLLAMA_TEXT_MODEL || '', ...list(env.OLLAMA_TEXT_FALLBACK)];
  if (p === 'ollama') out.address = env.OLLAMA_URL || '';
  if (!out.configured) {
    out.hint = p === 'ollama' ? 'Nhập địa chỉ máy chủ Ollama (hoặc chỉ khoá Ollama Cloud, địa chỉ tự là https://ollama.com) và tên model, rồi Lưu cài đặt.' : `Chưa có khoá ${out.name}: dán khoá ở mục Khoá API rồi Lưu cài đặt.`;
    return out;
  }
  const t0 = Date.now();
  try {
    const r = p === 'gemini' ? await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': env.GEMINI_API_KEY! }, signal: AbortSignal.timeout(15_000) })
      : p === 'openai' ? await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(15_000) })
      : await fetch(env.OLLAMA_URL + '/api/tags', { headers: env.OLLAMA_API_KEY ? { authorization: `Bearer ${env.OLLAMA_API_KEY}` } : {}, signal: AbortSignal.timeout(15_000) });
    const j: any = await r.json().catch(() => ({}));
    out.status = r.status; out.ms = Date.now() - t0;
    if (!r.ok) out.error = String(j.error?.message || j.error || 'HTTP ' + r.status).slice(0, 200);
    out.models = p === 'gemini' ? (j.models || []).filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m: any) => String(m.name).replace('models/', '')).filter((n: string) => /gemini|gemma/.test(n))
      : p === 'openai' ? (j.data || []).map((m: any) => String(m.id)).filter((n: string) => /^(gpt|o\d|chatgpt)/.test(n)).sort()
      : (j.models || []).map((m: any) => String(m.name || m.model));
    out.models = out.models.slice(0, 80);
  } catch (e: any) { out.ms = Date.now() - t0; out.error = String(e.message).slice(0, 200); }
  if (out.status === 401 || out.status === 403 || /api key|unauthorized|invalid.*key/i.test(out.error || '')) out.hint = 'Khoá bị từ chối: kiểm tra lại khoá (sai, hết hạn hoặc chưa bật API).';
  else if (out.error && p === 'ollama') out.hint = 'Không gọi được máy chủ Ollama: địa chỉ phải mở được từ Internet (không dùng localhost), đúng https và cổng.';
  await Promise.all([...new Set(chosen.filter(Boolean))].map(async (model, i) => {
    const t1 = Date.now();
    try {
      const r = await callText(env, p, model, 'Trả DUY NHẤT JSON.', 'Trả JSON {"ok":true}', 2048, 45_000);
      out.tests.push({ model, role: i ? 'dự phòng' : 'chính', ok: !!parseJson(r.text), ms: Date.now() - t1, error: parseJson(r.text) ? undefined : 'trả lời không phải JSON' });
    } catch (e: any) { out.tests.push({ model, role: i ? 'dự phòng' : 'chính', ok: false, status: e.status, ms: Date.now() - t1, error: errText(e) }); }
  }));
  out.tests.sort((a, b) => (a.role === 'chính' ? -1 : 0) - (b.role === 'chính' ? -1 : 0));
  // a check must not leave the gateway paused: the admin is fixing it right now
  clearDown();
  if (!out.hint && out.tests.some((t) => t.status === 429)) out.hint = 'HTTP 429: hết hạn mức miễn phí hoặc quá tải. Chờ hạn mức hồi lại, nâng gói, hoặc đưa AI khác lên đầu Thứ tự AI.';
  if (!out.hint && out.tests.some((t) => t.status === 404)) out.hint = 'Có model không tồn tại với khoá này: chọn model trong danh sách "Model khả dụng".';
  return out;
}
