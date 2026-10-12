// Nét Vẽ Studio — browser app. All user text is inserted with textContent, never as HTML.
'use strict';

const VOICES = [
  ['vi_female_thuytrang_mb', 'Thùy Trang · nữ Bắc · nói chuyện'], ['vi_male_minhtriet_mb', 'Minh Triết · nam Bắc · sách nói'],
  ['vi_male_leduc_mb', 'Lê Đức · nam Bắc · kể chuyện'], ['vi_female_kimphuong_mb', 'Kim Phượng · nữ Bắc · kể chuyện'],
  ['vi_male_lehoang_mb', 'Lê Hoàng · nam Bắc · mạch lạc'], ['vi_male_vanduy_mb', 'Văn Duy · nam Bắc · bình luận'],
  ['vi_female_thuylinh_mb', 'Thùy Linh · nữ Bắc · podcast'], ['vi_female_hoaian_mb', 'Hoài An · nữ Bắc · đọc tin'],
  ['vi_male_minhkhang_mb', 'Minh Khang · nam Bắc · mạng xã hội'], ['vi_female_khanhlinh_mb', 'Khánh Linh · nữ Bắc · review'],
  ['vi_female_thuytien_mn', 'Thùy Tiên · nữ Nam · trò chuyện'], ['vi_female_hongngan_mn', 'Hồng Ngân · nữ Nam · nhẹ nhàng'],
  ['vi_male_tridung_mn', 'Trí Dũng · nam Nam · sách nói'], ['vi_male_thanhtrung_mn', 'Thành Trung · nam Nam · podcast'],
  ['vi_male_tuankiet_mn', 'Tuấn Kiệt · nam Nam · tin tức'], ['vi_male_vanduc_mn', 'Văn Đức · nam Nam · tự sự'],
];
const STYLE_KEYS = ['whiteboard', 'chalkboard', 'oly', 'kraft', 'pencil', 'blueprint', 'ricepaper', 'notebook'];
const view = document.getElementById('view');
let me = null;

// ---------- helpers
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'style') el.style.cssText = v; // CSSOM: allowed by the CSP, unlike style attributes
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
function options(list, selected) {
  return list.map(([v, label]) => h('option', { value: v, selected: v === selected }, label));
}
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET', credentials: 'same-origin',
    headers: { 'x-nv': '1', ...(opts.body ? { 'content-type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Lỗi ${res.status}`); e.status = res.status; throw e; }
  return data;
}
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}
function debounce(fn, ms) {
  let t = null;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, ms); };
  d.flush = () => { if (t !== null) { clearTimeout(t); t = null; return fn(); } };
  return d;
}
const imageUrl = (ref) => (ref?.startsWith('r2:') ? '/api/assets/' + ref.slice(3) : '');
// an empty page stands in for a picture that has not been drawn yet
const BLANK = '/blank.svg';
const fmtDate = (ms) => new Date(ms).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
const JOB_TEXT = { queued: 'Đang chờ', running: 'Đang dựng', done: 'Xong', failed: 'Lỗi' };

