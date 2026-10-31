/* Service Worker: macht App und Anleitung offline nutzbar (nur über http/https, nicht bei file://).
   Strategie: Cache zuerst, im Hintergrund aktualisieren. Version hochzählen, wenn sich Dateien ändern. */
const CACHE = 'autopot-v5-1';
const ASSETS = ['./', 'app.html', 'app.css', 'app.js', 'theme-init.js', 'anleitung.html', 'anleitung.js', 'index.html', 'site.css', 'site.js', 'datenschutz.html', 'impressum.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const u = new URL(req.url);
  /* API-Antworten (Konto, verschlüsselte Daten) werden nie zwischengespeichert */
  if (req.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req, { ignoreSearch: true }).then(hit => {
        const net = fetch(req).then(res => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => hit || (req.mode === 'navigate' ? cache.match('app.html') : undefined));
        return hit || net;
      })
    )
  );
});
