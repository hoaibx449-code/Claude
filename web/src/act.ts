// Story animation on the site: the storyboard brief for the AI, the sanitizer of what comes
// back, and a storyboard written from the words alone when no AI is available. The output is a
// timeline of animation events per scene (who does what, feeling what, when, where), which the
// render engine (src/engine/act) plays with rigged characters and the drawing hand.

export const ACT_ACTIONS = ['walk', 'run', 'idle', 'wave', 'point', 'cross', 'hips', 'shy', 'nervous', 'talk', 'explain', 'listen', 'nod', 'shake', 'think', 'celebrate',
  'sad', 'surprised', 'laugh', 'shrug', 'handshake', 'give', 'phone', 'sit', 'sit-talk', 'clap', 'facepalm', 'wait', 'look-around', 'bow'] as const;
export const ACT_EMOTIONS = ['neutral', 'happy', 'shy', 'nervous', 'confident', 'sad', 'surprised', 'thinking', 'laugh', 'angry', 'awkward', 'calm'] as const;
export const ACT_SETS = ['street', 'park', 'bench', 'cafe', 'office', 'party', 'room', 'bus', 'blank'] as const;
export const ACT_PROPS = ['bench', 'table', 'chair', 'stool', 'cup', 'phone', 'tree', 'bush', 'lamp', 'building', 'window', 'door', 'plant', 'desk', 'laptop', 'balloons', 'sign', 'sun', 'cloud',
  'heart', 'bulb', 'check', 'cross', 'question', 'exclaim', 'star', 'clock', 'coin', 'chart', 'book', 'gift', 'thought', 'wall'] as const;
export const ACT_MARKS = ['check', 'cross', 'heart', 'bulb', 'question', 'exclaim', 'star', 'coin', 'clock'] as const;
export const ACT_LOOKS = ['minh', 'lan', 'an', 'khoa', 'linh', 'tuan'] as const;
export const ACT_TRANSITIONS = ['pan', 'walk', 'match', 'morph', 'cut', 'draw'] as const;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const oneOf = <T extends readonly string[]>(v: unknown, list: T): T[number] | undefined => (list as readonly string[]).includes(v as string) ? (v as T[number]) : undefined;
const num = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : undefined; };
const ID = /^[a-z][a-z0-9]{0,11}$/;
const when = (v: unknown) => typeof v === 'number' ? num(v, 0, 60) : typeof v === 'string' && /^(L\d(e|@(0(\.\d+)?|1))?([+-]\d+(\.\d+)?)?|end(-\d+(\.\d+)?)?)$/.test(v.trim()) ? v.trim() : undefined;

/** Keeps only what the engine understands, within safe sizes. */
export function cleanCast(input: unknown) {
  const out: { id: string; name?: string; look: string }[] = [];
  for (const c of Array.isArray(input) ? input.slice(0, 4) : []) {
    const id = str((c as any)?.id, 12).toLowerCase();
    if (!ID.test(id) || out.some((x) => x.id === id)) continue;
    out.push({ id, name: str((c as any)?.name, 20) || undefined, look: oneOf((c as any)?.look, ACT_LOOKS) || ACT_LOOKS[out.length % ACT_LOOKS.length] });
  }
  return out;
}

