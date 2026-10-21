// Admin page (#/admin/<tab>): overview, activity log, users, orders, plans, Zalo, what users
// see, content and settings. Uses h, api, toast, options, applyUI, ui, fmtDate, money from app.js.
// API keys are write-only: the page only learns whether a key is set, never its value.
'use strict';

// grouped by the job at hand: watch, make videos, people, sell, run the site
const ADMIN_GROUPS = [
  ['Nhóm trợ lý', [['nhom-ai','Nhóm AI nội dung','Thiết lập trợ lý, Telegram, thảo luận đa kênh và duyệt đề xuất. Chỉ dành cho quản trị.']]],
  ['Theo dõi', [['tong-quan', 'Bảng điều khiển', 'Số liệu chính, phễu người dùng, lỗi và tình trạng cài đặt.'], ['nhat-ky', 'Nhật ký', 'Mọi thao tác và lỗi, lọc theo người, loại, thời gian.']]],
  ['Sản xuất video', [
    ['giong-doc', 'Giọng đọc', 'Giọng nào đang đọc thật, giọng nào dùng giọng thay thế, nghe thử từng giọng.'], ['may-dung', 'Máy dựng', 'Hàng chờ, tiến độ và lỗi khi dựng video.']]],
  ['Giải pháp', [['giai-phap','Giải pháp & tài nguyên','Biên tập giải pháp, tệp, phiên bản và nội dung công khai.']]],
  ['Người dùng', [['prompt-hunter','Prompt Hunter','Kiểm duyệt và biên tập prompt chia sẻ.'],['nguoi-dung', 'Người dùng', 'Tìm người dùng, xem video, cấp gói hoặc credit, khoá tài khoản.'], ['cong-dong', 'Cộng đồng', 'Duyệt video chia sẻ.'], ['zalo', 'Zalo', 'Kết nối Zalo Bot, tự kiểm tra và hộp thư.'],['anh-zalo','Ảnh Zalo từ Sheet','Nguồn ảnh, lịch gửi và người đăng ký.']]],
  ['Kinh doanh', [['goi', 'Gói cước', 'Giá, hạn mức, thanh toán.'], ['don-hang', 'Đơn hàng', 'Đơn chờ, đã trả, huỷ.']]],
  ['Kết nối & AI', [['ket-noi','API & token','Khoá AI, giọng đọc, Zalo, thanh toán và kiểm tra kết nối.'],['ai','AI & model','Thứ tự AI, model chính và dự phòng.'],['chi-phi','Chi phí & ngân sách','Trần chi phí và bảng giá vốn.']]],
  ['Hệ thống', [['noi-dung', 'Trang chủ & nội dung', 'Ảnh, video mẫu, chữ trên trang, ngân sách AI.'], ['cai-dat', 'Cài đặt chung', 'Máy dựng, mặc định video, đăng nhập và quyền quản trị.']]],
];
const ADMIN_TABS = ADMIN_GROUPS.flatMap(([, list]) => list);
const SECRET_INFO = {
  GEMINI_API_KEY: ['Gemini (Google AI Studio)', 'Viết kịch bản + vẽ ảnh. aistudio.google.com → Get API key.'],
  OPENAI_API_KEY: ['OpenAI', 'Viết kịch bản + vẽ ảnh. platform.openai.com → API keys.'],
  OLLAMA_API_KEY: ['Ollama (không bắt buộc)', 'Chỉ cần với Ollama Cloud (ollama.com → Settings → Keys) hoặc máy chủ Ollama có đặt mật khẩu.'],
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
  const tab = ADMIN_TABS.some(([k]) => k === currentRoute().split('/')[2]) ? currentRoute().split('/')[2] : 'tong-quan';
  viewed('admin', { tab });
  const [, defaultTitle, desc] = ADMIN_TABS.find(([k]) => k === tab);
  const title=ui.labels?.adminMenu?.[tab]||defaultTitle;
  const nav = h('nav', { class: 'admin-nav', 'aria-label': 'Mục quản trị' }, ADMIN_GROUPS.map(([g, list]) => h('div', { class: 'admin-group' }, h('span', {}, g),
    list.map(([k, name]) => h('a', { href: '#/admin/' + k, class: k === tab ? 'on' : null, 'aria-current': k === tab ? 'page' : null }, ui.labels?.adminMenu?.[k]||name)))));
  const body = h('div', { class: 'admin-body' }, h('p', { class: 'muted' }, 'Đang tải…'));
  // one menu: on wide screens the admin sections replace the app menu in the side bar;
  // on smaller screens they are a single scrolling strip above the page
  const side = document.getElementById('appside');
  side?.querySelector('.admin-nav')?.remove();
  const sideNav = nav.cloneNode(true);
  sideNav.prepend(h('a', { class: 'admin-back', href: '#/' }, '← Về ứng dụng'));
  side?.querySelector('.sidenav.bottom')?.before(sideNav);
  show(h('div', { class: 'admin' }, nav, h('div', { class: 'admin-main' }, h('header', { class: 'admin-head' }, h('h1', {}, title), h('p', { class: 'muted' }, desc)), body)));
  setTimeout(() => nav.querySelector('a.on')?.scrollIntoView({ block: 'nearest', inline: 'center' }), 0);
  const pages = { 'giai-phap':async(body)=>{const {showSolutionsAdmin}=await import('/solutions-admin.js?v=55');return showSolutionsAdmin({h,api,body,toast,fail});}, 'anh-zalo':async(body)=>{const {showImageFeed}=await import('/image-feed.js?v=44');return showImageFeed({h,api,body,toast,fail});}, 'prompt-hunter':async(body)=>{const {showHunter}=await import('/prompt-hunter.js');return showHunter({h,api,show:(...nodes)=>body.replaceChildren(...nodes.filter(Boolean)),me,toast,fail,detailDialog,openLogin,footer,admin:true});}, 'may-dung': adminRenders, 'cong-dong': adminCommunity, 'tong-quan': adminOverview, 'nhat-ky': adminLog, 'nguoi-dung': adminUsers, 'don-hang': adminOrders, goi: adminSettings, zalo: adminSettings, 'hien-thi': adminSettings, 'noi-dung': adminSettings, 'cai-dat': adminSettings,'ket-noi':adminSettings,'ai':adminSettings,'chi-phi':adminSettings, 'huan-luyen': adminSettings, 'giong-doc': adminSettings };
  if(tab==='nhom-ai'){
    const {showCouncil}=await import('/council-admin.js?v=9');
    return showCouncil({h,api,body,toast,fail});
  }
  await (pages[tab] || adminOverview)(body, tab);
}

const card = (title, note, ...kids) => h('section', { class: 'card' }, h('div', { class: 'section-title' }, h('h2', {}, title), note ? helpHint(title, note) : null), ...kids);
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
function openUser(id) { pendingUser = id; navigate('#/admin/nguoi-dung'); }
async function adminUsers(body) {
  const r = await api('/api/admin/users');
  let q = '';
  const tbody = h('tbody');
  const fill = () => tbody.replaceChildren(...r.users.filter((u) => !q || (u.email + ' ' + (u.name || '')).toLowerCase().includes(q)).map((u) => h('tr', {},
    h('td', {}, h('a', { href: '#', onclick: (e) => { e.preventDefault(); adminUserDetail(u.id); } }, u.email)), h('td', {}, u.name || ''),
    h('td', {}, u.plan || 'free'), h('td', {}, num(u.credits||0)), h('td', {}, num(u.projects)), h('td', {}, num(u.videos)), h('td', {}, num(u.today)), h('td', {}, money(u.cost)),
    h('td', {}, u.zalo ? '✓' : ''), h('td', {}, u.last_seen ? fmtDate(u.last_seen) : '—'), h('td', {}, fmtDate(u.created_at)),
    h('td', {}, u.blocked ? h('span', { class: 'bad' }, 'Đã khoá') : ''))));
  fill();
  const j = r.jobs7d || {};
  body.replaceChildren(card('Người dùng', `${r.users.length} tài khoản · 7 ngày: ${j.done || 0} video xong, ${j.failed || 0} lỗi, ${(j.queued || 0) + (j.running || 0)} đang chờ/dựng.`,
    input('', (v) => { q = v.toLowerCase(); fill(); }, { placeholder: 'Tìm email hoặc tên' }),
    table(['Email', 'Tên', 'Gói', 'Credit', 'Dự án', 'Video', 'Lượt hôm nay', 'Chi phí', 'Zalo', 'Lần cuối', 'Tham gia', ''], tbody)));
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
  const {dialog,content:box}=detailDialog('Chi tiết tài khoản');
  box.textContent='Đang tải…';
  let r;try{r=await api('/api/admin/users/' + encodeURIComponent(id));}catch(e){box.textContent=e.message;return;}
  if(!dialog.isConnected)return;
  dialog.querySelector('header h2').textContent=r.user.email;
  const plans = ui.plans?.length ? ui.plans : [{ id: 'free', name: 'Miễn phí' }];
  let grantPlan = plans[plans.length - 1]?.id, grantDays = 30;
  const blockBtn = h('button', { type: 'button', class: 'ghost small danger', onclick: async () => {
    const blocked = blockBtn.textContent === 'Khoá tài khoản';
    try { await api(`/api/admin/users/${encodeURIComponent(id)}/block`, { method: 'POST', body: { blocked } }); toast(blocked ? 'Đã khoá.' : 'Đã mở khoá.'); blockBtn.textContent = blocked ? 'Mở khoá' : 'Khoá tài khoản'; }
    catch (e) { fail(e); }
  } }, 'Khoá tài khoản');
  const events = r.events.map((e) => h('tr', {}, h('td', {}, fmtDate(e.ts)), h('td', { class: e.ok ? null : 'bad' }, evName(e.type)), h('td', {}, e.channel), h('td', {}, e.cost ? money(e.cost) : ''), h('td', { class: 'data' }, e.path ? e.path + ' ' : '', e.data || '')));
  box.replaceChildren(h('section', { class: 'card drawer' },
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('h2', {}, r.user.email), h('button', { type: 'button', class: 'ghost small', onclick: () => dialog.close() }, 'Đóng')),
    h('p', { class: 'muted' }, `${r.user.name || ''} · tham gia ${fmtDate(r.user.created_at)} · ${num(r.totals.events)} thao tác · ${num(r.totals.errors)} lỗi · chi phí ${money(r.totals.cost)}`),
    h('p', {}, 'Gói hiện tại: ', h('b', {}, r.plan ? `${r.plan.plan} đến ${fmtDate(r.plan.expires_at)}` : 'Miễn phí')),
    h('div', { class: 'row' }, 'Cấp gói ', select(plans.map((p) => [p.id, p.name]), grantPlan, (v) => { grantPlan = v; }), ' trong ', input(grantDays, (v) => { grantDays = v; }, { type: 'number', min: 1, style: 'width:90px' }), ' ngày',
      h('button', { type: 'button', class: 'small', onclick: async () => { try { await api('/api/admin/grant', { method: 'POST', body: { user: id, plan: grantPlan, days: grantDays } }); toast('Đã cấp gói.'); adminUserDetail(id); } catch (e) { fail(e); } } }, 'Cấp'),
      blockBtn, h('button', { type: 'button', class: 'ghost small', onclick: () => { dialog.close(); pendingLog = { user: id }; navigate('#/admin/nhat-ky'); } }, 'Xem toàn bộ nhật ký')),
    h('h3', {}, 'Credit'), creditCell({...r.user,credits:r.user.credits||0}),
    h('h3', {}, 'Video'), r.projects.length ? h('ul', {}, r.projects.map((p) => h('li', {}, p.title, h('small', { class: 'muted' }, ' · ' + fmtDate(p.updated_at))))) : h('p', { class: 'muted' }, 'Chưa có.'),
    h('h3', {}, 'Lần dựng'), r.jobs.length ? table(['Lúc', 'Trạng thái', 'Lỗi'], r.jobs.map((j) => h('tr', {}, h('td', {}, fmtDate(j.created_at)), h('td', {}, JOB_TEXT[j.status] || j.status), h('td', { class: 'bad' }, j.error || '')))) : h('p', { class: 'muted' }, 'Chưa có.'),
    h('details',{},h('summary',{},'Nhật ký hoạt động'), table(['Lúc', 'Việc', 'Kênh', 'Chi phí', 'Chi tiết'], events))));
  if(r.user.blocked)blockBtn.textContent='Mở khoá';
}

