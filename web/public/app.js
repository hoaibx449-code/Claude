// Safe when loaded by both the current shell and a cached older shell.
(() => {
 if (window.__nvNavigationReady) return;
 window.__nvNavigationReady = true;
// One URL format for links, browser history, and legacy bookmarks.
'use strict';
function cleanRoute(value) {
  return String(value || '/').replace(/^\/?#\//, '/');
}
function currentRoute() {
  return location.hash.startsWith('#/') ? location.hash : '#' + location.pathname + location.search;
}
function normalizeLegacyRoute() {
  if (location.hash.startsWith('#/')) history.replaceState(history.state, '', cleanRoute(location.hash));
}
function navigate(value) {
  const target = new URL(cleanRoute(value), location.origin);
  if (target.origin !== location.origin) return;
  if (/^\/(tai-nguyen)(\/|$)/.test(target.pathname)) {
    location.assign(target.href); return;
  }
  if (target.pathname + target.search === location.pathname + location.search && !location.hash) return;
  history.pushState(null, '', target.pathname + target.search + target.hash);
  window.dispatchEvent(new Event('hashchange'));
}
normalizeLegacyRoute();
window.addEventListener('hashchange', normalizeLegacyRoute);
window.addEventListener('popstate', () => window.dispatchEvent(new Event('hashchange')));
function normalizeLinks(node) {
  const links = [...(node.matches?.('a[href]') ? [node] : []), ...(node.querySelectorAll?.('a[href]') || [])];
  for (const a of links) {
    const href = a.getAttribute('href');
    if (/^\/?#\//.test(href)) a.setAttribute('href', cleanRoute(href));
  }
}
normalizeLinks(document);
new MutationObserver(records => {
  for (const r of records) {
    if (r.type === 'attributes') normalizeLinks(r.target);
    else r.addedNodes.forEach(normalizeLinks);
  }
}).observe(document.documentElement, {childList:true, subtree:true, attributes:true, attributeFilter:['href']});
document.addEventListener('click', e => {
  const a = e.target.closest?.('a[href]');
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.download || (a.target && a.target !== '_self')) return;
  const u = new URL(a.href, location.href);
  if (u.pathname === '/tai-khoan' && document.getElementById('account') && !document.getElementById('account').hidden) return;
  if (u.origin !== location.origin || /^\/(api|assets|tai-nguyen)(\/|$)/.test(u.pathname) || /\.[a-z0-9]+$/i.test(u.pathname) || (u.hash && !u.hash.startsWith('#/'))) return;
  e.preventDefault(); navigate(u.pathname + u.search + u.hash);
});

function updateRouteMetadata(brand) {
 if (/^\/(kham-pha|giai-phap)(\/|$)/.test(location.pathname)) return;
 const data=JSON.parse(document.getElementById('route-metadata')?.textContent||'{}');
 const item=data.pages?.[location.pathname];
 document.title=(item?.[0]||'Khu vực cá nhân')+' | '+(brand||data.brand||'FACIUP Studio');
 const set=(selector,value)=>document.querySelector(selector)?.setAttribute('content',value);
 if(item){set('meta[name="description"]',item[1]);set('meta[property="og:description"]',item[1]);}
 set('meta[property="og:title"]',document.title);
 set('meta[property="og:url"]',location.origin+location.pathname);
 set('meta[name="robots"]',(!item||location.search?'noindex,follow':'index,follow'));
 document.querySelector('link[rel="canonical"]')?.setAttribute('href',location.origin+location.pathname);
}
window.addEventListener('hashchange',()=>updateRouteMetadata());

 Object.assign(window, {cleanRoute,currentRoute,navigate,updateRouteMetadata});
})();

function paintFrame(ctx,model,t,opts){return model.illustratedAddon?FVIllustrated.renderFrame(ctx,model,t,opts):model.whiteboardAddon?FVWhiteboard.renderFrame(ctx,model,t,opts):NV.renderFrame(ctx,model,t,opts);}
// Nét Vẽ Studio — browser app. All user text is inserted with textContent, never as HTML.
'use strict';

// Every name shown here comes from the admin settings (/api/me → ui); see web/src/settings.ts.
let ui = { brand: {}, labels: { styles: {}, tools: {}, kinds: {}, visual: {}, actions: {}, ai: {}, sources: {} }, texts: {}, enabledStyles: [], enabledSources: [], defaults: {}, voices: [], visibility: {}, templates: [], plans: [], zalo: {}, payment: {} };
const T = (k) => ui.texts?.[k] ?? k;
const L = (group, k) => ui.labels?.[group]?.[k] ?? k;
/** Visibility the admin chose for an option: on · dev (greyed, "đang phát triển") · hidden. */
// options still being built are shown only to admins (as 'dev'); everyone else simply does not see them
const V = (key) => { const v = ui.visibility?.[key] || 'on'; return v === 'dev' && !isAdminUser() ? 'hidden' : v; };
const isAdminUser = () => !!(typeof me !== 'undefined' && me?.admin);
const DEV = ' · chỉ quản trị thấy';
const view = document.getElementById('view');
/** Replace the page content; null/false entries (optional sections) are skipped. */
let routingTimer = 0;
const routing = (on) => { clearTimeout(routingTimer); document.body.classList.toggle('routing', on); if (on) routingTimer = setTimeout(() => routing(false), 8000); };
const show = (...nodes) => { routing(false); view.replaceChildren(...nodes.flat().filter((n) => n != null && n !== false)); view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); };
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
    if (k === 'href' && /^\/?#\//.test(v)) { el.setAttribute(k, cleanRoute(v)); continue; }
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'style') el.style.cssText = v; // CSSOM: allowed by the CSP, unlike style attributes
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
// line icons (Tabler-style) for the redesigned pages
const ICONS = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/>',
  library: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M8 14h3M8 17h6"/><circle cx="15.5" cy="14" r="1.2"/>',
  pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  spark: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-.5 9.5z"/><path d="M12 11v6M9.5 14.5L12 17l2.5-2.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16.5 14.6c2.6.1 4.4 1.8 5 4.4"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  share: '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>', download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19h14"/>',
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>', mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>', crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>', team: '<circle cx="12" cy="7" r="3"/><circle cx="5" cy="10" r="2.2"/><circle cx="19" cy="10" r="2.2"/><path d="M6.5 20c.5-3.5 2.7-5.5 5.5-5.5s5 2 5.5 5.5"/><path d="M1.5 18.5c.3-2.2 1.6-3.5 3.5-3.6M22.5 18.5c-.3-2.2-1.6-3.5-3.5-3.6"/>',
};
function icon(name, cls = 'ic') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', cls); svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${ICONS[name] || ''}</svg>`, 'image/svg+xml');
  for (const n of [...doc.documentElement.childNodes]) svg.append(document.importNode(n, true));
  return svg;
}

function helpHint(title, description) {
  return h('button', { type: 'button', class: 'help-hint', 'aria-label': 'Giải thích: ' + title, onclick: (e) => {
    e.preventDefault(); e.stopPropagation();
    const trigger = e.currentTarget;
    const dialog = h('dialog', { class: 'help-dialog', 'aria-labelledby': 'help-dialog-title' },
      h('div', { class: 'help-heading' }, h('h2', { id: 'help-dialog-title' }, title), h('button', { type: 'button', class: 'ghost small', 'aria-label': 'Đóng giải thích', onclick: () => dialog.close() }, '×')),
      h('p', { class: 'description' }, description));
    dialog.addEventListener('close', () => { dialog.remove(); trigger.focus(); }, { once: true });
    dialog.addEventListener('click', (event) => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
    document.body.append(dialog); dialog.showModal();
  } }, '?');
}

/** <option>s from [value, label, visibilityKey?]: hidden ones are left out, "dev" ones are greyed out. */
function options(list, selected) {
  return list.filter(([, , vk]) => !vk || V(vk) !== 'hidden')
    .map(([v, label, vk]) => h('option', { value: v, selected: v === selected, disabled: vk && V(vk) === 'dev' }, label + (vk && V(vk) === 'dev' ? DEV : '')));
}
// the logo: an uploaded picture, or a drawn icon on a background; the same mark goes in the browser tab
const LOGO_ICONS = { pen: '<path d="M15.5 4.5l4 4L9 19H5v-4z"/><path d="M13 7l4 4"/>', robot: '<rect x="5" y="8" width="14" height="11" rx="4"/><path d="M12 4v4"/><circle cx="12" cy="3.5" r="1.2"/><path d="M9.5 13h.01M14.5 13h.01"/>',
  spark: '<path d="M12 3l2.2 6.3L20.5 12l-6.3 2.2L12 20.5l-2.2-6.3L3.5 12l6.3-2.7z"/>', play: '<path d="M8 5.5v13l11-6.5z"/>', brush: '<path d="M18 3l3 3-9 9-3-3z"/><path d="M9 12c-3 0-5 2-5 5 0 1.5-1 2.5-2 3 4 1 9 0 9-5"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>' };
const LOGO_BG = { brand: 'linear-gradient(135deg,#7c3aed,#c026d3 45%,#ff2d75 70%,#ff7a00)', sunset: 'linear-gradient(135deg,#ff7a00,#ff2d75)', ocean: 'linear-gradient(135deg,#06b6d4,#2563eb)', forest: 'linear-gradient(135deg,#22c55e,#0d9488)', night: 'linear-gradient(135deg,#1e1b4b,#7c3aed)' };
const LOGO_FILL = { brand: ['#7c3aed', '#ff7a00'], sunset: ['#ff7a00', '#ff2d75'], ocean: ['#06b6d4', '#2563eb'], forest: ['#22c55e', '#0d9488'], night: ['#1e1b4b', '#7c3aed'] };
function paintLogo(el, logo, brand) {
  logo ||= { icon: 'pen', bg: 'brand' }; el.replaceChildren(); el.classList.toggle('has-image', !!logo.image);
  if (logo.image) { el.style.background = 'none'; el.append(h('img', { src: siteUrl(logo.image), alt: '' })); return; }
  el.style.background = LOGO_BG[logo.bg] || logo.bg || LOGO_BG.brand;
  if (logo.icon === 'letter') { el.append(h('b', { class: 'logo-letter' }, (brand || 'F').trim().charAt(0).toUpperCase())); return; }
  el.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LOGO_ICONS[logo.icon] || LOGO_ICONS.pen}</svg>`);
}
function logoFavicon(logo, brand) {
  let link = document.querySelector('link[rel="icon"]'); if (!link) { link = h('link', { rel: 'icon' }); document.head.append(link); }
  if (!logo) return; if (logo.image) { link.href = siteUrl(logo.image); return; }
  const [a, b] = LOGO_FILL[logo.bg] || [logo.bg || '#7c3aed', logo.bg || '#ff7a00'];
  const mark = logo.icon === 'letter' ? `<text x="12" y="16.5" text-anchor="middle" font-family="Arial" font-weight="800" font-size="12" fill="#fff">${(brand || 'F').trim().charAt(0).toUpperCase().replace(/[<&]/g, '')}</text>` : `<g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LOGO_ICONS[logo.icon] || LOGO_ICONS.pen}</g>`;
  link.href = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#g)"/><g transform="translate(3 3) scale(.75)">${mark}</g></svg>`);
}
// one list decides which pages the menus show, everywhere: header, side bar, phone tab bar and footer
const menuShows = (route) => !(ui.site?.menu?.hidden || []).includes(route) && !(route === 'goi' && V('feature:plans') !== 'on') && !(route === 'cong-dong' && V('feature:community') === 'hidden');
// where "my videos" links go when that page is switched off
const myVideos = () => (menuShows('video') ? '#/video' : '#/');
function applyMenu() {
  for (const a of document.querySelectorAll('[data-route]')) { const r = a.dataset.route; if (r === 'admin' || r === 'tai-khoan') continue; a.hidden = !menuShows(r); }
  // the phone tab bar has little room: short names there
  const SHORT = { home: 'Trang chủ', 'cong-dong': 'Cộng đồng', 'faciup-live': 'Live', tao: 'Tạo', video: 'Video', 'kham-pha': 'Khám phá', 'prompt-hunter': 'Prompt' };
  for (const a of document.querySelectorAll('#tabbar a[data-route]')) { const name = SHORT[a.dataset.route]; if (!name) continue; [...a.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).forEach((n) => n.remove()); let l = a.querySelector('.nav-label'); if (!l) { l = h('span', { class: 'nav-label' }); a.append(l); } l.textContent = name; }
  const order = ui.site?.menu?.order || []; if (!order.length) return;
  for (const nav of document.querySelectorAll('#nav, .sidenav:not(.bottom)')) {
    const links = [...nav.querySelectorAll(':scope > a[data-route]')], rank = (a) => { const i = order.indexOf(a.dataset.route); return a.dataset.route === 'admin' ? 1e4 : i >= 0 ? i : 1e3 + links.indexOf(a); };
    links.sort((x, y) => rank(x) - rank(y)).forEach((a) => nav.append(a));
  }
}
function applyUI(next) {
  if (!next) return;
  ui = next;
  for(const a of document.querySelectorAll('[data-route]')) {
    const name=ui.labels?.navigation?.[a.dataset.route];if(!name)continue;
    for(const n of [...a.childNodes])if(n.nodeType===Node.TEXT_NODE)n.remove();
    let label=a.querySelector('.nav-label');if(!label){label=h('span',{class:'nav-label'});a.append(label);}label.textContent=name;
  }
  document.getElementById('brandName').textContent = ui.brand.name;
  document.getElementById('brandAccent').textContent = ui.brand.accent || '';
  document.getElementById('sideBrand').textContent = ui.brand.name;
  document.getElementById('sideAccent').textContent = ui.brand.accent || '';
  updateRouteMetadata([ui.brand.name, ui.brand.accent].filter(Boolean).join(' '));
  document.getElementById('logout').textContent = T('logout');
  document.getElementById('adminLink').textContent = T('admin');
  applyMenu();
  for (const el of document.querySelectorAll('.brand .logo')) paintLogo(el, ui.site?.logo, ui.brand.name);
  logoFavicon(ui.site?.logo, ui.brand.name);
  document.documentElement.dataset.theme = ui.site?.theme || 'aurora';
  const loading=document.getElementById('loadingText');if(loading)loading.textContent=ui.site?.loadingText||'Đang mở xưởng vẽ…';
  window.nvHelpChat?.();
  for(const bb of document.querySelectorAll('[data-beta]')){bb.hidden=!ui.beta;bb.textContent=ui.beta?.label||'Beta';bb.title=ui.beta?.note||'Phiên bản thử nghiệm';}
}
const styleOptions = () => Object.keys(ui.labels.styles).map((k) => [k, L('styles', k), 'style:' + k]).filter(([k]) => ui.enabledStyles.includes(k) || V('style:' + k) === 'dev');
const voiceOptions = () => ui.voices.map((v) => [v.code, v.label, 'voice:' + v.code]);
const previewUrl = (code) => '/api/voices/preview?code=' + encodeURIComponent(code);
/** A voice dropdown with a ▶ on every voice and a "listen" button for the chosen one. */
function voiceField(select,state={}) {
  const current=()=>state.get?.()||{speed:1,audio:{voice:'tts'}};
  const label=h('span'),button=h('button',{type:'button',class:'voice-setup-trigger','aria-label':'Thiết lập giọng đọc',onclick:async()=>{
    const {openVoicePicker}=await import('/voice-picker.js');
    openVoicePicker({h,voices:ui.voices,value:select.value,...current(),apply:r=>{select.value=r.value;state.apply?.(r);select.dispatchEvent(new Event('change'));paint();}});
  }},label,h('span',{'aria-hidden':'true'},'⌄'));
  function paint(){const a=current().audio;label.textContent=a?.voice==='none'?'Không lời':a?.voice==='upload'?'Giọng của tôi':ui.voices.find(v=>v.code===select.value)?.label||'Chọn giọng đọc';}
  select.addEventListener('change',paint);paint();return button;

}
const MOODS = [['', 'Theo nội dung'], ['warm', 'Ấm áp'], ['curious', 'Tò mò'], ['calm', 'Nhẹ nhàng'], ['upbeat', 'Sôi động'], ['none', 'Không nhạc']];
/** Sound layers of a video: where the narration comes from, music mood, levels of music and effects. */
function audioBox(spec, save) {
  if(ui.rendering?.mode==='browser')return null;
  const a=(spec.audio||={voice:'tts'});
  const level=(key,label,def)=>h('label',{class:'slider'},label,h('input',{type:'range',min:0,max:1.5,step:.05,value:a[key]??def,'aria-label':label,oninput:e=>{a[key]=Number(e.target.value);save();}}));
  return h('div',{class:'card flat audio'},h('h4',{},'Nhạc và hiệu ứng'),h('div',{class:'grid wide-2'},
    h('label',{},'Nhạc nền',h('select',{onchange:e=>{a.mood=e.target.value||undefined;save();}},options(MOODS,a.mood||''))),level('musicVolume','Âm lượng nhạc',.2),level('sfxVolume','Âm lượng hiệu ứng',1)));
}
const ratioOptions = (long) => [['9:16', long ? 'Dọc 9:16 (TikTok, Shorts, Reels)' : 'Dọc 9:16', 'ratio:9:16'], ['16:9', long ? 'Ngang 16:9 (YouTube)' : 'Ngang 16:9', 'ratio:16:9']];

