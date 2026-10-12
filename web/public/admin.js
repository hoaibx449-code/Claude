// Admin page (#/admin): site settings, API keys, every renamable label, users.
// Uses h, api, toast, options, applyUI and ui from app.js. Keys are write-only: the page
// only learns whether a key is set, never its value.
'use strict';

const SECRET_INFO = {
  GEMINI_API_KEY: ['Gemini (Google AI Studio)', 'Viết kịch bản + vẽ ảnh. Lấy tại aistudio.google.com → Get API key.'],
  OPENAI_API_KEY: ['OpenAI', 'Viết kịch bản + vẽ ảnh. platform.openai.com → API keys.'],
  EVERAI_API_KEY: ['EverAI', 'Giọng đọc tiếng Việt (máy dựng).'],
  GOOGLE_TTS_API_KEY: ['Google Text-to-Speech', 'Giọng đọc Google (máy dựng).'],
  ELEVENLABS_API_KEY: ['ElevenLabs', 'Giọng đọc ElevenLabs (máy dựng).'],
};
const LABEL_GROUPS = [
  ['styles', 'Phong cách vẽ'], ['tools', 'Dụng cụ vẽ'], ['kinds', 'Kiểu sơ đồ'], ['visual', 'Kiểu hình'], ['actions', 'Động tác người que'], ['ai', 'Nhà cung cấp AI'],
];
const TEXT_NAMES = {
  loginTitle: 'Tiêu đề trang đăng nhập', loginText: 'Mô tả trang đăng nhập', homeTitle: 'Tiêu đề trang chủ', newVideo: 'Khung tạo video',
  topic: 'Ô chủ đề', topicHint: 'Gợi ý ô chủ đề', textAI: 'Nhãn chọn AI', duration: 'Nhãn thời lượng', ratio: 'Nhãn khung hình', visual: 'Nhãn kiểu hình',
  style: 'Nhãn phong cách', voice: 'Nhãn giọng đọc', tone: 'Nhãn giọng văn', toneHint: 'Gợi ý giọng văn', channel: 'Nhãn tên kênh', episode: 'Nhãn số tập',
  episodeHint: 'Gợi ý số tập', write: 'Nút viết kịch bản', writing: 'Chữ khi AI đang viết', myVideos: 'Tiêu đề danh sách video', noVideos: 'Khi chưa có video',
  allVideos: 'Liên kết quay lại', render: 'Nút dựng video', drawAll: 'Nút vẽ tất cả', post: 'Khung nội dung đăng bài', export: 'Khung xuất video',
  download: 'Liên kết tải video', subtitles: 'Liên kết tải phụ đề', logout: 'Nút đăng xuất', admin: 'Liên kết quản trị',
};

