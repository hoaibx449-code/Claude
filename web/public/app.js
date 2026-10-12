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
const show = (...nodes) => view.replaceChildren(...nodes.flat().filter((n) => n != null && n !== false));
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
  document.querySelector('.brand').replaceChildren(ui.brand.name + ' ', h('span', {}, ui.brand.accent || ''));
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
async function boot() {
  document.getElementById('logout').addEventListener('click', async () => {
    track('click', { what: 'logout' }); flush();
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    location.hash = '#/'; location.reload();
  });
  try { me = await api('/api/me'); } catch (e) { if (e.status === 401) return showLogin(); return fatal(e); }
  applyUI(me.ui);
  document.getElementById('who').hidden = false;
  document.getElementById('adminLink').hidden = !me.admin;
  document.getElementById('whoEmail').textContent = me.user.email;
  window.addEventListener('hashchange', route);
  route();
}
function route() {
  stopPreview();
  const m = location.hash.match(/^#\/p\/([a-f0-9]{24})$/);
  const go = m ? showEditor(m[1])
    : location.hash.startsWith('#/admin') && me.admin ? showAdmin()
    : location.hash === '#/goi' ? showPlans()
    : location.hash === '#/zalo' ? showZalo()
    : showHome();
  go.catch(fatal);
}
function fatal(e) {
  track('error', { msg: String(e.message || e).slice(0, 200), fatal: true });
  show(h('div', { class: 'card' }, h('p', { class: 'error' }, e.message || String(e)), h('a', { href: '#/' }, 'Về trang chủ')));
}

// ---------- login
async function showLogin() {
  const cfg = await api('/api/auth/config');
  applyUI(cfg.ui);
  viewed('login');
  const box = h('div', { class: 'card login' }, h('h1', {}, T('loginTitle')), h('p', { class: 'muted' }, T('loginText')));
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
    s.onerror = () => toast('Không tải được nút đăng nhập Google. Kiểm tra mạng rồi tải lại trang.');
    document.head.append(s);
  }
  if (cfg.dev) {
    box.append(h('button', { type: 'button', class: 'ghost', 'data-ev': 'dev-login', onclick: async () => {
      await api('/api/auth/dev', { method: 'POST', body: { email: 'thu@localhost' } }); location.reload();
    } }, 'Đăng nhập thử (chỉ trên máy local)'));
  }
  if (!cfg.clientId && !cfg.dev) box.append(h('p', { class: 'error' }, 'Chủ trang chưa cấu hình đăng nhập Google.'));
  if (ui.zalo?.enabled && ui.zalo.botLink) box.append(h('p', { class: 'muted' }, 'Hoặc tạo video ngay trong Zalo: ', h('a', { href: ui.zalo.botLink, target: '_blank', rel: 'noopener', 'data-ev': 'login-zalo' }, 'nhắn cho bot'), '.'));
  show(box);
}

// ---------- home
const textAIOptions = () => [...['gemini', 'openai'].filter((k) => me.ai?.[k]).map((k) => [k, L('ai', k), 'ai:' + k]), ...(location.hostname === 'localhost' ? [['mock', 'Mẫu có sẵn (thử nghiệm)']] : [])];
function secondsOptions(def, max) {
  const list = [['30', '30 giây'], ['45', '45 giây'], ['60', '1 phút'], ['90', '1,5 phút'], ['150', '2,5 phút']].filter(([v]) => !max || Number(v) <= max);
  if (def && !list.some(([v]) => Number(v) === Number(def)) && (!max || def <= max)) list.push([String(def), `${def} giây`]);
  return list;
}
const FORMAT_LABELS = { auto: 'Tự nhận diện', explainer: 'Giải thích khái niệm', listicle: 'Danh sách (Top N)', howto: 'Hướng dẫn từng bước', story: 'Kể chuyện', compare: 'So sánh / đúng – sai', data: 'Số liệu', sales: 'Giới thiệu sản phẩm', motivation: 'Truyền cảm hứng', qa: 'Hỏi – đáp', news: 'Tin tức' };

