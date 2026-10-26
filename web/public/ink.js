// Ink Studio pages: create a hand-drawn video, my videos, one video (progress, storyboard review, player, re-pace).
const PACES = [['slow', 'Chậm'], ['normal', 'Vừa'], ['fast', 'Nhanh'], ['faster', 'Rất nhanh']];
const PACE_NOTE = { slow: 'Đọc thong thả, vẽ chậm rãi', normal: 'Nhịp video ngắn tiêu chuẩn', fast: 'Dồn dập, đổi cảnh nhanh', faster: 'Rất dồn dập, hợp video dưới 1 phút' };
const MOODS = [['auto', 'Tự chọn theo nội dung'], ['motivating', 'Truyền động lực'], ['calm', 'Nhẹ nhàng'], ['upbeat', 'Sôi động'], ['emotional', 'Cảm xúc'], ['none', 'Không nhạc'], ['mine', 'Nhạc của tôi…']];
const WHERE_NOTE = { server: 'Bạn có thể rời trang, video tự dựng xong và báo cho bạn.', browser: 'Làm toàn bộ trên máy tính/điện thoại của bạn, không cần máy chủ dựng. Cần mở trang trong lúc dựng (khoảng 2–5 phút cho video 1 phút).' };
const FORMAT_NOTE = { shorts3d: 'AI dựng cảnh 3D ẩn dụ theo nội dung: vật thể, màu và chuyển động riêng cho từng video. Video dọc 9:16, giọng thật và phụ đề; máy GitHub dựng, bạn có thể rời trang. Tối đa 2 phút. Hình học 3D tối giản, chưa phải cảnh quay chân thực.', ink: 'Bàn tay vẽ từng cảnh trên nền giấy, như video whiteboard.', cine: 'Cảnh quay và ảnh thật lấp kín khung, máy quay chuyển động, chữ và số liệu hiện trong không gian, phụ đề kiểu CapCut. Dựng trên máy chủ.',
  money: 'Đòn Bẩy Tư Duy: video truyền cảm hứng kể bằng một hành trình 3D (máy quay đi qua những không gian ẩn dụ, ánh sáng theo cảm xúc, nhạc dâng tới cao trào). AI tìm sự thật và nghiên cứu thật; dán link bài báo nếu có. Nhận kèm kịch bản thoại và phụ đề .ass để tự thu giọng.' };
const LENGTHS =[[30, '30 giây'], [60, '1 phút'], [90, '1,5 phút'], [120, '2 phút'], [180, '3 phút'], [300, '5 phút']];
const STATUS = { queued: 'Đang chờ máy dựng', running: 'Đang dựng', review: 'Chờ bạn duyệt phân cảnh', browser: 'Sẵn sàng dựng trên máy của bạn', done: 'Đã xong', failed: 'Chưa dựng được' };
const DEFAULTS = { voices: [{ id: 'hoaimy', label: 'Hoài My (nữ)' }, { id: 'namminh', label: 'Nam Minh (nam)' }], defaults: { pace: 'normal', seconds: 60, mood: 'auto', captions: true, review: false, voice: 'hoaimy' }, maxSeconds: 300 };
const mins = (s) => s < 90 ? `${Math.max(1, Math.round(s / 60))} phút` : `${Math.round(s / 60)} phút`;
/** what the user can expect, from the last videos of this type (never a fixed promise) */
function etaText(eta, format, browser) {
  if (browser) return 'Dựng trên máy này: giữ trang mở đến khi xong (khoảng 2–5 phút cho video 1 phút, tuỳ máy).';
  const e = (eta || {})[format];
  return (e && e.n >= 3 ? `Các video gần đây: chờ máy dựng khoảng ${mins(e.wait)}, dựng khoảng ${mins(e.run)}. ` : 'Thời gian tuỳ hàng chờ và độ dài video; trang video sẽ hiện ước tính. ')
    + 'Bạn có thể rời trang, video xong sẽ báo cho bạn.';
}
// the proposal of a 'Đòn Bẩy Tư Duy' video, read before it is made
function proposalView(h, p) {
  if (!p) return null;
  const list = (t, xs) => xs && xs.length ? [h('h3', {}, t), h('ul', { class: 'ink-prop-list' }, xs.map((x) => h('li', {}, x)))] : [];
  return h('div', { class: 'ink-proposal' },
    ...list('Sự thật dùng trong video', p.facts), ...list('Video sẽ không khẳng định', p.not_said),
    h('dl', { class: 'ink-prop-dl' }, ...[['Mở đầu (3 giây)', p.hook], ['Thông điệp', p.message], ['Câu chốt', p.closing], ['Câu hỏi bình luận', p.question]].filter(([, v]) => v).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    p.scenes?.length ? h('div', { class: 'ink-table-wrap' }, h('table', { class: 'ink-prop-table' }, h('thead', {}, h('tr', {}, ['#', 'Thời gian', 'Không gian và máy quay', 'Ánh sáng', 'Nội dung'].map((x) => h('th', {}, x)))),
      h('tbody', {}, p.scenes.map((r, i) => h('tr', {}, h('td', {}, String(i + 1)), h('td', {}, r.time), h('td', {}, `${r.space}: ${r.camera}`), h('td', {}, r.light), h('td', {}, r.content)))))) : null);
}
// the script table of a series video: [Scene X – time] [Voiceover] [Visual Prompt]
function scriptTable(h, sb) {
  if (!Array.isArray(sb?.table) || !sb.table.length) return null;
  return h('details', { class: 'card ink-table' }, h('summary', {}, 'Bảng kịch bản' + (sb.metaphor ? ` · ẩn dụ: ${sb.metaphor}` : '')),
    h('div', { class: 'ink-table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Cảnh'), h('th', {}, 'Lời đọc'), h('th', {}, 'Visual prompt'))),
      h('tbody', {}, sb.table.map((r) => h('tr', {}, h('td', {}, `Cảnh ${r.scene}`, h('small', {}, r.time)), h('td', {}, r.voiceover), h('td', { lang: 'en' }, r.visual)))))));
}
// made on the render machines: the person may close the page; say how they will hear (this device, Zalo)
async function pushOn() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'none';
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration(); return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}
function serverNotice(h) {
  const p = h('p', { class: 'muted' }, 'Video đang được dựng trên máy chủ: bạn có thể đóng trang. Khi xong, video hiện trong "Video của tôi" và được gửi qua Zalo nếu bạn đã liên kết.');
  const btn = h('button', { type: 'button', class: 'ghost small', hidden: true }, 'Báo cho tôi trên thiết bị này khi xong');
  pushOn().then((st) => { if (st === 'off') btn.hidden = false; else if (st === 'on') p.append(' Thiết bị này cũng sẽ nhận thông báo.'); }).catch(() => {});
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('Trình duyệt chưa cho phép thông báo.');
      const reg = await navigator.serviceWorker.ready, { key } = await (await fetch('/api/push/key', { credentials: 'same-origin', headers: { 'x-nv': '1' } })).json();
      const b = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4)), (c) => c.charCodeAt(0));
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b });
      await fetch('/api/push/subscribe', { method: 'POST', credentials: 'same-origin', headers: { 'x-nv': '1', 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      btn.replaceWith(h('small', { class: 'muted' }, 'Đã bật: thiết bị này sẽ báo khi video xong.'));
    } catch (e) { btn.disabled = false; btn.textContent = e.message || 'Chưa bật được thông báo.'; }
  };
  return h('div', {}, p, btn);
}
const file = (id, name) => `/api/ink/jobs/${id}/${'file/' + name}`;

