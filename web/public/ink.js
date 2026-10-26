// Ink Studio pages: create a hand-drawn video, my videos, one video (progress, storyboard review, player, re-pace).
const PACES = [['slow', 'Chậm'], ['normal', 'Vừa'], ['fast', 'Nhanh'], ['faster', 'Rất nhanh']];
const PACE_NOTE = { slow: 'Đọc thong thả, vẽ chậm rãi', normal: 'Nhịp video ngắn tiêu chuẩn', fast: 'Dồn dập, đổi cảnh nhanh', faster: 'Rất dồn dập, hợp video dưới 1 phút' };
const MOODS = [['auto', 'Tự chọn theo nội dung'], ['motivating', 'Truyền động lực'], ['calm', 'Nhẹ nhàng'], ['upbeat', 'Sôi động'], ['emotional', 'Cảm xúc'], ['none', 'Không nhạc'], ['mine', 'Nhạc của tôi…']];
const WHERE_NOTE = { server: 'Bạn có thể rời trang, video tự dựng xong và báo cho bạn.', browser: 'Làm toàn bộ trên máy tính/điện thoại của bạn, không cần máy chủ dựng. Cần mở trang trong lúc dựng (khoảng 2–5 phút cho video 1 phút).' };
const FORMAT_NOTE = { ink: 'Bàn tay vẽ từng cảnh trên nền giấy, như video whiteboard.', cine: 'Cảnh quay và ảnh thật lấp kín khung, máy quay chuyển động, chữ và số liệu hiện trong không gian, phụ đề kiểu CapCut. Dựng trên máy chủ, khoảng 10–25 phút.',
  money: 'Series Đòn Bẩy Tư Duy: gõ một băn khoăn về tiền bạc, công việc hay thói quen (ví dụ: vì sao lương tăng mà vẫn hết tiền?). AI tìm nghiên cứu thật trên web, đặt tên khái niệm, kể bằng giọng tiểu luận trên cảnh quay thật và đồ hoạ 3D, phụ đề nét mảnh. Khoảng 2 phút, dựng trên máy chủ.' };
