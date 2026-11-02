// Painel de engajamento. Quem vê o quê é decidido no banco (pode_ver nas funções); aqui só se repassa o pedido.
//  GET ?acao=resumo&dias=30           → por usuário: último acesso, dias ativos, logins, tempo no playbook, links enviados e abertos
//  GET ?acao=diario&dias=30           → série diária: ativos, logins, links enviados, links abertos pelo cliente
//  GET ?acao=usuario&id=<uuid>&dias=  → linha do tempo de um usuário
//  GET ?acao=envios&dias=30           → links enviados, com o que o cliente fez
//  GET ?acao=visitas&id=<código>      → tudo o que aconteceu num link enviado
//  GET ?acao=avisos[&desde=<ISO>]      → avisos escolhidos pela pessoa desde ali (sem desde: a fila desde o último visto) → {ate, avisos}
// Permissões do painel (só o superadmin concede: regra em definir_permissao, no banco):
//  GET ?acao=permissoes               → permissões de todos (o banco só devolve tudo ao superadmin)
//  PUT {usuario, recurso, escopo}     → de uma pessoa; escopo '' tira o acesso
//  PUT {papel, recurso, escopo}       → de todos de um papel, de uma vez
// As permissões ficam aqui, e não numa função própria, porque o plano da Vercel aceita no máximo 12 funções por deploy.
const s = require('./_sessao.js');

const DIAS = [7, 30, 90, 365];
const UUID = /^[0-9a-f-]{36}$/i, CODIGO = /^[A-Za-z0-9]{8,24}$/;
const RECURSOS = ['atividade', 'visitas'], ESCOPOS = ['', 'meus', 'abaixo', 'todos'], PAPEIS = ['gn', 'bdm', 'gerente', 'admin'];
const doBanco = r => !!(r.dados && (r.dados.code === '42501' || r.dados.code === 'P0002' || r.dados.code === '22023'));

async function definirPermissao(req, res, se){
  const b = req.body || {}, recurso = String(b.recurso || ''), escopo = String(b.escopo || '');
  if (RECURSOS.indexOf(recurso) < 0 || ESCOPOS.indexOf(escopo) < 0) return s.responder(res, 400, {erro: 'Permissão inválida.'}, se.cookies);
  let r;
  if (b.papel) {
    if (PAPEIS.indexOf(String(b.papel)) < 0) return s.responder(res, 400, {erro: 'Papel inválido.'}, se.cookies);
    r = await s.rest('rpc/definir_permissao_papel', {metodo: 'POST', token: se.token, corpo: {p: String(b.papel), rec: recurso, esc: escopo}});
  } else {
    if (!UUID.test(String(b.usuario || ''))) return s.responder(res, 400, {erro: 'Pedido incompleto.'}, se.cookies);
    r = await s.rest('rpc/definir_permissao', {metodo: 'POST', token: se.token, corpo: {alvo: String(b.usuario), rec: recurso, esc: escopo}});
  }
  if (r.ok) return s.responder(res, 200, {ok: true, alterados: typeof r.dados === 'number' ? r.dados : 1}, se.cookies);
  s.responder(res, doBanco(r) ? 403 : 502, {erro: doBanco(r) ? r.dados.message : 'Não foi possível salvar a permissão.'}, se.cookies);
}

module.exports = async (req, res) => {
  if ((req.method !== 'GET' && req.method !== 'PUT') || !s.pedidoJson(req)) return s.responder(res, 405, {erro: 'Pedido inválido.'});
  const se = await s.sessao(req);
  if (!se) return s.responder(res, 401, {erro: 'Sessão encerrada. Entre de novo.'}, s.cookiesSair(s.hostDe(req)));
  if (req.method === 'PUT') return definirPermissao(req, res, se);

  const q = req.query || {}, dias = DIAS.indexOf(Number(q.dias)) >= 0 ? Number(q.dias) : 30;
  if (q.acao === 'permissoes') {
    const p = await s.rest('permissoes?select=usuario,recurso,escopo', {token: se.token});
    return s.responder(res, p.ok ? 200 : 502, p.ok ? {permissoes: p.dados} : {erro: 'Não foi possível carregar as permissões.'}, se.cookies);
  }
  if (q.acao === 'avisos') {
    const desde = q.desde ? new Date(String(q.desde)) : null;
    if (desde && isNaN(desde.getTime())) return s.responder(res, 400, {erro: 'Pedido inválido.'}, se.cookies);
    const a = await s.rest('rpc/avisos_desde', {metodo: 'POST', token: se.token, corpo: {desde: desde ? desde.toISOString() : null}});
    return s.responder(res, a.ok ? 200 : 502, a.ok ? (a.dados || {ate: null, avisos: []}) : {erro: 'Não foi possível carregar os avisos.'}, se.cookies);
  }
  const ate = new Date(), de = new Date(ate.getTime() - dias * 24 * 3600 * 1000);
  const periodo = {de: de.toISOString(), ate: ate.toISOString()};
  const id = String(q.id || '');

  let rpc, corpo;
  if (q.acao === 'resumo') { rpc = 'engajamento_resumo'; corpo = periodo; }
  else if (q.acao === 'diario') { rpc = 'engajamento_diario'; corpo = periodo; }
  else if (q.acao === 'envios') { rpc = 'envios_lista'; corpo = periodo; }
  else if (q.acao === 'usuario' && UUID.test(id)) { rpc = 'atividade_usuario'; corpo = Object.assign({alvo: id}, periodo); }
  else if (q.acao === 'visitas' && CODIGO.test(id)) { rpc = 'visitas_envio'; corpo = {codigo: id}; }
  else return s.responder(res, 400, {erro: 'Pedido inválido.'}, se.cookies);

  const r = await s.rest('rpc/' + rpc, {metodo: 'POST', token: se.token, corpo});
  s.responder(res, r.ok ? 200 : 502, r.ok ? {dados: r.dados || [], de: periodo.de, ate: periodo.ate} : {erro: 'Não foi possível carregar o painel.'}, se.cookies);
};
