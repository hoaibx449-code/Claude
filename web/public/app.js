// Nét Vẽ Studio — browser app. All user text is inserted with textContent, never as HTML.
'use strict';

// Every name shown here comes from the admin settings (/api/me → ui); see web/src/settings.ts.
let ui = { brand: {}, labels: { styles: {}, tools: {}, kinds: {}, visual: {}, actions: {}, ai: {}, sources: {} }, texts: {}, enabledStyles: [], enabledSources: [], defaults: {}, voices: [], visibility: {}, templates: [], plans: [], zalo: {}, payment: {} };
const T = (k) => ui.texts?.[k] ?? k;
const L = (group, k) => ui.labels?.[group]?.[k] ?? k;
/** Visibility the admin chose for an option: on · dev (greyed, "đang phát triển") · hidden. */
const V = (key) => ui.visibility?.[key] || 'on';
const DEV = ' (đang phát triển)';
const view = document.getElementById('view');
/** Replace the page content; null/false entries (optional sections) are skipped. */
const show = (...nodes) => { view.replaceChildren(...nodes.flat().filter((n) => n != null && n !== false)); view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); };
/** Placeholder blocks shown while a page loads, so nothing feels frozen. */
const skeleton = (n = 3, cls = 'sk-card') => h('div', { class: 'sk-grid' }, Array.from({ length: n }, () => h('div', { class: 'sk ' + cls })));
/** Button feedback while waiting: spinner + text, restored afterwards. */
async function busy(btn, text, fn) {
  if (!btn) return fn();
  const old = [...btn.childNodes];
  btn.disabled = true; btn.classList.add('busy'); btn.replaceChildren(h('i', { class: 'spin' }), text);
  try { return await fn(); } finally { btn.disabled = false; btn.classList.remove('busy'); btn.replaceChildren(...old); }
}
// every button and button-like link answers the finger: a ripple from where it was pressed
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest?.('button, .btn, .chip, .tabbar a, .proj, .vcard, .mode');
  if (!b || b.disabled) return;
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2;
  const w = h('span', { class: 'ripple', style: `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px` });
  b.append(w); setTimeout(() => w.remove(), 600);
  navigator.vibrate?.(5);
}, { passive: true });
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
/** <option>s from [value, label, visibilityKey?]: hidden ones are left out, "dev" ones are greyed out. */
function options(list, selected) {
  return list.filter(([, , vk]) => !vk || V(vk) !== 'hidden')
    .map(([v, label, vk]) => h('option', { value: v, selected: v === selected, disabled: vk && V(vk) === 'dev' }, label + (vk && V(vk) === 'dev' ? DEV : '')));
}
function applyUI(next) {
  if (!next) return;
  ui = next;
  document.getElementById('brandName').textContent = ui.brand.name;
  document.getElementById('brandAccent').textContent = ui.brand.accent || '';
  document.title = [ui.brand.name, ui.brand.accent].filter(Boolean).join(' ');
  document.querySelector('meta[name=description]')?.setAttribute('content', ui.brand.tagline || '');
  document.getElementById('logout').textContent = T('logout');
  document.getElementById('adminLink').textContent = T('admin');
}
const styleOptions = () => Object.keys(ui.labels.styles).map((k) => [k, L('styles', k), 'style:' + k]).filter(([k]) => ui.enabledStyles.includes(k) || V('style:' + k) === 'dev');
const voiceOptions = () => ui.voices.map((v) => [v.code, v.label, 'voice:' + v.code]);
const ratioOptions = (long) => [['9:16', long ? 'Dọc 9:16 (TikTok, Shorts, Reels)' : 'Dọc 9:16', 'ratio:9:16'], ['16:9', long ? 'Ngang 16:9 (YouTube)' : 'Ngang 16:9', 'ratio:16:9']];