const VERDICT = { dung: ['✓', 'Có nguồn xác nhận', 'ok'], chua_chac: ['?', 'Chưa đủ nguồn', 'warn'], sai: ['✗', 'Nguồn nói khác', 'bad'] };
/** what was checked before anyone sees the video: each claim, the verdict, the source, and what was said instead */
function factsCard(h, f, open = true) {
  if (!f || f.skipped) return h('section', { class: 'card ink-facts' }, h('h2', {}, 'Kiểm chứng nội dung'), h('p', { class: 'muted' }, 'Lần này chưa kiểm chứng được tự động. Hãy tự xem lại các con số và khẳng định trước khi đăng.'));
  const claims = f.claims || [], bad = claims.filter((c) => c.verdict !== 'dung').length;
  const head = claims.length ? `${claims.length} khẳng định · ${claims.length - bad} có nguồn` + (bad ? ` · ${bad} chưa chắc chắn` : '') : 'Không có con số hay khẳng định nào cần kiểm chứng.';
  const list = h('ul', { class: 'ink-claims' }, claims.map((c) => { const [ic, label, cls] = VERDICT[c.verdict] || VERDICT.chua_chac;
    return h('li', { class: 'v-' + cls }, h('b', { class: 'ic', title: label }, ic), h('div', {}, h('strong', {}, c.claim),
      c.evidence ? h('p', { class: 'muted' }, c.evidence) : null, c.source ? h('small', { class: 'muted' }, 'Nguồn: ' + c.source) : null,
      c.applied ? h('p', { class: 'ink-fixed' }, 'Đã nói lại thận trọng: “' + (c.fix || '') + '”') : c.fix && c.verdict !== 'dung' ? h('p', { class: 'ink-fixed' }, 'Gợi ý sửa: “' + c.fix + '”') : null)); }));
  const src = (f.sources || []).filter((s) => /^https?:\/\//.test(s.url || ''));
  return h('details', { class: 'card ink-facts', open }, h('summary', {}, h('strong', {}, 'Kiểm chứng nội dung'), h('span', { class: 'muted' }, ' · ' + head)),
    f.web === false ? h('p', { class: 'muted' }, 'Không tra được web lúc kiểm chứng: điều gì không chắc chắn đã được nói thận trọng. Nên tự xem lại trước khi đăng.') : null,
    f.note ? h('p', { class: 'ink-note' }, f.note) : null, claims.length ? list : null,
    src.length ? h('div', { class: 'ink-sources' }, h('small', { class: 'muted' }, 'Trang đã tra cứu:'), h('ul', {}, src.map((s) => h('li', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.title || new URL(s.url).hostname))))) : null);
}

const FIELD = { label: 'Nhãn', title: 'Tiêu đề', text: 'Chữ', author: 'Tác giả', number: 'Con số', question: 'Câu hỏi', value_label: 'Nhãn giá trị', items: 'Ý', steps: 'Bước',
  milestones: 'Chặng', goal: 'Đích', name: 'Tên', before: 'Trước', after: 'Sau', left: 'Bên trái', right: 'Bên phải', options: 'Lựa chọn', prop: 'Hình vẽ' };
const NOT_TEXT = new Set(['layout', 'pose', 'face', 'color', 'pick', 'type']);
const HOLDS = [[0, 'Như cũ'], [0.5, '+0,5 giây'], [1, '+1 giây'], [1.5, '+1,5 giây'], [2, '+2 giây'], [3, '+3 giây']];
/** scene by scene: the words read, the words drawn, the object drawn and how long it stays. Nothing goes back to the
 *  AI: a finished video is drawn again from the corrected storyboard, a storyboard under review is just saved. */
async function sceneEditor(ctx, j, onDone) {
  const { h, api, fail, busy, navigate } = ctx;
  const [{ storyboard: sb }, cat] = await Promise.all([api(`/api/ink/jobs/${j.id}/storyboard?full=1`), api('/api/ink/catalog').catch(() => ({ props: [] }))]);
  if (!sb?.scenes?.length) return null;
  const props = cat.props || [], rows = [];
  const fields = (v, path, out) => {
    if (typeof v === 'string') {
      const k = path[path.length - 1];
      if (typeof k === 'string' && NOT_TEXT.has(k)) return;
      const name = path.filter((x) => typeof x === 'string').map((x) => FIELD[x] || x).join(' · ') + (typeof k === 'number' ? ' ' + (k + 1) : '');
      const el = k === 'prop' ? h('select', {}, (props.some(([p]) => p === v) ? props : [[v, v], ...props]).map(([p, l]) => h('option', { value: p, selected: p === v }, l)))
        : h('input', { value: v, maxlength: 120 });
      out.push({ path, el, field: h('label', { class: 'ink-field' }, h('span', { class: 'muted' }, name), el) });
    } else if (Array.isArray(v)) v.forEach((x, i) => fields(x, [...path, i], out));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => fields(x, [...path, k], out));
  };
  const list = h('ol', { class: 'ink-edit' }, sb.scenes.map((s, i) => {
    const say = h('textarea', { rows: 2, maxlength: 400 }); say.value = s.say;
    const inputs = []; fields(s.visual || {}, [], inputs);
    let hold = s.hold || 0;
    rows.push({ say, inputs, get hold() { return hold; } });
    return h('li', { class: 'card' }, h('label', { class: 'ink-field' }, h('span', { class: 'muted' }, `Cảnh ${i + 1} · lời đọc`), say),
      inputs.length ? h('div', { class: 'ink-fields' }, inputs.map((x) => x.field)) : null,
      h('div', { class: 'ink-field' }, h('span', { class: 'muted' }, 'Giữ cảnh lâu thêm'), chips(h, HOLDS.map(([k, l]) => [k, l]), hold, (v) => { hold = v; })));
  }));
  const review = j.status === 'review';
  const save = h('button', { type: 'button', class: 'btn' }, review ? 'Lưu các cảnh đã sửa' : 'Dựng lại với các cảnh đã sửa');
  save.onclick = () => busy(save, 'Đang gửi…', async () => {
    const scenes = sb.scenes.map((s, i) => {
      const visual = JSON.parse(JSON.stringify(s.visual || {}));
      for (const { path, el } of rows[i].inputs) { let o = visual; path.slice(0, -1).forEach((p) => { o = o[p]; }); o[path[path.length - 1]] = el.value; }
      return { say: rows[i].say.value, visual, hold: rows[i].hold };
    });
    try { const r = await api(`/api/ink/jobs/${j.id}/scenes`, { method: 'PUT', body: { scenes } }); if (r.id !== j.id) navigate('/ink/' + r.id); else onDone(); } catch (e) { fail(e); }
  });
  return h('details', { class: 'card ink-editor', open: review }, h('summary', {}, h('strong', {}, 'Sửa từng cảnh'), h('span', { class: 'muted' }, review ? ' · sửa lời đọc, chữ, hình vẽ, thời lượng rồi lưu' : ' · chỉ đọc lại giọng và vẽ lại, không gọi AI viết lại')),
    h('p', { class: 'muted' }, review ? 'Sửa xong bấm Lưu, rồi bấm Dựng video.' : 'Kịch bản và phân cảnh còn lại giữ nguyên. Dựng lại tính một lượt dựng.'), list, h('div', { class: 'row' }, save));
}

