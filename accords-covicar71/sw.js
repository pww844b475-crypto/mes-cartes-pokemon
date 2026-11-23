// Service worker : met en cache l'appli (hors ligne). Aucune donnée saisie n'est stockée.
const V = 'accords71-v4';
const COEUR = ['./', 'index.html', 'style.css', 'app.js', 'moteur/normalise.js', 'moteur/recherche.js', 'moteur/calculs.js', 'config.js', 'fiches/fiches.json', 'fiches/synonymes.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(COEUR)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const copie = r.clone(); caches.open(V).then(c => c.put(e.request, copie)); return r; }).catch(() => caches.match(e.request)));
});