const LENGTHS =[[30, '30 giây'], [60, '1 phút'], [90, '1,5 phút'], [120, '2 phút'], [180, '3 phút'], [300, '5 phút']];
const STATUS = { queued: 'Đang chờ máy dựng', running: 'Đang dựng', review: 'Chờ bạn duyệt phân cảnh', browser: 'Sẵn sàng dựng trên máy của bạn', done: 'Đã xong', failed: 'Chưa dựng được' };
const DEFAULTS = { voices: [{ id: 'hoaimy', label: 'Hoài My (nữ)' }, { id: 'namminh', label: 'Nam Minh (nam)' }], defaults: { pace: 'normal', seconds: 60, mood: 'auto', captions: true, review: false, voice: 'hoaimy' }, maxSeconds: 300 };
// the script table of a series video: [Scene X – time] [Voiceover] [Visual Prompt]
function scriptTable(h, sb) {
  if (!Array.isArray(sb?.table) || !sb.table.length) return null;
  return h('details', { class: 'card ink-table' }, h('summary', {}, 'Bảng kịch bản' + (sb.metaphor ? ` · ẩn dụ: ${sb.metaphor}` : '')),
    h('div', { class: 'ink-table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Cảnh'), h('th', {}, 'Lời đọc'), h('th', {}, 'Visual prompt'))),
      h('tbody', {}, sb.table.map((r) => h('tr', {}, h('td', {}, `Cảnh ${r.scene}`, h('small', {}, r.time)), h('td', {}, r.voiceover), h('td', { lang: 'en' }, r.visual)))))));
}
const file = (id, name) => `/api/ink/jobs/${id}/${'file/' + name}`;

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
  const st = { format: 'ink', mode: 'topic', topic: '', script: '', seconds: Math.min(d.seconds, cfg.maxSeconds), pace: d.pace, voice: d.voice, mood: d.mood, music: '', captions: d.captions, review: d.review, audience: '', tone: '', notes: '', browser: false, series: '' };
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
  if (!cfg.cine) st.format = 'ink';
  const formatNote = h('small', { class: 'muted' });
  const whereRow = h('div', { class: 'ink-field' });
  const paintFormat = () => {
    formatNote.textContent = FORMAT_NOTE[st.format];
    whereRow.hidden = st.format !== 'ink' || !cfg.browser; if (st.format !== 'ink') st.browser = false;
    moodRow.hidden = st.format !== 'ink';
    // the series has its own voice when it is ready (still changeable below)
    if (st.format === 'money' && cfg.voices.some((v) => v.id === 'vanduy') && !st.voicePicked) { st.voice = 'vanduy'; voice.value = 'vanduy'; }
  };
  const voice = h('select', { 'aria-label': 'Giọng đọc', onchange: () => { st.voice = voice.value; st.voicePicked = true; keep(); } }, cfg.voices.map((v) => h('option', { value: v.id, selected: v.id === st.voice }, v.label)));
  const moodRow = h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Nhạc nền'), mood, musicFile, musicNote);
  whereRow.append(h('span', { class: 'ink-label' }, 'Nơi dựng video'),
    chips(h, [['server', 'Máy chủ dựng'], ['browser', 'Dựng trên máy này']], st.browser ? 'browser' : 'server', (v) => { st.browser = v === 'browser'; whereNote.textContent = WHERE_NOTE[v]; keep(); }), whereNote);
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
  const go = h('button', { type: 'submit', class: 'btn ink-go' }, 'Tạo video');
  const form = h('form', { class: 'card ink-form', onsubmit: async (e) => {
    e.preventDefault();
    if (!me) return openLogin('route', { hash: '#/tao' });
    const body = { ...st, [st.mode]: text.value.trim() };
    if (!body[st.mode]) { text.focus(); return toast(st.mode === 'topic' ? 'Hãy nhập chủ đề video.' : 'Hãy dán kịch bản.'); }
    await busy(go, 'Đang gửi…', async () => {
      try { const { id } = await api('/api/ink/jobs', { method: 'POST', body }); sessionStorage.removeItem('ink-draft'); navigate('/ink/' + id); } catch (err) { fail(err); }
    });
  } },
    cfg.cine ? h('div', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Kiểu video'),
      chips(h, [['ink', 'Vẽ tay'], ['cine', 'Điện ảnh (cảnh quay thật)'], ['money', 'Đòn Bẩy Tư Duy']], st.format, (v) => { st.format = v; paintFormat(); keep(); }), formatNote) : null,
    me && cfg.cine ? seriesRow : null,
    chips(h, [['topic', 'Từ chủ đề'], ['script', 'Từ kịch bản có sẵn']], st.mode, (v) => { st.mode = v; paintText(); keep(); }, 'ink-mode'),
    h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Nội dung'), text),
    lenRow,
    cfg.browser ? whereRow : null,
    h('div', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Nhịp video'), chips(h, PACES, st.pace, (v) => { st.pace = v; paceNote.textContent = PACE_NOTE[v]; keep(); }), paceNote),
    h('div', { class: 'ink-grid' },
      h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Giọng đọc'), voice),
      moodRow),
    h('details', { class: 'ink-more' }, h('summary', {}, 'Tuỳ chọn thêm'),
      h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Người xem là ai'), h('input', { value: st.audience, maxlength: 200, placeholder: 'Ví dụ: người đi làm 22–30 tuổi', oninput: (e) => { st.audience = e.target.value; keep(); } })),
      h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Giọng văn'), h('input', { value: st.tone, maxlength: 120, placeholder: 'Để trống: AI chọn giọng văn hợp chủ đề', oninput: (e) => { st.tone = e.target.value; keep(); } })),
      h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Ghi chú cho AI'), h('textarea', { rows: 2, maxlength: 600, value: st.notes, placeholder: 'Ý bắt buộc có, điều cần tránh…', oninput: (e) => { st.notes = e.target.value; keep(); } })),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.captions, onchange: (e) => { st.captions = e.target.checked; keep(); } }), 'Phụ đề trên video'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.review, onchange: (e) => { st.review = e.target.checked; keep(); } }), 'Cho tôi duyệt phân cảnh trước khi dựng')),
    go,
    h('p', { class: 'muted ink-hint' }, 'Video 9:16 vẽ tay, giọng đọc, nhạc nền và ảnh bìa. Thường xong sau 4–6 phút; bạn có thể rời trang, video vẫn được dựng.'));
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
          h('p', { class: 'muted' }, j.message || 'Máy dựng thường khởi động trong khoảng 1 phút.'),
          j.files.includes('cover.jpg') ? h('img', { class: 'ink-cover-small', src: file(j.id, 'cover.jpg') + '?v=' + j.progress, alt: 'Ảnh bìa' }) : null,
          h('p', { class: 'muted' }, 'Bạn có thể rời trang; video vẫn tiếp tục được dựng.')));
      }
      if (j.status === 'review') {
        const { storyboard: sb } = await api(`/api/ink/jobs/${id}/storyboard`);
        const goBtn = h('button', { type: 'button', class: 'btn' }, 'Dựng video');
        goBtn.onclick = () => busy(goBtn, 'Đang gửi…', async () => { try { await api(`/api/ink/jobs/${id}/approve`, { method: 'POST' }); last = ''; paint(); } catch (e) { fail(e); } });
        parts.push(h('section', { class: 'card' }, h('h2', {}, 'Phân cảnh đã sẵn sàng'), h('p', { class: 'muted' }, 'Xem ảnh bìa, từng cảnh và lời đọc. Đồng ý thì bấm Dựng video.'),
          h('img', { class: 'ink-overview', src: file(id, 'overview.png'), alt: 'Bảng phân cảnh' }),
          scriptTable(h, sb) || h('ol', { class: 'ink-lines' }, (sb?.scenes || []).map((s) => h('li', {}, s.say))), h('div', { class: 'row' }, goBtn)));
      }
      if (j.status === 'browser') parts.push(await browserPanel(ctx, j, () => { last = ''; paint(); }));
      if (j.status === 'failed') {
        const retry = h('button', { type: 'button', class: 'btn' }, 'Thử lại');
        retry.onclick = () => busy(retry, 'Đang gửi…', async () => { try { await api(`/api/ink/jobs/${id}/retry`, { method: 'POST' }); last = ''; paint(); } catch (e) { fail(e); } });
        parts.push(h('section', { class: 'card' }, h('h2', {}, 'Video chưa dựng được'), h('p', { class: 'error' }, j.error || 'Lỗi không rõ.'), h('div', { class: 'row' }, retry)));
      }
      if (j.status === 'done') {
        const sbDone = j.series ? (await api(`/api/ink/jobs/${id}/storyboard`).catch(() => ({}))).storyboard : null;
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
              j.files.includes('cover.jpg') ? h('a', { class: 'btn ghost', href: file(id, 'cover.jpg') + '?download=1', download: '' }, 'Tải ảnh bìa') : null)),
            cap ? h('section', { class: 'card' }, h('div', { class: 'section-title' }, h('h2', {}, 'Mô tả đăng kèm'), capBtn), h('p', { class: 'ink-caption' }, cap)) : null,
            h('section', { class: 'card' }, h('h2', {}, 'Nhịp chưa vừa ý?'), h('p', { class: 'muted' }, 'Giữ nguyên kịch bản, phân cảnh và ảnh bìa; chỉ đọc lại và vẽ lại theo nhịp mới. Không gọi AI lại.'),
              chips(h, PACES.map(([k, l]) => [k, l, k === j.pace]), pace, (v) => { pace = v; }), h('div', { class: 'row' }, again)),
            scriptTable(h, sbDone),
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
  const mod = await import('/ink-render.js?v=2'), local = !j.files.includes('draw.json'); // no machine made the drawing plan: this device does everything
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
    if (Date.now() - sent > 8000) { sent = Date.now(); api(`/api/ink/jobs/${j.id}/browser/progress`, { method: 'POST', body: { progress: 60 + p * 38, message: 'Đang dựng trên máy người dùng: ' + m } }).catch(() => {}); }
  };
  const leave = (e) => { if (running) { e.preventDefault(); e.returnValue = ''; } };
  go.onclick = async () => {
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
      await r.clear(); running = false; refresh();
    } catch (e) {
      running = false; go.disabled = false; other.disabled = false; go.textContent = 'Dựng tiếp'; fail(e);
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
