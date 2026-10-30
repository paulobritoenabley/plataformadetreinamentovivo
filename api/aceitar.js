// POST {codigo, tipo, nome, sobrenome, senha} → primeiro acesso pelo link gerado no painel: confere o código (uso único),
// grava senha, nome e sobrenome e abre a sessão. Sem código, usa a sessão já aberta (nova tentativa depois de senha recusada).
const s = require('./_sessao.js');

const TIPOS = ['invite', 'magiclink'];

module.exports = async (req, res) => {
  if (req.method !== 'POST' || !s.pedidoJson(req)) return s.responder(res, 405, {erro: 'Pedido inválido.'});
  const b = req.body || {}, senha = String(b.senha || ''), nome = String(b.nome || '').trim().slice(0, 60);
  const sobrenome = String(b.sobrenome || '').trim().slice(0, 80);
  if (senha.length < 8) return s.responder(res, 400, {erro: 'A senha precisa ter pelo menos 8 caracteres.'});

  let token, cookies;
  if (b.codigo) {
    if (TIPOS.indexOf(b.tipo) < 0) return s.responder(res, 400, {erro: 'Link incompleto. Peça um novo a quem convidou você.'});
    const v = await s.auth('verify', {metodo: 'POST', corpo: {type: b.tipo, token_hash: String(b.codigo)}});
    if (!v.ok || !v.dados || !v.dados.access_token) return s.responder(res, 401, {erro: 'Este link já foi usado ou expirou. Peça um novo a quem convidou você.'});
    token = v.dados.access_token;
    cookies = s.cookiesSessao(v.dados, s.hostDe(req));
  } else {
    const se = await s.sessao(req);
    if (!se) return s.responder(res, 401, {erro: 'Este link já foi usado ou expirou. Peça um novo a quem convidou você.'});
    token = se.token;
    cookies = se.cookies;
  }

  // o código já foi gasto: daqui em diante a sessão vai junto, para a pessoa poder tentar outra senha
  const r = await s.auth('user', {metodo: 'PUT', token, corpo: {password: senha}});
  if (!r.ok) {
    const fraca = r.status === 422 && /password/i.test(JSON.stringify(r.dados));
    return s.responder(res, 400, {erro: fraca ? 'Escolha uma senha diferente e mais forte.' : 'Não foi possível salvar a senha. Tente de novo.', sessao: true}, cookies);
  }
  if (nome) await s.rest('rpc/definir_meu_perfil', {metodo: 'POST', token, corpo: {novo_nome: nome, novo_sobrenome: sobrenome}});
  s.responder(res, 200, {ok: true}, cookies);
};
