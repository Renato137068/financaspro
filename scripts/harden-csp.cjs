#!/usr/bin/env node
/**
 * harden-csp.cjs — remove origens de desenvolvimento (localhost/127.0.0.1)
 * da Content-Security-Policy do build de produção (dist/index.html).
 *
 * O index.html de dev precisa liberar http://localhost:4000 no connect-src
 * para a API local. Esse resíduo NÃO pode ir para produção. Este script roda
 * após o `vite build` e limpa a CSP do artefato final.
 *
 * Uso: node scripts/harden-csp.cjs [caminho/para/index.html]
 * Encadeado no npm script `build`.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, '..', 'dist', 'index.html');

if (!fs.existsSync(target)) {
  console.warn('[harden-csp] alvo não encontrado, pulando:', target);
  process.exit(0);
}

let html = fs.readFileSync(target, 'utf8');
const before = html;

// Remove tokens de origem de desenvolvimento onde quer que apareçam na CSP.
const devOrigins = [
  /https?:\/\/localhost(:\d+)?/g,
  /https?:\/\/127\.0\.0\.1(:\d+)?/g
];
devOrigins.forEach((re) => { html = html.replace(re, ''); });

// Normaliza espaços duplicados criados pela remoção, sem tocar em ';'
html = html.replace(/connect-src([^;]*);/g, (m, group) => {
  const cleaned = group.replace(/\s{2,}/g, ' ').trim();
  return 'connect-src ' + cleaned + ';';
});

if (html !== before) {
  fs.writeFileSync(target, html, 'utf8');
  console.log('[harden-csp] origens de dev removidas da CSP de produção:', target);
} else {
  console.log('[harden-csp] nenhuma origem de dev encontrada (CSP já limpa):', target);
}
