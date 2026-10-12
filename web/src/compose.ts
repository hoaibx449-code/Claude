// Free mode (no AI cost): turns the user's own script into scenes and designs a sketch for each
// one with simple rules — key words become handwritten text, nouns become line-art icons,
// numbers get circled, "A nhưng B" becomes a ✗/✓ comparison, verbs move a stick figure...
// Seeded by the text, so the same script always gives the same video.

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
  [/máy tính|laptop|công nghệ|phần mềm/, 'device-laptop'], [/internet|thế giới|toàn cầu/, 'world'], [/ai\b|trí tuệ nhân tạo|robot/, 'robot'],
  [/sức khỏe|sức khoẻ|tim mạch|tim\b/, 'heartbeat'], [/bệnh|ốm|thuốc|bác sĩ/, 'pill'], [/ngủ|giấc ngủ|mệt/, 'bed'], [/tập|thể dục|gym|vận động/, 'barbell'],
  [/chạy/, 'run'], [/ăn|bữa|thức ăn|đồ ăn/, 'tools-kitchen-2'], [/cà phê|uống/, 'coffee'], [/nước\b/, 'droplet'],
  [/xe|ô tô|giao thông/, 'car'], [/du lịch|chuyến đi|bay/, 'plane'], [/khởi nghiệp|bứt phá|phát triển/, 'rocket'],
  [/căng thẳng|áp lực|stress|lo lắng|lo âu/, 'mood-nervous'], [/buồn|khóc|cô đơn/, 'mood-sad'], [/vui|hạnh phúc|cười/, 'mood-happy'],
  [/giận|tức|nóng/, 'mood-angry'], [/nguy hiểm|cảnh báo|cẩn thận|rủi ro/, 'alert-triangle'], [/an toàn|bảo vệ|bảo hiểm/, 'shield-check'],
  [/bí mật|khóa|khoá|bảo mật/, 'lock'], [/chìa khóa|chìa khoá|then chốt/, 'key'], [/quà|tặng|thưởng/, 'gift'], [/năng lượng|pin\b|kiệt sức/, 'battery-1'],
  [/lửa|cháy|đam mê|nhiệt huyết/, 'flame'], [/cây|trồng|gieo|hạt/, 'seedling'], [/núi|leo|vượt qua|thử thách/, 'mountain'], [/bậc thang|từng bước|nấc/, 'stairs-up'],
  [/lặp lại|vòng lặp|thói quen/, 'repeat'], [/cân bằng|so sánh|công bằng/, 'scale'], [/câu hỏi|tại sao|vì sao|thắc mắc/, 'question-mark'],
  [/nói|kể|chia sẻ|giao tiếp/, 'message-circle'], [/nghe/, 'ear'], [/nhìn|thấy|quan sát/, 'eye'], [/tìm|kiếm|khám phá/, 'search'],
  [/âm nhạc|bài hát|nhạc/, 'music'], [/phim|video/, 'movie'], [/ảnh|chụp/, 'camera'], [/thư|email/, 'mail'], [/sao\b|ngôi sao|nổi tiếng/, 'star'],
];
const ACTION_WORDS: [RegExp, string][] = [
  [/chạy|vội|gấp/, 'run'], [/đi bộ|bước|đi\b|tiến/, 'walk'], [/nghĩ|suy nghĩ|tự hỏi|băn khoăn|tại sao|vì sao/, 'think'],
  [/buồn|thất vọng|chán|mệt|kiệt sức|khóc/, 'sad'], [/vui|mừng|thành công|chiến thắng|tuyệt/, 'cheer'], [/chào|xin chào|gặp/, 'wave'],
  [/nhảy|bật/, 'jump'], [/chỉ|hãy|nên|nhớ/, 'point'], [/không biết|chịu|bó tay|kệ/, 'shrug'],
];
// "\b" only knows ASCII letters; make it Vietnamese-aware
const vi = (list: [RegExp, string][]) => list.map(([re, v]) => [new RegExp(re.source.replace(/\\b/g, '(?![\\p{L}\\p{N}])'), 'iu'), v] as [RegExp, string]);
const ICONS_VI = vi(ICON_WORDS), ACTIONS_VI = vi(ACTION_WORDS);
const FILLER = /^(và|nhưng|mà|thì|là|của|cho|với|các|những|một|này|đó|ấy|rồi|cũng|vẫn|đã|đang|sẽ|bạn|mình|chúng ta|ta|hãy|nếu|khi|vì|nên|để)$/i;

function hash(s: string) { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619); } return h >>> 0; }

