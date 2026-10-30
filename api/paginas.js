// Páginas do painel interno. Quem vê e quem altera é decidido no banco (RLS de paginas_painel); aqui só se confere o pedido.
//  GET                → páginas que o meu papel vê
//  POST   {titulo, descricao, url, capa, papel_minimo, ordem} → cadastra (só superadmin)
//  PATCH  {id, ...mesmos campos}                              → altera (só superadmin); capa '' remove, ausente mantém
//  DELETE ?id=        → remove (só superadmin)
const s = require('./_sessao.js');

const PAPEIS = ['gn', 'bdm', 'gerente', 'admin', 'superadmin'];
const CAPA = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, CAPA_MAX = 200000;
const ID = /^[0-9a-f-]{36}$/i;

// devolve {campos} prontos para o banco ou {erro}
function campos(b, novo){
  const titulo = String(b.titulo || '').trim(), descricao = String(b.descricao || '').trim(), url = String(b.url || '').trim();
  if (!titulo || titulo.length > 80) return {erro: 'Informe um título de até 80 caracteres.'};
  if (descricao.length > 240) return {erro: 'A descrição pode ter até 240 caracteres.'};
  let host = '';
  try { const u = new URL(url); if (u.protocol === 'https:') host = u.hostname; } catch (e) {}
  if (!host || /\s/.test(url) || url.length > 500) return {erro: 'Informe um endereço completo, começando com https://'};
  // o painel não abre a si mesmo dentro da pré-visualização
  if (host === 'interno.' + s.DOMINIO) return {erro: 'Esse endereço é o próprio painel.'};
  const papel = String(b.papel_minimo || 'gn');
  if (PAPEIS.indexOf(papel) < 0) return {erro: 'Escolha quem vê a página.'};
  const ordem = parseInt(b.ordem, 10);
  const c = {titulo, descricao: descricao || null, url, papel_minimo: papel, ordem: isFinite(ordem) ? Math.max(-999, Math.min(999, ordem)) : 0};
  if (b.capa != null || novo) {
    const capa = String(b.capa || '');
    if (capa && (capa.length > CAPA_MAX || !CAPA.test(capa))) return {erro: 'Imagem de capa inválida. Use JPG ou PNG.'};
    c.capa = capa || null;
  }
  if (!novo) c.atualizado_em = new Date().toISOString();
  return {campos: c};
}

module.exports = async (req, res) => {
  if (!s.pedidoJson(req)) return s.responder(res, 405, {erro: 'Pedido inválido.'});
  const se = await s.sessao(req);
  if (!se) return s.responder(res, 401, {erro: 'Sessão encerrada. Entre de novo.'}, s.cookiesSair(s.hostDe(req)));

  if (req.method === 'GET') {
    const r = await s.rest('paginas_painel?select=id,titulo,descricao,url,capa,papel_minimo,ordem&order=ordem.asc,titulo.asc', {token: se.token});
    return s.responder(res, r.ok ? 200 : 502, r.ok ? {paginas: r.dados} : {erro: 'Não foi possível carregar as páginas.'}, se.cookies);
  }
  if (['POST', 'PATCH', 'DELETE'].indexOf(req.method) < 0) return s.responder(res, 405, {erro: 'Pedido inválido.'}, se.cookies);

  // aviso claro antes de tentar; quem barra de fato é a RLS
  const p = await s.rest('rpc/meu_papel', {metodo: 'POST', corpo: {}, token: se.token});
  if (!p.ok || p.dados !== 'superadmin') return s.responder(res, 403, {erro: 'Só o superadmin altera as páginas do painel.'}, se.cookies);
  const b = req.body || {};
  const id = String(req.method === 'DELETE' ? (req.query && req.query.id) || '' : b.id || '');

  if (req.method === 'POST') {
    const c = campos(b, true);
    if (c.erro) return s.responder(res, 400, {erro: c.erro}, se.cookies);
    const r = await s.rest('paginas_painel', {metodo: 'POST', token: se.token, corpo: c.campos});
    return s.responder(res, r.ok ? 201 : 502, r.ok ? {ok: true} : {erro: 'Não foi possível salvar a página.'}, se.cookies);
  }
  if (!ID.test(id)) return s.responder(res, 400, {erro: 'Pedido incompleto.'}, se.cookies);
  if (req.method === 'PATCH') {
    const c = campos(b, false);
    if (c.erro) return s.responder(res, 400, {erro: c.erro}, se.cookies);
    const r = await s.rest('paginas_painel?id=eq.' + id, {metodo: 'PATCH', token: se.token, corpo: c.campos});
    return s.responder(res, r.ok ? 200 : 502, r.ok ? {ok: true} : {erro: 'Não foi possível salvar a página.'}, se.cookies);
  }
  const r = await s.rest('paginas_painel?id=eq.' + id, {metodo: 'DELETE', token: se.token});
  s.responder(res, r.ok ? 200 : 502, r.ok ? {ok: true} : {erro: 'Não foi possível remover a página.'}, se.cookies);
};