export function cleanAct(a: any, cast: string[]) {
  if (!a || typeof a !== 'object') return undefined;
  const who = (v: unknown) => (typeof v === 'string' && cast.includes(v) ? v : undefined);
  const o: any = {};
  if (oneOf(a.set, ACT_SETS)) o.set = a.set;
  const props = (Array.isArray(a.props) ? a.props : []).slice(0, 4).map((p: any, i: number) => {
    const kind = oneOf(p?.kind, ACT_PROPS); if (!kind) return null;
    const id = ID.test(String(p?.id || '')) ? String(p.id) : `p${i}`;
    return { id, kind, x: num(p?.x, -260, 260) ?? 0, y: num(p?.y, -700, 0), s: num(p?.s, 0.4, 2) };
  }).filter(Boolean);
  if (props.length) o.props = props;
  const draw = (Array.isArray(a.draw) ? a.draw : []).filter((d: unknown) => d === 'set' || who(d) || props.some((p: any) => p.id === d)).slice(0, 4);
  if (draw.length) o.draw = draw;
  const castIn = (Array.isArray(a.cast) ? a.cast : []).map((c: any) => who(c?.id) && {
    id: c.id, x: num(c?.x, -260, 260) ?? 0, face: c?.face === -1 || c?.face === 1 ? c.face : undefined, do: oneOf(c?.do, ACT_ACTIONS), emo: oneOf(c?.emo, ACT_EMOTIONS),
    enter: c?.enter === 'left' || c?.enter === 'right' ? c.enter : undefined,
  }).filter(Boolean).slice(0, 4);
  if (castIn.length) o.cast = castIn;
  const beats = (Array.isArray(a.beats) ? a.beats : []).slice(0, 14).map((b: any) => {
    const x: any = {};
    if (who(b?.who)) x.who = b.who;
    const d = oneOf(b?.do, ACT_ACTIONS); if (d && x.who) x.do = d;
    const w = when(b?.at); if (w !== undefined) x.at = w;
    const dur = num(b?.dur, 0.3, 8); if (dur) x.dur = dur;
    if (typeof b?.to === 'number') x.to = num(b.to, -800, 800); else if (who(b?.to)) x.to = b.to;
    if (b?.face === 1 || b?.face === -1) x.face = b.face; else if (who(b?.face)) x.face = b.face;
    const e = oneOf(b?.emo, ACT_EMOTIONS); if (e) x.emo = e;
    if (str(b?.say, 60)) x.say = str(b.say, 60);
    if (str(b?.think, 60)) x.think = str(b.think, 60);
    if (b?.hold === null) x.hold = null; else if (oneOf(b?.hold, ACT_PROPS)) x.hold = b.hold;
    if (oneOf(b?.mark, ACT_MARKS)) x.mark = b.mark;
    if (b?.cam === 'close' || b?.cam === 'two' || b?.cam === 'wide') x.cam = b.cam;
    return Object.keys(x).length > (x.at !== undefined ? 1 : 0) ? x : null;
  }).filter(Boolean);
  if (beats.length) o.beats = beats;
  const text = (Array.isArray(a.text) ? a.text : []).slice(0, 3).map((t: any) => {
    const s = str(t?.text, 48); if (!s) return null;
    const kind = ['stamp', 'number', 'big', 'label'].includes(t?.kind) ? t.kind : 'stamp';
    return { text: s, kind, at: when(t?.at), dur: num(t?.dur, 0.5, 10), who: kind === 'label' ? who(t?.who) : undefined };
  }).filter(Boolean);
  if (text.length) o.text = text;
  if (a.badge === 'wrong' || a.badge === 'right') o.badge = a.badge;
  if (oneOf(a.transition, ACT_TRANSITIONS)) o.transition = a.transition;
  if (a.morph && oneOf(a.morph.to, ACT_PROPS) && (oneOf(a.morph.from, ACT_PROPS) || ID.test(String(a.morph.from || '')))) o.morph = { from: String(a.morph.from), to: a.morph.to };
  if (a.cam === 'wide' || a.cam === 'two' || a.cam === 'close') o.cam = a.cam;
  if (a.turn === true) o.turn = true;
  return o;
}