// ---------- visitor id + activity tracking (what was clicked, viewed, broke)
const VID = (() => { try { let v = localStorage.getItem('nv_vid'); if (!v) { v = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('nv_vid', v); } return v; } catch { return ''; } })();
const queue = [];
let flushTimer = null, viewStart = Date.now(), currentView = '';
function track(type, data, extra = {}) {
  queue.push({ type: 'ui.' + type, ts: Date.now(), path: location.hash || '#/', data, ...extra });
  if (queue.length >= 25) flush(); else if (!flushTimer) flushTimer = setTimeout(flush, 5000);
}
function flush() {
  clearTimeout(flushTimer); flushTimer = null;
  if (!queue.length) return;
  const events = queue.splice(0, 30);
  fetch('/api/events', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'x-nv': '1', 'x-visitor': VID, 'content-type': 'application/json' }, body: JSON.stringify({ events }) }).catch(() => {});
}
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { track('leave', { view: currentView, sec: Math.round((Date.now() - viewStart) / 1000) }); flush(); } });
addEventListener('error', (e) => track('error', { msg: String(e.message).slice(0, 200), at: `${e.filename}:${e.lineno}` }));
addEventListener('unhandledrejection', (e) => track('error', { msg: String(e.reason?.message || e.reason).slice(0, 200) }));
// any element with data-ev is a tracked click
document.addEventListener('click', (e) => { const el = e.target.closest?.('[data-ev]'); if (el) track('click', { what: el.dataset.ev }); }, true);
function viewed(name, data) {
  if (currentView) track('leave', { view: currentView, sec: Math.round((Date.now() - viewStart) / 1000) });
  currentView = name; viewStart = Date.now();
  track('view', { view: name, ...data });
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET', credentials: 'same-origin',
    headers: { 'x-nv': '1', 'x-visitor': VID, ...(opts.body ? { 'content-type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Lỗi ${res.status}`); e.status = res.status; e.data = data; throw e; }
  return data;
}
let toastTimer;
/** Short message; errors that a plan upgrade would fix get a link to the plans page. */
function toast(msg, err) {
  const t = document.getElementById('toast');
  t.replaceChildren(msg);
  const up = err?.data?.upgrade;
  if (up && V('feature:plans') === 'on') t.append(' ', h('a', { href: '#/goi', 'data-ev': 'toast-upgrade', onclick: () => { t.hidden = true; } }, `Nâng cấp ${up.name}`));
  t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, up ? 8000 : 4500);
}
const fail = (e) => toast(e.message, e);
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
const money = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const JOB_TEXT = { queued: 'Đang chờ', running: 'Đang dựng', done: 'Xong', failed: 'Lỗi' };
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

// ---------- boot & routing
let cfg = null; // sign-in config + public settings, also for guests
async function boot() {
  document.getElementById('logout').addEventListener('click', async () => {
    track('click', { what: 'logout' }); flush();
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    location.hash = '#/'; location.reload();
  });
  document.getElementById('loginBtn').addEventListener('click', () => openLogin('header'));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  // iOS ignores user-scalable=no: block pinch zoom so the app feels native
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  // paint at once from what this browser saw last time, then refresh in the background
  let cached = null;
  try { cached = JSON.parse(store.get('nv_boot') || 'null'); } catch {}
  const fresh = Promise.all([api('/api/auth/config').catch(() => null), api('/api/me').catch((e) => (e.status === 401 ? null : undefined))]);
  // a page that needs an account waits for the real answer (no login sheet flashing at a signed-in user)
  if (cached?.cfg && (cached.me || PUBLIC[location.hash.split('?')[0]])) {
    cfg = cached.cfg; applyUI(cfg.ui); me = cached.me || null; if (me) applyUI(me.ui);
  } else {
    cached = null;
    const [c, m] = await fresh; cfg = c || { ui: null }; applyUI(cfg.ui); me = m || null; if (me) applyUI(me.ui);
  }
  paintHeader();
  window.addEventListener('hashchange', route);
  route();
  if (cached?.cfg) {
    const [c, m] = await fresh;
    const was = JSON.stringify([cfg?.ui, me?.user?.id, me?.ui, me?.plan, me?.admin]);
    if (c) { cfg = c; applyUI(cfg.ui); }
    if (m !== undefined) { me = m; if (me) applyUI(me.ui); }
    paintHeader();
    // repaint only if something visible changed (signed out elsewhere, admin renamed things...)
    if (JSON.stringify([cfg?.ui, me?.user?.id, me?.ui, me?.plan, me?.admin]) !== was && !location.hash.startsWith('#/p/')) { if (me) document.querySelector('.sheet-bg')?.remove(); route(); }
  }
  // nonce is single-use: never reuse a cached one
  store.set('nv_boot', JSON.stringify({ cfg: { ...cfg, nonce: null }, me }));
  cookieNotice();
  if (me?.needConsent) consentAgain();
  // something the guest wanted before signing in
  if (me) { let after = null; try { after = JSON.parse(sessionStorage.getItem('nv_after') || 'null'); sessionStorage.removeItem('nv_after'); } catch {} if (after) resume(after); }
}
function paintHeader() {
  const acc = document.getElementById('account');
  document.getElementById('loginBtn').hidden = !!me;
  document.getElementById('logout').hidden = !me;
  acc.hidden = !me;
  if (me) { acc.textContent = (me.user.name || me.user.email || '?').trim().charAt(0).toUpperCase(); document.getElementById('whoEmail').textContent = me.user.email; }
  document.getElementById('adminLink').hidden = !me?.admin;
}
function markNav(name) {
  for (const a of document.querySelectorAll('[data-route]')) a.classList.toggle('on', a.dataset.route === name);
}
const PUBLIC = { '': 1, '#/': 1, '#/mau': 1, '#/goi': 1, '#/tao': 1, '#/thu': 1, '#/dieu-khoan': 1, '#/bao-mat': 1, '#/hoan-tien': 1, '#/cong-dong': 1, '#/dang-nhap-loi': 1 };
function route() {
  stopPreview(); stopDemos();
  // a window left open (payment, player, sign-in) never follows the user to another page
  document.querySelectorAll('.sheet-bg').forEach((x) => x.remove());
  const hash = location.hash.split('?')[0];
  const m = hash.match(/^#\/p\/([a-f0-9]{24})$/), w = hash.match(/^#\/xem\/([a-f0-9]{24})\/([a-f0-9]{24})$/);
  markNav(hash === '#/' || hash === '' ? 'home' : w ? 'video' : hash.slice(2));
  if (hash === '#/dang-nhap-loi') { toast(new URLSearchParams(location.hash.split('?')[1] || '').get('m') || 'Đăng nhập chưa thành công.'); history.replaceState(null, '', '#/'); }
  scrollTo(0, 0);
  if (!me && !PUBLIC[hash] && !m) { showLanding().catch(fatal); return openLogin('route', { hash }); }
  if (!me && (m || w)) { showLanding().catch(fatal); return openLogin('route', { hash }); }
  const go = m ? showEditor(m[1])
    : w ? showWatch(w[1], w[2])
    : hash === '#/cong-dong' ? showCommunity()
    : hash.startsWith('#/admin') && me?.admin ? showAdmin()
    : hash === '#/goi' ? showPlans()
    : hash === '#/zalo' ? showZalo()
    : hash === '#/mau' ? showStyles()
    : hash === '#/tao' ? showCreate()
    : hash === '#/thu' ? showTry()
    : hash === '#/video' ? showVideos()
    : hash === '#/tai-khoan' ? showAccount()
    : hash === '#/dieu-khoan' ? showLegal('terms')
    : hash === '#/bao-mat' ? showLegal('privacy')
    : hash === '#/hoan-tien' ? showLegal('refund')
    : me ? showStudio() : showLanding();
  go.catch(fatal);
}
function fatal(e) {
  track('error', { msg: String(e.message || e).slice(0, 200), fatal: true });
  show(h('div', { class: 'card' }, h('p', { class: 'error' }, e.message || String(e)), h('a', { href: '#/' }, 'Về trang chủ')));
}
function resume(after) {
  if (after.hash) { location.hash = after.hash; return; }
  if (after.create) { location.hash = '#/tao'; setTimeout(() => createProject(after.create), 300); }
}
const footer = () => h('footer', { class: 'site' },
  h('span', {}, '© ' + new Date().getFullYear() + ' ' + (ui.legal?.company || ui.brand.name)),
  h('a', { href: '#/dieu-khoan' }, 'Điều khoản sử dụng'), h('a', { href: '#/bao-mat' }, 'Chính sách bảo mật'), h('a', { href: '#/hoan-tien' }, 'Hoàn tiền'),
  ui.legal?.email ? h('a', { href: 'mailto:' + ui.legal.email }, ui.legal.email) : null);

// ---------- live demo videos (the real engine, playing in the page)
let demoSet = null, demoRuns = [], demoObserver = null;
const getDemos = () => (demoSet ||= fetch('/demos.json').then((r) => r.json()).catch(() => []));
/** Play a spec in a canvas while it is on screen; returns a handle to restyle it. */
function playDemo(canvas, spec, { dpr = 0.6 } = {}) {
  const run = { canvas, spec, model: null, t: 0, last: 0, raf: 0, visible: false, async build() {
    const s = run.spec, { W, H } = NV.logicalSize(s.ratio);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    run.model = await previewModel(s, dpr); run.t = Math.min(run.t, run.model.timeline.duration);
    if (!run.visible) NV.renderFrame(canvas.getContext('2d'), run.model, Math.min(run.model.timeline.duration - 0.6, run.model.timeline.scenes[0].end - 0.4));
  } };
  const loop = (ts) => {
    if (!run.visible || !run.model) return;
    run.t += run.last ? Math.min(0.1, (ts - run.last) / 1000) : 0; run.last = ts;
    if (run.t > run.model.timeline.duration) run.t = 0;
    NV.renderFrame(canvas.getContext('2d'), run.model, run.t);
    run.raf = requestAnimationFrame(loop);
  };
  run.restyle = async (style) => { run.spec = { ...run.spec, style }; delete run.spec.tool; run.t = 0; await run.build(); };
  demoObserver ||= new IntersectionObserver((entries) => {
    for (const en of entries) {
      const r = demoRuns.find((x) => x.canvas === en.target);
      if (!r) continue;
      r.visible = en.isIntersecting && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (r.visible) { r.last = 0; cancelAnimationFrame(r.raf); r.raf = requestAnimationFrame(r.loop); }
    }
  }, { threshold: 0.35 });
  run.loop = loop;
  demoRuns.push(run);
  run.build().then(() => demoObserver.observe(canvas)).catch(() => {});
  return run;
}
function stopDemos() { for (const r of demoRuns) { r.visible = false; cancelAnimationFrame(r.raf); demoObserver?.unobserve(r.canvas); } demoRuns = []; }

// ---------- landing (guests)
const FORMAT_INFO = [
  ['📋', 'Danh sách Top N', 'Mỗi cảnh một ý, số thứ tự khoanh to'], ['🧭', 'Hướng dẫn từng bước', 'Bước 1, 2, 3 kèm dấu ✓'], ['📖', 'Kể chuyện', 'Người que chuyển động, bong bóng thoại'],
  ['📊', 'Số liệu – tài chính', 'Biểu đồ vẽ tay, con số khổng lồ'], ['⚖️', 'So sánh đúng – sai', 'Hai cột ✗ / ✓ rõ ràng'], ['🛍️', 'Giới thiệu sản phẩm', 'Nỗi đau → giải pháp → lợi ích'],
  ['🔥', 'Truyền cảm hứng', 'Câu chốt viết tay, nhịp chậm'], ['❓', 'Hỏi – đáp', 'Dấu hỏi lớn rồi lời giải'], ['🧠', 'Giải thích khái niệm', 'Ẩn dụ đời thường, mũi tên nối ý'], ['📰', 'Tin tức', 'Mốc thời gian, con số chính'],
];
const STYLE_SHOW = ['sunset', 'cosmos', 'manim', 'bold', 'neon', 'comic', 'pastel', 'darkboard', 'chalkboard', 'whiteboard', 'kraft', 'newspaper', 'blueprint', 'pencil', 'ricepaper', 'oly', 'notebook'];

async function showLanding() {
  viewed('landing');
  const demos = await getDemos();
  const heroCanvas = h('canvas', { 'aria-label': 'Video minh hoạ' });
  const chips = h('div', { class: 'chips' });
  const heroStyles = STYLE_SHOW.filter((k) => ui.enabledStyles.includes(k)).slice(0, 6);
  const tryBox = h('textarea', { rows: 4, maxlength: 6000, placeholder: 'Dán vài câu kịch bản của bạn vào đây…' });
  const tryBtn = h('button', { type: 'button', class: 'big', 'data-ev': 'landing-try', onclick: () => startTry(tryBox.value, tryBtn) }, '✨ Xem thử miễn phí');
  show(
    h('section', { class: 'hero' },
      h('div', {},
        h('span', { class: 'badge' }, 'Không cần biết vẽ · Không cần dựng phim'),
        h('h1', { style: 'margin-top:14px' }, 'Biến kịch bản thành ', h('span', { class: 'grad-text' }, 'video bàn tay vẽ'), ' trong 1 phút'),
        h('p', { class: 'lead' }, ui.brand.tagline || 'Dán kịch bản, chọn phong cách, nhận video MP4 có giọng đọc tiếng Việt. Hợp TikTok, Reels, Shorts, YouTube.'),
        h('div', { class: 'cta' },
          h('a', { class: 'btn big', href: '#/tao', 'data-ev': 'hero-create' }, 'Tạo video miễn phí'),
          h('a', { class: 'btn ghost big', href: '#/mau', 'data-ev': 'hero-styles' }, 'Xem phong cách')),
        h('div', { class: 'trust' }, h('span', {}, h('b', {}, '4'), ' kiểu video'), h('span', {}, h('b', {}, String(ui.enabledStyles.length)), ' phong cách'), h('span', {}, h('b', {}, '10'), ' dạng video'), h('span', {}, h('b', {}, 'Tiếng Việt'), ' tự nhiên'), ui.zalo?.enabled ? h('span', {}, 'Tạo qua ', h('b', {}, 'Zalo')) : null)),
      h('div', { class: 'glow' }, iphone(heroCanvas), h('div', { style: 'height:14px' }), chips)),
    h('div', { class: 'stripe' },
      h('div', {}, h('b', { class: 'grad-text' }, '60 giây'), h('small', { class: 'muted' }, 'từ kịch bản tới video')),
      h('div', {}, h('b', { class: 'grad-text' }, '0đ'), h('small', { class: 'muted' }, 'dùng thử, không cần thẻ')),
      h('div', {}, h('b', { class: 'grad-text' }, 'Khớp nhịp'), h('small', { class: 'muted' }, 'hình hiện đúng lúc đọc tới')),
      h('div', {}, h('b', { class: 'grad-text' }, 'MP4 + SRT'), h('small', { class: 'muted' }, 'dọc 9:16 và ngang 16:9'))),
    h('section', { class: 'section' }, h('div', { class: 'head' }, h('h2', {}, 'Video minh hoạ'), h('p', {}, 'Tất cả được bàn tay vẽ từng nét từ kịch bản bên dưới mỗi video — không dùng ảnh có sẵn.')),
      h('div', { class: 'demos' }, demos.filter((d) => !d.mode || d.mode === 'hand').map((d) => {
        const c = h('canvas', { 'aria-label': d.title });
        setTimeout(() => playDemo(c, d.spec, { dpr: 0.45 }), 0);
        return h('a', { class: 'demo', href: '#/mau', 'data-ev': 'demo-' + d.id }, c, h('b', {}, d.title), h('small', {}, L('styles', d.style)));
      }))),
    h('section', { class: 'section' }, h('div', { class: 'head' }, h('h2', {}, 'Bốn kiểu video giải thích được ưa chuộng nhất'), h('p', {}, 'Cùng một kịch bản, chọn cách kể: bàn tay vẽ, đồ hoạ chuyển động, toán học trực quan hay chữ chuyển động.')),
      h('div', { class: 'genres' }, MODES.filter(([k]) => V('mode:' + k) !== 'hidden').map(([k, icon, desc]) => {
        const d = demos.find((x) => x.mode === k), c = h('canvas', { 'aria-label': L('modes', k) });
        if (d) setTimeout(() => playDemo(c, d.spec, { dpr: 0.45 }), 0);
        return h('a', { class: 'genre', href: '#/tao', 'data-ev': 'genre-' + k, onclick: () => sessionStorage.setItem('nv_mode', k) }, c, h('b', {}, icon + ' ' + L('modes', k)), h('small', {}, desc));
      }))),
    h('section', { class: 'section card' }, h('h2', {}, 'Thử ngay với kịch bản của bạn'), h('p', { class: 'muted' }, 'Không cần đăng nhập. Hệ thống tự nhận ra bạn đang làm dạng video gì và vẽ bố cục phù hợp.'), tryBox, h('div', { class: 'row' }, tryBtn)),
    h('section', { class: 'section' }, h('div', { class: 'head' }, h('h2', {}, 'Ba bước, không cần kỹ năng')),
      h('div', { class: 'steps3' },
        h('div', { class: 'card' }, h('span', { class: 'num' }, '1'), h('h3', {}, 'Dán kịch bản hoặc chủ đề'), h('p', { class: 'muted' }, 'Dùng kịch bản có sẵn, chọn mẫu, hoặc để AI viết có câu mở đầu giữ chân người xem.')),
        h('div', { class: 'card' }, h('span', { class: 'num' }, '2'), h('h3', {}, 'Chọn phong cách'), h('p', { class: 'muted' }, 'Bảng trắng, phấn, neon, truyện tranh, pastel… xem trước ngay trên trang.')),
        h('div', { class: 'card' }, h('span', { class: 'num' }, '3'), h('h3', {}, 'Nhận video'), h('p', { class: 'muted' }, 'MP4 có giọng đọc và phụ đề, tải về hoặc nhận qua Zalo.')))),
    h('section', { class: 'section' }, h('div', { class: 'head' }, h('h2', {}, 'Mười dạng video, tự nhận ra từ kịch bản'), h('p', {}, 'Mỗi dạng có cách bố cục riêng, hợp từng ngách: tài chính, sức khoẻ, giáo dục, kinh doanh, kể chuyện…')),
      h('div', { class: 'formats' }, FORMAT_INFO.map(([i, t, d]) => h('div', { class: 'card' }, h('span', { class: 'icon' }, i), h('h3', {}, t), h('p', { class: 'muted' }, d))))),
    ui.plans?.length && V('feature:plans') === 'on' ? h('section', { class: 'section' }, h('div', { class: 'head' }, h('h2', {}, 'Bảng giá đơn giản')), planCards(null)) : null,
    h('section', { class: 'section card faq' }, h('h2', {}, 'Câu hỏi thường gặp'),
      ...[['Có cần biết vẽ hay dựng phim không?', 'Không. Bạn chỉ cần kịch bản; bàn tay vẽ, giọng đọc, phụ đề và khớp nhịp đều tự động.'],
        ['Video có dùng thương mại được không?', 'Được. Video bạn tạo thuộc về bạn; hình nét vẽ và phông chữ đều có giấy phép dùng thương mại.'],
        ['Không có AI thì có dùng được không?', 'Được. Chế độ "Kịch bản của tôi + tự minh hoạ" và giọng đọc miễn phí chạy mà không cần AI.'],
        ['Dữ liệu của tôi có an toàn không?', 'Chúng tôi chỉ nhận tên và email khi bạn đăng nhập Google, không đăng bài thay bạn. Bạn có thể tải hoặc xoá toàn bộ dữ liệu bất cứ lúc nào.']]
        .map(([q, a]) => h('details', {}, h('summary', {}, q), h('p', {}, a)))),
    h('div', { class: 'cta-band' }, h('h2', {}, 'Video đầu tiên của bạn chỉ cách một kịch bản'), h('a', { class: 'btn big', href: '#/tao', 'data-ev': 'band-create' }, 'Bắt đầu miễn phí')),
    footer());
  if (demos[0]) {
    const run = playDemo(heroCanvas, demos[0].spec, { dpr: 0.75 });
    const paint = (k) => chips.replaceChildren(...heroStyles.map((s) => h('button', { type: 'button', class: 'chip' + (s === k ? ' on' : ''), 'data-ev': 'hero-style', onclick: () => { run.restyle(s); paint(s); } }, L('styles', s))));
    paint(demos[0].style);
  }
}

// ---------- device frame + "how it looks on TikTok / Reels / Shorts / YouTube"
/** An iPhone: titanium frame, Dynamic Island, rounded screen. */
function iphone(content) {
  return h('div', { class: 'iphone' }, h('i', { class: 'btn-side l1' }), h('i', { class: 'btn-side l2' }), h('i', { class: 'btn-side r1' }),
    h('div', { class: 'screen' }, content, h('div', { class: 'island' })));
}
const PLATFORMS = { none: 'Gốc', tiktok: 'TikTok', reels: 'Facebook Reels', shorts: 'YouTube Shorts', youtube: 'YouTube' };
function platformOverlay(kind, spec) {
  const ch = '@' + String(spec.channel || ui.brand.name || 'kenh').toLowerCase().replace(/\s+/g, '');
  const cap = (spec.caption || spec.title || '').slice(0, 90), tags = (spec.hashtags || []).slice(0, 3).join(' ');
  const side = (...items) => h('div', { class: 'pf-side' }, items.map(([i, n]) => h('span', {}, h('b', {}, i), n ? h('small', {}, n) : null)));
  if (kind === 'tiktok') return h('div', { class: 'pf tiktok' }, h('div', { class: 'pf-top' }, h('span', {}, 'Đang theo dõi'), h('b', {}, 'Dành cho bạn')),
    side(['＋', ''], ['♥', '12,4K'], ['💬', '326'], ['🔖', '1.021'], ['↪', '845']), h('div', { class: 'pf-bottom' }, h('b', {}, ch), h('p', {}, cap, ' ', h('span', { class: 'tags' }, tags)), h('small', {}, '♫ âm thanh gốc - ' + ch)));
  if (kind === 'reels') return h('div', { class: 'pf reels' }, h('div', { class: 'pf-top' }, h('b', {}, 'Reels'), h('span', {}, '📷')),
    side(['👍', '8,1K'], ['💬', '214'], ['↗', '530'], ['⋯', '']), h('div', { class: 'pf-bottom' }, h('div', { class: 'row' }, h('i', { class: 'pf-av' }), h('b', {}, spec.channel || ui.brand.name), h('span', { class: 'pf-follow' }, 'Theo dõi')), h('p', {}, cap)));
  if (kind === 'shorts') return h('div', { class: 'pf shorts' }, h('div', { class: 'pf-top' }, h('span', {}, '🔍'), h('span', {}, '⋮')),
    side(['👍', '9,7K'], ['👎', 'Không thích'], ['💬', '188'], ['↪', 'Chia sẻ'], ['🔁', 'Phối lại']), h('div', { class: 'pf-bottom' }, h('div', { class: 'row' }, h('i', { class: 'pf-av' }), h('b', {}, ch), h('span', { class: 'pf-sub' }, 'Đăng ký')), h('p', {}, spec.title || cap)));
  if (kind === 'youtube') return h('div', { class: 'pf youtube' }, h('div', { class: 'pf-top' }, h('b', {}, spec.title || '')), h('div', { class: 'pf-play' }, '▶'),
    h('div', { class: 'pf-bottom' }, h('div', { class: 'pf-progress' }, h('i')), h('div', { class: 'row' }, h('span', {}, '▶  🔊  0:12 / 1:05'), h('span', {}, '⚙  ⛶'))));
  return null;
}
/** Wraps a preview with a chooser that lays the chosen platform's buttons over it. */
function platformFrame(frame, spec) {
  if (V('feature:platform') === 'hidden') return frame;
  const screen = frame.classList.contains('screen') ? frame : frame.querySelector('.screen');
  let kind = 'none';
  const list = spec.ratio === '16:9' ? ['none', 'youtube'] : ['none', 'tiktok', 'reels', 'shorts'];
  const chips = h('div', { class: 'chips pfchips' });
  const paint = () => {
    screen.querySelector('.pf')?.remove();
    const o = platformOverlay(kind, spec); if (o) screen.append(o);
    chips.replaceChildren(...list.map((k) => h('button', { type: 'button', class: 'chip small' + (k === kind ? ' on' : ''), disabled: V('feature:platform') === 'dev', 'data-ev': 'platform-' + k, onclick: () => { kind = k; paint(); } }, PLATFORMS[k])));
  };
  paint();
  return h('div', { class: 'pfwrap' }, frame, h('small', { class: 'muted', style: 'text-align:center' }, 'Xem như khi đăng lên' + (V('feature:platform') === 'dev' ? DEV : '')), chips);
}

// ---------- try without an account
async function startTry(text, btn, extra = {}, opts = {}) {
  if ((text || '').trim().length < 10) return toast('Nhập vài câu kịch bản để xem thử.');
  await busy(btn, 'Đang vẽ bố cục…', async () => {
    try {
      const r = await api('/api/try', { method: 'POST', body: { text, ...extra } });
      const save = (o) => sessionStorage.setItem('nv_try', JSON.stringify({ text, spec: decorate(r.spec, o), opts: o, formatName: r.formatName, nicheName: r.nicheName }));
      // photos can be large: keep the preview working without them if the browser refuses to store them
      try { save(opts); } catch { save({ ...opts, character: undefined, affiliate: opts.affiliate && { ...opts.affiliate, image: undefined } }); }
      track('try', { format: r.spec.format, mode: opts.mode });
      location.hash = '#/thu';
    } catch (e) { fail(e); }
  });
}
async function showTry() {
  viewed('try');
  let t = null; try { t = JSON.parse(sessionStorage.getItem('nv_try') || 'null'); } catch {}
  if (!t) { location.hash = '#/tao'; return; }
  const canvas = h('canvas', { 'aria-label': 'Xem thử video' });
  const run = playDemo(canvas, t.spec, { dpr: 0.75 });
  let style = t.spec.style;
  const picker = stylePicker(t.spec, style, (k) => { style = k; run.restyle(k); });
  show(h('a', { href: '#/tao' }, '← Sửa kịch bản'),
    h('div', { class: 'editor' },
      h('div', { class: 'preview' }, platformFrame(iphone(canvas), t.spec)),
      h('div', { class: 'scenes' },
        h('div', { class: 'card' }, h('span', { class: 'badge' }, 'Bản xem thử'), h('h2', {}, t.spec.title),
          h('p', { class: 'muted' }, `Nhận diện: ${t.formatName} · ${t.nicheName} · ${t.spec.scenes.length} cảnh. Video thật có giọng đọc và khớp nhịp từng câu.`),
          h('button', { type: 'button', class: 'big', 'data-ev': 'try-create', onclick: (e) => createProject({ source: 'mine-free', topic: t.text, style, ratio: t.spec.ratio, format: t.spec.format,
            mode: t.opts?.mode, intro: t.opts?.intro, character: t.opts?.character, affiliate: t.opts?.affiliate }, e.currentTarget) }, 'Tạo video này'),
          h('small', { class: 'muted' }, me ? 'Video sẽ được lưu vào "Video của tôi".' : 'Bạn sẽ đăng nhập nhanh bằng Google để lưu và nhận video.')),
        h('div', { class: 'card' }, h('h3', {}, 'Đổi phong cách'), picker))));
}
/** Grid of small live-styled thumbnails (first scene of `spec`). */
function stylePicker(spec, current, onPick) {
  const box = h('div', { class: 'stylepick' });
  const keys = STYLE_SHOW.filter((k) => ui.enabledStyles.includes(k) || V('style:' + k) === 'dev');
  for (const k of keys) {
    const c = h('canvas');
    const b = h('button', { type: 'button', class: k === current ? 'on' : null, disabled: V('style:' + k) === 'dev', 'data-ev': 'pick-style', onclick: () => { for (const x of box.children) x.classList.remove('on'); b.classList.add('on'); onPick(k); } },
      c, L('styles', k) + (V('style:' + k) === 'dev' ? DEV : ''));
    box.append(b);
    const s = { ...spec, style: k, scenes: spec.scenes.slice(0, 1) }; delete s.tool;
    previewModel(s, 0.3).then((m) => { c.width = m.W * 0.3; c.height = m.H * 0.3; NV.renderFrame(c.getContext('2d'), m, m.timeline.scenes[0].end - 0.3, { hand: false }); }).catch(() => {});
  }
  return box;
}

// ---------- styles gallery
async function showStyles() {
  viewed('styles');
  const demos = await getDemos();
  const base = demos[0]?.spec;
  const canvas = h('canvas');
  const run = base ? playDemo(canvas, base, { dpr: 0.75 }) : null;
  let style = base?.style || 'sunset';
  show(h('div', { class: 'section' }, h('div', { class: 'head' }, h('h1', {}, h('span', { class: 'grad-text' }, ui.enabledStyles.length + ' phong cách'), ' cho mọi kiểu video'), h('p', {}, 'Bấm một phong cách để xem video minh hoạ đổi theo. Mỗi phong cách có bút, màu mực và nền riêng.'))),
    h('div', { class: 'editor' },
      h('div', { class: 'preview' }, iphone(canvas),
        h('a', { class: 'btn big', href: '#/tao', 'data-ev': 'styles-create', onclick: () => sessionStorage.setItem('nv_style', style) }, 'Dùng phong cách này')),
      h('div', { class: 'card' }, base ? stylePicker(base, style, (k) => { style = k; run?.restyle(k); }) : null)),
    h('section', { class: 'section' }, h('div', { class: 'head' }, h('h2', {}, 'Video mẫu theo từng dạng')),
      h('div', { class: 'demos' }, demos.map((d) => { const c = h('canvas'); setTimeout(() => playDemo(c, d.spec, { dpr: 0.45 }), 0); return h('div', { class: 'demo' }, c, h('b', {}, d.title), h('small', {}, L('styles', d.style))); }))),
    footer());
}

// ---------- login sheet
let gisReady = null;
function loadGis() {
  return (gisReady ||= new Promise((ok, no) => { const s = h('script', { src: 'https://accounts.google.com/gsi/client', async: true }); s.onload = ok; s.onerror = no; document.head.append(s); }));
}
const GOOGLE_G = () => { const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 48 48'); svg.setAttribute('width', '20'); svg.setAttribute('height', '20');
  for (const [d, f] of [['M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z', '#EA4335'], ['M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z', '#4285F4'], ['M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z', '#FBBC05'], ['M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z', '#34A853']]) { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); p.setAttribute('fill', f); svg.append(p); }
  return svg; };
/** Installed app (home screen) or an in-app browser (Zalo, Facebook...): Google's popup cannot report back there. */
const popupUnsafe = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true || /Zalo|FBAN|FBAV|Instagram|Line\/|TikTok|musical_ly|wv\)/i.test(navigator.userAgent);
function openLogin(reason, after) {
  if (me) return;
  if (after) sessionStorage.setItem('nv_after', JSON.stringify(after));
  track('login_open', { reason });
  document.querySelector('.sheet-bg')?.remove();
  const mode = ui.auth?.google || 'auto', redirect = mode === 'redirect' || (mode === 'auto' && popupUnsafe());
  const next = '/' + (after?.hash || location.hash || '#/');
  const slot = h('div', { class: 'gslot' });
  const close = () => { bg.remove(); };
  // one tap on our own button: the whole page goes to Google and comes back signed in
  const gBtn = h('a', { class: 'gbtn', href: '/api/auth/google/start?next=' + encodeURIComponent(next), 'data-ev': 'login-google',
    onclick: () => { track('login_go', { how: 'redirect' }); flush(); gBtn.classList.add('busy'); gBtn.replaceChildren(h('i', { class: 'spin' }), 'Đang mở Google…'); } }, GOOGLE_G(), 'Tiếp tục với Google');
  const devBtn = cfg?.dev ? h('button', { type: 'button', class: 'ghost', onclick: async () => { await api('/api/auth/dev', { method: 'POST', body: { email: 'thu@localhost', consent: true } }); location.reload(); } }, 'Đăng nhập thử (máy local)') : null;
  const bg = h('div', { class: 'sheet-bg', onclick: (e) => { if (e.target === bg) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Đăng nhập' },
      h('div', { class: 'side' },
        h('span', { class: 'brand', style: 'color:#fff' }, h('span', { class: 'logo', style: 'background:rgba(255,255,255,.2)' }, '✎'), ui.brand.name + ' ' + (ui.brand.accent || '')),
        h('h2', { style: 'color:#fff;font-size:1.6rem' }, reason === 'create' ? 'Còn một bước để nhận video' : 'Chào mừng bạn'),
        h('ul', {}, h('li', {}, 'Lưu và sửa video bất cứ lúc nào'), h('li', {}, 'Giọng đọc tiếng Việt, khớp nhịp từng câu'), h('li', {}, 'Tải MP4 hoặc nhận qua Zalo'), h('li', {}, 'Miễn phí dùng thử, không cần thẻ')),
        h('p', { class: 'mini' }, '🔒 Kết nối mã hoá · Chỉ nhận tên và email · Không đăng bài thay bạn')),
      h('div', { class: 'main', style: 'position:relative' },
        h('button', { type: 'button', class: 'ghost small close', 'aria-label': 'Đóng', onclick: close }, '✕'),
        h('h2', {}, 'Đăng nhập / Đăng ký'),
        h('p', { class: 'muted' }, 'Một chạm với tài khoản Google, không cần mật khẩu. Tài khoản mới được tạo tự động.'),
        cfg?.clientId ? (redirect ? gBtn : slot) : h('p', { class: 'error' }, 'Chủ trang chưa cấu hình đăng nhập Google.'),
        devBtn,
        h('p', { class: 'agree' }, 'Bằng việc tiếp tục, bạn đồng ý với ', h('a', { href: '#/dieu-khoan', target: '_blank' }, 'Điều khoản sử dụng'), ' và ', h('a', { href: '#/bao-mat', target: '_blank' }, 'Chính sách bảo mật'), '.'),
        ui.zalo?.enabled && ui.zalo.botLink ? h('div', { class: 'or' }, 'hoặc') : null,
        ui.zalo?.enabled && ui.zalo.botLink ? h('a', { class: 'btn ghost', href: ui.zalo.botLink, target: '_blank', rel: 'noopener', 'data-ev': 'login-zalo' }, 'Tạo video ngay trong Zalo') : null,
        h('div', { class: 'secure' }, h('span', {}, '🛡️'), h('span', {}, 'Bạn có thể tải hoặc xoá toàn bộ dữ liệu của mình trong trang Tài khoản bất cứ lúc nào.')))));
  document.body.append(bg);
  if (cfg?.clientId && !redirect) {
    // ordinary browsers: Google's own button (popup); the redirect button is the fallback if it does not load
    slot.append(h('div', { class: 'sk', style: 'height:44px;width:300px;border-radius:99px' }));
    Promise.all([loadGis(), api('/api/auth/config')]).then(([, c]) => {
      google.accounts.id.initialize({
        client_id: c.clientId, nonce: c.nonce, ux_mode: 'popup', use_fedcm_for_prompt: true,
        callback: async (r) => {
          try { await api('/api/auth/google', { method: 'POST', body: { credential: r.credential, nonce: c.nonce, consent: true } }); location.reload(); }
          catch (e) { toast(e.message); setTimeout(() => location.reload(), 2500); }
        },
      });
      slot.replaceChildren();
      google.accounts.id.renderButton(slot, { theme: 'filled_blue', size: 'large', text: 'continue_with', locale: 'vi', shape: 'pill', width: 300 });
    }).catch(() => slot.replaceChildren(gBtn));
  }
}
function consentAgain() {
  const bg = h('div', { class: 'sheet-bg' }, h('div', { class: 'sheet', style: 'grid-template-columns:1fr;max-width:520px' }, h('div', { class: 'main' },
    h('h2', {}, 'Điều khoản đã được cập nhật'),
    h('p', { class: 'muted' }, 'Vui lòng đọc và đồng ý phiên bản mới để tiếp tục.'),
    h('div', { class: 'row' }, h('a', { href: '#/dieu-khoan', target: '_blank' }, 'Điều khoản sử dụng'), h('a', { href: '#/bao-mat', target: '_blank' }, 'Chính sách bảo mật')),
    h('div', { class: 'row' }, h('button', { type: 'button', onclick: async () => { await api('/api/consent', { method: 'POST' }).catch(fail); bg.remove(); } }, 'Tôi đồng ý'),
      h('button', { type: 'button', class: 'ghost', onclick: () => document.getElementById('logout').click() }, 'Đăng xuất')))));
  document.body.append(bg);
}
function cookieNotice() {
  if (store.get('nv_cookie')) return;
  const box = h('div', { class: 'cookie' }, h('span', {}, 'Chúng tôi chỉ dùng cookie cần thiết cho đăng nhập và thống kê ẩn danh. ', h('a', { href: '#/bao-mat' }, 'Tìm hiểu')),
    h('button', { type: 'button', class: 'small', onclick: () => { store.set('nv_cookie', '1'); box.remove(); } }, 'Đồng ý'));
  document.body.append(box);
}

// ---------- legal
let legalCache = null;
async function showLegal(which) {
  viewed('legal', { which });
  const l = (legalCache ||= await api('/api/legal'));
  const titles = { terms: 'Điều khoản sử dụng', privacy: 'Chính sách bảo mật', refund: 'Chính sách hoàn tiền' };
  const blocks = [];
  let list = null;
  for (const raw of l[which].split('\n')) {
    const line = raw.trim();
    if (!line) { list = null; continue; }
    if (line.startsWith('## ')) { list = null; blocks.push(h('h2', {}, line.slice(3))); }
    else if (line.startsWith('- ')) { if (!list) { list = h('ul'); blocks.push(list); } list.append(h('li', {}, line.slice(2))); }
    else { list = null; blocks.push(h('p', {}, line)); }
  }
  show(h('div', { class: 'doc' }, h('div', { class: 'card' }, h('h1', {}, titles[which]), h('p', { class: 'muted' }, `Phiên bản ${l.version} · ${l.company}${l.taxId ? ' · MST ' + l.taxId : ''}`), ...blocks)), footer());
}

// ---------- create (guests may fill everything; sign-in is asked only when the video is made)
function secondsOptions(def, max) {
  const list = [['30', '30 giây'], ['45', '45 giây'], ['60', '1 phút'], ['90', '1,5 phút'], ['150', '2,5 phút'], ['180', '3 phút'], ['300', '5 phút'], ['420', '7 phút'], ['600', '10 phút'], ['900', '15 phút']].filter(([v]) => !max || Number(v) <= max);
  if (def && !list.some(([v]) => Number(v) === Number(def)) && (!max || def <= max)) list.push([String(def), `${def} giây`]);
  return list;
}
const FORMAT_LABELS = { auto: 'Tự nhận diện', explainer: 'Giải thích khái niệm', listicle: 'Danh sách (Top N)', howto: 'Hướng dẫn từng bước', story: 'Kể chuyện', compare: 'So sánh / đúng – sai', data: 'Số liệu', sales: 'Giới thiệu sản phẩm', motivation: 'Truyền cảm hứng', qa: 'Hỏi – đáp', news: 'Tin tức' };
/** The four genres of explainer video; each has its own look. */
const MODES = [
  ['hand', '✍️', 'Bàn tay vẽ từng nét như Web5ngay', 'sunset'],
  ['motion', '🪐', 'Hình khối, icon phẳng chuyển động mượt như Kurzgesagt', 'cosmos'],
  ['math', '📐', 'Đồ thị, công thức vẽ chính xác như 3Blue1Brown', 'manim'],
  ['kinetic', '🔤', 'Chữ phóng to, đổi màu theo nhịp giọng đọc', 'bold'],
];
const MODE_STYLE = Object.fromEntries(MODES.map(([k, , , st]) => [k, st]));
function modePicker(current, onPick) {
  const box = h('div', { class: 'modes' });
  for (const [k, icon, desc] of MODES) {
    const vis = V('mode:' + k);
    if (vis === 'hidden') continue;
    const b = h('button', { type: 'button', class: 'mode' + (k === current ? ' on' : ''), disabled: vis === 'dev', 'data-ev': 'mode-' + k, onclick: () => { for (const x of box.children) x.classList.remove('on'); b.classList.add('on'); onPick(k); } },
      h('span', { class: 'mi' }, icon), h('b', {}, L('modes', k) + (vis === 'dev' ? DEV : '')), h('small', {}, desc));
    box.append(b);
  }
  return box;
}

/** Shrink a picked photo (max 900px, JPEG) so it uploads fast and survives a sign-in redirect. */
function shrinkImage(file, max = 900) {
  return new Promise((ok, no) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return no(new Error('Chọn ảnh PNG, JPG hoặc WebP.'));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      ok(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error('Không đọc được ảnh.')); };
    img.src = url;
  });
}
/** Upload a picture given as a data URL; returns its stored reference (r2:up/...). */
async function uploadData(dataUrl) {
  // decoded by hand: the page's security policy does not let fetch() read data: URLs
  const [head, b64] = dataUrl.split(','), type = head.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type });
  const res = await fetch('/api/uploads', { method: 'POST', credentials: 'same-origin', headers: { 'x-nv': '1', 'x-visitor': VID, 'content-type': blob.type }, body: blob });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Không tải được ảnh lên.');
  return data.ref;
}
/** A photo field: pick → shrink → preview; `get()` gives the data URL (or stored ref). */
function photoField(label, hint, initial) {
  let value = initial || '';
  const img = h('img', { alt: '', hidden: !value, src: value ? mediaUrl(value) : undefined });
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true, onchange: async () => {
    const f = file.files[0]; if (!f) return;
    try { value = await shrinkImage(f); img.src = value; img.hidden = false; clear.hidden = false; box.dispatchEvent(new Event('change')); } catch (e) { fail(e); }
  } });
  const clear = h('button', { type: 'button', class: 'ghost small', hidden: !value, onclick: () => { value = ''; img.hidden = true; clear.hidden = true; file.value = ''; box.dispatchEvent(new Event('change')); } }, 'Bỏ ảnh');
  const box = h('div', { class: 'photo' }, h('span', { class: 'plabel' }, label), h('div', { class: 'row' }, img, h('button', { type: 'button', class: 'ghost small', onclick: () => file.click() }, '📷 Chọn ảnh'), clear), hint ? h('small', { class: 'muted' }, hint) : null, file);
  box.get = () => value;
  return box;
}
const mediaUrl = (v) => (String(v).startsWith('r2:') ? '/api/media/' + v.slice(3) : v);

