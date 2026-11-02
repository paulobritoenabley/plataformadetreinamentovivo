// Catálogo de vídeos (Google Drive) do painel interno. Quem vê e quem altera é decidido no banco (RLS de videos); aqui só se confere o pedido.
//  GET ?v=<código>    → público, sem login: o vídeo que a página /video/ mostra ao cliente {titulo, descricao, drive_id, duracao, vertical}.
//                       video_publico só entrega vídeo marcado para o cliente (o só para o GN dá 404).
//                       Fica aqui, e não numa função própria, porque o plano da Vercel aceita no máximo 12 funções por deploy.
//  GET                → todos os vídeos (qualquer usuário com perfil)
//  POST   {codigo, titulo, descricao, palavras, drive, duracao, para_cliente, vertical, ordem} → cadastra (só superadmin)
//  PATCH  {id, ...mesmos campos}  → altera (só superadmin); com {novidade: true}, avisa a equipe no Início (vídeo novo entra sozinho, pelo banco)
//  DELETE ?id=        → remove (só superadmin)
// drive: o link do arquivo no Drive (…/file/d/<ID>/…) ou o próprio ID. duracao: segundos, opcional.
const s = require('./_sessao.js');

const ID = /^[0-9a-f-]{36}$/i, CODIGO = /^[a-z0-9]+(-[a-z0-9]+)*$/, DRIVE = /^[A-Za-z0-9_-]{20,80}$/;

function idDoDrive(v){
  const t = String(v || '').trim();
  if (DRIVE.test(t)) return t;
  const m = t.match(/^https:\/\/drive\.google\.com\/(?:file\/d\/([A-Za-z0-9_-]{20,80})|open\?id=([A-Za-z0-9_-]{20,80}))/);
  return m ? m[1] || m[2] : '';
}

// devolve {campos} prontos para o banco ou {erro}
function campos(b, novo){
  const titulo = String(b.titulo || '').trim(), descricao = String(b.descricao || '').trim(), palavras = String(b.palavras || '').trim();
  const codigo = String(b.codigo || '').trim().toLowerCase();
  if (!titulo || titulo.length > 80) return {erro: 'Informe um título de até 80 caracteres.'};
  if (!CODIGO.test(codigo) || codigo.length < 3 || codigo.length > 40) return {erro: 'O código do link usa de 3 a 40 letras minúsculas, números e hífens.'};
  if (descricao.length > 240) return {erro: 'A descrição pode ter até 240 caracteres.'};
  if (palavras.length > 200) return {erro: 'As palavras de busca podem ter até 200 caracteres.'};
  const drive = idDoDrive(b.drive);
  if (!drive) return {erro: 'Cole o link do vídeo no Google Drive (drive.google.com/file/d/…).'};
  let duracao = null;
  if (b.duracao != null && b.duracao !== '') {
    duracao = parseInt(b.duracao, 10);
    if (!isFinite(duracao) || duracao < 1 || duracao > 36000) return {erro: 'Duração inválida.'};
  }
  const ordem = parseInt(b.ordem, 10);
  const c = {codigo, titulo, descricao: descricao || null, palavras: palavras || null, drive_id: drive, duracao,
    para_cliente: b.para_cliente !== false, vertical: b.vertical === true, ordem: isFinite(ordem) ? Math.max(-999, Math.min(999, ordem)) : 0};
  if (!novo) c.atualizado_em = new Date().toISOString();
  return {campos: c};
}

const falhou = r => r.status === 409 || (r.dados && r.dados.code === '23505')
  ? 'Já existe um vídeo com esse código de link.' : 'Não foi possível salvar o vídeo.';

async function publico(req, res){
  const v = String(req.query.v);
  if (!CODIGO.test(v) || v.length > 40) return s.responder(res, 400, {erro: 'Vídeo não encontrado.'});
  const r = await s.rest('rpc/video_publico', {metodo: 'POST', corpo: {cod: v}});
  if (!r.ok) return s.responder(res, 502, {erro: 'Não foi possível carregar o vídeo agora.'});
  const video = Array.isArray(r.dados) && r.dados[0];
  s.responder(res, video ? 200 : 404, video || {erro: 'Vídeo não encontrado.'});
}

module.exports = async (req, res) => {
  if (req.method === 'GET' && req.query && req.query.v != null) return publico(req, res);
  if (!s.pedidoJson(req)) return s.responder(res, 405, {erro: 'Pedido inválido.'});
  const se = await s.sessao(req);
  if (!se) return s.responder(res, 401, {erro: 'Sessão encerrada. Entre de novo.'}, s.cookiesSair(s.hostDe(req)));

  if (req.method === 'GET') {
    const r = await s.rest('videos?select=id,codigo,titulo,descricao,palavras,drive_id,duracao,para_cliente,vertical,ordem&order=ordem.asc,titulo.asc', {token: se.token});
    return s.responder(res, r.ok ? 200 : 502, r.ok ? {videos: r.dados} : {erro: 'Não foi possível carregar os vídeos.'}, se.cookies);
  }
  if (['POST', 'PATCH', 'DELETE'].indexOf(req.method) < 0) return s.responder(res, 405, {erro: 'Pedido inválido.'}, se.cookies);

  // aviso claro antes de tentar; quem barra de fato é a RLS
  const p = await s.rest('rpc/meu_papel', {metodo: 'POST', corpo: {}, token: se.token});
  if (!p.ok || p.dados !== 'superadmin') return s.responder(res, 403, {erro: 'Só o superadmin altera os vídeos.'}, se.cookies);
  const b = req.body || {};
  const id = String(req.method === 'DELETE' ? (req.query && req.query.id) || '' : b.id || '');

  if (req.method === 'POST') {
    const c = campos(b, true);
    if (c.erro) return s.responder(res, 400, {erro: c.erro}, se.cookies);
    const r = await s.rest('videos', {metodo: 'POST', token: se.token, corpo: c.campos});
    return s.responder(res, r.ok ? 201 : 502, r.ok ? {ok: true} : {erro: falhou(r)}, se.cookies);
  }
  if (!ID.test(id)) return s.responder(res, 400, {erro: 'Pedido incompleto.'}, se.cookies);
  if (req.method === 'PATCH') {
    const c = campos(b, false);
    if (c.erro) return s.responder(res, 400, {erro: c.erro}, se.cookies);
    const r = await s.rest('videos?id=eq.' + id, {metodo: 'PATCH', token: se.token, corpo: c.campos});
    if (!r.ok) return s.responder(res, 502, {erro: falhou(r)}, se.cookies);
    // "avisar como novidade": a equipe vê no Início que o vídeo mudou
    const n = b.novidade === true ? await s.rest('rpc/novidade_atualizada', {metodo: 'POST', token: se.token, corpo: {alvo: id}}) : {ok: true};
    return s.responder(res, 200, n.ok ? {ok: true} : {ok: true, aviso: 'O vídeo foi salvo, mas a novidade não foi publicada.'}, se.cookies);
  }
  const r = await s.rest('videos?id=eq.' + id, {metodo: 'DELETE', token: se.token});
  s.responder(res, r.ok ? 200 : 502, r.ok ? {ok: true} : {erro: 'Não foi possível remover o vídeo.'}, se.cookies);
};