// ---------- visitor id + activity tracking (what was clicked, viewed, broke)
const VID = (() => { try { let v = localStorage.getItem('nv_vid'); if (!v) { v = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('nv_vid', v); } return v; } catch { return ''; } })();
const queue = [];
let flushTimer = null, viewStart = Date.now(), currentView = '';
function track(type, data, extra = {}) {
  queue.push({ type: 'ui.' + type, ts: Date.now(), path: currentRoute() || '#/', data, ...extra });
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
const imageUrl = (ref) => (ref?.startsWith('r2:') ? '/api/assets/' + ref.slice(3) : ref?.startsWith('doodle:') ? '/assets/doodles/' + ref.slice(7) + '.svg' : '');
// an empty page stands in for a picture that has not been drawn yet
const BLANK = '/blank.svg';
const fmtDate = (ms) => new Date(ms).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
const money = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const JOB_TEXT = { queued: 'Đang chờ', running: 'Đang dựng', done: 'Xong', failed: 'Lỗi' };
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

// ---------- boot & routing
let cfg = null; // sign-in config + public settings, also for guests
async function boot() {
  const top=document.querySelector('header.top');
  if(top){const measure=()=>document.documentElement.style.setProperty('--shell-header-height',Math.ceil(top.getBoundingClientRect().height)+'px');measure();new ResizeObserver(measure).observe(top);}

  document.getElementById('logout').addEventListener('click', async () => {
    track('click', { what: 'logout' }); flush();
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    navigate('#/'); location.reload();
  });
  document.getElementById('loginBtn').addEventListener('click', () => openLogin('header'));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  // paint at once from what this browser saw last time, then refresh in the background
  let cached = null;
  try { cached = JSON.parse(store.get('nv_boot') || 'null'); } catch {}
  const fresh = Promise.all([api('/api/auth/config').catch(() => null), api('/api/me').catch((e) => (e.status === 401 ? null : undefined))]);
  // a page that needs an account waits for the real answer (no login sheet flashing at a signed-in user)
  if (cached?.cfg && (cached.me || PUBLIC[currentRoute().split('?')[0]])) {
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
    if (JSON.stringify([cfg?.ui, me?.user?.id, me?.ui, me?.plan, me?.admin]) !== was && !currentRoute().startsWith('#/p/')) { if (me) document.querySelector('.sheet-bg')?.remove(); route(); }
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
  acc.hidden = !me;
  if (me) acc.textContent = (me.user.name || me.user.email || '?').trim().charAt(0).toUpperCase();
  document.getElementById('bellBtn').hidden = !me;
  if (me) loadNotes();
  // a page switched off in Menu & trang is off everywhere: its address leads home (admins can still open it)
  const pageKey = (location.hash.startsWith('#/') ? location.hash.slice(2) : location.pathname.slice(1)).split(/[/?#]/)[0];
  if (pageKey && !me?.admin && ui?.site && ['tao', 'mau', 'cong-dong', 'kham-pha', 'faciup-live', 'prompt-hunter', 'video', 'goi', 'tro-giup'].includes(pageKey) && !menuShows(pageKey)) { routing(false); navigate('#/'); return; }
  document.getElementById('sideAdmin').hidden = !me?.admin;
  closeMenu();
}
// everything about the account lives in one menu behind the avatar
// the bell: recent things that happened to this person; a dot while something new is unread
let notes = [], notesAt = 0;
const NOTE_ICON = { video: '🎬', failed: '⚠️', paid: '💳', community: '🌟', hidden: '🙈', review: '🧠' };
const notesSeen = () => Number(store.get('nv_notes_seen') || 0);
async function loadNotes(force) {
  if (!me || (!force && Date.now() - notesAt < 60000)) return notes;
  try { notes = (await api('/api/notifications')).notes || []; notesAt = Date.now(); } catch {}
  const dot = document.getElementById('bellDot'); if (dot) dot.hidden = !notes.some((n) => n.at > notesSeen());
  return notes;
}
function renderNotes() {
  const m = document.getElementById('noteMenu'); if (!m) return; const seen = notesSeen();
  const ago = (t) => { const s = Math.max(1, Math.round((Date.now() - t) / 1000)); return s < 3600 ? Math.max(1, Math.round(s / 60)) + ' phút trước' : s < 86400 ? Math.round(s / 3600) + ' giờ trước' : Math.round(s / 86400) + ' ngày trước'; };
  m.replaceChildren(h('div', { class: 'nhead' }, h('b', {}, 'Thông báo'), notes.length ? h('button', { type: 'button', class: 'nread', onclick: () => { store.set('nv_notes_seen', String(Date.now())); document.getElementById('bellDot').hidden = true; renderNotes(); } }, 'Đánh dấu đã đọc') : null),
    notes.length ? h('ul', { class: 'nlist' }, notes.map((n) => h('li', { class: n.at > seen ? 'new' : '' }, h('a', { href: n.href, onclick: (e) => { e.preventDefault(); hideNotes(); navigate('#' + n.href); } },
      h('span', { class: 'nic k-' + n.kind, 'aria-hidden': 'true' }, NOTE_ICON[n.kind] || '•'), h('span', { class: 'ntext' }, h('b', {}, n.title), h('span', {}, n.text), h('small', {}, ago(n.at))))))) : h('p', { class: 'nempty' }, 'Chưa có thông báo nào. Khi video dựng xong hay thanh toán thành công, bạn sẽ thấy ở đây.'));
}
function hideNotes() { const m = document.getElementById('noteMenu'); if (m) m.hidden = true; document.getElementById('bellBtn')?.setAttribute('aria-expanded', 'false'); }
async function toggleNotes() {
  const m = document.getElementById('noteMenu'); if (!m) return; if (!m.hidden) return hideNotes();
  hideMenu(); renderNotes(); m.hidden = false; document.getElementById('bellBtn').setAttribute('aria-expanded', 'true');
  await loadNotes(true); if (!m.hidden) renderNotes();
}
let menuWanted = false, menuCredits = '';
function closeMenu() { const m = document.getElementById('userMenu'); if (m) m.hidden = true; document.getElementById('account')?.setAttribute('aria-expanded', 'false'); }
function hideMenu() { menuWanted = false; closeMenu(); }
const MI = { user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', video: '<rect x="3" y="5" width="14" height="14" rx="3"/><path d="M17 10l4-2v8l-4-2"/>', plan: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>', admin: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/>', out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>' };
const mIcon = (k) => { const i = h('i', { class: 'mi', 'aria-hidden': 'true' }); i.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${MI[k]}</svg>`; return i; };
// the avatar opens a small menu at once from what is already known; fresh numbers fill in behind it
function renderMenu() {
  const m = document.getElementById('userMenu'); if (!m || !me) return;
  const l = me.limits || {}, u = me.used || {}, meter = (label, k) => { const total = l[k] || 0, left = Math.max(0, total - (u[k] || 0)), bar = h('span', { class: 'mbar' }, h('b', {}));
    bar.firstChild.style.width = (total ? left / total * 100 : 0) + '%'; return h('div', { class: 'mmeter' }, h('span', {}, label), h('b', {}, total ? `${left}/${total}` : '—'), bar); };
  const go = (href) => (e) => { e.preventDefault(); hideMenu(); navigate(href); };
  const item = (icon, label, opts) => h(opts.href ? 'a' : 'button', { class: 'mitem', role: 'menuitem', ...(opts.href ? { href: opts.href.replace('#', ''), onclick: go(opts.href) } : { type: 'button', onclick: () => { hideMenu(); opts.do(); } }) }, mIcon(icon), h('span', {}, label));
  const name = me.user.name || me.user.email.split('@')[0];
  m.replaceChildren(
    h('div', { class: 'mhead' }, h('span', { class: 'avatar big' }, name.charAt(0).toUpperCase()), h('div', {}, h('b', {}, name), h('span', {}, me.user.email)), h('em', { class: 'mplan' }, me.plan?.name || 'Miễn phí')),
    h('div', { class: 'musage' }, meter('Lượt dựng hôm nay', 'render'), meter('Lượt AI viết', 'script'), h('p', { class: 'mcredit' }, menuCredits || 'Đang xem số dư…')),
    h('nav', { class: 'mlist' }, item('user', 'Tài khoản & cài đặt', { do: showAccount }), menuShows('video') ? item('video', 'Video của tôi', { href: '#/video' }) : null,
      V('feature:plans') === 'on' ? item('plan', 'Gói cước & credit', { href: '#/goi' }) : null, me.admin ? item('admin', 'Quản trị', { href: '#/admin' }) : null,
      item('out', 'Đăng xuất', { do: () => document.getElementById('logout').click() })));
}
function openMenu() {
  if (!me) return; const m = document.getElementById('userMenu'), acc = document.getElementById('account');
  hideNotes(); menuWanted = true; renderMenu(); m.hidden = false; acc.setAttribute('aria-expanded', 'true'); m.querySelector('.mitem')?.focus({ preventScroll: true });
  const reopen = () => { if (!menuWanted) return; renderMenu(); m.hidden = false; acc.setAttribute('aria-expanded', 'true'); };
  refreshMemberState().then(reopen, () => {});
  api('/api/credits').then((c) => { menuCredits = (c.monthlyLeft ? c.monthlyLeft + ' video trong gói tháng này · ' : '') + c.balance + ' credit'; reopen(); }, () => {});
}

document.addEventListener('click', (e) => {
  if(e.target.closest('a[href="/tai-khoan"]') && me){e.preventDefault();hideMenu();showAccount();return;}
  const acc = document.getElementById('account'), m = document.getElementById('userMenu');
  if (e.target.closest('#bellBtn')) { toggleNotes(); return; }
  const nm = document.getElementById('noteMenu'); if (nm && !nm.hidden && !e.target.closest('#noteMenu')) hideNotes();
  if (acc && e.target.closest('#account')) { m.hidden ? openMenu() : hideMenu(); return; }
  if (m && !m.hidden && !e.target.closest('#userMenu')) hideMenu();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { hideMenu(); hideNotes(); } });
// one search box for the whole site: community videos, formats, or the user's own videos
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'topSearch') return;
  e.preventDefault();
  const q = document.getElementById('topSearchInput').value.trim(), page = document.body.dataset.page;
  if(page==='kham-pha'){navigate('/kham-pha'+(q?'?q='+encodeURIComponent(q):''));return;}
  const where = page === 'prompt-hunter' || page === 'video' || page === 'mau' || page === 'cong-dong' ? page : V('feature:community') === 'on' ? 'cong-dong' : 'mau';
  navigate(`#/${where}${q ? '?q=' + encodeURIComponent(q) : ''}`);
});
const searchTerm = () => fold(new URLSearchParams(currentRoute().split('?')[1] || '').get('q') || '');
function fold(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim(); }
const matches = (q, ...texts) => !q || texts.some((t) => fold(t).includes(q));

async function showHelp() {
  viewed('help');
  const qa = [
    ['Tạo video đầu tiên thế nào?', 'Bấm "Tạo video", dán kịch bản hoặc gõ chủ đề, chọn định dạng rồi bấm Tạo. Xem trước ngay trên trang, sửa từng cảnh, rồi bấm Xuất video.'],
    ['Video mất bao lâu?', 'Thường vài phút cho video dưới một phút. Trang Video của tôi hiện tiến độ; có thể bật thông báo khi video xong.'],
    ['Giọng đọc lỗi hoặc khác giọng đã chọn?', 'Khi dịch vụ giọng đang lỗi, video được đọc bằng giọng miễn phí cùng giới tính để không bị hỏng. Quản trị viên xem lý do ở trang Giọng đọc.'],
    ['Tạo video qua Zalo?', ui.zalo?.enabled ? 'Nhắn yêu cầu tư vấn qua Zalo. Bạn cũng có thể gửi KB + kịch bản để dựng và TT để xem tiến độ.' : 'Tính năng Zalo chưa mở.'],
    ['Huỷ gói, hoàn tiền?', 'Xem Chính sách hoàn tiền ở cuối trang.'],
  ];
  show(h('header', { class: 'pagehead' }, h('div', {}, h('h1', {}, 'Trợ giúp'), h('p', { class: 'muted' }, 'Câu hỏi thường gặp và cách liên hệ.'))),
    h('div', { class: 'faq' }, qa.map(([q, a]) => h('details', {}, h('summary', {}, q), h('p', {}, a)))),
    h('div', { class: 'row' }, ui.zalo?.enabled && ui.zalo.botLink ? h('a', { class: 'btn', href: ui.zalo.botLink, target: '_blank', rel: 'noopener' }, 'Tư vấn qua Zalo') : null,
      ui.legal?.email && !/example\.(com|org)$/i.test(ui.legal.email) ? h('a', { class: 'btn ghost', href: 'mailto:' + ui.legal.email }, 'Gửi email hỗ trợ') : null),
    footer());
}

function markNav(name) {
  for (const a of document.querySelectorAll('[data-route]')) a.classList.toggle('on', a.dataset.route === name);
}
const PUBLIC = { '#/faciup-live':1, '#/prompt-hunter':1, '#/tro-giup': 1, '': 1, '#/': 1, '#/mau': 1, '#/goi': 1, '#/tao': 1, '#/thu': 1, '#/dieu-khoan': 1, '#/bao-mat': 1, '#/hoan-tien': 1, '#/cong-dong': 1, '#/dang-nhap-loi': 1 };
let stopHomeGallery = null,stopVideoLibrary=null,stopLive=null;
let solutionNavigation = 0;
async function showSolutionPage() {
 const ticket=++solutionNavigation, key=location.pathname+location.search;
 markNav('kham-pha');document.body.dataset.page='kham-pha';document.body.classList.add('solutions-site');view.classList.add('solutions-main');
 const accessUser=me?.user?.id||'';if(view.dataset.solutionAccessUser!==undefined&&view.dataset.solutionAccessUser!==accessUser)delete view.dataset.solutionPath;view.dataset.solutionAccessUser=accessUser;
 if(view.dataset.solutionPath===key&&!(me&&view.querySelector('[data-solution-locked]')&&view.dataset.solutionCheckedUser!==accessUser)){routing(false);if(!view.querySelector('footer'))view.append(footer());return;}
 delete view.dataset.solutionPath;show(skeleton(3));
 try{
  const endpoint=me&&/^\/giai-phap\//.test(location.pathname)?'/api/solution-view/'+location.pathname.split('/')[2]:key;
  const res=await fetch(endpoint,{credentials:'same-origin',cache:'no-store',headers:{accept:'text/html','x-nv':'1'}});
  if(!res.ok)throw new Error('Không tải được giải pháp. Vui lòng thử lại.');
  const doc=new DOMParser().parseFromString(await res.text(),'text/html');
  if(ticket!==solutionNavigation||location.pathname+location.search!==key)return;
  const content=doc.querySelector('main.solutions-main');if(!content)throw new Error('Nội dung giải pháp chưa sẵn sàng.');
  show(...Array.from(content.childNodes),footer());view.dataset.solutionPath=key;view.dataset.solutionCheckedUser=accessUser;document.title=doc.title;
  for(const selector of ['meta[name="description"]','meta[name="robots"]','meta[property="og:title"]','meta[property="og:description"]','meta[property="og:url"]','link[rel="canonical"]']){
   const incoming=doc.querySelector(selector);if(!incoming)continue;const old=document.querySelector(selector);if(old)old.replaceWith(document.importNode(incoming,true));else document.head.append(document.importNode(incoming,true));
  }
  document.querySelectorAll('script[data-solution-schema]').forEach(n=>n.remove());
  doc.querySelectorAll('script[type="application/ld+json"]').forEach(n=>{const schema=document.createElement('script');schema.type='application/ld+json';schema.dataset.solutionSchema='';schema.textContent=n.textContent;document.head.append(schema);});
 }catch(e){if(ticket===solutionNavigation)fatal(e);}
}
document.addEventListener('click',async e=>{
 const button=e.target.closest?.('[data-buy-solution]');if(!button)return;
 if(!me)return openLogin('route',{hash:currentRoute()});
 await busy(button,'Đang tạo đơn…',async()=>{try{const {order}=await api('/api/orders',{method:'POST',body:{plan:'solution:'+button.dataset.buySolution}});payModal(order,{id:order.plan,name:button.dataset.solutionTitle,solutionUrl:location.pathname});}catch(err){if(err.status===409){delete view.dataset.solutionPath;showSolutionPage();}else fail(err);}});
});
document.addEventListener('submit',e=>{const form=e.target.closest?.('form.catalog-search');if(!form)return;e.preventDefault();const q=new URLSearchParams(new FormData(form));navigate(form.getAttribute('action')+'?'+q.toString());});
document.addEventListener('click',async e=>{const b=e.target.closest?.('[data-copy-resource]');if(!b)return;const code=b.closest('.resource-code')?.querySelector('code');if(!code)return;try{await navigator.clipboard.writeText(code.textContent);b.textContent='Đã sao chép';}catch{toast('Hãy chọn nội dung để sao chép.');}});
function route() {
  if (view.firstElementChild) routing(true);
  if (me) loadNotes();
  stopLive?.();stopLive=null;
  stopHomeGallery?.(); stopHomeGallery = null;stopVideoLibrary?.();stopVideoLibrary=null;
  stopPreview(); stopDemos();
  // a window left open (payment, player, sign-in) never follows the user to another page
  document.querySelectorAll('.sheet-bg').forEach((x) => x.remove());
  if(/^\/(kham-pha|giai-phap)(\/|$)/.test(location.pathname)){scrollTo(0,0);showSolutionPage();return;}
  ++solutionNavigation;delete view.dataset.solutionPath;document.body.classList.remove('solutions-site');view.classList.remove('solutions-main');
  document.querySelectorAll('script[data-solution-schema]').forEach(n=>n.remove());
  const hash = currentRoute().split('?')[0];
  const m = hash.match(/^#\/p\/([a-f0-9]{24})$/), w = hash.match(/^#\/xem\/([a-f0-9]{24})\/([a-f0-9]{24})$/);
  markNav(hash === '#/' || hash === '' ? 'home' : w ? 'video' : m ? 'tao' : hash.startsWith('#/admin') ? 'admin' : hash.slice(2));
  // app pages have the side bar (desktop); the home page keeps the wide top bar
  document.body.dataset.page = hash === '#/' || hash === '' ? 'home' : m ? 'editor' : hash.slice(2).split('/')[0];
  const q = new URLSearchParams(currentRoute().split('?')[1] || '').get('q') || '';
  const si = document.getElementById('topSearchInput'); if (si && document.activeElement !== si) si.value = q;
  if (hash === '#/dang-nhap-loi') { toast(new URLSearchParams(currentRoute().split('?')[1] || '').get('m') || 'Đăng nhập chưa thành công.'); history.replaceState(null, '', '/'); }
  scrollTo(0, 0);
  if (!me && !PUBLIC[hash] && !m) { showLanding().catch(fatal); return openLogin('route', { hash }); }
  if (!me && (m || w)) { showLanding().catch(fatal); return openLogin('route', { hash }); }
  const go = m ? showEditor(m[1])
    : w ? showWatch(w[1], w[2])
    : hash === '#/faciup-live' ? showFaciupLive()
    : hash === '#/prompt-hunter' ? showPromptHunter()
    : hash === '#/cong-dong' ? showCommunity()
    : hash.startsWith('#/admin') && me?.admin ? showAdmin()
    : hash === '#/goi' ? showPlans()
    : hash === '#/zalo' ? showZalo()
    : hash === '#/mau' ? showStyles()
    : hash === '#/tao' ? showCreate()
    : hash === '#/thu' ? showTry()
    : hash === '#/video' ? showVideos()
    : hash === '#/tai-khoan' ? showLanding().then(()=>showAccount())
    : hash === '#/dieu-khoan' ? showLegal('terms')
    : hash === '#/bao-mat' ? showLegal('privacy')
    : hash === '#/hoan-tien' ? showLegal('refund')
    : hash === '#/tro-giup' ? showHelp()
    : showLanding();
  go.catch(fatal);
}
function fatal(e) {
  routing(false);
  track('error', { msg: String(e.message || e).slice(0, 200), fatal: true });
  show(h('div', { class: 'card' }, h('p', { class: 'error' }, e.message || String(e)), h('a', { href: '#/' }, 'Về trang chủ')));
}
function resume(after) {
  if (after.hash) { navigate(after.hash); return; }
  if (after.create) { navigate('#/tao'); setTimeout(() => createProject(after.create), 300); }
}
const SOCIAL = {
  facebook: ['Facebook', '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>'],
  youtube: ['YouTube', '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10 9.5l5 2.5-5 2.5z"/>'],
  tiktok: ['TikTok', '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 2.6 2.2 4.2 5 4.5"/>'],
  instagram: ['Instagram', '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>'],
  zalo: ['Zalo', '<path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 8.5h4l-4 5h4M15 8.5v5"/>'],
  threads: ['Threads', '<path d="M16.5 9.5c-.6-2.4-2.3-3.5-4.6-3.5-3.2 0-5.4 2.4-5.4 6s2.2 6 5.6 6c2.8 0 4.9-1.6 4.9-4 0-2.3-2-3.5-4.6-3.3-1.8.1-2.9 1-2.9 2.2 0 1.3 1.2 2.1 2.6 2 2.2-.1 3.3-1.9 3.3-5"/>'],
  x: ['X', '<path d="M4 4l16 16M20 4L4 20"/>'],
  linkedin: ['LinkedIn', '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7"/>'],
};
/** The brand's social channels (Quản trị → Trang chủ & nội dung → Mạng xã hội). */
function socialLinks(cls = '') {
  const list = Object.entries(ui.site?.social || {}).filter(([k, u]) => SOCIAL[k] && u);
  if (!list.length) return null;
  return h('nav', { class: 'social ' + cls, 'aria-label': 'Mạng xã hội' }, list.map(([k, u]) => {
    const a = h('a', { href: u, target: '_blank', rel: 'noopener', 'aria-label': SOCIAL[k][0], title: SOCIAL[k][0], 'data-ev': 'social-' + k });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [k2, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k2, v);
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${SOCIAL[k][1]}</svg>`, 'image/svg+xml');
    for (const n of [...doc.documentElement.childNodes]) svg.append(document.importNode(n, true));
    a.append(svg); return a;
  }));
}
const footer = () => h('footer', { class: 'site' },
  h('div', { class: 'operator' },
    h('span', {}, '© ' + new Date().getFullYear() + ' ' + (ui.legal?.company || ui.brand.name)),
    ui.legal?.address ? h('span', {}, ui.legal.address) : null, ui.legal?.taxId ? h('span', {}, 'MST ' + ui.legal.taxId) : null,
    ui.legal?.email && !/example\.(com|org)$/i.test(ui.legal.email) ? h('a', { href: 'mailto:' + ui.legal.email }, ui.legal.email) : null),
  socialLinks(),
  h('nav', { class: 'policies', 'aria-label': 'Liên kết website' }, menuShows('faciup-live')?h('a',{href:'/faciup-live'},ui.labels?.navigation?.['faciup-live']||'Faciup Live'):null, h('a', { href: '#/dieu-khoan' }, 'Điều khoản'), h('a', { href: '#/bao-mat' }, 'Bảo mật'),
    V('feature:plans') === 'on' ? h('a', { href: '#/hoan-tien' }, 'Hoàn tiền') : null, h('a', { href: '#/tro-giup' }, 'Trợ giúp')));

// ---------- notifications on this device when a video is ready (Web Push, no third party)
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const iosNeedsInstall = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !(matchMedia('(display-mode: standalone)').matches || navigator.standalone);
const b64uBytes = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
async function pushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}
async function enablePush() {
  if (iosNeedsInstall()) throw new Error('Trên iPhone: bấm nút Chia sẻ → "Thêm vào MH chính", mở web từ biểu tượng đó rồi bật thông báo.');
  if (!pushSupported()) throw new Error('Trình duyệt này chưa hỗ trợ thông báo.');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Bạn chưa cho phép thông báo. Mở cài đặt trang web để cho phép.');
  const reg = await navigator.serviceWorker.ready, { key } = await api('/api/push/key');
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(key) });
  await api('/api/push/subscribe', { method: 'POST', body: { endpoint: sub.endpoint } });
  track('push_on');
}
/** "Tell me when it's ready": one button, its label follows the state of this device. */
function pushButton(small) {
  const b = h('button', { type: 'button', class: 'ghost' + (small ? ' small' : ''), 'data-ev': 'push-on' }, '🔔 Báo cho tôi khi video xong');
  const paint = (st) => { b.disabled = st === 'on' || st === 'unsupported'; b.textContent = st === 'on' ? '🔔 Đã bật thông báo trên thiết bị này' : st === 'denied' ? '🔕 Thông báo đang bị chặn' : st === 'unsupported' ? '🔕 Trình duyệt chưa hỗ trợ thông báo' : '🔔 Báo cho tôi khi video xong'; };
  pushState().then(paint).catch(() => {});
  b.addEventListener('click', async () => { try { await enablePush(); paint('on'); toast('Đã bật. Khi video xong, thiết bị này sẽ báo cho bạn.'); } catch (e) { toast(e.message); paint(await pushState().catch(() => 'off')); } });
  return b;
}
window.pushButton = pushButton;

// ---------- live demo videos (the real engine, playing in the page)
let demoSet = null, demoRuns = [], demoObserver = null;
const getDemos = () => (demoSet ||= fetch('/demos.json?v=director-1').then((r) => r.json()).catch(() => []));
/** Play a spec in a canvas while it is on screen; returns a handle to restyle it. */
function playDemo(canvas, spec, { dpr = 0.6 } = {}) {
  const run = { canvas, spec, model: null, t: 0, last: 0, raf: 0, visible: false, async build() {
    const s = run.spec, { W, H } = NV.logicalSize(s.ratio);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    run.model = await previewModel(s, dpr); run.t = Math.min(run.t, run.model.timeline.duration);
    if (!run.visible) paintFrame(canvas.getContext('2d'), run.model, Math.min(run.model.timeline.duration - 0.6, run.model.timeline.scenes[0].end - 0.4));
  } };
  const loop = (ts) => {
    if (!run.visible || !run.model) return;
    run.t += run.last ? Math.min(0.1, (ts - run.last) / 1000) : 0; run.last = ts;
    if (run.t > run.model.timeline.duration) run.t = 0;
    paintFrame(canvas.getContext('2d'), run.model, run.t);
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
const STYLE_SHOW = ['sunset', 'cosmos', 'manim', 'bold', 'neon', 'comic', 'pastel', 'darkboard', 'chalkboard', 'whiteboard', 'kraft', 'newspaper', 'blueprint', 'pencil', 'ricepaper', 'oly', 'notebook'];
async function showLanding() {
  viewed('landing');
  const demos = await getDemos(), site = ui.site || {};
  const sample = demos.find((d) => d.look === 'kinetic') || demos[0];
  const canvas = h('canvas', { 'aria-label': 'Video mẫu chuyển động chữ' });
  const {galleryItems,mountGallery}=await import('/home-gallery.js');
  const playlist=galleryItems(site);
  const gallery=playlist.length?mountGallery(playlist,{h,siteUrl}):null;
  if(gallery)stopHomeGallery=gallery.dispose;
  const media=canvas;
  let run;
  const pause = h('button', { type: 'button', class: 'ghost small', 'aria-label': 'Tạm dừng video mẫu', onclick: () => {
    if (!run) return;
    run.visible = !run.visible; cancelAnimationFrame(run.raf);
    if (run.visible) { run.last = 0; run.raf = requestAnimationFrame(run.loop); }
    pause.textContent = run.visible ? '❚❚' : '▶';
    pause.setAttribute('aria-label', run.visible ? 'Tạm dừng video mẫu' : 'Phát video mẫu');
  } }, '❚❚');
  const oldTitles = ['Tạo video giải thích có giọng đọc tiếng Việt', 'Biến ý tưởng thành video vẽ tay sinh động chỉ trong vài phút', 'TẠO VIDEO GIẢI THÍCH TỰ ĐỘNG'];
  const title = site.heroTitle && !oldTitles.includes(site.heroTitle) ? site.heroTitle : 'Ý tưởng thành video';
  const zalo = ui.zalo?.enabled && ui.zalo.botLink ? h('a', { class: 'home-zalo', href: ui.zalo.botLink, target: '_blank', rel: 'noopener', 'data-ev': 'home-zalo' }, 'Cần tư vấn? Nhắn Zalo →') : null;
  const facts = [['mic', 'Giọng đọc tiếng Việt'], ['play', 'Dọc 9:16 hoặc ngang 16:9'], ['check', 'Phụ đề SRT kèm theo']];
  const how = [['Nhập nội dung', 'Một chủ đề, vài ý chính hoặc kịch bản có sẵn.'], ['AI dựng cảnh', 'AI chọn cách kể, vẽ cảnh, ghép giọng và nhạc theo nội dung.'], ['Sửa và tải về', 'Xem trước, chỉnh từng cảnh rồi tải MP4.']];
  show(ui.notice ? h('div', { class: 'notice' }, ui.notice) : null,
    h('section', { class: 'home-minimal' },
      h('div', { class: 'home-intro' },
        h('span', { class: 'eyebrow' }, 'Video vẽ tay & giải thích bằng AI'),
        h('h1', {}, title),
        h('p', { class: 'description' }, site.heroText && site.heroText.length < 200 ? site.heroText : 'Nhập nội dung, chọn giọng đọc và tạo video theo cách kể của bạn.'),
        h('div', { class: 'cta' }, h('a', { class: 'btn', href: '#/tao', 'data-ev': 'hero-create' }, icon('plus'), 'Tạo video'), h('a', { class: 'btn ghost', href: '#/mau' }, 'Gợi ý sáng tạo')),
        h('ul', { class: 'home-facts' }, facts.map(([ic, t]) => h('li', {}, icon(ic), t))),
        zalo, socialLinks('home-social')),
      h('div', { class: 'home-stage' }, h('div', { class: 'stage-heading' }, h('span', {}, 'Từ kịch bản đến màn hình'), h('span', { class: 'stage-dot', 'aria-hidden': 'true' })), gallery?.element || h('figure', { class: 'home-preview' }, media, h('figcaption', {}, h('span', {}, 'Xem chuyển động thực tế'), pause)))),
    h('section', { class: 'home-how', 'aria-label': 'Cách hoạt động' }, how.map(([t, d], i) => h('div', {}, h('span', { class: 'num' }, String(i + 1).padStart(2, '0')), h('h3', {}, t), h('p', {}, d)))),
    footer());
  if (!gallery && sample) run = playDemo(canvas, sample.spec, { dpr: 0.75 });
}
/** Home page media: uploaded files ("site:abc.mp4") or full https addresses. */
const siteUrl = (v) => (String(v || '').startsWith('site:') ? '/api/site/' + String(v).slice(5) : String(v || ''));
/** A muted looping sample that only plays while visible; tap to hear it. */
function siteVideo(src, poster, label, eager) {
  const v = h('video', { src: siteUrl(src), poster: poster ? siteUrl(poster) : null, muted: true, loop: true, playsinline: true, preload: eager ? 'auto' : 'metadata', 'aria-label': label });
  v.muted = true;
  const io = new IntersectionObserver(([en]) => { if (en.isIntersecting && !matchMedia('(prefers-reduced-motion: reduce)').matches) v.play().catch(() => {}); else v.pause(); }, { threshold: 0.4 });
  io.observe(v);
  const sound = h('button', { type: 'button', class: 'sound', 'aria-label': 'Bật âm thanh', onclick: () => { v.muted = !v.muted; sound.textContent = v.muted ? '🔇' : '🔊'; if (!v.muted) v.play().catch(() => {}); } }, '🔇');
  return h('div', { class: 'vbox' }, v, sound);
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
      navigate('#/thu');
    } catch (e) { fail(e); }
  });
}
async function showTry() {
  viewed('try');
  let t = null; try { t = JSON.parse(sessionStorage.getItem('nv_try') || 'null'); } catch {}
  if (!t) { navigate('#/tao'); return; }
  const canvas = h('canvas', { 'aria-label': 'Xem thử video' });
  const run = playDemo(canvas, t.spec, { dpr: 0.75 });
  let style = t.spec.style, skin = t.spec.skin;
  const picker = t.spec.look
    ? skinChips(t.spec.look, skin, async (n) => { skin = n; run.spec = { ...run.spec, skin: n }; run.t = 0; await run.build(); })
    : stylePicker(t.spec, style, (k) => { style = k; run.restyle(k); });
  show(h('a', { href: '#/tao' }, '← Sửa kịch bản'),
    h('div', { class: 'editor' },
      h('div', { class: 'preview' }, platformFrame(iphone(canvas), t.spec)),
      h('div', { class: 'scenes' },
        h('div', { class: 'card' }, h('span', { class: 'badge' }, 'Bản xem thử'), h('h2', {}, t.spec.title),
          h('p', { class: 'muted' }, `Nhận diện: ${t.formatName} · ${t.nicheName} · ${t.spec.scenes.length} cảnh. Video thật có giọng đọc khớp nhịp từng câu${t.spec.look ? ', tiếng hiệu ứng và nhạc nền' : ''}.`),
          h('button', { type: 'button', class: 'big', 'data-ev': 'try-create', onclick: (e) => createProject({ source: 'mine-free', topic: t.text, style, ratio: t.spec.ratio, format: t.spec.format, look: t.spec.look || '', skin,
            mode: t.opts?.mode, intro: t.opts?.intro, character: t.opts?.character, affiliate: t.opts?.affiliate }, e.currentTarget) }, 'Tạo video này'),
          h('small', { class: 'muted' }, me ? 'Video sẽ được lưu vào "Video của tôi".' : 'Bạn sẽ đăng nhập nhanh bằng Google để lưu và nhận video.')),
        h('div', { class: 'card' }, h('h3', {}, t.spec.look ? `${L('looks', t.spec.look)}: đổi bộ màu` : 'Đổi phong cách'), picker))));
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
    previewModel(s, 0.3).then((m) => { c.width = m.W * 0.3; c.height = m.H * 0.3; paintFrame(c.getContext('2d'), m, m.timeline.scenes[0].end - 0.3, { hand: false }); }).catch(() => {});
  }
  return box;
}

// ---------- styles gallery
/** Every way of telling a video that has a demo, in the order of the picker (auto has no single demo). */
const allLooks = (demos) => LOOK_GROUPS.flatMap(([, keys]) => keys).filter((k) => k !== 'auto' && (isClassic(k) || looksOn().includes(k))).map((k) => demos.find((d) => d.look === k)).filter(Boolean);
const CREATIVE_HINTS = [
  ['','Để AI đề xuất','AI chọn cách kể theo nội dung và mô tả của bạn.'],
  ['Giải thích kiểu VOX','VOX / giải thích','Gợi nhịp giải thích, câu hỏi và đồ hoạ làm rõ ý. Bộ dựng hiện chưa lấy cảnh quay tư liệu.'],
  ['Whiteboard vẽ ý tưởng','Whiteboard','Gợi cách kể bằng nét vẽ, chữ ngắn và các ý nối nhau.'],
  ['Chữ chuyển động giàu nhịp điệu','Chữ chuyển động','Gợi cách dùng chữ, khoảng nghỉ và điểm nhấn theo thông điệp.'],
  ['Tối giản, ít chữ và nhiều khoảng trống','Tối giản','Gợi cách trình bày tiết chế, tập trung vào từng ý.'],
];
const FORMAT_HINT = { explainer: 'Giải thích kiểu VOX', data: 'Giải thích kiểu VOX', compare: 'Giải thích kiểu VOX', qa: 'Giải thích kiểu VOX', news: 'Giải thích kiểu VOX',
  howto: 'Whiteboard vẽ ý tưởng', story: 'Whiteboard vẽ ý tưởng', listicle: 'Chữ chuyển động giàu nhịp điệu', motivation: 'Chữ chuyển động giàu nhịp điệu', sales: 'Tối giản, ít chữ và nhiều khoảng trống' };
const FORMAT_SECONDS = { explainer: 60, data: 60, compare: 45, qa: 45, news: 45, howto: 60, story: 90, listicle: 60, motivation: 30, sales: 30 };
async function showStyles() {
  viewed('styles');
  show(h('header',{class:'pagehead'},h('div',{},h('h1',{},'Gợi ý sáng tạo'),h('p',{class:'description'},'Chọn một hướng tham khảo, rồi mô tả video theo ý bạn.'))),
    h('div',{class:'grid wide-2'},CREATIVE_HINTS.map(([direction,name,note])=>h('article',{class:'card'},
      h('div',{class:'catalog-title'},h('h2',{},name),helpHint(name,note)),
      h('button',{type:'button',class:'ghost',onclick:()=>{sessionStorage.setItem('nv_direction',direction);navigate('#/tao');}},'Dùng làm gợi ý')))),footer());
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
// Google's SDK inserts an unstyled SVG before its iframe/styles are ready.
// Keep that intermediate DOM hidden and bounded; the fallback stays usable throughout.
function mountGoogleButton(slot, fallback, config, callback) {
  const host = h('div', { class: 'gsi-host', 'aria-hidden': 'true', inert: true });
  let timer, done = false;
  const cleanup = () => { clearTimeout(timer); host.removeEventListener('load', ready, true); };
  const ready = (event) => {
    if (done || event.target.tagName !== 'IFRAME') return;
    done = true; cleanup();
    if (!slot.isConnected) return;
    fallback.hidden = true; host.classList.add('ready'); host.removeAttribute('aria-hidden'); host.inert = false;
  };
  const fail = () => { if (done) return; done = true; cleanup(); host.remove(); };
  slot.replaceChildren(fallback, host);
  host.addEventListener('load', ready, true);
  timer = setTimeout(fail, 7000);
  try {
    google.accounts.id.initialize({ client_id: config.clientId, nonce: config.nonce, ux_mode: 'popup', use_fedcm_for_prompt: true, callback });
    google.accounts.id.renderButton(host, { theme: 'outline', size: 'large', text: 'continue_with', locale: 'vi', shape: 'pill', width: Math.min(300, slot.clientWidth || 300) });
  } catch { fail(); }
  return () => { done = true; cleanup(); };
}
function openLogin(reason, after) {
  if (me) return;
  if (after) sessionStorage.setItem('nv_after', JSON.stringify(after));
  track('login_open', { reason });
  document.querySelector('.sheet-bg')?.remove();
  const mode = ui.auth?.google || 'auto', redirect = mode === 'redirect' || (mode === 'auto' && popupUnsafe());
  const next = cleanRoute(after?.hash || currentRoute());
  const slot = h('div', { class: 'gslot' });
  let disposeGoogle;
  const close = () => { disposeGoogle?.(); bg.remove(); };
  // say why at the moment of asking: what the sign-in is for, and that the work is kept
  const why = reason === 'create' ? (after?.create?.source === 'topic' ? ['Đăng nhập để AI viết và lưu kịch bản', 'Chủ đề bạn vừa nhập được giữ nguyên; AI bắt đầu viết ngay sau khi đăng nhập.']
      : ['Đăng nhập để lưu và nhận video', 'Kịch bản và lựa chọn của bạn được giữ nguyên; video bắt đầu tạo ngay sau khi đăng nhập.'])
    : reason === 'buy' ? ['Đăng nhập để nạp vào tài khoản', 'Gói hoặc credit được gắn với tài khoản Google của bạn; bạn quay lại đúng trang bảng giá.']
    : reason === 'like' ? ['Đăng nhập để thích và lưu video', 'Bạn quay lại đúng trang Cộng đồng sau khi đăng nhập.']
    : reason === 'route' ? ['Đăng nhập để mở trang này', 'Bạn được đưa tới đúng trang vừa chọn sau khi đăng nhập.']
    : ['Đăng nhập hoặc tạo tài khoản', 'Một chạm với Google, không cần mật khẩu. Tài khoản mới được tạo tự động.'];
  // one tap on our own button: the whole page goes to Google and comes back signed in
  const gBtn = h('a', { class: 'gbtn', href: '/api/auth/google/start?next=' + encodeURIComponent(next), 'data-ev': 'login-google',
    onclick: () => { track('login_go', { how: 'redirect' }); flush(); gBtn.classList.add('busy'); gBtn.replaceChildren(h('i', { class: 'spin' }), 'Đang mở Google…'); } }, GOOGLE_G(), 'Tiếp tục với Google');
  const devBtn = cfg?.dev ? h('button', { type: 'button', class: 'ghost', onclick: async () => { await api('/api/auth/dev', { method: 'POST', body: { email: 'thu@localhost', consent: true } }); location.reload(); } }, 'Đăng nhập thử (máy local)') : null;
  const bg = h('div', { class: 'sheet-bg', onclick: (e) => { if (e.target === bg) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Đăng nhập' },
      h('div', { class: 'side' },
        h('span', { class: 'brand', style: 'color:#fff' }, h('span', { class: 'logo', style: 'background:rgba(255,255,255,.2)' }, '✎'), ui.brand.name + ' ' + (ui.brand.accent || '')),
        h('h2', { style: 'color:#fff' }, reason === 'create' ? 'Còn một bước để nhận video' : 'Chào mừng bạn'),
        h('ul', {}, h('li', {}, 'Lưu và sửa video bất cứ lúc nào'), h('li', {}, 'Giọng đọc tiếng Việt, khớp nhịp từng câu'), h('li', {}, 'Tải MP4 hoặc nhận qua Zalo'), h('li', {}, 'Miễn phí mỗi ngày, không cần thẻ')),
        h('p', { class: 'mini' }, 'Kết nối mã hoá HTTPS. Phiên đăng nhập lưu bằng cookie bảo mật, không lưu mật khẩu.')),
      h('div', { class: 'main', style: 'position:relative' },
        h('button', { type: 'button', class: 'ghost small close', 'aria-label': 'Đóng', onclick: close }, '✕'),
        h('h2', {}, why[0]),
        h('p', { class: 'muted' }, why[1]),
        cfg?.clientId ? (redirect ? gBtn : slot) : h('p', { class: 'error' }, 'Chủ trang chưa cấu hình đăng nhập Google.'),
        devBtn,
        h('p', { class: 'agree' }, 'Bằng việc tiếp tục, bạn đồng ý với ', h('a', { href: '#/dieu-khoan', target: '_blank' }, 'Điều khoản sử dụng'), ' và ', h('a', { href: '#/bao-mat', target: '_blank' }, 'Chính sách bảo mật'), '.'),
        ui.zalo?.enabled && ui.zalo.botLink ? h('div', { class: 'or' }, 'hoặc') : null,
        ui.zalo?.enabled && ui.zalo.botLink ? h('a', { class: 'btn ghost', href: ui.zalo.botLink, target: '_blank', rel: 'noopener', 'data-ev': 'login-zalo' }, 'Tư vấn qua Zalo') : null,
        h('div', { class: 'secure' }, h('span', {}, h('b', {}, 'Google chỉ chia sẻ tên, email và ảnh đại diện. '), 'Chúng tôi không nhận mật khẩu, không đọc Gmail hay Drive, không đăng bài thay bạn. Bạn tải hoặc xoá toàn bộ dữ liệu trong trang Tài khoản.')))));
  document.body.append(bg);
  if (cfg?.clientId && !redirect) {
    // ordinary browsers: Google's own button (popup); the redirect button is the fallback if it does not load
    slot.append(gBtn);
    Promise.all([loadGis(), api('/api/auth/config')]).then(([, c]) => {
      if (!bg.isConnected) return;
      disposeGoogle = mountGoogleButton(slot, gBtn, c, async (r) => {
          try { await api('/api/auth/google', { method: 'POST', body: { credential: r.credential, nonce: c.nonce, consent: true } }); location.reload(); }
          catch (e) { toast(e.message); setTimeout(() => location.reload(), 2500); }
      });
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
  const beta = !!ui.beta, titles = { terms: 'Điều khoản sử dụng', privacy: 'Chính sách bảo mật', refund: 'Chính sách hoàn tiền' };
  // during Beta everything is free: the sections and lines about prices, payment and refunds do not apply
  const money = /thanh toán|hoàn tiền|hoàn lại tiền|gói cước|gói trả phí|bảng giá|chuyển khoản|sepay|vietqr|hoá đơn|hóa đơn|credit/i;
  const blocks = [];
  let list = null, skip = false;
  for (const raw of (beta && which === 'refund' ? '' : l[which]).split('\n')) {
    const line = raw.trim();
    if (!line) { list = null; continue; }
    if (line.startsWith('## ')) { list = null; skip = beta && money.test(line); if (!skip) blocks.push(h('h2', {}, line.slice(3))); continue; }
    if (skip || (beta && money.test(line))) continue;
    if (line.startsWith('- ')) { if (!list) { list = h('ul'); blocks.push(list); } list.append(h('li', {}, line.slice(2))); }
    else { list = null; blocks.push(h('p', {}, line)); }
  }
  const note = beta ? h('div', { class: 'legal-beta' }, h('b', {}, (ui.beta.label || 'Beta') + ' · phiên bản thử nghiệm'), h('p', {}, which === 'refund' ? 'Trong giai đoạn thử nghiệm, mọi tính năng đều miễn phí và không có giao dịch thanh toán nào, nên chưa áp dụng chính sách hoàn tiền.' : 'Trang web đang chạy thử nghiệm và miễn phí. Nội dung dưới đây áp dụng cho giai đoạn này và có thể được cập nhật khi chính thức ra mắt.')) : null;
  show(h('div', { class: 'doc' }, h('div', { class: 'card' }, h('h1', {}, titles[which] + (beta ? ' (bản Beta)' : '')), h('p', { class: 'muted' }, `Phiên bản ${l.version} · ${l.company}${l.taxId ? ' · MST ' + l.taxId : ''}`), note, ...blocks)), footer());
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
// ---------- video formats (looks)
const LOOK_KEYS = ['director', 'act', 'whiteboard', 'illustrated', 'kinetic', 'split', 'chat', 'story', 'data', 'quiz', 'doc'];
const SKIN_NAMES = { dem: 'Đêm', sang: 'Sáng', tim: 'Tím', 'do-xanh': 'Đỏ – xanh', 'tim-vang': 'Tím – vàng', toi: 'Tối', hong: 'Hồng', giay: 'Giấy', 'bang-den': 'Bảng đen', xanh: 'Xanh', 'xanh-la': 'Xanh lá', cam: 'Cam', 'dien-anh': 'Điện ảnh', 'trang-den': 'Trắng đen', lanh: 'Lạnh' };
const looksOn = () => ['kinetic'].filter((k) => V('look:' + k) === 'on');
/**
 * How the video is told: one dropdown, the chosen way playing beside it. `auto` (the default)
 * picks per video from the words and does not repeat the channel's last one; `classic*` are the
 * hand-drawn boards (sketchnote, hand-drawn charts, doodle pictures).
 */
const LOOK_GROUPS = [['Phong cách', ['classic-sketch', 'kinetic']]];
const HAND = { auto: ['Tự chọn cách kể', 'Chọn cách kể theo nội dung và các định dạng đang hoạt động. Tự minh họa dùng quy tắc; chế độ AI cần kết nối AI hợp lệ.'],
  'classic-sketch': ['Whiteboard', 'AI thiết kế hình, chữ ngắn và quan hệ giữa các ý theo từng cảnh. Dùng bộ vẽ bảng hiện có; không phải phim nhân vật hay video tư liệu.'],
  'classic-diagram': ['Biểu đồ vẽ tay', 'Biểu đồ tròn, đường xu hướng, cột số liệu được tay vẽ từng nét, khoanh đỏ chỗ quan trọng.'],
  classic: ['Tranh doodle', 'Mỗi câu một bức tranh lớn vẽ tay, xen nhân vật chính đóng đúng hành động, không có chữ dưới hình.'] };
const isClassic = (k) => String(k).startsWith('classic');
const customOf = (k) => (String(k).startsWith('f:') ? (ui.formats || []).find((f) => f.id === k) : null);
const lookName = (k) => k === 'kinetic' ? 'Chữ chuyển động' : HAND[k]?.[0] || customOf(k)?.name || L('looks', k);
const lookNote = (k) => k === 'kinetic' ? 'AI chọn câu và từ nhấn theo nội dung. Bộ dựng chữ chuyển động không phải phim minh hoạ.' : HAND[k]?.[1] || (customOf(k) ? customOf(k).note || L('lookNotes', customOf(k).base) : L('lookNotes', k));
function lookPicker(current, onPick, demos) {
  const on = new Set([...looksOn(), 'auto', 'classic-sketch', 'classic-diagram', ...(ui.formats || []).map((f) => f.id)]);
  const groups = (ui.formats || []).length ? [LOOK_GROUPS[0], ['Định dạng riêng', ui.formats.map((f) => f.id)], ...LOOK_GROUPS.slice(1)] : LOOK_GROUPS;
  const sel = h('select', { id: 'f-look', 'aria-label': 'Cách kể' }, ...groups.map(([title, keys]) => {
    const list = keys.filter((k) => on.has(k) && (k !== 'act' || on.has('act')));
    return list.length ? h('optgroup', { label: title }, list.map((k) => {
      const dev = !HAND[k] && !customOf(k) && V('look:' + k) === 'dev';
      return h('option', { value: k, disabled: dev, selected: k === current }, lookName(k) + (k === 'doc' ? ' · tính credit' : '') + (dev ? DEV : ''));
    })) : null;
  }).filter(Boolean));
  const note = h('span', { class: 'look-note' }), cap = h('span', { class: 'look-cap' });
  const cv = h('canvas', { 'aria-label': 'Video mẫu của cách kể đang chọn' });
  const demoOf = (k) => demos.find((x) => x.id === k) || demos.find((x) => x.look === (customOf(k)?.base || k));
  // auto: the demo pane shows the hand-drawn ways in turn
  const tour = ['classic-sketch'].map((id) => demos.find((x) => x.id === id)).filter(Boolean);
  let run = null, timer = 0, at = 0;
  const play = (d) => {
    cap.textContent = d ? lookName(d.look || d.id) : '';
    if (!d) return;
    if (!run) run = playDemo(cv, d.spec, { dpr: 0.5 });
    else { run.spec = d.spec; run.t = 0; run.build().catch(() => {}); }
  };
  const paint = (k) => {
    clearInterval(timer); note.replaceChildren(helpHint('Cách kể: ' + lookName(k), lookNote(k))); if (k === 'auto' && V('look:director') === 'on' && demos.some((d) => d.look === 'director')) { play(demos.find((d) => d.look === 'director')); return; }
    if (k === 'auto' && tour.length) {
      at = 0; play(tour[0]);
      timer = setInterval(() => { if (!cv.isConnected) { clearInterval(timer); return; } play(tour[(at = (at + 1) % tour.length)]); }, 9000);
    } else play(demoOf(k));
  };
  sel.addEventListener('change', () => { onPick(sel.value); paint(sel.value); });
  setTimeout(() => paint(sel.value || current), 0);
  return h('div', { class: 'lookpick' },
    h('div', { class: 'lookpick-side' }, h('div', { class: 'look-control' }, sel, note)),
    h('figure', { class: 'look-demo' }, cv, h('figcaption', {}, cap)));
}
function skinChips(look, current, onPick) {
  const names = (NV.SKINS?.[look] || []).map((s) => s.name);
  const box = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Bộ màu' });
  const paint = (cur) => box.replaceChildren(...names.map((n) => {
    const sk = NV.SKINS[look].find((s) => s.name === n), sw = h('i', { class: 'swatch' });
    sw.style.background = `linear-gradient(135deg, ${sk.bg[0][0]} 0 60%, ${sk.hl} 60% 100%)`;
    return h('button', { type: 'button', class: 'chip' + (n === cur ? ' on' : ''), role: 'radio', 'aria-checked': String(n === cur), onclick: () => { onPick(n); paint(n); } }, sw, SKIN_NAMES[n] || n);
  }));
  paint(current || names[0]);
  return box;
}

function modePicker(current, onPick) {
  const box = h('div', { class: 'modes' });
  for (const [k, icon, desc] of MODES) {
    const vis = V('mode:' + k);
    if (vis === 'hidden') continue;
    const b = h('button', { type: 'button', class: 'mode' + (k === current ? ' on' : ''), disabled: vis === 'dev', 'data-ev': 'mode-' + k, title: desc, onclick: () => { for (const x of box.children) x.classList.remove('on'); b.classList.add('on'); onPick(k); } },
      h('span', { class: 'mi' }, icon), h('b', {}, L('modes', k) + (vis === 'dev' ? DEV : '')));
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
  const box = h('div', { class: 'photo' }, h('span', { class: 'plabel' }, label), h('div', { class: 'row' }, img, h('button', { type: 'button', class: 'ghost small', onclick: () => file.click() }, '📷 Chọn ảnh'), clear), hint ? helpHint(label, hint) : null, file);
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

/** Make the video (signs in first when needed, then continues by itself). */
async function createProject(body, btn, onError) {
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
      navigate('#/p/' + r.id);
    } catch (err) { if(onError)onError(err); else fail(err); }
  });
}

const MODE_ICON = Object.fromEntries(MODES.map(([k, i]) => [k, i]));
/** Shared moving preview for the list and grid; only real MP4s become video elements. */
function libraryMedia(p,placeholder){
 return p.done_job?h('video',{class:'lib-preview-video',muted:true,playsinline:true,loop:true,preload:'none',poster:`/api/jobs/${p.done_job}/thumb`,'data-preview-src':`/api/jobs/${p.done_job}/video?inline=1`,'aria-label':'Xem trước: '+p.title}):placeholder(p,h,icon);
}
function projectList(projects,placeholder){
 if(!projects.length)return h('div',{class:'card empty'},h('h2',{},'Chưa có video phù hợp'),h('p',{class:'muted'},T('noVideos')));
 return h('div',{class:'vgrid'},projects.map(p=>{const href=p.done_job?`#/xem/${p.id}/${p.done_job}`:'#/p/'+p.id;return h('article',{class:'vcard2'},h('a',{class:'vtile lib-preview-frame'+(p.ratio==='16:9'?' wide':''),href,'aria-label':p.title},libraryMedia(p,placeholder),p.done_job?h('span',{class:'lib-playback-note'},'Chạm để xem'):null),h('div',{class:'vmeta'},h('a',{href:'#/p/'+p.id,class:'vtitle'},p.title),h('span',{class:'muted'},(p.last_job?(JOB_TEXT[p.last_job]||p.last_job)+' · ':'')+fmtDate(p.updated_at))),h('div',{class:'vactions'},p.done_job?h('a',{class:'btn small',href},'Xem'):null,h('a',{class:'btn ghost small',href:'#/p/'+p.id},'Sửa')));}));
}
async function showVideos() {
  viewed('videos');stopVideoLibrary?.();
  let disposed=false,manager=null,refreshTimer,refreshFocus=null;stopVideoLibrary=()=>{disposed=true;clearTimeout(refreshTimer);manager?.dispose();if(refreshFocus){window.removeEventListener('focus',refreshFocus);document.removeEventListener('visibilitychange',refreshFocus);}};
  const {mountVideoPreviews,libraryPlaceholder}=await import('/video-previews.js?v=38');if(disposed)return;
  let paused=matchMedia('(prefers-reduced-motion: reduce)').matches;try{const saved=store.get('nv_preview_pause');if(saved==='1'||saved==='0')paused=saved==='1';}catch{}
  const box = h('div', {class:'video-library'}, skeleton(6));
  const motion=h('button',{type:'button',class:'ghost small','aria-label':'Tự phát xem trước',title:'Tắt tiếng, chỉ phát khi video nằm trong vùng đang xem.',onclick:()=>{paused=!paused;try{store.set('nv_preview_pause',paused?'1':'0');}catch{}manager?.setPaused(paused);paintMotion();}},'');
  const paintMotion=()=>{motion.textContent=paused?'Bật xem trước':'Tạm dừng xem trước';motion.setAttribute('aria-pressed',String(!paused));};paintMotion();
  const refreshNote=h('p',{class:'muted library-refresh',role:'status'});
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const find = h('input', { type: 'search', placeholder: 'Tìm kiếm dự án…', 'aria-label': 'Tìm kiếm dự án', value: new URLSearchParams(currentRoute().split('?')[1] || '').get('q') || '' });
  const sortSel = h('select', { 'aria-label': 'Sắp xếp' }, h('option', { value: 'new' }, 'Sắp xếp: Mới nhất'), h('option', { value: 'old' }, 'Cũ nhất'), h('option', { value: 'name' }, 'Theo tên'));
  const view = h('select', { 'aria-label': 'Cách hiển thị' }, h('option', { value: 'list' }, 'Dạng danh sách'), h('option', { value: 'grid' }, 'Dạng lưới'));
  try { view.value = store.get('nv_vview') || 'list'; } catch {}
  show(h('header', { class: 'pagehead' }, h('div', {}, h('h1', {}, 'Video của tôi'), h('p', { class: 'muted' }, 'Quản lý, chỉnh sửa và theo dõi tất cả các dự án video.')), h('a', { class: 'btn', href: '#/tao' }, icon('plus'), 'Tạo video mới')),
    tabs, h('div', { class: 'toolbar' }, h('label', { class: 'searchbox' }, icon('search'), find), sortSel, view,motion),refreshNote,box);
  let {projects}=await api('/api/projects');if(disposed)return;
  let cur = 'all';
  const state = (p) => (p.last_job === 'running' || p.last_job === 'queued' ? 'busy' : p.done_job ? 'done' : 'draft');
  const paint = () => {
    const q = fold(find.value);
    const count = (k) => projects.filter((p) => k === 'all' || state(p) === k).length;
    tabs.replaceChildren(...[['all', 'Tất cả'], ['draft', 'Đang chỉnh sửa'], ['busy', 'Đang dựng'], ['done', 'Đã xuất video']]
      .map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === cur), class: 'tab' + (k === cur ? ' on' : ''), onclick: () => { cur = k; paint(); } }, `${l} (${count(k)})`)));
    let list = projects.filter((p) => (cur === 'all' || state(p) === cur) && matches(q, p.title));
    if (sortSel.value === 'old') list = [...list].reverse();
    if (sortSel.value === 'name') list = [...list].sort((x, y) => x.title.localeCompare(y.title, 'vi'));
    manager?.dispose();box.replaceChildren(view.value === 'grid' ? projectList(list,libraryPlaceholder) : projectRows(list,state,libraryPlaceholder));manager=mountVideoPreviews(box,{paused});
  };
  find.addEventListener('input', paint); sortSel.addEventListener('change', paint);
  view.addEventListener('change', () => { try { store.set('nv_vview', view.value); } catch {} paint(); });
  paint();
  const shape=ps=>JSON.stringify(ps.map(p=>[p.id,p.title,p.updated_at,p.ratio,p.last_job,p.done_job]));
  let refreshing=false;
  const refresh=async()=>{if(disposed||refreshing)return;refreshing=true;clearTimeout(refreshTimer);try{if(!document.hidden){const next=(await api('/api/projects')).projects;if(disposed)return;const changed=shape(next)!==shape(projects);projects=next;if(changed)paint();else for(const p of projects){const node=box.querySelector('[data-project-progress="'+p.id+'"]');if(node)node.textContent=Math.max(0,Math.min(100,Number(p.last_progress)||0))+'%';}refreshNote.textContent='';}}catch{if(!disposed)refreshNote.textContent='Chưa cập nhật được tiến độ. Hệ thống sẽ thử lại.';}refreshing=false;if(!disposed&&projects.some(p=>['queued','running'].includes(p.last_job)))refreshTimer=setTimeout(refresh,8000);};
  refreshFocus=()=>{if(!document.hidden)refresh();};window.addEventListener('focus',refreshFocus);document.addEventListener('visibilitychange',refreshFocus);
  if(projects.some(p=>['queued','running'].includes(p.last_job)))refreshTimer=setTimeout(refresh,8000);
}
/** The user's videos as rows: picture, title, status and the next thing to do. */
function projectRows(projects, state,placeholder) {
  if (!projects.length) return h('div', { class: 'card empty' }, h('h2', {}, 'Chưa có video nào'), h('p', { class: 'muted' }, T('noVideos')), h('a', { class: 'btn', href: '#/tao' }, 'Tạo video đầu tiên'));
  const label = { draft: ['Đang chỉnh sửa', 'queued'], busy: ['Đang dựng', 'running'], done: ['Đã xuất video', 'done'] };
  return h('div', { class: 'vrows' }, projects.map((p) => {
    const st = state(p), [text, cls] = p.last_job==='queued'?['Chờ máy dựng','queued']:p.last_job === 'failed' && !p.done_job ? ['Dựng lỗi', 'failed'] : label[st];
    const href = p.done_job ? `#/xem/${p.id}/${p.done_job}` : '#/p/' + p.id;
    const thumb=libraryMedia(p,placeholder);
    return h('article', { class: 'vrow' },
      h('a', { class: 'vrow-thumb lib-preview-frame' + (p.ratio === '16:9' ? ' wide' : ''), href, 'aria-label': p.title }, thumb,p.done_job?h('span',{class:'lib-playback-note'},'Chạm để xem'):null),
      h('div', { class: 'vrow-main' }, h('a', { class: 'vtitle', href: '#/p/' + p.id }, p.title),
        h('span', { class: 'pill ' + cls }, text), h('small', { class: 'muted' }, 'Cập nhật ' + fmtDate(p.updated_at) + (p.shared ? ' · Đã chia sẻ cộng đồng' : ''))),
      h('div', { class: 'vrow-act' },
        st === 'done' ? h('a', { class: 'btn ghost small', href: `/api/jobs/${p.done_job}/video`, download: true, 'data-ev': 'download' }, icon('download'), 'Tải xuống') : null,
        st === 'done' ? h('a', { class: 'btn ghost small', href }, 'Xem') : null,
        h('a', { class: 'btn small' + (st === 'done' ? ' ghost' : ''), href: '#/p/' + p.id }, st === 'draft' ? 'Tiếp tục' : 'Sửa')));
  }));
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
  const tplOn = false;
  const sources = [...['topic', 'mine-ai'].map((k) => [k, ({topic:'Chủ đề', 'mine-ai':'Kịch bản + AI', 'mine-free':'Kịch bản của tôi'})[k], 'source:' + k]).filter(([k]) => ui.enabledSources.includes(k) || V('source:' + k) === 'dev'),
    ...(tplOn && ui.enabledSources.includes('mine-free') ? [['template', 'Kịch bản mẫu', 'feature:templates']] : [])];
  const wantStyle = sessionStorage.getItem('nv_style'); sessionStorage.removeItem('nv_style');
  const wantSrc = sessionStorage.getItem('nv_src'); sessionStorage.removeItem('nv_src');
  const startSrc = sources.some(([k]) => k === wantSrc) ? wantSrc : sources.some(([k]) => k === D.source) ? D.source : sources[0]?.[0];
  const wantMode = sessionStorage.getItem('nv_mode'); sessionStorage.removeItem('nv_mode');
  const wantLook = sessionStorage.getItem('nv_look'); sessionStorage.removeItem('nv_look');
  let look = wantLook === 'kinetic' && V('look:kinetic') === 'on' ? 'kinetic' : 'classic-sketch';
  let skin = '';
  const savedDirection = sessionStorage.getItem('nv_direction'); sessionStorage.removeItem('nv_direction');
  const demos = [];
  let mode = V('mode:' + (wantMode || D.mode || 'hand')) === 'on' ? wantMode || D.mode || 'hand' : 'hand';
  const hasAI = !!(cfg?.ai?.gemini || cfg?.ai?.openai || cfg?.ai?.ollama || me?.ai?.gemini || me?.ai?.openai || me?.ai?.ollama);
  const voiceDraft={speed:1,audio:{voice:"tts",voiceVolume:1}};

  const f = {
    wish: h('textarea',{id:'f-wish',rows:4,maxlength:2400,required:true,placeholder:'Ví dụ: Video giải thích vì sao chúng ta trì hoãn, mở bằng một tình huống quen thuộc; nhịp nhanh vừa, chữ ít, hình làm rõ nguyên nhân và kết thúc bằng một hành động nhỏ.'}),
    direction: h('input',{id:'f-direction',maxlength:160,value:savedDirection || (wantLook==='kinetic'?'Chữ chuyển động':'') ,placeholder:'Ví dụ: VOX, Whiteboard, tối giản… hoặc để AI tự chọn'}),
    source: h('select', { id: 'f-source', 'aria-label': 'Bắt đầu từ' }, options(sources, startSrc)),
    topic: h('textarea', { id: 'f-topic', rows: 5, maxlength: 20000, placeholder: T('topicHint') }),
    subtitles: h('input', { type: 'checkbox', checked: !!D.subtitles }),
    intro: h('input', { type: 'checkbox', checked: D.intro !== false }),
    seconds: h('select', { id: 'f-seconds' }, options(secondsOptions(D.seconds, maxSec), String(Math.min(D.seconds || 45, maxSec)))),
    ratio: h('select', { id: 'f-ratio' }, options(ratioOptions(false), D.ratio || '9:16')),
    style: h('select', { id: 'f-style' }, options([['auto', 'Tự chọn theo kiểu video & nội dung'], ...styleOptions()], wantStyle && ui.enabledStyles.includes(wantStyle) ? wantStyle : 'auto')),
    voice: h('select', { id: 'f-voice' }, options(voiceOptions(), D.voice)),
    channel: h('input', { id: 'f-channel', maxlength: 40, value: D.channel || '', placeholder: T('channel') }),
    episode: h('input', { id: 'f-episode', maxlength: 30, placeholder: T('episodeHint') }),
    illustratedCharacter:h('textarea',{id:'f-illustrated-character',rows:2,maxlength:800,placeholder:'Mô tả nhân vật, trang phục, biểu cảm hoặc chủ thể bạn muốn. Không bắt buộc.'}),
    tone: h('input', { id: 'f-tone', maxlength: 200, value: D.tone || '', placeholder: T('toneHint') }),
    // hand drawing uses the picture library by default (no repeated stick figures)
    visual: h('select', { id: 'f-visual' }, options(Object.entries(ui.labels.visual).map(([k, v]) => [k, v, 'visual:' + k]), V('visual:doodle') === 'on' ? 'doodle' : D.visual || 'sketch')),
    format: h('select', { id: 'f-format' }, options(Object.entries(FORMAT_LABELS), 'auto')),
    transition: h('select', { id: 'f-transition' }, options([['auto', 'Tự động, đa dạng'], ['fade', 'Mờ dần'], ['slide', 'Trượt ngang'], ['wipe', 'Bàn tay xoá bảng'], ['zoom', 'Phóng to']], 'auto')),
    affOn: h('input', { type: 'checkbox' }),
    affLink: h('input', { type: 'url', maxlength: 300, placeholder: 'https://shope.ee/... (link tiếp thị của bạn)' }),
    affProduct: h('input', { maxlength: 80, placeholder: 'Tên sản phẩm' }),
    affPrice: h('input', { maxlength: 30, placeholder: 'Giá, vd 199.000đ' }),
    music: h('select', { id: 'f-music' }, options([['auto', 'Tự chọn'], ['none', 'Không nhạc'], ...(ui.music || []).map((m) => [m.id, m.title])], ui.defaults?.music || 'auto')),
  };
  const illustratedOptions=h('div',{hidden:true},h('label',{},'Nhân vật / chủ thể theo ý bạn',f.illustratedCharacter),helpHint('Ảnh minh hoạ nhiều lớp', 'Ảnh AI được tạo riêng cho từng lớp, tính lượt ảnh theo gói. Bạn có thể chỉnh mô tả, bố cục và nhịp xuất hiện trước khi xuất video.'));
  const skinBox = h('div');
  const creditNote = h('p', { class: 'notice', hidden: true });
  const showCredits = async () => {
    if (look !== 'doc') { creditNote.hidden = true; return; }
    creditNote.hidden = false;
    if (!me) { creditNote.textContent = `Phim tài liệu AI dùng ảnh AI cho từng cảnh nên tính riêng: ${ui.doc?.perVideo || 1} credit mỗi video. Đăng nhập để xem số credit của bạn.`; return; }
    try {
      const c = await api('/api/credits');
      creditNote.replaceChildren(`Phim tài liệu AI: ${c.perVideo} credit mỗi video, kèm ${c.images} lượt vẽ ảnh. `,
        h('b', {}, c.monthlyLeft ? `Gói của bạn còn ${c.monthlyLeft} video tháng này.` : `Bạn còn ${c.balance} credit.`),
        !c.monthlyLeft && c.balance < c.perVideo ? (c.packs.length ? h('a', { href: '#/goi' }, ' Mua credit') : ' Liên hệ quản trị để được cấp credit.') : '');
    } catch (e) { creditNote.textContent = e.message; }
  };
  const character = photoField('Ảnh nhân vật', 'Ảnh chân dung hoặc linh vật của kênh: thay cho người que trong mọi cảnh.');
  const product = photoField('Ảnh sản phẩm', 'Hiện ở cảnh cuối cùng mã QR mua hàng.');
  const topicLabel = h('span', {}, T('topic'));
  const only = {};
  const go = h('button', { type: 'submit', class: 'big', 'data-ev': 'create' }, T('write'));
  const tryBtn = h('button', { type: 'button', class: 'ghost big', 'data-ev': 'create-try', onclick: () => startTry(f.topic.value, tryBtn, { ratio: f.ratio.value, style: f.style.value === 'auto' ? undefined : f.style.value, format: f.format.value, look: look === 'auto' && V('look:director') === 'on' ? 'director' : isClassic(look) || look === 'doc' || look === 'auto' ? undefined : look, skin: skin || undefined }, extras()) }, '✨ Xem thử');
  const tplBox = h('div', { class: 'tplpick' });
  const sync = () => {
    const src = f.source.value, mine = src !== 'topic';
    topicLabel.textContent = mine ? T('script') : T('topic');
    f.topic.placeholder = mine ? T('scriptHint') : T('topicHint');
    only.seconds.hidden = mine; only.tone.hidden = mine; only.visual.hidden = mine;
    only.subs.hidden = V('feature:subtitles') === 'hidden';
    if(only.intro)only.intro.hidden=true;
    illustratedOptions.hidden=look!=='illustrated';
    tplBox.hidden = src !== 'template';
    if (src === 'template' && !tplBox.childNodes.length) tplBox.append(templatesCard(pick));
    tryBtn.hidden = true;
    go.textContent = src === 'mine-free' || src === 'template' ? (ui.beta ? 'Tạo video' : 'Tạo video (miễn phí)') : 'Lên ý tưởng & thiết kế';
    go.disabled = src !== 'mine-free' && src !== 'template' && !hasAI;
    if(look==='illustrated'&&['mine-free','template'].includes(src)){go.disabled=true;go.textContent='Cần AI minh hoạ';}
    if (go.disabled && !(look==='illustrated'&&['mine-free','template'].includes(src))) go.textContent = 'AI chưa sẵn sàng';
    only.aff.hidden = !isClassic(look) || !f.affOn.checked;
    if (only.char) only.char.hidden = true;
    if (only.affToggle) only.affToggle.hidden = true;
    // format videos: the format sets the look; the classic board keeps its own options
    const classic = isClassic(look), auto = look === 'auto';
    for (const el of [only.mode, only.style, only.visual2, only.transition, only.visual]) if (el) el.hidden = true;
    if (only.visual) only.visual.hidden = only.visual.hidden || !classic;
    only.looked.hidden = true;
    if (isClassic(look)) f.visual.value = look === 'classic-sketch' ? 'sketch' : look === 'classic-diagram' ? 'diagram' : 'doodle';
    if (!classic && (NV.SKINS?.[look] || []).length > 1) skinBox.replaceChildren(h('span', { class: 'plabel' }, 'Bộ màu'), skinChips(look, skin, (n) => { skin = n; })); else skinBox.replaceChildren();
    showCredits();
  };
  f.source.addEventListener('change', () => { sync(); track('choose', { source: f.source.value }); });
  f.affOn.addEventListener('change', sync);
  // Creative briefs are interpreted by AI; do not pre-classify them using keyword rules.
  const extras = () => ({ mode, intro: false, styleAuto: f.style.value === 'auto', character: isClassic(look) && V('feature:character') === 'on' ? character.get() || undefined : undefined,
    affiliate: isClassic(look) && f.affOn.checked && f.affLink.value.trim() ? { link: f.affLink.value.trim(), product: f.affProduct.value.trim(), price: f.affPrice.value.trim(), image: product.get() || undefined } : undefined });
  const body = () => {
    const x = extras();
    return { look: '', creative:{wish:f.wish.value,direction:f.direction.value}, music: f.music.value,
      source: f.source.value === 'template' ? 'mine-free' : f.source.value, subtitles: f.subtitles.checked, topic: f.topic.value, seconds: Number(f.seconds.value), ratio: f.ratio.value, style: f.style.value,
      voiceId: f.voice.value, speed:voiceDraft.speed, audio:voiceDraft.audio, channel: f.channel.value, episode: f.episode.value, tone: f.tone.value, visual: f.visual.value, format: f.format.value, transition: f.transition.value,

      mode: x.mode, intro: x.intro, character: x.character, affiliate: x.affiliate, illustratedCharacter:look==='illustrated'?f.illustratedCharacter.value:undefined };
  };
  const feat = (k) => V('feature:' + k) !== 'hidden';
  // what the user gets and what it takes, updated as they choose
  const summary = h('dl', { class: 'summary' });
  const paintSummary = () => {
    const lim = me?.limits || {}, used = me?.used || {}, left = Math.max(0, (lim.render || ui.free?.render || 0) - (used.render || 0));
    const mine = f.source.value !== 'topic', secs = mine ? Math.round(f.topic.value.trim().length / 14) : Number(f.seconds.value);
    const voice = (ui.voices || []).find((v) => v.code === f.voice.value);
    summary.replaceChildren(
      h('dt', {}, 'Bạn nhận'), h('dd', {}, `${ui.rendering?.mode==='browser'?'MP4/WebM':'MP4'} ${f.ratio.value === '16:9' ? 'ngang 16:9' : 'dọc 9:16'}${secs ? `, khoảng ${Math.max(10, secs)} giây` : ''}, phụ đề SRT`),
      h('dt', {}, 'Chi phí'), h('dd', {}, (ui.rendering?.mode==='browser'?'Xuất trên thiết bị; giọng AI tính theo dịch vụ':(look === 'doc' ? `${ui.doc?.perVideo || 1} credit phim tài liệu + ` : '') + `1 lượt dựng` + (me ? ` (hôm nay còn ${left})` : ` (miễn phí ${ui.free?.render || 0} lượt mỗi ngày)`))
        + (f.source.value === 'topic' || f.source.value === 'mine-ai' ? ' + 1 lượt AI viết' : '')));
  };
  for (const el of [f.source, f.topic, f.seconds, f.ratio, f.voice]) el.addEventListener('change', paintSummary);
  f.topic.addEventListener('input', debounce(paintSummary, 400));
  // direction chips toggle in and out of the direction field; the one AI suggests is marked
  const hintRow = h('div', { class: 'creative-hints', role: 'group', 'aria-label': 'Hướng gợi ý' });
  const dirParts = () => f.direction.value.split(/\s*[,;+]\s*/).map((x) => x.trim()).filter(Boolean);
  function paintHints() {
    const parts = dirParts();
    hintRow.replaceChildren(...CREATIVE_HINTS.map(([direction, name]) => {
      const on = direction ? parts.includes(direction) : !parts.length;
      return h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), title: CREATIVE_HINTS.find(([d]) => d === direction)[2],
        onclick: () => { const next = direction ? (on ? parts.filter((x) => x !== direction) : [...parts, direction]) : []; f.direction.value = next.join(', '); paintHints(); } },
        name);
    }));
  }
  f.direction.addEventListener('input', paintHints);
  paintHints();
  const step = (n, title, sub, ...kids) => h('section', { class: 'step' }, h('header', {}, h('span', { class: 'stepno' }, String(n)), h('div', {}, h('h2', {}, title), sub ? helpHint(title, sub) : null)), ...kids);
  const creationError=h('p',{class:'notice bad description',role:'alert',hidden:true});
  const form = h('form', { class: 'create', onsubmit: (e) => { e.preventDefault(); creationError.hidden=true; createProject(body(), go,(err)=>{creationError.textContent=err.message;creationError.hidden=false;}).then(sync); } },
    step(1, 'Nội dung', 'Nhập chủ đề hoặc kịch bản; AI thiết kế từng cảnh theo nội dung.',
      h('div', { class: 'field-group' }, h('span', { class: 'field-caption' }, 'Bắt đầu từ', helpHint('Cách tạo', 'Chủ đề: AI viết lời và thiết kế cảnh. Kịch bản + AI: giữ nguyên lời của bạn, AI thiết kế cảnh. Nếu AI lỗi, hệ thống dừng và giữ nội dung đã nhập.')), f.source),
      tplBox, h('label', { for: 'f-topic' }, topicLabel, f.topic)),
    step(2, 'Video bạn muốn nhận', 'Phong cách chỉ là gợi ý; AI tự thiết kế theo nội dung và mong muốn của bạn.',
      h('label',{for:'f-wish'},'Mô tả kết quả mong muốn',f.wish),
      hintRow,
      h('div',{class:'field-group'},h('span',{class:'field-caption'},'Hướng tham khảo',h('small',{class:'muted'},' · không bắt buộc'),helpHint('Hướng tham khảo','Chọn một hoặc nhiều hướng, hoặc gõ thêm ý của bạn. Gợi ý không khóa bố cục. VOX hiện giải thích bằng đồ hoạ, chưa có cảnh quay tư liệu.')),f.direction),
      only.looked=h('div',{hidden:true})),
    step(3, 'Xuất video', 'Kiểm tra thông số và chi phí trước khi dựng.',
      h('div', { class: 'grid wide-2' }, h('label', {}, T('ratio'), f.ratio), h('label', {}, T('voice'), voiceField(f.voice,{get:()=>voiceDraft,apply:r=>{voiceDraft.speed=r.speed;voiceDraft.audio=r.audio;paintSummary();}})), only.seconds = h('label', {}, T('duration'), f.seconds)),

      summary,
      h('details', { class: 'advanced' }, h('summary', {}, 'Nâng cao'),
        h('div', { class: 'grid wide-2' }, ui.rendering?.mode==='browser'?null:h('label', {}, 'Nhạc nền', f.music), h('label', {}, T('channel'), f.channel), h('label', {}, T('episode'), f.episode), only.tone = h('label', {}, T('tone'), f.tone),
          only.visual = h('label', {}, T('visual'), f.visual), only.style = h('label', {}, T('style'), f.style), only.transition = h('label', {}, 'Chuyển cảnh', f.transition)),
        only.mode = h('div', {}, h('span', { class: 'plabel' }, 'Kiểu vẽ tay'), modePicker(mode, (k) => { mode = k; track('mode', { mode: k }); })),
        h('div', { class: 'toggles' },
          feat('intro') ? only.intro=h('label', { class: 'check' }, f.intro, h('span', {}, h('b', {}, 'Mở đầu là ảnh bìa'), h('small', { class: 'muted' }, ''))) : null,
          only.subs = h('label', { class: 'check' }, f.subtitles, T('subsOnPicture')),
          feat('affiliate') ? only.affToggle = h('label', { class: 'check' }, f.affOn, h('span', {}, h('b', {}, 'Video tiếp thị liên kết'), helpHint('Tiếp thị liên kết', 'Thêm cảnh cuối có ảnh sản phẩm, giá và mã QR.'))) : null),
        only.aff = h('div', { class: 'card inner' }, h('div', { class: 'grid' }, h('label', {}, 'Link tiếp thị', f.affLink), h('label', {}, 'Sản phẩm', f.affProduct), h('label', {}, 'Giá', f.affPrice)), product),
        feat('character') ? only.char = h('div', { class: 'inner' }, character) : null),
      creationError, h('div', { class: 'row' }, go),
      me ? null : h('p', { class: 'muted' }, 'Bạn chỉ cần đăng nhập ở bước cuối; nội dung đã nhập được giữ nguyên.')));
  async function pick(t) {
    try {
      const { template } = await api('/api/templates/' + t.id);
      f.topic.value = template.text; guess(); f.topic.focus();
      f.topic.scrollIntoView({ behavior: 'smooth', block: 'center' });
      track('template', { id: t.id });
    } catch (e) { fail(e); }
  }
  sync(); paintSummary();
  show(h('header', { class: 'pagehead' }, h('div', {}, h('h1', {}, 'Tạo video'), h('p', { class: 'muted' }, 'Bắt đầu từ điều bạn muốn kể.'))), form);
  const tpl = sessionStorage.getItem('nv_tpl'); sessionStorage.removeItem('nv_tpl');
  // Stored legacy template selections are discarded; creation starts from the user's content.
}

