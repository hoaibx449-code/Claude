// Admin page (#/admin/<tab>): overview, activity log, users, orders, plans, Zalo, what users
// see, content and settings. Uses h, api, toast, options, applyUI, ui, fmtDate, money from app.js.
// API keys are write-only: the page only learns whether a key is set, never its value.
'use strict';

const ADMIN_TABS = [
  ['tong-quan', 'Tổng quan'], ['nhat-ky', 'Nhật ký'], ['nguoi-dung', 'Người dùng'], ['don-hang', 'Đơn hàng'], ['goi', 'Gói cước'],
  ['may-dung', 'Máy dựng'], ['cong-dong', 'Cộng đồng'], ['zalo', 'Zalo'], ['hien-thi', 'Hiển thị'], ['noi-dung', 'Nội dung'], ['cai-dat', 'Cài đặt'],
];
const SECRET_INFO = {
  GEMINI_API_KEY: ['Gemini (Google AI Studio)', 'Viết kịch bản + vẽ ảnh. aistudio.google.com → Get API key.'],
  OPENAI_API_KEY: ['OpenAI', 'Viết kịch bản + vẽ ảnh. platform.openai.com → API keys.'],
  EVERAI_API_KEY: ['EverAI', 'Giọng đọc tiếng Việt tự nhiên (máy dựng).'],
  GOOGLE_TTS_API_KEY: ['Google Text-to-Speech', 'Giọng Google (máy dựng). Không bắt buộc: giọng miễn phí dùng tài khoản Google Cloud của máy dựng.'],
  ELEVENLABS_API_KEY: ['ElevenLabs', 'Giọng ElevenLabs (máy dựng).'],
  ZALO_BOT_TOKEN: ['Zalo Bot token', 'Lấy trong Zalo Bot Creator. Dùng cho tab Zalo.'],
  SEPAY_API_KEY: ['SePay API key', 'Để SePay báo chuyển khoản về web (tab Gói cước).'],
};
const EVENT_NAMES = {
  api: 'Gọi API', error: 'Lỗi máy chủ', 'auth.login': 'Đăng nhập', 'auth.logout': 'Đăng xuất', 'project.create': 'Tạo video', 'project.save': 'Lưu chỉnh sửa',
  'project.delete': 'Xoá video', 'project.compose': 'Thiết kế lại cảnh', 'project.duplicate': 'Nhân bản', 'ai.script': 'AI viết kịch bản', 'ai.image': 'AI vẽ ảnh',
  'ai.fallback': 'AI lỗi → miễn phí', 'render.queue': 'Xếp hàng dựng', 'render.start': 'Bắt đầu dựng', 'render.done': 'Dựng xong', 'render.fail': 'Dựng lỗi',
  'render.trigger': 'Bật máy dựng', 'video.download': 'Tải video', 'template.open': 'Mở kịch bản mẫu', 'zalo.message': 'Tin Zalo đến', 'zalo.notify': 'Gửi Zalo',
  'zalo.link': 'Kết nối Zalo', 'zalo.unlink': 'Bỏ kết nối Zalo', 'zalo.create': 'Zalo tạo video lỗi', 'order.create': 'Tạo đơn', 'order.paid': 'Đơn đã trả',
  'order.cancel': 'Huỷ đơn', 'sepay.webhook': 'SePay báo tiền', 'ui.view': 'Xem trang', 'ui.click': 'Bấm', 'ui.leave': 'Rời trang', 'ui.error': 'Lỗi trình duyệt',
  'ui.choose': 'Chọn cách tạo', 'ui.mode': 'Chọn kiểu video', 'ui.platform': 'Xem như nền tảng', 'video.play': 'Xem video trên web', 'media.upload': 'Tải ảnh lên',
  'community.share': 'Chia sẻ cộng đồng', 'community.like': 'Thả tim', 'admin.community': 'Admin duyệt cộng đồng', 'auth.redirect': 'Mở đăng nhập Google', 'ui.pay_open': 'Mở thanh toán', 'ui.pay_done': 'Thanh toán xong', 'ui.template': 'Chọn mẫu', 'admin.settings': 'Admin lưu cài đặt', 'admin.block': 'Admin khoá/mở', 'admin.grant': 'Admin cấp gói', 'admin.export': 'Admin xuất CSV',
};
const evName = (t) => EVENT_NAMES[t] || t;
const VIS_NAMES = { on: 'Hiện', dev: 'Đang phát triển', hidden: 'Ẩn' };

async function showAdmin() {
  const tab = (location.hash.split('/')[2] || 'tong-quan');
  viewed('admin', { tab });
  const nav = h('nav', { class: 'tabs' }, ADMIN_TABS.map(([k, name]) => h('a', { href: '#/admin/' + k, class: k === tab ? 'on' : null }, name)));
  const body = h('div', { class: 'scenes' }, h('p', { class: 'muted' }, 'Đang tải…'));
  show(h('a', { href: '#/' }, T('allVideos')), h('h1', {}, T('admin')), nav, body);
  const pages = { 'may-dung': adminRenders, 'cong-dong': adminCommunity, 'tong-quan': adminOverview, 'nhat-ky': adminLog, 'nguoi-dung': adminUsers, 'don-hang': adminOrders, goi: adminSettings, zalo: adminSettings, 'hien-thi': adminSettings, 'noi-dung': adminSettings, 'cai-dat': adminSettings };
  await (pages[tab] || adminOverview)(body, tab);
}

const card = (title, note, ...kids) => h('section', { class: 'card' }, h('h2', {}, title), note ? h('p', { class: 'muted' }, note) : null, ...kids);
const input = (value, onInput, attrs = {}) => h('input', { value: value ?? '', ...attrs, oninput: (e) => onInput(attrs.type === 'number' ? Number(e.target.value) : e.target.value) });
const area = (value, onInput, rows = 4) => h('textarea', { rows, value: value ?? '', oninput: (e) => onInput(e.target.value) });
const select = (list, value, onChange) => h('select', { onchange: (e) => onChange(e.target.value) }, options(list, value));
const check = (checked, onChange, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!checked, onchange: (e) => onChange(e.target.checked) }), label);
const table = (head, rows) => h('div', { class: 'table' }, h('table', {}, h('thead', {}, h('tr', {}, head.map((x) => h('th', {}, x)))), rows instanceof HTMLElement && rows.tagName === 'TBODY' ? rows : h('tbody', {}, rows)));
const num = (n) => Number(n || 0).toLocaleString('vi-VN');

// ---------------------------------------------------------------- overview
async function adminOverview(body) {
  let days = 30;
  const draw = async () => {
    const o = await api('/api/admin/overview?days=' + days);
    const t = o.totals || {}, f = o.funnel || {};
    const stat = (label, value, note) => h('div', { class: 'stat' }, h('small', {}, label), h('b', {}, value), note ? h('small', {}, note) : null);
    const max = Math.max(1, ...o.series.map((d) => d.projects + d.renders));
    const steps = [['Khách vào trang', f.visitors], ['Đăng nhập', f.logged_in], ['Tạo video', f.created], ['Bấm dựng', f.rendered], ['Nhận video', f.got_video], ['Tải video', f.downloaded]];
    const top = Math.max(1, ...steps.map(([, n]) => n || 0));
    const breakdown = (title, rows, names = {}) => h('div', {}, h('h3', {}, title), rows.length ? h('ul', {}, rows.map((r) => h('li', {}, `${names[r.k] || r.k || '(không rõ)'}: ${r.n}`))) : h('p', { class: 'muted' }, 'Chưa có dữ liệu.'));
    body.replaceChildren(
      h('div', { class: 'row' }, 'Khoảng thời gian: ', select([['1', 'Hôm nay'], ['7', '7 ngày'], ['30', '30 ngày'], ['90', '90 ngày'], ['365', '1 năm']], String(days), (v) => { days = Number(v); draw(); })),
      h('div', { class: 'stats' },
        stat('Người dùng', num(o.users.all_users), `+${num(o.users.new_users)} mới`), stat('Hoạt động', num(o.active)),
        stat('Video tạo', num(t.projects)), stat('Video dựng xong', num(t.renders), t.failed ? `${num(t.failed)} lỗi` : null),
        stat('AI viết / vẽ', `${num(t.scripts)} / ${num(t.images)}`), stat('Chi phí AI + giọng', money(t.cost)),
        stat('Thời gian ra video', t.avg_total_sec ? Math.round(t.avg_total_sec) + ' giây' : '—', 'từ lúc bấm dựng'), stat('Lỗi', num(t.errors)),
        stat('Hàng chờ dựng', `${num(o.jobs.queued)} chờ · ${num(o.jobs.running)} đang dựng`), stat('Tin Zalo', num(t.zalo))),
      card('Theo ngày', 'Cột = video tạo + video dựng xong mỗi ngày.', h('div', { class: 'spark' }, o.series.map((d) => h('i', { title: `${new Date((d.d) * 86400000).toLocaleDateString('vi-VN')}: ${d.projects} tạo, ${d.renders} xong, ${d.failed} lỗi, ${money(d.cost)}`, style: `height:${Math.round(((d.projects + d.renders) / max) * 100)}%` })))),
      card('Phễu người dùng', 'Số người (không trùng) đi tới từng bước.', h('div', { class: 'funnel' }, steps.map(([k, n]) => h('div', {}, h('span', { style: 'width:130px' }, k), h('i', { style: `width:${Math.round(((n || 0) / top) * 300)}px` }), num(n))))),
      card('Người dùng làm video gì', null, h('div', { class: 'grid' },
        breakdown('Dạng video', o.formats, { explainer: 'Giải thích', listicle: 'Danh sách', howto: 'Hướng dẫn', story: 'Kể chuyện', compare: 'So sánh', data: 'Số liệu', sales: 'Bán hàng', motivation: 'Truyền cảm hứng', qa: 'Hỏi đáp', news: 'Tin tức' }),
        breakdown('Ngách', o.niches), breakdown('Cách tạo', o.sources, ui.labels.sources), breakdown('Phong cách', o.styles, ui.labels.styles))),
      card('Lỗi gặp nhiều', null, o.errors.length ? table(['Ở đâu', 'Số lần', 'Gần nhất'], o.errors.map((e) => h('tr', {}, h('td', {}, e.k), h('td', {}, num(e.n)), h('td', {}, fmtDate(e.last))))) : h('p', { class: 'ok' }, 'Không có lỗi.')),
      card('Yêu cầu chậm nhất', null, table(['Đường dẫn', 'Số lần', 'TB (ms)', 'Lâu nhất'], o.slow.map((e) => h('tr', {}, h('td', {}, e.k), h('td', {}, num(e.n)), h('td', {}, num(e.avg_ms)), h('td', {}, num(e.max_ms)))))),
      card('Kiểm tra cài đặt', null, h('ul', {}, o.setup.map((s) => h('li', { class: s.ok ? 'ok' : 'bad' }, (s.ok ? '✓ ' : '✗ ') + s.k, s.note && !s.ok ? h('small', { class: 'muted' }, ' — ' + s.note) : null)))));
  };
  await draw();
}

