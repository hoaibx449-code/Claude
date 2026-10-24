// Quản trị → Ink Studio: AI order and fallback, voices, default pace, the GitHub render machine.
const PACE = { slow: 'Chậm', normal: 'Vừa', fast: 'Nhanh', faster: 'Rất nhanh' };
const MOOD = { auto: 'Tự chọn theo nội dung', motivating: 'Truyền động lực', calm: 'Nhẹ nhàng', upbeat: 'Sôi động', emotional: 'Cảm xúc', none: 'Không nhạc' };
const STATUS = { queued: 'Đang chờ', running: 'Đang dựng', review: 'Chờ duyệt phân cảnh', done: 'Xong', failed: 'Lỗi' };

export async function showInkAdmin({ h, api, body, toast, fail }) {
  const data = await api('/api/admin/ink');
  const s = structuredClone(data.settings); let token = '';
  const opts = (map, v) => Object.entries(map).map(([k, l]) => h('option', { value: k, selected: k === v }, l));
  const field = (label, control, note) => h('label', { class: 'field' }, h('span', {}, label), control, note ? h('small', { class: 'muted' }, note) : null);
  const card = (title, note, ...kids) => h('section', { class: 'card' }, h('div', { class: 'section-title' }, h('h2', {}, title)), note ? h('p', { class: 'muted' }, note) : null, ...kids);
  const inp = (v, set, attrs = {}) => h('input', { value: v ?? '', ...attrs, oninput: (e) => set(attrs.type === 'number' ? Number(e.target.value) : e.target.value) });
  const tick = (v, set, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!v, onchange: (e) => set(e.target.checked) }), label);
  const key = (ok, name) => h('span', { class: 'chip' + (ok ? ' ok' : '') }, (ok ? '✓ ' : '✗ ') + name);

  const voices = h('div', { class: 'ink-voices' });
  const paintVoices = () => voices.replaceChildren(...s.voice.list.map((v, i) => h('div', { class: 'row' },
    tick(v.on, (x) => { v.on = x; }, ''), inp(v.label, (x) => { v.label = x; }, { 'aria-label': 'Tên giọng', placeholder: 'Tên hiển thị' }),
    h('select', { 'aria-label': 'Nhà cung cấp', onchange: (e) => { v.provider = e.target.value; } }, opts({ microsoft: 'Microsoft (miễn phí)', everai: 'EverAI' }, v.provider)),
    inp(v.code, (x) => { v.code = x; }, { 'aria-label': 'Mã giọng', placeholder: 'vi-VN-HoaiMyNeural / vi_female_…' }),
    h('label', { class: 'check' }, h('input', { type: 'radio', name: 'ink-default-voice', checked: s.voice.default === v.id, onchange: () => { s.voice.default = v.id; } }), 'Mặc định'),
    h('button', { type: 'button', class: 'ghost small', onclick: () => { s.voice.list.splice(i, 1); paintVoices(); } }, 'Xoá'))),
    h('button', { type: 'button', class: 'ghost small', onclick: () => { s.voice.list.push({ id: 'giong-' + Date.now().toString(36).slice(-5), label: 'Giọng mới', provider: 'microsoft', code: 'vi-VN-HoaiMyNeural', on: true }); paintVoices(); } }, '+ Thêm giọng'));
  paintVoices();

  const order = h('select', { onchange: (e) => { s.ai.order = e.target.value.split(','); } }, opts({ 'gemini,openai': 'Gemini trước, OpenAI dự phòng', 'openai,gemini': 'OpenAI trước, Gemini dự phòng' }, s.ai.order.join(',')));
  const save = h('button', { type: 'button', class: 'btn' }, 'Lưu cài đặt');
  save.onclick = async () => { try { const r = await api('/api/admin/ink', { method: 'PUT', body: { settings: s, token: token || undefined } }); Object.assign(s, r.settings); token = ''; toast('Đã lưu cài đặt Ink Studio.'); } catch (e) { fail(e); } };
  const wake = h('button', { type: 'button', class: 'ghost' }, 'Bật máy dựng ngay');
  wake.onclick = async () => { try { await api('/api/admin/ink/dispatch', { method: 'POST' }); toast('Đã gửi lệnh tới GitHub. Máy dựng khởi động trong khoảng 1 phút.'); } catch (e) { fail(e); } };
  const when = (t) => (t ? new Date(t).toLocaleString('vi-VN') : '—');

  body.replaceChildren(
    card('Trạng thái', 'Video vẽ tay được dựng trên GitHub Actions. Trang web giữ hàng chờ và tự đánh thức máy dựng khi có video mới.',
      h('div', { class: 'row' }, tick(s.enabled, (x) => { s.enabled = x; }, 'Bật Ink Studio cho người dùng')),
      h('div', { class: 'row' }, key(data.token, 'GitHub token'), key(data.keys.gemini, 'Gemini'), key(data.keys.openai, 'OpenAI'), key(data.keys.everai, 'EverAI')),
      h('p', { class: 'muted' }, 'Lần đánh thức máy dựng gần nhất: ' + when(data.lastDispatch)), wake),
    card('Máy dựng GitHub', 'Token GitHub loại fine-grained, chỉ cấp quyền Actions: Read and write cho đúng repo này. Token được mã hoá, không hiển thị lại.',
      field('Repo', inp(s.github.repo, (x) => { s.github.repo = x; }, { placeholder: 'chu-so-huu/ten-repo' })),
      field('Workflow', inp(s.github.workflow, (x) => { s.github.workflow = x; })),
      field('Nhánh chạy', inp(s.github.ref, (x) => { s.github.ref = x; })),
      field('GitHub token', inp('', (x) => { token = x.trim(); }, { type: 'password', autocomplete: 'off', placeholder: data.token ? 'Đã lưu. Nhập token mới để thay.' : 'github_pat_…' }))),
    card('AI viết kịch bản', 'Khoá Gemini và OpenAI lấy ở trang API & khoá. Mỗi nhà cung cấp thử lần lượt các model theo thứ tự bên dưới.',
      field('Thứ tự ưu tiên', order), tick(s.ai.fallback, (x) => { s.ai.fallback = x; }, 'Khi nhà cung cấp đầu lỗi, chuyển sang nhà cung cấp còn lại'),
      field('Model Gemini (theo thứ tự)', inp(s.ai.gemini, (x) => { s.ai.gemini = x; })),
      field('Model OpenAI (theo thứ tự)', inp(s.ai.openai, (x) => { s.ai.openai = x; }))),
    card('Giọng đọc', 'Người dùng chọn trong các giọng đang bật. Giọng Microsoft miễn phí; EverAI cần khoá EverAI ở trang API & khoá.',
      voices, tick(s.voice.fallback, (x) => { s.voice.fallback = x; }, 'Khi giọng chọn lỗi, đọc bằng nhà cung cấp còn lại để video không hỏng')),
    card('Mặc định khi tạo video', null,
      field('Nhịp', h('select', { onchange: (e) => { s.defaults.pace = e.target.value; } }, opts(PACE, s.defaults.pace))),
      field('Độ dài (giây)', inp(s.defaults.seconds, (x) => { s.defaults.seconds = x; }, { type: 'number', min: 20, max: 300 })),
      field('Nhạc nền', h('select', { onchange: (e) => { s.defaults.mood = e.target.value; } }, opts(MOOD, s.defaults.mood))),
      field('Âm lượng nhạc (0–0,6)', inp(s.defaults.musicVolume, (x) => { s.defaults.musicVolume = x; }, { type: 'number', min: 0, max: 0.6, step: 0.05 })),
      tick(s.defaults.captions, (x) => { s.defaults.captions = x; }, 'Bật phụ đề'), tick(s.defaults.review, (x) => { s.defaults.review = x; }, 'Duyệt phân cảnh trước khi dựng')),
    h('div', { class: 'row' }, save),
    card('Video gần đây', null, h('div', { class: 'table' }, h('table', {}, h('thead', {}, h('tr', {}, ['Thời gian', 'Người dùng', 'Tiêu đề', 'Trạng thái', 'Ghi chú'].map((x) => h('th', {}, x)))),
      h('tbody', {}, data.jobs.map((j) => h('tr', {}, h('td', {}, when(j.created_at)), h('td', {}, j.email || ''), h('td', {}, j.title),
        h('td', {}, (STATUS[j.status] || j.status) + (j.status === 'running' ? ` ${j.progress}%` : '')), h('td', { class: j.error ? 'error' : 'muted' }, j.error || j.message || (j.duration ? j.duration + ' giây' : '')))))))),
  );
}
