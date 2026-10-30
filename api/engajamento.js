// Painel de engajamento (só leitura). Quem vê o quê é decidido no banco (pode_ver nas funções); aqui só se repassa o pedido.
//  GET ?acao=resumo&dias=30           → por usuário: último acesso, dias ativos, logins, tempo no playbook, links enviados e abertos
//  GET ?acao=diario&dias=30           → série diária: ativos, logins, links enviados, links abertos pelo cliente
//  GET ?acao=usuario&id=<uuid>&dias=  → linha do tempo de um usuário
//  GET ?acao=envios&dias=30           → links enviados, com o que o cliente fez
//  GET ?acao=visitas&id=<código>      → tudo o que aconteceu num link enviado
const s = require('./_sessao.js');

const DIAS = [7, 30, 90, 365];
const UUID = /^[0-9a-f-]{36}$/i, CODIGO = /^[A-Za-z0-9]{8,24}$/;

module.exports = async (req, res) => {
  if (req.method !== 'GET') return s.responder(res, 405, {erro: 'Pedido inválido.'});
  const se = await s.sessao(req);
  if (!se) return s.responder(res, 401, {erro: 'Sessão encerrada. Entre de novo.'}, s.cookiesSair(s.hostDe(req)));
  const q = req.query || {}, dias = DIAS.indexOf(Number(q.dias)) >= 0 ? Number(q.dias) : 30;
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
