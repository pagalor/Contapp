// Service worker: rende l'app utilizzabile offline.
// Quando pubblichi una nuova versione dei file, aumenta il numero di VERSION.
const VERSION = 'contabilita-v31';
const SHELL = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './js/main.js', './js/store.js', './js/model.js', './js/sync.js', './js/expr.js', './js/charts.js', './js/catstats.js', './js/ui.js',
  './js/view-mese.js', './js/view-riepilogo.js', './js/view-patrimonio.js', './js/view-altro.js', './js/view-conti.js', './js/dialogs.js', './js/crypto.js', './js/view-debiti.js', './js/view-ricorrenti.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => hit ||
        fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
    );
    return;
  }
  // tutto il resto (Supabase) va sempre in rete e non viene mai salvato in cache
});
