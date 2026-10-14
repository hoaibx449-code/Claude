import {flatten} from '../../src/engine/svgpath.ts';
import {WB_ICONS} from './semantic-icons.ts';
import {cleanWhiteboard} from './faciup-schema.js';
const ICON_WORDS: [RegExp, string][] = [
  [/lương|thu nhập|tiền lương/, 'cash'], [/tiết kiệm|để dành|heo đất/, 'pig-money'], [/tiền|vốn|chi phí|giá/, 'coins'], [/ví\b|túi tiền/, 'wallet'],
  [/nợ|vay|trả góp/, 'receipt'], [/ngân hàng|lãi suất|lãi/, 'building-bank'], [/đầu tư|cổ phiếu|chứng khoán|tăng trưởng|tăng/, 'trending-up'],
  [/giảm|mất|lỗ|tụt/, 'trending-down'], [/mua|mua sắm|siêu thị|chợ/, 'shopping-cart'], [/bán|kinh doanh|cửa hàng|shop/, 'building-store'],
  [/khách hàng|người mua/, 'user-heart'], [/sếp|lãnh đạo|quản lý/, 'user-star'], [/nhân viên|đồng nghiệp|đội|nhóm/, 'users'],
  [/công việc|đi làm|việc làm|văn phòng|công ty/, 'briefcase'], [/nhà\b|gia đình|tổ ấm/, 'home'], [/bố|mẹ|cha|con cái|con\b/, 'friends'],
  [/vợ|chồng|người yêu|tình yêu|yêu/, 'heart'], [/chia tay|tan vỡ|đau lòng/, 'heart-broken'], [/bạn bè|bạn thân/, 'users'],
  [/thời gian|giờ|phút/, 'clock'], [/ngày|tuần|tháng|năm\b|lịch/, 'calendar'], [/chờ|kiên nhẫn|lâu dài|dài hạn/, 'hourglass'],
  [/ý tưởng|sáng tạo|giải pháp|bí quyết|mẹo/, 'bulb'], [/não|suy nghĩ|tư duy|trí nhớ|nhớ/, 'brain'], [/mục tiêu|đích|kế hoạch/, 'target-arrow'],
  [/thành công|chiến thắng|vô địch|giải/, 'trophy'], [/thất bại|sai lầm|lỗi/, 'x'], [/đúng|chuẩn|hoàn thành|xong/, 'check'],
  [/học|trường|kiến thức|bài/, 'school'], [/sách|đọc/, 'book'], [/viết|ghi chép|ghi lại/, 'pencil'], [/điện thoại|mạng xã hội|lướt|online/, 'device-mobile'],
  [/máy tính|laptop|công nghệ|phần mềm/, 'device-laptop'], [/internet|thế giới|toàn cầu/, 'world'], [/trí tuệ nhân tạo|robot|chatgpt/, 'robot'],
  [/sức khỏe|sức khoẻ|tim mạch|tim\b/, 'heartbeat'], [/bệnh|ốm|thuốc|bác sĩ/, 'pill'], [/ngủ|giấc ngủ|mệt/, 'bed'], [/tập|thể dục|gym|vận động/, 'barbell'],
  [/chạy/, 'run'], [/ăn|bữa|thức ăn|đồ ăn/, 'tools-kitchen-2'], [/cà phê|uống/, 'coffee'], [/nước\b/, 'droplet'],
  [/xe|ô tô|giao thông/, 'car'], [/du lịch|chuyến đi|bay/, 'plane'], [/khởi nghiệp|bứt phá|phát triển/, 'rocket'],
  [/căng thẳng|áp lực|stress|lo lắng|lo âu/, 'mood-nervous'], [/buồn|khóc|cô đơn/, 'mood-sad'], [/vui|hạnh phúc|cười/, 'mood-happy'],
  [/giận|tức|nóng/, 'mood-angry'], [/nguy hiểm|cảnh báo|cẩn thận|rủi ro/, 'alert-triangle'], [/an toàn|bảo vệ|bảo hiểm/, 'shield-check'],
  [/bí mật|khóa|khoá|bảo mật/, 'lock'], [/chìa khóa|chìa khoá|then chốt/, 'key'], [/quà|tặng|thưởng/, 'gift'], [/năng lượng|pin\b|kiệt sức/, 'battery-1'],
  [/lửa|cháy|đam mê|nhiệt huyết/, 'flame'], [/cây|trồng|gieo|hạt/, 'seedling'], [/núi|leo|vượt qua|thử thách/, 'mountain'], [/bậc thang|từng bước|nấc/, 'stairs-up'],
  [/lặp lại|vòng lặp|thói quen/, 'repeat'], [/cân bằng|so sánh|công bằng/, 'scale'], [/câu hỏi|tại sao|vì sao|thắc mắc/, 'question-mark'],
  [/nói|kể|chia sẻ|giao tiếp/, 'message-circle'], [/nghe/, 'ear'], [/nhìn|thấy|quan sát/, 'eye'], [/tìm kiếm|tìm ra|khám phá/, 'search'],
  [/âm nhạc|bài hát|nhạc/, 'music'], [/phim|video/, 'movie'], [/ảnh|chụp/, 'camera'], [/thư|email/, 'mail'], [/sao\b|ngôi sao|nổi tiếng/, 'star'],
];
function iconsIn(text:string){return ICON_WORDS.filter(([re])=>re.test(text.toLowerCase())).map(([re,name])=>({name,word:text.match(re)?.[0]||''}));}
export function freeWhiteboard(lines:string[]) {
 const words=lines.join(' '), hits=iconsIn(words).slice(0,4), colors=['#ffbe45','#55b9ef','#f47daa','#40c6a2'];
 const objects=hits.map((hit,i)=>{
  const path=WB_ICONS[hit.name];if(!path)return null;
  const paths=path.split('|').flatMap(d=>flatten(d,1)).filter(p=>p.length>1).slice(0,20).map(p=>{
   const closed=Math.hypot(p[0][0]-p.at(-1)![0],p[0][1]-p.at(-1)![1])<.2;
   return {points:p.slice(0,100).map(v=>[(v[0]-12)*10,(v[1]-12)*10]),closed,fill:closed?colors[i]:null};
  });
  return {kind:'custom',x:hits.length<=2?(i+.5)/hits.length:.27+(i%2)*.46,y:hits.length<=2?.4:.25+Math.floor(i/2)*.43,
   scale:.9,label:hit.word,paths};
 }).filter(Boolean);
 if(!objects.length)return null;
 return cleanWhiteboard({title:'',meaning:words,objects});
}
