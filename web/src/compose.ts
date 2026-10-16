import { planDirections } from '../../src/engine/director.ts';
import { composeAct } from './act.ts';
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

// ---------------------------------------------------------------- video formats (looks)
// Free rules that fill each format's scene data from the words. The AI may provide the same
// fields; whatever it left out is filled here, so every format works without any AI key.
const PLACES: [RegExp, { icon: string; label: string }][] = [
  [/ngân hàng|atm|tài khoản|số dư|thẻ/, { icon: 'building-bank', label: 'Ngân hàng' }], [/công ty|văn phòng|đi làm|sếp|lương|đồng nghiệp/, { icon: 'briefcase', label: 'Công ty' }],
  [/trà sữa|cà phê|quán|uống/, { icon: 'coffee', label: 'Quán' }], [/mua|shopee|siêu thị|chợ|cửa hàng|mua sắm/, { icon: 'shopping-cart', label: 'Cửa hàng' }],
  [/nhà|gia đình|vợ|chồng|con|bố|mẹ|phòng/, { icon: 'home', label: 'Nhà' }], [/học|trường|lớp|thi|sách/, { icon: 'school', label: 'Trường' }],
  [/bệnh|bác sĩ|thuốc|sức khoẻ|sức khỏe/, { icon: 'first-aid-kit', label: 'Bệnh viện' }], [/tập|gym|chạy bộ|thể dục/, { icon: 'barbell', label: 'Phòng tập' }],
  [/đầu tư|chứng khoán|cổ phiếu|vàng/, { icon: 'trending-up', label: 'Sàn đầu tư' }], [/công viên|đi dạo|thiên nhiên|cây/, { icon: 'trees', label: 'Công viên' }],
];
const PLACES_VI = vi(PLACES.map(([re, p]) => [re, JSON.stringify(p)]));
const CHAT_NAMES: [RegExp, string][] = [[/vợ/, 'Vợ yêu'], [/chồng/, 'Chồng'], [/sếp/, 'Sếp'], [/mẹ/, 'Mẹ'], [/bố|ba\b/, 'Bố'], [/khách/, 'Khách hàng'], [/con\b/, 'Con'], [/người yêu|anh yêu|em yêu/, 'Người yêu']];
const CHAT_NAMES_VI = vi(CHAT_NAMES);
const LESSON = /^(mẹo|bài học|hãy|nhớ|đừng|lưu ý|tóm lại|nguyên tắc|bí quyết|vậy nên|cho nên)/i;
const UNIT = '(%|tr(?!\\p{L})|triệu|tỷ|nghìn|ngàn|k(?!\\p{L})|đồng|đ(?!\\p{L})|năm|tháng|ngày|giờ|phút|lần|người)';

/** Every number in a line, with its unit and the few words before it (its label). */
export function numbersIn(s: string) {
  const out: { value: number; unit: string; label: string }[] = [];
  const re = new RegExp(`(\\d+(?:[.,]\\d+)*)\\s*${UNIT}?`, 'giu');
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const raw = m[1], dots = (raw.match(/\./g) || []).length;
    // 15.000.000 → thousands separators; 1,5 → decimal comma
    const value = dots >= 1 && /^\d{1,3}(\.\d{3})+$/.test(raw) ? Number(raw.replace(/\./g, '')) : Number(raw.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    const before = s.slice(0, m.index).replace(/[,.:;]+\s*$/, '').split(/[,.:;]/).pop()!.trim().split(/\s+/).filter((w) => w && !FILLER.test(w)).slice(-3).join(' ');
    let unit = (m[2] || '').toLowerCase();
    if (unit === 'tr') unit = 'triệu';
    if (unit === 'k') unit = 'nghìn';
    if (unit === 'đồng') unit = 'đ';
    out.push({ value, unit, label: before.charAt(0).toUpperCase() + before.slice(1) });
  }
  return out;
}

const iconFor = (s: string) => iconsIn(s)[0]?.name;
const keysOf = (s: string) => [...iconsIn(s).map((x) => x.word), ...(s.match(/\d+(?:[.,]\d+)*\s*%?/g) || [])].slice(0, 4);

import {planIllustrated} from '../../addons/faciup-illustrated/schema.ts';
import { cleanWhiteboard } from '../../addons/faciup-whiteboard/faciup-schema.js';
import { freeWhiteboard } from '../../addons/faciup-whiteboard/semantic.ts';
export interface LookInput { look: string; recentDirections?: string[]; scenes: { lines: string[]; x?: any; pause?: number; panels?: any[]; act?: any; direction?: any }[]; sides?: { a: string; b: string }; chatName?: string; cast?: any[] }

