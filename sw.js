'use strict';
// Service worker : l'application s'ouvre hors ligne ; les données TCGdex déjà consultées aussi.
const SHELL = 'shell-v60';
const API = 'api-v1';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'coverage.json', 'data/sets-meta.json', 'data/scans.json', 'data/scans-remote.json', 'data/scans-embedded.json', 'data/order.json', 'data/cm-links.json', 'data/price-fix.json', 'data/names.json', 'manifest.webmanifest',
  'icons/logo-transparent.png', 'icons/logo-banner.webp', 'images/loading-poster.webp', 'images/set-logos/me06.webp', 'images/rarity/amazing.webp', 'images/set-logos/base1.webp', 'images/set-logos/sve.webp', 'images/set-logos/mee.webp', 'images/set-logos/mep.webp', 'images/set-logos/30th.webp', 'images/set-logos/svp.webp', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/apple-touch-icon.png', 'icons/apple-touch-icon-167.png', 'icons/apple-touch-icon-152.png', 'icons/apple-touch-icon-120.png',
  'icons/favicon-32.png', 'icons/favicon-16.png', 'icons/favicon.ico'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== SHELL && k !== API).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Données TCGdex : réseau d'abord (données fraîches), cache en secours.
  if (url.hostname === 'api.tcgdex.net') {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(API).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then((r) => r || Response.error()))
    );
    return;
  }

  // Vidéo : requêtes « Range » (nécessaires sur iOS) laissées au navigateur.
  if (url.pathname.endsWith('.mp4')) return;

  // Fichiers de l'application : cache d'abord, mis à jour en arrière-plan.
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
  // Images (assets.tcgdex.net) : laissées au cache HTTP du navigateur.
});
