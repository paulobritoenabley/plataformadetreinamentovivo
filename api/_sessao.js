// Sessão do ambiente logado, usada pelo middleware.js e pelas funções de api/.
// Os tokens ficam em cookies httpOnly no domínio inteiro: o mesmo login vale em interno., varejo. e nos próximos.
// Só fetch e strings, para rodar tanto no middleware (edge) quanto nas funções (Node).
// Variáveis de ambiente na Vercel: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY.
const DOMINIO = 'plataformadetreinamentovivo.tech';
const INTERNO = 'https://interno.' + DOMINIO + '/';
const ACESSO = 'sessao_acesso', RENOVAR = 'sessao_renovar', TRINTA_DIAS = 30 * 24 * 3600;

const env = n => process.env[n] || '';

function lerCookies(header){
  const c = {};
  String(header || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) c[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return c;
}

// fora do domínio (prévia da Vercel) o cookie fica só no próprio endereço
function cookie(nome, valor, maxAge, host){
  const dom = host === DOMINIO || String(host).endsWith('.' + DOMINIO) ? '; Domain=.' + DOMINIO : '';
  return nome + '=' + encodeURIComponent(valor) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge + dom;
}
const cookiesSessao = (s, host) => [cookie(ACESSO, s.access_token, s.expires_in || 3600, host), cookie(RENOVAR, s.refresh_token, TRINTA_DIAS, host)];
const cookiesSair = host => [cookie(ACESSO, '', 0, host), cookie(RENOVAR, '', 0, host)];

// chamada ao Supabase: admin usa a chave secreta (só aqui no servidor); senão, a pública com o token do usuário
async function supabase(caminho, {metodo = 'GET', corpo, token, admin} = {}){
  const chave = env(admin ? 'SUPABASE_SECRET_KEY' : 'SUPABASE_PUBLISHABLE_KEY');
  const h = {apikey: chave, 'Content-Type': 'application/json'};
  const bearer = token || (admin && chave.indexOf('eyJ') === 0 ? chave : '');
  if (bearer) h.Authorization = 'Bearer ' + bearer;
  try {
    const r = await fetch(env('SUPABASE_URL') + caminho, {method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined});
    const t = await r.text();
    let dados = null;
    try { dados = t ? JSON.parse(t) : null; } catch (e) { dados = {message: t}; }
    return {ok: r.ok, status: r.status, dados};
  } catch (e) {
    return {ok: false, status: 503, dados: {message: 'Sem conexão com o servidor de login.'}};
  }
}
const auth = (caminho, op) => supabase('/auth/v1/' + caminho, op);
const rest = (caminho, op) => supabase('/rest/v1/' + caminho, op);

async function renovar(refresh){
  if (!refresh) return null;
  const r = await auth('token?grant_type=refresh_token', {metodo: 'POST', corpo: {refresh_token: refresh}});
  return r.ok ? r.dados : null;
}

// ---------- funções de api/ (Node) ----------
const hostDe = req => String(req.headers.host || '').split(':')[0];

function responder(res, status, obj, cookies){
  res.setHeader('Cache-Control', 'no-store');
  if (cookies && cookies.length) res.setHeader('Set-Cookie', cookies);
  res.status(status).json(obj);
}

// pedido que altera algo precisa vir em JSON (navegador de outro site não manda sem permissão)
const pedidoJson = req => req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT'
  ? /application\/json/.test(req.headers['content-type'] || '') : true;

// usuário logado ou null; se o acesso venceu, renova e devolve os cookies novos
async function sessao(req){
  const c = lerCookies(req.headers.cookie);
  if (c[ACESSO]) {
    const u = await auth('user', {token: c[ACESSO]});
    if (u.ok) return {token: c[ACESSO], usuario: u.dados, cookies: []};
  }
  const s = await renovar(c[RENOVAR]);
  return s ? {token: s.access_token, usuario: s.user, cookies: cookiesSessao(s, hostDe(req))} : null;
}

module.exports = {
  DOMINIO, INTERNO, ACESSO, RENOVAR,
  lerCookies, cookiesSessao, cookiesSair, auth, rest, renovar,
  hostDe, responder, pedidoJson, sessao
};
