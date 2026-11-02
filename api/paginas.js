// Páginas do painel interno. Quem vê e quem altera é decidido no banco (RLS de paginas_painel); aqui só se confere o pedido.
//  GET                → páginas que o meu papel vê
//  POST   {titulo, descricao, url, capa, papel_minimo, ordem} → cadastra (só superadmin)
//  PATCH  {id, ...mesmos campos}                              → altera (só superadmin); capa '' remove, ausente mantém
//  DELETE ?id=        → remove (só superadmin)
//  PATCH com {novidade: true} → também avisa a equipe como novidade (atualizada)
// Novidades do Início (ficam aqui, e não numa função própria, porque o plano da Vercel aceita no máximo 12 funções por deploy):
//  GET ?acao=novidades[&quantas=30]  → as últimas que o meu papel vê, com "lida"
//  POST {acao: 'lida', id}            → abri esta novidade (qualquer usuário, só para si)
//  POST {acao: 'novidade', tipo, titulo, descricao, link, papel_minimo} → novidade à mão, ex.: playbook novo (só superadmin)
//  DELETE ?novidade=<id>              → remove a novidade (só superadmin)
// Páginas para enviar ao cliente (as três rastreadas de Enviar ao cliente; endereço e medição ficam no código do painel):
//  GET ?acao=envio                   → texto, mensagem pronta, ordem e se aparecem
//  PATCH {acao: 'envio', id, titulo, descricao, palavras, mensagem, ativo, ordem} → altera (só superadmin)
const s = require('./_sessao.js');
const ENVIO = ['link-seguro', 'descubra', 'linha-de-frente'];
// a mensagem vai ao cliente: a mesma trava do build (fornecedor, a grafia errada do Toni e nomes de clientes), preenchida no build em base64
const TRAVA = JSON.parse(Buffer.from('eyJwcm9pYmlkbyI6ImVuYWJsfHRpbWV0b2tub3d8dGltZSB0byBrbm93fHlvdXR1YmVcXC5jb218eW91dHVcXC5iZXxpbnN0YWdyYW18c3BvdGlmeXxcXGJUb255XFxiIiwibm9tZXMiOlsiTm92byBBdGFjYXJlam8iLCJCYWNpbyBkaSBMYXR0ZSIsIkNoaWxsaSBCZWFucyIsIkNvY2EtQ29sYSIsIkdpcmFmZmFzIiwiRGVweWwgQWN0aW9uIiwiRFBhc2Nob2FsIiwiT21lZ2EgMjAxMSIsIkFkaW4gRGVudGFsIEltcGxhbnRzIiwiQ29jYW1hciIsIlVuaWNoaWxsaSIsIk1heHhpIiwiVGVsZWbDs25pY2EgVGVjaCIsIkRhc2EiLCJMdWFuYSBWaWxlbGxhIiwiRXN0aGVyIFJ1aXogSXNhcnQiLCJSb3NhbmEgTWVuZGVzIiwiRXZhbmdlbGluYSBHb21lcyIsIkJpYW5jYSBHdWltYXLDo2VzIiwiQW5uYSBSb3NhIFZpcnRvIiwiSW5lc3NhIFNvZmVyIiwiTmF0YWxpYSBGZXJyYXoiLCJNYXlhcmEgQmFzc2kgVmlsYWxiYSIsIkZsZXVyeSIsIlJlZGUgROKAmU9yIiwiUkQgU2HDumRlIiwiRFBTUCIsIkxlcm95IE1lcmxpbiIsIk5hdHVyYSIsIkdydXBvIEJvdGljw6FyaW8iLCJSZW5uZXIiLCJNYXJpc2EiLCJSaWFjaHVlbG8iLCJDYXJyZWZvdXIiLCJSb2xkw6NvIiwiVGVuZGEiLCJUb25pIiwiTGVvbmFyZG8iLCJHYWJyaWVsYSIsIlBhdWxvIiwiR2l1c2VwcGUiLCJTdGVmZmFuaSIsIkhhcHBtb2JpIiwiTHVkb3MgUHJvIiwiVU9MIEVkVGVjaCIsImlzRWF6eSIsIkVkdXNlbnNlIiwiQ2F0YXJpbmVuc2UiLCJTdXBlcmEgRmFybWEiLCJCaW9sYWIiLCJBYmJvdHQiLCJDRUpBTS9TVVMiLCJHcnVwbyBNYXRldXMiLCJHcmFuYWRvIl19', 'base64').toString('utf8'));
const PROIBIDO = new RegExp(TRAVA.proibido, 'i');
function textoBarrado(t){
  const m = t.match(PROIBIDO);
  if (m) return /^ton/i.test(m[0]) ? 'O nome certo do contato é Toni.' : 'O texto cita o nome do fornecedor. Use "a plataforma" ou {produto}.';
  const nome = TRAVA.nomes.filter(n => n.length > 2 && new RegExp('(^|[^\\p{L}])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\p{L}])', 'iu').test(t))[0];
  return nome ? 'O texto cita um cliente ou pessoa (' + nome + '). Use a versão anônima.' : '';
}
function envioValido(b){
  const titulo = String(b.titulo || '').trim(), descricao = String(b.descricao || '').trim(), palavras = String(b.palavras || '').trim();
  const mensagem = String(b.mensagem || '').replace(/\r\n/g, '\n').trim(), ordem = parseInt(b.ordem, 10);
  if (ENVIO.indexOf(String(b.id)) < 0) return {erro: 'Página inválida.'};
  if (!titulo || titulo.length > 80) return {erro: 'Informe um título de até 80 caracteres.'};
  if (descricao.length > 240) return {erro: 'A descrição pode ter até 240 caracteres.'};
  if (palavras.length > 200) return {erro: 'As palavras de busca podem ter até 200 caracteres.'};
  if (mensagem.length < 10 || mensagem.length > 1200) return {erro: 'A mensagem pronta vai de 10 a 1.200 caracteres.'};
  if (mensagem.indexOf('{link}') < 0) return {erro: 'A mensagem precisa ter {link}, onde entra o link do envio.'};
  const barrado = textoBarrado([titulo, descricao, palavras, mensagem].join('\n'));
  if (barrado) return {erro: barrado};
  return {campos: {titulo, descricao: descricao || null, palavras: palavras || null, mensagem, ativo: b.ativo !== false,
    ordem: isFinite(ordem) ? Math.max(-999, Math.min(999, ordem)) : 0, atualizado_em: new Date().toISOString()}};
}
const TIPOS_NOVIDADE = ['playbook', 'outro', 'video', 'pagina'];

