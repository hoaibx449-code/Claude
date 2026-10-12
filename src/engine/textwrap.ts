// Vietnamese-aware line breaking. Vietnamese words are written as separate syllables
// ("tiết kiệm", "đầu tư"), so breaking at any space can split a word in two. We pick
// breaks with a small dynamic programme: lines must fit, should be balanced, prefer breaking
// after punctuation or before a function word ("và", "của", "để"...), never strand a single
// syllable on the last line and never separate a number from its unit.
import type { Ctx } from './types.ts';

// words that usually start a new phrase: breaking just before them reads naturally
const LEADS = new Set(('và hoặc hay nhưng mà thì là của cho với để khi nếu vì nên do bởi các những một mỗi mọi này đó kia ấy rồi cũng đã đang sẽ ' +
  'không chưa chẳng rất quá được bị ở trong ngoài trên dưới từ đến tới như hơn bằng theo về sau trước giữa cùng chỉ vẫn còn lại ai gì nào sao đâu').split(' '));
// common two-syllable words that must stay on one line
const WORDS = new Set(['tiết kiệm','đầu tư','chi tiêu','lãi suất','lãi kép','thói quen','sức khỏe','sức khoẻ','thành công','thất bại','kinh doanh','khách hàng','sản phẩm','công việc','gia đình','cuộc sống','hạnh phúc','tài chính','tiền bạc','thu nhập','mục tiêu','kế hoạch','thời gian','giấc ngủ','căng thẳng','áp lực','suy nghĩ','tư duy','kiến thức','học tập','kỹ năng','kinh nghiệm','cảm xúc','tâm lý','quan hệ','bạn bè','người yêu','vợ chồng','con cái','bố mẹ','cha mẹ','ông bà','nhà cửa','xe cộ','điện thoại','mạng xã','xã hội','công nghệ','trí tuệ','nhân tạo','thị trường','cổ phiếu','chứng khoán','ngân hàng','bảo hiểm','rủi ro','lợi nhuận','doanh thu','chi phí','giá trị','chất lượng','số lượng','hiệu quả','năng suất','năng lượng','động lực','kỷ luật','kiên nhẫn','tự tin','lo lắng','sợ hãi','buồn bã','vui vẻ','yêu thương','tình yêu','tình bạn','thế giới','lịch sử','văn hóa','văn hoá','kinh tế','chính trị','giáo dục','y tế','bệnh viện','bác sĩ','ăn uống','thức ăn','đồ ăn','nước uống','cà phê','buổi sáng','buổi tối','hôm nay','ngày mai','tương lai','quá khứ','hiện tại','bí quyết','bí mật','sai lầm','vấn đề','giải pháp','nguyên nhân','kết quả','lý do','ví dụ','câu hỏi','trả lời','đầu tiên','cuối cùng','quan trọng','đơn giản','phức tạp','nhanh chóng','dễ dàng','khó khăn','thử thách','cơ hội','phát triển','thay đổi','cải thiện','bắt đầu','kết thúc','tiếp tục','làm việc','đi làm','nghỉ ngơi','thư giãn','tập luyện','thể dục','cân nặng','giảm cân','sức mạnh','trí nhớ','tập trung','sáng tạo','ý tưởng','nội dung','khởi nghiệp','nhân viên','đồng nghiệp','lãnh đạo','quản lý','ông chủ','mua sắm','giảm giá','khuyến mãi','đánh giá','trải nghiệm','người dùng','người giàu','người nghèo','giàu có','tự do','tài sản','nợ nần','tín dụng','tiền lương','tiền lãi','khẩn cấp','mỗi ngày','mỗi tháng','mỗi năm','cuối tháng','đầu tháng','thông minh','học sinh','sinh viên','giáo viên','thầy cô','trường học','bài học','bài tập','thi cử','điểm số','công thức','phương pháp','chiến lược','kỹ thuật','máy tính','phần mềm','ứng dụng','dữ liệu','an toàn','bảo mật','nguy hiểm','cẩn thận','chú ý','lưu ý','nhớ lại','lưu lại','chia sẻ','bình luận','theo dõi','đăng ký','miễn phí','giá rẻ','đắt đỏ','hàng hóa','hàng hoá','cửa hàng','bán hàng','mua hàng','thương hiệu','quảng cáo','tiếp thị','doanh nghiệp','công ty','văn phòng','nhà máy','nông dân','công nhân','thanh niên','người trẻ','người già','trẻ em','phụ nữ','đàn ông','con người','thiên nhiên','môi trường','khí hậu','thời tiết','mùa hè','mùa đông','du lịch','nghỉ hưu','lương hưu','hôn nhân','ly hôn','chia tay','cô đơn','tình cảm','niềm tin','hy vọng','ước mơ','đam mê','mục đích','ý nghĩa','thói xấu','năng lực','trách nhiệm','tôn trọng','lắng nghe','giao tiếp','thuyết phục','đàm phán','tranh cãi','xung đột','hòa giải','tha thứ','biết ơn','cảm ơn','xin lỗi']);
const UNITS = /^(%|tr|triệu|tỷ|nghìn|ngàn|k|đ|đồng|usd|\$|lần|năm|tháng|tuần|ngày|giờ|phút|giây|tuổi|người|bước|kg|km|m|cm)[.,!?]?$/i;

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}%$]/gu, '');

/** Cost of breaking the line between words a and b (0 = natural, higher = worse). */
function breakCost(a: string, b: string) {
  if (/[,.;:!?…)”"]$/.test(a)) return 0;
  if (/^\d/.test(a) && UNITS.test(b)) return 200; // "10 | triệu"
  if (/^[(“"]/.test(b)) return 0;
  const na = norm(a), nb = norm(b);
  if (WORDS.has(na + ' ' + nb)) return 200;
  if (LEADS.has(na)) return 30; // dangling "của", "và" at the end of a line
  if (LEADS.has(nb)) return 1;
  return 45; // two content syllables: may be one word
}

/** Break `text` into lines no wider than `max` (px, using the current font). */
export function wrapVi(c: Ctx, text: string, size: number, max: number, font = 'Pangolin'): string[] {
  c.font = `${size}px ${font}`;
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const space = c.measureText(' ').width;
  const ws = words.map((w) => c.measureText(w).width);
  const n = words.length;
  const full = ws.reduce((a, b) => a + b, 0) + space * (n - 1);
  if (full <= max) return [words.join(' ')];
  // best[i] = cost of laying out words[i..] ; next[i] = index where the next line starts
  const best = new Array(n + 1).fill(Infinity), next = new Array(n + 1).fill(n);
  best[n] = 0;
  for (let i = n - 1; i >= 0; i--) {
    let w = 0;
    for (let j = i; j < n; j++) {
      w += ws[j] + (j > i ? space : 0);
      if (w > max && j > i) break;
      const last = j === n - 1;
      const slack = Math.max(0, max - w) / max;
      // balanced lines: the last one may be shorter, but not much
      let cost = last ? (i > 0 ? slack * slack * 40 : 0) : slack * slack * 100 + breakCost(words[j], words[j + 1]);
      if (last && j === i && n > 1) cost += 40; // a lone syllable on the last line
      if (last && j - i < 1 && w < max * 0.25) cost += 20;
      cost += best[j + 1];
      if (cost < best[i]) { best[i] = cost; next[i] = j + 1; }
    }
    if (best[i] === Infinity) { best[i] = best[i + 1] + 1000; next[i] = i + 1; } // a single word wider than the line
  }
  const out: string[] = [];
  for (let i = 0; i < n; i = next[i]) out.push(words.slice(i, next[i]).join(' '));
  return out;
}
