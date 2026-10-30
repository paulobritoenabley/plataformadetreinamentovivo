// Permissões do painel de engajamento. Só o superadmin concede (regra em definir_permissao, no banco).
//  GET                                  → permissões de todos (o banco só devolve tudo ao superadmin)
//  PUT {usuario, recurso, escopo}       → de uma pessoa; escopo '' tira o acesso
//  PUT {papel, recurso, escopo}         → de todos de um papel, de uma vez
const s = require('./_sessao.js');

const RECURSOS = ['atividade', 'visitas'], ESCOPOS = ['', 'meus', 'abaixo', 'todos'], PAPEIS = ['gn', 'bdm', 'gerente', 'admin'];
const doBanco = r => !!(r.dados && (r.dados.code === '42501' || r.dados.code === 'P0002' || r.dados.code === '22023'));

module.exports = async (req, res) => {
  if (!s.pedidoJson(req)) return s.responder(res, 405, {erro: 'Pedido inválido.'});
  const se = await s.sessao(req);
  if (!se) return s.responder(res, 401, {erro: 'Sessão encerrada. Entre de novo.'}, s.cookiesSair(s.hostDe(req)));

  if (req.method === 'GET') {
    const r = await s.rest('permissoes?select=usuario,recurso,escopo', {token: se.token});
    return s.responder(res, r.ok ? 200 : 502, r.ok ? {permissoes: r.dados} : {erro: 'Não foi possível carregar as permissões.'}, se.cookies);
  }
  if (req.method !== 'PUT') return s.responder(res, 405, {erro: 'Pedido inválido.'}, se.cookies);

  const b = req.body || {}, recurso = String(b.recurso || ''), escopo = String(b.escopo || '');
  if (RECURSOS.indexOf(recurso) < 0 || ESCOPOS.indexOf(escopo) < 0) return s.responder(res, 400, {erro: 'Permissão inválida.'}, se.cookies);
  let r;
  if (b.papel) {
    if (PAPEIS.indexOf(String(b.papel)) < 0) return s.responder(res, 400, {erro: 'Papel inválido.'}, se.cookies);
    r = await s.rest('rpc/definir_permissao_papel', {metodo: 'POST', token: se.token, corpo: {p: String(b.papel), rec: recurso, esc: escopo}});
  } else {
    if (!/^[0-9a-f-]{36}$/i.test(String(b.usuario || ''))) return s.responder(res, 400, {erro: 'Pedido incompleto.'}, se.cookies);
    r = await s.rest('rpc/definir_permissao', {metodo: 'POST', token: se.token, corpo: {alvo: String(b.usuario), rec: recurso, esc: escopo}});
  }
  if (r.ok) return s.responder(res, 200, {ok: true, alterados: typeof r.dados === 'number' ? r.dados : 1}, se.cookies);
  s.responder(res, doBanco(r) ? 403 : 502, {erro: doBanco(r) ? r.dados.message : 'Não foi possível salvar a permissão.'}, se.cookies);
};
