// Open Doodles (Pablo Stanley, CC0) bundled in assets/doodles: detailed line-art people revealed
// by the hand's zigzag stroke, as in the product proposal's "kể chuyện 9:16" sample.
// Pictures are picked from the words of each line; a video never repeats one until all are used.

/** Name (file assets/doodles/<name>.svg) → words that call for it. */
export const DOODLES: [string, RegExp][] = [
  ['ReadingDoodle', /đọc|sách|kiến thức|nghiên cứu|tìm hiểu/],
  ['SittingReadingDoodle', /học|bài giảng|ôn|thi cử|kỳ thi|lớp/],
  ['ReadingSideDoodle', /tin tức|thông tin|báo|tài liệu/],
  ['CoffeeDoodle', /cà phê|buổi sáng|làm việc|công việc|đi làm|văn phòng/],
  ['SittingDoodle', /suy nghĩ|băn khoăn|tự hỏi|tại sao|vì sao|lương|thu nhập|chờ/],
  ['RunningDoodle', /chạy|vội|bận rộn|nhanh|gấp/],
  ['SprintingDoodle', /cố gắng|nỗ lực|về đích|cạnh tranh|bứt phá|mục tiêu/],
  ['StrollingDoodle', /đi bộ|dạo|bước|hành trình|từng bước/],
  ['LayingDoodle', /nằm|ngủ|giấc ngủ|mệt mỏi|lười/],
  ['ChillingDoodle', /thư giãn|nghỉ ngơi|cuối tuần|thoải mái|an nhàn/],
  ['ZombieingDoodle', /kiệt sức|uể oải|thức khuya|áp lực|stress|căng thẳng|trì hoãn/],
  ['DancingDoodle', /vui|hạnh phúc|ăn mừng|tận hưởng/],
  ['JumpingDoodle', /phấn khích|tuyệt vời|chiến thắng|thành công|đạt được/],
  ['GroovyDoodle', /tự tin|bản lĩnh|phong cách|tự do tài chính/],
  ['MeditatingDoodle', /thiền|bình an|buông bỏ|chánh niệm|tĩnh lặng|triết lý|tâm/],
  ['LevitateDoodle', /ước mơ|nhẹ nhõm|tự do|vượt lên/],
  ['FloatDoodle', /tưởng tượng|mơ|ý tưởng|sáng tạo/],
  ['PlantDoodle', /phát triển|trồng|gieo|kiên nhẫn|tích luỹ|tích lũy|đầu tư|lãi kép|tiết kiệm/],
  ['UnboxingDoodle', /mua|sản phẩm|đơn hàng|shopee|mua sắm|giao hàng|hộp/],
  ['SelfieDoodle', /mạng xã hội|chụp|sống ảo|tiktok|điện thoại|online/],
  ['LovingDoodle', /yêu|tình cảm|gia đình|quan tâm|vợ|chồng|con/],
  ['PettingDoodle', /mèo|thú cưng|chăm sóc/],
  ['DogJumpDoodle', /chó|năng lượng|vui vẻ/],
  ['DoggieDoodle', /bạn bè|người bạn|đồng hành/],
  ['ClumsyDoodle', /sai lầm|vụng|thất bại|vấp|lỗi|nợ|mất/],
  ['IceCreamDoodle', /ăn|kem|trà sữa|đồ ăn|chi tiêu|thưởng/],
  ['SwingingDoodle', /tuổi thơ|cân bằng|nhẹ nhàng|thảnh thơi/],
  ['RollerSkatingDoodle', /trượt|lướt|tốc độ|thuận lợi/],
  ['RollingDoodle', /trôi|lăn|xoay vòng|vòng lặp/],
  ['MoshingDoodle', /hỗn loạn|rối|ồn ào|đám đông/],
  ['BalletDoodle', /kỷ luật|luyện tập|rèn luyện|thói quen/],
  ['SleekDoodle', /chuyên nghiệp|thành thạo|giỏi|chuyên gia/],
  ['BikiniDoodle', /du lịch|biển|nghỉ hè|kỳ nghỉ/],
];
export const DOODLE_NAMES = DOODLES.map(([n]) => n);
export const isDoodle = (ref: string) => /^doodle:[A-Za-z]{3,40}$/.test(ref) && DOODLE_NAMES.includes(ref.slice(7));

const words = (s: string) => s.toLowerCase().normalize('NFC');
function hash(s: string) { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619); } return h >>> 0; }

/**
 * One picture per spoken line (at most two per scene), chosen from the words; pictures already
 * used in the video are skipped while unused ones remain, so boards never look the same.
 */
export function doodlePanels(scenes: string[][]) {
  const used = new Set<string>();
  return scenes.map((lines) => lines.slice(0, 2).map((line, li) => {
    const text = words(line);
    const fit = DOODLES.filter(([n, re]) => re.test(text) && !used.has(n)).map(([n]) => n);
    let name = fit[0];
    if (!name) {
      const free = DOODLE_NAMES.filter((n) => !used.has(n));
      const pool = free.length ? free : DOODLE_NAMES;
      name = pool[hash(line) % pool.length];
    }
    used.add(name);
    if (used.size >= DOODLE_NAMES.length) used.clear();
    return { image: 'doodle:' + name, prompt: '', line: li };
  }));
}
