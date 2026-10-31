// Idle Teams service worker. Pushes carry no data: on a push it asks the server what to show.
// It also keeps the game's files so the app opens fast and says so plainly when there is no connection. The game
// itself needs the server, so /api is never cached.
const STATIC = 'it-static-v1';
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Idle Teams</title>' +
  '<body style="margin:0;background:#1a130b;color:#eadfcb;font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center">' +
  '<div><h1 style="color:#ffd25a">Idle Teams</h1><p>No connection. Your group keeps running on the server.</p><p><button onclick="location.reload()" style="font:inherit;padding:8px 16px">Try again</button></p></div>';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== STATIC) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    // the page first from the network (it names the newest files), the last copy or an offline note without one
    e.respondWith(fetch(req).then((res) => {
      if (res.ok && url.pathname === '/') { const copy = res.clone(); caches.open(STATIC).then((c) => c.put('/', copy)); }
      return res;
    }).catch(async () => (await caches.match(url.pathname === '/' ? '/' : req)) || new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
    return;
  }
  if (url.pathname.startsWith('/assets/') || /^\/icon-\d+\.png$/.test(url.pathname)) {
    // files carry ?v=<build>, so a cached copy is right until the page asks for a newer one
    e.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
  }
});

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let list = [];
    try {
      const r = await fetch('/api/notices/push', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (r.ok) list = await r.json();
    } catch (err) { /* offline: show a plain notice below */ }
    if (!list.length) {
      // Browsers require a notification for every push, so say something useful.
      return self.registration.showNotification('Idle Teams', { body: 'Something happened while you were away.', icon: '/icon-192.png', badge: '/icon-96.png', tag: 'news', data: { url: '/#/battle' } });
    }
    // One notification per kind: a newer wipe replaces an older one.
    const seen = new Set();
    for (const n of list) {
      if (seen.has(n.kind)) continue;
      seen.add(n.kind);
      await self.registration.showNotification(n.title, { body: n.body, icon: '/icon-192.png', badge: '/icon-96.png', tag: n.kind, timestamp: n.at * 1000, data: { url: '/' + n.url } });
    }
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/#/battle';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) { await w.focus(); return w.navigate ? w.navigate(url) : null; }
    }
    return self.clients.openWindow(url);
  })());
});