function planBar() {
  const lim = me.limits || {}, used = me.used || {};
  const left = (k) => Math.max(0, (lim[k] || 0) - (used[k] || 0));
  const bits = [`Gói ${me.plan?.name || ''}`, `còn ${left('render')} lượt dựng`, me.ai?.gemini || me.ai?.openai ? `${left('script')} lượt AI viết` : null].filter(Boolean);
  return h('div', { class: 'planbar' }, h('span', {}, bits.join(' · ') + ' hôm nay'),
    me.plan?.expires ? h('small', { class: 'muted' }, ' · hết hạn ' + fmtDate(me.plan.expires)) : null,
    V('feature:plans') === 'on' && ui.plans?.some((p) => p.price > 0) ? h('a', { href: '#/goi', class: 'pill', 'data-ev': 'planbar-upgrade' }, me.plan?.id === 'free' ? 'Nâng cấp' : 'Gói cước') : null,
    ui.zalo?.enabled ? h('a', { href: '#/zalo', class: 'pill', 'data-ev': 'planbar-zalo' }, me.zaloLinked ? 'Zalo: đã kết nối' : 'Tạo video qua Zalo') : null);
}

async function showHome() {
  viewed('home');
  const { projects } = await api('/api/projects');
  const D = ui.defaults || {};
  const maxSec = me.plan?.maxSeconds;
  const f = {
    source: h('select', { id: 'f-source' }, options(['topic', 'mine-ai', 'mine-free'].map((k) => [k, L('sources', k), 'source:' + k]).filter(([k]) => ui.enabledSources.includes(k) || V('source:' + k) === 'dev'), ui.enabledSources.includes(D.source) ? D.source : ui.enabledSources[0])),
    topic: h('textarea', { id: 'f-topic', rows: 4, maxlength: 20000, placeholder: T('topicHint') }),
    subtitles: h('input', { type: 'checkbox', checked: !!D.subtitles }),
    ai: h('select', { id: 'f-ai' }, options(textAIOptions(), me.ai?.[D.textAI] ? D.textAI : textAIOptions()[0]?.[0])),
    seconds: h('select', { id: 'f-seconds' }, options(secondsOptions(D.seconds, maxSec), String(Math.min(D.seconds || 45, maxSec || 999)))),
    ratio: h('select', { id: 'f-ratio' }, options(ratioOptions(true), D.ratio || '9:16')),
    style: h('select', { id: 'f-style' }, options([['auto', 'Tự chọn theo nội dung'], ...styleOptions()], 'auto')),
    voice: h('select', { id: 'f-voice' }, options(voiceOptions(), D.voice)),
    channel: h('input', { id: 'f-channel', maxlength: 40, value: D.channel || '', placeholder: T('channel') }),
    episode: h('input', { id: 'f-episode', maxlength: 30, placeholder: T('episodeHint') }),
    tone: h('input', { id: 'f-tone', maxlength: 200, value: D.tone || '', placeholder: T('toneHint') }),
    visual: h('select', { id: 'f-visual' }, options(Object.entries(ui.labels.visual).map(([k, v]) => [k, v, 'visual:' + k]), D.visual || 'sketch')),
    format: h('select', { id: 'f-format' }, options(Object.entries(FORMAT_LABELS), 'auto')),
  };
  if (!f.ai.options.length) f.ai.append(h('option', { value: '' }, 'Chưa có khoá AI'));
  const topicLabel = h('span', {}, T('topic'));
  const detect = h('div', { class: 'detect muted' });
  const only = {};
  const go = h('button', { type: 'submit', 'data-ev': 'create' }, T('write'));
  const sync = () => {
    const src = f.source.value, mine = src !== 'topic';
    topicLabel.textContent = mine ? T('script') : T('topic');
    f.topic.placeholder = mine ? T('scriptHint') : T('topicHint'); f.topic.rows = mine ? 10 : 4;
    only.ai.hidden = src === 'mine-free' || !f.ai.value; only.seconds.hidden = mine; only.tone.hidden = mine; only.visual.hidden = mine;
    only.subs.hidden = V('feature:subtitles') === 'hidden';
    go.textContent = src === 'mine-free' ? 'Tạo video (miễn phí)' : mine ? 'AI minh hoạ kịch bản' : T('write');
    go.disabled = src === 'topic' && !f.ai.value;
    if (go.disabled) go.textContent = 'Chưa có AI — hãy chọn "Kịch bản của tôi"';
  };
  // live detection: what kind of video this text asks for
  const guess = debounce(async () => {
    const text = f.topic.value.trim();
    if (text.length < 15) { detect.replaceChildren(); return; }
    try {
      const r = await api('/api/intent', { method: 'POST', body: { text } });
      detect.replaceChildren('Nhận diện: ', h('b', {}, r.formatName), ' · ', h('b', {}, r.nicheName),
        ui.enabledStyles.includes(r.style) ? ` · phong cách gợi ý: ${L('styles', r.style)}` : '', r.hook ? ' · mở đầu gây tò mò ✓' : '');
    } catch {}
  }, 700);
  f.source.addEventListener('change', () => { sync(); track('choose', { source: f.source.value }); });
  f.topic.addEventListener('input', guess);
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault(); go.disabled = true; go.textContent = f.source.value === 'mine-free' ? 'Đang dựng bố cục…' : T('writing');
    try {
      const r = await api('/api/projects/generate', { method: 'POST', body: {
        source: f.source.value, subtitles: f.subtitles.checked, topic: f.topic.value, provider: f.ai.value, seconds: Number(f.seconds.value), ratio: f.ratio.value, style: f.style.value,
        voiceId: f.voice.value, channel: f.channel.value, episode: f.episode.value, tone: f.tone.value, visual: f.visual.value, format: f.format.value } });
      if (r.note) toast(r.note);
      try { sessionStorage.setItem('autodraw:' + r.id, '1'); } catch {}
      location.hash = '#/p/' + r.id;
    } catch (err) { fail(err); sync(); }
  } },
    h('h2', {}, T('newVideo')),
    h('div', { class: 'grid' }, h('label', {}, T('source'), f.source), h('label', {}, 'Dạng video', f.format)),
    h('label', { for: 'f-topic' }, topicLabel, f.topic), detect,
    h('div', { class: 'grid' },
      only.ai = h('label', {}, T('textAI'), f.ai), only.seconds = h('label', {}, T('duration'), f.seconds), h('label', {}, T('ratio'), f.ratio),
      only.visual = h('label', {}, T('visual'), f.visual), h('label', {}, T('style'), f.style), h('label', {}, T('voice'), f.voice), only.tone = h('label', {}, T('tone'), f.tone),
      h('label', {}, T('channel'), f.channel), h('label', {}, T('episode'), f.episode),
      only.subs = h('label', { class: 'check' }, f.subtitles, T('subsOnPicture'))),
    h('div', { class: 'row' }, go));
  sync();

  // ready-made scripts: one click to a real video, no AI needed
  const tplVis = V('feature:templates');
  const tplBox = ui.templates?.length && tplVis !== 'hidden' ? h('div', { class: 'card' },
    h('h2', {}, 'Kịch bản mẫu', tplVis === 'dev' ? h('small', { class: 'muted' }, DEV) : null),
    h('p', { class: 'muted' }, 'Chọn một mẫu để thử ngay (không tốn lượt AI), rồi sửa thành nội dung của bạn.'),
    h('div', { class: 'tpls' }, ui.templates.map((t) => h('button', { type: 'button', class: 'tpl', disabled: tplVis === 'dev', 'data-ev': 'template', onclick: async () => {
      try {
        const { template } = await api('/api/templates/' + t.id);
        if ([...f.source.options].some((o) => o.value === 'mine-free' && !o.disabled)) f.source.value = 'mine-free';
        f.topic.value = template.text; sync(); guess(); f.topic.focus();
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        track('template', { id: t.id });
      } catch (e) { fail(e); }
    } }, h('strong', {}, t.title))))) : null;

  // first visit: three steps
  const tips = store.get('nv_tips') ? null : h('div', { class: 'card tips' },
    h('h2', {}, 'Bắt đầu trong 3 bước'),
    h('ol', {}, h('li', {}, 'Dán kịch bản của bạn, chọn kịch bản mẫu, hoặc để AI viết từ chủ đề.'),
      h('li', {}, 'Xem trước bàn tay vẽ, sửa chữ và hình từng cảnh nếu muốn.'),
      h('li', {}, 'Bấm "Dựng video" để nhận MP4 có giọng đọc' + (ui.zalo?.enabled ? ', hoặc nhận thẳng qua Zalo.' : '.'))),
    h('button', { type: 'button', class: 'ghost small', onclick: (e) => { store.set('nv_tips', '1'); e.target.closest('.tips').remove(); } }, 'Đã hiểu'));

  const list = projects.length
    ? h('div', { class: 'projects' }, projects.map((p) => h('a', { class: 'proj', href: '#/p/' + p.id, 'data-ev': 'open-project' },
        h('strong', {}, p.title), h('small', {}, 'Sửa lần cuối ' + fmtDate(p.updated_at)),
        p.last_job ? h('span', { class: 'pill ' + p.last_job }, JOB_TEXT[p.last_job] || p.last_job) : null)))
    : h('p', { class: 'muted' }, T('noVideos'));
  show(h('h1', {}, T('homeTitle')), ui.notice ? h('div', { class: 'notice' }, ui.notice) : null, planBar(), tips, form, tplBox, h('h2', {}, T('myVideos')), list);
}

