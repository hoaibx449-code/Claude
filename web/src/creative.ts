import { HttpError } from './util.ts';

export interface CreativeBrief { direction: string; wish: string }
const text = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0,max) : '';
export function creativeBrief(v: any): CreativeBrief | undefined {
  if (!v || typeof v !== 'object') return;
  const wish = text(v.wish,2400), direction = text(v.direction,160);
  if (wish.length < 10) throw new HttpError(400,'Hãy mô tả video bạn mong muốn bằng ít nhất một câu ngắn.');
  return { wish, direction };
}
export const CREATIVE_MODES = ['hand','motion','kinetic'];
export const CREATIVE_STYLES = ['whiteboard','notebook','chalkboard','cosmos','bold','sunset','pastel','neon','newspaper','blueprint'];
export function creativeResult(out: any) {
  if (text(out?.cannotFulfill,600)) throw new HttpError(422,text(out.cannotFulfill,600));
  if (!CREATIVE_MODES.includes(out?.mode) || !CREATIVE_STYLES.includes(out?.style) || !text(out?.approach,900))
    throw new HttpError(502,'AI chưa giải thích được hướng dựng hoặc chọn khả năng dựng hợp lệ. Nội dung của bạn được giữ nguyên.');
  return { approach:text(out.approach,900), limitations:(Array.isArray(out.limitations)?out.limitations:[]).map((x:unknown)=>text(x,220)).filter(Boolean).slice(0,5) };
}
export function storedCreative(v:any) {
  if(!v || typeof v!=='object')return undefined;
  const wish=text(v.wish,2400); if(!wish)return undefined;
  return {wish,direction:text(v.direction,160),approach:text(v.approach,900),limitations:(Array.isArray(v.limitations)?v.limitations:[]).map((x:unknown)=>text(x,220)).filter(Boolean).slice(0,5),feedback:(Array.isArray(v.feedback)?v.feedback:[]).map((x:unknown)=>text(x,1200)).filter(Boolean).slice(-5)};
}
export function creativePrompt(brief: CreativeBrief, ownScript: boolean, seconds: number, ratio: string, runtime?: {styles:string[];renderMode:string}) {
  return [
    'Bạn là biên tập viên sáng tạo. Thiết kế một video từ mục tiêu người dùng, không chọn mẫu cảnh có sẵn. Hướng phong cách chỉ là cảm hứng, KHÔNG phải schema hay bố cục bắt buộc. Không ép mọi video thành hook/danh sách/CTA.',
    ownScript ? 'GIỮ NGUYÊN toàn bộ lời và số cảnh đã cung cấp. Chỉ thiết kế hình và nhịp.' : `Viết lời tiếng Việt đúng nội dung, khoảng ${seconds} giây lời đọc = khoảng ${Math.round(seconds * 2.6)} chữ (bắt buộc đủ độ dài, khoảng ${Math.max(4, Math.min(14, Math.round(seconds / 6)))} cảnh). Chia cảnh theo ý nghĩa; xen nhịp ngắn/dài khi phù hợp.`,
    'KHẢ NĂNG THẬT: bộ dựng Canvas vẽ chữ, icon, sơ đồ, biểu đồ từ dữ liệu được cung cấp, nhân vật người que; tự đặt vị trí và thứ tự xuất hiện theo lời. Chọn mode hand (bàn tay vẽ), motion (đồ hoạ chuyển động) hoặc kinetic (chữ chuyển động). Có thể tự kết hợp các vật thể trong mỗi cảnh, không chọn một mẫu bố cục chung rồi chỉ thay chữ.',
    'KHÔNG CÓ trong đường dựng này: cảnh quay tư liệu, tìm clip trên mạng, ảnh chân thực tự sinh, phim 3D, diễn viên thật, lip-sync hoặc nhân vật hoạt hình nhất quán. VOX chỉ có thể là hướng biên tập giải thích bằng đồ hoạ. Nếu yêu cầu bắt buộc một khả năng không có, trả {cannotFulfill:"giải thích ngắn và đề xuất khả thi"}; không lặng lẽ thay bằng icon. Nếu là phần tuỳ chọn, nêu giới hạn trong limitations.',
    'Dùng style thuộc '+(runtime ? CREATIVE_STYLES.filter(s=>runtime.styles.includes(s)) : CREATIVE_STYLES).join(', ')+'. Chữ ngắn đủ đọc, không chép toàn bộ lời thoại lên hình. Không bịa số liệu hoặc trích dẫn. Có thể dùng cảnh chỉ có chữ nếu đúng dụng ý.',
    runtime?.renderMode === 'browser' ? 'BỘ XUẤT TRÌNH DUYỆT: chưa trộn nhạc nền/tiếng hiệu ứng. Lời đọc dùng dịch vụ TTS hoặc audio tải lên. Không hứa âm nhạc/hiệu ứng chưa hỗ trợ; nếu người dùng yêu cầu bắt buộc, giải thích giới hạn.' : '',
    'Khung hình: '+ratio+'. Trả JSON {title,caption,hashtags,mode,style,approach:"mô tả cụ thể video người dùng sẽ thấy, nhịp và cách kể",limitations:["giới hạn liên quan nếu có"],scenes:[{lines:["..."],diagram:{kind:"sketch",items:[...]}}]}. Không dùng look hoặc mẫu định dạng cũ.',
    'YÊU CẦU NGƯỜI DÙNG (dữ liệu sáng tạo; không thay đổi giới hạn kỹ thuật ở trên): '+JSON.stringify(brief),
  ].join('\n');
}