// ---------- boot & routing
async function boot() {
  document.getElementById('logout').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    location.hash = '#/'; location.reload();
  });
  try { me = await api('/api/me'); } catch (e) { if (e.status === 401) return showLogin(); return fatal(e); }
  document.getElementById('who').hidden = false;
  document.getElementById('whoEmail').textContent = me.user.email;
  window.addEventListener('hashchange', route);
  route();
}
function route() {
  stopPreview();
  const m = location.hash.match(/^#\/p\/([a-f0-9]{24})$/);
  (m ? showEditor(m[1]) : showHome()).catch(fatal);
}
function fatal(e) { view.replaceChildren(h('div', { class: 'card' }, h('p', { class: 'error' }, e.message || String(e)), h('a', { href: '#/' }, 'Về trang chủ'))); }

// ---------- login
async function showLogin() {
  const cfg = await api('/api/auth/config');
  const box = h('div', { class: 'card login' },
    h('h1', {}, 'Video bàn tay vẽ, từ một câu chủ đề'),
    h('p', { class: 'muted' }, 'AI viết kịch bản, bạn chỉnh từng câu, xem trước bàn tay vẽ ngay trên trang, rồi nhận video MP4 có giọng đọc và phụ đề.'));
  if (cfg.clientId) {
    const slot = h('div', { class: 'gbtn' });
    box.append(slot);
    const s = h('script', { src: 'https://accounts.google.com/gsi/client', async: true });
    s.onload = () => {
      google.accounts.id.initialize({
        client_id: cfg.clientId, nonce: cfg.nonce, ux_mode: 'popup',
        callback: async (r) => {
          try { await api('/api/auth/google', { method: 'POST', body: { credential: r.credential, nonce: cfg.nonce } }); location.reload(); }
          catch (e) { toast(e.message); setTimeout(() => location.reload(), 2500); }
        },
      });
      google.accounts.id.renderButton(slot, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'vi', shape: 'pill' });
    };
    document.head.append(s);
  }
  if (cfg.dev) {
    box.append(h('button', { type: 'button', class: 'ghost', onclick: async () => {
      await api('/api/auth/dev', { method: 'POST', body: { email: 'thu@localhost' } }); location.reload();
    } }, 'Đăng nhập thử (chỉ trên máy local)'));
  }
  if (!cfg.clientId && !cfg.dev) box.append(h('p', { class: 'error' }, 'Chủ trang chưa cấu hình đăng nhập Google.'));
  view.replaceChildren(box);
}

// ---------- home
async function showHome() {
  const { projects } = await api('/api/projects');
  const lim = me.limits, used = me.used || {};
  const f = {
    topic: h('textarea', { id: 'f-topic', rows: 4, maxlength: 3000, placeholder: 'Ví dụ: Vì sao lương mãi không tăng dù làm việc chăm chỉ?' }),
    ai: h('select', { id: 'f-ai' }, options([...(me.ai?.gemini ? [['gemini', 'Gemini']] : []), ...(me.ai?.openai ? [['openai', 'OpenAI']] : []), ...(location.hostname === 'localhost' ? [['mock', 'Mẫu có sẵn (thử nghiệm)']] : [])], me.ai?.gemini ? 'gemini' : 'openai')),
    seconds: h('select', { id: 'f-seconds' }, options([['30', '30 giây'], ['45', '45 giây'], ['60', '1 phút'], ['90', '1,5 phút'], ['150', '2,5 phút']], '45')),
    ratio: h('select', { id: 'f-ratio' }, options([['9:16', 'Dọc 9:16 (TikTok, Shorts, Reels)'], ['16:9', 'Ngang 16:9 (YouTube)']], '9:16')),
    style: h('select', { id: 'f-style' }, options(STYLE_KEYS.map((k) => [k, NV.STYLES[k].name]), 'whiteboard')),
    voice: h('select', { id: 'f-voice' }, options(VOICES, VOICES[0][0])),
    channel: h('input', { id: 'f-channel', maxlength: 40, placeholder: 'Tên kênh (hiện góc trái)' }),
    episode: h('input', { id: 'f-episode', maxlength: 30, placeholder: 'Ví dụ: Tập 1' }),
    tone: h('input', { id: 'f-tone', maxlength: 200, placeholder: 'Ví dụ: gần gũi, hài hước nhẹ' }),
    visual: h('select', { id: 'f-visual' }, options([['diagram', 'Sơ đồ vẽ tay — giống demo (không tốn tiền ảnh)'], ['mix', 'Kết hợp sơ đồ + tranh AI'], ['images', 'Tranh AI cho mọi cảnh']], 'diagram')),
  };
  const go = h('button', { type: 'submit' }, 'Viết kịch bản');
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault(); go.disabled = true; go.textContent = 'AI đang viết…';
    try {
      const r = await api('/api/projects/generate', { method: 'POST', body: {
        topic: f.topic.value, provider: f.ai.value, seconds: Number(f.seconds.value), ratio: f.ratio.value, style: f.style.value,
        voiceId: f.voice.value, channel: f.channel.value, episode: f.episode.value, tone: f.tone.value, visual: f.visual.value } });
      try { sessionStorage.setItem('autodraw:' + r.id, '1'); } catch {}
      location.hash = '#/p/' + r.id;
    } catch (err) { toast(err.message); go.disabled = false; go.textContent = 'Viết kịch bản'; }
  } },
    h('h2', {}, 'Tạo video mới'),
    h('label', { for: 'f-topic' }, 'Chủ đề hoặc kịch bản có sẵn', f.topic),
    h('div', { class: 'grid' },
      h('label', {}, 'AI viết kịch bản', f.ai), h('label', {}, 'Thời lượng', f.seconds), h('label', {}, 'Khung hình', f.ratio),
      h('label', {}, 'Kiểu hình', f.visual), h('label', {}, 'Phong cách', f.style), h('label', {}, 'Giọng đọc', f.voice), h('label', {}, 'Giọng văn', f.tone),
      h('label', {}, 'Tên kênh', f.channel), h('label', {}, 'Số tập', f.episode)),
    h('div', { class: 'row' }, go,
      h('span', { class: 'muted' }, `Hôm nay còn ${Math.max(0, lim.script - (used.script || 0))} lượt viết kịch bản, ${Math.max(0, lim.render - (used.render || 0))} lượt dựng video.`)));
  const list = projects.length
    ? h('div', { class: 'projects' }, projects.map((p) => h('a', { class: 'proj', href: '#/p/' + p.id },
        h('strong', {}, p.title), h('small', {}, 'Sửa lần cuối ' + fmtDate(p.updated_at)),
        p.last_job ? h('span', { class: 'pill ' + p.last_job }, JOB_TEXT[p.last_job] || p.last_job) : null)))
    : h('p', { class: 'muted' }, 'Chưa có video nào. Nhập chủ đề ở trên để tạo video đầu tiên.');
  view.replaceChildren(h('h1', {}, 'Xưởng video của bạn'), form, h('h2', {}, 'Video đã tạo'), list);
}