// ---------- account
function detailDialog(title){
  document.querySelectorAll('dialog.account-detail').forEach(d=>d.close());
  const content=h('div',{class:'account-detail-body'}),trigger=document.activeElement;
  const dialog=h('dialog',{class:'account-detail','aria-label':title},h('header',{},h('h2',{},title),h('button',{type:'button',class:'ghost small','aria-label':'Đóng '+title,onclick:()=>dialog.close()},'Đóng')),content);
  dialog.addEventListener('close',()=>{dialog.remove();trigger?.focus();},{once:true});document.body.append(dialog);dialog.showModal();return {dialog,content};
}
async function refreshMemberState(){
 if(!me)return;
 const fresh=await api('/api/me');me=fresh;applyUI(fresh.ui);paintHeader();
 try{const cached=JSON.parse(store.get('nv_boot')||'null');if(cached){cached.me=fresh;store.set('nv_boot',JSON.stringify(cached));}}catch{}
 window.dispatchEvent(new Event('nv:member-updated'));return fresh;
}
async function showAccount() {
  if(!me)return openLogin();
  hideMenu();refreshMemberState().catch(()=>{});
  const {dialog,content}=detailDialog('Tài khoản của bạn');
  const show=(...kids)=>content.replaceChildren(...kids.filter(k=>k && k.tagName!=='FOOTER'));
  content.addEventListener('click',e=>{if(e.target.closest('a[href^="#/"]'))dialog.close();});
  viewed('account');
  const del = h('input', { placeholder: 'Gõ XOA để xác nhận', maxlength: 4, 'aria-label': 'Gõ XOA để xác nhận xoá tài khoản' });
  const lim = me.limits || {}, used = me.used || {}, left = (k) => Math.max(0, (lim[k] || 0) - (used[k] || 0));
  const credits = h('dd', {}, '…'),planValue=h('dd'),limitsValue=h('dd'),orderHistory=h('section',{class:'card setgroup account-orders'},h('h2',{},'Đơn hàng của tôi'),h('p',{class:'muted'},'Đang tải…'));
  const paintEntitlements=()=>{planValue.textContent=(me.plan?.name||'Miễn phí')+(me.plan?.expires?' · đến '+fmtDate(me.plan.expires):'');const l=me.limits||{},u=me.used||{};limitsValue.textContent=Math.max(0,(l.render||0)-(u.render||0))+'/'+(l.render||0)+' lượt dựng · '+Math.max(0,(l.script||0)-(u.script||0))+'/'+(l.script||0)+' lượt AI viết';api('/api/credits').then(c=>{credits.textContent=(c.monthlyLeft?c.monthlyLeft+' video trong gói tháng này · ':'')+c.balance+' credit';}).catch(()=>{credits.textContent='—';});};
  const row = (title, value, action) => h('div', { class: 'setrow' }, h('div', {}, h('b', {}, title), value ? h('p', { class: 'muted' }, value) : null), action || null);
  show(h('header', { class: 'pagehead' }, h('div', {}, h('h1', {}, 'Tài khoản'), h('p', { class: 'muted' }, 'Thông tin, gói đang dùng và dữ liệu của bạn.'))),
    h('section', { class: 'card setgroup' }, h('h2', {}, 'Thông tin'),
      h('div', { class: 'profile' }, h('span', { class: 'avatar big' }, (me.user.name || me.user.email).charAt(0).toUpperCase()), h('div', {}, h('b', {}, me.user.name || me.user.email.split('@')[0]), h('p', { class: 'muted' }, me.user.email + ' · đăng nhập bằng Google')))),
    h('section', { class: 'card setgroup' }, h('h2', {}, 'Thông báo'),
      row('Báo khi video xong', 'Nhận thông báo ngay trên điện thoại hoặc máy tính này, không cần Zalo. iPhone: thêm web vào màn hình chính trước.', pushButton(true))),
    h('section', { class: 'card setgroup' }, h('h2', {}, 'Gói và lượt dùng'),
      h('dl', { class: 'summary' },
        h('dt', {}, 'Gói'), planValue,
        h('dt', {}, 'Hôm nay còn'), limitsValue,
        h('dt', {}, 'Số dư credit'), credits),
      V('feature:plans') === 'on' ? h('a', { class: 'btn ghost', href: '#/goi' }, 'Xem bảng giá') : null),
    ui.beta ? null : orderHistory,
    ui.zalo?.enabled ? h('section', { class: 'card setgroup' }, h('h2', {}, 'Zalo'), row(me.zaloLinked ? 'Đã kết nối' : 'Chưa kết nối', 'Nhận video và tạo video ngay trong Zalo.', h('a', { class: 'btn ghost small', href: '#/zalo' }, me.zaloLinked ? 'Quản lý' : 'Kết nối'))) : null,
    h('section', { class: 'card setgroup' }, h('h2', {}, 'Dữ liệu và quyền riêng tư'),
      row('Tải dữ liệu của tôi', 'Bản sao toàn bộ dữ liệu (JSON): kịch bản, video, đơn hàng, nhật ký.', h('a', { class: 'btn ghost small', href: '/api/account/export', 'data-ev': 'export-data' }, 'Tải về')),
      row('Chính sách', null, h('div', { class: 'row' }, h('a', { href: '#/dieu-khoan' }, 'Điều khoản sử dụng'), h('a', { href: '#/bao-mat' }, 'Chính sách bảo mật')))),
    h('div',{class:'row account-shortcuts'},menuShows('video')?h('a',{class:'btn ghost',href:'#/video',onclick:()=>dialog.close()},'Video của tôi'):null, me.admin?h('a',{class:'btn ghost',href:'#/admin',onclick:()=>dialog.close()},'Quản trị'):null, h('button',{type:'button',class:'ghost',onclick:()=>{dialog.close();document.getElementById('logout').click();}},T('logout'))),
    h('details', { class: 'card setgroup danger-zone' }, h('summary', {}, 'Xoá tài khoản'),
      h('p', { class: 'muted' }, 'Xoá vĩnh viễn video, kịch bản, ảnh, liên kết Zalo và thông tin đăng nhập. Chứng từ thanh toán được giữ ẩn danh theo luật kế toán.'),
      h('div', { class: 'row' }, del, h('button', { type: 'button', class: 'danger', 'data-ev': 'delete-account', onclick: async () => {
        if (del.value.trim().toUpperCase() !== 'XOA') return toast('Gõ XOA để xác nhận.');
        try { await api('/api/account/delete', { method: 'POST', body: { confirm: 'XOA' } }); toast('Đã xoá tài khoản.'); setTimeout(() => { navigate('#/'); location.reload(); }, 1200); } catch (e) { fail(e); }
      } }, 'Xoá vĩnh viễn'))),
    footer());
  paintEntitlements();window.addEventListener('nv:member-updated',paintEntitlements);
  let historyTimer,lastStatus='';
  const loadOrders=async()=>{
   if(!dialog.open)return;
   try{const data=await api('/api/plans'),signature=JSON.stringify(data.orders.map(o=>[o.code,o.status]));
    orderHistory.replaceChildren(h('h2',{},'Đơn hàng của tôi'),...(data.orders.length?data.orders.map(o=>h('div',{class:'account-order-row'},h('div',{},h('b',{},o.code),h('small',{class:'muted'},fmtDate(o.created_at))),h('strong',{},money(o.amount)),h('span',{class:'pill '+(o.status==='paid'?'done':o.status==='pending'?'queued':'failed')},{pending:'Chờ thanh toán',paid:'Đã thanh toán',cancelled:'Đã huỷ',expired:'Hết hạn'}[o.status]||o.status),o.status==='pending'?h('button',{type:'button',class:'ghost small',onclick:async()=>{try{const result=await api('/api/orders/'+o.code);if(result.order.status==='paid'){await refreshMemberState();return loadOrders();}if(result.order.status!=='pending')return loadOrders();dialog.close();payModal(result.order,{id:o.plan,solutionUrl:o.solutionUrl,name:o.title||ui.doc?.packs?.find(p=>'credit:'+p.id===o.plan)?.name||ui.plans?.find(p=>p.id===String(o.plan).split(':')[0])?.name||o.plan});}catch(e){fail(e);}}},'Thanh toán'):null)):[h('p',{class:'muted'},'Bạn chưa có đơn hàng.')]));
    if(data.ownedSolutions?.length)orderHistory.append(h('h2',{},'Giải pháp đã mua'),...data.ownedSolutions.map(s=>h('div',{class:'account-order-row'},h('strong',{},s.title),h('a',{class:'btn ghost small',href:'/giai-phap/'+s.slug,onclick:()=>dialog.close()},'Sử dụng ngay'))));
    if(!lastStatus||lastStatus!==signature)await refreshMemberState().catch(()=>{});lastStatus=signature;
   }catch(e){orderHistory.replaceChildren(h('h2',{},'Đơn hàng của tôi'),h('p',{class:'bad'},e.message),h('button',{class:'ghost small',onclick:loadOrders},'Thử lại'));}
   if(dialog.open)historyTimer=setTimeout(loadOrders,8000);
  };
  dialog.addEventListener('close',()=>{clearTimeout(historyTimer);window.removeEventListener('nv:member-updated',paintEntitlements);},{once:true});
  loadOrders();
}

