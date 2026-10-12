// Makes the site installable and fast. The page and its scripts come from the network first
// (with a short timeout, then the cached copy), so a new version shows up at once; heavy static
// files (fonts, hand, icons, demo videos) are served from the cache and refreshed in the background.
const SHELL = 'nv-shell-v2', STATIC = 'nv-static-v2';
const SHELL_FILES = ['/', '/app.css', '/app.js', '/admin.js', '/banks.js', '/engine.js', '/icons/icon.svg'];
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
