// POST {envio, sessao, eventos: [{tipo, detalhe, atras}]} → o que o cliente fez na página aberta pelo link enviado (e=).
// Público, sem chave secreta: registrar_visita só aceita código de envio que existe e limita o volume por dia.
// Visita de quem tem sessão no domínio (o próprio GN testando o link) fica marcada como interna.
const s = require('./_sessao.js');

const TIPOS = ['abriu', 'clique', 'etapa', 'rolagem', 'saiu', 'contato'];
const CODIGO = /^[A-Za-z0-9]{8,24}$/;

function limpa(e){
  if (!e || typeof e !== 'object' || TIPOS.indexOf(e.tipo) < 0) return null;
  const detalhe = e.detalhe && typeof e.detalhe === 'object' ? e.detalhe : null;
  if (detalhe && JSON.stringify(detalhe).length > 600) return null;
  const atras = Math.max(0, Math.min(Number(e.atras) || 0, 3600 * 1000));
  return {tipo: e.tipo, detalhe, atras: String(Math.round(atras))};
}

module.exports = async (req, res) => {
  if (req.method !== 'POST' || !s.pedidoJson(req)) return s.responder(res, 405, {erro: 'Pedido inválido.'});
  const b = req.body || {};
  const envio = String(b.envio || ''), sessao = String(b.sessao || '');
  if (!CODIGO.test(envio) || !CODIGO.test(sessao)) return s.responder(res, 400, {erro: 'Pedido inválido.'});
  const lista = (Array.isArray(b.eventos) ? b.eventos : []).slice(0, 50).map(limpa).filter(Boolean);
  if (!lista.length) return s.responder(res, 200, {ok: true});
  const c = s.lerCookies(req.headers.cookie);
  const r = await s.rest('rpc/registrar_visita', {metodo: 'POST',
    corpo: {codigo: envio, sessao_id: sessao, lista, de_usuario: !!(c[s.ACESSO] || c[s.RENOVAR])}});
  s.responder(res, r.ok ? 200 : 502, {ok: r.ok});
};