// ---------------------------------------------------------------- activity log
async function adminLog(body) {
  const f = { email: '', type: '', channel: '', ok: '', q: '', from: '', to: '', user: '', ...(pendingLog || {}) };
  pendingLog = null;
  const rowsBox = h('tbody');
  let last = null, typesLoaded = false;
  const typeSel = h('select', { onchange: (e) => { f.type = e.target.value; load(true); } }, h('option', { value: '' }, 'Mọi loại'));
  const qs = () => new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  async function load(reset) {
    if (reset) { rowsBox.replaceChildren(); last = null; }
    const r = await api('/api/admin/events?' + qs() + (last ? '&before=' + last : ''));
    if (!typesLoaded) { typeSel.append(...r.types.map((t) => h('option', { value: t.type }, `${evName(t.type)} (${t.n})`))); typesLoaded = true; }
    for (const e of r.events) {
      rowsBox.append(h('tr', {},
        h('td', {}, fmtDate(e.ts)),
        h('td', {}, e.email || (e.visitor ? 'khách ' + e.visitor.slice(0, 6) : '—'), e.user_id ? h('button', { type: 'button', class: 'ghost small', onclick: () => openUser(e.user_id) }, '›') : null),
        h('td', { class: e.ok ? null : 'bad' }, evName(e.type)), h('td', {}, e.channel), h('td', {}, e.path || ''),
        h('td', {}, e.ms != null ? num(e.ms) : ''), h('td', {}, e.cost ? money(e.cost) : ''), h('td', { class: 'data' }, e.data || '')));
    }
    last = r.events.length ? r.events[r.events.length - 1].id : last;
    more.hidden = r.events.length < 200;
  }
  const more = h('button', { type: 'button', class: 'ghost', onclick: () => load(false) }, 'Xem thêm');
  const reload = debounce(() => load(true), 400);
  const filter = (label, el) => h('label', {}, label, el);
  body.replaceChildren(card('Lọc nhật ký', 'Mọi thao tác của người dùng, máy dựng, Zalo, chi phí AI và lỗi đều được ghi lại.',
    h('div', { class: 'filters' },
      filter('Email', input(f.email, (v) => { f.email = v; reload(); }, { placeholder: 'một phần email' })), filter('Loại', typeSel),
      filter('Kênh', select([['', 'Mọi kênh'], ['web', 'Web'], ['zalo', 'Zalo'], ['runner', 'Máy dựng'], ['system', 'Hệ thống']], f.channel, (v) => { f.channel = v; load(true); })),
      filter('Kết quả', select([['', 'Tất cả'], ['0', 'Chỉ lỗi']], f.ok, (v) => { f.ok = v; load(true); })),
      filter('Tìm trong chi tiết', input(f.q, (v) => { f.q = v; reload(); })),
      filter('Từ ngày', input(f.from, (v) => { f.from = v; load(true); }, { type: 'date' })), filter('Đến ngày', input(f.to, (v) => { f.to = v; load(true); }, { type: 'date' })),
      h('a', { href: '#', class: 'pill', onclick: (e) => { e.preventDefault(); location.href = '/api/admin/events.csv?' + qs(); } }, 'Tải CSV'))),
    table(['Lúc', 'Ai', 'Việc', 'Kênh', 'Đường dẫn', 'ms', 'Chi phí', 'Chi tiết'], rowsBox), more);
  await load(true);
}

// ---------------------------------------------------------------- users
// links between tabs: remembered here, picked up once the target tab has loaded
let pendingUser = null, pendingLog = null;
function openUser(id) { pendingUser = id; location.hash = '#/admin/nguoi-dung'; }
async function adminUsers(body) {
  const r = await api('/api/admin/users');
  const detail = h('div', { id: 'userDetail' });
  let q = '';
  const tbody = h('tbody');
  const fill = () => tbody.replaceChildren(...r.users.filter((u) => !q || (u.email + ' ' + (u.name || '')).toLowerCase().includes(q)).map((u) => h('tr', {},
    h('td', {}, h('a', { href: '#', onclick: (e) => { e.preventDefault(); adminUserDetail(u.id); } }, u.email)), h('td', {}, u.name || ''),
    h('td', {}, u.plan || 'free'), h('td', {}, creditCell(u)), h('td', {}, num(u.projects)), h('td', {}, num(u.videos)), h('td', {}, num(u.today)), h('td', {}, money(u.cost)),
    h('td', {}, u.zalo ? '✓' : ''), h('td', {}, u.last_seen ? fmtDate(u.last_seen) : '—'), h('td', {}, fmtDate(u.created_at)),
    h('td', {}, u.blocked ? h('span', { class: 'bad' }, 'Đã khoá') : ''))));
  fill();
  const j = r.jobs7d || {};
  body.replaceChildren(detail, card('Người dùng', `${r.users.length} tài khoản · 7 ngày: ${j.done || 0} video xong, ${j.failed || 0} lỗi, ${(j.queued || 0) + (j.running || 0)} đang chờ/dựng.`,
    input('', (v) => { q = v.toLowerCase(); fill(); }, { placeholder: 'Tìm email hoặc tên' }),
    table(['Email', 'Tên', 'Gói', 'Credit phim TL', 'Dự án', 'Video', 'Lượt hôm nay', 'Chi phí', 'Zalo', 'Lần cuối', 'Tham gia', ''], tbody)));
  if (pendingUser) { const id = pendingUser; pendingUser = null; adminUserDetail(id); }
}
/** Documentary credits of a user, with a quick grant box (works in Beta, when nothing is sold). */
function creditCell(u) {
  const out = h('span', {}, num(u.credits || 0));
  const box = h('input', { type: 'number', value: 1, min: -1000, max: 1000, style: 'width:72px', 'aria-label': 'Số credit cấp thêm' });
  const go = h('button', { type: 'button', class: 'ghost small', onclick: async () => {
    try { const r = await api(`/api/admin/users/${encodeURIComponent(u.id)}/credits`, { method: 'POST', body: { delta: Number(box.value), note: 'cấp từ trang quản trị' } }); u.credits = r.balance; out.textContent = num(r.balance); toast('Đã cập nhật credit.'); } catch (e) { fail(e); }
  } }, 'Cấp');
  return h('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, out, box, go);
}
async function adminUserDetail(id) {
  const box = document.getElementById('userDetail');
  if (!box) return;
  const r = await api('/api/admin/users/' + encodeURIComponent(id));
  const plans = ui.plans?.length ? ui.plans : [{ id: 'free', name: 'Miễn phí' }];
  let grantPlan = plans[plans.length - 1]?.id, grantDays = 30;
  const blockBtn = h('button', { type: 'button', class: 'ghost small danger', onclick: async () => {
    const blocked = blockBtn.textContent === 'Khoá tài khoản';
    try { await api(`/api/admin/users/${encodeURIComponent(id)}/block`, { method: 'POST', body: { blocked } }); toast(blocked ? 'Đã khoá.' : 'Đã mở khoá.'); blockBtn.textContent = blocked ? 'Mở khoá' : 'Khoá tài khoản'; }
    catch (e) { fail(e); }
  } }, 'Khoá tài khoản');
  const events = r.events.map((e) => h('tr', {}, h('td', {}, fmtDate(e.ts)), h('td', { class: e.ok ? null : 'bad' }, evName(e.type)), h('td', {}, e.channel), h('td', {}, e.cost ? money(e.cost) : ''), h('td', { class: 'data' }, e.path ? e.path + ' ' : '', e.data || '')));
  box.replaceChildren(h('section', { class: 'card drawer' },
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('h2', {}, r.user.email), h('button', { type: 'button', class: 'ghost small', onclick: () => box.replaceChildren() }, 'Đóng')),
    h('p', { class: 'muted' }, `${r.user.name || ''} · tham gia ${fmtDate(r.user.created_at)} · ${num(r.totals.events)} thao tác · ${num(r.totals.errors)} lỗi · chi phí ${money(r.totals.cost)}`),
    h('p', {}, 'Gói hiện tại: ', h('b', {}, r.plan ? `${r.plan.plan} đến ${fmtDate(r.plan.expires_at)}` : 'Miễn phí')),
    h('div', { class: 'row' }, 'Cấp gói ', select(plans.map((p) => [p.id, p.name]), grantPlan, (v) => { grantPlan = v; }), ' trong ', input(grantDays, (v) => { grantDays = v; }, { type: 'number', min: 1, style: 'width:90px' }), ' ngày',
      h('button', { type: 'button', class: 'small', onclick: async () => { try { await api('/api/admin/grant', { method: 'POST', body: { user: id, plan: grantPlan, days: grantDays } }); toast('Đã cấp gói.'); adminUserDetail(id); } catch (e) { fail(e); } } }, 'Cấp'),
      blockBtn, h('button', { type: 'button', class: 'ghost small', onclick: () => { pendingLog = { user: id }; location.hash = '#/admin/nhat-ky'; } }, 'Xem toàn bộ nhật ký')),
    h('h3', {}, 'Video'), r.projects.length ? h('ul', {}, r.projects.map((p) => h('li', {}, p.title, h('small', { class: 'muted' }, ' · ' + fmtDate(p.updated_at))))) : h('p', { class: 'muted' }, 'Chưa có.'),
    h('h3', {}, 'Lần dựng'), r.jobs.length ? table(['Lúc', 'Trạng thái', 'Lỗi'], r.jobs.map((j) => h('tr', {}, h('td', {}, fmtDate(j.created_at)), h('td', {}, JOB_TEXT[j.status] || j.status), h('td', { class: 'bad' }, j.error || '')))) : h('p', { class: 'muted' }, 'Chưa có.'),
    h('h3', {}, 'Dòng thời gian (300 thao tác gần nhất)'), table(['Lúc', 'Việc', 'Kênh', 'Chi phí', 'Chi tiết'], events)));
  box.scrollIntoView({ behavior: 'smooth' });
}

