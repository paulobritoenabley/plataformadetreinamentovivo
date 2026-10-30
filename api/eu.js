// GET → quem está logado, o papel, os papéis que pode conceder e o que vê no painel de engajamento (401 se não há sessão)
const s = require('./_sessao.js');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return s.responder(res, 405, {erro: 'Pedido inválido.'});
  const se = await s.sessao(req);
  if (!se) return s.responder(res, 401, {erro: 'Sessão encerrada. Entre de novo.'}, s.cookiesSair(s.hostDe(req)));
  const [p, c, v] = await Promise.all([
    s.rest('perfis?select=id,email,nome,sobrenome,foto,papel&id=eq.' + encodeURIComponent(se.usuario.id), {token: se.token}),
    s.rest('rpc/papeis_que_concedo', {metodo: 'POST', corpo: {}, token: se.token}),
    s.rest('rpc/minhas_permissoes', {metodo: 'POST', corpo: {}, token: se.token})
  ]);
  const perfil = p.ok && p.dados && p.dados[0];
  if (!perfil) return s.responder(res, 403, {erro: 'Seu usuário ainda não tem acesso. Fale com quem convidou você.'}, se.cookies);
  // {atividade: 'todos', visitas: 'meus'}: só para a tela montar as abas; quem barra é o banco
  const ve = {};
  (v.ok && Array.isArray(v.dados) ? v.dados : []).forEach(x => { ve[x.recurso] = x.escopo; });
  s.responder(res, 200, Object.assign({}, perfil, {concede: c.ok ? c.dados : [], ve}), se.cookies);
};
