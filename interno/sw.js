// Service worker do painel interno. Escopo: a raiz de interno. (gerado pelo build).
const CACHE = 'painel-7cacd90641';
const guardavel = res => res.ok && res.type === 'basic' && !res.redirected;
const GUARDAR = ["./","manifest.webmanifest","/favicon.svg","/favicon-32.png","/apple-touch-icon.png","/icon-192.png","/icon-512.png","/icon-maskable-512.png"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(GUARDAR)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('painel-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => { if (guardavel(res)) { const copia = res.clone(); caches.open(CACHE).then(c => c.put('./', copia)); } return res; })
      .catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { if (guardavel(res)) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); } return res; })));
});
