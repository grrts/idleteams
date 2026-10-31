// Idle Teams service worker. Pushes carry no data: on a push it asks the server what to show.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

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
