// POST {eventos: [{id, tipo, pagina, detalhe, atras}]} → atividade do usuário logado (painel e playbook do GN).
// O playbook guarda a fila no aparelho quando está sem internet; "atras" é há quantos ms o evento aconteceu.
// Quem grava é registrar_eventos no banco, sempre no auth.uid() do token; repetido (mesmo id) é ignorado.
const s = require('./_sessao.js');

const TIPOS = ['abriu', 'navegou', 'compartilhou', 'modo_cliente'];

function limpa(e){
  if (!e || typeof e !== 'object' || TIPOS.indexOf(e.tipo) < 0) return null;
  const id = String(e.id || '');
  if (!/^[A-Za-z0-9-]{8,40}$/.test(id)) return null;
  const detalhe = e.detalhe && typeof e.detalhe === 'object' ? e.detalhe : null;
  if (detalhe && JSON.stringify(detalhe).length > 1500) return null;
  const atras = Math.max(0, Math.min(Number(e.atras) || 0, 30 * 24 * 3600 * 1000));
  return {id, tipo: e.tipo, pagina: String(e.pagina || '').slice(0, 120), detalhe, atras: String(Math.round(atras))};
}

module.exports = async (req, res) => {
  if (req.method !== 'POST' || !s.pedidoJson(req)) return s.responder(res, 405, {erro: 'Pedido inválido.'});
  const se = await s.sessao(req);
  if (!se) return s.responder(res, 401, {erro: 'Sessão encerrada. Entre de novo.'}, s.cookiesSair(s.hostDe(req)));
  const lista = (Array.isArray((req.body || {}).eventos) ? req.body.eventos : []).slice(0, 100).map(limpa).filter(Boolean);
  if (!lista.length) return s.responder(res, 200, {ok: true, gravados: 0}, se.cookies);
  const r = await s.rest('rpc/registrar_eventos', {metodo: 'POST', token: se.token, corpo: {lista}});
  s.responder(res, r.ok ? 200 : 502, r.ok ? {ok: true, gravados: r.dados} : {erro: 'Não foi possível registrar agora.'}, se.cookies);
};
