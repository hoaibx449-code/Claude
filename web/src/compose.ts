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
const ACTION_WORDS: [RegExp, string][] = [
  [/chạy|vội|gấp/, 'run'], [/đi bộ|bước|đi\b|tiến/, 'walk'], [/nghĩ|suy nghĩ|tự hỏi|băn khoăn|tại sao|vì sao/, 'think'],
  [/buồn|thất vọng|chán|mệt|kiệt sức|khóc/, 'sad'], [/vui|mừng|thành công|chiến thắng|tuyệt/, 'cheer'], [/chào|xin chào|gặp/, 'wave'],
  [/nhảy|bật/, 'jump'], [/chỉ|hãy|nên|nhớ/, 'point'], [/không biết|chịu|bó tay|kệ/, 'shrug'],
];
// "\b" only knows ASCII letters; make it Vietnamese-aware
// every pattern must match whole syllables ("ai" must not match "lại")
const vi = (list: [RegExp, string][]) => list.map(([re, v]) => [new RegExp('(?<![\\p{L}\\p{N}])(?:' + re.source.replace(/\\b/g, '') + ')(?![\\p{L}\\p{N}])', 'iu'), v] as [RegExp, string]);
const ICONS_VI = vi(ICON_WORDS), ACTIONS_VI = vi(ACTION_WORDS);
const FILLER = /^(và|nhưng|mà|thì|là|của|cho|với|các|những|một|này|đó|ấy|rồi|cũng|vẫn|đã|đang|sẽ|bạn|mình|chúng ta|ta|hãy|nếu|khi|vì|nên|để|ngay|trước|sau|trong|ngoài|rất|quá|lại|từ|đến|tới|như)$/i;

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
  const low = s.toLowerCase(), out: { name: string; word: string }[] = [];
  for (const [re, name] of ICONS_VI) { const m = low.match(re); if (m && !out.some((o) => o.name === name)) out.push({ name, word: m[0] }); }
  // in the order they are spoken
  return out.sort((a, b) => low.indexOf(a.word) - low.indexOf(b.word));
};
const actionIn = (s: string) => ACTIONS_VI.find(([re]) => re.test(s.toLowerCase()))?.[1];
const numberIn = (s: string) => s.match(/\d+(?:[.,]\d+)?\s*(?:%|tr(?!\p{L})|triệu|tỷ|nghìn|k(?!\p{L})|lần|năm|tháng|ngày|giờ|phút|người|bước)?/iu)?.[0].trim();