const BADGES = { listicle: 'TOP', howto: 'MẸO HAY', story: 'CÂU CHUYỆN', compare: 'SO SÁNH', data: 'SỐ LIỆU', sales: 'HOT', motivation: 'ĐỘNG LỰC', qa: 'HỎI ĐÁP', news: 'TIN NÓNG', explainer: 'GIẢI THÍCH' };
/** Same additions the server makes on creation, for the preview before signing in. */
function decorate(spec, o) {
  const s = JSON.parse(JSON.stringify(spec));
  s.mode = o.mode || 'hand';
  if (o.styleAuto && MODE_STYLE[s.mode] && s.mode !== 'hand' && ui.enabledStyles.includes(MODE_STYLE[s.mode])) s.style = MODE_STYLE[s.mode];
  s.media = {};
  if (o.character) { s.media.nv = o.character; s.character = 'nv'; }
  if (o.affiliate?.link) {
    const a = o.affiliate, portrait = s.ratio === '9:16', product = a.product || 'sản phẩm này';
    if (a.image) s.media.sp = a.image;
    const items = [{ t: 'text', text: a.price ? `Chỉ ${a.price}` : 'Ưu đãi hôm nay', x: 50, y: portrait ? 8 : 10, size: 'xl', color: 'accent', line: 0 }];
    if (a.image) items.push({ t: 'image', src: 'sp', x: portrait ? 50 : 30, y: portrait ? 36 : 52, w: portrait ? 62 : 34, shape: 'rounded', label: a.product, line: 0, id: 'sp' });
    items.push({ t: 'qr', text: a.link, x: portrait ? 50 : 74, y: portrait ? (a.image ? 78 : 50) : 50, w: portrait ? 34 : 24, label: 'Quét để mua', line: 1, id: 'qr' });
    if (a.image) items.push({ t: 'arrow', from: 'sp', to: 'qr', line: 1, color: 'accent2' });
    s.scenes.push({ lines: [`${product[0].toUpperCase()}${product.slice(1)}${a.price ? ` đang có giá ${a.price}` : ''}.`, 'Quét mã hoặc bấm link trong phần mô tả để mua ngay nhé!'], panels: [], diagram: { kind: 'sketch', items } });
  }
  if (o.intro) {
    const icon = s.scenes.flatMap((sc) => sc.diagram?.items || []).find((it) => it.t === 'icon')?.name, hook = s.scenes[0]?.lines?.[0] || '';
    s.intro = { title: s.title, badge: BADGES[o.affiliate?.link ? 'sales' : s.format] || 'MỚI', icon, sub: hook && hook !== s.title && hook.length <= 70 ? hook : undefined };
  }
  return s;
}

