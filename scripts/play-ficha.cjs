#!/usr/bin/env node
/**
 * play-ficha.cjs — envia a ficha da loja (textos e imagens) para a Play.
 *
 * Fonte única: o texto sai de docs/play-store-ficha.md (nome, descrição curta
 * e completa) e as imagens de docs/play-store/vitrine/ (capturas 01 a 08 e o
 * destaque). Ninguém copia texto para outro lugar: muda a ficha, roda isto.
 *
 * Fala com a Google Play Developer Publishing API por uma "edição": tudo o
 * que muda fica numa transação que só vale se for confirmada (commit). Sem
 * --publicar, a edição é validada pela própria Play e descartada; nada muda
 * na loja.
 *
 *   node scripts/play-ficha.cjs                 # confere textos e imagens, sem rede
 *   node scripts/play-ficha.cjs --validar       # monta a edição na Play, valida e descarta
 *   node scripts/play-ficha.cjs --publicar      # monta, valida e confirma (vai para revisão)
 *
 * A chave da conta de serviço vem de PLAY_SERVICE_ACCOUNT_JSON (o mesmo
 * segredo do release.yml). Nunca é impressa.
 *
 * As capturas de tablet ficam de fora até serem refeitas em 9:16
 * (revisão da vitrine de 04/out): a Play recusa ou esconde as 16:10.
 * As "novidades da versão" vão junto com o AAB, no release.yml.
 */
const fs = require('fs');
const path = require('path');
const { createSign } = require('crypto');

const ROOT = path.join(__dirname, '..');
const PACOTE = 'com.financaspro.mobile';
const IDIOMA = 'pt-BR';
const FICHA = 'docs/play-store-ficha.md';
const VITRINE = 'docs/play-store/vitrine';
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PACOTE;
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/' + PACOTE;

const LIMITES = { title: 30, shortDescription: 80, fullDescription: 4000 };