/** Brief for the AI storyboard (Vietnamese, like the other format briefs). */
export const ACT_BRIEF = [
  'ĐỊNH DẠNG: HOẠT HÌNH KỂ CHUYỆN (vẽ tay + nhân vật diễn xuất). Mỗi cảnh là MỘT TÌNH HUỐNG hoặc HÀNH ĐỘNG cụ thể khiến người xem hiểu ý ngay cả khi tắt tiếng. Không slideshow, không chỉ chữ, không người đứng yên.',
  'Ở gốc JSON có "cast":[{"id":"minh","name":"Minh","look":"minh|lan|an|khoa|linh|tuan"}] (1-3 nhân vật, giữ nguyên suốt video).',
  'Mỗi cảnh có "act":{ "set":"street|park|bench|cafe|office|party|room|bus|blank" (đổi nơi = cảnh mới, camera đi theo), "transition":"walk|pan|match|morph|cut|draw" (ưu tiên walk: nhân vật đi sang nơi mới; draw: vẽ thêm trên cùng trang), "draw":["minh"] (cảnh đầu: bàn tay vẽ nhân vật chính trước khi nhân vật cử động), "cast":[{"id":"minh","x":-120,"emo":"nervous","enter":"left|right (tuỳ chọn)"}] (x từ -240 đến 240, hai người cách nhau ≥ 220),',
  '"beats":[{"who":"minh","do":"HÀNH ĐỘNG","at":"L0|L1|L1@0.5|số giây","to":"lan (đi tới người đó) hoặc x","emo":"CẢM XÚC","say":"lời thoại ≤ 8 chữ","think":"suy nghĩ ≤ 8 chữ","mark":"check|cross|heart|bulb|question|exclaim|star","hold":"phone|cup|book|gift","cam":"close|two|wide"}],',
  '"text":[{"text":"TỪ KHOÁ ≤ 4 chữ","kind":"stamp|number|big","at":"L1"}] (chỉ khi cần nhấn khái niệm, con số; "big" = câu kết bàn tay viết), "badge":"wrong|right" (ví dụ sai/đúng bằng hành động), "turn":true khi cảnh đổi hướng câu chuyện }.',
  'HÀNH ĐỘNG: walk, run, idle, wave, point, cross (khoanh tay), hips (chống hông), shy, nervous, talk, explain, listen, nod, shake (lắc đầu), think, celebrate, sad, surprised, laugh, shrug, handshake, give, phone, sit, sit-talk, clap, facepalm, wait, look-around, bow. CẢM XÚC: neutral, happy, shy, nervous, confident, sad, surprised, thinking, laugh, angry, awkward, calm.',
  'NHỊP: mỗi 2-4 giây có một diễn biến mới (hành động, phản ứng, thoại, dấu hiệu); mỗi 10-15 giây một bước ngoặt (đổi nơi, tiết lộ kết quả, đối chiếu sai/đúng). Mở đầu bằng mâu thuẫn hoặc hành động cụ thể. Có nhân vật phản ứng với nhân vật khác. Cảm xúc nhân vật thay đổi theo câu chuyện. Kết thúc bằng một hình ảnh tổng kết mạnh (ăn mừng/bắt tay + câu "big").',
  'Không lặp cùng một hành động hai cảnh liền nhau. Chữ trên hình rất ít; lời thoại nhân vật ngắn, khác với lời dẫn.',
].join(' ');

// ---------------------------------------------------------------- storyboard from the words
const has = (s: string, re: RegExp) => re.test(s.toLowerCase());
const WRONG = /^(cách sai|sai lầm|đừng|không nên|tránh|lỗi)|\b(sai lầm|đừng)\b/;
const RIGHT = /^(cách đúng|hãy|nên|bí quyết|mẹo|thay vào đó)|\b(cách đúng|hãy thử)\b/;
const PROBLEM = /(ngại|sợ|lo|áp lực|mệt|chán|khó|nợ|thất bại|buồn|cô đơn|stress|căng thẳng|trì hoãn|không dám)/;
const GOOD = /(tự tin|thành công|vui|hạnh phúc|tốt hơn|giàu|tự do|bình an|thay đổi|chiến thắng)/;
const SETWORDS: [RegExp, string][] = [[/cà phê|quán/, 'cafe'], [/công ty|sếp|văn phòng|đồng nghiệp|họp|làm việc/, 'office'], [/tiệc|sự kiện|đám đông|bữa/, 'party'], [/công viên|đi dạo|thiên nhiên/, 'park'],
  [/đường|phố|đi bộ|ra ngoài/, 'street'], [/nhà|phòng|gia đình/, 'room'], [/xe buýt|chờ xe|bến/, 'bus'], [/ghế đá|ngồi/, 'bench']];