function planBar() {
  if (!me) return null;
  const lim = me.limits || {}, used = me.used || {};
  const left = (k) => Math.max(0, (lim[k] || 0) - (used[k] || 0));
  const bits = [`Gói ${me.plan?.name || ''}`, `còn ${left('render')} lượt dựng`, me.ai?.gemini || me.ai?.openai ? `${left('script')} lượt AI viết` : null].filter(Boolean);
  return h('div', { class: 'planbar' }, h('span', {}, bits.join(' · ') + ' hôm nay'),
    me.plan?.expires ? h('small', {}, ' · hết hạn ' + fmtDate(me.plan.expires)) : null,
    V('feature:plans') === 'on' && ui.plans?.some((p) => p.price > 0) ? h('a', { href: '#/goi', class: 'pill', 'data-ev': 'planbar-upgrade' }, me.plan?.id === 'free' ? 'Nâng cấp' : 'Gói cước') : null,
    ui.zalo?.enabled ? h('a', { href: '#/zalo', class: 'pill', 'data-ev': 'planbar-zalo' }, me.zaloLinked ? 'Zalo: đã kết nối' : 'Tạo video qua Zalo') : null);
}

/** Make the video (signs in first when needed, then continues by itself). */
async function createProject(body, btn) {
  if (!me) return openLogin('create', { create: body });
  await busy(btn, body.source === 'mine-free' ? 'Đang dựng bố cục…' : body.source === 'topic' ? T('writing') : 'AI đang minh hoạ…', async () => {
    try {
      // pictures picked before signing in travel as data URLs: store them first
      const b = { ...body, affiliate: body.affiliate ? { ...body.affiliate } : undefined };
      if (b.character?.startsWith('data:')) b.character = await uploadData(b.character);
      if (b.affiliate?.image?.startsWith('data:')) b.affiliate.image = await uploadData(b.affiliate.image);
      const r = await api('/api/projects/generate', { method: 'POST', body: b });
      if (r.note) toast(r.note);
      try { sessionStorage.setItem('autodraw:' + r.id, '1'); } catch {}
      location.hash = '#/p/' + r.id;
    } catch (err) { fail(err); }
  });
}

async function showStudio() {
  viewed('studio');
  const name = (me.user.name || '').split(' ').pop() || 'bạn';
  const list = h('div', {}, skeleton(3));
  const tips = store.get('nv_tips') ? null : h('div', { class: 'card tips' },
    h('h2', {}, 'Bắt đầu trong 3 bước'),
    h('ol', {}, h('li', {}, 'Dán kịch bản, chọn kịch bản mẫu, hoặc để AI viết từ chủ đề.'), h('li', {}, 'Chọn kiểu video: bàn tay vẽ, motion graphics, toán học hay chữ chuyển động.'),
      h('li', {}, 'Bấm "Dựng video" để nhận MP4 có giọng đọc' + (ui.zalo?.enabled ? ', hoặc nhận qua Zalo.' : '.'))),
    h('button', { type: 'button', class: 'ghost small', onclick: (e) => { store.set('nv_tips', '1'); e.target.closest('.tips').remove(); } }, 'Đã hiểu'));
  const quick = (href, icon, title, sub, ev, before) => h('a', { class: 'quick', href, 'data-ev': ev, onclick: before }, h('span', { class: 'qi' }, icon), h('b', {}, title), h('small', {}, sub));
  show(
    h('div', { class: 'hello' }, h('h1', { style: 'color:#fff' }, `Chào ${name} 👋`), h('p', {}, 'Hôm nay mình làm video gì nào?'), planBar(),
      h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/tao', style: 'background:#fff;color:#6d28d9' }, '+ Tạo video mới'), h('a', { class: 'btn ghost', href: '#/mau' }, 'Xem phong cách'))),
    ui.notice ? h('div', { class: 'notice' }, ui.notice) : null, tips,
    h('div', { class: 'quicks' },
      quick('#/tao', '✍️', 'Kịch bản của tôi', 'Dán kịch bản, tự minh hoạ', 'quick-mine', () => sessionStorage.setItem('nv_src', 'mine-free')),
      ui.enabledSources.includes('topic') ? quick('#/tao', '🤖', 'AI viết từ chủ đề', 'Một câu chủ đề là đủ', 'quick-topic', () => sessionStorage.setItem('nv_src', 'topic')) : null,
      ui.templates?.length && V('feature:templates') === 'on' ? quick('#/tao', '📚', 'Kịch bản mẫu', 'Chọn mẫu có sẵn', 'quick-template', () => sessionStorage.setItem('nv_src', 'template')) : null,
      V('feature:community') === 'on' ? quick('#/cong-dong', '🌏', 'Cộng đồng', 'Xem video mọi người làm', 'quick-community') : null),
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('h2', {}, T('myVideos')), h('a', { href: '#/video' }, 'Xem tất cả →')),
    list);
  const { projects } = await api('/api/projects');
  list.replaceChildren(projectList(projects.slice(0, 6)));
}
const MODE_ICON = Object.fromEntries(MODES.map(([k, i]) => [k, i]));
function projectList(projects) {
  return projects.length
    ? h('div', { class: 'projects' }, projects.map((p) => h('div', { class: 'proj' + (p.ratio === '16:9' ? ' wide' : '') },
        h('a', { class: 'thumb', href: p.done_job ? `#/xem/${p.id}/${p.done_job}` : '#/p/' + p.id, 'data-ev': p.done_job ? 'watch' : 'open-project' },
          h('span', { class: 'mi' }, MODE_ICON[p.mode || 'hand'] || '✍️'), p.done_job ? h('span', { class: 'play' }, '▶') : null,
          h('small', {}, L('styles', p.style || '') || '')),
        h('a', { class: 'pinfo', href: '#/p/' + p.id, 'data-ev': 'open-project' }, h('strong', {}, p.title), h('small', {}, 'Sửa lần cuối ' + fmtDate(p.updated_at))),
        h('div', { class: 'row' }, p.last_job ? h('span', { class: 'pill ' + p.last_job }, JOB_TEXT[p.last_job] || p.last_job) : h('span', { class: 'pill' }, 'Bản nháp'),
          p.shared ? h('span', { class: 'pill done' }, '🌏 Đã chia sẻ') : null,
          p.done_job ? h('a', { class: 'btn small', href: `#/xem/${p.id}/${p.done_job}` }, '▶ Xem') : h('a', { class: 'btn ghost small', href: '#/p/' + p.id }, 'Sửa')))))
    : h('div', { class: 'card empty' }, h('span', { class: 'big-emoji' }, '🎬'), h('p', { class: 'muted' }, T('noVideos')), h('a', { class: 'btn', href: '#/tao' }, '+ Tạo video đầu tiên'));
}
async function showVideos() {
  viewed('videos');
  const box = h('div', {}, skeleton(6));
  show(h('div', { class: 'row', style: 'justify-content:space-between' }, h('h1', {}, T('myVideos')), h('a', { class: 'btn', href: '#/tao' }, '+ Tạo video')), box);
  const { projects } = await api('/api/projects');
  box.replaceChildren(projectList(projects));
}

function templatesCard(onPick) {
  const vis = V('feature:templates');
  if (!ui.templates?.length || vis === 'hidden') return null;
  return h('div', {}, h('p', { class: 'muted' }, 'Chọn một mẫu (không tốn lượt AI), rồi sửa thành nội dung của bạn.', vis === 'dev' ? DEV : ''),
    h('div', { class: 'tpls' }, ui.templates.map((t) => h('button', { type: 'button', class: 'tpl', disabled: vis === 'dev', 'data-ev': 'template', onclick: (e) => {
      for (const x of e.currentTarget.parentElement.children) x.classList.remove('on'); e.currentTarget.classList.add('on'); onPick(t);
    } }, t.title))));
}

