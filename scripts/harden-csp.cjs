#!/usr/bin/env node
/**
 * harden-csp.cjs — enxuga a Content-Security-Policy do build de produção.
 *
 * Toda origem listada na CSP é uma origem que pode executar script ou receber
 * dado no seu app. O que não está em uso não deve estar na lista: origens de
 * desenvolvimento (localhost/127.0.0.1) nunca sobrevivem ao build, mesmo que
 * alguém as acrescente ao index.html para depurar.
 *
 * As origens do Open Finance (Belvo) e da API Express local saíram do
 * index.html com eles (ADR 0007); não há mais flag a seguir.
 *
 * Uso: node scripts/harden-csp.cjs [caminho/para/index.html]
 * Encadeado no npm script `build`.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DEV_ORIGINS = [
  /https?:\/\/localhost(:\d+)?/g,
  /https?:\/\/127\.0\.0\.1(:\d+)?/g,
];

const TESSERACT_ORIGINS = [
  /https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js@[0-9.]+\/?[^\s;]*/g,
  /https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js-core@[0-9.]+\/?[^\s;]*/g,
];

/** Lê uma feature flag direto do fonte, sem carregar o módulo inteiro. */
function lerFlag(configPath, nome, padrao) {
  try {
    const src = fs.readFileSync(configPath, 'utf8');
    const m = src.match(new RegExp(nome + '\\s*:\\s*(true|false)'));
    return m ? m[1] === 'true' : padrao;
  } catch (e) {
    return padrao;
  }
}

/** Sem match → conservador: assume CDN (mantém o jsdelivr em script-src). */
function tesseractLocal(configPath) {
  return lerFlag(configPath, 'TESSERACT_LOCAL', false);
}

/**
 * Função pura para permitir teste sem tocar em disco.
 * @param {string} html
 * @param {{tesseractLocal?: boolean}} [opts]
 * @returns {string}
 */
function limparCsp(html, opts) {
  let out = html;
  DEV_ORIGINS.forEach((re) => { out = out.replace(re, ''); });

  /* Tesseract vendorizado: o jsdelivr sai do script-src (nada mais de fora
     executa JS na página) mas PERMANECE no connect-src — os .traineddata
     continuam vindo de lá, e são dados, não script. */
  if (opts && opts.tesseractLocal) {
    out = out.replace(/(script-src)([^;]*);/g, (m, dir, group) => {
      let g = group;
      TESSERACT_ORIGINS.forEach((re) => { g = g.replace(re, ''); });
      return dir + ' ' + g.replace(/\s{2,}/g, ' ').trim() + ';';
    });
  }

  // Normaliza espaços criados pelas remoções, sem tocar nos ';'
  out = out.replace(/(script-src|connect-src|frame-src)([^;]*);/g, (m, dir, group) => {
    const cleaned = group.replace(/\s{2,}/g, ' ').trim();
    return cleaned ? dir + ' ' + cleaned + ';' : '';
  });

  return out;
}

module.exports = { limparCsp, tesseractLocal };

// Execução direta (não em require de teste).
if (require.main === module) {
  const target = process.argv[2] || path.join(__dirname, '..', 'dist', 'index.html');

  if (!fs.existsSync(target)) {
    console.warn('[harden-csp] alvo não encontrado, pulando:', target);
    process.exit(0);
  }

  const configPath = path.join(__dirname, '..', 'js', 'core', 'config.js');
  const tl = tesseractLocal(configPath);

  const html = fs.readFileSync(target, 'utf8');
  const out = limparCsp(html, { tesseractLocal: tl });

  if (out !== html) {
    fs.writeFileSync(target, out, 'utf8');
    console.log('[harden-csp] CSP enxugada:', target);
    console.log('[harden-csp]   origens de dev removidas');
    if (tl) console.log('[harden-csp]   jsdelivr fora do script-src (TESSERACT_LOCAL: true)');
  } else {
    console.log('[harden-csp] nada a remover (CSP já enxuta):', target);
  }
}