// ---------------------------------------------------------------- orders
async function adminOrders(body) {
  const r = await api('/api/admin/orders');
  const act = (code, what) => async () => { try { await api(`/api/admin/orders/${code}/${what}`, { method: 'POST' }); toast('Đã cập nhật.'); adminOrders(body); } catch (e) { fail(e); } };
  body.replaceChildren(h('div', { class: 'stats' },
    h('div', { class: 'stat' }, h('small', {}, 'Doanh thu 30 ngày'), h('b', {}, money(r.last30.revenue)), h('small', {}, `${r.last30.paid} đơn`)),
    h('div', { class: 'stat' }, h('small', {}, 'Chi phí AI + giọng 30 ngày'), h('b', {}, money(r.last30.cost))),
    h('div', { class: 'stat' }, h('small', {}, 'Lãi gộp ước tính'), h('b', {}, money(r.last30.revenue - r.last30.cost)))),
    card('Đơn hàng', 'Đơn được kích hoạt tự động khi SePay báo tiền; có thể xác nhận tay nếu khách chuyển sai nội dung.',
      table(['Mã', 'Email', 'Gói', 'Số tiền', 'Trạng thái', 'Tạo lúc', 'Trả lúc', 'Qua', ''], r.orders.map((o) => h('tr', {},
        h('td', {}, h('code', {}, o.code)), h('td', {}, o.email || o.user_id), h('td', {}, o.plan), h('td', {}, money(o.amount)),
        h('td', { class: o.status === 'paid' ? 'ok' : o.status === 'pending' ? null : 'bad' }, { pending: 'Chờ', paid: 'Đã trả', cancelled: 'Huỷ', expired: 'Hết hạn' }[o.status] || o.status),
        h('td', {}, fmtDate(o.created_at)), h('td', {}, o.paid_at ? fmtDate(o.paid_at) : ''), h('td', {}, o.via || ''),
        h('td', {}, o.status === 'pending' ? [h('button', { type: 'button', class: 'small', onclick: act(o.code, 'confirm') }, 'Xác nhận đã trả'), h('button', { type: 'button', class: 'ghost small', onclick: act(o.code, 'cancel') }, 'Huỷ')] : null))))));
}

// ---------------------------------------------------------------- settings-based tabs
async function adminSettings(body, tab) {
  const [{ config, secrets }, zcheck, inbox] = await Promise.all([api('/api/admin/settings'), tab === 'zalo' ? api('/api/admin/zalo/check').catch(() => null) : null, tab === 'zalo' ? api('/api/admin/zalo/inbox') : null]);
  const c = structuredClone(config);
  const secretInput = {};
  const saveBtn = h('button', { type: 'button', 'data-ev': 'admin-save', onclick: async () => {
    saveBtn.disabled = true; saveBtn.textContent = 'Đang lưu…';
    try {
      await api('/api/admin/settings', { method: 'PUT', body: { config: c, secrets: secretInput } });
      me = await api('/api/me'); applyUI(me.ui);
      toast('Đã lưu cài đặt.');
      return adminSettings(body, tab);
    } catch (e) { fail(e); }
    saveBtn.disabled = false; saveBtn.textContent = 'Lưu cài đặt';
  } }, 'Lưu cài đặt');
  const sections = ({ goi: plansTab, zalo: zaloTab, 'hien-thi': visTab, 'noi-dung': contentTab, 'cai-dat': settingsTab }[tab] || settingsTab)(c, secrets, secretInput, zcheck, inbox);
  body.replaceChildren(...sections, h('div', { class: 'savebar' }, saveBtn));
}

function keysCard(secrets, secretInput, names) {
  const status = { admin: 'Đã nhập ở đây', env: 'Đang dùng khoá cài trên máy chủ', null: 'Chưa có' };
  return card('Khoá API', 'Khoá được mã hoá trước khi lưu và không bao giờ hiện lại. Để trống = giữ nguyên.',
    ...names.map((name) => {
      const [title, note] = SECRET_INFO[name], st = secrets[name];
      const clear = h('button', { type: 'button', class: 'ghost small', hidden: st !== 'admin', onclick: () => { secretInput[name] = null; clear.textContent = 'Sẽ xoá khi lưu'; clear.disabled = true; } }, 'Xoá khoá');
      return h('div', { class: 'keyrow' },
        h('label', {}, h('span', {}, h('strong', {}, title), ' ', h('span', { class: 'pill ' + (st ? 'done' : 'failed') }, status[st])), h('small', {}, note),
          h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: st ? '•••••••• (để trống = giữ nguyên)' : 'Dán khoá vào đây', oninput: (e) => { secretInput[name] = e.target.value; } })),
        clear);
    }));
}