async function showCreate() {
  viewed('create');
  const D = ui.defaults || {};
  const maxSec = Math.min(me?.plan?.maxSeconds || 1e9, ui.limits?.maxSeconds || 600);
  const tplOn = ui.templates?.length && V('feature:templates') !== 'hidden';
  const sources = [...['topic', 'mine-ai', 'mine-free'].map((k) => [k, L('sources', k), 'source:' + k]).filter(([k]) => ui.enabledSources.includes(k) || V('source:' + k) === 'dev'),
    ...(tplOn && ui.enabledSources.includes('mine-free') ? [['template', 'Dùng kịch bản mẫu có sẵn', 'feature:templates']] : [])];
  const wantStyle = sessionStorage.getItem('nv_style'); sessionStorage.removeItem('nv_style');
  const wantSrc = sessionStorage.getItem('nv_src'); sessionStorage.removeItem('nv_src');
  const startSrc = sources.some(([k]) => k === wantSrc) ? wantSrc : ui.enabledSources.includes(D.source) ? D.source : ui.enabledSources[0];
  const wantMode = sessionStorage.getItem('nv_mode'); sessionStorage.removeItem('nv_mode');
  let mode = V('mode:' + (wantMode || D.mode || 'hand')) === 'on' ? wantMode || D.mode || 'hand' : 'hand';
  const hasAI = !!(cfg?.ai?.gemini || cfg?.ai?.openai || me?.ai?.gemini || me?.ai?.openai);
  const f = {
    source: h('select', { id: 'f-source' }, options(sources, startSrc)),
    topic: h('textarea', { id: 'f-topic', rows: 6, maxlength: 20000, placeholder: T('topicHint') }),
    subtitles: h('input', { type: 'checkbox', checked: !!D.subtitles }),
    intro: h('input', { type: 'checkbox', checked: D.intro !== false }),
    seconds: h('select', { id: 'f-seconds' }, options(secondsOptions(D.seconds, maxSec), String(Math.min(D.seconds || 45, maxSec)))),
    ratio: h('select', { id: 'f-ratio' }, options(ratioOptions(true), D.ratio || '9:16')),
    style: h('select', { id: 'f-style' }, options([['auto', 'Tự chọn theo kiểu video & nội dung'], ...styleOptions()], wantStyle && ui.enabledStyles.includes(wantStyle) ? wantStyle : 'auto')),
    voice: h('select', { id: 'f-voice' }, options(voiceOptions(), D.voice)),
    channel: h('input', { id: 'f-channel', maxlength: 40, value: D.channel || '', placeholder: T('channel') }),
    episode: h('input', { id: 'f-episode', maxlength: 30, placeholder: T('episodeHint') }),
    tone: h('input', { id: 'f-tone', maxlength: 200, value: D.tone || '', placeholder: T('toneHint') }),
    visual: h('select', { id: 'f-visual' }, options(Object.entries(ui.labels.visual).map(([k, v]) => [k, v, 'visual:' + k]), D.visual || 'sketch')),
    format: h('select', { id: 'f-format' }, options(Object.entries(FORMAT_LABELS), 'auto')),
    transition: h('select', { id: 'f-transition' }, options([['auto', 'Tự động, đa dạng'], ['fade', 'Mờ dần'], ['slide', 'Trượt ngang'], ['wipe', 'Bàn tay xoá bảng'], ['zoom', 'Phóng to']], 'auto')),
    affOn: h('input', { type: 'checkbox' }),
    affLink: h('input', { type: 'url', maxlength: 300, placeholder: 'https://shope.ee/... (link tiếp thị của bạn)' }),
    affProduct: h('input', { maxlength: 80, placeholder: 'Tên sản phẩm' }),
    affPrice: h('input', { maxlength: 30, placeholder: 'Giá, vd 199.000đ' }),
  };
  const character = photoField('Ảnh nhân vật', 'Ảnh chân dung hoặc linh vật của kênh: thay cho người que trong mọi cảnh.');
  const product = photoField('Ảnh sản phẩm', 'Hiện ở cảnh cuối cùng mã QR mua hàng.');
  const topicLabel = h('span', {}, T('topic'));
  const detect = h('div', { class: 'detect' });
  const only = {};
  const go = h('button', { type: 'submit', class: 'big', 'data-ev': 'create' }, T('write'));
  const tryBtn = h('button', { type: 'button', class: 'ghost big', 'data-ev': 'create-try', onclick: () => startTry(f.topic.value, tryBtn, { ratio: f.ratio.value, style: f.style.value === 'auto' ? undefined : f.style.value, format: f.format.value }, extras()) }, '✨ Xem thử');
  const tplBox = h('div', { class: 'tplpick' });
  const sync = () => {
    const src = f.source.value, mine = src !== 'topic';
    topicLabel.textContent = mine ? T('script') : T('topic');
    f.topic.placeholder = mine ? T('scriptHint') : T('topicHint');
    only.seconds.hidden = mine; only.tone.hidden = mine; only.visual.hidden = mine;
    only.subs.hidden = V('feature:subtitles') === 'hidden';
    tplBox.hidden = src !== 'template';
    if (src === 'template' && !tplBox.childNodes.length) tplBox.append(templatesCard(pick));
    tryBtn.hidden = !mine;
    go.textContent = src === 'mine-free' || src === 'template' ? 'Tạo video (miễn phí)' : mine ? 'AI minh hoạ kịch bản' : T('write');
    go.disabled = src !== 'mine-free' && src !== 'template' && !hasAI;
    if (go.disabled) go.textContent = 'AI chưa sẵn sàng — chọn "Kịch bản của tôi"';
    only.aff.hidden = !f.affOn.checked;
  };
  const guess = debounce(async () => {
    const text = f.topic.value.trim();
    if (text.length < 15) { detect.replaceChildren(); return; }
    try {
      const r = await api('/api/intent', { method: 'POST', body: { text } });
      detect.replaceChildren('Nhận diện: ', h('b', {}, r.formatName), ' · ', h('b', {}, r.nicheName),
        ui.enabledStyles.includes(r.style) ? ` · gợi ý phong cách: ${L('styles', r.style)}` : '', r.hook ? ' · mở đầu gây tò mò ✓' : '');
    } catch {}
  }, 700);
  f.source.addEventListener('change', () => { sync(); track('choose', { source: f.source.value }); });
  f.affOn.addEventListener('change', sync);
  f.topic.addEventListener('input', guess);
  const extras = () => ({ mode, intro: f.intro.checked && V('feature:intro') === 'on', styleAuto: f.style.value === 'auto', character: V('feature:character') === 'on' ? character.get() || undefined : undefined,
    affiliate: f.affOn.checked && f.affLink.value.trim() ? { link: f.affLink.value.trim(), product: f.affProduct.value.trim(), price: f.affPrice.value.trim(), image: product.get() || undefined } : undefined });
  const body = () => {
    const x = extras();
    return { source: f.source.value === 'template' ? 'mine-free' : f.source.value, subtitles: f.subtitles.checked, topic: f.topic.value, seconds: Number(f.seconds.value), ratio: f.ratio.value, style: f.style.value,
      voiceId: f.voice.value, channel: f.channel.value, episode: f.episode.value, tone: f.tone.value, visual: f.visual.value, format: f.format.value, transition: f.transition.value,
      mode: x.mode, intro: x.intro, character: x.character, affiliate: x.affiliate };
  };
  const feat = (k) => V('feature:' + k) !== 'hidden';
  const form = h('form', { class: 'card', onsubmit: (e) => { e.preventDefault(); createProject(body(), go).then(sync); } },
    h('h2', {}, T('newVideo')),
    h('div', { class: 'grid' }, h('label', {}, T('source'), f.source), h('label', {}, 'Dạng video', f.format)),
    tplBox,
    h('label', { for: 'f-topic' }, topicLabel, f.topic), detect,
    h('div', {}, h('span', { class: 'plabel' }, 'Kiểu video'), modePicker(mode, (k) => { mode = k; track('mode', { mode: k }); })),
    h('div', { class: 'grid' },
      only.seconds = h('label', {}, T('duration'), f.seconds), h('label', {}, T('ratio'), f.ratio),
      only.visual = h('label', {}, T('visual'), f.visual), h('label', {}, T('style'), f.style), h('label', {}, T('voice'), f.voice), only.tone = h('label', {}, T('tone'), f.tone),
      h('label', {}, 'Chuyển cảnh', f.transition), h('label', {}, T('channel'), f.channel), h('label', {}, T('episode'), f.episode)),
    h('div', { class: 'toggles' },
      feat('intro') ? h('label', { class: 'check' }, f.intro, h('span', {}, h('b', {}, 'Mở đầu là ảnh bìa thu hút'), h('small', { class: 'muted' }, ' — khung đầu tiên là thumbnail: tiêu đề lớn, nhãn nổi bật, kích thích bấm xem.'))) : null,
      only.subs = h('label', { class: 'check' }, f.subtitles, T('subsOnPicture')),
      feat('affiliate') ? h('label', { class: 'check' }, f.affOn, h('span', {}, h('b', {}, 'Video tiếp thị liên kết'), h('small', { class: 'muted' }, ' — thêm cảnh cuối có ảnh sản phẩm, giá và mã QR tới link của bạn.'))) : null),
    only.aff = h('div', { class: 'card inner' }, h('div', { class: 'grid' }, h('label', {}, 'Link tiếp thị', f.affLink), h('label', {}, 'Sản phẩm', f.affProduct), h('label', {}, 'Giá', f.affPrice)), product),
    feat('character') ? h('details', { class: 'inner' }, h('summary', {}, '🧑 Nhân vật tham chiếu (ảnh thật)'), character) : null,
    h('div', { class: 'row' }, go, tryBtn),
    me ? null : h('small', { class: 'muted' }, 'Bạn chỉ cần đăng nhập khi bấm tạo video.'));
  async function pick(t) {
    try {
      const { template } = await api('/api/templates/' + t.id);
      f.topic.value = template.text; guess(); f.topic.focus();
      f.topic.scrollIntoView({ behavior: 'smooth', block: 'center' });
      track('template', { id: t.id });
    } catch (e) { fail(e); }
  }
  sync();
  show(h('h1', {}, 'Tạo video'), planBar(), form);
  const tpl = sessionStorage.getItem('nv_tpl'); sessionStorage.removeItem('nv_tpl');
  if (tpl) { f.source.value = 'template'; sync(); pick({ id: tpl }); }
}

// ---------- account
async function showAccount() {
  viewed('account');
  const del = h('input', { placeholder: 'Gõ XOA để xác nhận', maxlength: 4, style: 'max-width:200px' });
  show(h('h1', {}, 'Tài khoản'),
    h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', { class: 'avatar', style: 'width:48px;height:48px;font-size:1.2rem' }, (me.user.name || me.user.email).charAt(0).toUpperCase()),
      h('div', {}, h('b', {}, me.user.name || ''), h('div', { class: 'muted' }, me.user.email))), planBar()),
    h('div', { class: 'card' }, h('h2', {}, 'Kết nối & gói'), h('div', { class: 'row' },
      ui.zalo?.enabled ? h('a', { class: 'btn ghost', href: '#/zalo' }, me.zaloLinked ? 'Zalo: đã kết nối' : 'Kết nối Zalo') : null,
      V('feature:plans') === 'on' ? h('a', { class: 'btn ghost', href: '#/goi' }, 'Gói cước') : null,
      me.admin ? h('a', { class: 'btn ghost', href: '#/admin' }, T('admin')) : null)),
    h('div', { class: 'card' }, h('h2', {}, 'Quyền riêng tư'),
      h('p', { class: 'muted' }, 'Bạn có quyền nhận bản sao và xoá toàn bộ dữ liệu cá nhân của mình.'),
      h('div', { class: 'row' }, h('a', { class: 'btn ghost', href: '/api/account/export', 'data-ev': 'export-data' }, 'Tải dữ liệu của tôi (JSON)'),
        h('a', { href: '#/dieu-khoan' }, 'Điều khoản'), h('a', { href: '#/bao-mat' }, 'Chính sách bảo mật')),
      h('h3', {}, 'Xoá tài khoản'), h('p', { class: 'muted' }, 'Xoá vĩnh viễn video, kịch bản, ảnh, liên kết Zalo và thông tin đăng nhập. Chứng từ thanh toán được giữ ẩn danh theo luật kế toán.'),
      h('div', { class: 'row' }, del, h('button', { type: 'button', class: 'danger', 'data-ev': 'delete-account', onclick: async () => {
        if (del.value.trim().toUpperCase() !== 'XOA') return toast('Gõ XOA để xác nhận.');
        try { await api('/api/account/delete', { method: 'POST', body: { confirm: 'XOA' } }); toast('Đã xoá tài khoản.'); setTimeout(() => { location.hash = '#/'; location.reload(); }, 1200); } catch (e) { fail(e); }
      } }, 'Xoá vĩnh viễn'))),
    h('button', { type: 'button', class: 'ghost', onclick: () => document.getElementById('logout').click() }, T('logout')),
    footer());
}

function planCards(current, onBuy) {
  return h('div', { class: 'plans' }, ui.plans.map((p) => h('div', { class: 'plan' + (p.highlight ? ' hot' : '') + (p.id === current ? ' current' : '') },
    h('h2', {}, p.name), h('div', { class: 'price' }, p.price ? money(p.price) : '0đ', p.price && p.days ? h('small', {}, ` / ${p.days} ngày`) : null),
    h('p', { class: 'muted' }, p.desc),
    h('ul', {}, ...p.features.map((x) => h('li', {}, x)), h('li', {}, `${p.limits.render} video, ${p.limits.script} lượt AI viết mỗi ngày`)),
    p.id === current ? h('span', { class: 'pill done' }, 'Gói hiện tại')
      : p.price ? h('button', { type: 'button', 'data-ev': 'buy', onclick: (e) => (me ? onBuy?.(p, e.currentTarget) : openLogin('buy', { hash: '#/goi' })) }, 'Chọn gói này')
      : h('a', { class: 'btn ghost', href: '#/tao' }, 'Dùng miễn phí'))));
}

// ---------- plans & payment
async function showPlans() {
  viewed('plans');
  if (V('feature:plans') !== 'on') { show(h('a', { href: '#/' }, T('allVideos')), h('p', { class: 'muted' }, 'Gói cước chưa mở.')); return; }
  if (!me) { show(h('div', { class: 'section' }, h('div', { class: 'head' }, h('h1', {}, 'Bảng giá'), h('p', {}, 'Bắt đầu miễn phí, nâng cấp khi cần nhiều video hơn.'))), planCards(null), footer()); return; }
  const r = await api('/api/plans');
  async function buy(plan, btn) {
    if (!r.payment) return toast('Thanh toán đang tạm đóng. Liên hệ quản trị viên.');
    await busy(btn, 'Đang tạo đơn…', async () => {
      try { const { order } = await api('/api/orders', { method: 'POST', body: { plan: plan.id } }); payModal(order, plan); track('pay_open', { plan: plan.id }); } catch (e) { fail(e); }
    });
  }
  show(h('h1', {}, 'Gói cước'),
    h('p', {}, 'Bạn đang dùng gói ', h('b', {}, r.current.name), r.current.expires ? ` (đến ${fmtDate(r.current.expires)})` : '', '.'),
    planCards(r.current.id, buy),
    r.orders.length ? h('div', { class: 'card' }, h('h2', {}, 'Đơn của bạn'), ...r.orders.map((o) => h('div', { class: 'row' },
      h('code', {}, o.code), money(o.amount), h('span', { class: 'pill ' + (o.status === 'paid' ? 'done' : o.status === 'pending' ? 'queued' : 'failed') }, { pending: 'Chờ thanh toán', paid: 'Đã thanh toán', cancelled: 'Đã huỷ', expired: 'Hết hạn' }[o.status] || o.status),
      h('small', { class: 'muted' }, fmtDate(o.created_at)),
      o.status === 'pending' ? h('button', { type: 'button', class: 'small', onclick: (e) => buy(ui.plans.find((p) => p.id === o.plan) || { id: o.plan, name: o.plan }, e.currentTarget) }, 'Thanh toán') : null,
      o.status === 'pending' ? h('button', { type: 'button', class: 'ghost small', onclick: async () => { await api(`/api/orders/${o.code}/cancel`, { method: 'POST' }).catch(fail); showPlans(); } }, 'Huỷ') : null))) : null,
    footer());
}

