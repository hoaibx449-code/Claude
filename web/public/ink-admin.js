// Quản trị → Ink Studio: render machines (own servers, Google Cloud Run, GitHub, browser later) with step-by-step
// setup, AI order and fallback, voices, default pace.
const MACHINE = { server: ['Máy chủ riêng', 'VPS, máy ảo cloud hoặc máy tính ở nhà chạy Ubuntu. Luôn bật, nhận video ngay, không giới hạn.'],
  cloudrun: ['Google Cloud Run', 'Dùng tài khoản Google Cloud sẵn có của dự án. Chỉ bật khi có video, trả tiền theo phút (gói miễn phí đủ vài trăm video/tháng).'],
  github: ['GitHub Actions', 'Miễn phí, không cần máy chủ. Hợp để thử nghiệm; điều khoản GitHub không cho dùng làm máy chủ phục vụ khách hàng.'],
  browser: ['Trình duyệt (máy người dùng)', 'Đang phát triển: vẽ và ghép video ngay trên máy tính/điện thoại của người dùng.'] };
const GUIDES = [
  ['Thuê máy chủ (VPS) ở đâu, cấu hình bao nhiêu?', [
    'Cấu hình tối thiểu: 2 nhân CPU, 4 GB RAM, 25 GB ổ cứng, hệ điều hành Ubuntu 22.04 hoặc 24.04. Video 1 phút dựng mất khoảng 3–4 phút.',
    'Nhà cung cấp phổ biến: Google Cloud (Compute Engine, máy e2-medium), DigitalOcean (Droplet 4 GB), Vultr, AWS Lightsail, hoặc nhà cung cấp Việt Nam như Viettel IDC, BizFly Cloud, VNPT.',
    'Không cần mở cổng nào: máy dựng tự kết nối ra trang web, nên để mặc định tường lửa là được.']],
  ['Google Cloud – tạo máy ảo (Compute Engine)', [
    'Vào console.cloud.google.com → chọn đúng dự án → Compute Engine → VM instances → Create instance.',
    'Region: asia-southeast1 (Singapore). Machine type: e2-medium (2 vCPU, 4 GB). Boot disk: Ubuntu 24.04 LTS, 25 GB.',
    'Bấm Create, đợi máy chạy rồi bấm nút SSH bên cạnh tên máy để mở cửa sổ dòng lệnh ngay trên trình duyệt.',
    'Dán lệnh cài đặt (bấm "Thêm máy chủ" ở trên để lấy lệnh) vào cửa sổ SSH, bấm Enter, đợi 2–4 phút tới khi hiện "Xong!".']],
  ['DigitalOcean / Vultr / AWS Lightsail / VPS Việt Nam', [
    'Tạo máy Ubuntu 22.04/24.04, gói 2 CPU – 4 GB RAM.',
    'Đăng nhập: trên máy tính mở Terminal (macOS) hoặc PowerShell (Windows) rồi gõ: ssh root@ĐỊA_CHỈ_IP_MÁY_CHỦ (mật khẩu hoặc khoá nhà cung cấp gửi). Nhiều nhà cung cấp có nút "Console" mở dòng lệnh trên web.',
    'Dán lệnh cài đặt, bấm Enter, đợi tới khi hiện "Xong!". Trên trang này máy chủ chuyển sang "Đang online" sau khoảng 10 giây.']],
  ['Máy tính ở nhà (Ubuntu hoặc Windows có WSL)', [
    'Ubuntu: mở Terminal và dán lệnh cài đặt.',
    'Windows 10/11: mở PowerShell bằng quyền quản trị, gõ wsl --install, khởi động lại máy, mở "Ubuntu" từ menu Start rồi dán lệnh cài đặt. Máy phải bật và có mạng thì mới dựng được.']],
  ['Đã có Docker (mọi loại máy chủ)', [
    'Tải mã nguồn repo về máy chủ, rồi: docker build -t faciup-ink ink',
    'Chạy: docker run -d --restart always --name faciup-ink -e NV_API_URL=ĐỊA_CHỈ_TRANG -e RUNNER_TOKEN=MÃ_KẾT_NỐI faciup-ink python -m ink.site --loop']],
  ['Google Cloud Run (không cần máy chủ luôn bật)', [
    'Điều kiện: dự án Google Cloud phải bật thanh toán. Vào console.cloud.google.com → Billing → Link a billing account (thêm thẻ). Cloud Run có gói miễn phí hằng tháng, video 1 phút dùng khoảng 8 phút CPU nên vài trăm video/tháng thường không mất phí.',
    'Dự án đã nối sẵn Google Cloud (secret GCP_SA_KEY trên GitHub). Vào GitHub → tab Actions → "Ink Studio — triển khai lên Google Cloud" → Run workflow. Khi mã máy dựng thay đổi, workflow này tự chạy lại.',
    'Xong là trang web tự bật Cloud Run mỗi khi có video chờ, dựng xong tự tắt. Bật mục Google Cloud Run trong danh sách máy dựng ở trên.']],
  ['Theo dõi, cập nhật, gỡ bỏ máy chủ', [
    'Xem nhật ký: sudo journalctl -u faciup-ink -f   ·   Khởi động lại: sudo systemctl restart faciup-ink',
    'Cập nhật: tự động. Mỗi lần trang web có bản mới, máy chủ tự tải về khi rảnh.',
    'Gỡ bỏ: sudo systemctl disable --now faciup-ink && sudo rm -rf /opt/faciup-ink /etc/systemd/system/faciup-ink.service, rồi bấm Xoá máy chủ trên trang này để thu hồi mã.']],
];
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
  wake.onclick = async () => { try { await api('/api/admin/ink/dispatch', { method: 'POST' }); toast('Đã đánh thức máy dựng. Video chờ sẽ được nhận trong khoảng 1 phút.'); } catch (e) { fail(e); } };
  const when = (t) => (t ? new Date(t).toLocaleString('vi-VN') : '—');
  const M = data.machines || { seen: [], servers: [], cloud: false, version: '' };
  const ready = { server: M.seen.some((x) => x.kind === 'server' && x.online), cloudrun: M.cloud, github: data.token, browser: false };
  // where videos are made: tick to use, arrows to set the order (the first that can take the job makes it)
  const machines = h('ol', { class: 'ink-machines' });
  const paintMachines = () => machines.replaceChildren(...s.machines.order.map((k, i) => h('li', { class: 'ink-machine' + (k === 'browser' ? ' off' : '') },
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!s.machines.on[k], disabled: k === 'browser', onchange: (e) => { s.machines.on[k] = e.target.checked; } }), h('strong', {}, MACHINE[k][0])),
    h('span', { class: 'chip' + (ready[k] ? ' ok' : '') }, k === 'browser' ? 'Đang phát triển' : ready[k] ? '✓ Sẵn sàng' : '✗ Chưa thiết lập'),
    h('small', { class: 'muted' }, MACHINE[k][1]),
    h('span', { class: 'ink-move' },
      h('button', { type: 'button', class: 'ghost small', 'aria-label': 'Lên', disabled: i === 0, onclick: () => { const o = s.machines.order; [o[i - 1], o[i]] = [o[i], o[i - 1]]; paintMachines(); } }, '↑'),
      h('button', { type: 'button', class: 'ghost small', 'aria-label': 'Xuống', disabled: i === s.machines.order.length - 1, onclick: () => { const o = s.machines.order; [o[i + 1], o[i]] = [o[i], o[i + 1]]; paintMachines(); } }, '↓')))));
  paintMachines();
  const online = h('div', { class: 'ink-online' }, M.seen.length ? M.seen.map((x) => h('div', { class: 'row' }, h('span', { class: 'chip' + (x.online ? ' ok' : '') }, x.online ? '● Đang online' : '○ Ngoại tuyến'),
    h('strong', {}, x.name), h('small', { class: 'muted' }, `${MACHINE[x.kind]?.[0] || x.kind} · lần cuối ${when(x.at)}${x.version ? ' · bản ' + x.version : ''}`))) : h('p', { class: 'muted' }, 'Chưa có máy dựng nào kết nối.'));
  const newCmd = h('div');
  const servers = h('div', {}, M.servers.map((x) => h('div', { class: 'row' }, h('strong', {}, x.name), h('small', { class: 'muted' }, 'thêm ngày ' + when(x.created)),
    h('button', { type: 'button', class: 'ghost small danger', onclick: async () => { if (!confirm(`Xoá máy chủ "${x.name}"? Mã kết nối của nó hết hiệu lực ngay.`)) return; try { await api('/api/admin/ink/servers/' + x.id, { method: 'DELETE' }); toast('Đã xoá.'); showInkAdmin({ h, api, body, toast, fail }); } catch (e) { fail(e); } } }, 'Xoá'))));
  const sname = h('input', { placeholder: 'Tên máy chủ, ví dụ: VPS Singapore', maxlength: 40 });
  const add = h('button', { type: 'button', class: 'btn' }, 'Thêm máy chủ');
  add.onclick = async () => {
    try {
      const r = await api('/api/admin/ink/servers', { method: 'POST', body: { name: sname.value } });
      const code = h('pre', { class: 'ink-cmd' }, r.command), copy = h('button', { type: 'button', class: 'ghost small' }, 'Sao chép lệnh');
      copy.onclick = async () => { try { await navigator.clipboard.writeText(r.command); copy.textContent = 'Đã sao chép'; } catch { toast('Hãy chọn và sao chép thủ công.'); } };
      newCmd.replaceChildren(h('div', { class: 'card ink-new' }, h('h3', {}, 'Lệnh cài đặt cho máy chủ mới'),
        h('p', {}, 'Đăng nhập vào máy chủ (SSH), dán lệnh dưới đây và bấm Enter. Lệnh chứa mã kết nối riêng, chỉ hiện một lần: đừng chia sẻ.'), code, copy));
    } catch (e) { fail(e); }
  };

  body.replaceChildren(
    card('Trạng thái', 'Trang web giữ hàng chờ và giao video cho máy dựng theo thứ tự bạn chọn bên dưới.',
      h('div', { class: 'row' }, tick(s.enabled, (x) => { s.enabled = x; }, 'Bật Ink Studio cho người dùng')),
      h('div', { class: 'row' }, key(data.keys.gemini, 'Gemini'), key(data.keys.openai, 'OpenAI'), key(data.keys.everai, 'EverAI')),
      online,
      data.wakeError ? h('p', { class: 'error' }, 'Không giao được video cho máy dựng: ' + data.wakeError) : null, wake),
    card('Máy dựng', 'Tick để dùng, dùng mũi tên để xếp thứ tự. Video được giao cho máy đầu tiên sẵn sàng; máy đó không được thì chuyển sang máy kế tiếp.',
      machines, h('p', { class: 'muted' }, 'Bấm "Lưu cài đặt" ở cuối trang sau khi thay đổi.')),
    card('Máy chủ riêng', 'Một lệnh duy nhất cài máy dựng lên máy chủ Ubuntu/Debian: tự cài thư viện, tự chạy nền, tự bật lại khi máy khởi động và tự cập nhật khi trang có bản mới.',
      servers, h('div', { class: 'row' }, sname, add), newCmd,
      h('div', { class: 'ink-guides' }, h('h3', {}, 'Hướng dẫn chi tiết'), GUIDES.map(([t, steps]) => h('details', {}, h('summary', {}, t), h('ol', {}, steps.map((x) => h('li', {}, x))))))),
    card('GitHub Actions', 'Token GitHub loại fine-grained, chỉ cấp quyền Actions: Read and write cho đúng repo này. Token được mã hoá, không hiển thị lại.',
      h('p', { class: 'muted' }, 'Lần đánh thức GitHub gần nhất: ' + when(data.lastDispatch)),
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
