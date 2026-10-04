#!/usr/bin/env node
/**
 * set-build-mode.cjs — alterna CONFIG entre cloud (Play Store) e local (piloto).
 * Uso: node scripts/set-build-mode.cjs local|cloud
 */
'use strict';
const fs = require('fs');
const path = require('path');

const mode = String(process.argv[2] || '').toLowerCase();
if (mode !== 'local' && mode !== 'cloud') {
  console.error('Uso: node scripts/set-build-mode.cjs local|cloud');
  process.exit(1);
}

// FP_CONFIG_PATH: outro alvo (os testes usam uma cópia, nunca o config.js real,
// que outros workers do jest estão lendo ao mesmo tempo).
const cfgPath = process.env.FP_CONFIG_PATH || path.join(__dirname, '..', 'js', 'core', 'config.js');
let src = fs.readFileSync(cfgPath, 'utf8');

if (!/FP_BUILD_MODE\s*=\s*'(local|cloud)'/.test(src)) {
  console.error('[set-build-mode] FP_BUILD_MODE não encontrado em config.js');
  process.exit(1);
}

src = src.replace(/FP_BUILD_MODE\s*=\s*'(local|cloud)'/, "FP_BUILD_MODE = '" + mode + "'");
// Temporário + rename: quem lê o arquivo no meio da escrita vê o antigo ou o
// novo inteiro, nunca um pedaço.
const tmpPath = cfgPath + '.' + process.pid + '.tmp';
fs.writeFileSync(tmpPath, src, 'utf8');
fs.renameSync(tmpPath, cfgPath);
console.log('[set-build-mode] FP_BUILD_MODE =', mode);