/** Seção "## <titulo>" do markdown, até a próxima "## ". */
function secao(md, titulo) {
  const ini = md.indexOf('\n## ' + titulo);
  if (ini === -1) throw new Error('seção "' + titulo + '" não encontrada em ' + FICHA);
  const resto = md.slice(ini + 1);
  const fim = resto.slice(1).search(/\n## /);
  return fim === -1 ? resto : resto.slice(0, fim + 1);
}

/** Primeiro bloco ``` da seção, sem a quebra final. */
function primeiroBloco(texto, onde) {
  const m = texto.match(/```\n([\s\S]*?)\n```/);
  if (!m) throw new Error('bloco de código não encontrado em "' + onde + '"');
  return m[1];
}

function textos(md) {
  const nome = secao(md, 'Identidade').match(/\*\*Nome do app\*\*[^`]*`([^`]+)`/);
  if (!nome) throw new Error('"Nome do app" não encontrado em ' + FICHA);
  return {
    title: nome[1],
    shortDescription: primeiroBloco(secao(md, 'Descrição curta'), 'Descrição curta'),
    fullDescription: primeiroBloco(secao(md, 'Descrição completa'), 'Descrição completa'),
  };
}

/** Largura e altura do PNG, lidas do IHDR. */
function dimensoes(buf) {
  if (buf.toString('latin1', 1, 4) !== 'PNG') throw new Error('não é PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), alfa: (buf[25] & 4) !== 0 };
}

function imagens() {
  const dir = path.join(ROOT, VITRINE);
  const capturas = fs.readdirSync(dir).filter((f) => /^0[1-8]-[\w-]+\.png$/.test(f)).sort();
  return {
    phoneScreenshots: capturas.map((f) => path.join(VITRINE, f)),
    featureGraphic: [path.join(VITRINE, 'destaque-1024x500.png')],
  };
}

/** Lista de problemas que fariam a Play recusar a ficha (vazia = ok). */
function conferir(t, imgs, ler = (rel) => fs.readFileSync(path.join(ROOT, rel))) {
  const erros = [];
  for (const [campo, max] of Object.entries(LIMITES)) {
    const n = [...(t[campo] || '')].length;
    if (!n) erros.push(campo + ' vazio');
    else if (n > max) erros.push(campo + ' com ' + n + ' caracteres (máx. ' + max + ')');
  }
  const cap = imgs.phoneScreenshots;
  if (cap.length < 2 || cap.length > 8) erros.push(cap.length + ' capturas de celular (a Play aceita de 2 a 8)');
  for (const rel of cap) {
    const { w, h, alfa } = dimensoes(ler(rel));
    if (w * 16 !== h * 9 && w * 9 !== h * 16) erros.push(rel + ' é ' + w + 'x' + h + ', fora de 9:16');
    if (Math.min(w, h) < 1080 || Math.max(w, h) > 3840) erros.push(rel + ' é ' + w + 'x' + h + ', lados fora de 1080 a 3840');
    if (alfa) erros.push(rel + ' tem canal alfa');
  }
  for (const rel of imgs.featureGraphic) {
    const { w, h, alfa } = dimensoes(ler(rel));
    if (w !== 1024 || h !== 500) erros.push(rel + ' é ' + w + 'x' + h + ', o destaque precisa ser 1024x500');
    if (alfa) erros.push(rel + ' tem canal alfa');
  }
  return erros;
}

// ---------------------------------------------------------------- rede

function contaDeServico() {
  let s = process.env.PLAY_SERVICE_ACCOUNT_JSON || '';
  if (!s.trim()) throw new Error('PLAY_SERVICE_ACCOUNT_JSON ausente');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  let j = JSON.parse(s.trim());
  if (typeof j === 'string') j = JSON.parse(j);
  if (typeof j.private_key === 'string' && j.private_key.includes('\\n')) j.private_key = j.private_key.replace(/\\n/g, '\n');
  return j;
}

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function token(sa) {
  const agora = Math.floor(Date.now() / 1000);
  const aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const corpo = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud, iat: agora, exp: agora + 3600,
  }));
  const jwt = corpo + '.' + b64url(createSign('RSA-SHA256').update(corpo).sign(sa.private_key));
  const res = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('OAuth ' + res.status + ': ' + (j.error_description || j.error || ''));
  return j.access_token;
}

async function chamar(tk, metodo, url, corpo, tipo) {
  const headers = { Authorization: 'Bearer ' + tk };
  if (corpo !== undefined) headers['Content-Type'] = tipo || 'application/json';
  const res = await fetch(url, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : (tipo ? corpo : JSON.stringify(corpo)),
  });
  const txt = await res.text();
  if (!res.ok) {
    let msg = txt;
    try { msg = JSON.parse(txt).error.message; } catch (_) { /* resposta não-JSON */ }
    throw new Error(metodo + ' ' + url.replace(API, '').replace(UPLOAD, '') + ' → ' + res.status + ': ' + String(msg).slice(0, 300));
  }
  return txt ? JSON.parse(txt) : {};
}

async function enviar(t, imgs, publicar) {
  const sa = contaDeServico();
  console.log('[play-ficha] conta de serviço: ' + sa.client_email);
  const tk = await token(sa);
  const { id } = await chamar(tk, 'POST', API + '/edits', {});
  const edicao = API + '/edits/' + id;
  let confirmada = false;
  try {
    await chamar(tk, 'PATCH', edicao + '/listings/' + IDIOMA, { language: IDIOMA, ...t });
    console.log('[play-ficha] textos ' + IDIOMA + ' na edição');
    for (const [tipo, arquivos] of Object.entries(imgs)) {
      await chamar(tk, 'DELETE', edicao + '/listings/' + IDIOMA + '/' + tipo);
      for (const rel of arquivos) {
        await chamar(tk, 'POST', UPLOAD + '/edits/' + id + '/listings/' + IDIOMA + '/' + tipo + '?uploadType=media',
          fs.readFileSync(path.join(ROOT, rel)), 'image/png');
      }
      console.log('[play-ficha] ' + tipo + ': ' + arquivos.length + ' imagem(ns) na edição');
    }
    await chamar(tk, 'POST', edicao + ':validate');
    console.log('[play-ficha] ✓ a Play validou a edição');
    if (publicar) {
      await chamar(tk, 'POST', edicao + ':commit');
      confirmada = true;
      console.log('[play-ficha] ✓ edição confirmada: a ficha foi enviada para revisão da Play');
    }
  } finally {
    if (!confirmada) {
      await chamar(tk, 'DELETE', edicao).catch(() => {});
      console.log('[play-ficha] edição descartada: nada mudou na loja');
    }
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const publicar = args.includes('--publicar');
  const validar = publicar || args.includes('--validar');
  const t = textos(fs.readFileSync(path.join(ROOT, FICHA), 'utf8'));
  const imgs = imagens();
  const erros = conferir(t, imgs);
  if (erros.length) {
    erros.forEach((e) => console.error('[play-ficha] ✗ ' + e));
    process.exit(1);
  }
  console.log('[play-ficha] ✓ título ' + [...t.title].length + '/30, curta ' + [...t.shortDescription].length
    + '/80, completa ' + [...t.fullDescription].length + '/4000; ' + imgs.phoneScreenshots.length + ' capturas de celular e o destaque');
  if (validar) {
    enviar(t, imgs, publicar).catch((e) => {
      console.error('[play-ficha] ✗ ' + e.message);
      process.exit(1);
    });
  }
}

module.exports = { textos, imagens, conferir, dimensoes };