async function showAdmin() {
  const [{ config, secrets }, people] = await Promise.all([api('/api/admin/settings'), api('/api/admin/users')]);
  const c = structuredClone(config);
  const secretInput = {};
  const input = (value, onInput, attrs = {}) => h('input', { value: value ?? '', ...attrs, oninput: (e) => onInput(e.target.value) });
  const area = (value, onInput, rows = 4) => h('textarea', { rows, value: value ?? '', oninput: (e) => onInput(e.target.value) });
  const select = (list, value, onChange) => h('select', { onchange: (e) => onChange(e.target.value) }, options(list, value));
  const card = (title, note, ...kids) => h('section', { class: 'card' }, h('h2', {}, title), note ? h('p', { class: 'muted' }, note) : null, ...kids);
  const status = { admin: 'Đã nhập ở đây', env: 'Đang dùng khoá cài trên máy chủ', null: 'Chưa có' };

  const keys = card('Khoá API', 'Khoá được mã hoá trước khi lưu và không bao giờ hiện lại. Để trống = giữ nguyên. Khoá nhập ở đây được ưu tiên hơn khoá cài trên máy chủ.',
    ...Object.entries(SECRET_INFO).map(([name, [title, note]]) => {
      const st = secrets[name];
      const clear = h('button', { type: 'button', class: 'ghost small', hidden: st !== 'admin', onclick: () => { secretInput[name] = null; clear.textContent = 'Sẽ xoá khi lưu'; clear.disabled = true; } }, 'Xoá khoá đã nhập');
      return h('div', { class: 'keyrow' },
        h('label', {}, h('span', {}, h('strong', {}, title), ' ', h('span', { class: 'pill ' + (st ? 'done' : 'failed') }, status[st])), h('small', {}, note),
          h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: st ? '•••••••• (để trống = giữ nguyên)' : 'Dán khoá vào đây',
            oninput: (e) => { secretInput[name] = e.target.value; } })),
        clear);
    }));

  const brand = card('Thương hiệu', null, h('div', { class: 'grid' },
    h('label', {}, 'Tên trang', input(c.brand.name, (v) => { c.brand.name = v; }, { maxlength: 40 })),
    h('label', {}, 'Chữ nổi bật sau tên', input(c.brand.accent, (v) => { c.brand.accent = v; }, { maxlength: 30 })),
    h('label', {}, 'Mô tả ngắn', input(c.brand.tagline, (v) => { c.brand.tagline = v; }, { maxlength: 160 }))));

  const voiceText = () => c.voices.map((v) => `${v.provider} | ${v.code} | ${v.label}`).join('\n');
  const defaults = card('Mặc định khi tạo video', 'Người dùng vẫn đổi được từng video.', h('div', { class: 'grid' },
    h('label', {}, 'AI viết kịch bản', select(Object.entries(c.labels.ai), c.defaults.textAI, (v) => { c.defaults.textAI = v; })),
    h('label', {}, 'AI vẽ ảnh', select(Object.entries(c.labels.ai), c.defaults.imageAI, (v) => { c.defaults.imageAI = v; })),
    h('label', {}, 'Phong cách', select(Object.entries(c.labels.styles), c.defaults.style, (v) => { c.defaults.style = v; })),
    h('label', {}, 'Kiểu hình', select(Object.entries(c.labels.visual), c.defaults.visual, (v) => { c.defaults.visual = v; })),
    h('label', {}, 'Khung hình', select([['9:16', 'Dọc 9:16'], ['16:9', 'Ngang 16:9']], c.defaults.ratio, (v) => { c.defaults.ratio = v; })),
    h('label', {}, 'Thời lượng (giây)', input(c.defaults.seconds, (v) => { c.defaults.seconds = Number(v); }, { type: 'number', min: 15, max: 180 })),
    h('label', {}, 'Giọng đọc', select(c.voices.map((v) => [v.code, v.label]), c.defaults.voice, (v) => { c.defaults.voice = v; })),
    h('label', {}, 'Tên kênh', input(c.defaults.channel, (v) => { c.defaults.channel = v; }, { maxlength: 40 })),
    h('label', {}, 'Giọng văn', input(c.defaults.tone, (v) => { c.defaults.tone = v; }, { maxlength: 200 }))));

  const styles = card('Phong cách được dùng', 'Bỏ chọn để ẩn phong cách khỏi danh sách của người dùng.', h('div', { class: 'grid' },
    Object.keys(c.labels.styles).map((k) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: c.enabledStyles.includes(k), onchange: (e) => {
        c.enabledStyles = e.target.checked ? [...new Set([...c.enabledStyles, k])] : c.enabledStyles.filter((x) => x !== k);
      } }), c.labels.styles[k]))));

  const names = card('Đổi tên', 'Mọi tên hiển thị cho người dùng.', ...LABEL_GROUPS.map(([g, title]) => h('details', {},
    h('summary', {}, title),
    h('div', { class: 'grid' }, Object.keys(c.labels[g]).map((k) => h('label', {}, h('code', {}, k), input(c.labels[g][k], (v) => { c.labels[g][k] = v; }, { maxlength: g === 'visual' ? 80 : 60 })))))),
  h('details', {}, h('summary', {}, 'Chữ trên giao diện'),
    h('div', { class: 'grid' }, Object.keys(c.texts).map((k) => h('label', {}, TEXT_NAMES[k] || k, input(c.texts[k], (v) => { c.texts[k] = v; }, { maxlength: 240 }))))));

  const voices = card('Danh sách giọng đọc', 'Mỗi dòng: nhà cung cấp | mã giọng | tên hiển thị. Nhà cung cấp: everai, google, elevenlabs.',
    area(voiceText(), (v) => {
      c.voices = v.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p.length >= 2 && p[1])
        .map(([provider, code, label]) => ({ provider, code, label: label || code }));
    }, 10));

  const models = card('Model AI và giới hạn', null, h('div', { class: 'grid' },
    h('label', {}, 'OpenAI viết', input(c.models.openaiText, (v) => { c.models.openaiText = v; })),
    h('label', {}, 'OpenAI vẽ', input(c.models.openaiImage, (v) => { c.models.openaiImage = v; })),
    h('label', {}, 'Chất lượng ảnh OpenAI', select([['low', 'Thấp (rẻ nhất)'], ['medium', 'Vừa'], ['high', 'Cao']], c.models.openaiImageQuality, (v) => { c.models.openaiImageQuality = v; })),
    h('label', {}, 'Gemini viết', input(c.models.geminiText, (v) => { c.models.geminiText = v; })),
    h('label', {}, 'Gemini vẽ', input(c.models.geminiImage, (v) => { c.models.geminiImage = v; })),
    h('label', {}, 'Kịch bản / người / ngày', input(c.limits.script, (v) => { c.limits.script = Number(v); }, { type: 'number', min: 0 })),
    h('label', {}, 'Ảnh AI / người / ngày', input(c.limits.image, (v) => { c.limits.image = Number(v); }, { type: 'number', min: 0 })),
    h('label', {}, 'Video / người / ngày', input(c.limits.render, (v) => { c.limits.render = Number(v); }, { type: 'number', min: 0 }))),
  h('label', {}, 'Lời dặn thêm cho AI viết kịch bản (áp dụng mọi video)', area(c.promptExtra, (v) => { c.promptExtra = v; }, 3)));

  const admins = card('Quản trị viên', 'Email Google, mỗi dòng một email. Để trống thì tài khoản đăng nhập đầu tiên là quản trị viên.',
    area(c.admins.join('\n'), (v) => { c.admins = v.split(/[\s,]+/).filter(Boolean); }, 3));

  const j = people.jobs7d || {};
  const users = card('Người dùng', `7 ngày qua: ${j.done || 0} video xong, ${j.failed || 0} lỗi, ${(j.queued || 0) + (j.running || 0)} đang chờ/dựng.`,
    h('div', { class: 'table' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Email', 'Tên', 'Dự án', 'Video', 'Lượt hôm nay', 'Tham gia', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, people.users.map((u) => {
        const btn = h('button', { type: 'button', class: 'ghost small', onclick: async () => {
          btn.disabled = true;
          try { await api(`/api/admin/users/${encodeURIComponent(u.id)}/block`, { method: 'POST', body: { blocked: !u.blocked } }); u.blocked = u.blocked ? 0 : 1; btn.textContent = u.blocked ? 'Mở khoá' : 'Khoá'; }
          catch (e) { toast(e.message); }
          btn.disabled = false;
        } }, u.blocked ? 'Mở khoá' : 'Khoá');
        return h('tr', {}, h('td', {}, u.email), h('td', {}, u.name || ''), h('td', {}, String(u.projects)), h('td', {}, String(u.videos)), h('td', {}, String(u.today)),
          h('td', {}, fmtDate(u.created_at)), h('td', {}, btn));
      })))));

  const saveBtn = h('button', { type: 'button', onclick: async () => {
    saveBtn.disabled = true; saveBtn.textContent = 'Đang lưu…';
    try {
      const r = await api('/api/admin/settings', { method: 'PUT', body: { config: c, secrets: secretInput } });
      me = await api('/api/me'); applyUI(me.ui);
      toast('Đã lưu cài đặt.');
      await showAdmin();
      return;
    } catch (e) { toast(e.message); }
    saveBtn.disabled = false; saveBtn.textContent = 'Lưu cài đặt';
  } }, 'Lưu cài đặt');

  view.replaceChildren(h('a', { href: '#/' }, T('allVideos')),
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('h1', {}, T('admin')), saveBtn),
    keys, brand, defaults, styles, names, voices, models, admins, users,
    h('div', { class: 'savebar' }, saveBtn.cloneNode(true)));
  // the bottom button mirrors the top one
  view.querySelector('.savebar button').addEventListener('click', () => saveBtn.click());
}