// ---------- plans & payment
/** Pricing like a checkout: choose on the left, the order on the right updates at once (what you get, until when, total). */
async function showPlans() {
  viewed('plans');
  if (V('feature:plans') !== 'on') { show(h('header', { class: 'pagehead' }, h('h1', {}, 'Bảng giá')), h('p', { class: 'muted' }, 'Hiện mọi người dùng miễn phí trong hạn mức mỗi ngày.')); return; }
  const r = me ? await api('/api/plans') : { current: { id: 'free' }, orders: [], payment: null };
  const plans = [...ui.plans].sort((x, y) => x.price - y.price), packs = ui.doc?.packs || [];
  async function buy(item, btn) {
    if (!me) return openLogin('buy', { hash: '#/goi' });
    if (!r.payment) return toast('Thanh toán đang tạm đóng. Liên hệ quản trị viên.');
    await busy(btn, 'Đang tạo đơn…', async () => {
      try { const { order: o } = await api('/api/orders', { method: 'POST', body: { plan: item.id } }); payModal(o, { id: item.id, name: item.name }); track('pay_open', { plan: item.id }); } catch (e) { fail(e); }
    });
  }
  const per = (p) => (!p.days ? '' : p.days === 30 ? ' / tháng' : p.days === 365 ? ' / năm' : ` / ${p.days} ngày`);
  // a yearly price exists for some plan: offer the month / year switch, with the real saving
  const yearly = plans.filter((p) => p.price > 0 && p.yearPrice > 0 && p.days > 0);
  // a year of the plan's own price: 12 months for a monthly plan, rounded to a thousand dong
  const yearOf = (p) => (p.days === 30 ? p.price * 12 : Math.round(p.price * 365 / p.days / 1000) * 1000);
  const saving = (p) => Math.round((1 - p.yearPrice / yearOf(p)) * 100);
  const bestSaving = Math.max(0, ...yearly.map(saving));
  let year = false;
  try { year = !!yearly.length && store.get('nv_year') === '1'; } catch {}
  const grid = h('div', { class: 'plans' });
  const paintPlans = () => grid.replaceChildren(...plans.map(planCard));
  const toggle = yearly.length ? h('div', { class: 'billing' },
    h('span', { class: 'bl' + (year ? '' : ' on') }, 'Thanh toán theo tháng'),
    h('button', { type: 'button', role: 'switch', class: 'switch' + (year ? ' on' : ''), 'aria-checked': String(year), 'aria-label': 'Thanh toán theo năm', onclick: (e) => {
      year = !year; e.currentTarget.classList.toggle('on', year); e.currentTarget.setAttribute('aria-checked', String(year));
      e.currentTarget.parentElement.querySelectorAll('.bl').forEach((x, k) => x.classList.toggle('on', k === 1 ? year : !year));
      store.set('nv_year', year ? '1' : '0'); paintPlans(); } }, h('i')),
    h('span', { class: 'bl' + (year ? ' on' : '') }, 'Thanh toán theo năm'),
    bestSaving > 0 ? h('span', { class: 'save' }, `Tiết kiệm đến ${bestSaving}%`) : null) : null;
  const ICON_OF = ['send', 'crown', 'team', 'star'];
  const planCard = (p, i) => {
    const current = p.id === r.current.id, lim = p.limits || {};
    const byYear = year && p.yearPrice > 0 && p.price > 0;
    const shown = byYear ? p.yearPrice : p.price;
    // struck price: the plan's real list price, or a year of monthly payments when paying yearly
    const struck = byYear ? yearOf(p) : p.listPrice > p.price ? p.listPrice : 0;
    const lines = [`${lim.render || 0} video mỗi ngày`, `Mỗi video tối đa ${String(Math.round((p.maxSeconds || 90) / 60 * 10) / 10).replace('.', ',')} phút`, ...(lim.script ? [`${lim.script} lượt AI viết kịch bản mỗi ngày`] : []), ...(p.docPerMonth ? [`${p.docPerMonth} phim tài liệu AI mỗi tháng`] : []), ...(p.features || [])];
    return h('article', { class: 'plan' + (p.highlight ? ' hot' : '') },
      p.highlight ? h('span', { class: 'ribbon' }, 'Phổ biến nhất') : null,
      h('span', { class: 'plan-ic' }, icon(ICON_OF[i % ICON_OF.length])),
      h('h2', {}, p.name),
      h('p', { class: 'price' }, h('b', {}, shown ? money(shown) : '0đ'), h('span', {}, !p.price ? ' / mãi mãi' : byYear ? ' / năm' : per(p))),
      struck > shown ? h('p', { class: 'struck' }, h('s', {}, money(struck)), byYear ? h('span', {}, ` ≈ ${money(Math.round(shown / 12 / 1000) * 1000)} / tháng`) : null) : null,
      year && p.price > 0 && !byYear ? h('p', { class: 'muted small' }, 'Gói này chỉ bán theo ' + (per(p).replace(' / ', '') || 'kỳ')) : null,
      p.desc ? h('p', { class: 'muted' }, p.desc) : null,
      h('ul', { class: 'ticks' }, lines.map((t) => h('li', {}, icon('check'), t))),
      current ? h('span', { class: 'btn ghost', 'aria-disabled': 'true' }, 'Đang dùng')
        : p.price ? h('button', { type: 'button', class: p.highlight ? '' : 'ghost', 'data-ev': 'buy', onclick: (e) => buy(byYear ? { id: p.id + ':year', name: p.name + ' (1 năm)' } : { id: p.id, name: p.name }, e.currentTarget) }, me ? 'Bắt đầu ngay' : 'Đăng nhập để mua')
        : h('a', { class: 'btn ghost', href: '#/tao' }, 'Bắt đầu ngay'));
  };
  show(h('header', { class: 'pagehead center' }, h('div', {}, h('h1', {}, 'Chọn gói phù hợp với nhu cầu của bạn'),
      h('p', { class: 'muted' }, me ? `Bạn đang dùng gói ${r.current.name || 'Miễn phí'}${r.current.expires ? ` (đến ${fmtDate(r.current.expires)})` : ''}. ` + 'Thanh toán bằng VietQR, kích hoạt tự động trong 1–2 phút.' : 'Dù bạn là cá nhân hay doanh nghiệp, luôn có gói phù hợp. Thanh toán VietQR, kích hoạt tự động.'))),
    toggle, grid,
    packs.length ? h('section', { class: 'card credit-pricing' }, h('h2', {}, 'Credit phim tài liệu AI'), h('p', { class: 'muted' }, `Mỗi phim tài liệu dùng ${ui.doc?.perVideo || 1} credit (ảnh AI cho từng cảnh).`),
      h('div', { class: 'packs' }, packs.map((k) => h('div', { class: 'pack' }, h('b', {}, k.name), h('span', {}, `${k.credits} credit`), h('b', { class: 'amount' }, money(k.price)),
        h('button', { type: 'button', class: 'ghost small', onclick: (e) => buy({ id: 'credit:' + k.id, name: k.name }, e.currentTarget) }, 'Mua credit'))))) : null,
    h('p', { class: 'muted pricing-note' }, 'Hạn mức theo từng gói · Thanh toán VietQR · Không lưu thông tin thẻ hoặc tài khoản ngân hàng. ', h('a', { href: '#/hoan-tien' }, 'Chính sách hoàn tiền')),
    footer());
  paintPlans();
}

