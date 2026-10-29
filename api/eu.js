// GET → quem está logado, o papel e os papéis que pode conceder (401 se não há sessão)
const s = require('./_sessao.js');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return s.responder(res, 405, {erro: 'Pedido inválido.'});
  const se = await s.sessao(req);
  if (!se) return s.responder(res, 401, {erro: 'Sessão encerrada. Entre de novo.'}, s.cookiesSair(s.hostDe(req)));
  const [p, c] = await Promise.all([
    s.rest('perfis?select=id,email,nome,papel&id=eq.' + encodeURIComponent(se.usuario.id), {token: se.token}),
    s.rest('rpc/papeis_que_concedo', {metodo: 'POST', corpo: {}, token: se.token})
  ]);
  const perfil = p.ok && p.dados && p.dados[0];
  if (!perfil) return s.responder(res, 403, {erro: 'Seu usuário ainda não tem acesso. Fale com quem convidou você.'}, se.cookies);
  s.responder(res, 200, Object.assign({}, perfil, {concede: c.ok ? c.dados : []}), se.cookies);
};