function settingsTab(c, secrets, secretInput) {
  const voiceText = () => c.voices.map((v) => `${v.provider} | ${v.code} | ${v.label}`).join('\n');
  return [
    keysCard(secrets, secretInput, ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'EVERAI_API_KEY', 'GOOGLE_TTS_API_KEY', 'ELEVENLABS_API_KEY']),
    card('Mặc định khi tạo video', 'Người dùng vẫn đổi được từng video.', h('div', { class: 'grid' },
      h('label', {}, 'Cách tạo', select(Object.entries(c.labels.sources), c.defaults.source, (v) => { c.defaults.source = v; })),
      h('label', {}, 'AI viết kịch bản', select(Object.entries(c.labels.ai), c.defaults.textAI, (v) => { c.defaults.textAI = v; })),
      h('label', {}, 'AI vẽ ảnh', select(Object.entries(c.labels.ai), c.defaults.imageAI, (v) => { c.defaults.imageAI = v; })),
      h('label', {}, 'Phong cách', select(Object.entries(c.labels.styles), c.defaults.style, (v) => { c.defaults.style = v; })),
      h('label', {}, 'Kiểu hình', select(Object.entries(c.labels.visual), c.defaults.visual, (v) => { c.defaults.visual = v; })),
      h('label', {}, 'Khung hình', select([['9:16', 'Dọc 9:16'], ['16:9', 'Ngang 16:9']], c.defaults.ratio, (v) => { c.defaults.ratio = v; })),
      h('label', {}, 'Định dạng video mặc định', select(Object.entries(c.labels.looks).filter(([k]) => k !== 'doc'), c.defaults.look, (v) => { c.defaults.look = v; })),
      h('label', {}, 'Kiểu vẽ tay cổ điển', select(Object.entries(c.labels.modes), c.defaults.mode, (v) => { c.defaults.mode = v; })),
      h('label', {}, 'Thời lượng mặc định (giây)', input(c.defaults.seconds, (v) => { c.defaults.seconds = v; }, { type: 'number', min: 15, max: 1800 })),
      h('label', {}, 'Giọng đọc', select(c.voices.map((v) => [v.code, v.label]), c.defaults.voice, (v) => { c.defaults.voice = v; })),
      h('label', {}, 'Tên kênh', input(c.defaults.channel, (v) => { c.defaults.channel = v; }, { maxlength: 40 })),
      h('label', {}, 'Giọng văn', input(c.defaults.tone, (v) => { c.defaults.tone = v; }, { maxlength: 200 })),
      check(c.defaults.subtitles, (v) => { c.defaults.subtitles = v; }, 'Phụ đề trên hình'),
      check(c.defaults.intro, (v) => { c.defaults.intro = v; }, 'Mở đầu bằng ảnh bìa (thumbnail)'))),
    card('Giới hạn chung', 'Video dài nhất mà hệ thống cho làm (gói cước có thể cho ít hơn). Ước tính theo số chữ của kịch bản.', h('div', { class: 'grid' },
      h('label', {}, 'Độ dài tối đa (phút)', select([[60, '1 phút'], [120, '2 phút'], [180, '3 phút'], [300, '5 phút'], [420, '7 phút'], [600, '10 phút'], [900, '15 phút'], [1200, '20 phút'], [1800, '30 phút']].map(([v, l]) => [String(v), l]), String(c.limits.maxSeconds), (v) => { c.limits.maxSeconds = Number(v); })))),
    card('Đăng nhập Google', null,
      h('label', {}, 'Cách mở Google', select([['auto', 'Tự động (khuyên dùng): chuyển trang khi là app cài trên màn hình chính hoặc trình duyệt trong Zalo/Facebook'], ['redirect', 'Luôn chuyển trang (ổn định nhất)'], ['popup', 'Luôn cửa sổ bật lên']], c.auth.google, (v) => { c.auth.google = v; })),
      h('p', { class: 'muted' }, 'Để kiểu chuyển trang hoạt động, vào Google Cloud Console → APIs & Services → Credentials → OAuth client (Web) → Authorized redirect URIs, thêm đúng địa chỉ: ', h('code', {}, location.origin + '/api/auth/google/callback'))),
    card('Danh sách giọng đọc', 'Mỗi dòng: nhà cung cấp | mã giọng | tên hiển thị. Nhà cung cấp: everai, google, elevenlabs, free (miễn phí, không cần khoá). Giọng trả phí lỗi sẽ tự chuyển sang giọng miễn phí.',
      area(voiceText(), (v) => { c.voices = v.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p.length >= 2 && p[1]).map(([provider, code, label]) => ({ provider, code, label: label || code })); }, 10)),
    card('Model AI', 'Model dự phòng được thử lần lượt khi model chính lỗi hoặc quá tải; hết model thì chuyển sang nhà cung cấp còn lại.', h('div', { class: 'grid' },
      h('label', {}, 'OpenAI viết', input(c.models.openaiText, (v) => { c.models.openaiText = v; })),
      h('label', {}, 'OpenAI dự phòng', input(c.models.openaiFallback, (v) => { c.models.openaiFallback = v; })),
      h('label', {}, 'OpenAI vẽ', input(c.models.openaiImage, (v) => { c.models.openaiImage = v; })),
      h('label', {}, 'Chất lượng ảnh OpenAI', select([['low', 'Thấp (rẻ nhất)'], ['medium', 'Vừa'], ['high', 'Cao']], c.models.openaiImageQuality, (v) => { c.models.openaiImageQuality = v; })),
      h('label', {}, 'Gemini viết', input(c.models.geminiText, (v) => { c.models.geminiText = v; })),
      h('label', {}, 'Gemini dự phòng', input(c.models.geminiFallback, (v) => { c.models.geminiFallback = v; })),
      h('label', {}, 'Gemini vẽ', input(c.models.geminiImage, (v) => { c.models.geminiImage = v; }))),
      h('label', {}, 'Lời dặn thêm cho AI viết kịch bản (áp dụng mọi video)', area(c.promptExtra, (v) => { c.promptExtra = v; }, 3))),
    budgetCard(c),
    card('Bảng giá vốn', 'Dùng để ghi chi phí từng lần gọi AI và giọng đọc vào nhật ký. Model: "tên-model: giá vào, giá ra" (USD / 1 triệu token), "*" = mặc định.',
      h('div', { class: 'grid' },
        h('label', {}, 'Tỷ giá USD → VND', input(c.costs.usdVnd, (v) => { c.costs.usdVnd = v; }, { type: 'number' })),
        h('label', {}, 'Ảnh OpenAI (USD/ảnh)', input(c.costs.imageOpenai, (v) => { c.costs.imageOpenai = v; }, { type: 'number', step: '0.001' })),
        h('label', {}, 'Ảnh Gemini (USD/ảnh)', input(c.costs.imageGemini, (v) => { c.costs.imageGemini = v; }, { type: 'number', step: '0.001' })),
        h('label', {}, 'EverAI (VND / 1000 ký tự)', input(c.costs.everaiPer1000, (v) => { c.costs.everaiPer1000 = v; }, { type: 'number' })),
        h('label', {}, 'Google TTS (USD / 1 triệu ký tự)', input(c.costs.googleTtsPerM, (v) => { c.costs.googleTtsPerM = v; }, { type: 'number' })),
        h('label', {}, 'ElevenLabs (USD / 1000 ký tự)', input(c.costs.elevenPer1000, (v) => { c.costs.elevenPer1000 = v; }, { type: 'number', step: '0.01' }))),
      area(Object.entries(c.costs.models).map(([k, [a, b]]) => `${k}: ${a}, ${b}`).join('\n'), (v) => {
        const m = {}; for (const l of v.split('\n')) { const x = l.match(/^\s*([^:]+):\s*([\d.]+)\s*,\s*([\d.]+)/); if (x) m[x[1].trim()] = [Number(x[2]), Number(x[3])]; }
        c.costs.models = m;
      }, 8)),
    card('Quản trị viên và nhật ký', null,
      h('label', {}, 'Email quản trị viên (mỗi dòng một email; để trống = dùng ADMIN_EMAIL trên máy chủ)', area(c.admins.join('\n'), (v) => { c.admins = v.split(/[\s,]+/).filter(Boolean); }, 3)),
      h('label', {}, 'Giữ nhật ký (ngày)', input(c.logDays, (v) => { c.logDays = v; }, { type: 'number', min: 7, max: 3650 }))),
  ];
}

