/* Service Worker: macht App und Anleitung offline nutzbar (nur über http/https, nicht bei file://).
   Strategie: Netz zuerst, Cache als Rückfall (offline). Version hochzählen, wenn sich Dateien ändern. */
const CACHE = 'autopot-v7-2';
const ASSETS = ['./', 'app.html', 'app.css', 'app.js', 'qr.js', 'theme-init.js', 'anleitung.html', 'anleitung.js', 'index.html', 'site.css', 'site.js', 'datenschutz.html', 'impressum.html', 'nutzungsbedingungen.html', 'pow-worker.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

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
  /* Netz zuerst – so kommen Updates sofort an. Offline oder nach 4 s ohne Antwort: Version aus dem Cache. */
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), 4000))]);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') { const app = await cache.match('app.html'); if (app) return app; }
      return Response.error();
    }
  })());
});
