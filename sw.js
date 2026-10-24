// Service worker: rende l'app utilizzabile offline.
// Quando pubblichi una nuova versione dei file, aumenta il numero di VERSION.
const VERSION = 'contabilita-v50';
const SHELL = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './js/main.js', './js/store.js', './js/model.js', './js/sync.js', './js/expr.js', './js/charts.js', './js/catstats.js', './js/ui.js',
  './js/view-mese.js', './js/view-riepilogo.js', './js/view-patrimonio.js', './js/view-altro.js', './js/view-conti.js', './js/dialogs.js', './js/crypto.js', './js/view-debiti.js', './js/view-ricorrenti.js', './js/view-rate.js', './js/demo.js', './js/view-budget.js', './js/budgetui.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/icon-monochrome-512.png',
  './icons/favicon.svg', './icons/favicon-32.png', './icons/favicon-16.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// La pagina chiede la versione dei file in uso: la demo la usa per rigenerare i dati di esempio dopo un aggiornamento
self.addEventListener('message', (e) => {
  if (e.data === 'versione') e.ports[0]?.postMessage(VERSION);
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
