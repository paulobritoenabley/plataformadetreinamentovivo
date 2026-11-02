// GET ?v=<código> → o vídeo que a página pública /video/ mostra ao cliente: {titulo, descricao, drive_id, duracao, vertical}.
// Público, sem chave secreta: video_publico só entrega vídeo marcado para o cliente (o só para o GN dá 404).
const s = require('./_sessao.js');

const CODIGO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

module.exports = async (req, res) => {
  if (req.method !== 'GET') return s.responder(res, 405, {erro: 'Pedido inválido.'});
  const v = String((req.query && req.query.v) || '');
  if (!CODIGO.test(v) || v.length > 40) return s.responder(res, 400, {erro: 'Vídeo não encontrado.'});
  const r = await s.rest('rpc/video_publico', {metodo: 'POST', corpo: {cod: v}});
  if (!r.ok) return s.responder(res, 502, {erro: 'Não foi possível carregar o vídeo agora.'});
  const video = Array.isArray(r.dados) && r.dados[0];
  s.responder(res, video ? 200 : 404, video || {erro: 'Vídeo não encontrado.'});
};