// ---------------------------------------------------------------- orders
async function adminOrders(body) {
  const r = await api('/api/admin/orders');
  const act = (code, what) => async () => { try { const result=await api(`/api/admin/orders/${code}/${what}`, { method: 'POST' });if(what==='confirm'&&result.order?.status!=='paid')throw new Error('Chưa xác nhận được trạng thái thanh toán.');toast(what==='confirm'?'Đã thanh toán và cập nhật quyền lợi khách hàng.':'Đã cập nhật đơn.');await adminOrders(body); } catch (e) { fail(e); } };
  body.replaceChildren(h('div', { class: 'stats' },
    h('div', { class: 'stat' }, h('small', {}, 'Doanh thu 30 ngày'), h('b', {}, money(r.last30.revenue)), h('small', {}, `${r.last30.paid} đơn`)),
    h('div', { class: 'stat' }, h('small', {}, 'Chi phí AI + giọng 30 ngày'), h('b', {}, money(r.last30.cost))),
    h('div', { class: 'stat' }, h('small', {}, 'Lãi gộp ước tính'), h('b', {}, money(r.last30.revenue - r.last30.cost)))),
    card('Đơn hàng', 'Đơn được kích hoạt tự động khi SePay báo tiền; có thể xác nhận tay nếu khách chuyển sai nội dung.',
      table(['Mã', 'Email', 'Gói', 'Số tiền', 'Trạng thái', 'Tạo lúc', 'Trả lúc', 'Qua', ''], r.orders.map((o) => h('tr', {},
        h('td', {}, h('code', {}, o.code)), h('td', {}, o.email || o.user_id), h('td', {}, o.solution_title||o.plan), h('td', {}, money(o.amount)),
        h('td', { class: o.status === 'paid' ? 'ok' : o.status === 'pending' ? null : 'bad' }, { pending: 'Chờ', paid: 'Đã trả', cancelled: 'Huỷ', expired: 'Hết hạn' }[o.status] || o.status),
        h('td', {}, fmtDate(o.created_at)), h('td', {}, o.paid_at ? fmtDate(o.paid_at) : ''), h('td', {}, o.via || ''),
        h('td', {}, o.status === 'pending' ? [h('button', { type: 'button', class: 'small', onclick: act(o.code, 'confirm') }, 'Xác nhận đã trả'), h('button', { type: 'button', class: 'ghost small', onclick: act(o.code, 'cancel') }, 'Huỷ')] : null))))));
}

// ---------------------------------------------------------------- settings-based tabs
async function adminSettings(body, tab) {
  const [{ config, secrets, briefs }, zcheck, inbox, voices] = await Promise.all([api('/api/admin/settings'), tab === 'zalo' ? api('/api/admin/zalo/check').catch(() => null) : null, tab === 'zalo' ? api('/api/admin/zalo/inbox') : null,
    tab === 'giong-doc' ? api('/api/admin/voices').catch(() => null) : null]);
  const c = structuredClone(config);
  const secretInput = {};
  const saveBtn = h('button', { type: 'button', 'data-ev': 'admin-save', onclick: async () => {
    saveBtn.disabled = true; saveBtn.textContent = 'Đang lưu…';
    try {
      const saved = await api('/api/admin/settings', { method: 'PUT', body: { config: c, secrets: secretInput } });
      me = await api('/api/me'); applyUI(me.ui);
      // webhook mode is registered with Zalo on save: say whether it took
      toast(saved.zalo ? (saved.zalo.ok ? 'Đã lưu cài đặt. Webhook Zalo đã kết nối: ' + saved.zalo.url : 'Đã lưu cài đặt, nhưng chưa kết nối được webhook Zalo: ' + saved.zalo.error) : 'Đã lưu cài đặt.');
      return adminSettings(body, tab);
    } catch (e) { fail(e); }
    saveBtn.disabled = false; saveBtn.textContent = 'Lưu cài đặt';
  } }, 'Lưu cài đặt');
  const sections = tab === 'huan-luyen' ? trainTab(c, briefs || {}) : tab === 'giong-doc' ? voiceTab(c, secrets, secretInput, voices)
    : ({ goi: plansTab, zalo: zaloTab, 'hien-thi': visTab, 'noi-dung': contentTab, 'cai-dat': settingsTab,'ket-noi':connectionsTab,'ai':(c,s,k)=>settingsTab(c,s,k,'ai'),'chi-phi':(c,s,k)=>settingsTab(c,s,k,'cost') }[tab] || settingsTab)(c, secrets, secretInput, zcheck, inbox);
  const cards=sections.filter(Boolean);
  const finder=h('input',{type:'search',placeholder:'Tìm cài đặt trong trang này…','aria-label':'Tìm cài đặt',oninput:e=>{const q=e.target.value.trim().toLocaleLowerCase('vi');for(const section of cards)section.hidden=!!q&&!section.textContent.toLocaleLowerCase('vi').includes(q);}});
  const shortcuts=h('nav',{class:'settings-shortcuts','aria-label':'Đến nhóm cài đặt'},cards.map(section=>{const title=section.querySelector('h2')?.textContent;if(!title)return null;return h('button',{type:'button',class:'ghost small',onclick:()=>{finder.value='';cards.forEach(x=>x.hidden=false);section.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});section.querySelector('input,select,button,textarea')?.focus({preventScroll:true});}},title);}));
  body.replaceChildren(h('div',{class:'settings-finder'},finder,shortcuts),...cards,h('div', { class: 'savebar' }, saveBtn));
}

function keysCard(secrets, secretInput, names, title='Khoá API') {
  const status = { admin: 'Đã nhập ở đây', env: 'Đang dùng khoá cài trên máy chủ', null: 'Chưa có' };
  return card(title, 'Khoá được mã hoá trước khi lưu và không bao giờ hiện lại. Để trống = giữ nguyên.',
    ...names.map((name) => {
      const [title, note] = SECRET_INFO[name], st = secrets[name];
      const clear = h('button', { type: 'button', class: 'ghost small', hidden: st !== 'admin', onclick: () => { secretInput[name] = null; clear.textContent = 'Sẽ xoá khi lưu'; clear.disabled = true; } }, 'Xoá khoá');
      return h('div', { class: 'keyrow' },
        h('label', {}, h('span', {}, h('strong', {}, title), ' ', h('span', { class: 'pill ' + (st ? 'done' : 'failed') }, status[st])), h('small', {}, note),
          h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: st ? '•••••••• (để trống = giữ nguyên)' : 'Dán khoá vào đây', oninput: (e) => { secretInput[name] = e.target.value; } })),
        clear);
    }));
}

