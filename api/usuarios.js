// Gestão de usuários. A hierarquia é aplicada no banco (RLS, definir_papel, posso_alterar); aqui só se repassa o pedido.
//  GET               → usuários que eu posso ver
//  POST  {email, nome, papel} → cria o convidado com o papel e devolve o link de primeiro acesso
//  PUT   {id}                 → novo link de acesso para quem está abaixo (convite perdido ou senha esquecida)
//  PATCH {id, papel}          → troca o papel
// Nenhum e-mail sai do Supabase: quem convida copia o link e manda ao convidado.
const s = require('./_sessao.js');

const PAPEIS = ['gn', 'bdm', 'gerente', 'admin', 'superadmin'];
// as mensagens do banco (definir_papel) já vêm em português; o resto vira mensagem genérica
const doBanco = r => !!(r.dados && (r.dados.code === '42501' || r.dados.code === 'P0002'));
const erroDoBanco = r => doBanco(r) ? r.dados.message : 'Não foi possível salvar. Tente de novo.';

async function definirPapel(se, id, papel){
  return s.rest('rpc/definir_papel', {metodo: 'POST', token: se.token, corpo: {alvo: id, novo: papel}});
}

// o código fica depois do #: prévias de WhatsApp e Teams abrem o link sem gastar o código de uso único
async function gerarLink(tipo, email, nome){
  const corpo = {type: tipo, email};
  if (nome) corpo.data = {nome};
  const r = await s.auth('admin/generate_link', {metodo: 'POST', admin: true, corpo});
  if (!r.ok || !r.dados || !r.dados.hashed_token) return {r};
  const verificar = r.dados.verification_type || tipo;
  return {r, id: r.dados.id, link: s.INTERNO + '#acesso=' + encodeURIComponent(r.dados.hashed_token) + '&tipo=' + encodeURIComponent(verificar)};
}

module.exports = async (req, res) => {
  if (!s.pedidoJson(req)) return s.responder(res, 405, {erro: 'Pedido inválido.'});
  const se = await s.sessao(req);
  if (!se) return s.responder(res, 401, {erro: 'Sessão encerrada. Entre de novo.'}, s.cookiesSair(s.hostDe(req)));
  const b = req.body || {};

  if (req.method === 'GET') {
    const r = await s.rest('perfis?select=id,email,nome,papel,criado_em&order=email.asc', {token: se.token});
    return s.responder(res, r.ok ? 200 : 502, r.ok ? {usuarios: r.dados} : {erro: 'Não foi possível carregar os usuários.'}, se.cookies);
  }

  if (req.method === 'POST') {
    const email = String(b.email || '').trim().toLowerCase(), nome = String(b.nome || '').trim(), papel = String(b.papel || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return s.responder(res, 400, {erro: 'E-mail inválido.'}, se.cookies);
    if (PAPEIS.indexOf(papel) < 0) return s.responder(res, 400, {erro: 'Papel inválido.'}, se.cookies);
    // o banco diz o que eu posso conceder; só então a chave secreta entra para criar o convidado
    const c = await s.rest('rpc/papeis_que_concedo', {metodo: 'POST', corpo: {}, token: se.token});
    if (!c.ok || (c.dados || []).indexOf(papel) < 0) return s.responder(res, 403, {erro: 'Seu papel não permite convidar com esse papel.'}, se.cookies);
    const g = await gerarLink('invite', email, nome);
    if (!g.link) {
      const existe = g.r.status === 422 || /already|registered|exists/i.test(JSON.stringify(g.r.dados));
      return s.responder(res, existe ? 409 : 502, {erro: existe ? 'Esse e-mail já tem acesso. Use "Gerar link de acesso" na lista.' : 'Não foi possível gerar o convite.'}, se.cookies);
    }
    if (papel !== 'gn') {
      const r = await definirPapel(se, g.id, papel);
      if (!r.ok) return s.responder(res, 207, {ok: true, link: g.link, aviso: 'Link gerado, mas o papel ficou como GN: ' + erroDoBanco(r)}, se.cookies);
    }
    return s.responder(res, 201, {ok: true, link: g.link}, se.cookies);
  }

  if (req.method === 'PUT') {
    if (!b.id) return s.responder(res, 400, {erro: 'Pedido incompleto.'}, se.cookies);
    const pode = await s.rest('rpc/posso_alterar', {metodo: 'POST', token: se.token, corpo: {alvo: String(b.id)}});
    if (!pode.ok || pode.dados !== true) return s.responder(res, 403, {erro: 'Você só gera link para quem está abaixo do seu papel.'}, se.cookies);
    const p = await s.rest('perfis?select=email&id=eq.' + encodeURIComponent(String(b.id)), {token: se.token});
    const email = p.ok && p.dados && p.dados[0] && p.dados[0].email;
    if (!email) return s.responder(res, 404, {erro: 'Usuário não encontrado.'}, se.cookies);
    const g = await gerarLink('magiclink', email);
    return s.responder(res, g.link ? 200 : 502, g.link ? {ok: true, link: g.link} : {erro: 'Não foi possível gerar o link.'}, se.cookies);
  }

  if (req.method === 'PATCH') {
    if (!b.id || PAPEIS.indexOf(b.papel) < 0) return s.responder(res, 400, {erro: 'Pedido incompleto.'}, se.cookies);
    const r = await definirPapel(se, String(b.id), b.papel);
    return s.responder(res, r.ok ? 200 : (doBanco(r) ? 403 : 502), r.ok ? {ok: true} : {erro: erroDoBanco(r)}, se.cookies);
  }

  s.responder(res, 405, {erro: 'Pedido inválido.'}, se.cookies);
};
