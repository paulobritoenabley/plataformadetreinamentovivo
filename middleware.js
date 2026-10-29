// Barreira do ambiente logado (Vercel Routing Middleware), roda antes de entregar qualquer arquivo.
//  - interno.<domínio>/ abre a página de login e painel (repo/interno/)
//  - /gn/ (playbook do GN, em qualquer subdomínio) só com login válido; sem login, vai para o interno com ?volta=
//  - /interno/ fora do interno. volta para o interno
// A página do cliente (raiz dos subdomínios) continua pública.
import s from './api/_sessao.js';

export const config = {matcher: ['/', '/gn', '/gn/', '/gn/:path*', '/interno', '/interno/', '/interno/:path*']};

// mesmas respostas que next() e rewrite() do @vercel/functions, sem depender do pacote
function seguir(cookies){
  const h = new Headers({'x-middleware-next': '1'});
  (cookies || []).forEach(c => h.append('Set-Cookie', c));
  return new Response(null, {headers: h});
}
const reescrever = url => new Response(null, {headers: {'x-middleware-rewrite': url.href}});
const ir = (url, cookies) => {
  const h = new Headers({Location: url, 'Cache-Control': 'no-store'});
  (cookies || []).forEach(c => h.append('Set-Cookie', c));
  return new Response(null, {status: 302, headers: h});
};

// ---------- conferência do token (ES256, chaves públicas do Supabase) ----------
const b64 = t => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(t.length / 4) * 4, '=')), ch => ch.charCodeAt(0));
const texto = t => new TextDecoder().decode(b64(t));
let chaves = {}, buscaEm = 0;

async function chave(kid){
  if (!chaves[kid] && Date.now() - buscaEm > 60000) {
    buscaEm = Date.now();
    try {
      const r = await fetch(process.env.SUPABASE_URL + '/auth/v1/.well-known/jwks.json');
      const {keys} = await r.json();
      const novas = {};
      for (const k of keys || []) {
        if (k.kty === 'EC' && k.crv === 'P-256') novas[k.kid] = await crypto.subtle.importKey('jwk', k, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['verify']);
      }
      chaves = novas;
    } catch (e) {}
  }
  return chaves[kid] || null;
}

// devolve os dados do token se ele for válido, do Supabase, não vencido e de alguém com papel
async function valido(token){
  if (!token) return null;
  try {
    const [h, p, a] = token.split('.');
    const cab = JSON.parse(texto(h)), dados = JSON.parse(texto(p));
    if (cab.alg !== 'ES256') return null;
    const k = await chave(cab.kid);
    if (!k) return null;
    const ok = await crypto.subtle.verify({name: 'ECDSA', hash: 'SHA-256'}, k, b64(a), new TextEncoder().encode(h + '.' + p));
    if (!ok || dados.iss !== process.env.SUPABASE_URL + '/auth/v1' || dados.aud !== 'authenticated') return null;
    if (!dados.exp || dados.exp * 1000 < Date.now() || !dados.papel) return null;
    return dados;
  } catch (e) { return null; }
}

export default async function middleware(req){
  const url = new URL(req.url), host = url.hostname, caminho = url.pathname;
  const noDominio = host === s.DOMINIO || host.endsWith('.' + s.DOMINIO);

  if (host === 'interno.' + s.DOMINIO && caminho === '/') return reescrever(new URL('/interno/', url));
  if (caminho.startsWith('/interno')) return noDominio && host !== 'interno.' + s.DOMINIO ? ir(s.INTERNO) : seguir();
  if (!caminho.startsWith('/gn')) return seguir();
  // /gn vira /gn/: o manifesto e o service worker usam caminhos relativos (feito aqui, e não com trailingSlash, para não desviar /api/*)
  if (caminho === '/gn') return new Response(null, {status: 308, headers: {Location: '/gn/' + url.search}});

  const c = s.lerCookies(req.headers.get('cookie'));
  if (await valido(c[s.ACESSO])) return seguir();
  const nova = await s.renovar(c[s.RENOVAR]);
  if (nova && await valido(nova.access_token)) return seguir(s.cookiesSessao(nova, host));

  const login = new URL(s.INTERNO);
  login.searchParams.set('volta', url.href);
  return ir(login.href);
}
