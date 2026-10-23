// Makes the site installable and fast. The page and its scripts come from the network first
// (with a short timeout, then the cached copy), so a new version shows up at once; heavy static
// files (fonts, hand, icons, demo videos) are served from the cache and refreshed in the background.
const SHELL = 'nv-shell-v95-live-phone', STATIC = 'nv-static-v95-live-phone';
const SHELL_FILES = ['/studio-background.css?v=59','/navigation.js?v=54','/', '/app.css?v=61', '/compact-ui.css', '/polish.css', '/theme.css?v=82', '/hunter.css?v=39','/video-library.css?v=38','/video-previews.js?v=38', '/interaction.css?v=34','/admin-layout.css?v=53','/checkout.css?v=35', '/helpchat.js?v=52', '/app.js?v=90', '/faciup-live.js?v=92', '/faciup-live.css?v=92', '/home-gallery.js', '/voice-picker.js', '/prompt-hunter.js', '/creative-panel.js', '/ui-select.js?v=57', '/admin.js?v=72', '/banks.js', '/engine.js', '/whiteboard-addon.js', '/illustrated-addon.js', '/icons/icon.svg'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))); self.clients.claim(); });

function networkFirst(req) {
  const net = (req.mode === 'navigate' ? fetch(req) : fetch(req, { cache: 'no-cache' })).then((r) => { if (r.ok && !/no-store|private/i.test(r.headers.get('cache-control')||'')) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); } return r; });
  const slow = new Promise((ok) => setTimeout(ok, 2500)).then(() => caches.match(req));
  return Promise.race([net.catch(() => caches.match(req)), slow.then((r) => r || net)]).then((r) => r || net);
}
function staleWhileRevalidate(req) {
  return caches.open(STATIC).then((c) => c.match(req).then((hit) => {
    const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; });
    if (hit) { net.catch(() => {}); return hit; }
    return net;
  }));
}
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  if(u.pathname.startsWith('/giai-phap/')||u.pathname.startsWith('/tai-nguyen/')){e.respondWith(fetch(e.request,{cache:'no-store'}));return;}
  if (u.pathname.startsWith('/assets/') || u.pathname.startsWith('/icons/') || u.pathname === '/demos.json' || u.pathname === '/blank.svg') e.respondWith(staleWhileRevalidate(e.request));
  else e.respondWith(networkFirst(e.request));
});

// a video is ready: the push carries nothing, so ask the site what to show
self.addEventListener('push', (e) => {
  e.waitUntil(fetch('/api/push/latest', { credentials: 'include', headers: { 'x-nv': '1' } }).then((r) => r.json()).catch(() => ({}))
    .then(({ note }) => self.registration.showNotification(note?.title || 'Nét Vẽ', { body: note?.body || 'Có cập nhật về video của bạn.', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'nv-video', renotify: true, data: { url: note?.url || '/' } })));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(location.origin));
    return open ? open.focus().then(() => open.navigate(url)) : self.clients.openWindow(url);
  }));
});