function plansTab(c, secrets, secretInput) {
  const planCard = (p, i) => h('section', { class: 'card' },
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, p.name || 'Gói mới'),
      p.price ? h('button', { type: 'button', class: 'ghost small danger', onclick: () => { c.plans.splice(i, 1); toast('Đã bỏ gói, bấm Lưu để áp dụng.'); } }, 'Bỏ gói') : h('small', { class: 'muted' }, 'Gói miễn phí (bắt buộc có)')),
    h('div', { class: 'grid' },
      h('label', {}, 'Mã', input(p.id, (v) => { p.id = v; }, { maxlength: 20 })), h('label', {}, 'Tên', input(p.name, (v) => { p.name = v; }, { maxlength: 40 })),
      h('label', {}, 'Giá (VND)', input(p.price, (v) => { p.price = v; }, { type: 'number', min: 0 })), h('label', {}, 'Số ngày', input(p.days, (v) => { p.days = v; }, { type: 'number', min: 0 })),
      h('label', {}, 'Video / ngày', input(p.limits.render, (v) => { p.limits.render = v; }, { type: 'number', min: 0 })),
      h('label', {}, 'AI viết / ngày', input(p.limits.script, (v) => { p.limits.script = v; }, { type: 'number', min: 0 })),
      h('label', {}, 'Ảnh AI / ngày', input(p.limits.image, (v) => { p.limits.image = v; }, { type: 'number', min: 0 })),
      h('label', {}, 'Video dài tối đa (giây)', input(p.maxSeconds, (v) => { p.maxSeconds = v; }, { type: 'number', min: 15 })),
      check(p.visible, (v) => { p.visible = v; }, 'Hiện cho người dùng'), check(p.highlight, (v) => { p.highlight = v; }, 'Nổi bật'), check(p.zalo, (v) => { p.zalo = v; }, 'Dùng Zalo')),
    h('label', {}, 'Mô tả', input(p.desc, (v) => { p.desc = v; }, { maxlength: 200 })),
    h('label', {}, 'Phim tài liệu AI kèm theo mỗi tháng (gói VIP; 0 = phải dùng credit)', input(p.docPerMonth || 0, (v) => { p.docPerMonth = v; }, { type: 'number', min: 0, max: 1000 })),
    h('label', {}, 'Điểm nổi bật (mỗi dòng một ý)', area(p.features.join('\n'), (v) => { p.features = v.split('\n').map((x) => x.trim()).filter(Boolean); }, 3)),
    h('label', {}, 'Phong cách được dùng (để trống = tất cả)', input(p.styles === 'all' ? '' : p.styles.join(', '), (v) => { p.styles = v.trim() ? v.split(/[\s,]+/).filter(Boolean) : 'all'; }, { placeholder: Object.keys(c.labels.styles).join(', ') })),
    h('label', {}, 'Cách tạo được dùng (để trống = tất cả)', input(p.sources === 'all' ? '' : p.sources.join(', '), (v) => { p.sources = v.trim() ? v.split(/[\s,]+/).filter(Boolean) : 'all'; }, { placeholder: 'topic, mine-ai, mine-free' })),
    h('label', {}, 'Mã giọng được dùng (để trống = tất cả)', input(p.voices === 'all' ? '' : p.voices.join(', '), (v) => { p.voices = v.trim() ? v.split(/[\s,]+/).filter(Boolean) : 'all'; }, { placeholder: 'free-female, vi_female_thuytrang_mb' })));
  return [
    card('Thanh toán chuyển khoản', 'Người dùng quét mã VietQR; nội dung chuyển khoản là mã đơn. Cài SePay (sepay.vn) gọi webhook bên dưới để đơn tự kích hoạt.',
      h('div', { class: 'grid' },
        check(c.payment.enabled, (v) => { c.payment.enabled = v; }, 'Mở thanh toán'),
        h('label', {}, 'Giữ mã QR (phút, đếm ngược)', input(c.payment.holdMinutes, (v) => { c.payment.holdMinutes = v; }, { type: 'number', min: 3, max: 120 })),
        h('label', {}, 'Số tài khoản', input(c.payment.account, (v) => { c.payment.account = v; })),
        h('label', {}, 'Tên chủ tài khoản', input(c.payment.accountName, (v) => { c.payment.accountName = v; })),
        h('label', {}, 'Tiền tố mã đơn', input(c.payment.prefix, (v) => { c.payment.prefix = v.toUpperCase(); }, { maxlength: 4 })),
        h('label', {}, 'Đơn hết hạn sau (ngày)', input(c.payment.expiryDays, (v) => { c.payment.expiryDays = v; }, { type: 'number', min: 1 }))),
      bankPicker(c.payment),
      h('label', {}, 'Ghi chú hiện dưới mã QR', input(c.payment.note, (v) => { c.payment.note = v; }, { maxlength: 300 })),
      h('p', { class: 'muted' }, 'Webhook SePay: ', h('code', {}, location.origin + '/api/sepay/webhook'), ' · Kiểu xác thực: API Key.')),
    keysCard(secrets, secretInput, ['SEPAY_API_KEY']),
    card('Các gói', 'Giới hạn tính theo ngày. Phong cách/giọng/cách tạo ngoài gói sẽ hiện thông báo nâng cấp đúng gói cần mua.',
      h('button', { type: 'button', class: 'ghost small', onclick: (e) => { c.plans.push({ id: 'goi' + (c.plans.length + 1), name: 'Gói mới', price: 99000, days: 30, visible: true, highlight: false, desc: '', features: [], limits: { script: 10, image: 20, render: 5 }, styles: 'all', sources: 'all', voices: 'all', zalo: true, maxSeconds: 180, docPerMonth: 0 }); e.target.closest('.card').after(planCard(c.plans[c.plans.length - 1], c.plans.length - 1)); } }, '+ Thêm gói')),
    ...c.plans.map(planCard),
    docCard(c),
  ];
}

/** Pick the receiving bank by name and logo (the BIN behind it goes into the QR code). */
function bankPicker(pay) {
  const cur = h('div', { class: 'bankrow' });
  const paintCur = () => { const b = bankOf(pay.bank); cur.replaceChildren(bankLogo(b, 40), h('div', {}, h('b', {}, b.name), h('small', { class: 'muted' }, 'Mã BIN ' + b.bin))); };
  const q = h('input', { type: 'search', placeholder: 'Tìm ngân hàng…', oninput: () => paint() });
  const grid = h('div', { class: 'banks' });
  const paint = () => {
    const k = q.value.trim().toLowerCase();
    grid.replaceChildren(...BANKS.filter((b) => !k || (b.name + ' ' + b.code).toLowerCase().includes(k)).map((b) => h('button', { type: 'button', class: 'bankopt' + (b.bin === pay.bank ? ' on' : ''), onclick: () => { pay.bank = b.bin; paintCur(); paint(); } }, bankLogo(b, 28), b.name)));
  };
  paintCur(); paint();
  return h('div', { class: 'photo' }, h('span', { class: 'plabel' }, 'Ngân hàng nhận tiền'), cur, q, grid);
}

// ---------------------------------------------------------------- community moderation
async function adminCommunity(body) {
  const { videos } = await api('/api/admin/community');
  const act = (v, a) => h('button', { type: 'button', class: 'ghost small' + (a === 'delete' ? ' danger' : ''), onclick: async () => {
    if (a === 'delete' && !confirm('Gỡ video này khỏi cộng đồng?')) return;
    try { await api(`/api/admin/community/${v.job_id}/${a}`, { method: 'POST' }); toast('Đã cập nhật.'); adminCommunity(body); } catch (e) { fail(e); }
  } }, { hide: 'Ẩn', show: 'Hiện lại', delete: 'Gỡ' }[a]);
  body.replaceChildren(card('Video cộng đồng', `${videos.length} video người dùng đã chia sẻ. Ẩn video vi phạm; người dùng không thấy video bị ẩn. Bật/tắt cả mục ở tab Hiển thị → Tính năng → Cộng đồng.`,
    videos.length ? table(['Lúc', 'Tiêu đề', 'Người đăng', 'Kiểu', '♥', 'Lượt xem', 'Trạng thái', ''], videos.map((v) => h('tr', {},
      h('td', {}, fmtDate(v.created_at)), h('td', {}, h('a', { href: `/api/admin/community/video?job=${v.job_id}`, target: '_blank' }, v.title)), h('td', {}, v.email || v.author || ''),
      h('td', {}, (ui.labels.modes?.[v.mode] || v.mode || '') + ' · ' + (ui.labels.styles?.[v.style] || v.style || '')), h('td', {}, num(v.likes)), h('td', {}, num(v.views)),
      h('td', { class: v.hidden ? 'bad' : 'ok' }, v.hidden ? 'Đang ẩn' : 'Đang hiện'),
      h('td', {}, h('div', { class: 'row' }, act(v, v.hidden ? 'show' : 'hide'), act(v, 'delete'))))))
      : h('p', { class: 'muted' }, 'Chưa có video nào.')));
}

function docCard(c) {
  const list = h('div', { class: 'scenes' });
  const draw = () => list.replaceChildren(...c.doc.packs.map((p, i) => h('div', { class: 'grid wide' },
    h('label', {}, 'Tên gói', input(p.name, (v) => { p.name = v; }, { maxlength: 40 })),
    h('label', {}, 'Số credit', input(p.credits, (v) => { p.credits = v; }, { type: 'number', min: 1 })),
    h('label', {}, 'Giá (VND)', input(p.price, (v) => { p.price = v; }, { type: 'number', min: 1000, step: 1000 })),
    h('button', { type: 'button', class: 'ghost small danger', onclick: () => { c.doc.packs.splice(i, 1); draw(); } }, 'Bỏ gói'))));
  draw();
  const costEach = Math.round(c.doc.imagesPerVideo * 0.7 * c.costs.imageGemini * c.costs.usdVnd + 900 * c.costs.everaiPer1000 / 1000);
  return card('Phim tài liệu AI: credit', `Mỗi phim tài liệu trừ credit trước khi gọi AI, kèm một số lượt vẽ ảnh (cả vẽ lại). Ước tính giá vốn một video ~${costEach.toLocaleString('vi-VN')}đ (theo bảng giá vốn, ~70% lượt ảnh được dùng). Đặt giá gói cao hơn mức này để không lỗ. Trong bản Beta, gói credit không hiện cho khách; cấp credit ở trang Người dùng.`,
    h('div', { class: 'grid wide' },
      h('label', {}, 'Credit cho một video', input(c.doc.creditsPerVideo, (v) => { c.doc.creditsPerVideo = v; }, { type: 'number', min: 1, max: 100 })),
      h('label', {}, 'Lượt vẽ ảnh cho một video', input(c.doc.imagesPerVideo, (v) => { c.doc.imagesPerVideo = v; }, { type: 'number', min: 4, max: 60 }))),
    h('h3', {}, 'Gói credit bán lẻ'), list,
    h('button', { type: 'button', class: 'ghost small', onclick: () => { c.doc.packs.push({ id: 'doc' + Date.now().toString(36).slice(-4), name: 'Gói mới', credits: 3, price: 79000 }); draw(); } }, '+ Thêm gói credit'));
}
function musicCard(c) {
  const list = h('div', { class: 'scenes' });
  const draw = () => list.replaceChildren(...c.music.map((m, i) => h('div', { class: 'grid wide' },
    h('label', {}, 'Tên bản nhạc', input(m.title, (v) => { m.title = v; }, { maxlength: 50 })),
    mediaField('Tệp MP3/M4A', m.file, (v) => { m.file = v; }, 'audio/mpeg,audio/mp4,audio/x-m4a'),
    h('button', { type: 'button', class: 'ghost small danger', onclick: () => { c.music.splice(i, 1); draw(); } }, 'Bỏ'))));
  draw();
  return card('Nhạc nền', 'Nhạc tự hạ âm lượng khi có giọng đọc. Chỉ tải nhạc bạn có quyền dùng thương mại (nhạc tự sáng tác, mua bản quyền hoặc CC0). "Tự chọn" lấy một bản theo nội dung video.',
    h('label', {}, 'Mặc định khi tạo video', select([['auto', 'Tự chọn trong thư viện'], ['none', 'Không nhạc'], ...c.music.map((m) => [m.id, m.title])], c.defaults.music, (v) => { c.defaults.music = v; })),
    list, h('button', { type: 'button', class: 'ghost small', onclick: () => { c.music.push({ id: 'nhac-' + Date.now().toString(36).slice(-5), title: '', file: '' }); draw(); } }, '+ Thêm bản nhạc'));
}

