// Makes the site installable and fast. The page and its scripts come from the network first
// (with a short timeout, then the cached copy), so a new version shows up at once; heavy static
// files (fonts, hand, icons, demo videos) are served from the cache and refreshed in the background.
const SHELL = 'nv-shell-v19-creative-brief', STATIC = 'nv-static-v19-creative-brief';
const SHELL_FILES = ['/', '/app.css', '/compact-ui.css', '/app.js', '/home-gallery.js', '/browser-render.js', '/creative-panel.js', '/ui-select.js', '/admin.js', '/banks.js', '/engine.js', '/whiteboard-addon.js', '/illustrated-addon.js', '/icons/icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))); self.clients.claim(); });

function networkFirst(req) {
  const net = fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); } return r; });
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
