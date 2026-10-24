// Ink Studio pages: create a hand-drawn video, my videos, one video (progress, storyboard review, player, re-pace).
const PACES = [['slow', 'Chậm'], ['normal', 'Vừa'], ['fast', 'Nhanh'], ['faster', 'Rất nhanh']];
const PACE_NOTE = { slow: 'Đọc thong thả, vẽ chậm rãi', normal: 'Nhịp video ngắn tiêu chuẩn', fast: 'Dồn dập, đổi cảnh nhanh', faster: 'Rất dồn dập, hợp video dưới 1 phút' };
const MOODS = [['auto', 'Tự chọn theo nội dung'], ['motivating', 'Truyền động lực'], ['calm', 'Nhẹ nhàng'], ['upbeat', 'Sôi động'], ['emotional', 'Cảm xúc'], ['none', 'Không nhạc'], ['mine', 'Nhạc của tôi…']];
const LENGTHS = [[30, '30 giây'], [60, '1 phút'], [90, '1,5 phút'], [120, '2 phút'], [180, '3 phút'], [300, '5 phút']];
const STATUS = { queued: 'Đang chờ máy dựng', running: 'Đang dựng', review: 'Chờ bạn duyệt phân cảnh', done: 'Đã xong', failed: 'Chưa dựng được' };
const DEFAULTS = { voices: [{ id: 'hoaimy', label: 'Hoài My (nữ)' }, { id: 'namminh', label: 'Nam Minh (nam)' }], defaults: { pace: 'normal', seconds: 60, mood: 'auto', captions: true, review: false, voice: 'hoaimy' }, maxSeconds: 300 };
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
  const st = { mode: 'topic', topic: '', script: '', seconds: Math.min(d.seconds, cfg.maxSeconds), pace: d.pace, voice: d.voice, mood: d.mood, music: '', captions: d.captions, review: d.review, audience: '', tone: '', notes: '' };
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
  const voice = h('select', { 'aria-label': 'Giọng đọc', onchange: () => { st.voice = voice.value; keep(); } }, cfg.voices.map((v) => h('option', { value: v.id, selected: v.id === st.voice }, v.label)));
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
    chips(h, [['topic', 'Từ chủ đề'], ['script', 'Từ kịch bản có sẵn']], st.mode, (v) => { st.mode = v; paintText(); keep(); }, 'ink-mode'),
    h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Nội dung'), text),
    lenRow,
    h('div', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Nhịp video'), chips(h, PACES, st.pace, (v) => { st.pace = v; paceNote.textContent = PACE_NOTE[v]; keep(); }), paceNote),
    h('div', { class: 'ink-grid' },
      h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Giọng đọc'), voice),
      h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Nhạc nền'), mood, musicFile, musicNote)),
    h('details', { class: 'ink-more' }, h('summary', {}, 'Tuỳ chọn thêm'),
      h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Người xem là ai'), h('input', { value: st.audience, maxlength: 200, placeholder: 'Ví dụ: người đi làm 22–30 tuổi', oninput: (e) => { st.audience = e.target.value; keep(); } })),
      h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Giọng văn'), h('input', { value: st.tone, maxlength: 120, placeholder: 'Để trống: AI chọn giọng văn hợp chủ đề', oninput: (e) => { st.tone = e.target.value; keep(); } })),
      h('label', { class: 'ink-field' }, h('span', { class: 'ink-label' }, 'Ghi chú cho AI'), h('textarea', { rows: 2, maxlength: 600, value: st.notes, placeholder: 'Ý bắt buộc có, điều cần tránh…', oninput: (e) => { st.notes = e.target.value; keep(); } })),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.captions, onchange: (e) => { st.captions = e.target.checked; keep(); } }), 'Phụ đề trên video'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.review, onchange: (e) => { st.review = e.target.checked; keep(); } }), 'Cho tôi duyệt phân cảnh trước khi dựng')),
    go,
    h('p', { class: 'muted ink-hint' }, 'Video 9:16 vẽ tay, giọng đọc, nhạc nền và ảnh bìa. Thường xong sau 4–6 phút; bạn có thể rời trang, video vẫn được dựng.'));
  paintText();
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
          h('ol', { class: 'ink-lines' }, (sb?.scenes || []).map((s) => h('li', {}, s.say))), h('div', { class: 'row' }, goBtn)));
      }
      if (j.status === 'failed') {
        const retry = h('button', { type: 'button', class: 'btn' }, 'Thử lại');
        retry.onclick = () => busy(retry, 'Đang gửi…', async () => { try { await api(`/api/ink/jobs/${id}/retry`, { method: 'POST' }); last = ''; paint(); } catch (e) { fail(e); } });
        parts.push(h('section', { class: 'card' }, h('h2', {}, 'Video chưa dựng được'), h('p', { class: 'error' }, j.error || 'Lỗi không rõ.'), h('div', { class: 'row' }, retry)));
      }
      if (j.status === 'done') {
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
