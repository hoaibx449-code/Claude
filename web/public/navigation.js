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
  if (/^\/(kham-pha|giai-phap|tai-nguyen)(\/|$)/.test(target.pathname)) {
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
  if (u.origin !== location.origin || /^\/(api|assets|kham-pha|giai-phap|tai-nguyen)(\/|$)/.test(u.pathname) || /\.[a-z0-9]+$/i.test(u.pathname) || (u.hash && !u.hash.startsWith('#/'))) return;
  e.preventDefault(); navigate(u.pathname + u.search + u.hash);
});

function updateRouteMetadata(brand) {
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