/** Payment window: VietQR, bank with its logo, copy buttons, countdown, and it notices the money by itself. */
function payModal(order, plan) {
  document.querySelector('.sheet-bg')?.remove();
  const bank = bankOf(order.bank), hold = (order.holdMinutes || 15) * 60_000;
  const until = Math.max(Date.now() + 60_000, (order.created_at || Date.now()) + hold);
  const clock = h('b', { class: 'clock' }, '--:--'), ring = h('i', { class: 'ringfill' });
  const status = h('p', { class: 'wait' }, h('i', { class: 'spin' }), ' Đang chờ nhận tiền… trang tự cập nhật');
  const copy = (text, what) => h('button', { type: 'button', class: 'ghost small copy', onclick: async () => { try { await navigator.clipboard.writeText(text); toast('Đã sao chép ' + what + '.'); } catch { toast('Hãy bôi đen rồi copy.'); } } }, 'Sao chép');
  const close = () => { done = true; bg.remove(); };
  let done = false;
  const body = h('div', { class: 'paybox' },
    h('div', { class: 'payhead' }, h('div', {}, h('small', { class: 'muted' }, 'Thanh toán gói'), h('h2', {}, plan?.name || order.planName || '')), h('div', { class: 'timer' }, h('span', { class: 'ring' }, ring), clock)),
    h('div', { class: 'pay' },
      h('div', { class: 'qrwrap' }, h('img', { src: order.qr, alt: 'Mã QR chuyển khoản', width: 240, height: 240 }), h('small', { class: 'muted' }, 'Mở app ngân hàng → Quét mã QR')),
      h('div', { class: 'payinfo' },
        h('div', { class: 'bankrow' }, bankLogo(bank, 44), h('div', {}, h('b', {}, bank.name), h('small', { class: 'muted' }, order.accountName))),
        h('div', { class: 'kv' }, h('span', {}, 'Số tài khoản'), h('b', {}, order.account), copy(order.account, 'số tài khoản')),
        h('div', { class: 'kv' }, h('span', {}, 'Số tiền'), h('b', { class: 'amount' }, money(order.amount)), copy(String(order.amount), 'số tiền')),
        h('div', { class: 'kv' }, h('span', {}, 'Nội dung'), h('b', { class: 'memo' }, order.memo), copy(order.memo, 'nội dung')),
        h('p', { class: 'muted small' }, order.note))),
    status,
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('a', { href: '#/hoan-tien', onclick: close }, 'Chính sách hoàn tiền'),
      h('button', { type: 'button', class: 'ghost small', onclick: async () => { if (!confirm('Huỷ đơn này?')) return; await api(`/api/orders/${order.code}/cancel`, { method: 'POST' }).catch(fail); close(); showPlans(); } }, 'Huỷ đơn')));
  const bg = h('div', { class: 'sheet-bg', onclick: (e) => { if (e.target === bg) close(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Thanh toán' }, h('button', { type: 'button', class: 'ghost small close', 'aria-label': 'Đóng', onclick: close }, '✕'), body));
  document.body.append(bg);
  const tick = () => {
    if (done || !document.body.contains(bg)) return;
    const left = until - Date.now();
    if (left <= 0) {
      clock.textContent = '00:00'; ring.style.cssText = 'transform:rotate(0deg)';
      status.replaceChildren('⏰ Hết thời gian giữ mã. Nếu bạn đã chuyển khoản, gói vẫn được kích hoạt tự động khi tiền về.');
    } else {
      const m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000);
      clock.textContent = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      ring.style.cssText = `transform:rotate(${360 * (left / hold)}deg)`;
      clock.classList.toggle('low', left < 120_000);
      setTimeout(tick, 1000);
    }
  };
  tick();
  const poll = async () => {
    if (done || !document.body.contains(bg)) return;
    const st = await api('/api/orders/' + order.code).catch(() => null);
    if (st?.order.status === 'paid') {
      done = true; track('pay_done', { plan: order.plan });
      body.replaceChildren(h('div', { class: 'success' }, h('span', { class: 'tick' }, '✓'), h('h2', {}, 'Thanh toán thành công!'), h('p', { class: 'muted' }, `Gói ${plan?.name || ''} đã được kích hoạt. Chúc bạn sáng tạo vui vẻ!`),
        h('button', { type: 'button', onclick: async () => { bg.remove(); me = await api('/api/me').catch(() => me); location.hash = '#/tao'; } }, 'Tạo video ngay')));
      return;
    }
    setTimeout(poll, 4000);
  };
  setTimeout(poll, 4000);
}

// ---------- Zalo
async function showZalo() {
  viewed('zalo');
  if (!ui.zalo?.enabled) { show(h('a', { href: '#/' }, T('allVideos')), h('p', { class: 'muted' }, 'Tính năng Zalo chưa mở.')); return; }
  const z = await api('/api/zalo/me');
  const codeBox = h('div');
  const content = z.linked
    ? [h('p', {}, 'Đã kết nối với Zalo ', h('b', {}, z.link.name || ''), ' từ ', fmtDate(z.link.linked_at), '.'),
       h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!z.link.notify, onchange: async (e) => { await api('/api/zalo/notify', { method: 'POST', body: { on: e.target.checked } }).then(() => toast('Đã lưu.'), fail); } }), 'Gửi video dựng xong về Zalo'),
       h('button', { type: 'button', class: 'ghost small', 'data-ev': 'zalo-unlink', onclick: async () => { await api('/api/zalo/unlink', { method: 'POST' }).catch(fail); me.zaloLinked = false; showZalo(); } }, 'Bỏ kết nối')]
    : [h('p', {}, 'Kết nối Zalo để tạo video bằng tin nhắn và nhận video về Zalo.'),
       h('button', { type: 'button', 'data-ev': 'zalo-code', onclick: async () => {
         try {
           const r = await api('/api/zalo/code', { method: 'POST' });
           codeBox.replaceChildren(h('ol', {},
             h('li', {}, 'Mở bot: ', r.botLink ? h('a', { href: r.botLink, target: '_blank', rel: 'noopener' }, r.botLink) : '(quản trị chưa nhập đường dẫn bot)'),
             h('li', {}, 'Gửi tin nhắn: ', h('b', { class: 'memo' }, r.command), ' ', h('button', { type: 'button', class: 'ghost small', onclick: () => navigator.clipboard?.writeText(r.command).then(() => toast('Đã sao chép.')) }, 'Sao chép')),
             h('li', {}, `Mã có hạn ${r.expiresMin} phút. Kết nối xong trang này tự cập nhật.`)));
           const poll = async () => { if (!document.body.contains(codeBox)) return; const s = await api('/api/zalo/me').catch(() => null); if (s?.linked) { me.zaloLinked = true; toast('Đã kết nối Zalo!'); return showZalo(); } setTimeout(poll, 4000); };
           setTimeout(poll, 4000);
         } catch (e) { fail(e); }
       } }, 'Lấy mã kết nối'), codeBox];
  show(h('a', { href: '#/' }, T('allVideos')), h('h1', {}, 'Tạo video qua Zalo'),
    h('div', { class: 'card' }, ...content),
    h('div', { class: 'card' }, h('h2', {}, 'Cách dùng trong Zalo'), h('ul', {},
      h('li', {}, h('b', {}, 'KB'), ' + kịch bản của bạn → nhận video bàn tay vẽ'),
      h('li', {}, h('b', {}, 'TAO'), ' + chủ đề → AI viết kịch bản rồi dựng'),
      h('li', {}, h('b', {}, 'MAU'), ' → kịch bản mẫu · ', h('b', {}, 'TT'), ' → trạng thái · ', h('b', {}, 'DS'), ' → video gần đây'),
      h('li', {}, h('b', {}, 'KHUNG DOC/NGANG'), ', ', h('b', {}, 'PHONGCACH'), ', ', h('b', {}, 'GIONG'), ' → chọn khung, phong cách, giọng'))));
}

