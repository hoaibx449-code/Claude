// What kind of video does this script want to be? Detected from the words alone (free, no AI),
// then used to pick the drawing grammar of each scene, a matching style, and to brief the AI.

export const FORMATS = ['explainer', 'listicle', 'howto', 'story', 'compare', 'data', 'sales', 'motivation', 'qa', 'news'] as const;
export const NICHES = ['finance', 'business', 'health', 'self', 'education', 'tech', 'history', 'family', 'love', 'food', 'travel', 'law', 'realestate', 'spiritual', 'general'] as const;
export type Format = (typeof FORMATS)[number];
export type Niche = (typeof NICHES)[number];

export const FORMAT_NAMES: Record<Format, string> = {
  explainer: 'Giải thích khái niệm', listicle: 'Danh sách (Top N, N cách)', howto: 'Hướng dẫn từng bước', story: 'Kể chuyện / tình huống',
  compare: 'So sánh / đúng – sai', data: 'Số liệu / phân tích', sales: 'Giới thiệu sản phẩm / bán hàng', motivation: 'Truyền cảm hứng',
  qa: 'Hỏi – đáp', news: 'Tin tức / sự kiện',
};
export const NICHE_NAMES: Record<Niche, string> = {
  finance: 'Tài chính cá nhân', business: 'Kinh doanh – marketing', health: 'Sức khoẻ', self: 'Phát triển bản thân – tâm lý', education: 'Kiến thức – học tập',
  tech: 'Công nghệ', history: 'Lịch sử – văn hoá', family: 'Gia đình – nuôi dạy con', love: 'Tình cảm – các mối quan hệ', food: 'Ẩm thực',
  travel: 'Du lịch', law: 'Pháp luật', realestate: 'Bất động sản', spiritual: 'Triết lý – tâm linh', general: 'Chủ đề chung',
};

const NICHE_WORDS: Record<Exclude<Niche, 'general'>, RegExp> = {
  finance: /tiền|lương|tiết kiệm|đầu tư|lãi|nợ|vay|chi tiêu|tài chính|ngân hàng|cổ phiếu|chứng khoán|thu nhập|giàu|nghèo|quỹ|tài sản|vàng|crypto|tiêu xài/gi,
  business: /kinh doanh|khách hàng|bán hàng|doanh thu|lợi nhuận|thương hiệu|marketing|tiếp thị|khởi nghiệp|startup|công ty|doanh nghiệp|đối thủ|thị trường|quảng cáo|chốt đơn/gi,
  health: /sức khoẻ|sức khỏe|bệnh|bác sĩ|thuốc|ngủ|ăn uống|tập luyện|thể dục|cân nặng|giảm cân|tim|não bộ|vitamin|dinh dưỡng|huyết áp|tiêu hoá|tiêu hóa/gi,
  self: /thói quen|kỷ luật|tự tin|động lực|tư duy|mục tiêu|thành công|lười|trì hoãn|tập trung|cảm xúc|tâm lý|áp lực|căng thẳng|bản thân|overthinking|hạnh phúc/gi,
  education: /học|kiến thức|bài|thi|trường|giáo viên|học sinh|sinh viên|toán|văn|tiếng anh|khoa học|vật lý|hoá học|hóa học|ghi nhớ/gi,
  tech: /công nghệ|trí tuệ nhân tạo|máy tính|điện thoại|phần mềm|ứng dụng|internet|dữ liệu|lập trình|robot|chatgpt|mạng xã hội/gi,
  history: /lịch sử|năm \d{3,4}|triều|vua|chiến tranh|cổ đại|văn hoá|văn hóa|truyền thống|thế kỷ|dân tộc|di sản/gi,
  family: /con cái|bố mẹ|cha mẹ|nuôi dạy|trẻ|em bé|gia đình|ông bà|vợ chồng|làm cha|làm mẹ/gi,
  love: /người yêu|tình yêu|chia tay|hẹn hò|crush|yêu nhau|yêu thương|kết hôn|hôn nhân|mối quan hệ|ghen/gi,
  food: /món ăn|nấu|công thức nấu|nguyên liệu|nhà bếp|nhà hàng|đồ uống|cà phê|món ngon/gi,
  travel: /du lịch|chuyến đi|khách sạn|vé máy bay|điểm đến|phượt|biển|núi|check-in/gi,
  law: /luật|pháp luật|hợp đồng|phạt|quyền lợi|nghĩa vụ|toà án|tòa án|thủ tục|giấy tờ/gi,
  realestate: /nhà đất|bất động sản|căn hộ|chung cư|mua nhà|thuê nhà|sổ đỏ|mặt bằng/gi,
  spiritual: /phật|thiền|nhân quả|buông bỏ|tâm linh|đạo phật|kiếp|bình an|chánh niệm/gi,
};

/** Style that suits each niche (used when the user picks "auto"). */
export const NICHE_STYLE: Record<Niche, string> = {
  finance: 'whiteboard', business: 'kraft', health: 'notebook', self: 'pencil', education: 'chalkboard', tech: 'blueprint', history: 'ricepaper',
  family: 'oly', love: 'pencil', food: 'kraft', travel: 'notebook', law: 'whiteboard', realestate: 'blueprint', spiritual: 'ricepaper', general: 'whiteboard',
};

const count = (text: string, re: RegExp) => (text.match(re) || []).length;

export interface Intent { format: Format; niche: Niche; scores: { format: Record<string, number>; niche: Record<string, number> }; hook: boolean; cta: boolean }

