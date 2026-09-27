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

// FP_CONFIG_JS: alvo alternativo. Os testes apontam para uma cópia — reescrever
// o config.js real no meio da suíte muda o arquivo sob as outras suítes.
const cfgPath = process.env.FP_CONFIG_JS || path.join(__dirname, '..', 'js', 'core', 'config.js');
let src = fs.readFileSync(cfgPath, 'utf8');

if (!/FP_BUILD_MODE\s*=\s*'(local|cloud)'/.test(src)) {
  console.error('[set-build-mode] FP_BUILD_MODE não encontrado em config.js');
  process.exit(1);
}

src = src.replace(/FP_BUILD_MODE\s*=\s*'(local|cloud)'/, "FP_BUILD_MODE = '" + mode + "'");
fs.writeFileSync(cfgPath, src, 'utf8');
console.log('[set-build-mode] FP_BUILD_MODE =', mode);