/** A few words that carry the sentence (shown in handwriting). */
function keyPhrase(s: string, max = 7) {
  const clean = s.replace(/["“”'…]/g, '').replace(/[.!?]+$/, '').replace(/^[\s:;,.\-–]+/, '').trim();
  const after = clean.match(/(?:là|chính là|:)\s+(.+)$/i)?.[1];
  const src = after && after.split(' ').length <= 8 ? after : clean.split(/,|;| - /).sort((a, b) => iconsIn(b).length - iconsIn(a).length || a.length - b.length)[0];
  const words = src.trim().split(/\s+/);
  while (words.length > 2 && FILLER.test(words[0])) words.shift();
  let cut = words.slice(0, max);
  // a cut phrase must not end on a dangling small word ("ngay", "của", "và")
  if (words.length > max) while (cut.length > 3 && FILLER.test(cut[cut.length - 1].replace(/[,.;:]$/, '')) ) cut.pop();
  const out = cut.join(' ').replace(/[,;:]$/, '');
  return (out.charAt(0).toUpperCase() + out.slice(1)).slice(0, 48);
}
/** First words of a phrase, used as the cue that triggers it in the narration. */
const cueOf = (phrase: string) => phrase.split(/\s+/).slice(0, 2).join(' ');

export interface ComposeContext { format?: string; index?: number; total?: number }

/** Sketch items for one scene, from its lines only (no AI). */
export function composeScene(lines: string[], portrait: boolean, sceneIndex: number, ctx: ComposeContext = {}): any[] {
  // never write the same words twice on one board
  const seen = new Set<string>();
  const items = compose(lines, portrait, sceneIndex, ctx);
  // landscape frames are wide: draw pictures and people bigger
  if (!portrait) for (const it of items) { if (it.t === 'icon') it.w = Math.min(30, Math.round(it.w * 1.35)); if (it.t === 'person') it.h = Math.min(62, Math.round(it.h * 1.2)); }
  return items.filter((it: any) => {
    if (it.t !== 'text') return true;
    const k = it.text.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

function compose(lines: string[], P: boolean, si: number, ctx: ComposeContext): any[] {
  const all = lines.join(' '), h = hash(all) + si, flip = h % 2 === 1;
  const format = ctx.format || 'explainer', first = (ctx.index ?? si) === 0, lastScene = ctx.total != null && (ctx.index ?? si) === ctx.total - 1;
  const found = iconsIn(all), num = numberIn(all), act = actionIn(all);
  const ic = (i: number, fallback: string) => found[i]?.name || fallback;
  const icCue = (i: number) => found[i]?.word;
  const lineOf = (word?: string) => { if (!word) return 0; const k = lines.findIndex((l) => l.toLowerCase().includes(word.toLowerCase())); return k < 0 ? 0 : k; };
  const L1 = lines.length > 1 ? 1 : 0;
  const quote = all.match(/[“"]([^”"]{3,40})[”"]/)?.[1];
  const split = (re: RegExp) => lines.map((l) => l.match(re)).find((m) => m && m[1].trim().split(' ').length >= 2 && m[2].trim().split(' ').length >= 2);
  const contrast = split(/^(.*?)(?:^|\s)(?:nhưng|thay vì|trong khi|so với)(?=\s)(.*)$/iu);
  const cause = split(/^(?:vì\s+)?(.*?)(?:^|\s)(?:nên|vì vậy|vì thế|dẫn đến|khiến)(?=\s)(.*)$/iu);
  // a list: "A, B và C" after a colon, or three or more very short items
  const list = lines.map((l) => {
    const colon = l.includes(':'), part = colon ? l.slice(l.indexOf(':') + 1) : l;
    const items = part.replace(/[.!?]+$/, '').split(/,|;|\svà\s/).map((x) => x.trim()).filter(Boolean);
    return items.length >= 3 && items.every((x) => x.split(' ').length <= (colon ? 6 : 3)) ? items : null;
  }).find(Boolean);
  const marker = all.match(/^(?:thứ\s+(nhất|hai|ba|tư|năm|sáu|bảy|tám|chín|mười)|(?:số|điều|cách|bước|sai lầm|lý do|bí quyết)\s+(?:thứ\s+)?(\d+|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)|(\d+)[.)])/iu);
  const ORD: Record<string, string> = { nhất: '1', một: '1', hai: '2', ba: '3', tư: '4', bốn: '4', năm: '5', sáu: '6', bảy: '7', tám: '8', chín: '9', mười: '10' };
  const markNo = marker ? (marker[3] || ORD[(marker[1] || marker[2] || '').toLowerCase()] || marker[2]) : null;
  const titleText = keyPhrase(lines[0], 9);
  const title = { id: 'title', t: 'text', text: titleText, x: 50, y: P ? 5 : 8, size: 'l', line: 0, cue: cueOf(lines[0].replace(/^[^\p{L}\d]+/u, '')) };
  const under = { t: 'underline', on: 'title', line: 0 };
  const bottom = (size = 'm', color = 'accent') => (lines.length > 1 ? [{ id: 'end', t: 'text', text: keyPhrase(lines[1]), x: 50, y: P ? 88 : 88, size, color, line: 1, cue: cueOf(lines[1]) }] : []);
  const X = (v: number) => (flip ? 100 - v : v);

  // 1. hook: the first scene must stop the scroll
  if (first) {
    const q = /\?/.test(lines[0]);
    return [
      { id: 'hook', t: 'text', text: titleText + (q && !titleText.endsWith('?') ? '?' : ''), x: 50, y: P ? 12 : 14, size: 'xl', color: 'ink', line: 0, cue: title.cue },
      { t: 'underline', on: 'hook', line: 0 },
      q ? { id: 'p', t: 'person', action: 'think', x: X(30), y: P ? 50 : 58, h: P ? 34 : 50, line: 0 }
        : { id: 'p', t: 'icon', name: ic(0, 'bulb'), x: X(30), y: P ? 48 : 58, w: P ? 34 : 18, line: 0, cue: icCue(0) },
      { id: 'q', t: 'icon', name: q ? 'question-mark' : ic(1, 'alert-circle'), x: X(72), y: P ? 46 : 55, w: P ? 24 : 13, color: 'accent', line: L1, cue: icCue(1) },
      { t: 'circle', on: 'q', line: L1 },
      ...bottom('l'),
    ];
  }
  // 2. call to action at the end: save / share / comment
  if (lastScene && /lưu|chia sẻ|gửi|bình luận|theo dõi|follow|comment/i.test(all)) {
    const want = [/lưu/i.test(all) && 'bookmark', /chia sẻ|gửi/i.test(all) && 'share', /bình luận|comment/i.test(all) && 'message-circle', /theo dõi|follow/i.test(all) && 'bell'].filter(Boolean) as string[];
    const xs = want.length === 1 ? [70] : want.length === 2 ? [58, 84] : [50, 68, 86];
    return [title, under,
      { id: 'p', t: 'person', action: 'point', x: 24, y: P ? 52 : 58, h: P ? 34 : 48, line: 0 },
      ...want.slice(0, 3).map((n, k) => ({ id: 'c' + k, t: 'icon', name: n, x: xs[k], y: P ? 50 : 56, w: P ? (want.length > 1 ? 22 : 30) : 12, color: k === 0 ? 'accent' : 'ink', line: L1 })),
      ...bottom('m'),
    ];
  }
  // 3. an item of a list ("Thứ hai", "Cách 3", "2.")
  if (markNo) {
    const n = markNo;
    return [
      { id: 'n', t: 'text', text: n, x: X(18), y: P ? 16 : 22, size: 'xxl', color: 'accent', line: 0 },
      { t: 'circle', on: 'n', line: 0 },
      { id: 'k', t: 'text', text: keyPhrase(lines[0].replace(marker?.[0] || '', ''), 9), x: X(62), y: P ? 16 : 22, size: 'l', w: 62, line: 0, cue: cueOf(lines[0].replace(marker?.[0] || '', '').replace(/^[\s:;,.\-–]+/, '').trim()) },
      { id: 'i', t: 'icon', name: ic(0, 'star'), x: 50, y: P ? 54 : 62, w: P ? 42 : 20, line: lineOf(icCue(0)), cue: icCue(0) },
      { t: 'underline', on: 'k', line: 0 },
      ...bottom(),
    ];
  }
  // 4. a step of a tutorial
  if (format === 'howto' && /bước|đầu tiên|tiếp theo|sau đó|cuối cùng/i.test(all)) {
    return [{ ...title, text: 'Bước ' + (markNo || si) + ': ' + titleText }, under,
      { id: 'i', t: 'icon', name: ic(0, 'tool'), x: X(30), y: P ? 42 : 55, w: P ? 32 : 17, line: lineOf(icCue(0)), cue: icCue(0) },
      { id: 'ok', t: 'icon', name: 'circle-check', x: X(74), y: P ? 42 : 55, w: P ? 20 : 11, color: 'good', line: L1 },
      { t: 'arrow', from: 'i', to: 'ok', line: L1 },
      ...bottom(),
    ];
  }
  // 5. a number worth circling
  if (num && (format === 'data' || si % 3 !== 2)) {
    return [title, under,
      { id: 'n', t: 'text', text: num.replace(/\s*triệu/i, 'tr').replace(/\s*nghìn/i, 'k'), x: P ? 50 : X(35), y: P ? 36 : 50, size: 'xxl', color: 'accent', line: lineOf(num), cue: num },
      { t: 'circle', on: 'n', line: lineOf(num) },
      { id: 'i', t: 'icon', name: ic(0, 'chart-bar'), x: P ? 50 : X(75), y: P ? 66 : 50, w: P ? 32 : 18, line: lineOf(icCue(0)), cue: icCue(0) },
      ...bottom('m', 'ink'),
    ];
  }
  // 6. a list inside one sentence
  if (list) {
    const li = lines.findIndex((l) => l.includes(list[0]));
    const head = lines[li].includes(':') ? keyPhrase(lines[li].split(':')[0]) : titleText;
    return [{ ...title, text: head }, under,
      { t: 'chart', kind: 'steps', items: list.slice(0, 4).map((x) => x.charAt(0).toUpperCase() + x.slice(1)), x: 50, y: P ? 46 : 58, w: 90, h: P ? 50 : 70, line: Math.max(0, li), cue: cueOf(list[0]) },
      { t: 'icon', name: ic(0, 'list-check'), x: 85, y: P ? 80 : 20, w: P ? 18 : 9, line: 0 },
      ...(li === 0 ? bottom() : [])];
  }
  // 7. "A nhưng B": two columns
  if (contrast || format === 'compare' && found.length >= 2) {
    const a = contrast ? contrast[1] : lines[0], b = contrast ? contrast[2] : lines[L1];
    const la = lineOf(a.trim().split(' ').slice(0, 3).join(' ')), lb = lineOf(b.trim().split(' ').slice(0, 3).join(' '));
    // left = the usual way (✗), right = the better way (✓); the words go above and below
    return [{ ...title, text: keyPhrase(a, 8), line: la, cue: cueOf(a.trim()) }, under,
      { id: 'a', t: 'icon', name: ic(0, 'mood-sad'), x: 27, y: P ? 42 : 48, w: P ? 32 : 17, line: la, cue: icCue(0) },
      { t: 'cross', on: 'a', line: la },
      { id: 'b', t: 'icon', name: ic(1, 'mood-happy'), x: 73, y: P ? 42 : 48, w: P ? 32 : 17, line: lb, cue: icCue(1) || cueOf(b.trim()) },
      { t: 'check', on: 'b', line: lb },
      { t: 'text', text: keyPhrase(b, 8), x: 50, y: P ? 74 : 84, size: 'l', color: 'accent', line: lb },
      { t: 'underline', on: 'b', line: lb },
    ];
  }
  // 8. "A nên B": cause → effect
  if (cause) {
    return [title, under,
      { id: 'a', t: 'icon', name: ic(0, 'bulb'), x: P ? 50 : 22, y: P ? 30 : 50, w: P ? 26 : 16, label: keyPhrase(cause[1], 5), line: lineOf(icCue(0)), cue: icCue(0) },
      { id: 'b', t: 'icon', name: ic(1, 'target-arrow'), x: P ? 50 : 76, y: P ? 72 : 50, w: P ? 26 : 16, label: keyPhrase(cause[2], 5), line: L1, cue: cueOf(cause[2].trim()) },
      { t: 'arrow', from: 'a', to: 'b', curve: flip ? 0.25 : -0.25, line: L1 },
      { t: 'circle', on: 'b', color: 'accent', line: L1 },
    ];
  }
  // 9. people: stories, feelings, dialogue
  if (format === 'story' || act || quote || /\?$/.test(lines[0].trim())) {
    const two = !!quote && format === 'story';
    return [title, under,
      { id: 'p', t: 'person', action: act || (quote ? 'wave' : 'think'), x: X(28), y: P ? 52 : 56, h: P ? 40 : 46, facing: flip ? -1 : 1, bubble: quote || (lines[0].trim().endsWith('?') ? keyPhrase(lines[0], 5) + '?' : undefined), line: 0 },
      two ? { id: 'p2', t: 'person', action: 'shrug', x: X(74), y: P ? 52 : 56, h: P ? 32 : 44, facing: flip ? 1 : -1, line: L1 }
        : { id: 'i', t: 'icon', name: ic(0, 'question-mark'), x: X(74), y: P ? 52 : 56, w: P ? 28 : 17, line: lineOf(icCue(0)), cue: icCue(0) },
      ...bottom(),
    ];
  }
  // 10. a line to remember
  if (format === 'motivation') {
    return [
      { id: 's', t: 'text', text: keyPhrase(lines[lines.length - 1], 9), x: 50, y: P ? 30 : 34, size: 'xl', line: L1, cue: cueOf(lines[lines.length - 1]) },
      { t: 'underline', on: 's', line: L1 },
      { id: 'p', t: 'person', action: 'cheer', x: X(50), y: P ? 70 : 74, h: P ? 30 : 40, line: 0 },
    ];
  }
  // 11. two or three ideas joined by arrows
  if (found.length >= 2 || flip) {
    const three = found.length >= 3;
    return [title, under,
      { id: 'a', t: 'icon', name: ic(0, 'bulb'), x: 50, y: P ? 32 : 40, w: P ? 34 : 18, line: lineOf(icCue(0)), cue: icCue(0) },
      { id: 'b', t: 'icon', name: ic(1, 'star'), x: P ? 22 : 18, y: P ? 66 : 62, w: P ? 24 : 12, line: lineOf(icCue(1)) || L1, cue: icCue(1) },
      ...(three ? [{ id: 'c', t: 'icon', name: found[2].name, x: P ? 78 : 82, y: P ? 66 : 62, w: P ? 24 : 12, line: lineOf(icCue(2)) || L1, cue: icCue(2) }, { t: 'arrow', from: 'a', to: 'c', curve: 0.2, line: L1 }] : []),
      { t: 'arrow', from: 'a', to: 'b', curve: -0.2, line: L1 },
      ...bottom(),
    ];
  }
  // 12. a handwritten statement
  return [
    { id: 'i', t: 'icon', name: ic(0, 'sparkles'), x: 50, y: P ? 22 : 24, w: P ? 28 : 14, line: 0, cue: icCue(0) },
    { id: 's', t: 'text', text: keyPhrase(lines[L1], 9), x: 50, y: P ? 55 : 62, size: 'xl', line: L1, cue: cueOf(lines[L1]) },
    { t: 'underline', on: 's', line: L1 },
  ];
}
