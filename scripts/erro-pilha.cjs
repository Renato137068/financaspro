#!/usr/bin/env node
/**
 * erro-pilha.cjs — traduz a pilha de um erro relatado para o código-fonte.
 *
 * O relatório de erro chega com a pilha do bundle minificado
 * (`app.bundle.js:1:48213`), que não diz qual função quebrou. Com os mapas de
 * código guardados pelo release (artefato "sourcemaps-vX.Y.Z" da execução do
 * workflow Release), este comando troca cada posição pelo arquivo, linha e
 * função de origem.
 *
 *   npm run erro:pilha -- --mapas pasta/dos/mapas pilha.txt
 *   pbpaste | npm run erro:pilha -- --mapas sourcemaps
 *
 * Sem --mapas, procura em ./sourcemaps. Usa os mapas da MESMA versão do erro:
 * o relatório traz a versão do app, e o nome do artefato também.
 */
const fs = require('fs');
const path = require('path');

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_VALOR = {};
for (let i = 0; i < B64.length; i++) B64_VALOR[B64[i]] = i;

/** Decodifica um segmento VLQ base64 ("AAgBC") em números. */
function decodificarVlq(segmento) {
  const valores = [];
  let valor = 0;
  let deslocamento = 0;
  for (const ch of segmento) {
    const d = B64_VALOR[ch];
    if (d === undefined) throw new Error('VLQ inválido: ' + segmento);
    valor += (d & 31) << deslocamento;
    if (d & 32) {
      deslocamento += 5;
    } else {
      const negativo = valor & 1;
      valor >>>= 1;
      valores.push(negativo ? -valor : valor);
      valor = 0;
      deslocamento = 0;
    }
  }
  return valores;
}

/**
 * Lê `mappings` de um source map v3 em linhas de segmentos absolutos:
 * linhas[l] = [[colGerada, fonte, linhaOrig, colOrig, nome?], ...] (base 0).
 */
function lerMapeamentos(mapa) {
  const linhas = [];
  let fonte = 0;
  let linhaOrig = 0;
  let colOrig = 0;
  let nome = 0;
  for (const linha of mapa.mappings.split(';')) {
    const segs = [];
    let col = 0;
    if (linha) {
      for (const s of linha.split(',')) {
        if (!s) continue;
        const v = decodificarVlq(s);
        col += v[0];
        if (v.length >= 4) {
          fonte += v[1];
          linhaOrig += v[2];
          colOrig += v[3];
          const seg = [col, fonte, linhaOrig, colOrig];
          if (v.length >= 5) { nome += v[4]; seg.push(nome); }
          segs.push(seg);
        }
      }
    }
    linhas.push(segs);
  }
  return linhas;
}

function limparFonte(fonte) {
  return String(fonte || '').replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
}

/**
 * Posição gerada (linha e coluna como a pilha mostra: base 1) → origem.
 * @returns {{arquivo:string, linha:number, coluna:number, nome:(string|null)}|null}
 */
function localizar(mapa, linhas, linha, coluna, partes) {
  const segs = linhas[linha - 1];
  if (!segs || !segs.length) return null;
  const col0 = coluna - 1;
  let achado = null;
  for (const s of segs) {
    if (s[0] <= col0) achado = s; else break;
  }
  if (!achado) return null;
  let arquivo = limparFonte(mapa.sources[achado[1]]);
  let linhaOrig = achado[2] + 1;
  // bundle-app.cjs concatena os scripts clássicos antes de minificar: o mapa
  // aponta para a concatenação, e `partes` diz onde começa cada arquivo.
  if (partes && partes.length) {
    let parte = null;
    for (const p of partes) {
      if (p.linha <= linhaOrig) parte = p; else break;
    }
    if (parte) {
      arquivo = parte.arquivo;
      linhaOrig = linhaOrig - parte.linha + 1;
    }
  }
  return {
    arquivo: arquivo,
    linha: linhaOrig,
    coluna: achado[3] + 1,
    nome: achado.length >= 5 ? (mapa.names[achado[4]] || null) : null,
  };
}

/** Troca cada `bundle.js:linha:coluna` do texto pela origem, quando há mapa. */
function traduzirPilha(texto, pastaMapas) {
  const cache = {};
  function carregar(bundle) {
    if (bundle in cache) return cache[bundle];
    const arqMapa = path.join(pastaMapas, bundle + '.map');
    if (!fs.existsSync(arqMapa)) { cache[bundle] = null; return null; }
    const mapa = JSON.parse(fs.readFileSync(arqMapa, 'utf8'));
    const arqPartes = path.join(pastaMapas, bundle + '.partes.json');
    cache[bundle] = {
      mapa: mapa,
      linhas: lerMapeamentos(mapa),
      partes: fs.existsSync(arqPartes) ? JSON.parse(fs.readFileSync(arqPartes, 'utf8')) : null,
    };
    return cache[bundle];
  }
  let traduzidas = 0;
  let semMapa = 0;
  const saida = texto.replace(/((?:https?:\/\/)?(?:[\w.-]+\/)*)([\w.-]+\.js):(\d+):(\d+)/g, function(trecho, _dir, bundle, l, c) {
    const m = carregar(bundle);
    if (!m) { semMapa++; return trecho; }
    const o = localizar(m.mapa, m.linhas, Number(l), Number(c), m.partes);
    if (!o) return trecho;
    traduzidas++;
    return o.arquivo + ':' + o.linha + ':' + o.coluna + (o.nome ? ' [' + o.nome + ']' : '');
  });
  return { texto: saida, traduzidas: traduzidas, semMapa: semMapa };
}

function main(argv) {
  let pasta = path.join(process.cwd(), 'sourcemaps');
  const arquivos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mapas') pasta = path.resolve(argv[++i] || '');
    else arquivos.push(argv[i]);
  }
  if (!fs.existsSync(pasta)) {
    console.error('[erro:pilha] pasta de mapas não encontrada: ' + pasta);
    console.error('Baixe o artefato "sourcemaps-vX.Y.Z" da execução do workflow Release da versão do erro.');
    process.exit(1);
  }
  const texto = arquivos.length
    ? arquivos.map((a) => fs.readFileSync(a, 'utf8')).join('\n')
    : fs.readFileSync(0, 'utf8');
  const r = traduzirPilha(texto, pasta);
  process.stdout.write(r.texto.endsWith('\n') ? r.texto : r.texto + '\n');
  if (r.traduzidas === 0) {
    console.error('[erro:pilha] nenhuma posição traduzida' +
      (r.semMapa ? ' (' + r.semMapa + ' sem mapa nesta pasta: a versão bate com a do erro?)' : ''));
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { decodificarVlq, lerMapeamentos, localizar, traduzirPilha };
