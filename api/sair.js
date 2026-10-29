// POST → encerra a sessão no Supabase e apaga os cookies
const s = require('./_sessao.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST' || !s.pedidoJson(req)) return s.responder(res, 405, {erro: 'Pedido inválido.'});
  const c = s.lerCookies(req.headers.cookie);
  if (c[s.ACESSO]) await s.auth('logout', {metodo: 'POST', token: c[s.ACESSO]});
  s.responder(res, 200, {ok: true}, s.cookiesSair(s.hostDe(req)));
};
