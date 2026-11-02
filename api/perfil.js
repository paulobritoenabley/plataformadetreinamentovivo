// PUT {nome, sobrenome, foto?, whatsapp?} → o próprio perfil. foto: data URL JPEG (reduzida no navegador); foto e whatsapp: '' remove, ausente mantém.
// PUT {preferencia: 'avisos', valor}       → o que gera aviso para mim (conferido aqui, gravado por definir_minha_preferencia)
// PUT {preferencia: 'inicio', valor}       → ordem e largura dos blocos do meu Início ({blocos: [{id, l}]})
// PUT {avisos_vistos: <ISO>}               → vi os avisos até ali (a fila anda)
// Quem grava é o banco, sempre no auth.uid() do token: ninguém edita o perfil de outro por aqui.
// As preferências ficam aqui, e não numa função própria, porque o plano da Vercel aceita no máximo 12 funções por deploy.
const s = require('./_sessao.js');

const FOTO = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, FOTO_MAX = 80000;
const EVENTOS = ['abriu', 'play', 'video50', 'video100', 'rolou50', 'rolou75', 'rolou100', 'whatsapp', 'saiu', 'score'];
const nota = v => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 100 ? Number(v) : null;

// só passa o formato conhecido; o resto é descartado
function avisosValidos(v){
  v = v && typeof v === 'object' ? v : {};
  const eq = v.equipe && typeof v.equipe === 'object' ? v.equipe : {};
  return {
    eventos: (Array.isArray(v.eventos) ? v.eventos : []).filter((e, i, l) => EVENTOS.indexOf(e) >= 0 && l.indexOf(e) === i),
    score_min: nota(v.score_min) || 70,
    som: v.som !== false,
    sistema: v.sistema === true,
    equipe: {clientes: eq.clientes === true, login: eq.login === true, envio: eq.envio === true, score_abaixo: nota(eq.score_abaixo)}
  };
}

// blocos do Início: id em letras minúsculas, sem repetir, até 20; largura 1 (meia) ou 2 (inteira)
function inicioValido(v){
  const vistos = [];
  const blocos = (v && Array.isArray(v.blocos) ? v.blocos : []).filter(x => {
    const ok = x && /^[a-z]{3,20}$/.test(x.id) && vistos.indexOf(x.id) < 0;
    if (ok) vistos.push(x.id);
    return ok;
  }).slice(0, 20).map(x => ({id: x.id, l: x.l === 2 ? 2 : 1}));
  return {blocos};
}

async function preferencias(req, res, se, b){
  if (b.avisos_vistos != null) {
    const ate = new Date(String(b.avisos_vistos));
    if (isNaN(ate.getTime())) return s.responder(res, 400, {erro: 'Pedido inválido.'}, se.cookies);
    const r = await s.rest('rpc/marcar_avisos_vistos', {metodo: 'POST', token: se.token, corpo: {ate: ate.toISOString()}});
    return s.responder(res, r.ok ? 200 : 502, r.ok ? {ok: true} : {erro: 'Não foi possível salvar.'}, se.cookies);
  }
  if (b.preferencia !== 'avisos' && b.preferencia !== 'inicio') return s.responder(res, 400, {erro: 'Preferência inválida.'}, se.cookies);
  const valor = b.preferencia === 'avisos' ? avisosValidos(b.valor) : inicioValido(b.valor);
  const r = await s.rest('rpc/definir_minha_preferencia', {metodo: 'POST', token: se.token, corpo: {chave: b.preferencia, valor}});
  s.responder(res, r.ok ? 200 : 502, r.ok ? {ok: true, valor} : {erro: 'Não foi possível salvar a preferência.'}, se.cookies);
}

module.exports = async (req, res) => {
  if (req.method !== 'PUT' || !s.pedidoJson(req)) return s.responder(res, 405, {erro: 'Pedido inválido.'});
  const se = await s.sessao(req);
  if (!se) return s.responder(res, 401, {erro: 'Sessão encerrada. Entre de novo.'}, s.cookiesSair(s.hostDe(req)));
  const b = req.body || {};
  if (b.preferencia != null || b.avisos_vistos != null) return preferencias(req, res, se, b);
  const nome = String(b.nome || '').trim(), sobrenome = String(b.sobrenome || '').trim();
  if (!nome) return s.responder(res, 400, {erro: 'Informe seu nome.'}, se.cookies);
  if (nome.length > 60 || sobrenome.length > 80) return s.responder(res, 400, {erro: 'Nome ou sobrenome longo demais.'}, se.cookies);

  const corpo = {novo_nome: nome, novo_sobrenome: sobrenome};
  if (b.whatsapp != null) {
    // com DDD, com ou sem o 55 na frente; '' remove
    let zap = String(b.whatsapp).replace(/\D/g, '');
    if (zap && zap.length <= 11) zap = '55' + zap;
    if (zap && !/^55[0-9]{10,11}$/.test(zap)) return s.responder(res, 400, {erro: 'WhatsApp inválido: use o DDD e o número.'}, se.cookies);
    corpo.novo_whatsapp = zap;
  }
  if (b.foto != null) {
    const foto = String(b.foto);
    if (foto && (foto.length > FOTO_MAX || !FOTO.test(foto))) return s.responder(res, 400, {erro: 'Foto inválida. Use uma imagem JPG ou PNG.'}, se.cookies);
    corpo.nova_foto = foto;
  }
  const r = await s.rest('rpc/definir_meu_perfil', {metodo: 'POST', token: se.token, corpo});
  s.responder(res, r.ok ? 200 : 502, r.ok ? {ok: true} : {erro: 'Não foi possível salvar o perfil. Tente de novo.'}, se.cookies);
};