function novidadeValida(b){
  const titulo = String(b.titulo || '').trim(), descricao = String(b.descricao || '').trim(), link = String(b.link || '').trim();
  const tipo = String(b.tipo || 'playbook'), papel = String(b.papel_minimo || 'gn');
  if (TIPOS_NOVIDADE.indexOf(tipo) < 0) return {erro: 'Escolha o tipo da novidade.'};
  if (!titulo || titulo.length > 80) return {erro: 'Informe um título de até 80 caracteres.'};
  if (descricao.length > 240) return {erro: 'A descrição pode ter até 240 caracteres.'};
  if (link && (!/^https:\/\/\S+$/.test(link) || link.length > 500) && !/^#\/[a-z]+$/.test(link)) return {erro: 'O link precisa começar com https:// (ou ficar vazio).'};
  if (PAPEIS.indexOf(papel) < 0) return {erro: 'Escolha quem vê a novidade.'};
  return {campos: {tipo, titulo, descricao: descricao || null, link: link || null, papel_minimo: papel}};
}

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

  const q = req.query || {}, b = req.body || {};
  if (req.method === 'GET' && q.acao === 'novidades') {
    const quantas = Math.max(1, Math.min(50, parseInt(q.quantas, 10) || 7));
    const r = await s.rest('rpc/minhas_novidades', {metodo: 'POST', token: se.token, corpo: {quantas}});
    return s.responder(res, r.ok ? 200 : 502, r.ok ? {novidades: r.dados || []} : {erro: 'Não foi possível carregar as novidades.'}, se.cookies);
  }
  if (req.method === 'GET' && q.acao === 'envio') {
    const r = await s.rest('paginas_envio?select=id,titulo,descricao,palavras,mensagem,ativo,ordem&order=ordem.asc', {token: se.token});
    return s.responder(res, r.ok ? 200 : 502, r.ok ? {paginas: r.dados || []} : {erro: 'Não foi possível carregar as páginas de envio.'}, se.cookies);
  }
  if (req.method === 'POST' && b.acao === 'lida') {
    if (!ID.test(String(b.id || ''))) return s.responder(res, 400, {erro: 'Pedido incompleto.'}, se.cookies);
    const r = await s.rest('rpc/marcar_novidade_lida', {metodo: 'POST', token: se.token, corpo: {alvo: String(b.id)}});
    return s.responder(res, r.ok ? 200 : 502, r.ok ? {ok: true} : {erro: 'Não foi possível marcar.'}, se.cookies);
  }
  if (req.method === 'GET') {
    const r = await s.rest('paginas_painel?select=id,titulo,descricao,url,capa,papel_minimo,ordem&order=ordem.asc,titulo.asc', {token: se.token});
    return s.responder(res, r.ok ? 200 : 502, r.ok ? {paginas: r.dados} : {erro: 'Não foi possível carregar as páginas.'}, se.cookies);
  }
  if (['POST', 'PATCH', 'DELETE'].indexOf(req.method) < 0) return s.responder(res, 405, {erro: 'Pedido inválido.'}, se.cookies);

  // aviso claro antes de tentar; quem barra de fato é a RLS
  const p = await s.rest('rpc/meu_papel', {metodo: 'POST', corpo: {}, token: se.token});
  if (!p.ok || p.dados !== 'superadmin') return s.responder(res, 403, {erro: 'Só o superadmin altera as páginas do painel.'}, se.cookies);
  if (req.method === 'PATCH' && b.acao === 'envio') {
    const c = envioValido(b);
    if (c.erro) return s.responder(res, 400, {erro: c.erro}, se.cookies);
    const r = await s.rest('paginas_envio?id=eq.' + encodeURIComponent(String(b.id)), {metodo: 'PATCH', token: se.token, corpo: c.campos});
    return s.responder(res, r.ok ? 200 : 502, r.ok ? {ok: true} : {erro: 'Não foi possível salvar a página de envio.'}, se.cookies);
  }
  if (req.method === 'POST' && b.acao === 'novidade') {
    const n = novidadeValida(b);
    if (n.erro) return s.responder(res, 400, {erro: n.erro}, se.cookies);
    const r = await s.rest('novidades', {metodo: 'POST', token: se.token, corpo: n.campos});
    return s.responder(res, r.ok ? 201 : 502, r.ok ? {ok: true} : {erro: 'Não foi possível publicar a novidade.'}, se.cookies);
  }
  if (req.method === 'DELETE' && q.novidade != null) {
    if (!ID.test(String(q.novidade))) return s.responder(res, 400, {erro: 'Pedido incompleto.'}, se.cookies);
    const r = await s.rest('novidades?id=eq.' + String(q.novidade), {metodo: 'DELETE', token: se.token});
    return s.responder(res, r.ok ? 200 : 502, r.ok ? {ok: true} : {erro: 'Não foi possível remover a novidade.'}, se.cookies);
  }
  const id = String(req.method === 'DELETE' ? q.id || '' : b.id || '');

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
    if (!r.ok) return s.responder(res, 502, {erro: 'Não foi possível salvar a página.'}, se.cookies);
    const n = b.novidade === true ? await s.rest('rpc/novidade_atualizada', {metodo: 'POST', token: se.token, corpo: {alvo: id}}) : {ok: true};
    return s.responder(res, 200, n.ok ? {ok: true} : {ok: true, aviso: 'A página foi salva, mas a novidade não foi publicada.'}, se.cookies);
  }
  const r = await s.rest('paginas_painel?id=eq.' + id, {metodo: 'DELETE', token: se.token});
  s.responder(res, r.ok ? 200 : 502, r.ok ? {ok: true} : {erro: 'Não foi possível remover a página.'}, se.cookies);
};