function zaloTab(c, secrets, secretInput, zcheck, inbox) {
  const z = c.zalo;
  const action = (label, fn) => h('button', { type: 'button', class: 'ghost small', onclick: async (event) => { const button = event.currentTarget; button.disabled = true; try { await fn(); } catch (e) { fail(e); } finally { button.disabled = false; } } }, label);
  const out = h('div');
  const tplNames = { help: 'Hướng dẫn (HUONGDAN)', linked: 'Khi kết nối xong', queued: 'Khi nhận yêu cầu dựng', done: 'Khi video xong', failed: 'Khi dựng lỗi', unknown: 'Khi không hiểu tin nhắn', noAI: 'Khi chưa có AI (lệnh TAO)' };
  return [
    card('Kiểm tra kết nối', 'Làm lần lượt từ trên xuống. Lưu cài đặt trước khi bấm Kết nối webhook.',
      zcheck ? h('ul', {}, zcheck.steps.map((s) => h('li', { class: s.ok ? 'ok' : 'bad' }, (s.ok ? '✓ ' : '✗ ') + s.k, s.detail ? h('small', { class: 'muted' }, ' — ' + s.detail) : null, !s.ok ? h('div', { class: 'muted' }, '→ ' + s.fix) : null))) : null,
      zcheck ? h('p', { class: 'muted' }, `${zcheck.links?.n || 0} người đã kết nối (${zcheck.links?.guests || 0} chỉ dùng Zalo).`) : null,
      h('div', { class: 'row' },
        action('Kiểm tra lại', async () => { const check = await api('/api/admin/zalo/check'); out.replaceChildren(h('ul', {}, check.steps.map((step) => h('li', { class: step.ok ? 'ok' : 'bad' }, (step.ok ? '✓ ' : '✗ ') + step.k, h('p', { class: 'muted' }, step.detail || step.fix || ''))))); }),
        action('Kết nối webhook', async () => { const r = await api('/api/admin/zalo/connect', { method: 'POST' }); out.replaceChildren(h('p', {}, '✓ Webhook trỏ về: ', h('b', {}, r.url)), r.before && r.before !== r.url ? h('p', { class: 'muted' }, 'Trước đó bot trỏ về: ' + r.before + ' (đã chuyển sang web này).') : null, h('p', { class: 'muted' }, 'Giờ nhắn GIUP cho bot rồi bấm Kiểm tra lại.')); }),
        action('Mô phỏng tin "GIUP"', async () => { const r = await api('/api/admin/zalo/simulate', { method: 'POST', body: { text: 'GIUP' } }); out.replaceChildren(h('p', { class: r.ok ? 'ok' : 'bad' }, r.ok ? '✓ Bot xử lý và gửi phản hồi về Zalo chủ web thành công. Nếu khách vẫn không nhận được, lỗi nằm ở chiều Zalo → web (webhook/sự kiện/Cloudflare).' : '✗ Gửi phản hồi lỗi: ' + (r.reply?.error || 'không rõ'))); }),
        action('Tạo mã chủ web', async () => { const r = await api('/api/admin/zalo/owner-code', { method: 'POST' }); out.replaceChildren('Gửi cho bot: ', h('b', { class: 'memo' }, r.command), ` (hạn ${r.expiresMin} phút)`); }),
        action('Gửi tin thử cho chủ web', async () => { await api('/api/admin/zalo/test', { method: 'POST' }); toast('Đã gửi.'); })),
      out,
      zcheck?.last?.length ? h('details', {}, h('summary', {}, 'Hoạt động Zalo gần đây'), table(['Lúc', 'Kết quả', 'Chi tiết'], zcheck.last.map((e) => h('tr', {}, h('td', {}, fmtDate(e.ts)), h('td', { class: e.ok ? 'ok' : 'bad' }, e.ok ? 'OK' : 'Lỗi'), h('td', { class: 'data' }, e.data || ''))))) : null),
    zaloInboxCard(inbox),
    keysCard(secrets, secretInput, ['ZALO_BOT_TOKEN']),
    card('Cài đặt Zalo', null, h('div', { class: 'grid' },
      check(z.enabled, (v) => { z.enabled = v; }, 'Bật tạo video qua Zalo'),
      check(z.allowGuests, (v) => { z.allowGuests = v; }, 'Cho người chưa có tài khoản web dùng ngay'),
      check(z.autoRender, (v) => { z.autoRender = v; }, 'Tự dựng video ngay (không chờ sửa trên web)'),
      h('label', {}, 'Kịch bản gửi qua Zalo được minh hoạ bằng', select([['mine-free', 'Luật tự động (miễn phí)'], ['mine-ai', 'AI (tốn lượt)']], z.scriptSource, (v) => { z.scriptSource = v; })),
      h('label', {}, 'Đường dẫn bot (https://zalo.me/…)', input(z.botLink, (v) => { z.botLink = v.trim(); }))),
      h('h3', {}, 'Báo cho chủ web qua Zalo'),
      h('div', { class: 'grid' },
        check(z.notifyOwner.signup, (v) => { z.notifyOwner.signup = v; }, 'Người dùng mới qua Zalo'), check(z.notifyOwner.failed, (v) => { z.notifyOwner.failed = v; }, 'Video dựng lỗi'),
        check(z.notifyOwner.order, (v) => { z.notifyOwner.order = v; }, 'Đơn hàng và thanh toán'))),
    card('Mẫu tin nhắn', 'Biến dùng được: {ten} {email} {tieuDe} {canh} {dang} {hangCho} {suaWeb} {link} {hanNgay} {giay} {loi}.',
      ...Object.keys(z.templates).map((k) => h('label', {}, tplNames[k] || k, area(z.templates[k], (v) => { z.templates[k] = v; }, k === 'help' ? 9 : 3)))),
  ];
}

function visTab(c) {
  const row = (key, label) => h('div', { class: 'vis' }, h('span', {}, label), select(Object.entries(VIS_NAMES), c.visibility[key] || 'on', (v) => { if (v === 'on') delete c.visibility[key]; else c.visibility[key] = v; }));
  const group = (title, entries) => h('details', { open: true }, h('summary', {}, title), ...entries.map(([k, label]) => row(k, label)));
  const FEATURES = { zalo: 'Tạo video qua Zalo', imageAI: 'Tranh AI cho cảnh', duplicate: 'Nhân bản video', cover: 'Tải ảnh bìa', templates: 'Kịch bản mẫu', subtitles: 'Bật phụ đề trên hình', speed: 'Chỉnh tốc độ đọc', srt: 'Tải phụ đề SRT', plans: 'Gói cước & nâng cấp', music: 'Nhạc nền',
    intro: 'Mở đầu là ảnh bìa (thumbnail)', character: 'Nhân vật tham chiếu (ảnh thật)', affiliate: 'Tiếp thị liên kết (ảnh SP + QR)', community: 'Cộng đồng', platform: 'Xem như TikTok / Reels / Shorts / YouTube' };
  return [
    card('Hiển thị tuỳ chọn', '"Đang phát triển" = người dùng thấy nhưng không chọn được (có nhãn đang phát triển). "Ẩn" = không thấy. Áp dụng cả trên web và Zalo.',
      group('Tính năng', Object.entries(FEATURES).map(([k, v]) => ['feature:' + k, v])),
      group('Định dạng video (mới)', Object.entries(c.labels.looks).map(([k, v]) => ['look:' + k, v])),
      group('Kiểu vẽ tay cổ điển', Object.entries(c.labels.modes).map(([k, v]) => ['mode:' + k, v])),
      group('Cách tạo video', Object.entries(c.labels.sources).map(([k, v]) => ['source:' + k, v])),
      group('Phong cách', Object.entries(c.labels.styles).map(([k, v]) => ['style:' + k, v])),
      group('Kiểu hình', Object.entries(c.labels.visual).map(([k, v]) => ['visual:' + k, v])),
      group('Khung hình', [['ratio:9:16', 'Dọc 9:16'], ['ratio:16:9', 'Ngang 16:9']]),
      group('Kiểu sơ đồ', Object.entries(c.labels.kinds).map(([k, v]) => ['kind:' + k, v])),
      group('Dụng cụ vẽ', Object.entries(c.labels.tools).map(([k, v]) => ['tool:' + k, v])),
      group('AI', Object.entries(c.labels.ai).map(([k, v]) => ['ai:' + k, v])),
      group('Giọng đọc', c.voices.map((v) => ['voice:' + v.code, v.label]))),
  ];
}