function connectionsTab(c,secrets,secretInput){return [
 keysCard(secrets,secretInput,['OPENAI_API_KEY','GEMINI_API_KEY','OLLAMA_API_KEY'],'AI: khoá API'),
 keysCard(secrets,secretInput,['EVERAI_API_KEY','GOOGLE_TTS_API_KEY','ELEVENLABS_API_KEY'],'Giọng đọc: khoá API'),
 keysCard(secrets,secretInput,['ZALO_BOT_TOKEN'],'Zalo: bot token'),
 keysCard(secrets,secretInput,['SEPAY_API_KEY'],'Thanh toán: SePay API'),
 connectionsCard(c),
 card('Thông tin kết nối trên máy chủ','Những giá trị này được quản lý trong môi trường triển khai, không hiển thị giá trị bí mật trên web.',
 h('dl',{class:'summary'},h('dt',{},'RUNNER_TOKEN'),h('dd',{},'Xác thực máy dựng và mã hoá khoá API; quản lý trong secrets triển khai.'),h('dt',{},'GOOGLE_CLIENT_ID'),h('dd',{},'Đăng nhập Google; cấu hình trong môi trường triển khai.'),h('dt',{},'Cloudflare token'),h('dd',{},'Dùng để triển khai web, cấu hình trong GitHub Actions secrets.')))
];}
function connectionLink(){return h('p',{class:'muted'},'Quản lý khoá tại ',h('a',{href:'#/admin/ket-noi'},'API & token'),'.');}
function settingsTab(c, secrets, secretInput, group='general') {
  if(!['ai','cost','general'].includes(group))group='general';
  const sections=[
    aiOrderCard(c),
    card('Máy dựng video', 'Cloud dùng Cloud Run. Máy cá nhân cần mở runner trên PC. Trình duyệt xuất trực tiếp trên thiết bị, cần giữ tab mở; tải tệp về máy, chưa lưu vào thư viện. Giọng AI vẫn cần dịch vụ giọng; có thể tải bản thu âm của bạn.',
      h('label', {}, 'Nơi dựng video', select([['cloud', 'Cloud (Google Cloud Run)'], ['local', 'Máy cá nhân (PC / VPS)'], ['browser', 'Trình duyệt (tạm thời)']], c.rendering?.mode || 'cloud', v => { c.rendering = {mode:v}; }))),
    card('Mặc định khi tạo video', 'Người dùng vẫn đổi được từng video.', h('div', { class: 'grid' },
      h('label', {}, 'Khung hình', select([['9:16', 'Dọc 9:16'], ['16:9', 'Ngang 16:9']], c.defaults.ratio, (v) => { c.defaults.ratio = v; })),
      h('label', {}, 'Thời lượng mặc định (giây)', input(c.defaults.seconds, (v) => { c.defaults.seconds = v; }, { type: 'number', min: 15, max: 1800 })),
      h('label', {}, 'Giọng đọc', select(c.voices.map((v) => [v.code, v.label]), c.defaults.voice, (v) => { c.defaults.voice = v; })),
      h('label', {}, 'Tên kênh', input(c.defaults.channel, (v) => { c.defaults.channel = v; }, { maxlength: 40 })),
      h('label', {}, 'Giọng văn', input(c.defaults.tone, (v) => { c.defaults.tone = v; }, { maxlength: 200 })),
      check(c.defaults.subtitles, (v) => { c.defaults.subtitles = v; }, 'Phụ đề trên hình'))),
    card('Giới hạn chung', 'Video dài nhất mà hệ thống cho làm (gói cước có thể cho ít hơn). Ước tính theo số chữ của kịch bản.', h('div', { class: 'grid' },
      h('label', {}, 'Độ dài tối đa (phút)', select([[60, '1 phút'], [120, '2 phút'], [180, '3 phút'], [300, '5 phút'], [420, '7 phút'], [600, '10 phút'], [900, '15 phút'], [1200, '20 phút'], [1800, '30 phút']].map(([v, l]) => [String(v), l]), String(c.limits.maxSeconds), (v) => { c.limits.maxSeconds = Number(v); })))),
    card('Đăng nhập Google', null,
      h('label', {}, 'Cách mở Google', select([['auto', 'Tự động (khuyên dùng): chuyển trang khi là app cài trên màn hình chính hoặc trình duyệt trong Zalo/Facebook'], ['redirect', 'Luôn chuyển trang (ổn định nhất)'], ['popup', 'Luôn cửa sổ bật lên']], c.auth.google, (v) => { c.auth.google = v; })),
      h('p', { class: 'muted' }, 'Để kiểu chuyển trang hoạt động, vào Google Cloud Console → APIs & Services → Credentials → OAuth client (Web) → Authorized redirect URIs, thêm đúng địa chỉ: ', h('code', {}, location.origin + '/api/auth/google/callback'))),
    card('Model AI', 'Model dự phòng được thử lần lượt khi model chính lỗi hoặc quá tải; hết model thì chuyển sang nhà cung cấp kế tiếp theo Thứ tự AI.', h('div', { class: 'grid' },
      h('label', {}, 'OpenAI viết', modelInput(c.models.openaiText, (v) => { c.models.openaiText = v; }, 'openai')),
      h('label', {}, 'OpenAI dự phòng', modelInput(c.models.openaiFallback, (v) => { c.models.openaiFallback = v; }, 'openai', true)),
      h('label', {}, 'Gemini viết', modelInput(c.models.geminiText, (v) => { c.models.geminiText = v; }, 'gemini')),
      h('label', {}, 'Gemini dự phòng', modelInput(c.models.geminiFallback, (v) => { c.models.geminiFallback = v; }, 'gemini', true)),
      h('label', {}, 'Địa chỉ Ollama', modelInput(c.models.ollamaUrl, (v) => { c.models.ollamaUrl = v; }, 'ollama-url')),
      h('label', {}, 'Ollama viết', modelInput(c.models.ollamaText, (v) => { c.models.ollamaText = v; }, 'ollama')),
      h('label', {}, 'Ollama dự phòng', modelInput(c.models.ollamaFallback, (v) => { c.models.ollamaFallback = v; }, 'ollama', true))),
    h('p', { class: 'muted' }, 'Bấm vào ô để chọn model có sẵn, hoặc gõ tên khác. Dự phòng: nhiều model cách nhau bằng dấu phẩy. Ollama Cloud: chỉ cần dán khoá Ollama, để trống địa chỉ (tự dùng https://ollama.com). Máy chủ Ollama riêng phải mở được từ Internet. Ollama chỉ viết, không vẽ ảnh.')),
    budgetCard(c),
    card('Bảng giá vốn', 'Dùng để ghi chi phí từng lần gọi AI và giọng đọc vào nhật ký. Model: "tên-model: giá vào, giá ra" (USD / 1 triệu token), "*" = mặc định.',
      h('div', { class: 'grid' },
        h('label', {}, 'Tỷ giá USD → VND', input(c.costs.usdVnd, (v) => { c.costs.usdVnd = v; }, { type: 'number' })),
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
  const groups={'Thứ tự AI':'ai','Model AI':'ai','Trần chi phí':'cost','Bảng giá vốn':'cost'};
  return sections.filter(section=>(groups[section.querySelector('h2')?.textContent]||'general')===group);
}

// models offered in the pickers; the connection check adds what each key may really use
const MODEL_PRESETS = {
  gemini: ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.5-pro', 'gemini-flash-lite-latest', 'gemini-2.5-pro'],
  'gemini-image': ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'],
  openai: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'gpt-5-mini', 'gpt-5'],
  'openai-image': ['gpt-image-1', 'gpt-image-1-mini'],
  ollama: ['gpt-oss:120b', 'gpt-oss:20b', 'deepseek-v3.1:671b', 'qwen3-coder:480b', 'kimi-k2:1t', 'glm-4.6', 'qwen3:8b', 'llama3.1:8b', 'gemma3:12b'],
  'ollama-url': ['https://ollama.com'],
};
const liveModels = {};
function modelInput(value, set, kind, many) {
  const id = 'models-' + kind;
  let dl = document.getElementById(id);
  if (!dl) { dl = h('datalist', { id }); document.body.append(dl); }
  dl.replaceChildren(...[...new Set([...(liveModels[kind] || []), ...MODEL_PRESETS[kind]])].map((m) => h('option', { value: m })));
  return h('input', { value: value ?? '', list: id, placeholder: many ? 'vd ' + MODEL_PRESETS[kind].slice(1, 3).join(', ') : 'chọn hoặc gõ tên', spellcheck: 'false', autocomplete: 'off', oninput: (e) => set(e.target.value.trim()) });
}

/** Every outside service the site depends on, each with its own check and a detailed result. */
function connectionsCard(c) {
  const fmt = (ms) => (ms == null ? '' : ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(1) + ' giây');
  const pill = (state) => h('span', { class: 'pill ' + ({ ok: 'done', bad: 'failed', warn: 'running', idle: '' }[state] || '') }, { ok: 'Hoạt động', bad: 'Lỗi', warn: 'Một phần', idle: 'Chưa kiểm tra', off: 'Chưa cấu hình', busy: 'Đang kiểm tra…' }[state] || state);
  const planBox = h('div', { class: 'conn-plan muted' });
  const showPlan = async () => {
    try {
      const r = await api('/api/admin/ai/check?p=plan');
      planBox.replaceChildren(h('strong', {}, 'Thứ tự sẽ thử khi viết: '), r.plan.length ? r.plan.map((x) => `${x.provider} ${x.model}`).join(' → ') : '(chưa có AI nào dùng được)',
        ...r.order.filter((o) => !o.ready || o.why).map((o) => h('div', {}, `• ${o.name}: ${o.why}`)),
        ...(r.paused.length ? [h('div', {}, '• Đang tạm nghỉ: ' + r.paused.map((x) => `${x.key} (tới ${new Date(x.until).toLocaleTimeString('vi-VN')})`).join(', '))] : []));
    } catch (e) { planBox.textContent = e.message; }
  };
  const aiRow = (p, name) => {
    const state = h('span', {}, pill('idle')), detail = h('div', { class: 'conn-detail' });
    const run = async () => {
      state.replaceChildren(pill('busy')); detail.replaceChildren();
      try {
        const r = await api('/api/admin/ai/check?p=' + p);
        const kind = p;
        if (r.models?.length) { liveModels[kind] = r.models; const dl = document.getElementById('models-' + kind); if (dl) dl.replaceChildren(...[...new Set([...r.models, ...MODEL_PRESETS[kind]])].map((m) => h('option', { value: m }))); }
        const okTests = r.tests.filter((t) => t.ok).length;
        state.replaceChildren(pill(!r.configured ? 'off' : r.error && !okTests ? 'bad' : okTests === r.tests.length && r.tests.length ? 'ok' : okTests ? 'warn' : 'bad'));
        detail.replaceChildren(...[
          h('div', {}, [r.address ? 'Địa chỉ: ' + r.address : null, 'Khoá: ' + (r.key ? 'có' : p === 'ollama' ? 'không (không bắt buộc với máy chủ riêng)' : 'chưa có'),
            r.status ? `Kết nối: HTTP ${r.status}${r.ms != null ? ' · ' + fmt(r.ms) : ''}` : null].filter(Boolean).join(' · ')),
          r.error ? h('div', { class: 'bad' }, '✗ ' + r.error) : null,
          r.tests.length ? h('ul', {}, r.tests.map((t) => h('li', { class: t.ok ? 'ok' : 'bad' }, `${t.ok ? '✓' : '✗'} ${t.model} (${t.role}) — ${t.ok ? 'trả lời trong ' + fmt(t.ms) : (t.status ? 'HTTP ' + t.status + ' · ' : '') + (t.error || 'lỗi')}`))) : null,
          r.models?.length ? h('details', {}, h('summary', {}, `Model khả dụng (${r.models.length}) — bấm để dùng làm model chính`),
            h('div', { class: 'conn-models' }, r.models.map((m) => h('button', { type: 'button', class: 'ghost small', onclick: () => {
              const key = { gemini: 'geminiText', openai: 'openaiText', ollama: 'ollamaText' }[p]; c.models[key] = m;
              const field = [...document.querySelectorAll('input[list="models-' + p + '"]')][0]; if (field) field.value = m;
              toast(`Đã chọn ${m} làm model chính của ${name}. Bấm Lưu cài đặt để áp dụng.`); } }, m)))) : null,
          r.hint ? h('div', { class: 'hint' }, '→ ' + r.hint) : null].filter(Boolean));
      } catch (e) { state.replaceChildren(pill('bad')); detail.replaceChildren(h('div', { class: 'bad' }, e.message)); }
      showPlan();
    };
    return { run, el: h('div', { class: 'conn-row' }, h('div', { class: 'conn-head' }, h('strong', {}, name), state, h('button', { type: 'button', class: 'ghost small', onclick: run }, 'Kiểm tra')), detail) };
  };
  const simpleRow = (name, check) => {
    const state = h('span', {}, pill('idle')), detail = h('div', { class: 'conn-detail' });
    const run = async () => {
      state.replaceChildren(pill('busy')); detail.replaceChildren();
      try { const { st, lines, hint } = await check(); state.replaceChildren(pill(st)); detail.replaceChildren(...lines, ...(hint ? [h('div', { class: 'hint' }, '→ ' + hint)] : [])); }
      catch (e) { state.replaceChildren(pill('bad')); detail.replaceChildren(h('div', { class: 'bad' }, e.message)); }
    };
    return { run, el: h('div', { class: 'conn-row' }, h('div', { class: 'conn-head' }, h('strong', {}, name), state, h('button', { type: 'button', class: 'ghost small', onclick: run }, 'Kiểm tra')), detail) };
  };
  const rows = [aiRow('gemini', 'Gemini'), aiRow('openai', 'OpenAI'), aiRow('ollama', 'Ollama'),
    simpleRow('Giọng EverAI', async () => {
      const r = await api('/api/admin/voices/test', { method: 'POST', body: {} });
      return r.ok ? { st: 'ok', lines: [h('div', { class: 'ok' }, `✓ Đọc thử được (${Math.round(r.bytes / 1024)} KB, ${fmt(r.ms)}).`)] }
        : { st: /Chưa có khoá/.test(r.error || '') ? 'off' : 'bad', lines: [h('div', { class: 'bad' }, '✗ ' + r.error)], hint: 'Khoá EverAI nhập ở Quản trị → Giọng đọc.' };
    }),
    simpleRow('Zalo Bot', async () => {
      const r = await api('/api/admin/zalo/check'), bad = r.steps.filter((x) => !x.ok);
      return { st: !r.bot ? (c.zalo?.enabled ? 'bad' : 'off') : bad.length ? 'warn' : 'ok',
        lines: [h('ul', {}, r.steps.map((x) => h('li', { class: x.ok ? 'ok' : 'bad' }, `${x.ok ? '✓' : '✗'} ${x.k}${x.detail ? ' — ' + x.detail : ''}`)))],
        hint: bad.length ? bad[0].fix + ' (chi tiết ở Quản trị → Zalo)' : '' };
    })];
  const all = h('button', { type: 'button', onclick: async () => { all.disabled = true; await Promise.all(rows.map((x) => x.run())); all.disabled = false; } }, 'Kiểm tra tất cả');
  showPlan();
  return card('Kiểm tra kết nối', 'Mỗi cổng được gọi thật: liệt kê model khoá được dùng, hỏi thử từng model (chính và dự phòng), báo thời gian và lỗi. Kiểm tra cũng bỏ trạng thái "tạm nghỉ" để thử lại ngay. Đổi khoá/model thì Lưu cài đặt trước rồi kiểm tra.',
    h('div', { class: 'row' }, all), planBox, h('div', { class: 'conn-list' }, rows.map((x) => x.el)));
}

/** Which AI writes first, and which take over (in order) when it fails or has no key. */
function aiOrderCard(c) {
  const names = { gemini: 'Gemini', openai: 'OpenAI', ollama: 'Ollama' };
  c.models.order = [...new Set([...(c.models.order || []), 'gemini', 'openai', 'ollama'])];
  const list = h('ol', { class: 'ai-order' });
  const move = (i, d) => { const o = c.models.order, j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; c.defaults.textAI = o[0]; paint(); };
  const paint = () => list.replaceChildren(...c.models.order.map((k, i) => h('li', {},
    h('span', { class: 'ai-rank' }, String(i + 1)), h('span', { class: 'ai-name' }, names[k] || k, i === 0 ? h('small', { class: 'muted' }, ' · viết chính') : h('small', { class: 'muted' }, ' · dự phòng ' + i)),
    h('button', { type: 'button', class: 'ghost small', disabled: i === 0, 'aria-label': 'Đưa ' + names[k] + ' lên', onclick: () => move(i, -1) }, '↑'),
    h('button', { type: 'button', class: 'ghost small', disabled: i === c.models.order.length - 1, 'aria-label': 'Đưa ' + names[k] + ' xuống', onclick: () => move(i, 1) }, '↓'))));
  paint();
  return card('Thứ tự AI', 'AI đầu tiên viết kịch bản, thiết kế cảnh và trả lời chat. Khi lỗi, quá tải hoặc chưa có khoá, hệ thống tự chuyển xuống AI kế tiếp. Vẽ ảnh chọn riêng ở "Mặc định khi tạo video".', list);
}
function plansTab(c, secrets, secretInput) {
  const planCard = (p, i) => h('section', { class: 'card' },
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, p.name || 'Gói mới'),
      p.price ? h('button', { type: 'button', class: 'ghost small danger', onclick: () => { c.plans.splice(i, 1); toast('Đã bỏ gói, bấm Lưu để áp dụng.'); } }, 'Bỏ gói') : h('small', { class: 'muted' }, 'Gói miễn phí (bắt buộc có)')),
    h('div', { class: 'grid' },
      h('label', {}, 'Mã', input(p.id, (v) => { p.id = v; }, { maxlength: 20 })), h('label', {}, 'Tên', input(p.name, (v) => { p.name = v; }, { maxlength: 40 })),
      h('label', {}, 'Giá (VND)', input(p.price, (v) => { p.price = v; }, { type: 'number', min: 0 })), h('label', {}, 'Số ngày', input(p.days, (v) => { p.days = v; }, { type: 'number', min: 0 })),
      p.price ? h('label', {}, 'Giá cả năm (VND, 0 = không bán theo năm)', input(p.yearPrice || 0, (v) => { p.yearPrice = v; }, { type: 'number', min: 0 })) : null,
      p.price ? h('label', {}, 'Giá gốc gạch ngang (VND, 0 = không hiện)', input(p.listPrice || 0, (v) => { p.listPrice = v; }, { type: 'number', min: 0 })) : null,
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
    connectionLink(),
    card('Các gói', 'Giới hạn tính theo ngày. Phong cách/giọng/cách tạo ngoài gói sẽ hiện thông báo nâng cấp đúng gói cần mua.',
      h('button', { type: 'button', class: 'ghost small', onclick: (e) => { c.plans.push({ id: 'goi' + (c.plans.length + 1), name: 'Gói mới', price: 99000, days: 30, yearPrice: 0, listPrice: 0, visible: true, highlight: false, desc: '', features: [], limits: { script: 10, image: 20, render: 5 }, styles: 'all', sources: 'all', voices: 'all', zalo: true, maxSeconds: 180, docPerMonth: 0 }); e.target.closest('.card').after(planCard(c.plans[c.plans.length - 1], c.plans.length - 1)); } }, '+ Thêm gói')),
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

/** Video formats for videos made in Zalo: one default, and which ones people may pick with DINHDANG. */
function zaloFormatsCard(c, z) {
  const WAYS = ['auto', 'classic-sketch', 'classic-diagram', 'classic', 'act', 'kinetic', 'split', 'chat', 'story', 'data', 'quiz'];
  const CL = { web: 'Mặc định của web', auto: 'Tự động đa dạng', 'classic-sketch': 'Sketchnote theo lời', 'classic-diagram': 'Biểu đồ vẽ tay', classic: 'Tranh doodle' };
  const name = (k) => CL[k] || c.labels.looks?.[k] || k;
  const off = (k) => (k in CL ? (k === 'auto' ? false : (c.visibility['visual:' + ({ 'classic-sketch': 'sketch', 'classic-diagram': 'diagram', classic: 'doodle' })[k]] || 'on') !== 'on') : (c.visibility['look:' + k] || 'on') !== 'on');
  z.formats ||= { default: 'web', allowed: [...WAYS] };
  const note = h('p', { class: 'muted' });
  const paintNote = () => { const n = z.formats.allowed.filter((k) => !off(k)).length; note.textContent = n >= 2 ? `Người dùng gõ DINHDANG để chọn 1 trong ${n} định dạng đã tick; chưa chọn thì dùng định dạng mặc định.` : 'Tick ít hơn 2 định dạng: mọi video qua Zalo dùng định dạng mặc định, người dùng không chọn được.'; };
  const boxes = WAYS.map((k) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: z.formats.allowed.includes(k), disabled: off(k), onchange: (e) => {
    z.formats.allowed = e.target.checked ? [...new Set([...z.formats.allowed, k])].sort((a, b) => WAYS.indexOf(a) - WAYS.indexOf(b)) : z.formats.allowed.filter((x) => x !== k); paintNote();
  } }), name(k) + (off(k) ? ' (đang tắt ở Định dạng & hiển thị)' : '')));
  paintNote();
  return card('Định dạng video qua Zalo', 'Chọn định dạng mặc định cho video tạo qua Zalo, và tick các định dạng người dùng được chọn bằng lệnh DINHDANG. Phim tài liệu AI cần vẽ ảnh trên web nên không có ở đây.',
    h('label', {}, 'Định dạng mặc định', select([['web', CL.web], ...WAYS.map((k) => [k, name(k)])], z.formats.default || 'web', (v) => { z.formats.default = v; })),
    h('span', { class: 'plabel' }, 'Người dùng được chọn'),
    h('div', { class: 'grid' }, ...boxes),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'ghost small', onclick: (e) => { z.formats.allowed = []; e.target.closest('.card').querySelectorAll('input[type=checkbox]').forEach((x) => { x.checked = false; }); paintNote(); } }, 'Chỉ dùng mặc định (bỏ tick hết)'),
      h('button', { type: 'button', class: 'ghost small', onclick: (e) => { z.formats.allowed = WAYS.filter((k) => !off(k)); e.target.closest('.card').querySelectorAll('input[type=checkbox]').forEach((x) => { if (!x.disabled) x.checked = true; }); paintNote(); } }, 'Cho chọn tất cả')),
    note);
}
/** Ask the bot anything as a customer would and see how it answered: the AI (which model) or the prepared answers, and why. */
function assistantTestCard() {
  const q = h('input', { placeholder: 'Ví dụ: làm video bán mỹ phẩm được không? / ngu như bò / 1 tháng làm mấy video', maxlength: 500 });
  const out = h('div');
  const go = h('button', { type: 'button', class: 'small', onclick: async () => {
    if (!q.value.trim()) return toast('Nhập một câu để thử.');
    go.disabled = true; out.replaceChildren(h('p', { class: 'muted' }, 'Đang hỏi bot (tối đa 45 giây)…'));
    try {
      const r = await api('/api/admin/zalo/simulate', { method: 'POST', body: { text: q.value } });
      out.replaceChildren(
        h('p', { class: r.path === 'ai' ? 'ok' : 'bad' }, r.path === 'ai' ? `✓ AI trả lời (${r.model || ''}, ${Math.round(r.ms / 100) / 10} giây, ý định: ${r.intent || '?'})`
          : r.path === 'rules' ? `✗ Câu soạn sẵn, không phải AI — lý do: ${r.why || (r.assistantOn ? 'không rõ' : 'trợ lý AI đang tắt hoặc chưa có khoá AI')}` : 'Đây là một lệnh, bot xử lý theo lệnh.'),
        ...r.replies.map((x) => h('p', { class: 'caption' }, x.text)));
    } catch (e) { out.replaceChildren(h('p', { class: 'bad' }, e.message)); }
    go.disabled = false;
  } }, 'Hỏi thử');
  return card('Thử trợ lý', 'Gõ một câu như khách nhắn. Câu trả lời được gửi về Zalo chủ web và hiện bên dưới, kèm cho biết bot dùng AI hay câu soạn sẵn (và vì sao). Cần có Zalo chủ web (CHUWEB).',
    h('div', { class: 'row' }, q, go), out);
}

