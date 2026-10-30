// POST {email, senha} → grava a sessão nos cookies e registra o login na atividade do usuário
const s = require('./_sessao.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST' || !s.pedidoJson(req)) return s.responder(res, 405, {erro: 'Pedido inválido.'});
  const {email, senha} = req.body || {};
  if (!email || !senha) return s.responder(res, 400, {erro: 'Informe e-mail e senha.'});
  const r = await s.auth('token?grant_type=password', {metodo: 'POST', corpo: {email: String(email).trim().toLowerCase(), password: String(senha)}});
  if (r.ok) {
    // o registro não segura o login: se falhar, a pessoa entra do mesmo jeito
    await s.rest('rpc/registrar_eventos', {metodo: 'POST', token: r.dados.access_token,
      corpo: {lista: [{id: crypto.randomUUID(), tipo: 'login', pagina: 'interno'}]}});
    return s.responder(res, 200, {ok: true}, s.cookiesSessao(r.dados, s.hostDe(req)));
  }
  if (r.status === 400) return s.responder(res, 401, {erro: 'E-mail ou senha incorretos.'});
  if (r.status === 429) return s.responder(res, 429, {erro: 'Muitas tentativas. Espere alguns minutos e tente de novo.'});
  s.responder(res, 502, {erro: 'Não foi possível entrar agora. Tente de novo.'});
};