/** Split a pasted script into scenes of 1-2 short spoken lines. */
export function splitScript(text: string) {
  const paras = text.replace(/\r/g, '').split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const scenes: string[][] = [];
  for (const p of paras) {
    const sentences = (p.match(/[^.!?…]+[.!?…]*["”']?/g) || [p]).map((s) => s.trim()).filter(Boolean)
      .flatMap((s) => (s.length <= 150 ? [s] : s.split(/(?<=,)\s+/).reduce((acc: string[], part) => {
        if (acc.length && (acc[acc.length - 1] + ' ' + part).length <= 150) acc[acc.length - 1] += ' ' + part; else acc.push(part.slice(0, 160));
        return acc;
      }, [])));
    for (let i = 0; i < sentences.length; i += 2) scenes.push(sentences.slice(i, i + 2));
  }
  return scenes.slice(0, 20);
}

const iconsIn = (s: string) => {
  const low = s.toLowerCase(), out: string[] = [];
  for (const [re, name] of ICONS_VI) if (re.test(low) && !out.includes(name)) out.push(name);
  return out;
};
const actionIn = (s: string) => ACTIONS_VI.find(([re]) => re.test(s.toLowerCase()))?.[1];
const numberIn = (s: string) => s.match(/\d+(?:[.,]\d+)?\s*(?:%|tr(?!\p{L})|triệu|tỷ|nghìn|k(?!\p{L})|lần|năm|tháng|ngày|giờ|phút|người|bước)?/iu)?.[0].trim();

/** A few words that carry the sentence (shown in handwriting). */
function keyPhrase(s: string, max = 7) {
  const clean = s.replace(/["“”'…]/g, '').replace(/[.!?]+$/, '').trim();
  const after = clean.match(/(?:là|chính là|:)\s+(.+)$/i)?.[1];
  const src = after && after.split(' ').length <= 8 ? after : clean.split(/,|;| - /).sort((a, b) => iconsIn(b).length - iconsIn(a).length || a.length - b.length)[0];
  const words = src.trim().split(/\s+/);
  while (words.length > 2 && FILLER.test(words[0])) words.shift();
  const out = words.slice(0, max).join(' ');
  return (out.charAt(0).toUpperCase() + out.slice(1)).slice(0, 34);
}

/** Sketch items for one scene, from its lines only (no AI). */
export function composeScene(lines: string[], portrait: boolean, sceneIndex: number): any[] {
  // never write the same words twice on one board
  const seen = new Set<string>();
  return compose(lines, portrait, sceneIndex).filter((it: any) => {
    if (it.t !== 'text') return true;
    const k = it.text.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

function compose(lines: string[], portrait: boolean, sceneIndex: number): any[] {
  const all = lines.join(' '), h = hash(all) + sceneIndex;
  const icons = iconsIn(all), num = numberIn(all), act = actionIn(all);
  const ic = (i: number, fallback: string) => icons[i] || fallback;
  const L1 = lines.length > 1 ? 1 : 0;
  const quote = all.match(/[“"]([^”"]{3,40})[”"]/)?.[1];
  // "A nhưng B" / "A nên B" inside one sentence
  const split = (re: RegExp) => lines.map((l) => l.match(re)).find((m) => m && m[1].trim().split(' ').length >= 2 && m[2].trim().split(' ').length >= 2);
  const contrast = split(/^(.*?)(?:^|\s)(?:nhưng|thay vì|trong khi|so với)(?=\s)(.*)$/iu);
  const cause = split(/^(?:vì\s+)?(.*?)(?:^|\s)(?:nên|vì vậy|vì thế|dẫn đến|khiến)(?=\s)(.*)$/iu);
  const bottom = (size = 'm', color = 'accent') => (lines.length > 1 ? [{ t: 'text', text: keyPhrase(lines[1]), x: 50, y: portrait ? 86 : 88, size, color, line: 1 }] : []);
  const list = lines.map((l) => (l.includes(':') ? l.slice(l.indexOf(':') + 1) : l).replace(/[.!?]+$/, '').split(/,|;|\svà\s/).map((x) => x.trim()).filter((x) => x && x.split(' ').length <= 6)).find((p) => p.length >= 3);
  const title = { id: 'title', t: 'text', text: keyPhrase(lines[0]), x: 50, y: 6, size: 'l', line: 0 };
  const under = { t: 'underline', on: 'title', line: 0 };

  if (num && sceneIndex % 3 !== 2) {
    return [title, under,
      { id: 'n', t: 'text', text: num.replace(/\s*triệu/i, 'tr').replace(/\s*nghìn/i, 'k'), x: portrait ? 50 : 35, y: portrait ? 38 : 50, size: 'xxl', color: 'accent', line: L1 },
      { t: 'circle', on: 'n', line: L1 },
      { id: 'i', t: 'icon', name: ic(0, 'chart-bar'), x: portrait ? 50 : 75, y: portrait ? 66 : 50, w: portrait ? 28 : 20, line: 0 },
      ...bottom('m', 'ink'),
    ];
  }
  if (list) {
    const li = lines.findIndex((l) => l.includes(list[0]));
    const head = lines[li].includes(':') ? keyPhrase(lines[li].split(':')[0]) : title.text;
    return [{ ...title, text: head }, under,
      { t: 'chart', kind: 'steps', items: list.slice(0, 4).map((x) => x.charAt(0).toUpperCase() + x.slice(1)), x: 50, y: portrait ? 46 : 58, w: 90, h: portrait ? 50 : 70, line: Math.max(0, li) },
      { t: 'icon', name: ic(0, 'list-check'), x: 85, y: portrait ? 80 : 20, w: portrait ? 18 : 9, line: 0 },
      ...(li === 0 ? bottom() : [])];
  }
  if (contrast && contrast[1].trim().length > 3 && contrast[2].trim().length > 3) {
    return [title, under,
      { id: 'a', t: 'icon', name: ic(0, 'mood-sad'), x: 26, y: portrait ? 36 : 42, w: portrait ? 30 : 16, label: keyPhrase(contrast[1], 5), line: 0 },
      { t: 'cross', on: 'a', line: 0 },
      { id: 'b', t: 'icon', name: ic(1, 'mood-happy'), x: 74, y: portrait ? 36 : 42, w: portrait ? 30 : 16, label: keyPhrase(contrast[2], 5), line: L1 },
      { t: 'check', on: 'b', line: L1 },
      { t: 'text', text: keyPhrase(contrast[2]), x: 50, y: portrait ? 78 : 86, size: 'l', color: 'accent', line: L1 },
    ];
  }
  if (cause && cause[1].trim().length > 3 && cause[2].trim().length > 3) {
    return [title, under,
      { id: 'a', t: 'icon', name: ic(0, 'bulb'), x: portrait ? 50 : 22, y: portrait ? 30 : 50, w: portrait ? 26 : 16, label: keyPhrase(cause[1], 5), line: 0 },
      { id: 'b', t: 'icon', name: ic(1, 'target-arrow'), x: portrait ? 50 : 76, y: portrait ? 72 : 50, w: portrait ? 26 : 16, label: keyPhrase(cause[2], 5), line: L1 },
      { t: 'arrow', from: 'a', to: 'b', curve: h % 2 ? 0.25 : -0.25, line: L1 },
      { t: 'circle', on: 'b', color: 'accent', line: L1 },
    ];
  }
  if (act || quote || /\?$/.test(lines[0].trim())) {
    const right = h % 2 === 0;
    return [title, under,
      { id: 'p', t: 'person', action: act || (quote ? 'wave' : 'think'), x: right ? 30 : 70, y: portrait ? 50 : 55, h: portrait ? 34 : 45, facing: right ? 1 : -1, bubble: quote || (lines[0].trim().endsWith('?') ? keyPhrase(lines[0], 5) + '?' : undefined), line: 0 },
      { id: 'i', t: 'icon', name: ic(0, 'question-mark'), x: right ? 74 : 26, y: portrait ? 52 : 55, w: portrait ? 28 : 17, line: L1 },
      ...bottom(),
    ];
  }
  if (icons.length >= 2 || h % 2) {
    const three = icons.slice(0, 3).length === 3;
    return [title, under,
      { id: 'a', t: 'icon', name: ic(0, 'bulb'), x: 50, y: portrait ? 32 : 40, w: portrait ? 34 : 20, line: 0 },
      { id: 'b', t: 'icon', name: ic(1, 'star'), x: portrait ? 22 : 18, y: portrait ? 64 : 62, w: portrait ? 20 : 12, line: L1 },
      ...(three ? [{ id: 'c', t: 'icon', name: icons[2], x: portrait ? 78 : 82, y: portrait ? 64 : 62, w: portrait ? 20 : 12, line: L1 }, { t: 'arrow', from: 'a', to: 'c', curve: 0.2, line: L1 }] : []),
      { t: 'arrow', from: 'a', to: 'b', curve: -0.2, line: L1 },
      ...bottom(),
    ];
  }
  return [
    { id: 'i', t: 'icon', name: ic(0, 'sparkles'), x: 50, y: portrait ? 22 : 24, w: portrait ? 28 : 14, line: 0 },
    { id: 's', t: 'text', text: keyPhrase(lines[L1], 8), x: 50, y: portrait ? 55 : 62, size: 'xl', line: L1 },
    { t: 'underline', on: 's', line: L1 },
  ];
}