/** Fill the format data of every scene (keeps what is already there). */
export function composeLook(input: LookInput): LookInput {
  const { look } = input, all = input.scenes.map((s) => s.lines.join(' ')).join(' ');
  let scenes = input.scenes.map((s) => ({ ...s, x: { ...(s.x || {}) } }));
  const out: LookInput = { ...input };
  if (look === 'director') return { ...input, scenes: planDirections(input.scenes, input.recentDirections) };
  if(look==='illustrated'){out.scenes=scenes.map((s:any)=>{const d=planIllustrated(s.lines,s.illustrated||s.x?.illustrated)!;return {...s,illustrated:d,panels:d.layers.map((l:any,k:number)=>({...s.panels?.[k],prompt:s.panels?.[k]?.prompt||l.prompt,image:s.panels?.[k]?.image||'',line:l.line}))};});return out;}
  if(look==='whiteboard') {
    out.scenes=scenes.map((s:any)=>({...s,whiteboard:cleanWhiteboard(s.whiteboard||s.x?.whiteboard)||freeWhiteboard(s.lines),panels:[]}));
    return out;
  }
  if (look === 'act') {
    // story animation: the AI's storyboard where it gave one, a storyboard from the words elsewhere
    const c = composeAct(scenes);
    const cast = Array.isArray(input.cast) && input.cast.length ? input.cast : c.cast;
    const ids = cast.map((x: any) => String(x.id));
    const remap = (a: any) => JSON.parse(JSON.stringify(a).replace(/"minh"/g, JSON.stringify(ids[0] || 'minh')).replace(/"lan"/g, JSON.stringify(ids[1] || ids[0] || 'lan')));
    out.cast = cast;
    out.scenes = scenes.map((s, i) => ({ ...s, act: s.act && typeof s.act === 'object' && Object.keys(s.act).length ? s.act : (cast === c.cast ? c.acts[i] : remap(c.acts[i])) }));
    return out;
  }
  for (const s of scenes) {
    const text = s.lines.join(' ');
    s.x.icon ||= iconFor(text);
    if (!s.x.keys?.length) s.x.keys = keysOf(text);
  }
  if (look === 'split') {
    const low = all.toLowerCase();
    out.sides ||= /giàu|nghèo/.test(low) ? { a: 'Người nghèo', b: 'Người giàu' } : /trước|sau/.test(low) && /trước khi|sau khi|trước đây|bây giờ/.test(low) ? { a: 'Trước đây', b: 'Bây giờ' } : { a: 'Cách sai', b: 'Cách đúng' };
    for (const s of scenes) {
      if (s.x.a && s.x.b) continue;
      let a = '', b = '';
      if (s.lines.length >= 2) { a = s.lines[0]; b = s.lines[1]; }
      else {
        const m = s.lines[0].match(/^(.*?)(?:,\s*|\s+)(?:nhưng|còn|trong khi|thì ngược lại|ngược lại)\s+(.*)$/iu);
        if (m && m[1].split(' ').length >= 3 && m[2].split(' ').length >= 3) { a = m[1]; b = m[2]; }
      }
      if (!a || !b) continue;
      // the "right" side speaks second; swap when the words say otherwise
      if (/giàu|đúng|thông minh|thành công/.test(a.toLowerCase()) && /nghèo|sai|thất bại/.test(b.toLowerCase())) [a, b] = [b, a];
      const strip = (x: string) => keyPhrase(x.replace(/^(người\s+(giàu|nghèo)|bên\s+\w+|cách\s+(sai|đúng))\s*/iu, ''), 8);
      s.x.a = strip(a); s.x.b = strip(b);
      // each side gets a picture of its own (not the word both sides share)
      const ia = iconsIn(a).map((x) => x.name), ib = iconsIn(b).map((x) => x.name);
      s.x.aIcon ||= ia.find((n) => !ib.includes(n)) || ia[0] || 'x'; s.x.bIcon ||= ib.find((n) => !ia.includes(n)) || ib[0] || 'check';
      const na = numbersIn(a)[0], nb = numbersIn(b)[0];
      if (na && nb) { s.x.aValue ||= `${na.value.toLocaleString('vi-VN')} ${na.unit}`.trim(); s.x.bValue ||= `${nb.value.toLocaleString('vi-VN')} ${nb.unit}`.trim(); }
      s.x.aAction ||= actionIn(a) || 'shrug'; s.x.bAction ||= actionIn(b) || 'cheer';
    }
  }
  if (look === 'chat') {
    out.chatName ||= CHAT_NAMES_VI.find(([re]) => re.test(all.toLowerCase()))?.[1] || 'Bạn thân';
    let n = 0;
    scenes.forEach((s, si) => {
      const last = si === scenes.length - 1;
      if (last && !s.x.card) { const lesson = [...s.lines].reverse().find((l) => LESSON.test(l.trim())); if (lesson) s.x.card = lesson; }
      if (!s.x.chat?.length) s.x.chat = s.lines.filter((l) => l !== s.x.card).map((l) => ({ who: (l.trim().endsWith('?') ? 'a' : n % 2 ? 'b' : 'a') as 'a' | 'b', text: l, _: n++ })).map(({ who, text }) => ({ who, text }));
    });
    // a question is answered by the other person
    let prev: string | null = null;
    for (const s of scenes) for (const m of s.x.chat) { if (prev && m.who === prev && !m.text.trim().endsWith('?')) m.who = prev === 'a' ? 'b' : 'a'; prev = m.who; }
  }
  if (look === 'story') {
    scenes.forEach((s, si) => {
      const text = s.lines.join(' ').toLowerCase();
      if (!s.x.place) { const hit = PLACES_VI.find(([re]) => re.test(text)); s.x.place = hit ? JSON.parse(hit[1]) : si === 0 ? { icon: 'home', label: 'Nhà' } : (scenes[si - 1].x.place || { icon: 'home', label: 'Nhà' }); }
      s.x.action ||= actionIn(text) || (si === scenes.length - 1 ? 'point' : 'idle');
      s.x.say ||= (s.lines.join(' ').match(/[“"]([^”"]{3,40})[”"]/)?.[1]) || keyPhrase(s.lines[0], 6);
      if (s.x.money === undefined) s.x.money = /tiền|tiêu|mua|chi tiêu|lương|nợ|trả góp|shopee/.test(text);
      if (!s.x.icons) s.x.icons = iconsIn(text).map((x) => x.name).filter((n) => n !== s.x.place.icon).slice(0, 2);
    });
  }
  if (look === 'data') {
    for (const s of scenes) {
      if (s.x.stat) continue;
      const nums = s.lines.flatMap((l) => numbersIn(l)).filter((n) => !['năm', 'tháng', 'ngày', 'giờ', 'phút'].includes(n.unit) || n.value > 31);
      if (!nums.length) continue;
      const [head, ...rest] = nums;
      const sameUnit = rest.filter((r) => r.unit === head.unit || (!r.unit && head.unit));
      s.x.stat = { value: head.value, unit: head.unit, label: head.label || keyPhrase(s.lines[0], 4) };
      if (sameUnit.length >= 2) s.x.stat.parts = sameUnit.slice(0, 5).map((r, i) => ({ label: r.label || `Phần ${i + 1}`, value: r.value }));
      else if (rest.length === 0 && nums.length === 1 && s.lines.length === 1) { /* a single big figure */ }
    }
  }
  if (look === 'quiz') {
    // a question gets a scene of its own, a countdown, then its answer
    const flat: typeof scenes = [];
    for (const s of scenes) {
      const qi = s.lines.findIndex((l) => l.trim().endsWith('?'));
      if (qi < 0 || s.lines.length === 1 || s.x.quiz) { flat.push(s); continue; }
      if (qi > 0) flat.push({ ...s, lines: s.lines.slice(0, qi), x: { ...s.x, quiz: undefined } });
      flat.push({ ...s, lines: [s.lines[qi]], x: { ...s.x } });
      if (qi + 1 < s.lines.length) flat.push({ ...s, lines: s.lines.slice(qi + 1), x: { ...s.x, quiz: undefined } });
    }
    scenes = flat;
    scenes.forEach((s, si) => {
      if (s.x.quiz || s.lines.length !== 1 || !s.lines[0].trim().endsWith('?')) return;
      const answer = scenes[si + 1];
      if (!answer || answer.x.quiz) return;
      const n = answer.lines.flatMap((l) => numbersIn(l))[0];
      // a real answer follows (not a rhetorical hook question followed by more story)
      if (!/^(đáp án|câu trả lời|trả lời|là|chính là|câu đúng|đúng là|thực ra|sự thật là)/iu.test(answer.lines[0].trim()) && !(si > 0 && n)) return;
      let options: string[] = [], right = 0;
      if (n) {
        const fmt = (v: number) => `${Math.round(v * 10) / 10}`.replace('.', ',') + (n.unit === '%' ? '%' : n.unit ? ' ' + n.unit : '');
        const vals = [n.value / 4, n.value, n.value * 2.5].map((v) => (v > 10 ? Math.round(v) : v));
        const order = hash(s.lines[0]) % 3; // where the right answer sits
        const opts = [vals[0], vals[2]]; opts.splice(order, 0, vals[1]);
        options = opts.map(fmt); right = order;
      }
      s.x.quiz = { q: s.lines[0], options, answer: right };
      s.pause = options.length ? 3 : 2.5;
      answer.x.quiz = { ...s.x.quiz, reveal: true };
    });
  }
  if (look === 'doc') {
    for (const s of scenes) if (!s.panels?.length || !s.panels[0]?.prompt) s.panels = [{ prompt: 'Cinematic documentary still, realistic, natural light, Vietnam setting, no text. Scene: ' + s.lines.join(' ') }];
  }
  out.scenes = scenes;
  return out;
}
