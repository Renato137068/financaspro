#!/usr/bin/env node
/**
 * harden-csp.cjs — enxuga a Content-Security-Policy do build de produção.
 *
 * Duas limpezas, pelo mesmo motivo: toda origem listada na CSP é uma origem
 * que pode executar script ou receber dado no seu app. O que não está em uso
 * não deve estar na lista.
 *
 *   1. Origens de desenvolvimento (localhost/127.0.0.1) — o index.html de dev
 *      precisa delas para a API local; produção, não.
 *
 *   2. Origens do Open Finance (Belvo) — enquanto CONFIG.FEATURE_OPEN_FINANCE
 *      for false, o widget não é carregado e nada fala com a Belvo. Manter
 *      cdn.belvo.com em script-src significaria um terceiro autorizado a
 *      executar JavaScript numa página que guarda token de sessão. A CSP
 *      passa a seguir a feature flag sozinha: ligou a flag, as origens voltam.
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

const OPEN_FINANCE_ORIGINS = [
  /https:\/\/cdn\.belvo\.com/g,
  /https:\/\/api\.belvo\.com/g,
  /https:\/\/sandbox\.belvo\.com/g,
  /https:\/\/widget\.belvo\.io/g,
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

/** Sem match → conservador: mantém as origens (não quebra o app). */
function openFinanceLigado(configPath) {
  return lerFlag(configPath, 'FEATURE_OPEN_FINANCE', true);
}

/** Sem match → conservador: assume CDN (mantém o jsdelivr em script-src). */
function tesseractLocal(configPath) {
  return lerFlag(configPath, 'TESSERACT_LOCAL', false);
}

/**
 * Função pura para permitir teste sem tocar em disco.
 * @param {string} html
 * @param {{openFinance: boolean}} opts
 * @returns {string}
 */
function limparCsp(html, opts) {
  let out = html;
  DEV_ORIGINS.forEach((re) => { out = out.replace(re, ''); });

  if (!opts || !opts.openFinance) {
    OPEN_FINANCE_ORIGINS.forEach((re) => { out = out.replace(re, ''); });
    // frame-src fica vazio sem o widget: remover a diretiva inteira.
    out = out.replace(/frame-src\s*;\s*/g, '');
  }

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

module.exports = { limparCsp, openFinanceLigado, tesseractLocal };

// Execução direta (não em require de teste).
if (require.main === module) {
  const target = process.argv[2] || path.join(__dirname, '..', 'dist', 'index.html');

  if (!fs.existsSync(target)) {
    console.warn('[harden-csp] alvo não encontrado, pulando:', target);
    process.exit(0);
  }

  const configPath = path.join(__dirname, '..', 'js', 'core', 'config.js');
  const of = openFinanceLigado(configPath);
  const tl = tesseractLocal(configPath);

  const html = fs.readFileSync(target, 'utf8');
  const out = limparCsp(html, { openFinance: of, tesseractLocal: tl });

  if (out !== html) {
    fs.writeFileSync(target, out, 'utf8');
    console.log('[harden-csp] CSP enxugada:', target);
    console.log('[harden-csp]   origens de dev removidas');
    if (!of) console.log('[harden-csp]   Belvo removida (FEATURE_OPEN_FINANCE: false)');
    if (tl) console.log('[harden-csp]   jsdelivr fora do script-src (TESSERACT_LOCAL: true)');
  } else {
    console.log('[harden-csp] nada a remover (CSP já enxuta):', target);
  }
}
