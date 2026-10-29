// Service worker do Playbook do GN (gerado pelo build). Escopo: só /gn/.
// Página: rede primeiro (sempre a versão mais nova) e cópia guardada quando estiver sem internet.
// Ícones e manifesto: cópia guardada primeiro.
const CACHE = 'playbook-gn-82843cfe69';
const GUARDAR = ['./', 'manifest.webmanifest', '../favicon.svg', '../favicon-32.png', '../apple-touch-icon.png', '../icon-192.png', '../icon-512.png', '../icon-maskable-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(GUARDAR)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('playbook-gn-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => { const copia = res.clone(); caches.open(CACHE).then(c => c.put('./', copia)); return res; })
      .catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); return res; })));
});