function zaloTab(c, secrets, secretInput, zcheck, inbox) {
  const z = c.zalo;
  const action = (label, fn) => h('button', { type: 'button', class: 'ghost small', onclick: async (event) => { const button = event.currentTarget; button.disabled = true; try { await fn(); } catch (e) { fail(e); } finally { button.disabled = false; } } }, label);
  const out = h('div');
  const tplNames = { help: 'Hướng dẫn (HUONGDAN)', linked: 'Khi kết nối xong', queued: 'Khi nhận yêu cầu dựng', done: 'Khi video xong', failed: 'Khi dựng lỗi', unknown: 'Khi không hiểu tin nhắn', noAI: 'Khi chưa có AI (lệnh TAO)',
    welcome: 'Bán hàng · Lời chào khách mới / khách chào ({ten} {troLy} {thuongHieu})', offer: 'Bán hàng · Bảng giá khi khách hỏi giá ({goi} {goiNam} {thuongHieu})',
    payment: 'Bán hàng · Khi khách chốt: thông tin chuyển khoản ({ma} {tenGoi} {soTien} {nganHang} {stk} {chuTk} {kichHoat})', paid: 'Bán hàng · Khi đã nhận tiền ({soTien} {ma} {tenGoi} {han})',
    upsell: 'Bán hàng · Mời nâng cấp khi hết lượt / video quá dài ({goiGoiY} {giaGoiY} {loiIch} {soGoiY})' };
  const owners=h('section',{class:'card'},h('p',{class:'muted'},'Đang tải danh sách chủ web…'));
  import('/zalo-owners.js?v=44').then(m=>m.showOwners({h,api,root:owners,fail,toast})).catch(fail);
  return [owners,
    card('Đọc prompt từ ảnh (OCR)','Gửi ảnh trực tiếp qua Zalo. Bot dùng AI theo thứ tự đã cấu hình để chép chữ, không thực thi prompt. Gửi PROMPT ANH sau khi kiểm tra để đăng/gửi duyệt. Kết quả tạm giữ 7 ngày; tối đa 8 MB mỗi ảnh và 20 ảnh/ngày/người dùng.',check(c.zalo.ocrEnabled,v=>{c.zalo.ocrEnabled=v;},'Cho phép đọc chữ trong ảnh')),
    card('Cách nhận tin nhắn', 'Webhook trực tiếp: Zalo gọi thẳng về web, trả lời ngay (khuyên dùng). Hỏi định kỳ: web tự hỏi Zalo mỗi phút, không cần webhook, trả lời chậm hơn. Bot chỉ có một webhook: hệ thống nào khác dùng chung token bot (Apps Script, n8n, bản chạy thử) sẽ giành mất webhook — hãy gỡ token khỏi nơi đó.',
      h('div', { class: 'grid' }, h('label', {}, 'Chế độ', select([['webhook', 'Webhook trực tiếp (khuyên dùng)'], ['poll', 'Hỏi định kỳ (không cần webhook)']], z.receive === 'poll' ? 'poll' : 'webhook', (v) => { z.receive = v; })),
        check(z.keepWebhook, (v) => { z.keepWebhook = v; }, 'Tự giữ webhook: kiểm tra mỗi 5 phút, bị xoá hoặc bị chuyển đi thì tự kết nối lại và báo chủ web')),
      zcheck?.recv?.status?.losses ? h('p', { class: 'bad' }, `Webhook đã bị mất ${zcheck.recv.status.losses} lần, gần nhất ${fmtDate(zcheck.recv.status.lostAt)}: ${zcheck.recv.status.found ? 'bị chuyển sang ' + zcheck.recv.status.found : 'bị xoá'}${zcheck.recv.status.restored ? ' — đã tự kết nối lại' : ''}.`) : null,
      zcheck?.recv ? h('p', { class: 'muted' }, `Đang dùng: ${({ poll: 'hỏi định kỳ', webhook: 'webhook trực tiếp' })[zcheck.recv.mode] || 'webhook trực tiếp'}` + (zcheck.recv.status?.at ? ` · lần gần nhất ${fmtDate(zcheck.recv.status.at)}` : '') + (zcheck.recv.status?.error ? ` · lỗi: ${zcheck.recv.status.error}` : '')) : null),
    card('Kiểm tra kết nối', 'Làm lần lượt từ trên xuống. Lưu cài đặt trước khi bấm Kết nối webhook (chỉ cần khi dùng webhook).',
      zcheck ? h('ul', {}, zcheck.steps.map((s) => h('li', { class: s.ok ? 'ok' : 'bad' }, (s.ok ? '✓ ' : '✗ ') + s.k, s.detail ? h('small', { class: 'muted' }, ' — ' + s.detail) : null, !s.ok ? h('div', { class: 'muted' }, '→ ' + s.fix) : null))) : null,
      zcheck ? h('p', { class: 'muted' }, `${zcheck.links?.n || 0} người đã kết nối (${zcheck.links?.guests || 0} chỉ dùng Zalo).`) : null,
      h('div', { class: 'row' },
        action('Kiểm tra lại', async () => { const check = await api('/api/admin/zalo/check'); out.replaceChildren(h('ul', {}, check.steps.map((step) => h('li', { class: step.ok ? 'ok' : 'bad' }, (step.ok ? '✓ ' : '✗ ') + step.k, h('p', { class: 'muted' }, step.detail || step.fix || ''))))); }),
        action('Kết nối webhook', async () => { const r = await api('/api/admin/zalo/connect', { method: 'POST' }); out.replaceChildren(h('p', {}, '✓ Webhook trỏ về: ', h('b', {}, r.url)), r.before && r.before !== r.url ? h('p', { class: 'muted' }, 'Trước đó bot trỏ về: ' + r.before + ' (đã chuyển sang web này).') : null, h('p', { class: 'muted' }, 'Giờ nhắn GIUP cho bot rồi bấm Kiểm tra lại.')); }),
        action('Mô phỏng tin "GIUP"', async () => { const r = await api('/api/admin/zalo/simulate', { method: 'POST', body: { text: 'GIUP' } }); out.replaceChildren(h('p', { class: r.ok ? 'ok' : 'bad' }, r.ok ? '✓ Bot xử lý và gửi phản hồi về Zalo chủ web thành công. Nếu khách vẫn không nhận được, lỗi nằm ở chiều Zalo → web (webhook/sự kiện/Cloudflare).' : '✗ Gửi phản hồi lỗi: ' + (r.replies?.[0]?.error || 'không rõ'))); }),
        action('Thử thông báo tới danh sách chủ web', async () => { await api('/api/admin/zalo/test', { method: 'POST' }); toast('Đã gửi.'); })),
      out,
      zcheck?.last?.length ? h('details', {}, h('summary', {}, 'Hoạt động Zalo gần đây'), table(['Lúc', 'Kết quả', 'Chi tiết'], zcheck.last.map((e) => h('tr', {}, h('td', {}, fmtDate(e.ts)), h('td', { class: e.ok ? 'ok' : 'bad' }, e.ok ? 'OK' : 'Lỗi'), h('td', { class: 'data' }, e.data || ''))))) : null),
    assistantTestCard(),
    zaloInboxCard(inbox),
    connectionLink(),
    card('Cài đặt Zalo', null, h('div', { class: 'grid' },
      check(z.enabled, (v) => { z.enabled = v; }, 'Bật tạo video qua Zalo'),
      check(z.allowGuests, (v) => { z.allowGuests = v; }, 'Cho người chưa có tài khoản web dùng ngay'),
      check(z.autoRender, (v) => { z.autoRender = v; }, 'Tự dựng video ngay (không chờ sửa trên web)'),
      h('label', {}, 'Kịch bản gửi qua Zalo được minh hoạ bằng', select([['mine-free', 'Luật tự động (miễn phí)'], ['mine-ai', 'AI (tốn lượt)']], z.scriptSource, (v) => { z.scriptSource = v; })),
      h('label', {}, 'Đường dẫn tư vấn Zalo (https://zalo.me/…)', input(z.botLink, (v) => { z.botLink = v.trim(); }))),
      h('h3', {}, 'Báo cho chủ web qua Zalo'),
      h('div', { class: 'grid' },
        check(z.notifyOwner.signup, (v) => { z.notifyOwner.signup = v; }, 'Người dùng mới qua Zalo'), check(z.notifyOwner.failed, (v) => { z.notifyOwner.failed = v; }, 'Video dựng lỗi'),
        check(z.notifyOwner.order, (v) => { z.notifyOwner.order = v; }, 'Đơn hàng và thanh toán'))),
    zaloFormatsCard(c, z),
    card('Chăm sóc lại khách đã hỏi giá', 'Một tin nhắn thân thiện duy nhất cho khách đã xem bảng giá mà chưa mua, sau một khoảng im lặng. Không gửi cho khách đã mua, khách đang được nhân viên trả lời, hoặc khách đã nói không muốn được nhắn. Biến: {ten} {goi}.',
      h('div', { class: 'grid' },
        check(z.followup.enabled, (v) => { z.followup.enabled = v; }, 'Bật nhắn chăm sóc lại'),
        h('label', {}, 'Sau bao nhiêu giờ im lặng', input(z.followup.hours, (v) => { z.followup.hours = v; }, { type: 'number', min: 4, max: 168 }))),
      h('label', {}, 'Lời nhắn', area(z.followup.text, (v) => { z.followup.text = v; }, 3))),
    card('Trợ lý AI trả lời như nhân viên', 'Tin nhắn không phải lệnh (câu hỏi, tư vấn gói, hỏi video tới đâu…) được AI trả lời dựa trên đúng giá gói, định dạng, tình trạng video của khách và ghi chú dưới đây. Câu khó, khiếu nại, lỗi thanh toán được chuyển về Zalo chủ web; chủ web trả lời bằng TL <mã khách> <lời nhắn>.',
      h('div', { class: 'grid' },
        check(z.assistant.enabled, (v) => { z.assistant.enabled = v; }, 'Bật trợ lý AI'),
        check(z.assistant.makeVideos, (v) => { z.assistant.makeVideos = v; }, 'Tự làm video khi khách nhờ bằng lời'),
        check(z.assistant.handoff, (v) => { z.assistant.handoff = v; }, 'Chuyển câu khó cho chủ web'),
        h('label', {}, 'Tên trợ lý', input(z.assistant.name, (v) => { z.assistant.name = v; }, { maxlength: 40 })),
        h('label', {}, 'AI trả lời', select([['auto', `Theo cài đặt chung (${c.labels.ai?.[c.defaults.textAI] || c.defaults.textAI})`], ...Object.entries(c.labels.ai)], z.assistant.ai || 'auto', (v) => { z.assistant.ai = v; })),
        h('label', {}, 'Số câu AI trả lời / khách / ngày', input(z.assistant.perDay, (v) => { z.assistant.perDay = v; }, { type: 'number', min: 1 })),
        h('label', {}, 'Số tin một khách được nhắn / ngày (0 = không giới hạn)', input(z.perDay, (v) => { z.perDay = v; }, { type: 'number', min: 0 })),
        h('label', {}, 'Sticker chào (mã từ stickers.zaloapp.com, để trống = không gửi)', input(z.stickers.welcome, (v) => { z.stickers.welcome = v.trim(); })),
        h('label', {}, 'Sticker cảm ơn khi khách thanh toán', input(z.stickers.thanks, (v) => { z.stickers.thanks = v.trim(); }))),
      h('p', { class: 'muted' }, 'Zalo của chủ web không bị giới hạn. Mỗi tin chỉ tính một lần (hệ thống thử lại không trừ thêm). Quá số câu AI, bot vẫn trả lời bằng câu soạn sẵn và ghi lý do vào nhật ký.'),
      h('label', {}, 'Phong cách trả lời', area(z.assistant.persona, (v) => { z.assistant.persona = v; }, 2)),
      h('label', {}, 'Kiến thức riêng (chính sách, khuyến mãi đang chạy, giờ hỗ trợ, câu hỏi thường gặp…). Trợ lý chỉ nói những gì có ở đây và trong cài đặt gói.', area(z.assistant.knowledge, (v) => { z.assistant.knowledge = v; }, 8))),
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

/** Bounded upload with visible progress; never leave the admin waiting on a silent fetch. */
function uploadSiteFile(file, progress = () => {}) {
  if (!file.size || file.size > 60 * 1024 * 1024) return Promise.reject(new Error('Tệp cần nhỏ hơn 60 MB.'));
  const inferred = {mp4:'video/mp4',webm:'video/webm',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',mp3:'audio/mpeg',m4a:'audio/mp4'}[file.name.split('.').pop().toLowerCase()];
  if (!inferred) return Promise.reject(new Error('Định dạng không hỗ trợ. Video cần là MP4 hoặc WebM.'));
  return new Promise((resolve,reject) => {
    const xhr = new XMLHttpRequest(); xhr.open('POST','/api/admin/site-media'); xhr.timeout=180000;
    xhr.setRequestHeader('x-nv','1'); xhr.setRequestHeader('content-type',inferred);
    xhr.upload.onprogress=e=>progress(e.lengthComputable ? Math.round(e.loaded/e.total*100) : null);
    xhr.onload=()=>{let data;try{data=JSON.parse(xhr.responseText);}catch{return reject(new Error('Máy chủ không trả dữ liệu hợp lệ (HTTP '+xhr.status+'). Vui lòng thử lại.'));}
      if(xhr.status<200||xhr.status>=300||!data.ref)return reject(new Error(data.error||'Tải lên thất bại (HTTP '+xhr.status+').'));
      resolve(data);
    };
    xhr.onerror=()=>reject(new Error('Mất kết nối khi tải tệp. Kiểm tra mạng rồi thử lại.'));
    xhr.ontimeout=()=>reject(new Error('Tải lên quá 3 phút. Hãy thử video nhỏ hơn hoặc kiểm tra kết nối.'));
    xhr.onabort=()=>reject(new Error('Đã hủy tải tệp.')); xhr.send(file);
  });
}

/** A home page picture/video: paste an https address or upload a file (stored as "site:…"). */
function mediaField(label, value, onChange, accept = 'image/png,image/jpeg,image/webp,video/mp4,video/webm') {
  const preview = h('div', { class: 'media-preview' });
  const uploadStatus=h('p',{class:'muted','aria-live':'polite',role:'status'});
  const paint = (v) => {
    const url = siteUrl(v);
    preview.replaceChildren(!v ? h('span', { class: 'muted' }, 'Chưa có') : /\.(mp4|webm)(?:[?#]|$)/i.test(v) ? h('video', { src: url, muted: true, controls: true, preload: 'metadata' }) : h('img', { src: url, alt: '' }));
  };
  const box = input(value, (v) => { onChange(v.trim()); paint(v.trim()); }, { placeholder: 'https://… hoặc bấm Tải lên' });
  const file = h('input', { type: 'file', accept, hidden: true, onchange: async () => {
    const f = file.files[0]; if (!f) return;
    try {
      uploadBtn.disabled=true; uploadBtn.textContent='Đang tải…';uploadStatus.textContent='Đang tải '+f.name+'…';
      const data = await uploadSiteFile(f,p=>{uploadBtn.textContent=p===100?'Đang lưu…':p===null?'Đang tải…':'Đang tải '+p+'%';uploadStatus.textContent=f.name+' · '+uploadBtn.textContent;});
      box.value = data.ref; onChange(data.ref); paint(data.ref);uploadStatus.textContent='Đã tải '+f.name+'. Video/ảnh xem trước ở bên dưới. Bấm Lưu cài đặt để hiển thị trên web.'; toast('Đã tải lên. Bấm Lưu cài đặt để áp dụng.');
    } catch (e) { uploadStatus.textContent='Chưa tải được '+f.name+': '+e.message;fail(e); } finally { uploadBtn.disabled=false;uploadBtn.textContent='Tải lên'; }
    file.value = '';
  } });
  const uploadBtn=h('button',{type:'button',class:'ghost small',onclick:()=>file.click()},'Tải lên');
  paint(value);
  return h('div', { class: 'mediafield' }, h('label', {}, label, box), h('div', { class: 'row' },
    uploadBtn,
    h('button', { type: 'button', class: 'ghost small', onclick: () => { box.value = ''; onChange(''); paint('');uploadStatus.textContent=''; } }, 'Bỏ')), uploadStatus,preview, file);
}

function siteCard(c) {
  const list = h('div', { class: 'scenes' });
  const draw = () => list.replaceChildren(...c.site.showcase.map((m, i) => h('div', { class: 'scene' },
    h('div', { class: 'grid wide' }, h('label', {}, 'Tiêu đề', input(m.title, (v) => { m.title = v; }, { maxlength: 60 })), h('label', {}, 'Mô tả ngắn', input(m.caption, (v) => { m.caption = v; }, { maxlength: 120 }))),
    h('div', { class: 'grid wide' }, mediaField('Video trình diễn (MP4/WebM, dọc hoặc ngang)', m.video, (v) => { m.video = v; }, 'video/mp4,video/webm'), mediaField('Ảnh bìa (poster)', m.poster, (v) => { m.poster = v; }, 'image/png,image/jpeg,image/webp')),
    h('div', { class: 'row' },
      i > 0 ? h('button', { type: 'button', class: 'ghost small', onclick: () => { c.site.showcase.splice(i - 1, 0, c.site.showcase.splice(i, 1)[0]); draw(); } }, '↑ Lên') : null,
      h('button', { type: 'button', class: 'ghost small danger', onclick: () => { c.site.showcase.splice(i, 1); draw(); } }, 'Bỏ video')))));
  const bulkStatus=h('p',{class:'muted',role:'status','aria-live':'polite'});
  const bulk=h('input',{type:'file',accept:'video/mp4,video/webm',multiple:true,hidden:true,'aria-label':'Tải nhiều video trình diễn',onchange:async()=>{
    const files=Array.from(bulk.files||[]);if(!files.length)return;
    let added=0,errors=0;const failures=[];
    await busy(bulkBtn,'Đang tải video…',async()=>{
      for(const f of files){
        if(c.site.showcase.length>=12){errors++;continue;}
        try{
          if(f.size>60*1024*1024)throw new Error('Video vượt 60 MB.');
          const data=await uploadSiteFile(f,p=>{bulkBtn.textContent='Video '+(files.indexOf(f)+1)+'/'+files.length+' · '+(p===100?'Đang lưu…':p===null?'Đang tải…':p+'%');bulkStatus.textContent=f.name+' · '+bulkBtn.textContent;});
          c.site.showcase.push({title:f.name.replace(/\.(mp4|webm)$/i,'').slice(0,60),caption:'',video:data.ref,poster:''});added++;
        }catch(e){errors++;failures.push(f.name+": "+e.message);}
      }
    });
    bulk.value='';draw();bulkStatus.textContent='Đã tải '+added+' video. '+(added?'Video vừa tải đã có trong danh sách bên dưới; bấm Lưu cài đặt để áp dụng. ':'')+failures.join(' · ');if(failures.length)fail(new Error(failures.join('\n')));toast(`Đã tải ${added} video${errors?' · '+errors+' tệp chưa thêm được (kiểm tra định dạng, dung lượng và giới hạn 12 video)':''}. Bấm Lưu cài đặt để áp dụng.`);
  }});
  const bulkBtn=h('button',{type:'button',class:'ghost small',onclick:()=>bulk.click()},'Tải nhiều video');
  draw();
  return card('Trang chủ: trình diễn video', 'Danh sách dưới đây hiển thị cạnh tiêu đề. Từ 2 video, trình diễn tự chuyển khi video kết thúc; có nút dừng và chọn từng video. Để trống dùng mẫu dựng sẵn. Tệp tối đa 60 MB; nên dùng H.264 dưới 10 MB.',
    h('div', { class: 'grid wide' },
      h('label', {}, 'Tiêu đề lớn', input(c.site.heroTitle, (v) => { c.site.heroTitle = v; }, { maxlength: 120 })),
      h('label', {}, 'Đoạn giới thiệu', input(c.site.heroText, (v) => { c.site.heroText = v; }, { maxlength: 300 }))),
    h('div', { class: 'grid wide' }, mediaField('Ảnh/video mở đầu (tùy chọn)', c.site.heroMedia, (v) => { c.site.heroMedia = v; }), mediaField('Ảnh chờ cho video (poster)', c.site.heroPoster, (v) => { c.site.heroPoster = v; }, 'image/png,image/jpeg,image/webp')),
    h('h3', {}, 'Danh sách video trình diễn'), bulkBtn, bulkStatus,bulk, list,
    h('button', { type: 'button', class: 'ghost small', onclick: () => { if (c.site.showcase.length >= 12) return toast('Tối đa 12 video.'); c.site.showcase.push({ title: '', caption: '', video: '', poster: '' }); draw(); } }, '+ Thêm video trình diễn'));
}

function budgetCard(c) {
  const status = h('div', { class: 'budget-status' }, 'Đang đọc chi tiêu…');
  api('/api/admin/budget').then((b) => {
    const bar = (used, cap, label) => { const pct = cap ? Math.min(100, Math.round(used / cap * 100)) : 0; return h('div', {}, h('div', { class: 'row' }, h('b', {}, label), h('span', { class: pct >= 100 ? 'bad' : pct >= c.budget.warnPct ? 'warn' : 'muted' }, `${money(used)} / ${cap ? money(cap) : 'không giới hạn'}${cap ? ` (${pct}%)` : ''}`)), h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` }))); };
    status.replaceChildren(...[bar(b.day, c.budget.dailyVnd, 'Hôm nay'), bar(b.month, c.budget.monthlyVnd, 'Tháng này'),
      b.over ? h('p', { class: 'bad' }, '⚠ Đã chạm trần: AI viết/vẽ và giọng trả phí đang tạm chuyển sang cách miễn phí.') : null,
      b.top?.length ? h('details', {}, h('summary', {}, 'Tốn nhiều nhất 30 ngày'), table(['Loại', 'Lượt', 'Chi phí'], b.top.map((r) => h('tr', {}, h('td', {}, r.type), h('td', {}, num(r.n)), h('td', {}, money(r.cost)))))) : null].filter(Boolean));
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
  const LABEL_GROUPS = [['navigation','Menu trang chính'],['adminMenu','Menu quản trị']];
  const tplList = h('div', { class: 'scenes' });
  const drawTpls = () => tplList.replaceChildren(...c.templates.map((t, i) => h('div', { class: 'scene' },
    h('div', { class: 'grid' }, h('label', {}, 'Tên mẫu', input(t.title, (v) => { t.title = v; })), h('label', {}, 'Mã', input(t.id, (v) => { t.id = v; })),
      h('button', { type: 'button', class: 'ghost small danger', onclick: () => { c.templates.splice(i, 1); drawTpls(); } }, 'Bỏ mẫu')),
    h('label', {}, 'Kịch bản (mỗi đoạn cách nhau một dòng trống = một cảnh)', area(t.text, (v) => { t.text = v; }, 6)))));
  drawTpls();
  c.site.social ||= {}; c.site.helpBot ||= { enabled: true, name: 'Trợ lý', welcome: '', knowledge: '', perDay: 30 };
  const THEMES = [['aurora', 'Cực quang (mặc định)', 'linear-gradient(120deg,#4f46e5,#7c3aed,#db2777)'], ['ocean', 'Đại dương', 'linear-gradient(120deg,#0891b2,#0e7490,#1d4ed8)'],
    ['sunset', 'Hoàng hôn', 'linear-gradient(120deg,#f97316,#e11d48,#9333ea)'], ['forest', 'Rừng xanh', 'linear-gradient(120deg,#059669,#047857,#d97706)'], ['classic', 'Cổ điển (nền trắng)', 'linear-gradient(120deg,#2f6bff,#1748d6)']];
  const themeRow = h('div', { class: 'theme-pick' });
  const paintThemes = () => themeRow.replaceChildren(...THEMES.map(([k, name, g]) => h('button', { type: 'button', class: (c.site.theme || 'aurora') === k ? 'on' : '', 'aria-pressed': String((c.site.theme || 'aurora') === k),
    onclick: () => { c.site.theme = k; document.documentElement.dataset.theme = k; paintThemes(); } }, h('i', { style: 'background:' + g }), name)));
  paintThemes();
  const SOCIAL_NAMES = [['facebook', 'Facebook'], ['youtube', 'YouTube'], ['tiktok', 'TikTok'], ['instagram', 'Instagram'], ['zalo', 'Zalo OA'], ['threads', 'Threads'], ['x', 'X (Twitter)'], ['linkedin', 'LinkedIn']];
  const hb = c.site.helpBot;
  return [
    card('Giao diện', 'Bộ màu cho toàn trang. Bấm để xem trước ngay, rồi Lưu cài đặt để áp dụng cho mọi người.', themeRow,h('label',{},'Dòng chữ khi mở trang',input(c.site.loadingText||'Đang mở xưởng vẽ…',v=>{c.site.loadingText=v;},{maxlength:120,placeholder:'Đang mở xưởng vẽ…'}))),
    card('Mạng xã hội', 'Dán đường dẫn đầy đủ (https://…). Kênh nào có link sẽ hiện biểu tượng ở trang chủ và chân trang; để trống = ẩn.', h('div', { class: 'grid' },
      SOCIAL_NAMES.map(([k, name]) => h('label', {}, name, input(c.site.social[k], (v) => { c.site.social[k] = v.trim(); }, { type: 'url', placeholder: 'https://' }))))),
    card('Trợ lý hỗ trợ', 'Khung chat ở góc phải: AI hướng dẫn sử dụng và giải đáp thắc mắc. Dùng AI theo "Thứ tự AI"; khi AI lỗi sẽ trả lời theo câu hỏi thường gặp.',
      check(hb.enabled, (v) => { hb.enabled = v; }, 'Hiện trợ lý trên trang'),
      h('div', { class: 'grid' },
        h('label', {}, 'Tên trợ lý', input(hb.name, (v) => { hb.name = v; }, { maxlength: 40 })),
        h('label', {}, 'Số câu hỏi mỗi người mỗi ngày', input(hb.perDay, (v) => { hb.perDay = v; }, { type: 'number', min: 1, max: 1000 }))),
      h('label', {}, 'Lời chào', input(hb.welcome, (v) => { hb.welcome = v; }, { maxlength: 300 })),
      h('label', {}, 'Thông tin thêm cho trợ lý (giá, chính sách, liên hệ, câu hỏi hay gặp…)', area(hb.knowledge, (v) => { hb.knowledge = v; }, 6))),
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

// ---------------------------------------------------------------- training: prompts, learn from samples, stages
const STAGES = [['idea', 'Ý tưởng'], ['test', 'Thử nghiệm · chỉ quản trị'], ['live', 'Phát hành']];
const slug = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18) || 'dinh-dang';

/** Frames from a sample video (taken in the browser: nothing big is uploaded), or the pictures themselves. */
async function sampleFrames(files) {
  const out = [];
  const shot = (src, w, hgt) => { const k = Math.min(1, 480 / Math.max(w, hgt)), c = h('canvas', { width: Math.round(w * k), height: Math.round(hgt * k) }); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.72); };
  for (const f of files) {
    if (f.type.startsWith('image/')) {
      const img = await loadImg(URL.createObjectURL(f)); out.push(shot(img, img.naturalWidth, img.naturalHeight));
    } else if (f.type.startsWith('video/')) {
      const v = h('video', { muted: true, playsinline: true, preload: 'auto', src: URL.createObjectURL(f) });
      await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = () => no(new Error('Không đọc được video này.')); });
      for (const at of [0.08, 0.25, 0.45, 0.65, 0.85]) {
        v.currentTime = v.duration * at;
        await new Promise((ok) => { v.onseeked = ok; });
        out.push(shot(v, v.videoWidth, v.videoHeight));
      }
    }
    if (out.length >= 6) break;
  }
  return out.slice(0, 6);
}

function trainTab(c, briefs) {
  c.briefs ||= {}; c.formats ||= [];
  const formatsBox = h('div', { class: 'formats' });
  const paintFormats = () => formatsBox.replaceChildren(...(c.formats.length ? c.formats.map((f, i) => h('article', { class: 'fmt' },
    h('div', { class: 'fmt-head' }, h('b', {}, f.name || 'Chưa đặt tên'), h('span', { class: 'pill ' + (f.stage === 'live' ? 'done' : f.stage === 'test' ? 'running' : '') }, STAGES.find(([k]) => k === f.stage)?.[1]),
      h('button', { type: 'button', class: 'ghost small danger', onclick: () => { c.formats.splice(i, 1); paintFormats(); } }, 'Xoá')),
    h('div', { class: 'grid' },
      h('label', {}, 'Tên hiển thị', input(f.name, (v) => { f.name = v; }, { maxlength: 40 })),
      h('label', {}, 'Định dạng gốc', select(Object.entries(ui.labels.looks || {}).filter(([k]) => k !== 'doc' && k !== 'story'), f.base, (v) => { f.base = v; })),
      h('label', {}, 'Giai đoạn', select(STAGES, f.stage, (v) => { f.stage = v; paintFormats(); }))),
    h('label', {}, 'Lời dặn riêng cho AI (thêm vào prompt của định dạng gốc)', area(f.brief, (v) => { f.brief = v; }, 4)),
    h('label', {}, 'Ghi chú triển khai (dòng đầu hiện cho người dùng khi phát hành)', area(f.note, (v) => { f.note = v; }, 3)))) : [h('p', { class: 'muted' }, 'Chưa có định dạng riêng. Phân tích một video mẫu ở trên để AI đề xuất, hoặc thêm tay.')]));
  paintFormats();

  // learn from a sample
  const files = h('input', { type: 'file', accept: 'video/mp4,video/webm,video/quicktime,image/png,image/jpeg,image/webp', multiple: true });
  const notes = area('', () => {}, 3); notes.placeholder = 'Mô tả mẫu: kênh nào, vì sao hiệu quả, muốn giống ở điểm nào (nhịp, nhân vật, chữ, âm thanh)…';
  const thumbs = h('div', { class: 'frames' }), result = h('div', { class: 'proposal' });
  let frames = [];
  files.addEventListener('change', async () => {
    thumbs.replaceChildren(h('small', { class: 'muted' }, 'Đang lấy khung hình…'));
    try { frames = await sampleFrames([...files.files]); thumbs.replaceChildren(...frames.map((src) => h('img', { src, alt: '' }))); }
    catch (e) { thumbs.replaceChildren(h('small', { class: 'bad' }, e.message)); }
  });
  const go = h('button', { type: 'button', onclick: async () => {
    go.disabled = true; go.textContent = 'AI đang phân tích…'; result.replaceChildren();
    try {
      const r = await api('/api/admin/train/analyze', { method: 'POST', body: { frames, notes: notes.value } });
      const row = (k, v) => (v && (!Array.isArray(v) || v.length) ? [h('dt', {}, k), h('dd', {}, Array.isArray(v) ? h('ol', {}, v.map((x) => h('li', {}, x))) : v)] : []);
      result.replaceChildren(h('h3', {}, r.name), h('p', {}, r.summary), h('dl', { class: 'kv' }, ...row('Định dạng gốc', ui.labels.looks?.[r.base] || r.base), ...row('Cấu trúc', r.structure), ...row('Nhịp', r.pacing), ...row('Hình ảnh', r.visuals), ...row('Âm thanh', r.audio), ...row('Lời dặn cho AI', r.brief), ...row('Các bước triển khai', r.stages)),
        h('button', { type: 'button', onclick: () => {
          c.formats.push({ id: slug(r.name) + '-' + Math.random().toString(36).slice(2, 5), name: r.name, base: r.base, brief: r.brief, stage: 'idea', created: Date.now(),
            note: [r.summary, r.stages?.length ? 'Kế hoạch: ' + r.stages.join(' → ') : ''].filter(Boolean).join('\n') });
          paintFormats(); toast('Đã thêm vào "Định dạng riêng" (giai đoạn Ý tưởng). Bấm Lưu cài đặt để giữ.');
        } }, 'Thêm thành định dạng riêng'));
    } catch (e) { fail(e); }
    go.disabled = false; go.textContent = 'AI phân tích mẫu';
  } }, 'AI phân tích mẫu');

  // the brief of each built-in format
  const briefRows = Object.entries(briefs).filter(([k]) => k !== 'story').map(([k, def]) => {
    const box = area(c.briefs[k] || def, (v) => { c.briefs[k] = v.trim() === def.trim() ? '' : v; tag.textContent = c.briefs[k] ? 'Đã chỉnh' : 'Mặc định'; }, 6);
    const tag = h('span', { class: 'pill' + (c.briefs[k] ? ' running' : '') }, c.briefs[k] ? 'Đã chỉnh' : 'Mặc định');
    return h('details', { class: 'brief' }, h('summary', {}, h('b', {}, ui.labels.looks?.[k] || k), tag), box,
      h('button', { type: 'button', class: 'ghost small', onclick: () => { c.briefs[k] = ''; box.value = def; tag.textContent = 'Mặc định'; } }, 'Khôi phục mặc định'));
  });
  return [
    card('Học định dạng mới từ video mẫu', 'Tải một video mẫu (hoặc vài ảnh chụp màn hình). Trình duyệt lấy 5 khung hình, AI nhận diện cấu trúc, nhịp, hình ảnh, âm thanh và đề xuất định dạng mới dựa trên một định dạng gốc.',
      h('div', { class: 'grid wide-2' }, h('label', {}, 'Video hoặc ảnh mẫu', files), h('label', {}, 'Ghi chú về mẫu', notes)), thumbs, h('div', { class: 'row' }, go), result),
    card('Định dạng riêng', 'Ý tưởng: chỉ lưu lại. Thử nghiệm: quản trị viên tạo video thử bằng định dạng này. Phát hành: mọi người thấy trong mục "Định dạng riêng".',
      formatsBox, h('button', { type: 'button', class: 'ghost small', onclick: () => { c.formats.push({ id: 'moi-' + Math.random().toString(36).slice(2, 6), name: 'Định dạng mới', base: 'act', brief: '', note: '', stage: 'idea', created: Date.now() }); paintFormats(); } }, '+ Thêm tay')),
    card('Prompt của từng định dạng', 'Đây là phần hướng dẫn AI biên kịch cho mỗi định dạng. Sửa để sát nhu cầu; để như cũ là dùng bản mặc định.', ...briefRows),
    card('Lời dặn chung cho AI', 'Áp dụng cho mọi video, mọi định dạng (ví dụ: giọng văn của thương hiệu, điều cần tránh).', area(c.promptExtra, (v) => { c.promptExtra = v; }, 3)),
  ];
}

// ---------------------------------------------------------------- voices: what really reads, listen to each
function voiceTab(c, secrets, secretInput, data) {
  const st = data?.status || {}, list = data?.voices || [];
  const state = (ok, yes, no) => h('span', { class: 'pill ' + (ok ? 'done' : 'failed') }, ok ? yes : no);
  const audioBtn = (code) => { const b = h('button', { type: 'button', class: 'ghost small', onclick: () => window.nvPlayPreview?.('/api/voices/preview?code=' + encodeURIComponent(code), b) }, '▶'); return b; };
  return [
    card('Tình trạng', 'Người dùng chỉ thấy giọng đang đọc thật. Giọng chưa có khoá được đọc bằng giọng miễn phí cùng giới tính.',
      h('dl', { class: 'kv' },
        h('dt', {}, 'EverAI (giọng Việt tự nhiên)'), h('dd', {}, state(st.everai && !st.failing, 'Đang hoạt động', st.everai ? 'Có khoá nhưng đang lỗi' : 'Chưa có khoá')),
        h('dt', {}, 'Google Text-to-Speech'), h('dd', {}, state(true, st.google ? 'Có khoá riêng' : 'Dùng tài khoản máy dựng', '')),
        h('dt', {}, 'Giọng miễn phí'), h('dd', {}, state(true, 'Luôn sẵn sàng', '')),
        h('dt', {}, 'Máy dựng báo lần cuối'), h('dd', {}, st.runnerSeen ? fmtDate(st.runnerSeen) : 'Chưa có video nào được dựng'),
        st.failing ? h('dt', {}, 'Lần gần nhất phải đọc thay') : null, st.failing ? h('dd', {}, `${fmtDate(st.failing.at)} · ${st.failing.provider}${st.failing.error ? ' · ' + st.failing.error : ' · (máy dựng chưa gửi lý do)'}`) : null),
      st.everai ? h('div', { class: 'row' }, h('button', { type: 'button', class: 'ghost small', onclick: async (e) => {
        const b = e.currentTarget, out = b.nextElementSibling; b.disabled = true; out.textContent = 'Đang gọi EverAI…';
        try { const r = await api('/api/admin/voices/test', { method: 'POST', body: {} }); out.className = r.ok ? 'ok' : 'bad'; out.textContent = r.ok ? `✓ EverAI đọc được (${Math.round(r.bytes / 1024)} KB, ${(r.ms / 1000).toFixed(1)} giây). Đã bỏ trạng thái lỗi.` : '✗ ' + r.error; }
        catch (err) { out.className = 'bad'; out.textContent = '✗ ' + err.message; }
        b.disabled = false; } }, 'Thử EverAI ngay'), h('span', { class: 'muted' }, 'Đọc một câu ngắn bằng khoá đã lưu, báo đúng lỗi EverAI trả về.')) : null),
    connectionLink(),
    card('Giọng đang có', null, list.length ? table(['Giọng', 'Nhà cung cấp', 'Tình trạng', 'Nghe'], list.map((v) => h('tr', {}, h('td', {}, v.label), h('td', {}, v.provider), h('td', {}, v.ready ? state(true, 'Đọc thật', '') : h('span', { class: 'pill' }, 'Đọc thay bằng ' + (v.standIn || 'giọng miễn phí'))), h('td', {}, audioBtn(v.code)))))
      : h('p', { class: 'muted' }, 'Chưa tải được danh sách.')),
    card('Sửa danh sách giọng', 'Mỗi dòng: nhà cung cấp | mã giọng | tên hiển thị. Nhà cung cấp: everai, google, elevenlabs, free.',
      area(c.voices.map((v) => `${v.provider} | ${v.code} | ${v.label}`).join('\n'), (v) => { c.voices = v.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p.length >= 2 && p[1]).map(([provider, code, label]) => ({ provider, code, label: label || code })); }, 10)),
  ];
}