function chips(h, list, value, onPick, cls = '') {
  const box = h('div', { class: 'ink-chips ' + cls, role: 'radiogroup' });
  const paint = (v) => box.replaceChildren(...list.map(([k, label, off]) => h('button', { type: 'button', class: 'chip' + (k === v ? ' on' : ''), role: 'radio', 'aria-checked': String(k === v), disabled: !!off,
    onclick: () => { paint(k); onPick(k); } }, label)));
  paint(value); return box;
}

export async function showInkCreate(ctx) {
  const { h, api, show, me, openLogin, toast, fail, navigate, busy, footer } = ctx;
  const cfg = me ? await api('/api/ink/config').catch(() => DEFAULTS) : DEFAULTS;
  const d = cfg.defaults;
  const st = { format: 'ink', mode: 'topic', topic: '', script: '', seconds: Math.min(d.seconds, cfg.maxSeconds), pace: d.pace, voice: d.voice, mood: d.mood, music: '', captions: d.captions, review: d.review, audience: '', tone: '', notes: '', browser: false, series: '', aspect: '9:16', source: '' };
  try { Object.assign(st, JSON.parse(sessionStorage.getItem('ink-draft') || '{}'), { music: '' }); } catch { /* fresh form */ }
  const keep = () => { try { sessionStorage.setItem('ink-draft', JSON.stringify({ ...st, music: '' })); } catch { /* private mode */ } };
  const text = h('textarea', { rows: 3, class: 'ink-topic', maxlength: 500 });
  const paintText = () => {
    const topic = st.mode === 'topic';
    text.rows = topic ? 3 : 10; text.maxLength = topic ? 500 : 12000; text.value = topic ? st.topic : st.script;
    text.placeholder = topic ? 'Ví dụ: Vì sao bạn luôn bỏ cuộc giữa chừng và cách giữ lửa đến cùng' : 'Dán kịch bản của bạn. Mỗi câu một dòng càng tốt; AI giữ nguyên ý và giọng văn, chỉ chỉnh cho dễ đọc thành tiếng.';
    lenRow.hidden = !topic;
  };
  text.oninput = () => { st[st.mode] = text.value; keep(); };
  const lenRow = h('div', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Độ dài'),
    chips(h, LENGTHS.map(([s, l]) => [s, l, s > cfg.maxSeconds]), st.seconds, (v) => { st.seconds = v; keep(); }));
  const paceNote = h('small', { class: 'muted' }, PACE_NOTE[st.pace]);
  const whereNote = h('small', { class: 'muted' }, WHERE_NOTE[st.browser ? 'browser' : 'server']);
  const musicFile = h('input', { type: 'file', accept: 'audio/mpeg,audio/mp4,audio/x-m4a,audio/wav', hidden: true });
  const musicNote = h('small', { class: 'muted' });
  const mood = h('select', { 'aria-label': 'Nhạc nền', onchange: () => { if (mood.value === 'mine') musicFile.click(); else { st.mood = mood.value; st.music = ''; musicNote.textContent = ''; keep(); } } },
    MOODS.map(([k, l]) => h('option', { value: k, selected: k === st.mood }, l)));
  musicFile.onchange = async () => {
    const f = musicFile.files?.[0]; if (!f) { mood.value = st.mood; return; }
    if (f.size > 15e6) { toast('Tệp nhạc tối đa 15 MB.'); mood.value = st.mood; return; }
    musicNote.textContent = 'Đang tải nhạc lên…';
    try {
      const res = await fetch('/api/ink/music', { method: 'POST', credentials: 'same-origin', headers: { 'x-nv': '1', 'content-type': f.type || 'audio/mpeg' }, body: f });
      const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Không tải được nhạc.');
      st.music = j.music; st.mood = 'auto'; musicNote.textContent = '♪ ' + f.name;
    } catch (e) { musicNote.textContent = ''; mood.value = st.mood; fail(e); }
  };
  // video type: hand-drawn (any machine, also this device) or cinematic real footage (render machines only)
  if ((!cfg.cine && ['cine', 'money'].includes(st.format)) || (!cfg.shorts3d && st.format === 'shorts3d')) st.format = 'ink';
  const formatNote = h('small', { class: 'muted' });
  const hint = h('p', { class: 'muted ink-hint' });
  const paintHint = () => { hint.textContent = 'Video 9:16, giọng đọc, nhạc nền và ảnh bìa. ' + etaText(cfg.eta, st.format, st.browser); };
  const whereRow = h('div', { class: 'ink-field' });
  const paintFormat = () => {
    if (st.format === 'shorts3d') { st.series = ''; st.seconds = Math.min(120, st.seconds); }
    lenRow.replaceChildren(h('span', { class: 'ink-label' }, 'Độ dài'), chips(h, LENGTHS.map(([s, l]) => [s, l, s > Math.min(cfg.maxSeconds, st.format === 'shorts3d' ? 120 : 300)]), st.seconds, (v) => { st.seconds = v; keep(); }));
    formatNote.textContent = FORMAT_NOTE[st.format];
    paintHint();
    whereRow.hidden = st.format !== 'ink' || !cfg.browser; if (st.format !== 'ink') st.browser = false;
    moodRow.hidden = !['ink', 'shorts3d'].includes(st.format);
    seriesRow.hidden = st.format === 'shorts3d';
    moneyRow.hidden = st.format !== 'money'; paintAspect();
    reviewText.textContent = st.format === 'money' ? 'Gửi bản đề xuất (sự thật, thông điệp, các cảnh) cho tôi duyệt trước khi dựng' : 'Cho tôi duyệt phân cảnh trước khi dựng';
    // the series has its own voice when it is ready (still changeable below)
    if (st.format === 'money' && cfg.voices.some((v) => v.id === 'vanduy') && !st.voicePicked) { st.voice = 'vanduy'; voice.value = 'vanduy'; }
  };
  // 'Đòn Bẩy Tư Duy': the frame shape and an optional article the story stands on
  const ASPECTS = { ink: [['9:16', 'Dọc 9:16'], ['4:5', '4:5 (Facebook)'], ['1:1', 'Vuông 1:1'], ['16:9', 'Ngang 16:9 (YouTube)']], money: [['9:16', 'Dọc 9:16 (Reels, TikTok)'], ['16:9', 'Ngang 16:9 (YouTube)']] };
  const aspectNote = h('small', { class: 'muted' });
  const aspectRow = h('div', { class: 'ink-field' });
  const paintAspect = () => {
    const list = ASPECTS[st.format]; aspectRow.hidden = !list; if (!list) return;
    if (!list.some(([k]) => k === st.aspect)) st.aspect = '9:16';
    aspectNote.textContent = st.format === 'ink' && st.aspect !== '9:16' ? 'Khung này do máy chủ dựng (dựng trên máy này chỉ có 9:16).' : '';
    aspectRow.replaceChildren(h('span', { class: 'ink-label' }, 'Khung hình'), chips(h, list, st.aspect, (v) => { st.aspect = v; paintAspect(); paintWhere(); keep(); }), aspectNote);
  };
  const moneyRow = h('div', { class: 'ink-field' },
    h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Link bài báo (không bắt buộc)'),
      h('input', { type: 'url', value: st.source, maxlength: 500, placeholder: 'https://… — có thì video lấy số liệu đúng theo bài', oninput: (e) => { st.source = e.target.value.trim(); keep(); } })));
  const reviewText = h('span', {});
  // hear the voice before choosing it (and, below, a sentence with your own names read your way)
  let player = null;
  const play = async (btn, body) => {
    if (player && !player.paused) { player.pause(); btn.textContent = btn.dataset.idle; return; }
    btn.dataset.idle = btn.dataset.idle || btn.textContent; btn.disabled = true; btn.textContent = 'Đang tải…';
    try {
      const res = await fetch('/api/ink/voices/preview', { method: 'POST', credentials: 'same-origin', headers: { 'x-nv': '1', 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Chưa nghe thử được giọng này.');
      player = new Audio(URL.createObjectURL(await res.blob())); player.onended = () => { btn.textContent = btn.dataset.idle; };
      await player.play(); btn.textContent = '■ Dừng';
    } catch (e) { fail(e); btn.textContent = btn.dataset.idle; } finally { btn.disabled = false; }
  };
  const listen = h('button', { type: 'button', class: 'ghost small', title: 'Nghe thử giọng này' }, '▶ Nghe thử');
  listen.onclick = () => (me ? play(listen, { voice: st.voice }) : openLogin('route', { hash: '#/tao' }));
  const voice = h('select', { 'aria-label': 'Giọng đọc', onchange: () => { st.voice = voice.value; st.voicePicked = true; keep(); } }, cfg.voices.map((v) => h('option', { value: v.id, selected: v.id === st.voice }, v.label)));
  const moodRow = h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Nhạc nền'), mood, musicFile, musicNote);
  const paintWhere = () => { if (st.format === 'ink' && st.aspect !== '9:16' && st.browser) { st.browser = false; whereRow.querySelectorAll('.chip').forEach((c, i) => c.classList.toggle('on', i === 0)); whereNote.textContent = WHERE_NOTE.server; } };
  whereRow.append(h('span', { class: 'ink-label' }, 'Nơi dựng video'),
    chips(h, [['server', 'Máy chủ dựng'], ['browser', 'Dựng trên máy này']], st.browser ? 'browser' : 'server', (v) => { st.browser = v === 'browser'; whereNote.textContent = WHERE_NOTE[v]; paintHint(); keep(); }), whereNote);
  // series: videos on one topic; each one invents a new 3D metaphor (never one the series already used)
  const seriesNote = h('small', { class: 'muted' });
  const seriesSel = h('select', { 'aria-label': 'Series' });
  const seriesNew = h('div', { class: 'ink-series-new', hidden: true });
  const sName = h('input', { maxlength: 80, placeholder: 'Tên series, ví dụ: Tiền và thói quen' });
  const sTopic = h('input', { maxlength: 300, placeholder: 'Chủ đề chung, ví dụ: tài chính cá nhân cho người mới đi làm' });
  const sStyle = h('input', { maxlength: 300, placeholder: 'Ghi chú phong cách (không bắt buộc)' });
  let seriesList = [];
  const paintSeries = () => {
    seriesSel.replaceChildren(h('option', { value: '' }, 'Không thuộc series'), ...seriesList.map((x) => h('option', { value: x.id, selected: x.id === st.series }, `${x.name} (${x.videos} video)`)), h('option', { value: '+' }, '+ Tạo series mới…'));
    const cur = seriesList.find((x) => x.id === st.series);
    if (!cur) st.series = '';
    seriesNote.textContent = cur ? `Dựng kiểu Điện ảnh với đạo cụ 3D chuyển động do AI viết riêng; phong cách 3D tối giản, pastel. Mỗi video tự nghĩ ẩn dụ mới, không lặp lại ẩn dụ đã dùng${cur.used.length ? ' (đã dùng: ' + cur.used.slice(-4).map((u) => u.metaphor).join('; ') + ')' : ''}.` : '';
  };
  seriesSel.onchange = () => {
    if (seriesSel.value === '+') { seriesNew.hidden = false; sName.focus(); return; }
    st.series = seriesSel.value; seriesNew.hidden = true; paintSeries(); keep();
  };
  const sSave = h('button', { type: 'button', class: 'btn small' }, 'Tạo series');
  sSave.onclick = () => busy(sSave, 'Đang tạo…', async () => {
    try {
      const { id } = await api('/api/ink/series', { method: 'POST', body: { name: sName.value.trim(), topic: sTopic.value.trim(), style: sStyle.value.trim() } });
      seriesList = (await api('/api/ink/series')).series; st.series = id; seriesNew.hidden = true; sName.value = sTopic.value = sStyle.value = ''; paintSeries(); keep();
    } catch (e) { fail(e); }
  });
  seriesNew.append(sName, sTopic, sStyle, h('div', { class: 'row' }, sSave, h('button', { type: 'button', class: 'ghost small', onclick: () => { seriesNew.hidden = true; paintSeries(); } }, 'Huỷ')));
  if (me && cfg.cine) api('/api/ink/series').then((r) => { seriesList = r.series || []; paintSeries(); }).catch(() => {});
  paintSeries();
  const seriesRow = h('div', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Series'), seriesSel, seriesNew, seriesNote);
  // ---- your dictionary (names read your way) and your brand (colour, logo): saved once, used for every video
  const lexArea = h('textarea', { rows: 4, maxlength: 6000, placeholder: 'Mỗi dòng một từ: chữ viết = cách đọc\nFaciup = phây xi úp\nAI = ây ai\nKOL = cây ô eo' });
  const lexTry = h('input', { maxlength: 300, placeholder: 'Câu để nghe thử, ví dụ: Faciup dùng AI để làm video' });
  const lexPlay = h('button', { type: 'button', class: 'ghost small' }, '▶ Nghe thử câu này');
  const parseLex = () => lexArea.value.split('\n').map((l) => l.split(/\s*[=→:]\s*/)).filter((p) => p.length >= 2 && p[0].trim() && p[1].trim()).map(([w, ...r]) => ({ w: w.trim(), say: r.join(' ').trim() }));
  lexPlay.onclick = () => lexTry.value.trim() ? play(lexPlay, { voice: st.voice, text: lexTry.value.trim(), lexicon: parseLex() }) : toast('Nhập một câu có tên riêng để nghe thử.');
  const color = h('input', { type: 'color', value: '#f7ce3b', 'aria-label': 'Màu thương hiệu' });
  const colorOn = h('input', { type: 'checkbox' });
  const logoImg = h('img', { class: 'ink-logo', alt: 'Logo', hidden: true });
  const logoFile = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
  const logoBtn = h('button', { type: 'button', class: 'ghost small' }, 'Tải logo lên');
  const logoDel = h('button', { type: 'button', class: 'ghost small danger', hidden: true }, 'Bỏ logo');
  const corner = h('select', { 'aria-label': 'Góc đặt logo' }, [['tr', 'Góc trên phải'], ['tl', 'Góc trên trái'], ['br', 'Góc dưới phải'], ['bl', 'Góc dưới trái']].map(([k, l]) => h('option', { value: k }, l)));
  const prefsNote = h('small', { class: 'muted' });
  const savePrefs = h('button', { type: 'button', class: 'btn small' }, 'Lưu từ điển và thương hiệu');
  const showLogo = (url) => { logoImg.hidden = !url; logoDel.hidden = !url; if (url) logoImg.src = url; };
  if (me) api('/api/ink/prefs').then((p) => {
    lexArea.value = (p.lexicon || []).map((x) => `${x.w} = ${x.say}`).join('\n');
    if (p.brand?.color) { color.value = p.brand.color; colorOn.checked = true; }
    if (p.brand?.corner) corner.value = p.brand.corner;
    showLogo(p.logoUrl);
  }).catch(() => {});
  savePrefs.onclick = () => busy(savePrefs, 'Đang lưu…', async () => {
    try { const r = await api('/api/ink/prefs', { method: 'PUT', body: { lexicon: parseLex(), brand: { color: colorOn.checked ? color.value : '', corner: corner.value } } }); prefsNote.textContent = `Đã lưu ${r.lexicon.length} từ. Áp dụng cho các video tạo từ bây giờ (cả qua Zalo).`; } catch (e) { fail(e); }
  });
  logoBtn.onclick = () => logoFile.click();
  logoFile.onchange = () => busy(logoBtn, 'Đang tải…', async () => {
    const f = logoFile.files?.[0]; if (!f) return; if (f.size > 1.5e6) return toast('Logo tối đa 1,5 MB.');
    try { const res = await fetch('/api/ink/prefs/logo', { method: 'POST', credentials: 'same-origin', headers: { 'x-nv': '1', 'content-type': f.type }, body: f }); const r = await res.json(); if (!res.ok) throw new Error(r.error); showLogo(r.logoUrl); } catch (e) { fail(e); }
  });
  logoDel.onclick = () => busy(logoDel, 'Đang bỏ…', async () => { try { await api('/api/ink/prefs/logo', { method: 'DELETE' }); showLogo(''); } catch (e) { fail(e); } });
  const prefsBox = h('div', { class: 'ink-prefs' },
    h('div', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Từ điển phát âm (tên riêng, viết tắt)'), lexArea, h('div', { class: 'ink-voice-row' }, lexTry, lexPlay),
      h('small', { class: 'muted' }, 'Chỉ đổi cách đọc; phụ đề và chữ trên hình vẫn giữ đúng chữ viết.')),
    h('div', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Thương hiệu (video vẽ tay)'),
      h('div', { class: 'ink-voice-row' }, h('label', { class: 'check' }, colorOn, 'Màu nhấn riêng'), color),
      h('div', { class: 'ink-voice-row' }, logoImg, logoBtn, logoDel, logoFile, corner),
      h('small', { class: 'muted' }, 'Màu nhấn thay màu vàng (ô số, chữ đang đọc, thanh tiến trình). Logo nhỏ ở một góc mọi khung hình; PNG nền trong suốt đẹp nhất.')),
    h('div', { class: 'row' }, savePrefs), prefsNote);
  const go = h('button', { type: 'submit', class: 'btn ink-go' }, 'Tạo video');
  // one id per request: pressing twice, or again after a lost answer, never makes (or charges) two videos
  const rid = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).toLowerCase();
  const q = cfg.quota, quota = q && q.limit != null ? h('p', { class: 'muted ink-quota' }, `Hôm nay bạn còn ${Math.max(0, q.limit - q.used)}/${q.limit} lượt dựng. Video dựng lỗi được hoàn lượt tự động.`) : null;
  const form = h('form', { class: 'card ink-form', onsubmit: async (e) => {
    e.preventDefault();
    if (!me) return openLogin('route', { hash: '#/tao' });
    const body = { ...st, [st.mode]: text.value.trim(), rid };
    if (!body[st.mode] && !(st.format === 'money' && st.mode === 'topic' && /^https?:\/\//.test(st.source))) { text.focus(); return toast(st.mode === 'topic' ? 'Hãy nhập chủ đề video.' : 'Hãy dán kịch bản.'); }
    await busy(go, 'Đang gửi…', async () => {
      try { const { id } = await api('/api/ink/jobs', { method: 'POST', body }); sessionStorage.removeItem('ink-draft'); navigate('/ink/' + id); } catch (err) { fail(err); }
    });
  } },
    cfg.cine || cfg.shorts3d ? h('div', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Kiểu video'),
      chips(h, [['ink', 'Vẽ tay'], ...(cfg.shorts3d ? [['shorts3d', 'Shorts 3D']] : []), ...(cfg.cine ? [['cine', 'Điện ảnh (cảnh quay thật)'], ['money', 'Đòn Bẩy Tư Duy']] : [])], st.format, (v) => { st.format = v; paintFormat(); keep(); }), formatNote) : null,
    me && cfg.cine ? seriesRow : null,
    chips(h, [['topic', 'Từ chủ đề'], ['script', 'Từ kịch bản có sẵn']], st.mode, (v) => { st.mode = v; paintText(); keep(); }, 'ink-mode'),
    h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Nội dung'), text),
    lenRow,
    aspectRow,
    moneyRow,
    cfg.browser ? whereRow : null,
    h('div', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Nhịp video'), chips(h, PACES, st.pace, (v) => { st.pace = v; paceNote.textContent = PACE_NOTE[v]; keep(); }), paceNote),
    h('div', { class: 'ink-grid' },
      h('div', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Giọng đọc'), h('div', { class: 'ink-voice-row' }, voice, listen)),
      moodRow),
    h('details', { class: 'ink-more' }, h('summary', {}, 'Tuỳ chọn thêm'),
      h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Người xem là ai'), h('input', { value: st.audience, maxlength: 200, placeholder: 'Ví dụ: người đi làm 22–30 tuổi', oninput: (e) => { st.audience = e.target.value; keep(); } })),
      h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Giọng văn'), h('input', { value: st.tone, maxlength: 120, placeholder: 'Để trống: AI chọn giọng văn hợp chủ đề', oninput: (e) => { st.tone = e.target.value; keep(); } })),
      me ? prefsBox : null,
      h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Ghi chú cho AI'), h('textarea', { rows: 2, maxlength: 600, value: st.notes, placeholder: 'Ý bắt buộc có, điều cần tránh…', oninput: (e) => { st.notes = e.target.value; keep(); } })),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.captions, onchange: (e) => { st.captions = e.target.checked; keep(); } }), 'Phụ đề trên video'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.review, onchange: (e) => { st.review = e.target.checked; keep(); } }), reviewText)),
    go, quota,
    hint);
  paintText(); paintFormat();
  show(h('header', { class: 'pagehead' }, h('div', {}, h('h1', {}, 'Tạo video vẽ tay'), h('p', { class: 'muted' }, 'Từ một ý tưởng tới video hoàn chỉnh: kịch bản, phân cảnh, giọng đọc, nhạc, ảnh bìa.')),
    me ? h('a', { class: 'btn ghost', href: '/video' }, 'Video của tôi') : null), form, footer());
}

export async function showInkList(ctx) {
  const { h, api, show, footer } = ctx;
  let timer = 0, alive = true;
  const box = h('div', { class: 'ink-list' });
  show(h('header', { class: 'pagehead' }, h('div', {}, h('h1', {}, 'Video của tôi'), h('p', { class: 'muted' }, 'Video vẽ tay bạn đã tạo: tiến độ, xem, tải về và dựng lại nhịp khác.')),
    h('a', { class: 'btn', href: '/tao' }, 'Tạo video mới')), box,
    h('p', { class: 'muted' }, h('a', { href: '/video?cu=1' }, 'Xem video tạo bằng bộ máy cũ')), footer());
  const paint = async () => {
    if (!alive || !box.isConnected) return;
    const { jobs } = await api('/api/ink/jobs');
    if (!jobs.length) { box.replaceChildren(h('div', { class: 'card empty' }, h('h2', {}, 'Chưa có video nào'), h('p', { class: 'muted' }, 'Gõ một chủ đề, hệ thống viết kịch bản, vẽ và đọc cho bạn.'), h('a', { class: 'btn', href: '/tao' }, 'Tạo video đầu tiên'))); return; }
    box.replaceChildren(...jobs.map((j) => h('a', { class: 'ink-item card', href: '/ink/' + j.id },
      h('div', { class: 'ink-thumb' }, j.files.includes('thumb.jpg') || j.files.includes('cover.jpg') ? h('img', { src: file(j.id, j.files.includes('thumb.jpg') ? 'thumb.jpg' : 'cover.jpg'), alt: '', loading: 'lazy' }) : h('span', {}, '✎')),
      h('div', { class: 'ink-meta' }, h('strong', {}, j.title), h('span', { class: 'ink-status s-' + j.status }, STATUS[j.status] + (j.status === 'running' ? ` · ${j.progress}%` : '')),
        h('small', { class: 'muted' }, new Date(j.created_at).toLocaleString('vi-VN') + (j.duration ? ` · ${Math.round(j.duration)} giây` : '') + (j.parent ? ' · bản dựng lại' : ''))))));
    if (jobs.some((j) => j.status === 'queued' || j.status === 'running')) timer = setTimeout(() => paint().catch(() => {}), 8000);
  };
  await paint();
  return () => { alive = false; clearTimeout(timer); };
}

export async function showInkWatch(ctx, id) {
  const { h, api, show, toast, fail, navigate, busy, footer } = ctx;
  let timer = 0, alive = true, last = '';
  const root = h('div', { class: 'ink-watch' });
  show(h('header', { class: 'pagehead' }, h('div', {}, h('h1', { id: 'inkTitle' }, 'Video vẽ tay'), h('p', { class: 'muted', id: 'inkSub' }, '')), h('a', { class: 'btn ghost', href: '/video' }, 'Video của tôi')), root, footer());
  const copy = async (t, b) => { try { await navigator.clipboard.writeText(t); b.textContent = 'Đã sao chép'; } catch { toast('Hãy chọn và sao chép thủ công.'); } };

  const paint = async () => {
    if (!alive || !root.isConnected) return;
    const { job: j } = await api('/api/ink/jobs/' + id);
    const sig = JSON.stringify([j.status, j.progress, j.message, j.files]);
    document.getElementById('inkTitle').textContent = j.title;
    document.getElementById('inkSub').textContent = STATUS[j.status] + (j.duration ? ` · ${Math.round(j.duration)} giây` : '') + (j.pace ? ` · nhịp ${(PACES.find(([k]) => k === j.pace) || [, j.pace])[1].toLowerCase()}` : '');
    if (sig !== last) {
      last = sig;
      const parts = [];
      if (j.status === 'queued' || j.status === 'running') {
        const bar = h('div', { class: 'ink-bar' }, h('i', { style: `width:${Math.max(3, j.progress)}%` }));
        parts.push(h('section', { class: 'card ink-progress' }, h('h2', {}, j.status === 'queued' ? 'Đang chờ máy dựng khởi động' : `Đang dựng · ${j.progress}%`), bar,
          h('p', { class: 'muted' }, j.message || 'Đang chờ máy dựng nhận việc.'),
          j.queue ? h('p', { class: 'muted' }, (j.queue.ahead ? `Trước bạn còn ${j.queue.ahead} video đang chờ` : 'Bạn đang đứng đầu hàng chờ') + (j.queue.busy ? `, ${j.queue.busy} video đang được dựng.` : '.')) : null,
          j.eta ? h('p', { class: 'muted' }, j.status === 'running' && j.eta.left ? `Ước tính còn khoảng ${mins(j.eta.left)} (theo các video gần đây).` : `Các video gần đây: chờ khoảng ${mins(j.eta.wait)}, dựng khoảng ${mins(j.eta.run)}.`) : null,
          j.files.includes('cover.jpg') ? h('img', { class: 'ink-cover-small', src: file(j.id, 'cover.jpg') + '?v=' + j.progress, alt: 'Ảnh bìa' }) : null,
          serverNotice(h)));
      }
      if (j.status === 'review') {
        const { storyboard: sb } = await api(`/api/ink/jobs/${id}/storyboard`);
        const goBtn = h('button', { type: 'button', class: 'btn' }, 'Dựng video');
        goBtn.onclick = () => busy(goBtn, 'Đang gửi…', async () => { try { await api(`/api/ink/jobs/${id}/approve`, { method: 'POST' }); last = ''; paint(); } catch (e) { fail(e); } });
        parts.push(h('section', { class: 'card' }, h('h2', {}, sb?.proposal ? 'Bản đề xuất đã sẵn sàng' : 'Phân cảnh đã sẵn sàng'), h('p', { class: 'muted' }, sb?.proposal ? 'Đọc sự thật, thông điệp và các cảnh. Đồng ý thì bấm Dựng video.' : 'Xem ảnh bìa, từng cảnh và lời đọc. Đồng ý thì bấm Dựng video.'),
          proposalView(h, sb?.proposal),
          h('img', { class: 'ink-overview', src: file(id, 'overview.png'), alt: 'Bảng phân cảnh' }),
          scriptTable(h, sb) || h('ol', { class: 'ink-lines' }, (sb?.scenes || []).map((s) => h('li', {}, s.say))), h('div', { class: 'row' }, goBtn)));
        if (sb?.facts !== undefined) parts.push(factsCard(h, sb.facts, true));
        if (j.format === 'ink' || !j.format) { const ed = await sceneEditor(ctx, j, () => { last = ''; paint(); }).catch(() => null); if (ed) parts.push(ed); }
      }
      if (j.status === 'browser') parts.push(await browserPanel(ctx, j, () => { last = ''; paint(); }));
      if (j.status === 'failed') {
        const retry = h('button', { type: 'button', class: 'btn' }, 'Thử lại');
        retry.onclick = () => busy(retry, 'Đang gửi…', async () => { try { await api(`/api/ink/jobs/${id}/retry`, { method: 'POST' }); last = ''; paint(); } catch (e) { fail(e); } });
        parts.push(h('section', { class: 'card' }, h('h2', {}, 'Video chưa dựng được'), h('p', { class: 'error' }, j.error || 'Lỗi không rõ.'),
          j.charge === 'refunded' ? h('p', { class: 'muted' }, 'Lượt dựng của video này đã được hoàn. Bấm Thử lại sẽ dùng một lượt mới.') : null, h('div', { class: 'row' }, retry)));
      }
      if (j.status === 'done') {
        const sbDone = (await api(`/api/ink/jobs/${id}/storyboard`).catch(() => ({}))).storyboard || null, facts = sbDone ? sbDone.facts : undefined;
        const editor = j.format === 'ink' || !j.format ? await sceneEditor(ctx, j, () => {}).catch(() => null) : null;
        // what comes with a 'Đòn Bẩy Tư Duy' video: script, subtitles, the comment question, and re-timing to your own voice
        const voiceIn = h('input', { type: 'file', accept: 'audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/ogg', hidden: true });
        const voiceBtn = h('button', { type: 'button', class: 'btn ghost' }, 'Gửi giọng đọc của tôi');
        voiceBtn.onclick = () => voiceIn.click();
        voiceIn.onchange = () => busy(voiceBtn, 'Đang tải giọng lên…', async () => {
          const f = voiceIn.files?.[0]; if (!f) return;
          if (f.size > 30e6) return toast('Tệp giọng tối đa 30 MB.');
          try {
            const res = await fetch(`/api/ink/jobs/${id}/myvoice`, { method: 'POST', credentials: 'same-origin', headers: { 'x-nv': '1', 'content-type': f.type || 'audio/mpeg' }, body: f });
            const r = await res.json(); if (!res.ok) throw new Error(r.error || 'Không gửi được giọng đọc.'); navigate('/ink/' + r.id);
          } catch (e) { fail(e); }
        });
        const kit = j.files.includes('script.txt') ? h('section', { class: 'card' }, h('h2', {}, 'Đăng tải và thu giọng'),
          sbDone?.question ? h('p', {}, h('b', {}, 'Câu hỏi bình luận: '), sbDone.question) : null,
          h('div', { class: 'row' },
            h('a', { class: 'btn ghost', href: file(id, 'script.txt') + '?download=1', download: '' }, 'Kịch bản thoại (.txt)'),
            j.files.includes('subs.ass') ? h('a', { class: 'btn ghost', href: file(id, 'subs.ass') + '?download=1', download: '' }, 'Phụ đề karaoke (.ass)') : null),
          h('p', { class: 'muted' }, 'Tự thu giọng theo kịch bản rồi gửi lên: phụ đề, chuyển cảnh và chữ nhấn được căn lại theo giọng của bạn.'), h('div', { class: 'row' }, voiceBtn, voiceIn)) : null;
        const player = h('video', { class: 'ink-player', src: file(id, 'video.mp4'), controls: true, playsinline: true, preload: 'metadata', poster: j.files.includes('cover.jpg') ? file(id, 'cover.jpg') : null });
        const cap = [j.caption, (j.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
        const capBtn = h('button', { type: 'button', class: 'ghost small' }, 'Sao chép');
        capBtn.onclick = () => copy(cap, capBtn);
        let pace = j.pace === 'fast' ? 'faster' : 'fast';
        const again = h('button', { type: 'button', class: 'btn' }, 'Dựng lại với nhịp này');
        again.onclick = () => busy(again, 'Đang gửi…', async () => { try { const r = await api(`/api/ink/jobs/${id}/repace`, { method: 'POST', body: { pace } }); navigate('/ink/' + r.id); } catch (e) { fail(e); } });
        parts.push(h('div', { class: 'ink-done' },
          h('div', { class: 'ink-stage' }, player),
          h('div', { class: 'ink-side' },
            h('section', { class: 'card' }, h('h2', {}, 'Tải về'), h('div', { class: 'row' },
              h('a', { class: 'btn', href: file(id, 'video.mp4') + '?download=1', download: '' }, 'Tải video MP4'),
              j.files.includes('cover.jpg') ? h('a', { class: 'btn ghost', href: file(id, 'cover.jpg') + '?download=1', download: '' }, 'Tải ảnh bìa') : null,
              j.files.includes('captions.srt') ? h('a', { class: 'btn ghost', href: file(id, 'captions.srt') + '?download=1', download: '' }, 'Tải phụ đề SRT') : null)),
            cap ? h('section', { class: 'card' }, h('div', { class: 'section-title' }, h('h2', {}, 'Mô tả đăng kèm'), capBtn), h('p', { class: 'ink-caption' }, cap)) : null,
            h('section', { class: 'card' }, h('h2', {}, 'Nhịp chưa vừa ý?'), h('p', { class: 'muted' }, 'Giữ nguyên kịch bản, phân cảnh và ảnh bìa; chỉ đọc lại và vẽ lại theo nhịp mới. Không gọi AI lại.'),
              chips(h, PACES.map(([k, l]) => [k, l, k === j.pace]), pace, (v) => { pace = v; }), h('div', { class: 'row' }, again)),
            facts !== undefined ? factsCard(h, facts, false) : null,
            editor,
            kit,
            j.series ? scriptTable(h, sbDone) : null,
            j.files.includes('overview.png') ? h('details', { class: 'card' }, h('summary', {}, 'Xem bảng phân cảnh'), h('img', { class: 'ink-overview', src: file(id, 'overview.png'), alt: 'Bảng phân cảnh', loading: 'lazy' })) : null)));
      }
      const del = h('button', { type: 'button', class: 'ghost small danger' }, 'Xoá video');
      del.onclick = async () => { if (!confirm('Xoá video này? Không khôi phục được.')) return; try { await api('/api/ink/jobs/' + id, { method: 'DELETE' }); navigate('/video'); } catch (e) { fail(e); } };
      if (j.status !== 'running') parts.push(h('div', { class: 'row ink-foot' }, del));
      root.replaceChildren(...parts);
    } else if (j.status === 'running') {
      const bar = root.querySelector('.ink-bar i'); if (bar) bar.style.width = Math.max(3, j.progress) + '%';
    }
    if (['queued', 'running'].includes(j.status)) timer = setTimeout(() => paint().catch(() => { timer = setTimeout(paint, 10000); }), 5000);
  };
  await paint();
  return () => { alive = false; clearTimeout(timer); };
}

/** status 'browser': the drawing plan is ready; this device draws the frames and uploads the MP4 */
async function browserPanel(ctx, j, refresh) {
  const { h, api, fail, busy } = ctx;
  const mod = await import('/ink-render.js?v=3'), local = !j.files.includes('draw.json'); // no machine made the drawing plan: this device does everything
  const lm = local ? await import('/ink-local.js?v=2') : null;
  let sup = await mod.browserSupport(); if (lm) sup = await lm.localSupport(sup);
  const bar = h('div', { class: 'ink-bar' }, h('i', { style: 'width:0%' })), note = h('p', { class: j.error ? 'error' : 'muted' }, j.error ? 'Lần trước bị dừng. ' + j.error : sup.ok ? `Máy này sẽ dựng ở ${sup.width}×${sup.height}.` : sup.why);
  const done = sup.ok ? await mod.savedScenes(j.id, sup.width) : 0;
  const go = h('button', { type: 'button', class: 'btn', disabled: !sup.ok }, done ? `Dựng tiếp (đã xong ${done} cảnh)` : 'Bắt đầu dựng trên máy này');
  const other = h('button', { type: 'button', class: 'ghost' }, 'Để máy chủ dựng giúp');
  other.onclick = () => busy(other, 'Đang chuyển…', async () => { try { await api(`/api/ink/jobs/${j.id}/handoff`, { method: 'POST' }); refresh(); } catch (e) { fail(e); } });
  let running = false, sent = 0, t0 = 0, said = 0, step = '', stalled = false, tick = 0;
  const clock = () => { const s = Math.round((Date.now() - t0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const show = () => { note.textContent = `${step} · đã chạy ${clock()}`; if (Date.now() - said > 300_000) stalled = true; };
  const setBar = (p, m) => {
    said = Date.now();
    if (p == null) { if (m) { step = m; show(); } return; } // a message from the engine (AI steps)
    bar.firstChild.style.width = Math.round(p * 100) + '%'; step = `${m} · ${Math.round(p * 100)}%`; show();
    document.title = `(${Math.round(p * 100)}%) Đang dựng video`;
    if (Date.now() - sent > 8000) { sent = Date.now(); api(`/api/ink/jobs/${j.id}/browser/progress`, { method: 'POST', body: { progress: 60 + p * 38, message: 'Đang dựng trên máy người dùng: ' + m } }).catch(() => {}); }
  };
  const leave = (e) => { if (running) { e.preventDefault(); e.returnValue = ''; } };
  const title0 = document.title, toldDone = (ok, text) => {   // made on this device: the page itself tells (no server message)
    document.title = title0;
    if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') try { new Notification(ok ? 'Video đã dựng xong trên máy của bạn' : 'Dựng trên máy bị dừng', { body: text, icon: '/icons/icon-192.png' }); } catch { /* no notification */ }
  };
  go.onclick = async () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    running = true; go.disabled = true; other.disabled = true; addEventListener('beforeunload', leave);
    t0 = said = Date.now(); stalled = false; step = 'Đang bắt đầu'; tick = setInterval(show, 1000);
    const isCancelled = () => { if (stalled) throw new Error('Không có tiến triển quá 5 phút (bị treo). Bấm Dựng tiếp để làm lại từ bước đang dở.'); return !bar.isConnected; };
    try {
      const r = lm ? await lm.makeLocally({ job: j.id, sup, onProgress: setBar, isCancelled })
        : await mod.renderInBrowser({ job: j.id, sup, onProgress: setBar, isCancelled });
      note.textContent = 'Đang tải video lên…';
      await new Promise((ok, no) => {
        const x = new XMLHttpRequest(); x.open('PUT', `/api/ink/jobs/${j.id}/browser/video`); x.setRequestHeader('x-nv', '1'); x.setRequestHeader('content-type', 'video/mp4');
        x.upload.onprogress = (e) => { if (e.lengthComputable) { bar.firstChild.style.width = Math.round(100 * e.loaded / e.total) + '%'; note.textContent = `Đang tải video lên · ${Math.round(100 * e.loaded / e.total)}%`; } };
        x.onload = () => (x.status < 300 ? ok() : no(new Error(JSON.parse(x.responseText || '{}').error || 'Tải video lên lỗi ' + x.status))); x.onerror = () => no(new Error('Mất kết nối khi tải video lên. Bấm lại để thử tiếp (phần đã vẽ được giữ).'));
        x.send(r.mp4);
      });
      await api(`/api/ink/jobs/${j.id}/browser/done`, { method: 'POST', body: { seconds: r.seconds, device: navigator.userAgent.slice(0, 80) } });
      await r.clear(); running = false; toldDone(true, `"${j.title}" đã xong. Mở trang để xem và tải về.`); refresh();
    } catch (e) {
      running = false; go.disabled = false; other.disabled = false; go.textContent = 'Dựng tiếp'; fail(e); toldDone(false, e.message);
      clearInterval(tick); note.textContent = `Đã dừng ở bước "${step}" sau ${clock()}: ${e.message} Phần đã xong được giữ trên máy này.`;
      api(`/api/ink/jobs/${j.id}/browser/error`, { method: 'POST', body: { step, error: e.message } }).catch(() => {}); // so the admin sees it too
    } finally { clearInterval(tick); removeEventListener('beforeunload', leave); }
  };
  return h('section', { class: 'card ink-progress' }, h('h2', {}, 'Sẵn sàng dựng trên máy của bạn'),
    h('p', {}, local ? 'Toàn bộ video được làm trên máy bạn: AI viết kịch bản, đọc giọng, vẽ từng khung hình rồi xuất MP4, không cần máy chủ dựng. Giữ trang này mở; màn hình được giữ sáng. Nếu bị gián đoạn, mở lại trang và bấm Dựng tiếp: các bước đã xong không phải làm lại.'
      : 'Kịch bản, giọng đọc và bản vẽ đã xong. Máy bạn sẽ vẽ từng khung hình rồi xuất MP4. Giữ trang này mở; màn hình được giữ sáng trong lúc dựng. Nếu bị gián đoạn, mở lại trang và bấm Dựng tiếp: các cảnh đã xong không phải vẽ lại.'),
    j.files.includes('overview.png') ? h('details', {}, h('summary', {}, 'Xem bảng phân cảnh'), h('img', { class: 'ink-overview', src: `/api/ink/jobs/${j.id}/file/overview.png`, alt: 'Bảng phân cảnh', loading: 'lazy' })) : null,
    bar, note, h('div', { class: 'row' }, go, other));
}