// ---------- watch a finished video
async function showWatch(pid, jobId) {
  viewed('watch', { project: pid });
  show(skeleton(1, 'sk-player'));
  const [{ spec }, { jobs }] = await Promise.all([api('/api/projects/' + pid), api(`/api/projects/${pid}/jobs`)]);
  const job = jobs.find((j) => j.id === jobId);
  if (!job || job.status !== 'done') { toast('Video chưa sẵn sàng.'); location.hash = '#/p/' + pid; return; }
  const portrait = spec.ratio === '9:16';
  const video = h('video', { src: `/api/jobs/${jobId}/video?inline=1`, controls: true, playsinline: true, autoplay: true, preload: 'auto', class: 'player' });
  video.addEventListener('ended', () => track('video_end', { job: jobId }));
  let shared = !!job.shared;
  const shareBtn = V('feature:community') === 'hidden' ? null : h('button', { type: 'button', class: 'ghost', disabled: V('feature:community') === 'dev', 'data-ev': 'community-share', onclick: async (e) => {
    await busy(e.currentTarget, 'Đang lưu…', async () => {
      try { const r = await api(`/api/jobs/${jobId}/share`, { method: 'POST', body: { on: !shared } }); shared = r.shared; toast(shared ? 'Đã chia sẻ lên Cộng đồng 🌏' : 'Đã gỡ khỏi Cộng đồng.'); } catch (err) { fail(err); }
    });
    shareBtn.textContent = shared ? '🌏 Gỡ khỏi Cộng đồng' : '🌏 Chia sẻ lên Cộng đồng';
  } }, shared ? '🌏 Gỡ khỏi Cộng đồng' : '🌏 Chia sẻ lên Cộng đồng');
  const tags = [spec.caption, (spec.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
  show(h('a', { href: '#/video' }, '← Video của tôi'),
    h('div', { class: 'watch' + (portrait ? '' : ' wide') },
      h('div', { class: 'stage' }, platformFrame(portrait ? iphone(video) : h('div', { class: 'screen flat' }, video), spec)),
      h('div', { class: 'scenes' },
        h('div', { class: 'card' }, h('span', { class: 'badge' }, '🎉 Đã dựng xong'), h('h1', { style: 'font-size:1.5rem' }, spec.title),
          h('p', { class: 'muted' }, [L('modes', spec.mode || 'hand'), L('styles', spec.style), portrait ? 'Dọc 9:16' : 'Ngang 16:9', 'Dựng lúc ' + fmtDate(job.finished_at || job.created_at)].join(' · ')),
          h('div', { class: 'row' }, h('a', { class: 'btn', href: `/api/jobs/${jobId}/video`, download: true, 'data-ev': 'download' }, '⬇ ' + T('download')),
            V('feature:srt') === 'hidden' ? null : h('a', { class: 'btn ghost', href: `/api/jobs/${jobId}/srt`, download: true, 'data-ev': 'download-srt' }, T('subtitles')),
            shareBtn, h('a', { class: 'btn ghost', href: '#/p/' + pid, 'data-ev': 'edit-again' }, '✏️ Sửa & dựng lại'))),
        tags ? h('div', { class: 'card' }, h('h2', {}, T('post')), h('p', { class: 'caption' }, tags),
          h('button', { type: 'button', class: 'ghost small', 'data-ev': 'copy-caption', onclick: async () => { try { await navigator.clipboard.writeText(tags); toast('Đã sao chép caption và hashtag.'); } catch { toast('Hãy bôi đen rồi copy.'); } } }, 'Sao chép caption + hashtag')) : null,
        navigator.share ? h('button', { type: 'button', class: 'ghost', 'data-ev': 'native-share', onclick: async () => {
          try { const blob = await (await fetch(`/api/jobs/${jobId}/video`)).blob(); await navigator.share({ files: [new File([blob], (spec.title || 'video').slice(0, 50) + '.mp4', { type: 'video/mp4' })], title: spec.title }); }
          catch (e) { if (e.name !== 'AbortError') toast('Thiết bị không hỗ trợ chia sẻ tệp, hãy tải về rồi đăng.'); }
        } }, '📤 Chia sẻ sang ứng dụng khác') : null)));
}

// ---------- community: videos people chose to share
async function showCommunity() {
  viewed('community');
  if (V('feature:community') === 'hidden') { show(h('p', { class: 'muted' }, 'Cộng đồng chưa mở.')); return; }
  let sort = 'new';
  const grid = h('div', {}, skeleton(8, 'sk-tall'));
  const tabs = h('div', { class: 'chips', style: 'justify-content:flex-start' });
  const paintTabs = () => tabs.replaceChildren(...[['new', '🆕 Mới nhất'], ['top', '🔥 Nổi bật']].map(([k, n]) => h('button', { type: 'button', class: 'chip' + (k === sort ? ' on' : ''), onclick: () => { sort = k; paintTabs(); load(); } }, n)));
  async function load() {
    grid.replaceChildren(skeleton(8, 'sk-tall'));
    try {
      const { videos } = await api('/api/community?sort=' + sort);
      grid.replaceChildren(videos.length ? h('div', { class: 'community' }, videos.map(vcard)) : h('div', { class: 'card empty' }, h('span', { class: 'big-emoji' }, '🌱'), h('p', { class: 'muted' }, 'Chưa có video nào được chia sẻ. Hãy là người đầu tiên!'), h('a', { class: 'btn', href: '#/tao' }, 'Tạo video')));
    } catch (e) { grid.replaceChildren(h('p', { class: 'error' }, e.message)); }
  }
  function vcard(v) {
    const vid = h('video', { src: `/api/community/${v.job_id}/video#t=0.5`, muted: true, playsinline: true, loop: true, preload: 'metadata' });
    vid.muted = true;
    const count = h('span', {}, ' ' + v.likes);
    const likeBtn = h('button', { type: 'button', class: 'like' + (v.liked ? ' on' : ''), 'aria-label': 'Thích', onclick: async (e) => {
      e.stopPropagation();
      if (!me) return openLogin('like', { hash: '#/cong-dong' });
      try { const r = await api(`/api/community/${v.job_id}/like`, { method: 'POST', body: { on: !v.liked } }); v.liked = r.liked; v.likes = r.likes; likeBtn.classList.toggle('on', v.liked); count.textContent = ' ' + v.likes; } catch (err) { fail(err); }
    } }, '♥', count);
    const card = h('div', { class: 'vcard' + (v.ratio === '16:9' ? ' wide' : ''), tabindex: 0, onclick: () => openPlayer(v), onmouseenter: () => vid.play().catch(() => {}), onmouseleave: () => vid.pause() },
      h('div', { class: 'vthumb' }, vid, h('span', { class: 'play' }, '▶'), h('span', { class: 'mi' }, MODE_ICON[v.mode] || '✍️')),
      h('div', { class: 'vmeta' }, h('b', {}, v.title), h('div', { class: 'row', style: 'justify-content:space-between' }, h('small', { class: 'muted' }, v.author || ''), likeBtn)));
    return card;
  }
  function openPlayer(v) {
    track('community_play', { job: v.job_id });
    api(`/api/community/${v.job_id}/view`, { method: 'POST' }).catch(() => {});
    const video = h('video', { src: `/api/community/${v.job_id}/video`, controls: true, autoplay: true, playsinline: true, class: 'player' });
    const close = () => { video.pause(); bg.remove(); };
    const bg = h('div', { class: 'sheet-bg', onclick: (e) => { if (e.target === bg) close(); } },
      h('div', { class: 'playerbox' + (v.ratio === '16:9' ? ' wide' : '') }, h('button', { type: 'button', class: 'ghost small close', 'aria-label': 'Đóng', onclick: close }, '✕'), video,
        h('div', { class: 'row', style: 'justify-content:space-between' }, h('div', {}, h('b', {}, v.title), h('div', { class: 'muted' }, (v.author || '') + ' · ' + L('modes', v.mode || 'hand'))),
          h('a', { class: 'btn small', href: '#/tao', onclick: close, 'data-ev': 'community-make' }, 'Làm video như này'))));
    document.body.append(bg);
  }
  show(h('div', { class: 'section' }, h('div', { class: 'head' }, h('h1', {}, h('span', { class: 'grad-text' }, 'Cộng đồng'), ' sáng tạo'), h('p', {}, 'Video do mọi người làm bằng ' + ui.brand.name + '. Dựng xong video, bấm "Chia sẻ lên Cộng đồng" để góp mặt.'))),
    tabs, grid, footer());
  paintTabs(); load();
}

// ---------- editor
let pv = null;
function stopPreview() { if (pv) { cancelAnimationFrame(pv.raf); pv = null; } }

const imgCache = new Map();
function loadImg(src) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }));
  return imgCache.get(src);
}
let iconSet = null;
const getIcons = () => (iconSet ||= fetch('/assets/icons/tabler.json').then((r) => r.json()).catch(() => ({})));
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
  viewed('editor', { project: id });
  const canvas = h('canvas', { 'aria-label': 'Xem trước video' });
  const playBtn = h('button', { type: 'button', class: 'small', 'data-ev': 'preview-play' }, 'Tạm dừng');
  const status = h('span', { class: 'muted' }, 'Đã lưu');
  const imageAI = V('feature:imageAI') === 'on';
  const imgList = ['gemini', 'openai'].filter((k) => me.ai?.[k]).map((k) => [k, 'Vẽ bằng ' + L('ai', k), 'ai:' + k]);
  const imgProvider = h('select', { hidden: !imageAI }, options(imgList, me.ai?.[ui.defaults.imageAI] ? ui.defaults.imageAI : imgList[0]?.[0]));

  const save = debounce(async () => {
    status.textContent = 'Đang lưu…';
    try { const r = await api('/api/projects/' + id, { method: 'PUT', body: { spec } }); Object.assign(spec, r.spec); status.textContent = 'Đã lưu'; }
    catch (e) { status.textContent = 'Chưa lưu được'; fail(e); }
  }, 900);
  // never lose edits when leaving the page
  addEventListener('pagehide', () => save.flush(), { once: true });
  const refresh = debounce(() => buildPreview(spec, canvas, playBtn).catch(fail), 350);
  const changed = () => { save(); refresh(); };
  const field = (label, value, onInput, opts = {}) => h('label', {}, label, h(opts.area ? 'textarea' : 'input', { value: value ?? '', maxlength: opts.max || 80, rows: opts.area ? 3 : undefined, oninput: (e) => onInput(e.target.value) }));

  const introBox = h('div', { class: 'grid' });
  const paintIntro = () => introBox.replaceChildren(...(spec.intro ? [
    field('Chữ trên ảnh bìa', spec.intro.title, (v) => { spec.intro.title = v; changed(); }, { max: 90 }),
    field('Nhãn nổi bật', spec.intro.badge, (v) => { spec.intro.badge = v; changed(); }, { max: 18 }),
    field('Dòng phụ', spec.intro.sub, (v) => { spec.intro.sub = v; changed(); }, { max: 80 }),
    field('Biểu tượng (tên hình, vd rocket)', spec.intro.icon, (v) => { spec.intro.icon = v.trim().toLowerCase(); changed(); }, { max: 40 })] : []));
  paintIntro();
  const charField = V('feature:character') === 'hidden' ? null : photoField('Nhân vật tham chiếu', 'Ảnh thật thay cho người que ở mọi cảnh.', spec.character && spec.media?.[spec.character]);
  charField?.addEventListener('change', async () => {
    const v = charField.get();
    try {
      spec.media ||= {};
      if (!v) { delete spec.media.nv; delete spec.character; }
      else { spec.media.nv = v.startsWith('data:') ? await uploadData(v) : v; spec.character = 'nv'; }
      changed();
    } catch (e) { fail(e); }
  });
  const settings = h('div', { class: 'card' },
    h('label', {}, 'Tiêu đề', h('input', { value: spec.title, maxlength: 100, oninput: (e) => { spec.title = e.target.value; save(); } })),
    h('div', {}, h('span', { class: 'plabel' }, 'Kiểu video'), modePicker(spec.mode || 'hand', (k) => {
      spec.mode = k;
      if (MODE_STYLE[k] && k !== 'hand' && ui.enabledStyles.includes(MODE_STYLE[k]) && ['sunset', 'cosmos', 'manim', 'bold'].includes(spec.style)) spec.style = MODE_STYLE[k];
      changed();
    })),
    V('feature:intro') === 'hidden' ? null : h('label', { class: 'check' }, h('input', { type: 'checkbox', disabled: V('feature:intro') === 'dev', checked: !!spec.intro, onchange: (e) => {
      spec.intro = e.target.checked ? { title: spec.title, badge: BADGES[spec.format] || 'MỚI', icon: spec.scenes.flatMap((sc) => sc.diagram?.items || []).find((it) => it.t === 'icon')?.name } : null;
      paintIntro(); changed();
    } }), h('span', {}, h('b', {}, 'Mở đầu là ảnh bìa thu hút'), h('small', { class: 'muted' }, ' (cũng là ảnh thumbnail)'))),
    introBox, charField,
    spec.format ? h('p', { class: 'muted' }, 'Dạng video: ', h('b', {}, FORMAT_LABELS[spec.format] || spec.format)) : null,
    h('div', { class: 'grid' },
      h('label', {}, 'Phong cách', h('select', { onchange: (e) => { spec.style = e.target.value; delete spec.tool; changed(); } }, options(styleOptions().concat(styleOptions().some(([k]) => k === spec.style) ? [] : [[spec.style, L('styles', spec.style)]]), spec.style))),
      h('label', {}, 'Dụng cụ vẽ', h('select', { onchange: (e) => { if (e.target.value) spec.tool = e.target.value; else delete spec.tool; changed(); } },
        options([['', 'Theo phong cách'], ...Object.entries(ui.labels.tools).map(([k, v]) => [k, v, 'tool:' + k])], spec.tool || ''))),
      h('label', {}, 'Khung hình', h('select', { onchange: (e) => { spec.ratio = e.target.value; changed(); } }, options(ratioOptions(false), spec.ratio))),
      h('label', {}, 'Chuyển cảnh', h('select', { onchange: (e) => { spec.transition = e.target.value; changed(); } }, options([['auto', 'Tự động, đa dạng'], ['fade', 'Mờ dần'], ['slide', 'Trượt ngang'], ['wipe', 'Bàn tay xoá bảng'], ['zoom', 'Phóng to']], spec.transition || 'auto'))),
      h('label', {}, T('voice'), h('select', { onchange: (e) => { spec.voice.voiceId = e.target.value; save(); } }, options(voiceOptions(), spec.voice?.voiceId || ui.defaults.voice))),
      V('feature:speed') === 'hidden' ? null : h('label', {}, 'Tốc độ đọc', h('select', { disabled: V('feature:speed') === 'dev', onchange: (e) => { spec.voice.speed = Number(e.target.value); save(); } },
        options([['0.9', 'Chậm'], ['1', 'Vừa'], ['1.1', 'Hơi nhanh'], ['1.2', 'Nhanh']], String(spec.voice?.speed ?? 1)))),
      h('label', {}, 'Tên kênh', h('input', { value: spec.channel || '', maxlength: 40, oninput: (e) => { spec.channel = e.target.value; changed(); } })),
      h('label', {}, 'Số tập', h('input', { value: spec.episode || '', maxlength: 30, oninput: (e) => { spec.episode = e.target.value; changed(); } })),
      V('feature:subtitles') === 'hidden' ? null : h('label', { class: 'check' }, h('input', { type: 'checkbox', disabled: V('feature:subtitles') === 'dev', checked: !!spec.subtitles, onchange: (e) => { spec.subtitles = e.target.checked; changed(); } }), T('subsOnPicture'))));

  const scenesBox = h('div', { class: 'scenes' });
  const DIAGRAM_KINDS = Object.entries(ui.labels.kinds).map(([k, v]) => [k, v, 'kind:' + k]);
  function diagramEditor(sc) {
    const d = sc.diagram, set = (k, v) => { d[k] = v; changed(); };
    const list = (v) => v.split(',').map((x) => x.trim()).filter(Boolean);
    const kind = h('select', { onchange: (e) => {
      d.kind = e.target.value;
      if (d.kind === 'stick' && !d.actors?.length) d.actors = [{ action: 'wave', label: 'Bạn' }];
      if (d.kind === 'sketch') return redesign(sc);
      drawScenes(); changed();
    } }, options(DIAGRAM_KINDS, d.kind));
    const actorRow = (i) => {
      const a = (d.actors ||= [])[i];
      return h('div', { class: 'grid' },
        h('label', {}, `Người ${i + 1} — động tác`, h('select', { onchange: (e) => {
          if (!e.target.value) d.actors.splice(i, 1); else if (a) a.action = e.target.value; else d.actors.push({ action: e.target.value });
          drawScenes(); changed();
        } }, options([...(i > 0 ? [['', '— không có —']] : []), ...Object.entries(ui.labels.actions)], a?.action || ''))),
        a ? field('Nhãn dưới chân', a.label, (v) => { a.label = v; changed(); }, { max: 16 }) : null);
    };
    const fields = {
      statement: [field('Câu chốt (viết tay)', d.text, (v) => set('text', v), { max: 140, area: true })],
      number: [field('Con số', d.number, (v) => set('number', v), { max: 10 }), field('Chú thích', d.caption, (v) => set('caption', v))],
      flow: [field('Các ô (cách nhau bởi dấu phẩy, 2-4 ô)', (d.items || []).join(', '), (v) => set('items', list(v).slice(0, 4)))],
      bars: [field('Số ban đầu (vd 10tr, có thể để trống)', d.start, (v) => set('start', v), { max: 10 }), field('Các giá trị (cách nhau bởi dấu phẩy)', (d.values || []).join(', '), (v) => set('values', list(v).map(Number).filter((n) => isFinite(n)))),
        field('Nhãn từng cột (cách nhau bởi dấu phẩy)', (d.labels || []).join(', '), (v) => set('labels', list(v))), field('Đơn vị', d.unit, (v) => set('unit', v), { max: 6 })],
      compare: [field('Bên trái (cách sai)', d.left, (v) => set('left', v), { max: 24 }), field('Ghi chú trái', d.leftNote, (v) => set('leftNote', v)),
        field('Bên phải (cách đúng)', d.right, (v) => set('right', v), { max: 24 }), field('Ghi chú phải', d.rightNote, (v) => set('rightNote', v))],
      sketch: [sketchEditor(sc)],
      stick: [actorRow(0), actorRow(1), field('Lời thoại người 1 (bong bóng)', d.bubble, (v) => set('bubble', v), { max: 60 }), field('Chú thích', d.caption, (v) => set('caption', v), { max: 60 })],
      steps: [field('Các bước (mỗi dòng một bước)', (d.items || []).join('\n'), (v) => set('items', v.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 4)), { area: true, max: 300 })],
    }[d.kind] || [];
    return h('div', { class: 'panel' }, h('span', { class: 'tag' }, 'Bàn tay vẽ từng nét'),
      h('div', { class: 'grid' }, h('label', {}, 'Kiểu hình', kind), d.kind === 'sketch' ? null : field('Tiêu đề (không bắt buộc)', d.title, (v) => set('title', v), { max: 60 })), ...fields);
  }
  // free redesign of one scene's board from its current lines (rules on the server, no AI cost)
  async function redesign(sc) {
    try {
      await save.flush();
      const r = await api(`/api/projects/${id}/compose`, { method: 'POST', body: { scene: spec.scenes.indexOf(sc) } });
      Object.assign(spec, r.spec); drawScenes(); refresh();
    } catch (e) { fail(e); }
  }
  const ITEM_NAMES = { text: 'Chữ', icon: 'Hình', person: 'Người que', chart: 'Biểu đồ', image: 'Ảnh thật', qr: 'Mã QR' };
  function sketchEditor(sc) {
    const d = sc.diagram, items = d.items || [];
    const rows = items.map((it) => {
      if (!ITEM_NAMES[it.t]) return null;
      const set = (k, v) => { it[k] = v; changed(); };
      const f = [];
      if (it.t === 'text') f.push(field('Chữ', it.text, (v) => set('text', v), { max: 60 }));
      if (it.t === 'icon') f.push(field('Tên hình (tiếng Anh, vd pig-money)', it.name, (v) => set('name', v.trim().toLowerCase()), { max: 40 }), field('Nhãn', it.label, (v) => set('label', v), { max: 30 }));
      if (it.t === 'person') f.push(h('label', {}, 'Động tác', h('select', { onchange: (e) => set('action', e.target.value) }, options(Object.entries(ui.labels.actions), it.action))),
        field('Nhãn', it.label, (v) => set('label', v), { max: 16 }), field('Lời thoại', it.bubble, (v) => set('bubble', v), { max: 50 }));
      if (it.t === 'chart') f.push(h('small', { class: 'muted' }, ui.labels.kinds[it.kind] || it.kind));
      if (it.t === 'image') f.push(field('Nhãn dưới ảnh', it.label, (v) => set('label', v), { max: 40 }));
      if (it.t === 'qr') f.push(field('Link trong mã QR', it.text, (v) => set('text', v.trim()), { max: 300 }), field('Nhãn', it.label, (v) => set('label', v), { max: 30 }));
      f.push(field('Hiện khi đọc tới', it.cue, (v) => set('cue', v), { max: 40 }));
      return h('div', { class: 'skrow' }, h('span', { class: 'tag' }, ITEM_NAMES[it.t]), ...f,
        h('button', { type: 'button', class: 'ghost small', onclick: () => { d.items = items.filter((x) => x !== it && !(x.on === it.id || x.from === it.id || x.to === it.id)); drawScenes(); changed(); } }, 'Bỏ'));
    });
    return h('div', { class: 'sketch' }, ...rows,
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'ghost small', 'data-ev': 'redesign', onclick: () => redesign(sc) }, 'Thiết kế lại theo lời (miễn phí)')));
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
    } catch (e) { fail(e); return false; }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Vẽ lại bằng AI'; } }
  }
  const drawAllBtn = h('button', { type: 'button', class: 'ghost', 'data-ev': 'draw-all', onclick: async () => { if (await drawAll()) toast('Mọi cảnh đã có hình.'); } }, T('drawAll'));
  async function drawAll() {
    const todo = [];
    spec.scenes.forEach((sc, si) => sc.panels.forEach((p, pi) => { if (!sc.diagram && !p.image?.startsWith('r2:')) todo.push([si, pi]); }));
    if (!todo.length) return true;
    if (!imgProvider.options.length || !imageAI) {
      // no image AI: turn picture scenes into hand-drawn boards instead of blocking the render
      for (const si of [...new Set(todo.map(([si]) => si))]) await redesign(spec.scenes[si]);
      return true;
    }
    drawAllBtn.disabled = true;
    let ok = true;
    for (let i = 0; i < todo.length; i++) {
      drawAllBtn.textContent = `Đang vẽ ${i + 1}/${todo.length}…`;
      if (!(await drawPanel(...todo[i]))) { ok = false; break; }
    }
    drawAllBtn.disabled = false; drawAllBtn.textContent = T('drawAll');
    drawScenes();
    return ok;
  }
  function drawScenes() {
    panelImgs.clear();
    drawAllBtn.hidden = !imageAI || !spec.scenes.some((sc) => !sc.diagram);
    const move = (si, d) => { const j = si + d; [spec.scenes[si], spec.scenes[j]] = [spec.scenes[j], spec.scenes[si]]; drawScenes(); changed(); };
    scenesBox.replaceChildren(...spec.scenes.map((sc, si) => h('div', { class: 'scene' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, `Cảnh ${si + 1}`),
        h('div', { class: 'row' },
          imageAI || !sc.diagram ? h('button', { type: 'button', class: 'ghost small', onclick: () => {
            if (sc.diagram) { delete sc.diagram; sc.panels = [{ prompt: 'a simple illustration of: ' + (sc.lines[0] || ''), image: '' }]; }
            else return redesign(sc);
            drawScenes(); changed();
          } }, sc.diagram ? 'Đổi sang tranh AI' : 'Đổi sang bảng vẽ') : null,
          h('button', { type: 'button', class: 'ghost small', disabled: si === 0, 'aria-label': 'Đưa cảnh lên', onclick: () => move(si, -1) }, '↑'),
          h('button', { type: 'button', class: 'ghost small', disabled: si === spec.scenes.length - 1, 'aria-label': 'Đưa cảnh xuống', onclick: () => move(si, 1) }, '↓'),
          h('button', { type: 'button', class: 'ghost small', disabled: spec.scenes.length < 2, onclick: () => { spec.scenes.splice(si, 1); drawScenes(); changed(); } }, 'Xoá cảnh'))),
      sc.lines.map((line, li) => h('label', {}, `Câu ${li + 1}`, h('textarea', { class: 'line', rows: 2, maxlength: 160, value: line,
        oninput: (e) => { sc.lines[li] = e.target.value; changed(); } }))),
      sc.lines.length < 3 ? h('button', { type: 'button', class: 'ghost small', onclick: () => { sc.lines.push('Câu mới.'); drawScenes(); changed(); } }, '+ Thêm câu') : null,
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
        h('button', { type: 'button', class: 'ghost', 'data-ev': 'add-scene', onclick: () => {
          spec.scenes.push({ lines: ['Câu thoại mới.'], panels: [], diagram: { kind: 'statement', text: 'Câu chốt' } }); drawScenes(); changed();
          redesign(spec.scenes[spec.scenes.length - 1]);
        } }, '+ Thêm cảnh'),
        drawAllBtn));
  }
  drawScenes();

  const tags = () => [spec.caption, (spec.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
  const postCard = h('div', { class: 'card' }, h('h2', {}, T('post')),
    field('Caption', spec.caption, (v) => { spec.caption = v; save(); }, { area: true, max: 300 }),
    field('Hashtag (cách nhau bởi dấu cách)', (spec.hashtags || []).join(' '), (v) => { spec.hashtags = v.split(/\s+/).filter(Boolean); save(); }, { max: 300 }),
    h('button', { type: 'button', class: 'ghost small', 'data-ev': 'copy-caption', onclick: async () => {
      try { await navigator.clipboard.writeText(tags()); toast('Đã sao chép caption và hashtag.'); }
      catch { toast('Trình duyệt chặn sao chép, hãy bôi đen rồi copy.'); }
    } }, 'Sao chép caption + hashtag'));

  const jobsBox = h('div', { class: 'jobs' });
  const renderBtn = h('button', { type: 'button', 'data-ev': 'render', onclick: async () => {
    renderBtn.disabled = true;
    try {
      await save.flush();
      // never let placeholder art reach the video: draw (or redesign) what is missing first
      if (!(await drawAll())) { renderBtn.disabled = false; return; }
      await api(`/api/projects/${id}`, { method: 'PUT', body: { spec } });
      const { job } = await api(`/api/projects/${id}/render`, { method: 'POST' }); toast('Đã xếp video vào hàng chờ dựng.'); RenderDesk.open(spec, id, job.id).catch(fail); pollJobs();
      me = await api('/api/me').catch(() => me);
    }
    catch (e) { fail(e); }
    renderBtn.disabled = false;
  } }, T('render'));
  let pollTimer;
  async function pollJobs() {
    clearTimeout(pollTimer);
    if (!document.body.contains(jobsBox)) return;
    let jobs, queueLength;
    try { ({ jobs, queueLength } = await api(`/api/projects/${id}/jobs`)); } catch (error) { jobsBox.replaceChildren(h('p', { class: 'error' }, 'Chưa đọc được trạng thái: ' + error.message)); pollTimer = setTimeout(pollJobs, 4000); return; }
    const wasRunning = jobsBox.dataset.running === '1', running = jobs.some((j) => j.status === 'queued' || j.status === 'running');
    jobsBox.dataset.running = running ? '1' : '';
    // the moment a render finishes, take the user to watch it
    if (wasRunning && !running && jobs[0]?.status === 'done' && !document.querySelector('dialog.render-desk[open]')) { toast('🎉 Video đã dựng xong!'); location.hash = `#/xem/${id}/${jobs[0].id}`; return; }
    jobsBox.replaceChildren(...(jobs.length ? jobs.map((j) => h('div', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: 'pill ' + j.status }, JOB_TEXT[j.status] || j.status), h('small', { class: 'muted' }, fmtDate(j.created_at))),
      j.status === 'queued' ? h('small', { class: 'muted' }, `Có ${queueLength} video đang chờ. Máy dựng khởi động trong khoảng 1 phút.`) : null,
      j.status === 'running' ? h('p', { class: 'render-state' }, j.message || 'Máy dựng đang xử lý…') : null,
      j.status === 'running' ? h('progress', { max: 100, value: j.progress, 'aria-label': 'Tiến độ dựng video' }) : null,
      ['queued','running'].includes(j.status) ? h('button', { type: 'button', class: 'ghost small', onclick: () => RenderDesk.open(spec, id, j.id).catch(fail) }, 'Mở bàn dựng') : null,
      j.status === 'failed' ? h('p', { class: 'error' }, j.error || 'Dựng thất bại.') : null,
      j.status === 'done' ? h('div', { class: 'row' }, h('a', { class: 'btn small', href: `#/xem/${id}/${j.id}`, 'data-ev': 'watch' }, '▶ Xem video'), h('a', { href: `/api/jobs/${j.id}/video`, download: true, 'data-ev': 'download' }, T('download')),
        V('feature:srt') === 'hidden' ? null : h('a', { href: `/api/jobs/${j.id}/srt`, download: true, 'data-ev': 'download-srt' }, T('subtitles'))) : null))
      : [h('p', { class: 'muted' }, 'Chưa dựng lần nào.')]));
    if (jobs.some((j) => j.status === 'queued' || j.status === 'running')) pollTimer = setTimeout(pollJobs, 4000);
  }

  // cover image: the end of the first scene, without the hand
  const coverVis = V('feature:cover'), dupVis = V('feature:duplicate');
  const coverBtn = coverVis === 'hidden' ? null : h('button', { type: 'button', class: 'ghost small', disabled: coverVis === 'dev', 'data-ev': 'cover', onclick: async () => {
    try {
      const m = await previewModel(spec, 2), c = document.createElement('canvas');
      c.width = m.W * 2; c.height = m.H * 2;
      NV.renderFrame(c.getContext('2d'), m, spec.intro?.title ? 0 : Math.max(0.5, m.timeline.scenes[0].end - 0.45), { hand: false });
      c.toBlob((b) => { const a = h('a', { href: URL.createObjectURL(b), download: (spec.title || 'anh-bia').slice(0, 60) + '.png' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }, 'image/png');
    } catch (e) { fail(e); }
  } }, 'Tải ảnh bìa' + (coverVis === 'dev' ? DEV : ''));
  const dupBtn = dupVis === 'hidden' ? null : h('button', { type: 'button', class: 'ghost small', disabled: dupVis === 'dev', 'data-ev': 'duplicate', onclick: async () => {
    try { await save.flush(); const r = await api(`/api/projects/${id}/duplicate`, { method: 'POST', body: { ratio: spec.ratio === '9:16' ? '16:9' : '9:16' } }); location.hash = '#/p/' + r.id; toast('Đã tạo bản ' + (spec.ratio === '9:16' ? 'ngang' : 'dọc') + '.'); }
    catch (e) { fail(e); }
  } }, (spec.ratio === '9:16' ? 'Tạo bản ngang' : 'Tạo bản dọc') + (dupVis === 'dev' ? DEV : ''));
  const delBtn = h('button', { type: 'button', class: 'ghost small danger', 'data-ev': 'delete', onclick: async () => {
    if (!confirm('Xoá video này? Không khôi phục được.')) return;
    try { await api('/api/projects/' + id, { method: 'DELETE' }); location.hash = '#/'; } catch (e) { fail(e); }
  } }, 'Xoá video');

  const screenEl = spec.ratio === '9:16' ? iphone(canvas) : h('div', { class: 'screen flat' }, canvas);
  const preview = h('div', { class: 'preview' + (spec.ratio === '16:9' ? ' landscape' : '') },
    platformFrame(screenEl, spec),
    h('div', { class: 'row' }, playBtn,
      h('button', { type: 'button', class: 'ghost small', onclick: () => { if (pv) { pv.t = 0; pv.playing = true; playBtn.textContent = 'Tạm dừng'; } } }, 'Phát lại'),
      status),
    h('small', { class: 'muted' }, 'Xem trước không có tiếng; nhịp vẽ ước tính theo độ dài câu. Video dựng xong sẽ khớp đúng giọng đọc.'),
    h('div', { class: 'card' }, h('h2', {}, T('export')), h('div', { class: 'row' }, renderBtn, imgProvider), jobsBox,
      h('div', { class: 'row' }, coverBtn, dupBtn, delBtn)));
  playBtn.addEventListener('click', () => { if (!pv) return; pv.playing = !pv.playing; playBtn.textContent = pv.playing ? 'Tạm dừng' : 'Phát'; });

  show(h('a', { href: '#/' }, T('allVideos')), h('div', { class: 'editor' }, preview, h('div', { class: 'scenes' }, settings, scenesBox, postCard)));
  await buildPreview(spec, canvas, playBtn);
  pollJobs();
  let auto = false;
  try { auto = sessionStorage.getItem('autodraw:' + id) === '1'; sessionStorage.removeItem('autodraw:' + id); } catch {}
  if (auto && imageAI && imgProvider.options.length && spec.scenes.some((sc) => !sc.diagram && sc.panels.some((p) => p.prompt && !p.image))) drawAll();
}

const blankCanvas = () => Object.assign(document.createElement('canvas'), { width: 4, height: 3 });
let sansReady = null;
/** The modern sans the motion / maths / kinetic modes and the title card draw with. */
const loadSans = () => (sansReady ||= (async () => { try { const f = new FontFace(NV.SANS, 'url(/assets/fonts/BeVietnamPro-ExtraBold.ttf)'); await f.load(); document.fonts.add(f); } catch {} })());
async function previewModel(spec, dpr) {
  const entries = Object.entries(spec.media || {});
  const [images, hand, icons, pics] = await Promise.all([
    Promise.all(spec.scenes.map((sc) => Promise.all(sc.panels.map((p) => (imageUrl(p.image) ? loadImg(imageUrl(p.image)).catch(blankCanvas) : Promise.resolve(blankCanvas())))))),
    getHand(), getIcons(), Promise.all(entries.map(([, v]) => loadImg(mediaUrl(v)).catch(() => null))),
    document.fonts.load('29px Pangolin').catch(() => {}), loadSans(),
  ]);
  const media = Object.fromEntries(entries.map(([k], i) => [k, pics[i]]).filter(([, v]) => v));
  const timeline = NV.buildTimeline(spec.scenes, spec.scenes.map((s) => NV.estimateVoice(s.lines)), { intro: !!spec.intro?.title });
  const env = { createCanvas: (w, hgt) => { const c = document.createElement('canvas'); c.width = w; c.height = hgt; return c; } };
  return NV.prepare({ env, project: spec, timeline, images, hand, dpr, icons, media });
}

async function buildPreview(spec, canvas, playBtn) {
  const { W, H } = NV.logicalSize(spec.ratio);
  const dpr = Math.min(1.5, (window.devicePixelRatio || 1) * (spec.ratio === '9:16' ? 0.7 : 0.45));
  const model = await previewModel(spec, dpr), timeline = model.timeline;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.parentElement?.classList.toggle('landscape', spec.ratio === '16:9');
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

// admin.js (loaded after this file) defines showAdmin; start once every script is in
document.addEventListener('DOMContentLoaded', () => boot().catch(fatal));