// ---------- plans & payment
async function showPlans() {
  viewed('plans');
  if (V('feature:plans') !== 'on') { show(h('a', { href: '#/' }, T('allVideos')), h('p', { class: 'muted' }, 'Gói cước chưa mở.')); return; }
  const r = await api('/api/plans');
  const box = h('div', { class: 'card', hidden: true });
  async function buy(plan) {
    try {
      const { order } = await api('/api/orders', { method: 'POST', body: { plan: plan.id } });
      box.hidden = false;
      box.replaceChildren(h('h2', {}, `Thanh toán gói ${plan.name}`),
        h('div', { class: 'pay' }, h('img', { src: order.qr, alt: 'Mã QR chuyển khoản', width: 260, height: 260 }),
          h('div', {}, h('p', {}, 'Số tiền: ', h('b', {}, money(order.amount))), h('p', {}, 'Nội dung chuyển khoản: ', h('b', { class: 'memo' }, order.memo)),
            h('p', {}, 'Tài khoản: ', order.account, ' · ', order.accountName), h('p', { class: 'muted' }, order.note),
            h('p', { class: 'muted' }, 'Đơn hết hạn ' + fmtDate(order.expires) + '.'), h('p', { class: 'wait' }, 'Đang chờ nhận tiền…'))));
      box.scrollIntoView({ behavior: 'smooth' });
      const poll = async () => {
        if (!document.body.contains(box)) return;
        const s = await api('/api/orders/' + order.code).catch(() => null);
        if (s?.order.status === 'paid') { toast('Đã nhận thanh toán, gói đã được kích hoạt!'); me = await api('/api/me'); return showPlans(); }
        setTimeout(poll, 5000);
      };
      setTimeout(poll, 5000);
    } catch (e) { fail(e); }
  }
  show(h('a', { href: '#/' }, T('allVideos')), h('h1', {}, 'Gói cước'),
    h('p', {}, 'Bạn đang dùng gói ', h('b', {}, r.current.name), r.current.expires ? ` (đến ${fmtDate(r.current.expires)})` : '', '.'),
    h('div', { class: 'plans' }, ui.plans.map((p) => h('div', { class: 'plan' + (p.highlight ? ' hot' : '') + (p.id === r.current.id ? ' current' : '') },
      h('h2', {}, p.name), h('div', { class: 'price' }, p.price ? money(p.price) : 'Miễn phí', p.price && p.days ? h('small', {}, ` / ${p.days} ngày`) : null),
      h('p', { class: 'muted' }, p.desc),
      h('ul', {}, ...p.features.map((x) => h('li', {}, x)), h('li', {}, `${p.limits.render} video, ${p.limits.script} lượt AI viết mỗi ngày`)),
      p.price && r.payment ? h('button', { type: 'button', 'data-ev': 'buy', onclick: () => buy(p) }, p.id === r.current.id ? 'Gia hạn' : 'Chọn gói này')
        : p.price ? h('small', { class: 'muted' }, 'Liên hệ quản trị để nâng cấp.') : null))),
    box,
    r.orders.length ? h('div', { class: 'card' }, h('h2', {}, 'Đơn của bạn'), ...r.orders.map((o) => h('div', { class: 'row' },
      h('code', {}, o.code), money(o.amount), h('span', { class: 'pill ' + (o.status === 'paid' ? 'done' : o.status === 'pending' ? 'queued' : 'failed') }, { pending: 'Chờ thanh toán', paid: 'Đã thanh toán', cancelled: 'Đã huỷ', expired: 'Hết hạn' }[o.status] || o.status),
      h('small', { class: 'muted' }, fmtDate(o.created_at)),
      o.status === 'pending' ? h('button', { type: 'button', class: 'ghost small', onclick: async () => { await api(`/api/orders/${o.code}/cancel`, { method: 'POST' }).catch(fail); showPlans(); } }, 'Huỷ') : null))) : null);
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

  const settings = h('div', { class: 'card' },
    h('label', {}, 'Tiêu đề', h('input', { value: spec.title, maxlength: 100, oninput: (e) => { spec.title = e.target.value; save(); } })),
    spec.format ? h('p', { class: 'muted' }, 'Dạng video: ', h('b', {}, FORMAT_LABELS[spec.format] || spec.format)) : null,
    h('div', { class: 'grid' },
      h('label', {}, 'Phong cách', h('select', { onchange: (e) => { spec.style = e.target.value; delete spec.tool; changed(); } }, options(styleOptions().concat(styleOptions().some(([k]) => k === spec.style) ? [] : [[spec.style, L('styles', spec.style)]]), spec.style))),
      h('label', {}, 'Dụng cụ vẽ', h('select', { onchange: (e) => { if (e.target.value) spec.tool = e.target.value; else delete spec.tool; changed(); } },
        options([['', 'Theo phong cách'], ...Object.entries(ui.labels.tools).map(([k, v]) => [k, v, 'tool:' + k])], spec.tool || ''))),
      h('label', {}, 'Khung hình', h('select', { onchange: (e) => { spec.ratio = e.target.value; changed(); } }, options(ratioOptions(false), spec.ratio))),
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
  const ITEM_NAMES = { text: 'Chữ', icon: 'Hình', person: 'Người que', chart: 'Biểu đồ' };
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
      await api(`/api/projects/${id}/render`, { method: 'POST' }); toast('Đã xếp video vào hàng chờ dựng.'); pollJobs();
      me = await api('/api/me').catch(() => me);
    }
    catch (e) { fail(e); }
    renderBtn.disabled = false;
  } }, T('render'));
  let pollTimer;
  async function pollJobs() {
    clearTimeout(pollTimer);
    if (!document.body.contains(jobsBox)) return;
    const { jobs, queueLength } = await api(`/api/projects/${id}/jobs`).catch(() => ({ jobs: [] }));
    jobsBox.replaceChildren(...(jobs.length ? jobs.map((j) => h('div', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: 'pill ' + j.status }, JOB_TEXT[j.status] || j.status), h('small', { class: 'muted' }, fmtDate(j.created_at))),
      j.status === 'queued' ? h('small', { class: 'muted' }, `Có ${queueLength} video đang chờ. Máy dựng khởi động trong khoảng 1 phút.`) : null,
      j.status === 'running' ? h('div', { class: 'bar' }, h('i', { style: `width:${j.progress}%` })) : null,
      j.status === 'failed' ? h('p', { class: 'error' }, j.error || 'Dựng thất bại.') : null,
      j.status === 'done' ? h('div', { class: 'row' }, h('a', { href: `/api/jobs/${j.id}/video`, download: true, 'data-ev': 'download' }, T('download')),
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
      NV.renderFrame(c.getContext('2d'), m, Math.max(0.5, m.timeline.scenes[0].end - 0.45), { hand: false });
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

  const preview = h('div', { class: 'preview' + (spec.ratio === '16:9' ? ' landscape' : '') },
    canvas,
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
async function previewModel(spec, dpr) {
  const [images, hand, icons] = await Promise.all([
    Promise.all(spec.scenes.map((sc) => Promise.all(sc.panels.map((p) => (imageUrl(p.image) ? loadImg(imageUrl(p.image)).catch(blankCanvas) : Promise.resolve(blankCanvas())))))),
    getHand(), getIcons(), document.fonts.load('29px Pangolin').catch(() => {}),
  ]);
  const timeline = NV.buildTimeline(spec.scenes, spec.scenes.map((s) => NV.estimateVoice(s.lines)));
  const env = { createCanvas: (w, hgt) => { const c = document.createElement('canvas'); c.width = w; c.height = hgt; return c; } };
  return NV.prepare({ env, project: spec, timeline, images, hand, dpr, icons });
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