/** Payment window: VietQR, bank with its logo, copy buttons, countdown, and it notices the money by itself. */
function payModal(order, plan) {
  document.querySelector('.sheet-bg')?.remove();
  const bank = bankOf(order.bank), hold = (order.holdMinutes || 15) * 60_000;
  const until = Math.max(Date.now() + 60_000, (order.created_at || Date.now()) + hold);
  const clock = h('b', { class: 'clock' }, '--:--'), ring = h('i', { class: 'ringfill' });
  const status = h('p', { class: 'wait',role:'status','aria-live':'polite' }, h('i', { class: 'spin' }), order.auto?' Đang chờ xác nhận thanh toán…':' Chờ quản trị xác nhận chuyển khoản');
  const copy = (text, what) => h('button', { type: 'button', class: 'ghost small copy', onclick: async () => { try { await navigator.clipboard.writeText(text); toast('Đã sao chép ' + what + '.'); } catch { toast('Hãy bôi đen rồi copy.'); } } }, 'Sao chép');
  const close = () => { done = true;clearTimeout(pollTimer);clearTimeout(tickTimer);window.removeEventListener('focus',checkNow);document.removeEventListener('visibilitychange',checkNow);bg.remove(); };
  let done = false,pollTimer,tickTimer,checking=false;
  const checkNow=()=>{if(!document.hidden&&!done){clearTimeout(pollTimer);poll();}};
  const body = h('div', { class: 'paybox' },
    h('div', { class: 'payhead' }, h('div', {}, h('small', { class: 'muted' }, String(order.plan||plan?.id||'').startsWith('solution:')?'Thanh toán giải pháp':'Thanh toán gói'), h('h2', {}, plan?.name || order.planName || '')), h('div', { class: 'timer' }, h('span', { class: 'ring' }, ring), clock)),
    h('div', { class: 'pay' },
      h('div', { class: 'qrwrap' }, h('img', { src: order.qr, alt: 'Mã QR chuyển khoản', width: 240, height: 240 }), h('small', { class: 'muted' }, 'Mở app ngân hàng → Quét mã QR')),
      h('div', { class: 'payinfo' },
        h('div', { class: 'bankrow' }, bankLogo(bank, 44), h('div', {}, h('b', {}, bank.name), h('small', { class: 'muted' }, order.accountName))),
        h('div', { class: 'transfer-row' }, h('span', {}, 'Số tài khoản'), h('b', {}, order.account), copy(order.account, 'số tài khoản')),
        h('div', { class: 'transfer-row' }, h('span', {}, 'Số tiền'), h('b', { class: 'amount' }, money(order.amount)), copy(String(order.amount), 'số tiền')),
        h('div', { class: 'transfer-row' }, h('span', {}, 'Nội dung'), h('b', { class: 'memo' }, order.memo), copy(order.memo, 'nội dung')),
        h('p', { class: 'muted small' }, order.note))),
    status,
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('a', { href: '#/hoan-tien', onclick: close }, 'Chính sách hoàn tiền'),
      h('button', { type: 'button', class: 'ghost small', onclick: async () => { if (!confirm('Huỷ đơn này?')) return;try{await api(`/api/orders/${order.code}/cancel`, { method: 'POST' });close();toast('Đã huỷ đơn.');}catch(e){fail(e);checkNow();} } }, 'Huỷ đơn')));
  const bg = h('div', { class: 'sheet-bg', onclick: (e) => { if (e.target === bg) close(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Thanh toán' }, h('button', { type: 'button', class: 'ghost small close', 'aria-label': 'Đóng', onclick: close }, '✕'), body));
  document.body.append(bg);
  const tick = () => {
    if(!document.body.contains(bg)){close();return;}
    if(done)return;
    const left = until - Date.now();
    if (left <= 0) {
      clock.textContent = '00:00'; ring.style.cssText = 'transform:rotate(0deg)';
      status.replaceChildren('Thời gian hiển thị mã đã hết. Nếu bạn đã chuyển khoản, hãy chờ xác nhận hoặc liên hệ quản trị.');
    } else {
      const m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000);
      clock.textContent = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      ring.style.cssText = `transform:rotate(${360 * (left / hold)}deg)`;
      clock.classList.toggle('low', left < 120_000);
      tickTimer=setTimeout(tick, 1000);
    }
  };
  tick();
  const poll = async () => {
    if(!document.body.contains(bg)){close();return;}
    if(done||checking)return;
    checking=true;
    try{
      const st=await api('/api/orders/'+order.code);
      if(done||!document.body.contains(bg))return;
      if(st.order.status==='paid'){
        done=true;clearTimeout(tickTimer);window.removeEventListener('focus',checkNow);document.removeEventListener('visibilitychange',checkNow);track('pay_done',{plan:order.plan});
        await refreshMemberState().catch(()=>{});
        if(document.body.dataset.page==='goi')await showPlans().catch(()=>{});
        if(String(order.plan||plan?.id||'').startsWith('solution:')){
          if(/^\/giai-phap\//.test(location.pathname)){delete view.dataset.solutionPath;await showSolutionPage();}
          body.replaceChildren(h('div',{class:'success'},h('span',{class:'tick'},'✓'),h('h2',{},'Đã mở khóa giải pháp'),h('p',{class:'muted'},'Thanh toán thành công. Bạn có thể xem hướng dẫn và tải tài nguyên.'),h('button',{type:'button',onclick:()=>{close();const target=plan?.solutionUrl||'/kham-pha';if(location.pathname!==target)navigate(target);}},'Sử dụng giải pháp')));return;
        }
        const isCredit=String(order.plan||plan?.id||'').startsWith('credit:');
        body.replaceChildren(h('div',{class:'success'},h('span',{class:'tick'},'✓'),h('h2',{},'Thanh toán thành công'),h('p',{class:'muted'},isCredit?'Credit đã được cộng vào tài khoản.':'Gói đã được kích hoạt cho tài khoản của bạn.'),h('button',{type:'button',onclick:()=>{close();showAccount();}},'Xem tài khoản'),h('button',{type:'button',class:'ghost',onclick:()=>{close();navigate('#/tao');}},'Tạo video')));
        return;
      }
      if(['cancelled','expired'].includes(st.order.status)){
        done=true;clearTimeout(tickTimer);window.removeEventListener('focus',checkNow);document.removeEventListener('visibilitychange',checkNow);
        body.replaceChildren(h('div',{class:'success'},h('h2',{},st.order.status==='cancelled'?'Đơn đã huỷ':'Đơn đã hết hạn'),h('p',{class:'muted'},'Nếu bạn đã chuyển khoản, hãy liên hệ quản trị kèm mã '+order.code+'.'),h('button',{type:'button',class:'ghost',onclick:close},'Đóng')));return;
      }
      status.replaceChildren(h('i',{class:'spin'}),order.auto?' Đang chờ xác nhận thanh toán…':' Chờ quản trị xác nhận chuyển khoản');
    }catch{if(!done)status.textContent='Chưa kiểm tra được trạng thái. Đang thử kết nối lại…';}
    finally{checking=false;if(!done&&document.body.contains(bg))pollTimer=setTimeout(poll,4000);}
  };
  window.addEventListener('focus',checkNow);document.addEventListener('visibilitychange',checkNow);
  poll();
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
             h('li', {}, 'Tư vấn qua Zalo: ', r.botLink ? h('a', { href: r.botLink, target: '_blank', rel: 'noopener' }, r.botLink) : '(quản trị chưa nhập đường dẫn Zalo)'),
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
  if (!job || job.status !== 'done') { toast('Video chưa sẵn sàng.'); navigate('#/p/' + pid); return; }
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
  show(menuShows('video') ? h('a', { href: '#/video' }, '← Video của tôi') : h('a', { href: '#/' }, '← Trang chủ'),
    h('div', { class: 'watch' + (portrait ? '' : ' wide') },
      h('div', { class: 'stage' }, platformFrame(portrait ? iphone(video) : h('div', { class: 'screen flat' }, video), spec)),
      h('div', { class: 'scenes' },
        h('div', { class: 'card' }, h('span', { class: 'badge' }, '🎉 Đã dựng xong'), h('h1', { style: 'font-size:1.5rem' }, spec.title),
          h('p', { class: 'muted' }, [L('modes', spec.mode || 'hand'), L('styles', spec.style), portrait ? 'Dọc 9:16' : 'Ngang 16:9', 'Dựng lúc ' + fmtDate(job.finished_at || job.created_at)].join(' · ')),
          h('div', { class: 'row' }, h('a', { class: 'btn', href: `/api/jobs/${jobId}/video`, download: true, 'data-ev': 'download' }, '⬇ ' + T('download')),
            V('feature:srt') === 'hidden' ? null : h('a', { class: 'btn ghost', href: `/api/jobs/${jobId}/srt`, download: true, 'data-ev': 'download-srt' }, T('subtitles')),
            h('button', { type: 'button', class: 'btn ghost', 'data-ev': 'send-zalo', onclick: async (e) => {
              // a 7-day link anyone can open; the phone's share sheet lists Zalo, Messenger…
              await busy(e.currentTarget, 'Đang lấy link…', async () => {
                try {
                  const { url } = await api(`/api/jobs/${jobId}/link`);
                  if (navigator.share) { try { await navigator.share({ title: spec.title, text: spec.title, url }); return; } catch (err) { if (err.name === 'AbortError') return; } }
                  await navigator.clipboard.writeText(url).then(() => toast('Đã sao chép link video (7 ngày). Dán vào Zalo để gửi.'), () => prompt('Link video (7 ngày):', url));
                } catch (err) { fail(err); }
              });
            } }, '💬 Gửi qua Zalo'),
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
  let sort = 'new', ratio = '9:16', request = 0;
  const grid = h('div', {}, skeleton(8, 'sk-tall'));
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const q = searchTerm();
  const paintTabs = () => tabs.replaceChildren(...[['9:16', 'Video 9:16'], ['16:9', 'Video 16:9']].map(([k, n]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === ratio), class: 'tab' + (k === ratio ? ' on' : ''), onclick: () => { ratio = k; paintTabs(); load(); } }, n)));
  const sorting = h('select', { 'aria-label': 'Sắp xếp video', onchange: (e) => { sort = e.target.value; load(); } }, h('option', { value: 'new' }, 'Mới nhất'), h('option', { value: 'top' }, 'Nhiều lượt thích'));
  async function load() {
    const ticket = ++request;
    grid.querySelectorAll('video').forEach((v) => v.pause());
    grid.replaceChildren(skeleton(8, 'sk-tall'));
    try {
      const { videos: all } = await api('/api/community?sort=' + sort + '&ratio=' + encodeURIComponent(ratio));
      if (ticket !== request || !grid.isConnected) return;
      const videos = all.filter((v) => (v.ratio === '16:9' ? '16:9' : '9:16') === ratio && matches(q, v.title, v.author));
      grid.replaceChildren(videos.length ? h('div', { class: 'community' + (ratio === '16:9' ? ' landscape' : '') }, videos.map(vcard)) : h('div', { class: 'card empty' }, h('span', { class: 'big-emoji' }, '🌱'), h('p', { class: 'muted' }, q ? 'Không có video nào khớp tìm kiếm.' : 'Chưa có video ' + ratio + ' được chia sẻ.'), h('a', { class: 'btn', href: '#/tao' }, 'Tạo video')));
    } catch (e) { if (ticket === request) grid.replaceChildren(h('p', { class: 'error' }, e.message)); }
  }
  function vcard(v) {
    const vid = h('video', { src: `/api/community/${v.job_id}/video#t=0.5`, muted: true, playsinline: true, loop: true, preload: 'metadata' });
    vid.muted = true;
    const count = h('span', {}, String(v.likes));
    const likeBtn = h('button', { type: 'button', class: 'like' + (v.liked ? ' on' : ''), 'aria-label': 'Thích', onclick: async (e) => {
      e.stopPropagation();
      if (!me) return openLogin('like', { hash: '#/cong-dong' });
      try { const r = await api(`/api/community/${v.job_id}/like`, { method: 'POST', body: { on: !v.liked } }); v.liked = r.liked; v.likes = r.likes; likeBtn.classList.toggle('on', v.liked); count.textContent = ' ' + v.likes; } catch (err) { fail(err); }
    } }, icon('heart'), count);
    const dur = h('span', { class: 'dur', hidden: true });
    vid.addEventListener('loadedmetadata', () => { if (isFinite(vid.duration)) { dur.textContent = `${Math.floor(vid.duration / 60)}:${String(Math.round(vid.duration % 60)).padStart(2, '0')}`; dur.hidden = false; } });
    const who = v.author || 'Ẩn danh';
    const card = h('div', { class: 'vcard' + (v.ratio === '16:9' ? ' wide' : ''), role: 'button', tabindex: 0, 'aria-label': 'Xem ' + v.title, onclick: () => openPlayer(v), onkeydown: (e) => { if (e.key === 'Enter') openPlayer(v); }, onmouseenter: () => vid.play().catch(() => {}), onmouseleave: () => vid.pause() },
      h('div', { class: 'vthumb' }, vid, h('span', { class: 'play' }, '▶'), dur),
      h('div', { class: 'vmeta' }, h('b', { class: 'vtitle' }, v.title),
        h('div', { class: 'vauthor' }, h('span', { class: 'av' }, who.trim().charAt(0).toUpperCase()), h('span', {}, who)),
        h('div', { class: 'vstats' }, h('span', {}, icon('eye'), String(v.views || 0)), likeBtn)));
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
  show(h('header', { class: 'pagehead' }, h('div', {}, h('h1', {}, 'Cộng đồng'), h('p', { class: 'muted' }, 'Khám phá video từ cộng đồng.')),
      h('a', { class: 'btn', href: me && menuShows('video') ? '#/video' : '#/tao', 'data-ev': 'community-share' }, icon('share'), 'Chia sẻ video')),
    h('div', { class: 'gallery-toolbar' }, tabs, sorting), grid, footer());
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
/** Bump when assets/hands/poses changes (tools/hands-build.py). */
const HAND_VERSION = 4;
async function getHand() {
  if (!handAsset) {
    const [img, fingers, meta] = await Promise.all([loadImg('/assets/hands/default/hand.webp'), loadImg('/assets/hands/default/fingers.webp'),
      fetch('/assets/hands/default/hand.json').then((r) => r.json())]);
    handAsset = { img, fingers, meta };
    // the photographed poses of adaptive positioning (the classic hand stays if they fail to load)
    try {
      // versioned addresses: a phone that cached older hand pictures never mixes them with new anchors
      const V = '?v=' + HAND_VERSION, list = await fetch('/assets/hands/poses/poses.json' + V).then((r) => r.json()), B = '/assets/hands/poses/';
      const loaded = await Promise.all(list.map(async (pm) => [pm.id, { meta: pm, img: await loadImg(B + `hand-${pm.id}.webp` + V), fingers: await loadImg(B + `fingers-${pm.id}.webp` + V) }]));
      handAsset.poses = Object.fromEntries(loaded);
    } catch {}
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
  // the list and the timeline follow the new timing; the open scene's fields are left alone (typing)
  const refresh = debounce(() => buildPreview(spec, canvas, playBtn).then(() => { paintList?.(); paintTimeline?.(); }).catch(fail), 350);
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
  // format videos: switch format (the server rebuilds the scene data), colour set, music, sound
  const switchLook = async (k) => {
    try { await save.flush(); const r = await api('/api/projects/' + id, { method: 'PUT', body: { spec: { ...spec, look: k } } }); Object.keys(spec).forEach((x) => delete spec[x]); Object.assign(spec, r.spec); showEditor(id); }
    catch (e) { fail(e); }
  };
  const lookBox = !spec.look ? null : h('div', { class: 'grid wide-2' },
    spec.look === 'doc' ? h('p', { class: 'muted' }, h('b', {}, L('looks', 'doc')), ' (đã trả credit). Muốn định dạng khác, hãy tạo video mới.')
      : h('label', {}, 'Định dạng video', h('select', { onchange: (e) => switchLook(e.target.value) }, !looksOn().includes(spec.look) ? h('option', { value: spec.look, selected: true, disabled: true }, L('looks', spec.look) + ' · dự án cũ') : null, options(looksOn().filter((k) => k !== 'doc').map((k) => [k, L('looks', k), 'look:' + k]), spec.look))),
    (NV.SKINS?.[spec.look] || []).length > 1 ? h('div', {}, h('span', { class: 'plabel' }, 'Bộ màu'), skinChips(spec.look, spec.skin, (n) => { spec.skin = n; changed(); })) : null,
    spec.look === 'split' ? field('Tên bên A', spec.sides?.a, (v) => { (spec.sides ||= { a: '', b: '' }).a = v; changed(); }, { max: 24 }) : null,
    spec.look === 'split' ? field('Tên bên B', spec.sides?.b, (v) => { (spec.sides ||= { a: '', b: '' }).b = v; changed(); }, { max: 24 }) : null,
    spec.look === 'chat' ? field('Tên người nhắn tin', spec.chatName, (v) => { spec.chatName = v; changed(); }, { max: 30 }) : null,
    (ui.music || []).length ? h('label', {}, 'Nhạc nền', h('select', { onchange: (e) => { const m = e.target.value; spec.music = m === 'none' ? undefined : spec.music; if (m !== 'none' && m !== 'keep') toast('Nhạc mới áp dụng khi tạo video mới.'); save(); } }, options([['keep', spec.music ? 'Giữ bản nhạc đã chọn' : 'Không nhạc'], ['none', 'Tắt nhạc']], 'keep'))) : null,
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: spec.sfx !== false, onchange: (e) => { spec.sfx = e.target.checked; save(); } }), 'Tiếng hiệu ứng (vút, bụp, ting…)'));
  const settings = h('div', { class: 'card' },
    lookBox,
    spec.look || spec.creative ? null : h('div', {}, h('span', { class: 'plabel' }, 'Kiểu video'), modePicker(spec.mode || 'hand', (k) => {
      spec.mode = k;
      if (MODE_STYLE[k] && k !== 'hand' && ui.enabledStyles.includes(MODE_STYLE[k]) && ['sunset', 'cosmos', 'manim', 'bold'].includes(spec.style)) spec.style = MODE_STYLE[k];
      changed();
    })),
    spec.creative || V('feature:intro') === 'hidden' || ['director','act','whiteboard','illustrated'].includes(spec.look) ? null : h('label', { class: 'check' }, h('input', { type: 'checkbox', disabled: V('feature:intro') === 'dev', checked: !!spec.intro, onchange: (e) => {
      spec.intro = e.target.checked ? { title: spec.title, badge: BADGES[spec.format] || 'MỚI', icon: spec.scenes.flatMap((sc) => sc.diagram?.items || []).find((it) => it.t === 'icon')?.name } : null;
      paintIntro(); changed();
    } }), h('span', {}, h('b', {}, 'Mở đầu là ảnh bìa thu hút'), helpHint('Ảnh bìa', 'Khung mở đầu chứa tiêu đề dùng làm thumbnail.'))),
    spec.creative || spec.look === 'act' ? null : introBox, spec.creative || ['director','act'].includes(spec.look) ? null : charField,
    !spec.creative && spec.format ? h('p', { class: 'muted' }, 'Dạng video: ', h('b', {}, FORMAT_LABELS[spec.format] || spec.format)) : null,
    h('div', { class: 'grid' },
      spec.look || spec.creative ? null : h('label', {}, 'Phong cách', h('select', { onchange: (e) => { spec.style = e.target.value; delete spec.tool; changed(); } }, options(styleOptions().concat(styleOptions().some(([k]) => k === spec.style) ? [] : [[spec.style, L('styles', spec.style)]]), spec.style))),
      spec.look || spec.creative ? null : h('label', {}, 'Dụng cụ vẽ', h('select', { onchange: (e) => { if (e.target.value) spec.tool = e.target.value; else delete spec.tool; changed(); } },
        options([['', 'Theo phong cách'], ...Object.entries(ui.labels.tools).map(([k, v]) => [k, v, 'tool:' + k])], spec.tool || ''))),
      spec.look || spec.creative ? null : h('label', {}, 'Chuyển cảnh', h('select', { onchange: (e) => { spec.transition = e.target.value; changed(); } }, options([['auto', 'Tự động, đa dạng'], ['fade', 'Mờ dần'], ['slide', 'Trượt ngang'], ['wipe', 'Bàn tay xoá bảng'], ['zoom', 'Phóng to']], spec.transition || 'auto'))),
      h('label', {}, T('voice'), voiceField(h('select', { onchange: (e) => { spec.voice.voiceId = e.target.value; save(); } }, options(voiceOptions(), spec.voice?.voiceId || ui.defaults.voice)),{get:()=>({speed:spec.voice?.speed||1,audio:spec.audio||{voice:'tts'}}),apply:r=>{spec.voice.speed=r.speed;spec.audio=r.audio;save();}})),

      audioBox(spec, save),
      h('label', {}, 'Tên kênh', h('input', { value: spec.channel || '', maxlength: 40, oninput: (e) => { spec.channel = e.target.value; changed(); } })),
      h('label', {}, 'Số tập', h('input', { value: spec.episode || '', maxlength: 30, oninput: (e) => { spec.episode = e.target.value; changed(); } })),
      V('feature:subtitles') === 'hidden' ? null : h('label', { class: 'check' }, h('input', { type: 'checkbox', disabled: V('feature:subtitles') === 'dev', checked: spec.look && spec.look!=='whiteboard' ? spec.subtitles !== false : !!spec.subtitles, onchange: (e) => { spec.subtitles = e.target.checked; changed(); } }), T('subsOnPicture'))));

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
    return h('div', { class: 'panel' }, h('span', { class: 'tag' }, spec.creative?'Thiết kế AI':'Bàn tay vẽ từng nét'),
      spec.creative?null:h('div', { class: 'grid' }, h('label', {}, 'Kiểu hình', kind), d.kind === 'sketch' ? null : field('Tiêu đề (không bắt buộc)', d.title, (v) => set('title', v), { max: 60 })), ...fields);
  }
  /** Fields of one scene's format data; anything left empty is filled from the words when the scene is redesigned. */
  function lookEditor(sc) {
    if (spec.look === 'director') {
      const d = sc.direction;
      if (!d) return h('p', { class: 'muted' }, 'Lưu cảnh để thiết kế bố cục.');
      return h('div', { class: 'direction-editor' },
        h('div', { class: 'row' }, h('b', {}, 'Thiết kế cảnh'), helpHint('Ý đồ cảnh', d.meaning || 'Bố cục riêng theo lời đọc.')),
        field('Tiêu đề trên hình', d.title, (v) => { d.title = v; changed(); }, { max: 56 }),
        ...d.nodes.map((n, i) => h('details', { class: 'advanced' }, h('summary', {}, 'Hình ' + (i + 1) + ': ' + n.label),
          field('Nhãn', n.label, (v) => { n.label = v; changed(); }, { max: 56 }),
          h('div', { class: 'grid wide-2' }, ...['x','y','w','h'].map((k) => field(({x:'Vị trí ngang',y:'Vị trí dọc',w:'Chiều rộng',h:'Chiều cao'})[k] + ' (%)', n[k], (v) => { if (Number.isFinite(Number(v))) { n[k] = Number(v); changed(); } }, { max: 5 }))))),
        h('button', { type: 'button', class: 'ghost small', onclick: () => redesign(sc) }, 'Thiết kế lại theo lời'));
    }

    const x = (sc.x ||= {}), set = (k, v) => { if (v === '' || v == null) delete x[k]; else x[k] = v; changed(); };
    const icon = (label, k) => field(label + ' (tên hình tiếng Anh, vd pig-money)', x[k], (v) => set(k, v.trim().toLowerCase() || undefined), { max: 40 });
    const actions = (label, k) => h('label', {}, label, h('select', { onchange: (e) => set(k, e.target.value || undefined) }, options([['', 'Tự chọn'], ...Object.entries(ui.labels.actions)], x[k] || '')));
    const f = [];
    if(spec.look==='whiteboard'){
      const d=(sc.whiteboard ||= sc.x?.whiteboard||{title:'',objects:[]});
      f.push(field('Tiêu đề trên bảng',d.title,v=>{d.title=v;changed();},{max:90}));
      d.objects.forEach((o,i)=>f.push(h('div',{class:'grid'},field(`Nhãn hình ${i+1}`,o.label,v=>{o.label=v;changed();},{max:60}),
        h('label',{},'Màu hình',h('input',{type:'color',value:o.color||'#7155bd',onchange:e=>{o.color=e.target.value;changed();}})))));
    }
    if (spec.look === 'kinetic') f.push(icon('Hình chính', 'icon'), field('Từ cần nhấn (cách nhau bởi dấu phẩy)', (x.keys || []).join(', '), (v) => set('keys', v.split(',').map((t) => t.trim()).filter(Boolean)), { max: 120 }));
    if (spec.look === 'split') f.push(field('Bên A làm gì', x.a, (v) => set('a', v), { max: 60 }), field('Bên B làm gì', x.b, (v) => set('b', v), { max: 60 }),
      field('Kết quả bên A (vd 0đ)', x.aValue, (v) => set('aValue', v), { max: 18 }), field('Kết quả bên B (vd 36 triệu)', x.bValue, (v) => set('bValue', v), { max: 18 }),
      icon('Hình bên A', 'aIcon'), icon('Hình bên B', 'bIcon'), actions('Động tác bên A', 'aAction'), actions('Động tác bên B', 'bAction'));
    if (spec.look === 'chat') {
      const msgs = x.chat?.length ? x.chat : sc.lines.map((t, i) => ({ who: i % 2 ? 'b' : 'a', text: t }));
      f.push(...msgs.map((m, i) => h('label', {}, `Tin ${i + 1}: ai gửi`, h('select', { onchange: (e) => { msgs[i].who = e.target.value; set('chat', msgs.map((q) => ({ ...q }))); } }, options([['a', spec.chatName || 'Người kia'], ['b', 'Mình']], m.who)))),
        field('Thẻ bài học (để trống = không có)', x.card, (v) => set('card', v), { max: 160 }));
    }
    if (spec.look === 'story') f.push(field('Nơi chốn', x.place?.label, (v) => set('place', v ? { icon: x.place?.icon || 'home', label: v } : undefined), { max: 16 }),
      field('Hình biển hiệu (vd briefcase, coffee, building-bank)', x.place?.icon, (v) => set('place', { label: x.place?.label || 'Nơi này', icon: v.trim().toLowerCase() || 'home' }), { max: 40 }),
      actions('Động tác', 'action'), field('Nhân vật nói', x.say, (v) => set('say', v), { max: 60 }),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!x.money, onchange: (e) => set('money', e.target.checked || undefined) }), 'Tiền bay khỏi ví'));
    if (spec.look === 'data') {
      const st = x.stat || { value: 0, unit: '', label: '' };
      const put = () => set('stat', st.value || st.parts?.length ? { ...st } : undefined);
      f.push(field('Con số chính', st.value || '', (v) => { st.value = Number(String(v).replace(/\./g, '').replace(',', '.')) || 0; put(); }, { max: 18 }),
        field('Đơn vị (đ, triệu, %…)', st.unit, (v) => { st.unit = v; put(); }, { max: 10 }), field('Con số này là gì', st.label, (v) => { st.label = v; put(); }, { max: 40 }),
        field('Chia phần (mỗi dòng "tên: số")', (st.parts || []).map((p) => `${p.label}: ${p.value}`).join('\n'), (v) => {
          st.parts = v.split('\n').map((l) => l.split(':')).filter((p) => p.length === 2 && p[0].trim()).map(([a, b]) => ({ label: a.trim(), value: Number(b.replace(/\./g, '').replace(',', '.')) || 0 })).slice(0, 5);
          if (st.parts.length < 2) delete st.parts; put();
        }, { area: true, max: 300 }));
    }
    if (spec.look === 'quiz' && !x.quiz) f.push(h('button', { type: 'button', class: 'ghost small', onclick: () => { x.quiz = { q: sc.lines[0] || '', options: [], answer: 0 }; sc.pause = 3; drawScenes(); changed(); } }, 'Biến cảnh này thành câu đố'));
    if (spec.look === 'quiz' && x.quiz) {
      const q = x.quiz;
      const put = () => set('quiz', q.q ? { ...q } : undefined);
      f.push(field('Câu hỏi', q.q, (v) => { q.q = v; put(); }, { max: 160 }),
        field('Các đáp án (cách nhau bởi dấu phẩy)', q.options.join(', '), (v) => { q.options = v.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 4); put(); }, { max: 200 }),
        h('label', {}, 'Đáp án đúng', h('select', { onchange: (e) => { q.answer = Number(e.target.value); put(); } }, options(q.options.map((o, i) => [String(i), o]), String(q.answer)))),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!q.reveal, onchange: (e) => { q.reveal = e.target.checked || undefined; put(); } }), 'Đây là cảnh lật đáp án'),
        h('label', {}, 'Đếm ngược sau câu hỏi', h('select', { onchange: (e) => { sc.pause = Number(e.target.value) || undefined; changed(); } }, options([['0', 'Không'], ['3', '3 giây']], String(sc.pause ? 3 : 0)))));
    }
    return h('div', { class: 'panel' }, h('span', { class: 'tag' }, L('looks', spec.look)), h('div', { class: 'grid wide-2' }, ...f),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'ghost small', 'data-ev': 'redesign', onclick: () => redesign(sc) }, 'AI thiết kế lại cảnh')));
  }
  // AI redesign keeps the current scene intact until the server validates a replacement.
  async function redesign(sc) {
    try {
      await save.flush();
      const r = await api(`/api/projects/${id}/compose`, { method: 'POST', body: { scene: spec.scenes.indexOf(sc) } });
      Object.assign(spec, r.spec); drawScenes(); refresh();
    } catch (e) { fail(e); }
  }
  const ITEM_NAMES = { vector:'Hình AI tự vẽ', text: 'Chữ', icon: 'Hình', person: 'Người que', chart: 'Biểu đồ', image: 'Ảnh thật', qr: 'Mã QR' };
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
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'ghost small', 'data-ev': 'redesign', onclick: () => redesign(sc) }, 'AI thiết kế lại cảnh')));
  }
  function illustratedEditor(sc,si){
    const d=sc.illustrated;if(!d)return h('p',{},'Cảnh chưa có thiết kế.');
    return h('div',{},h('span',{class:'tag'},'Hoạt hình minh họa nhiều lớp'),
      field('Tiêu đề trên hình',d.headline,v=>{d.headline=v;changed();},{max:80}),
      field('Từ nhấn',d.emphasis,v=>{d.emphasis=v;changed();},{max:30}),
      h('label',{},'Bố cục',h('select',{onchange:e=>{d.layout=e.target.value;changed();}},options([['duo','Nhân vật và đạo cụ'],['reverse','Đảo vị trí'],['hero','Một hình chính'],['trio','Ba lớp']],d.layout))),
      h('label',{},'Màu nhấn',h('input',{type:'color',value:d.accent,oninput:e=>{d.accent=e.target.value;changed();}})),
      h('div',{class:'panels'},sc.panels.map((p,pi)=>{
        const layer=d.layers[pi],img=h('img',{src:imageUrl(p.image)||BLANK,alt:layer.role==='character'?'Nhân vật':'Minh họa ý'});panelImgs.set(`${si}:${pi}`,img);
        const btn=h('button',{type:'button',class:'small',hidden:!imageAI,onclick:()=>drawPanel(si,pi,btn)},p.image?'Vẽ lại lớp này':'Vẽ lớp này');
        return h('div',{class:'panel'},img,field('Mô tả hình',p.prompt,v=>{p.prompt=v;layer.prompt=v;changed();},{area:true,max:900}),
          field('Xuất hiện khi đọc cụm từ',layer.cue,v=>{layer.cue=v;changed();},{max:80}),
          h('label',{},'Câu thoại',h('select',{onchange:e=>{layer.line=Number(e.target.value);changed();}},options(sc.lines.map((_,k)=>[String(k),`Câu ${k+1}`]),String(layer.line)))),
          h('label',{},'Chuyển động vào',h('select',{onchange:e=>{layer.enter=e.target.value;changed();}},options([['rise','Đi lên nhẹ'],['pop','Nhấn xuất hiện'],['slide','Trượt nhẹ'],['fade','Mờ dần']],layer.enter))),btn);
      })));
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
    spec.scenes.forEach((sc, si) => sc.panels.forEach((p, pi) => { if (!sc.diagram && !/^(r2|doodle|peep):/.test(p.image || '')) todo.push([si, pi]); }));
    if (!todo.length) return true;
    if (!imgProvider.options.length || !imageAI) {
      if(spec.look==='illustrated'){toast('Cần ảnh cho từng lớp. Hãy bật API tạo ảnh hoặc chọn phong cách khác. Kịch bản đã lưu vẫn được giữ.');return false;}
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
  // the editor shows one scene at a time (picked in the list or on the timeline)
  let cur = 0;
  const move = (si, d) => { const j = si + d; [spec.scenes[si], spec.scenes[j]] = [spec.scenes[j], spec.scenes[si]]; cur = j; drawScenes(); changed(); };
  const sceneCard = (sc, si) => h('div', { class: 'scene' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, `Cảnh ${si + 1}`),
        h('div', { class: 'row' },
          !spec.creative && !spec.look && (imageAI || !sc.diagram) ? h('button', { type: 'button', class: 'ghost small', onclick: () => {
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
      spec.look==='illustrated'?illustratedEditor(sc,si):spec.look && spec.look !== 'doc' ? lookEditor(sc) : sc.diagram ? diagramEditor(sc) : h('div', { class: 'panels' }, sc.panels.map((p, pi) => {
        const img = h('img', { src: imageUrl(p.image) || BLANK, alt: p.prompt || 'Chưa có tranh' });
        panelImgs.set(`${si}:${pi}`, img);
        const btn = h('button', { type: 'button', class: 'small', hidden: !imageAI, onclick: () => drawPanel(si, pi, btn) }, p.image?.startsWith('r2:') ? 'Vẽ lại bằng AI' : 'Vẽ bằng AI');
        // the free picture library (Open Doodles): pick another without any AI
        const pickDoodle = (ui.doodles || []).length ? h('label', {}, 'Đổi tranh (thư viện miễn phí)', h('select', { onchange: (e) => { p.image = 'doodle:' + e.target.value; img.src = imageUrl(p.image); changed(); } },
          options([...(p.image?.startsWith('doodle:') ? [] : [['', '— chọn tranh —']]), ...ui.doodles.map((n) => [n, n.replace(/Doodle$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')])], p.image?.startsWith('doodle:') ? p.image.slice(7) : ''))) : null;
        if (p.image?.startsWith('peep:')) {
          // a hand-drawn person: its thumbnail is drawn by the engine
          loadPeeps().then(() => { const cv = NV.peepPanel({ createCanvas: (w, hh) => Object.assign(document.createElement('canvas'), { width: w, height: hh }) }, p.image, 320, 240); if (cv) img.src = cv.toDataURL(); });
          return h('div', { class: 'panel' }, img, h('span', { class: 'tag' }, 'Nhân vật vẽ tay · hiện khi đọc câu ' + ((p.line ?? pi) + 1)), pickDoodle, btn);
        }
        if (p.image?.startsWith('doodle:')) return h('div', { class: 'panel' }, img, h('span', { class: 'tag' }, 'Tranh vẽ tay · hiện khi đọc câu ' + ((p.line ?? pi) + 1)), pickDoodle, btn);
        return h('div', { class: 'panel' }, img, pickDoodle,
          h('span', { class: 'tag' }, p.image?.startsWith('r2:') ? 'Tranh AI' : 'Chưa có tranh: chọn trong thư viện hoặc vẽ bằng AI'),
          h('label', {}, spec.look === 'doc' ? 'Mô tả ảnh (tiếng Anh: bối cảnh, ánh sáng, góc máy)' : 'Mô tả hình (tiếng Anh cho AI vẽ)', h('textarea', { rows: 2, maxlength: 400, value: p.prompt,
            oninput: (e) => { p.prompt = e.target.value; save(); } })),
          btn);
      })));
  const addRow = () => h('div', { class: 'row' },
        h('button', { type: 'button', class: 'ghost', 'data-ev': 'add-scene', onclick: () => {
          if (spec.look) { spec.scenes.push({ lines: ['Câu thoại mới.'], panels: spec.look === 'doc' ? [{ prompt: '', image: '' }] : [] }); drawScenes(); changed(); return; }
          spec.scenes.push({ lines: ['Câu thoại mới.'], panels: [], diagram: { kind: 'statement', text: 'Câu chốt' } }); drawScenes(); changed();
          redesign(spec.scenes[spec.scenes.length - 1]);
        } }, '+ Thêm cảnh'),
        drawAllBtn);
  const sceneList = h('ol', { class: 'slist', 'aria-label': 'Danh sách cảnh' });
  const sceneDetail = h('div', { class: 'sdetail' });
  const listHead = h('h2', {});
  const thumbs = [];
  const fmtT = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const sceneSpan = (si) => pv?.model?.timeline?.scenes?.[si];
  function selectScene(si, seek = true) {
    cur = Math.max(0, Math.min(spec.scenes.length - 1, si));
    if (seek && pv && sceneSpan(cur)) pv.t = sceneSpan(cur).start + 0.05;
    sceneList.querySelectorAll('li').forEach((li, k) => li.classList.toggle('on', k === cur));
    sceneDetail.replaceChildren(sceneCard(spec.scenes[cur], cur), addRow());
    paintTimeline();
  }
  function drawScenes() {
    panelImgs.clear();
    drawAllBtn.hidden = !imageAI || (spec.look && !['doc','illustrated'].includes(spec.look)) || !spec.scenes.some((sc) => !sc.diagram && sc.panels.some((p) => !/^(r2|doodle|peep):/.test(p.image || '')));
    paintList();
    cur = Math.min(cur, spec.scenes.length - 1);
    sceneDetail.replaceChildren(sceneCard(spec.scenes[cur], cur), addRow());
    paintTimeline();
  }
  function paintList() {
    listHead.textContent = `Danh sách cảnh (${spec.scenes.length})`;
    thumbs.length = 0;
    sceneList.replaceChildren(...spec.scenes.map((sc, si) => {
      const th = h('canvas', { class: 'sthumb', 'aria-hidden': 'true' }); thumbs.push(th);
      const span = sceneSpan(si);
      return h('li', { class: si === cur ? 'on' : '' }, h('button', { type: 'button', class: 'sitem', 'aria-label': `Cảnh ${si + 1}: ${sc.lines[0] || ''}`, onclick: () => selectScene(si) },
        h('span', { class: 'snum' }, String(si + 1)), th,
        h('span', { class: 'stext' }, h('b', {}, sc.lines[0] || 'Cảnh ' + (si + 1)), h('small', {}, span ? `${fmtT(span.start)} – ${fmtT(span.end)}` : ''))));
    }));
    paintThumbs();
  }
  // a still of each scene (its last drawn moment) for the list
  function paintThumbs() {
    const m = pv?.model; if (!m) return;
    const off = document.createElement('canvas'); off.width = canvas.width; off.height = canvas.height;
    const octx = off.getContext('2d');
    thumbs.forEach((th, si) => {
      const span = m.timeline.scenes[si]; if (!span) return;
      th.width = 96; th.height = Math.round(96 * off.height / off.width);
      try { paintFrame(octx, m, Math.max(span.start + 0.1, span.end - 0.35), { hand: false }); th.getContext('2d').drawImage(off, 0, 0, th.width, th.height); } catch {}
    });
  }
  // ---- timeline: scenes, words, pictures, music, voice; a playhead that follows the preview
  const tl = h('div', { class: 'tl', role: 'group', 'aria-label': 'Dòng thời gian' });
  const tlRuler = h('div', { class: 'tl-ruler' }), tlHead = h('i', { class: 'tl-head', 'aria-hidden': 'true' });
  const lanes = { scene: h('div', { class: 'tl-lane' }), text: h('div', { class: 'tl-lane' }), image: h('div', { class: 'tl-lane' }), music: h('div', { class: 'tl-lane' }), voice: h('div', { class: 'tl-lane voice' }) };
  const LANE_NAMES = [['scene', 'Cảnh', 'film'], ['text', 'Văn bản', 'pen'], ['image', 'Hình ảnh', 'library'], ['music', 'Âm thanh', 'spark'], ['voice', 'Giọng đọc', 'users']];
  tl.append(h('div', { class: 'tl-names' }, h('span', {}), ...LANE_NAMES.map(([, n, i]) => h('span', {}, icon(i), n))),
    h('div', { class: 'tl-body', onclick: (e) => {
      const r = e.currentTarget.getBoundingClientRect(), d = pv?.model?.timeline?.duration; if (!d) return;
      const t = Math.max(0, Math.min(d, (e.clientX - r.left) / r.width * d)); pv.t = t;
      const si = pv.model.timeline.scenes.findIndex((x) => t >= x.start && t < x.end); if (si >= 0 && si !== cur) selectScene(si, false);
    } }, tlRuler, ...Object.values(lanes), tlHead));
  function paintTimeline() {
    const T = pv?.model?.timeline; if (!T) return;
    const D = T.duration || 1, pct = (t) => (t / D * 100).toFixed(3) + '%';
    const box = (a, b, cls, label, si) => h('span', { class: 'tl-box ' + cls + (si === cur ? ' on' : ''), style: `left:${pct(a)};width:calc(${pct(Math.max(0.05, b - a))} - 2px)`, title: label }, label);
    const step = D > 120 ? 30 : D > 40 ? 10 : 5;
    tlRuler.replaceChildren(...Array.from({ length: Math.floor(D / step) + 1 }, (_, k) => h('span', { style: `left:${pct(k * step)}` }, fmtT(k * step))));
    lanes.scene.replaceChildren(...T.scenes.map((x, si) => box(x.start, x.end, 'sc', `Cảnh ${si + 1}`, si)));
    lanes.text.replaceChildren(...T.scenes.flatMap((x, si) => (x.lines || []).map((l, li) => box(l.start, l.end, 'tx', spec.scenes[si]?.lines[li] || '', si))));
    lanes.image.replaceChildren(...T.scenes.map((x, si) => { const sc = spec.scenes[si] || {}; return box(x.start, x.end, 'im', sc.diagram ? (ui.labels.kinds?.[sc.diagram.kind] || 'Bảng vẽ') : spec.look ? lookName(spec.look) : `${(sc.panels || []).length} hình`, si); }));
    lanes.music.replaceChildren(spec.music ? h('span', { class: 'tl-box mu', style: 'left:0;width:100%' }, 'Nhạc nền') : h('span', { class: 'tl-empty' }, 'Không có nhạc nền'));
    // the preview has no sound: the voice lane shows when each sentence is read
    lanes.voice.replaceChildren(...T.scenes.flatMap((x) => (x.lines || []).map((l) => h('span', { class: 'tl-wave', style: `left:${pct(l.start)};width:${pct(Math.max(0.05, l.end - l.start))}` }))));
  }
  const clock = h('span', { class: 'clock' }, '00:00 / 00:00');
  function follow() {
    if (!tl.isConnected) return;
    const T = pv?.model?.timeline;
    if (T) {
      tlHead.style.left = (pv.t / (T.duration || 1) * 100) + '%';
      clock.textContent = `${fmtT(pv.t)} / ${fmtT(T.duration)}`;
      const si = T.scenes.findIndex((x) => pv.t >= x.start && pv.t < x.end);
      sceneList.querySelectorAll('li').forEach((li, k) => li.classList.toggle('now', k === si));
    }
    requestAnimationFrame(follow);
  }
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
      if(ui.rendering?.mode==='browser'){stopPreview();const {openBrowserRender}=await import('/browser-render.js?v=24');await openBrowserRender(spec,id,{h,previewModel,paintFrame,NV,onClose:()=>{if(canvas.isConnected)buildPreview(spec,canvas,playBtn).catch(fail);}});return;}
      const { job } = await api(`/api/projects/${id}/render`, { method: 'POST' }); toast(job.note || 'Đã xếp video vào hàng chờ dựng.'); RenderDesk.open(spec, id, job.id).catch(fail); pollJobs();
      me = await api('/api/me').catch(() => me);
    }
    catch (e) { fail(e); }
    finally { renderBtn.disabled = false; }
  } }, ui.rendering?.mode==='browser'?'Xuất trên trình duyệt':ui.rendering?.mode==='local'?'Gửi máy cá nhân':T('render'));
  let pollTimer;
  async function pollJobs() {
    clearTimeout(pollTimer);
    // the export tab may be closed: keep following while the editor is open
    if (!document.querySelector('.studio')) return;
    let jobs, queueLength;
    try { ({ jobs, queueLength } = await api(`/api/projects/${id}/jobs`)); } catch (error) { jobsBox.replaceChildren(h('p', { class: 'error' }, 'Chưa đọc được trạng thái: ' + error.message)); pollTimer = setTimeout(pollJobs, 4000); return; }
    const wasRunning = jobsBox.dataset.running === '1', running = jobs.some((j) => j.status === 'queued' || j.status === 'running');
    jobsBox.dataset.running = running ? '1' : '';
    // the moment a render finishes, take the user to watch it
    if (wasRunning && !running && jobs[0]?.status === 'done' && !document.querySelector('dialog.render-desk[open]')) { toast('🎉 Video đã dựng xong!'); navigate(`#/xem/${id}/${jobs[0].id}`); return; }
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
      paintFrame(c.getContext('2d'), m, spec.intro?.title ? 0 : Math.max(0.5, m.timeline.scenes[0].end - 0.45), { hand: false });
      c.toBlob((b) => { const a = h('a', { href: URL.createObjectURL(b), download: (spec.title || 'anh-bia').slice(0, 60) + '.png' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }, 'image/png');
    } catch (e) { fail(e); }
  } }, 'Tải ảnh bìa' + (coverVis === 'dev' ? DEV : ''));
  const dupBtn = dupVis === 'hidden' ? null : h('button', { type: 'button', class: 'ghost small', disabled: dupVis === 'dev', 'data-ev': 'duplicate', onclick: async () => {
    try { await save.flush(); const r = await api(`/api/projects/${id}/duplicate`, { method: 'POST', body: { ratio: spec.ratio === '9:16' ? '16:9' : '9:16' } }); navigate('#/p/' + r.id); toast('Đã tạo bản ' + (spec.ratio === '9:16' ? 'ngang' : 'dọc') + '.'); }
    catch (e) { fail(e); }
  } }, (spec.ratio === '9:16' ? 'Tạo bản ngang' : 'Tạo bản dọc') + (dupVis === 'dev' ? DEV : ''));
  const delBtn = h('button', { type: 'button', class: 'ghost small danger', 'data-ev': 'delete', onclick: async () => {
    if (!confirm('Xoá video này? Không khôi phục được.')) return;
    try { await api('/api/projects/' + id, { method: 'DELETE' }); navigate('#/'); } catch (e) { fail(e); }
  } }, 'Xoá video');

  const reviewBtn = spec.look !== 'director' ? null : h('button', { type: 'button', class: 'ghost small', onclick: () => busy(reviewBtn, 'Đang rà soát…', async () => {
    try {
      await save.flush();
      const current = await api('/api/projects/' + id), snapshot = JSON.stringify(spec);
      const m = await previewModel(current.spec, 0.6), cv = document.createElement('canvas');
      cv.width = Math.round(m.W * 0.6); cv.height = Math.round(m.H * 0.6);
      const count = Math.min(6, m.timeline.scenes.length), frames = [];
      for (let i = 0; i < count; i++) {
        const k = Math.round(i * (m.timeline.scenes.length - 1) / Math.max(1, count - 1)), timing = m.timeline.scenes[k];
        paintFrame(cv.getContext('2d'), m, Math.max(timing.start, timing.end - 0.25));
        frames.push(cv.toDataURL('image/jpeg', 0.7));
      }
      const result = await api(`/api/projects/${id}/review-direction`, { method: 'POST', body: { frames, updatedAt: current.updated_at } });
      if (snapshot !== JSON.stringify(spec)) { toast('Bạn đã chỉnh video trong lúc rà soát. Hãy rà soát lại bản mới.'); return; }
      const dialog = h('dialog', { class: 'help-dialog', 'aria-labelledby': 'review-title' },
        h('h2', { id: 'review-title' }, 'Đề xuất sau rà soát'),
        h('p', { class: 'description' }, 'AI đã xem ' + frames.length + ' khung hình. Áp dụng để cập nhật thiết kế; lời đọc được giữ nguyên.'),
        h('ul', {}, result.notes.map((n) => h('li', {}, n))),
        h('div', { class: 'row' }, h('button', { type: 'button', onclick: async () => {
          if (snapshot !== JSON.stringify(spec)) { dialog.close(); toast('Video đã thay đổi. Hãy rà soát lại.'); return; }
          const previous = JSON.parse(JSON.stringify(spec.scenes));
          spec.scenes.forEach((sc, i) => { sc.direction = result.scenes[i].direction; });
          try { const r = await api('/api/projects/' + id, { method: 'PUT', body: { spec, expectedUpdatedAt: current.updated_at } }); Object.assign(spec, r.spec); dialog.close(); drawScenes(); refresh(); }
          catch (e) { spec.scenes = previous; fail(e); }
        } }, 'Áp dụng'), h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Giữ bản hiện tại')));
      dialog.addEventListener('close', () => dialog.remove(), { once: true }); document.body.append(dialog); dialog.showModal();
    } catch (e) { fail(e); }
  }) }, 'AI rà soát');
  const screenEl = h('div', { class: 'screen flat stage-screen' + (spec.ratio === '16:9' ? ' wide' : '') }, canvas);
  playBtn.addEventListener('click', () => { if (!pv) return; pv.playing = !pv.playing; playBtn.textContent = pv.playing ? 'Tạm dừng' : 'Phát'; });
  const exportCard = h('div', { class: 'card' }, h('h2', {}, T('export')), h('div', { class: 'row' }, imgProvider), jobsBox, h('div', { class: 'row' }, coverBtn, dupBtn, delBtn));
  // right panel: the open scene, the whole video's settings, export and posting
  const TABS = [['scene', 'Cảnh', sceneDetail], ['video', 'Video', settings], ['out', 'Xuất & đăng', h('div', { class: 'scenes' }, exportCard, postCard)]];
  let tab = 'scene';
  const tabBar = h('div', { class: 'ptabs', role: 'tablist' }), tabBody = h('div', { class: 'pbody' });
  const paintTabs = () => {
    tabBar.replaceChildren(...TABS.map(([k, n]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === tab), class: k === tab ? 'on' : '', onclick: () => { tab = k; paintTabs(); } }, n)));
    tabBody.replaceChildren(TABS.find(([k]) => k === tab)[2]);
  };
  paintTabs();
  const titleInput = h('input', { class: 'ptitle', value: spec.title, maxlength: 100, 'aria-label': 'Tên dự án', oninput: (e) => { spec.title = e.target.value; save(); } });
  const ratioSel = h('select', { 'aria-label': 'Khung hình', onchange: (e) => { spec.ratio = e.target.value; save.flush().then(() => showEditor(id)); } }, options(ratioOptions(false), spec.ratio));
  const {creativePanel}=await import('/creative-panel.js');
  const creativeCard=creativePanel(spec,id,{h,api,busy,fail,save,helpHint,refresh:()=>showEditor(id)});
  renderBtn.classList.add('export-btn'); renderBtn.replaceChildren(icon('share'), ui.rendering?.mode==='browser'?'Xuất trên trình duyệt':ui.rendering?.mode==='local'?'Gửi máy cá nhân':'Xuất video');
  show(h('div', { class: 'studio' + (spec.ratio === '16:9' ? ' landscape' : '') },
    h('div', { class: 'sbar' }, h('a', { class: 'iconbtn', href: myVideos(), 'aria-label': T('allVideos') }, '←'), h('span', { class: 'muted' }, 'Dự án:'), titleInput, status, h('span', { class: 'grow' }), ratioSel, reviewBtn, reviewBtn ? helpHint('AI rà soát', 'Dùng 1 lượt AI và chi phí API theo gói. AI xem tối đa 6 khung hình để đề xuất sửa bố cục; bạn xem nhận xét và chọn áp dụng. Không kiểm tra toàn bộ chuyển động hoặc âm thanh.') : null, renderBtn),
    h('aside', { class: 'scol' }, listHead, sceneList, h('button', { type: 'button', class: 'ghost small', onclick: () => sceneDetail.querySelector('[data-ev="add-scene"]')?.click() }, icon('plus'), 'Thêm cảnh')),
    h('section', { class: 'stage' }, platformFrame(screenEl, spec),
      h('div', { class: 'transport' }, playBtn, h('button', { type: 'button', class: 'ghost small', onclick: () => { if (pv) { pv.t = 0; pv.playing = true; playBtn.textContent = 'Tạm dừng'; } } }, 'Phát lại'), clock),
      helpHint('Bản xem trước', 'Bản xem trước không có tiếng; thời điểm xuất hiện được ước tính theo độ dài câu. Bản xuất căn theo thời lượng lời đọc; đồng bộ từng từ phụ thuộc nhà cung cấp giọng.')),
    h('section', { class: 'pcol' }, creativeCard, tabBar, tabBody),
    tl));
  await buildPreview(spec, canvas, playBtn);
  drawScenes();
  requestAnimationFrame(follow);
  pollJobs();
  let auto = false;
  try { auto = sessionStorage.getItem('autodraw:' + id) === '1'; sessionStorage.removeItem('autodraw:' + id); } catch {}
  if (auto && imageAI && imgProvider.options.length && spec.scenes.some((sc) => !sc.diagram && sc.panels.some((p) => p.prompt && !p.image))) drawAll();
}

const blankCanvas = () => Object.assign(document.createElement('canvas'), { width: 4, height: 3 });
let sansReady = null;
/** The modern sans the motion / maths / kinetic modes and the title card draw with. */
const loadSans = () => (sansReady ||= (async () => { try { const f = new FontFace(NV.SANS, 'url(/assets/fonts/BeVietnamPro-ExtraBold.ttf)'); await f.load(); document.fonts.add(f); } catch {} })());
let peepsReady = null;
/** The hand-drawn people of story animation (Open Peeps), fetched once. */
const loadPeeps = () => (peepsReady ||= fetch('/assets/peeps/peeps.json').then((r) => r.json()).then((d) => NV.setPeeps(d)).catch(() => { peepsReady = null; }));
async function previewModel(spec, dpr, timelineOverride) {
  const entries = Object.entries(spec.media || {});
  const [images, hand, icons, pics] = await Promise.all([
    Promise.all(spec.scenes.map((sc) => Promise.all(sc.panels.map((p) => (imageUrl(p.image) ? loadImg(imageUrl(p.image)).catch(blankCanvas) : Promise.resolve(blankCanvas())))))),
    spec.creative && spec.mode!=='hand'?Promise.resolve({}):getHand(), spec.creative?Promise.resolve({}):getIcons(), Promise.all(entries.map(([, v]) => loadImg(mediaUrl(v)).catch(() => null))),
    document.fonts.load('29px Pangolin').catch(() => {}), spec.look==='whiteboard'?document.fonts.load('36px "WB Hand"'):null, loadSans(), !spec.creative && spec.figures !== 'rig' && (spec.look === 'act' || !spec.look) ? loadPeeps() : null,
  ]);
  const media = Object.fromEntries(entries.map(([k], i) => [k, pics[i]]).filter(([, v]) => v));
  const timeline = timelineOverride || NV.buildTimeline(spec.scenes, spec.scenes.map((s) => NV.estimateVoice(s.lines)), { intro: !!spec.intro?.title && spec.look !== 'act' });
  const env = { createCanvas: (w, hgt) => { const c = document.createElement('canvas'); c.width = w; c.height = hgt; return c; } };
  if(spec.look==='illustrated')return {...FVIllustrated.prepare({env,project:spec,timeline,images,hand,dpr,icons,media}),illustratedAddon:true};
  if(spec.look==='whiteboard') {
    hand.whiteboardImage=await loadImg('/assets/faciup-whiteboard/hand.png');
    return {...FVWhiteboard.prepare({env,project:spec,timeline,images,hand,dpr,icons,media}),whiteboardAddon:true};
  }
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
    paintFrame(ctx, pv.model, pv.t);
    pv.raf = requestAnimationFrame(loop);
  };
  pv.raf = requestAnimationFrame(loop);
}

// admin.js (loaded after this file) defines showAdmin; start once every script is in
document.addEventListener('DOMContentLoaded', () => boot().catch(fatal));

async function showPromptHunter(){viewed('prompt-hunter');const {showHunter}=await import('/prompt-hunter.js');return showHunter({h,api,show,me,toast,fail,detailDialog,openLogin,footer});}

async function showFaciupLive(){
 const routeAtStart=currentRoute(),ticket=solutionNavigation;const {showLive}=await import('/faciup-live.js?v=99');
 if(currentRoute()!==routeAtStart||ticket!==solutionNavigation)return;
 stopLive=showLive({h,show,api,footer,openLogin,zaloLink:ui.zalo?.botLink});
}