export function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  const niche: Record<string, number> = {};
  for (const [k, re] of Object.entries(NICHE_WORDS)) niche[k] = count(t, re);
  const nums = count(t, /\d+(?:[.,]\d+)?\s*(?:%|triệu|tỷ|nghìn|lần|năm)/g);
  const qs = count(t, /\?/g), sentences = Math.max(1, count(t, /[.!?…]+/g));
  const format: Record<Format, number> = {
    listicle: count(t, /(?:\d+|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s+(?:cách|bước|sai lầm|lý do|điều|thói quen|bí quyết|mẹo|dấu hiệu|loại|kiểu)|(?:sai lầm|cách|điều|lý do|bí quyết|mẹo|dấu hiệu)\s+(?:số\s+)?\d|thứ nhất|thứ hai|thứ ba|một là|hai là|số một|top\s*\d/g) * 3,
    howto: count(t, /hướng dẫn|cách làm|cách để|làm sao để|bước \d|bước đầu tiên|tiếp theo|sau đó|cuối cùng|đầu tiên/g) * 2,
    story: count(t, /ngày xưa|có một|một hôm|hôm ấy|anh ấy|cô ấy|ông ấy|chàng|câu chuyện|kể rằng|năm đó|lúc đó|tôi đã|tôi từng|bỗng|thì ra/g) * 2,
    compare: count(t, /so với|khác nhau|vs\.?|thay vì|đúng hay sai|lầm tưởng|sự thật là|trong khi|ngược lại|một bên/g) * 1.5,
    data: nums * 1.5 + count(t, /thống kê|nghiên cứu|khảo sát|tỷ lệ|phần trăm|gấp/g) * 2,
    sales: count(t, /mua ngay|giá chỉ|ưu đãi|giảm giá|đặt hàng|link|sản phẩm|khuyến mãi|freeship|chốt đơn|inbox|review|tư vấn|chọn mẫu|bảo hành|chính hãng|giao hàng|công thái học|chỉ sau một/g) * 2.5,
    motivation: count(t, /đừng bao giờ|hãy tin|ước mơ|cố gắng|bỏ cuộc|kiên trì|vượt qua|thành công|chính bạn|bạn xứng đáng|đứng dậy/g) * 1.5,
    // many questions answered one by one; a single rhetorical hook question does not count
    qa: (qs >= 3 && qs / sentences > 0.35 ? qs * 1.2 : 0) + count(t, /có nên|là gì|hỏi:|đáp:/g) * 1.5,
    news: count(t, /vừa|mới đây|hôm qua|sáng nay|theo báo|chính thức|thông báo|sự kiện|cập nhật/g) * 1.5,
    explainer: 1.5 + count(t, /là gì|nghĩa là|hiểu đơn giản|nói cách khác|bản chất|nguyên lý|hoạt động như thế nào|vì sao|tại sao|bởi vì/g) * 1.2,
  };
  const top = <T extends string>(o: Record<string, number>, def: T) => {
    let best = def as string, v = 0;
    for (const [k, n] of Object.entries(o)) if (n > v) { v = n; best = k; }
    return best as T;
  };
  return {
    format: top<Format>(format, 'explainer'),
    niche: Object.values(niche).some((v) => v >= 2) ? top<Niche>(niche, 'general') : 'general',
    scores: { format, niche },
    hook: /\?|bạn có biết|sự thật|đừng|bí mật|sai lầm|tại sao|vì sao/i.test(text.slice(0, 160)),
    cta: /lưu lại|chia sẻ|gửi cho|bình luận|theo dõi|follow|đăng ký/i.test(text.slice(-240)),
  };
}

/** How the AI should tell this kind of video (added to its brief). */
export const FORMAT_BRIEF: Record<Format, string> = {
  explainer: 'Giải thích từ dễ tới khó, mỗi cảnh một ý, dùng ẩn dụ đời thường; hình: sơ đồ nguyên nhân → kết quả, icon ẩn dụ, khoanh từ khoá.',
  listicle: 'Mỗi cảnh là MỘT mục của danh sách, mở bằng số thứ tự lớn (1, 2, 3...) viết tay; hình: số to khoanh tròn + icon + 3-5 chữ chốt.',
  howto: 'Mỗi cảnh một bước làm cụ thể; hình: "Bước n" + icon dụng cụ/hành động + dấu ✓; cảnh cuối tóm tắt các bước (chart steps).',
  story: 'Kể theo nhân vật có tên, có xung đột và bước ngoặt; hình: người que chuyển động với bong bóng thoại, cảm xúc (sad, think, cheer), đồ vật trong truyện.',
  compare: 'Đặt hai bên cạnh nhau rõ ràng; hình: hai cột với ✗ / ✓, mũi tên, biểu đồ so sánh khi có số.',
  data: 'Dẫn dắt bằng con số; hình: số khổng lồ khoanh tròn, biểu đồ cột có mũi tên và đường xu hướng, chú thích ngắn.',
  sales: 'Nỗi đau → giải pháp → lợi ích → bằng chứng → kêu gọi nhẹ; hình: icon sản phẩm, giá/ưu đãi khoanh đỏ, ✓ lợi ích, mũi tên tới nút hành động.',
  motivation: 'Nhịp chậm, câu ngắn có sức nặng; hình: một câu chốt viết tay to, gạch chân, người que từ buồn → đứng dậy → ăn mừng.',
  qa: 'Mỗi cảnh một câu hỏi rồi câu trả lời; hình: dấu ? lớn, người que suy nghĩ, rồi câu trả lời khoanh tròn.',
  news: 'Ai – cái gì – khi nào – vì sao quan trọng; hình: icon sự kiện, mốc thời gian, con số chính, mũi tên tác động.',
};