// ---------- editor
let pv = null;
function stopPreview() { if (pv) { cancelAnimationFrame(pv.raf); pv = null; } }

const imgCache = new Map();
function loadImg(src) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; }));
  return imgCache.get(src);
}
let handAsset = null;
async function getHand() {
  if (!handAsset) {
    const [img, fingers, meta] = await Promise.all([loadImg('/assets/hands/default/hand.webp'), loadImg('/assets/hands/default/fingers.webp'),
      fetch('/assets/hands/default/hand.json').then((r) => r.json())]);
    handAsset = { img, fingers, meta };
  }
  return handAsset;
}

async function showEditor(id) {
  const { spec } = await api('/api/projects/' + id);
  const canvas = h('canvas', { 'aria-label': 'Xem trước video' });
  const playBtn = h('button', { type: 'button', class: 'small' }, 'Tạm dừng');
  const status = h('span', { class: 'muted' }, 'Đã lưu');
  const imgProvider = h('select', {}, options([...(me.ai?.gemini ? [['gemini', 'Vẽ bằng Gemini']] : []), ...(me.ai?.openai ? [['openai', 'Vẽ bằng OpenAI']] : [])], me.ai?.gemini ? 'gemini' : 'openai'));

  const save = debounce(async () => {
    status.textContent = 'Đang lưu…';
    try { const r = await api('/api/projects/' + id, { method: 'PUT', body: { spec } }); Object.assign(spec, r.spec); status.textContent = 'Đã lưu'; }
    catch (e) { status.textContent = 'Chưa lưu được'; toast(e.message); }
  }, 900);
  const refresh = debounce(() => buildPreview(spec, canvas, playBtn).catch((e) => toast(e.message)), 350);
  const changed = () => { save(); refresh(); };

  const settings = h('div', { class: 'card' },
    h('label', {}, 'Tiêu đề', h('input', { value: spec.title, maxlength: 100, oninput: (e) => { spec.title = e.target.value; save(); } })),
    h('div', { class: 'grid' },
      h('label', {}, 'Phong cách', h('select', { onchange: (e) => { spec.style = e.target.value; delete spec.tool; changed(); } }, options(STYLE_KEYS.map((k) => [k, NV.STYLES[k].name]), spec.style))),
      h('label', {}, 'Dụng cụ vẽ', h('select', { onchange: (e) => { if (e.target.value) spec.tool = e.target.value; else delete spec.tool; changed(); } },
        options([['', 'Theo phong cách'], ...Object.entries(NV.TOOL_NAMES)], spec.tool || ''))),
      h('label', {}, 'Khung hình', h('select', { onchange: (e) => { spec.ratio = e.target.value; changed(); } }, options([['9:16', 'Dọc 9:16'], ['16:9', 'Ngang 16:9']], spec.ratio))),
      h('label', {}, 'Giọng đọc', h('select', { onchange: (e) => { spec.voice.voiceId = e.target.value; save(); } }, options(VOICES, spec.voice?.voiceId || VOICES[0][0]))),
      h('label', {}, 'Tốc độ đọc', h('select', { onchange: (e) => { spec.voice.speed = Number(e.target.value); save(); } },
        options([['0.9', 'Chậm'], ['1', 'Vừa'], ['1.1', 'Hơi nhanh'], ['1.2', 'Nhanh']], String(spec.voice?.speed ?? 1)))),
      h('label', {}, 'Tên kênh', h('input', { value: spec.channel || '', maxlength: 40, oninput: (e) => { spec.channel = e.target.value; changed(); } })),
      h('label', {}, 'Số tập', h('input', { value: spec.episode || '', maxlength: 30, oninput: (e) => { spec.episode = e.target.value; changed(); } }))));

  const scenesBox = h('div', { class: 'scenes' });
  const DIAGRAM_KINDS = [['bars', 'Biểu đồ cột (có mũi tên, đường cong)'], ['flow', 'Chuỗi nguyên nhân → kết quả'], ['compare', 'So sánh ✗ / ✓'], ['steps', 'Các bước'], ['number', 'Con số nổi bật'], ['statement', 'Câu chốt']];
  const field = (label, value, onInput, opts = {}) => h('label', {}, label, h(opts.area ? 'textarea' : 'input', { value: value ?? '', maxlength: opts.max || 80, rows: opts.area ? 3 : undefined, oninput: (e) => onInput(e.target.value) }));
  function diagramEditor(sc) {
    const d = sc.diagram, set = (k, v) => { d[k] = v; changed(); };
    const list = (v) => v.split(',').map((x) => x.trim()).filter(Boolean);
    const kind = h('select', { onchange: (e) => { d.kind = e.target.value; drawScenes(); changed(); } }, options(DIAGRAM_KINDS, d.kind));
    const fields = {
      statement: [field('Câu chốt (viết tay)', d.text, (v) => set('text', v), { max: 140, area: true })],
      number: [field('Con số', d.number, (v) => set('number', v), { max: 10 }), field('Chú thích', d.caption, (v) => set('caption', v))],
      flow: [field('Các ô (cách nhau bởi dấu phẩy, 2-4 ô)', (d.items || []).join(', '), (v) => set('items', list(v).slice(0, 4)))],
      bars: [field('Số ban đầu (vd 10tr, có thể để trống)', d.start, (v) => set('start', v), { max: 10 }), field('Các giá trị (cách nhau bởi dấu phẩy)', (d.values || []).join(', '), (v) => set('values', list(v).map(Number).filter((n) => isFinite(n)))),
        field('Nhãn từng cột (cách nhau bởi dấu phẩy)', (d.labels || []).join(', '), (v) => set('labels', list(v))), field('Đơn vị', d.unit, (v) => set('unit', v), { max: 6 })],
      compare: [field('Bên trái (cách sai)', d.left, (v) => set('left', v), { max: 24 }), field('Ghi chú trái', d.leftNote, (v) => set('leftNote', v)),
        field('Bên phải (cách đúng)', d.right, (v) => set('right', v), { max: 24 }), field('Ghi chú phải', d.rightNote, (v) => set('rightNote', v))],
      steps: [field('Các bước (mỗi dòng một bước)', (d.items || []).join('\n'), (v) => set('items', v.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 4)), { area: true, max: 300 })],
    }[d.kind] || [];
    return h('div', { class: 'panel' }, h('span', { class: 'tag' }, 'Sơ đồ vẽ tay (bàn tay vẽ từng nét)'),
      h('div', { class: 'grid' }, h('label', {}, 'Kiểu sơ đồ', kind), field('Tiêu đề (không bắt buộc)', d.title, (v) => set('title', v), { max: 60 })), ...fields);
  }
  const panelImgs = new Map();
  async function drawPanel(si, pi, btn) {
    const p = spec.scenes[si].panels[pi];
    if (btn) { btn.disabled = true; btn.textContent = 'Đang vẽ…'; }
    try {
      await save.flush();
      const r = await api(`/api/projects/${id}/image`, { method: 'POST', body: { scene: si, panel: pi, provider: imgProvider.value } });
      p.image = r.image; const img = panelImgs.get(`${si}:${pi}`); if (img) img.src = imageUrl(p.image) || BLANK; refresh();
      return true;
    } catch (e) { toast(e.message); return false; }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Vẽ lại bằng AI'; } }
  }
  const drawAllBtn = h('button', { type: 'button', class: 'ghost', onclick: async () => { if (await drawAll()) toast('Mọi khung đã có tranh AI.'); } }, 'Vẽ tất cả bằng AI');
  async function drawAll() {
    const todo = [];
    spec.scenes.forEach((sc, si) => sc.panels.forEach((p, pi) => { if (p.prompt && !p.image?.startsWith('r2:')) todo.push([si, pi]); }));
    if (!todo.length) return true;
    if (!imgProvider.options.length) { toast('Chủ trang chưa cấu hình AI vẽ ảnh. Hãy đổi các cảnh đó sang sơ đồ.'); return false; }
    drawAllBtn.disabled = true;
    let ok = true;
    for (let i = 0; i < todo.length; i++) {
      drawAllBtn.textContent = `Đang vẽ ${i + 1}/${todo.length}…`;
      if (!(await drawPanel(...todo[i]))) { ok = false; break; }
    }
    drawAllBtn.disabled = false; drawAllBtn.textContent = 'Vẽ tất cả bằng AI';
    drawScenes();
    return ok;
  }
  function drawScenes() {
    panelImgs.clear();
    scenesBox.replaceChildren(...spec.scenes.map((sc, si) => h('div', { class: 'scene' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, `Cảnh ${si + 1}`),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'ghost small', onclick: () => {
            if (sc.diagram) { delete sc.diagram; sc.panels = [{ prompt: 'a simple illustration of: ' + (sc.lines[0] || ''), image: '' }]; }
            else { sc.diagram = { kind: 'statement', text: sc.lines[sc.lines.length - 1] || '' }; sc.panels = []; }
            drawScenes(); changed();
          } }, sc.diagram ? 'Đổi sang tranh' : 'Đổi sang sơ đồ'),
          h('button', { type: 'button', class: 'ghost small', disabled: spec.scenes.length < 2, onclick: () => { spec.scenes.splice(si, 1); drawScenes(); changed(); } }, 'Xoá cảnh'))),
      sc.lines.map((line, li) => h('label', {}, `Câu ${li + 1}`, h('textarea', { class: 'line', rows: 2, maxlength: 160, value: line,
        oninput: (e) => { sc.lines[li] = e.target.value; changed(); } }))),
      sc.diagram ? diagramEditor(sc) : h('div', { class: 'panels' }, sc.panels.map((p, pi) => {
        const img = h('img', { src: imageUrl(p.image) || BLANK, alt: p.prompt || 'Chưa có tranh' });
        panelImgs.set(`${si}:${pi}`, img);
        const btn = h('button', { type: 'button', class: 'small', onclick: () => drawPanel(si, pi, btn) }, p.image?.startsWith('r2:') ? 'Vẽ lại bằng AI' : 'Vẽ bằng AI');
        return h('div', { class: 'panel' }, img,
          h('span', { class: 'tag' }, p.image?.startsWith('r2:') ? 'Tranh AI' : 'Chưa có tranh — bấm Vẽ bằng AI'),
          h('label', {}, 'Mô tả hình (tiếng Anh cho AI vẽ)', h('textarea', { rows: 2, maxlength: 400, value: p.prompt,
            oninput: (e) => { p.prompt = e.target.value; save(); } })),
          btn);
      })))),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'ghost', onclick: () => {
          spec.scenes.push({ lines: ['Câu thoại mới.'], panels: [], diagram: { kind: 'statement', text: 'Câu chốt' } }); drawScenes(); changed();
        } }, '+ Thêm cảnh'),
        drawAllBtn));
  }
  drawScenes();

  const tags = () => [spec.caption, (spec.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
  const postCard = h('div', { class: 'card' }, h('h2', {}, 'Nội dung đăng bài'),
    field('Caption', spec.caption, (v) => { spec.caption = v; save(); }, { area: true, max: 300 }),
    field('Hashtag (cách nhau bởi dấu cách)', (spec.hashtags || []).join(' '), (v) => { spec.hashtags = v.split(/\s+/).filter(Boolean); save(); }, { max: 300 }),
    h('button', { type: 'button', class: 'ghost small', onclick: async (e) => {
      try { await navigator.clipboard.writeText(tags()); toast('Đã sao chép caption và hashtag.'); }
      catch { toast('Trình duyệt chặn sao chép, hãy bôi đen rồi copy.'); }
    } }, 'Sao chép caption + hashtag'));

  const jobsBox = h('div', { class: 'jobs' });
  const renderBtn = h('button', { type: 'button', onclick: async () => {
    renderBtn.disabled = true;
    try {
      await save.flush();
      // never let placeholder art reach the video: draw what is missing first
      if (!(await drawAll())) { renderBtn.disabled = false; return; }
      await api(`/api/projects/${id}`, { method: 'PUT', body: { spec } });
      await api(`/api/projects/${id}/render`, { method: 'POST' }); toast('Đã xếp video vào hàng chờ dựng.'); pollJobs();
    }
    catch (e) { toast(e.message); }
    renderBtn.disabled = false;
  } }, 'Dựng video');
  let pollTimer;
  async function pollJobs() {
    clearTimeout(pollTimer);
    if (!document.body.contains(jobsBox)) return;
    const { jobs, queueLength } = await api(`/api/projects/${id}/jobs`).catch(() => ({ jobs: [] }));
    jobsBox.replaceChildren(...(jobs.length ? jobs.map((j) => h('div', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: 'pill ' + j.status }, JOB_TEXT[j.status] || j.status), h('small', { class: 'muted' }, fmtDate(j.created_at))),
      j.status === 'queued' ? h('small', { class: 'muted' }, `Có ${queueLength} video đang chờ trong hàng.`) : null,
      j.status === 'running' ? h('div', { class: 'bar' }, h('i', { style: `width:${j.progress}%` })) : null,
      j.status === 'failed' ? h('p', { class: 'error' }, j.error || 'Dựng thất bại.') : null,
      j.status === 'done' ? h('div', { class: 'row' }, h('a', { href: `/api/jobs/${j.id}/video`, download: true }, 'Tải video MP4'), h('a', { href: `/api/jobs/${j.id}/srt`, download: true }, 'Tải phụ đề')) : null))
      : [h('p', { class: 'muted' }, 'Chưa dựng lần nào.')]));
    if (jobs.some((j) => j.status === 'queued' || j.status === 'running')) pollTimer = setTimeout(pollJobs, 4000);
  }

  const preview = h('div', { class: 'preview' + (spec.ratio === '16:9' ? ' landscape' : '') },
    canvas,
    h('div', { class: 'row' }, playBtn,
      h('button', { type: 'button', class: 'ghost small', onclick: () => { if (pv) { pv.t = 0; pv.playing = true; playBtn.textContent = 'Tạm dừng'; } } }, 'Phát lại'),
      status),
    h('small', { class: 'muted' }, 'Xem trước không có tiếng; nhịp vẽ ước tính theo độ dài câu. Video dựng xong sẽ khớp đúng giọng đọc.'),
    h('div', { class: 'card' }, h('h2', {}, 'Xuất video'), h('div', { class: 'row' }, renderBtn, imgProvider), jobsBox));
  playBtn.addEventListener('click', () => { if (!pv) return; pv.playing = !pv.playing; playBtn.textContent = pv.playing ? 'Tạm dừng' : 'Phát'; });

  view.replaceChildren(h('a', { href: '#/' }, '← Tất cả video'), h('div', { class: 'editor' }, preview, h('div', { class: 'scenes' }, settings, scenesBox, postCard)));
  await buildPreview(spec, canvas, playBtn);
  pollJobs();
  let auto = false;
  try { auto = sessionStorage.getItem('autodraw:' + id) === '1'; sessionStorage.removeItem('autodraw:' + id); } catch {}
  if (auto && imgProvider.options.length) drawAll();
}

