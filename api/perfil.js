// PUT {nome, sobrenome, foto?} → o próprio perfil. foto: data URL JPEG (reduzida no navegador), '' remove, ausente mantém.
// Quem grava é definir_meu_perfil no banco, sempre no auth.uid() do token: ninguém edita o perfil de outro por aqui.
const s = require('./_sessao.js');

const FOTO = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, FOTO_MAX = 80000;

module.exports = async (req, res) => {
  if (req.method !== 'PUT' || !s.pedidoJson(req)) return s.responder(res, 405, {erro: 'Pedido inválido.'});
  const se = await s.sessao(req);
  if (!se) return s.responder(res, 401, {erro: 'Sessão encerrada. Entre de novo.'}, s.cookiesSair(s.hostDe(req)));
  const b = req.body || {};
  const nome = String(b.nome || '').trim(), sobrenome = String(b.sobrenome || '').trim();
  if (!nome) return s.responder(res, 400, {erro: 'Informe seu nome.'}, se.cookies);
  if (nome.length > 60 || sobrenome.length > 80) return s.responder(res, 400, {erro: 'Nome ou sobrenome longo demais.'}, se.cookies);

  const corpo = {novo_nome: nome, novo_sobrenome: sobrenome};
  if (b.foto != null) {
    const foto = String(b.foto);
    if (foto && (foto.length > FOTO_MAX || !FOTO.test(foto))) return s.responder(res, 400, {erro: 'Foto inválida. Use uma imagem JPG ou PNG.'}, se.cookies);
    corpo.nova_foto = foto;
  }
  const r = await s.rest('rpc/definir_meu_perfil', {metodo: 'POST', token: se.token, corpo});
  s.responder(res, r.ok ? 200 : 502, r.ok ? {ok: true} : {erro: 'Não foi possível salvar o perfil. Tente de novo.'}, se.cookies);
};