/** A home page picture/video: paste an https address or upload a file (stored as "site:…"). */
function mediaField(label, value, onChange, accept = 'image/png,image/jpeg,image/webp,video/mp4,video/webm') {
  const preview = h('div', { class: 'media-preview' });
  const paint = (v) => {
    const url = siteUrl(v);
    preview.replaceChildren(!v ? h('span', { class: 'muted' }, 'Chưa có') : /\.(mp4|webm)$/i.test(v) ? h('video', { src: url, muted: true, controls: true, preload: 'metadata' }) : h('img', { src: url, alt: '' }));
  };
  const box = input(value, (v) => { onChange(v.trim()); paint(v.trim()); }, { placeholder: 'https://… hoặc bấm Tải lên' });
  const file = h('input', { type: 'file', accept, hidden: true, onchange: async () => {
    const f = file.files[0]; if (!f) return;
    try {
      toast('Đang tải lên…');
      const res = await fetch('/api/admin/site-media', { method: 'POST', credentials: 'same-origin', headers: { 'x-nv': '1', 'content-type': f.type }, body: f });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không tải lên được.');
      box.value = data.ref; onChange(data.ref); paint(data.ref); toast('Đã tải lên. Bấm Lưu cài đặt để áp dụng.');
    } catch (e) { fail(e); }
    file.value = '';
  } });
  paint(value);
  return h('div', { class: 'mediafield' }, h('label', {}, label, box), h('div', { class: 'row' },
    h('button', { type: 'button', class: 'ghost small', onclick: () => file.click() }, 'Tải lên'),
    h('button', { type: 'button', class: 'ghost small', onclick: () => { box.value = ''; onChange(''); paint(''); } }, 'Bỏ')), preview, file);
}

function siteCard(c) {
  const list = h('div', { class: 'scenes' });
  const draw = () => list.replaceChildren(...c.site.showcase.map((m, i) => h('div', { class: 'scene' },
    h('div', { class: 'grid wide' }, h('label', {}, 'Tiêu đề', input(m.title, (v) => { m.title = v; }, { maxlength: 60 })), h('label', {}, 'Mô tả ngắn', input(m.caption, (v) => { m.caption = v; }, { maxlength: 120 }))),
    h('div', { class: 'grid wide' }, mediaField('Video (MP4/WebM, dọc 9:16)', m.video, (v) => { m.video = v; }, 'video/mp4,video/webm'), mediaField('Ảnh bìa (poster)', m.poster, (v) => { m.poster = v; }, 'image/png,image/jpeg,image/webp')),
    h('div', { class: 'row' },
      i > 0 ? h('button', { type: 'button', class: 'ghost small', onclick: () => { c.site.showcase.splice(i - 1, 0, c.site.showcase.splice(i, 1)[0]); draw(); } }, '↑ Lên') : null,
      h('button', { type: 'button', class: 'ghost small danger', onclick: () => { c.site.showcase.splice(i, 1); draw(); } }, 'Bỏ video')))));
  draw();
  return card('Trang chủ: hình và video mẫu', 'Ảnh/video cạnh tiêu đề và danh sách video mẫu. Để trống thì trang chủ tự vẽ demo trực tiếp. Tệp tải lên tối đa 60 MB; video nên dưới 10 MB, H.264, dọc 9:16 để tải nhanh.',
    h('div', { class: 'grid wide' },
      h('label', {}, 'Tiêu đề lớn', input(c.site.heroTitle, (v) => { c.site.heroTitle = v; }, { maxlength: 120 })),
      h('label', {}, 'Đoạn giới thiệu', input(c.site.heroText, (v) => { c.site.heroText = v; }, { maxlength: 300 }))),
    h('div', { class: 'grid wide' }, mediaField('Ảnh hoặc video cạnh tiêu đề', c.site.heroMedia, (v) => { c.site.heroMedia = v; }), mediaField('Ảnh chờ cho video (poster)', c.site.heroPoster, (v) => { c.site.heroPoster = v; }, 'image/png,image/jpeg,image/webp')),
    h('h3', {}, 'Video mẫu'), list,
    h('button', { type: 'button', class: 'ghost small', onclick: () => { if (c.site.showcase.length >= 12) return toast('Tối đa 12 video.'); c.site.showcase.push({ title: '', caption: '', video: '', poster: '' }); draw(); } }, '+ Thêm video mẫu'));
}