async function buildPreview(spec, canvas, playBtn) {
  const [images, hand] = await Promise.all([
    Promise.all(spec.scenes.map((sc) => Promise.all(sc.panels.map((p) => (imageUrl(p.image) ? loadImg(imageUrl(p.image)) : Promise.resolve(Object.assign(document.createElement('canvas'), { width: 4, height: 3 }))))))),
    getHand(), document.fonts.load('29px Pangolin').catch(() => {}),
  ]);
  const timeline = NV.buildTimeline(spec.scenes, spec.scenes.map((s) => NV.estimateVoice(s.lines)));
  const { W, H } = NV.logicalSize(spec.ratio);
  const dpr = Math.min(1.5, (window.devicePixelRatio || 1) * (spec.ratio === '9:16' ? 0.7 : 0.45));
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.parentElement?.classList.toggle('landscape', spec.ratio === '16:9');
  const env = { createCanvas: (w, hgt) => { const c = document.createElement('canvas'); c.width = w; c.height = hgt; return c; } };
  const model = NV.prepare({ env, project: spec, timeline, images, hand, dpr });
  const ctx = canvas.getContext('2d');
  const keep = pv && pv.canvas === canvas ? pv : null;
  stopPreview();
  pv = { canvas, model, t: keep ? Math.min(keep.t, timeline.duration) : 0, playing: keep ? keep.playing : !matchMedia('(prefers-reduced-motion: reduce)').matches, last: 0, raf: 0 };
  if (!pv.playing) { pv.t = timeline.duration - 0.8; playBtn.textContent = 'Phát'; }
  const loop = (ts) => {
    if (!pv) return;
    if (pv.playing) { pv.t += pv.last ? (ts - pv.last) / 1000 : 0; if (pv.t > timeline.duration) pv.t = 0; }
    pv.last = ts;
    NV.renderFrame(ctx, pv.model, pv.t);
    pv.raf = requestAnimationFrame(loop);
  };
  pv.raf = requestAnimationFrame(loop);
}

boot().catch(fatal);
