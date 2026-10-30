// Service worker do Playbook do GN (gerado pelo build). Escopo: só /gn/.
// Página: rede primeiro (sempre a versão mais nova) e cópia guardada quando estiver sem internet.
// Ícones e manifesto: cópia guardada primeiro.
// Só guarda resposta boa do próprio site: o desvio para o login (sem sessão) nunca substitui a cópia.
const CACHE = 'playbook-gn-1e44d820ee';
const guardavel = res => res.ok && res.type === 'basic' && !res.redirected;
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
    e.respondWith(fetch(req).then(res => { if (guardavel(res)) { const copia = res.clone(); caches.open(CACHE).then(c => c.put('./', copia)); } return res; })
      .catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { if (guardavel(res)) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); } return res; })));
});
