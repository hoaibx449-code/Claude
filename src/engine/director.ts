// A constrained scene graph, not executable AI code. Shared by Worker and renderer.
export const COMPOSITIONS = ['focus', 'compare', 'flow', 'funnel', 'steps', 'orbit', 'quote', 'free'] as const;
export type Composition = typeof COMPOSITIONS[number];
export interface DirectorNode {
  id: string; label: string; icon?: string; x: number; y: number; w: number; h: number;
  line: number; delay: number; shape: 'card' | 'circle' | 'text'; accent: boolean;
  enter: 'rise' | 'slide' | 'scale' | 'fade';
}
export interface Direction {
  composition: Composition; title: string; meaning: string; nodes: DirectorNode[];
  links: { from: string; to: string; line: number }[]; transition: 'fade' | 'slide' | 'zoom';
}
const text = (v: unknown, n: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '';
const num = (v: unknown, a: number, b: number, d: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d;
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
const short = (s: string, n = 7) => s.split(/\s+/).slice(0, n).join(' ').replace(/[,;:.!?]+$/, '');

/** Only declarative, bounded objects survive. Unknown links and duplicate ids are removed. */
export function cleanDirection(v: any, lines: string[]): Direction | undefined {
  if (!v || typeof v !== 'object' || !Array.isArray(v.nodes)) return;
  const ids = new Set<string>();
  const nodes: DirectorNode[] = [];
  for (const n of v.nodes.slice(0, 7)) {
    if (!n || !text(n.label, 56)) continue;
    const id = /^[a-zA-Z0-9_-]{1,20}$/.test(n.id) ? n.id : `n${nodes.length}`;
    if (ids.has(id)) continue;
    ids.add(id);
    const w = num(n.w, 14, 88, 38), h = num(n.h, 10, 52, 22);
    nodes.push({ id, label: text(n.label, 56), icon: /^[a-z0-9-]{2,40}$/.test(n.icon) ? n.icon : undefined,
      x: num(n.x, w / 2 + 2, 98 - w / 2, 50), y: num(n.y, h / 2 + 2, 98 - h / 2, 50), w, h,
      line: Math.round(num(n.line, 0, Math.max(0, lines.length - 1), 0)), delay: num(n.delay, 0, 0.65, 0),
      shape: ['circle', 'text'].includes(n.shape) ? n.shape : 'card', accent: n.accent === true,
      enter: ['slide', 'scale', 'fade'].includes(n.enter) ? n.enter : 'rise' });
  }
  if (!nodes.length) return;
  return { composition: COMPOSITIONS.includes(v.composition) ? v.composition : 'free', title: text(v.title, 56) || short(lines[0] || ''),
    meaning: text(v.meaning, 240), nodes,
    links: (Array.isArray(v.links) ? v.links : []).slice(0, 10).filter((l: any) => l && ids.has(l.from) && ids.has(l.to) && l.from !== l.to)
      .map((l: any) => ({ from: l.from, to: l.to, line: Math.round(num(l.line, 0, Math.max(0, lines.length - 1), 0)) })),
    transition: ['slide', 'zoom'].includes(v.transition) ? v.transition : 'fade' };
}

/** Content-first fallback: never manufacture figures, quotations or claims. */
export function fallbackDirection(lines: string[], avoid: string[] = []): Direction {
  const words = fold(lines.join(' '));
  let candidates: Composition[];
  if (/\b(thay vi|nhung|trai lai|so voi|khac)\b|\btruoc\b.*\bsau\b/.test(words)) candidates = ['compare', 'flow', 'orbit'];
  else if (/chon|loai|sang loc|thu hep/.test(words)) candidates = ['funnel', 'flow', 'steps'];
  else if (/buoc|viec can|dau tien|tiep theo|cuoi cung/.test(words)) candidates = ['steps', 'flow', 'orbit'];
  else if (/vi |dan den|khien|nen |ket qua/.test(words)) candidates = ['flow', 'orbit', 'steps'];
  else candidates = lines.length > 1 ? ['orbit', 'flow', 'steps', 'compare'] : ['focus', 'quote'];
  const composition = candidates.find((c) => !avoid.includes(c)) || candidates.find((c) => c !== avoid[0]) || candidates[0];
  const phrases = lines.flatMap((s) => s.split(/[,;:]\s*/)).filter(Boolean).slice(0, 4);
  const n = Math.max(1, phrases.length);
  const nodes = phrases.map((s, i) => {
    let x = 50, y = 50, w = 80, h = 30;
    if (composition === 'compare') { x = i % 2 ? 74 : 26; y = n > 2 ? 28 + Math.floor(i / 2) * 44 : 50; w = 42; h = 32; }
    else if (['steps', 'flow', 'funnel'].includes(composition)) { y = 16 + (i + 0.5) * 68 / n; w = composition === 'funnel' ? 84 - i * 12 : 80; h = Math.min(24, 56 / n); }
    else if (composition === 'orbit') { x = i % 2 ? 72 : 28; y = 26 + Math.floor(i / 2) * 46; w = 42; h = 30; }
    return { id: `n${i}`, label: short(s), x, y, w, h, line: Math.max(0, lines.findIndex((l) => l.includes(s))), delay: i * 0.12,
      shape: composition === 'quote' ? 'text' : 'card', accent: i === n - 1, enter: ['rise', 'slide', 'scale'][i % 3] };
  });
  return cleanDirection({ composition, title: short(lines[0] || ''), meaning: 'Minh hoạ từ nội dung lời đọc.', nodes,
    links: ['flow', 'funnel'].includes(composition) ? nodes.slice(1).map((node, i) => ({ from: nodes[i].id, to: node.id, line: node.line })) : [],
    transition: composition === 'focus' ? 'zoom' : composition === 'flow' ? 'slide' : 'fade' }, lines)!;
}

export const directionSignature = (d: Direction) => `${d.composition}:${d.nodes.map((n) => `${Math.round(n.x / 20)},${Math.round(n.y / 20)},${n.shape}`).join('|')}`;
export function directionIssues(d: Direction): string[] {
  const issues: string[] = [];
  for (let i = 0; i < d.nodes.length; i++) for (let j = i + 1; j < d.nodes.length; j++) {
    const a = d.nodes[i], b = d.nodes[j];
    if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 1) issues.push(`Vật ${a.id} chồng ${b.id}`);
  }
  return issues;
}

/** Preserve good AI staging; repair unreadable graphs and avoid fallback runs. */
export function planDirections(scenes: { lines: string[]; direction?: any }[], history: string[] = []) {
  const recent = [...history].slice(0, 5);
  return scenes.map((sc) => {
    let d = cleanDirection(sc.direction, sc.lines);
    if (!d || directionIssues(d).length) d = fallbackDirection(sc.lines, recent.slice(0, 2));
    recent.unshift(d.composition); recent.length = Math.min(recent.length, 5);
    return { ...sc, direction: d };
  });
}

export const DIRECTOR_BRIEF = `Bạn là đạo diễn đồ hoạ giải thích. Thiết kế theo Ý NGHĨA từng cảnh, không lặp chuỗi bố cục. Cùng một video có thể so sánh, lọc lựa chọn, nguyên nhân-kết quả, tình huống, các bước và chữ nhấn. Không bịa số liệu, không tự thêm phát ngôn. Lời trên hình là từ khoá ngắn tiếng Việt, không chép cả câu đọc.
Mỗi cảnh có direction:{composition:"focus|compare|flow|funnel|steps|orbit|quote|free",title:"tiêu đề tối đa 7 từ",meaning:"ý nghĩa cần truyền đạt",transition:"fade|slide|zoom",nodes:[{id:"n1",label:"tối đa 7 từ",icon:"Tabler icon tuỳ chọn",x:50,y:50,w:40,h:24,line:0,delay:0,shape:"card|circle|text",accent:true,enter:"rise|slide|scale|fade"}],links:[{from:"n1",to:"n2",line:1}]}.
Toạ độ, kích thước là % vùng minh hoạ (không gồm tiêu đề/phụ đề), tâm x,y. Thiết kế TỰ DO vị trí và kích thước theo nội dung; composition chỉ mô tả ý đồ, không khoá bố cục. Tối đa 7 vật, không chồng vật, nằm gọn 2..98%. line là chỉ số câu 0..2, delay là phần thời gian trong câu 0..0.65. Chỉ nối id tồn tại. Mỗi câu có thay đổi hình có nghĩa. Ưu tiên tiêu đề một dòng, không quá hai dòng. Thay đổi cả bố cục và nhịp, tránh hai cảnh liên tiếp giống nhau. Không panels, không x.`;