function budgetCard(c) {
  const status = h('div', { class: 'budget-status' }, 'Đang đọc chi tiêu…');
  api('/api/admin/budget').then((b) => {
    const bar = (used, cap, label) => { const pct = cap ? Math.min(100, Math.round(used / cap * 100)) : 0; return h('div', {}, h('div', { class: 'row' }, h('b', {}, label), h('span', { class: pct >= 100 ? 'bad' : pct >= c.budget.warnPct ? 'warn' : 'muted' }, `${money(used)} / ${cap ? money(cap) : 'không giới hạn'}${cap ? ` (${pct}%)` : ''}`)), h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` }))); };
    status.replaceChildren(bar(b.day, c.budget.dailyVnd, 'Hôm nay'), bar(b.month, c.budget.monthlyVnd, 'Tháng này'),
      b.over ? h('p', { class: 'bad' }, '⚠ Đã chạm trần: AI viết/vẽ và giọng trả phí đang tạm chuyển sang cách miễn phí.') : null,
      b.top?.length ? h('details', {}, h('summary', {}, 'Tốn nhiều nhất 30 ngày'), table(['Loại', 'Lượt', 'Chi phí'], b.top.map((r) => h('tr', {}, h('td', {}, r.type), h('td', {}, num(r.n)), h('td', {}, money(r.cost)))))) : null);
  }).catch((e) => status.replaceChildren(h('span', { class: 'bad' }, e.message)));
  return card('Trần chi phí', 'Tính từ chi phí đã ghi trong nhật ký (AI viết, ảnh AI, giọng trả phí). Khi chạm trần, hệ thống tự dùng cách miễn phí (tự minh hoạ theo luật, giọng cơ bản) thay vì báo lỗi. 0 = không giới hạn.',
    status,
    h('div', { class: 'grid wide' },
      h('label', {}, 'Trần mỗi ngày (VND)', input(c.budget.dailyVnd, (v) => { c.budget.dailyVnd = v; }, { type: 'number', min: 0, step: 10000 })),
      h('label', {}, 'Trần mỗi tháng (VND)', input(c.budget.monthlyVnd, (v) => { c.budget.monthlyVnd = v; }, { type: 'number', min: 0, step: 100000 })),
      h('label', {}, 'Cảnh báo khi đạt (%)', input(c.budget.warnPct, (v) => { c.budget.warnPct = v; }, { type: 'number', min: 10, max: 100 })),
      h('label', {}, 'Chi phí tối đa một video (VND)', input(c.budget.perVideoVnd, (v) => { c.budget.perVideoVnd = v; }, { type: 'number', min: 0, step: 1000 }))));
}

function contentTab(c) {
  const LABEL_GROUPS = [['looks', 'Định dạng video'], ['lookNotes', 'Mô tả định dạng'], ['modes', 'Kiểu vẽ tay cổ điển'], ['styles', 'Phong cách vẽ'], ['tools', 'Dụng cụ vẽ'], ['kinds', 'Kiểu sơ đồ'], ['visual', 'Kiểu hình'], ['actions', 'Động tác người que'], ['ai', 'Nhà cung cấp AI'], ['sources', 'Cách tạo video']];
  const tplList = h('div', { class: 'scenes' });
  const drawTpls = () => tplList.replaceChildren(...c.templates.map((t, i) => h('div', { class: 'scene' },
    h('div', { class: 'grid' }, h('label', {}, 'Tên mẫu', input(t.title, (v) => { t.title = v; })), h('label', {}, 'Mã', input(t.id, (v) => { t.id = v; })),
      h('button', { type: 'button', class: 'ghost small danger', onclick: () => { c.templates.splice(i, 1); drawTpls(); } }, 'Bỏ mẫu')),
    h('label', {}, 'Kịch bản (mỗi đoạn cách nhau một dòng trống = một cảnh)', area(t.text, (v) => { t.text = v; }, 6)))));
  drawTpls();
  return [
    card('Thương hiệu', null, h('div', { class: 'grid' },
      h('label', {}, 'Tên trang', input(c.brand.name, (v) => { c.brand.name = v; }, { maxlength: 40 })),
      h('label', {}, 'Chữ nổi bật sau tên', input(c.brand.accent, (v) => { c.brand.accent = v; }, { maxlength: 30 })),
      h('label', {}, 'Mô tả ngắn', input(c.brand.tagline, (v) => { c.brand.tagline = v; }, { maxlength: 160 }))),
      h('label', {}, 'Thông báo đầu trang chủ (để trống = không hiện)', input(c.notice, (v) => { c.notice = v; }, { maxlength: 500 }))),
    card('Chế độ Beta', 'Khi bật: trang web không hiện bảng giá, gói cước, thanh toán, nút nâng cấp hay khẩu hiệu bán hàng. Mọi cài đặt gói/thanh toán vẫn giữ nguyên và giới hạn mỗi gói vẫn áp dụng; tắt Beta là mở bán lại ngay.',
      check(c.beta.enabled, (v) => { c.beta.enabled = v; }, 'Đang chạy bản Beta'),
      h('div', { class: 'grid wide' },
        h('label', {}, 'Nhãn', input(c.beta.label, (v) => { c.beta.label = v; }, { maxlength: 20 })),
        h('label', {}, 'Giải thích cho người dùng', input(c.beta.note, (v) => { c.beta.note = v; }, { maxlength: 300 })))),
    siteCard(c),
    musicCard(c),
    card('Pháp lý', 'Điều khoản, bảo mật, hoàn tiền hiện ở chân trang và khi đăng nhập. Định dạng: "## " là tiêu đề, "- " là gạch đầu dòng; {brand} {company} {email} {address} được tự điền. Nội dung mặc định là bản nháp theo luật Việt Nam — nên nhờ luật sư rà soát.',
      h('div', { class: 'grid' },
        h('label', {}, 'Tên doanh nghiệp / chủ thể', input(c.legal.company, (v) => { c.legal.company = v; })),
        h('label', {}, 'Email liên hệ', input(c.legal.email, (v) => { c.legal.email = v; }, { type: 'email' })),
        h('label', {}, 'Địa chỉ', input(c.legal.address, (v) => { c.legal.address = v; })),
        h('label', {}, 'Mã số thuế', input(c.legal.taxId, (v) => { c.legal.taxId = v; })),
        h('label', {}, 'Phiên bản', input(c.legal.version, (v) => { c.legal.version = v; }))),
      h('button', { type: 'button', class: 'ghost small', onclick: (e) => { c.legal.version = new Date().toISOString().slice(0, 10); e.target.previousSibling.querySelector('label:last-child input').value = c.legal.version; toast('Đã đổi phiên bản: mọi người sẽ được hỏi đồng ý lại sau khi bạn bấm Lưu.'); } }, 'Đổi phiên bản (yêu cầu đồng ý lại)'),
      h('label', {}, 'Điều khoản sử dụng', area(c.legal.terms, (v) => { c.legal.terms = v; }, 12)),
      h('label', {}, 'Chính sách bảo mật', area(c.legal.privacy, (v) => { c.legal.privacy = v; }, 12)),
      h('label', {}, 'Chính sách hoàn tiền', area(c.legal.refund, (v) => { c.legal.refund = v; }, 6))),
    card('Kịch bản mẫu', 'Người dùng chọn để làm video ngay, không cần AI. Cũng dùng được trong Zalo bằng lệnh MAU.',
      h('button', { type: 'button', class: 'ghost small', onclick: () => { c.templates.push({ id: 'mau-' + (c.templates.length + 1), title: 'Mẫu mới', niche: 'general', text: '' }); drawTpls(); } }, '+ Thêm mẫu'), tplList),
    card('Đổi tên', 'Mọi tên hiển thị cho người dùng.', ...LABEL_GROUPS.map(([g, title]) => h('details', {}, h('summary', {}, title),
      h('div', { class: 'grid' }, Object.keys(c.labels[g]).map((k) => h('label', {}, h('code', {}, k), input(c.labels[g][k], (v) => { c.labels[g][k] = v; }, { maxlength: 80 })))))),
      h('details', {}, h('summary', {}, 'Chữ trên giao diện'),
        h('div', { class: 'grid' }, Object.keys(c.texts).map((k) => h('label', {}, h('code', {}, k), input(c.texts[k], (v) => { c.texts[k] = v; }, { maxlength: 240 })))))),
  ];
}

// Operation desks adapted from the reference: recorded messages and real jobs.
const ZALO_STATE = { received: 'Đã nhận', processing: 'Đang xử lý', handled: 'Đã xử lý', failed: 'Lỗi', pending: 'Chờ gửi', sending: 'Đang gửi', sent: 'Đã gửi' };
function zaloInboxCard(initial) {
  const body = h('div');
  let current = initial, onlyErrors = false;
  const search = h('input', { type: 'search', placeholder: 'Tìm người gửi, chat, nội dung hoặc lỗi…', oninput: () => paint(current) });
  const load = async () => paint(await api('/api/admin/zalo/inbox'));
  const retry = (payload) => async (event) => {
    const button = event.currentTarget; button.disabled = true;
    try { const result = await api('/api/admin/zalo/retry', { method: 'POST', body: payload }); if (result.ok === false) throw new Error(result.error || 'Zalo chưa nhận phản hồi.'); toast('Đã thử lại.'); await load(); }
    catch (error) { fail(error); } finally { button.disabled = false; }
  };
  function paint(data) {
    current = data;
    const query = search.value.trim().toLocaleLowerCase('vi');
    const matches = (row) => (!onlyErrors || row.status === 'failed' || row.error) && (!query || [row.sender_name,row.chat_id,row.text,row.error].join(' ').toLocaleLowerCase('vi').includes(query));
    const filtered = { messages: (data?.messages || []).filter(matches), replies: (data?.replies || []).filter(matches) };
    data = filtered;
    body.replaceChildren(
      h('h3', {}, 'Tin nhận từ Zalo'),
      data?.messages?.length ? table(['Lúc', 'Người gửi', 'Nội dung', 'Xử lý', 'Lỗi / dự án', ''], data.messages.map((m) => h('tr', {},
        h('td', {}, fmtDate(m.received_at)), h('td', {}, m.sender_name || m.chat_id), h('td', { class: 'zalo-message' }, m.text),
        h('td', {}, (ZALO_STATE[m.status] || m.status) + ' · ' + m.attempts + ' lần'), h('td', { class: 'zalo-message' }, m.error || m.project_id || ''),
        h('td', {}, m.status === 'failed' || m.status === 'processing' && Date.now() - m.updated_at > 120000 ? h('button', { type: 'button', class: 'ghost small', onclick: retry({ messageId: m.id }) }, 'Xử lý lại') : null)))) : h('p', { class: 'muted' }, 'Chưa nhận tin nào. Nhắn GIUP cho bot rồi tải lại hộp thư.'),
      h('h3', {}, 'Phản hồi gửi đi'),
      data?.replies?.length ? table(['Lúc', 'Chat', 'Phản hồi', 'Gửi', 'Lỗi', ''], data.replies.map((r) => h('tr', {},
        h('td', {}, fmtDate(r.updated_at)), h('td', {}, r.chat_id), h('td', { class: 'zalo-message' }, r.text),
        h('td', { class: r.status === 'sent' ? 'ok' : r.status === 'failed' ? 'bad' : '' }, (ZALO_STATE[r.status] || r.status) + ' · ' + r.attempts + ' lần'),
        h('td', { class: 'zalo-message' }, r.error || ''), h('td', {}, r.status === 'failed' ? h('button', { type: 'button', class: 'ghost small', onclick: retry({ replyId: r.id }) }, 'Gửi lại') : null)))) : h('p', { class: 'muted' }, 'Chưa có phản hồi được ghi nhận.'));
  }
  paint(initial);
  return card('Hộp thư Zalo', '50 tin gần nhất và trạng thái gửi thực tế. Tin lỗi không bị báo là đã gửi. Nội dung được giữ theo thời hạn nhật ký đã cấu hình.',
    h('div', { class: 'grid' }, h('label', {}, 'Tìm trong 50 tin gần nhất', search), check(false, (value) => { onlyErrors = value; paint(current); }, 'Chỉ hiện tin lỗi')),
    h('button', { type: 'button', class: 'ghost small', onclick: () => load().catch(fail) }, 'Tải lại hộp thư'), body);
}
async function adminRenders(body) {
  const data = await api('/api/admin/renders');
  body.replaceChildren(card('Máy dựng và hàng đợi', 'Tiến độ lấy từ máy chủ. Thử lại tạo một lượt dựng mới và áp dụng hạn mức của tài khoản khách.',
    h('div', { class: 'row' }, ...Object.entries(data.counts).map(([status, count]) => h('span', { class: 'pill ' + status }, (JOB_TEXT[status] || status) + ': ' + count))),
    h('button', { type: 'button', class: 'ghost small', onclick: () => adminRenders(body).catch(fail) }, 'Cập nhật trạng thái'),
    table(['Video / tài khoản', 'Trạng thái', 'Bước thực tế', 'Heartbeat', 'Lỗi', ''], data.jobs.map((job) => h('tr', {},
      h('td', {}, h('b', {}, job.title || job.id), h('p', { class: 'muted' }, job.email || job.user_id)),
      h('td', {}, JOB_TEXT[job.status] || job.status, job.status === 'running' ? h('progress', { max: 100, value: job.progress, 'aria-label': 'Tiến độ dựng' }) : null),
      h('td', { class: 'zalo-message' }, job.message || job.phase || '—'), h('td', {}, job.heartbeat_at ? fmtDate(job.heartbeat_at) : '—'),
      h('td', { class: 'zalo-message bad' }, job.error || ''), h('td', {}, job.status === 'failed' ? h('button', { type: 'button', class: 'ghost small', onclick: async (event) => {
        event.currentTarget.disabled = true;
        try { await api('/api/admin/renders/' + job.id + '/retry', { method: 'POST' }); toast('Đã tạo lượt dựng mới.'); await adminRenders(body); } catch (error) { fail(error); event.currentTarget.disabled = false; }
      } }, 'Dựng lại') : null))))));
}