const setFor = (s: string, fallback: string) => SETWORDS.find(([re]) => re.test(s.toLowerCase()))?.[1] || fallback;

function phrase(s: string, max = 4) {
  const w = s.replace(/[.,!?…:;"“”]/g, ' ').split(/\s+/).filter((x) => x.length > 1 && !/^(và|nhưng|mà|thì|là|của|cho|với|các|những|một|này|đó|rồi|cũng|bạn|mình|hãy|nếu|khi|vì|để|rất|lại|như)$/i.test(x));
  return w.slice(0, max).join(' ').toUpperCase();
}

/** A storyboard written from the lines alone (two people, an emotional arc, sai/đúng, a closing image). */
export function composeAct(scenes: { lines: string[] }[]) {
  const all = scenes.map((s) => s.lines.join(' ')).join(' ');
  const cast = [{ id: 'minh', name: 'Minh', look: 'minh' }, { id: 'lan', name: 'Lan', look: 'lan' }];
  let place = setFor(all, 'street'), moved = 0;
  const n = scenes.length;
  const out = scenes.map((sc, i) => {
    const text = sc.lines.join(' '), first = sc.lines[0] || '', last = i === n - 1;
    const act: any = { beats: [], text: [] };
    if (i === 0) {
      act.set = place; act.draw = ['minh'];
      act.cast = [{ id: 'minh', x: -120, face: 1, emo: has(text, PROBLEM) ? 'nervous' : 'thinking' }, { id: 'lan', x: 130, face: -1 }];
      const thought = phrase(first, 4).toLowerCase();
      act.beats.push({ who: 'minh', do: has(text, PROBLEM) ? 'nervous' : 'think', think: thought ? thought[0].toUpperCase() + thought.slice(1) + '…?' : undefined });
      act.beats.push({ who: 'lan', do: 'phone', hold: 'phone', at: 0 });
      if (sc.lines[1]) act.beats.push({ who: 'minh', do: 'shy', at: 'L1', mark: 'question' });
      act.text.push({ text: phrase(sc.lines[1] || first, 3), kind: 'stamp', at: sc.lines[1] ? 'L1' : 'L0@0.5' });
      return act;
    }
    if (last) {
      act.transition = 'match'; act.cam = 'two';
      act.beats.push({ who: 'minh', do: 'celebrate', at: 0.5, emo: 'confident', cam: 'wide' }, { who: 'lan', do: 'clap', at: 0.6, emo: 'happy' });
      act.text.push({ text: (sc.lines[sc.lines.length - 1] || first).replace(/[.!…]+$/, '').slice(0, 48), kind: 'big', at: 0.8 });
      return act;
    }
    const nextPlace = setFor(text, place);
    if ((nextPlace !== place || (i - moved >= 3)) && i < n - 1) {
      // a new place every few scenes: Minh walks there, the camera follows
      place = nextPlace !== place ? nextPlace : (['cafe', 'park', 'office', 'street'].find((p) => p !== place) as string);
      moved = i; act.set = place; act.transition = 'walk'; act.turn = true;
      act.cast = [{ id: 'minh', x: -150 }, { id: 'lan', x: 120, face: -1 }];
    } else act.transition = 'draw';
    if (i === 1) act.beats.push({ who: 'lan', hold: null, at: 0 });
    if (has(first, WRONG)) {
      act.badge = 'wrong';
      act.beats.push({ who: 'minh', do: 'walk', to: 'lan', at: 0.3, emo: 'awkward', hold: 'phone' }, { who: 'minh', do: 'phone', say: 'Ờ… chào…', at: 'L0@0.6' },
        { who: 'lan', do: 'shrug', at: sc.lines[1] ? 'L1' : 'L0e', emo: 'awkward' }, { who: 'minh', do: 'sad', emo: 'sad', mark: 'cross', at: sc.lines[1] ? 'L1@0.6' : 'L0e+0.3', hold: null });
    } else if (has(first, RIGHT)) {
      act.badge = 'right'; act.turn = true;
      act.beats.push({ who: 'minh', do: 'walk', to: 'lan', at: 0.2, emo: 'confident' }, { who: 'minh', do: 'wave', emo: 'happy', say: 'Chào bạn!' },
        { who: 'lan', do: 'talk', at: sc.lines[1] ? 'L1' : 'L0e', emo: 'happy', say: 'Chào, rất vui!' }, { who: 'minh', do: 'handshake', at: sc.lines[1] ? 'L1@0.6' : 'L0e+0.5', mark: 'check' }, { who: 'lan', do: 'handshake', at: sc.lines[1] ? 'L1@0.62' : 'L0e+0.52' });
    } else if (/\d/.test(text)) {
      const m = text.match(/\d+(?:[.,]\d+)?\s*(%|triệu|tỷ|nghìn|giây|phút|ngày|lần|bước|người)?/);
      act.beats.push({ who: 'minh', do: 'explain', emo: 'confident', at: 0.2 }, { who: 'lan', do: 'listen', at: 0.4 }, { who: 'lan', do: 'nod', at: 'L0@0.7' }, { who: 'minh', do: 'point', at: sc.lines[1] ? 'L1' : 'L0e' });
      if (m) act.text.push({ text: m[0].trim(), kind: 'number', at: 'L0@0.3', dur: 2.4 });
    } else if (has(text, PROBLEM)) {
      act.beats.push({ who: 'minh', do: 'sad', emo: 'sad', at: 0.2 }, { who: 'lan', do: 'walk', to: 'minh', at: 'L0@0.4', emo: 'calm' }, { who: 'lan', do: 'talk', say: 'Không sao đâu!', at: sc.lines[1] ? 'L1' : 'L0e' }, { who: 'minh', do: 'nod', at: sc.lines[1] ? 'L1@0.6' : 'L0e+0.6', emo: 'calm' });
    } else if (has(text, GOOD)) {
      act.beats.push({ who: 'minh', do: 'hips', emo: 'confident', at: 0.2, mark: 'star' }, { who: 'lan', do: 'clap', at: 'L0@0.5', emo: 'happy' }, { who: 'minh', do: 'laugh', at: sc.lines[1] ? 'L1' : 'L0e' });
    } else {
      const k = i % 3;
      if (k === 0) act.beats.push({ who: 'minh', do: 'think', emo: 'thinking', at: 0.2, mark: 'bulb' }, { who: 'minh', do: 'explain', at: sc.lines[1] ? 'L1' : 'L0@0.6', emo: 'happy' }, { who: 'lan', do: 'nod', at: sc.lines[1] ? 'L1@0.5' : 'L0e' });
      else if (k === 1) act.beats.push({ who: 'lan', do: 'explain', emo: 'happy', at: 0.2, cam: 'two' }, { who: 'minh', do: 'listen', at: 0.3 }, { who: 'minh', do: 'surprised', at: sc.lines[1] ? 'L1' : 'L0@0.7', mark: 'exclaim' });
      else act.beats.push({ who: 'minh', do: 'talk', emo: 'happy', at: 0.2, say: phrase(first, 3).toLowerCase() }, { who: 'lan', do: 'laugh', at: sc.lines[1] ? 'L1' : 'L0e', emo: 'happy' }, { who: 'minh', cam: 'close', at: 'L0@0.5' });
    }
    if (!act.text.length && sc.lines[1] && i % 2 === 1) act.text.push({ text: phrase(sc.lines[1], 3), kind: 'stamp', at: 'L1' });
    if (!act.text.length) delete act.text;
    return act;
  });
  return { cast, acts: out };
}
