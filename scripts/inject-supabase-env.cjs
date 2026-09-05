#!/usr/bin/env node
/**
 * inject-supabase-env.cjs — opcional: sobrescreve _FP_ENV_* em config.js.
 * Uso: SUPABASE_URL=… SUPABASE_ANON_KEY=… node scripts/inject-supabase-env.cjs
 * Sem env vars: no-op (mantém defaults em _FP_CLOUD_*).
 * --clear: zera _FP_ENV_* de volta para ''.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const cfgPath = path.join(__dirname, '..', 'js', 'core', 'config.js');
let src = fs.readFileSync(cfgPath, 'utf8');

if (!/var _FP_ENV_URL\s*=/.test(src) || !/var _FP_ENV_ANON\s*=/.test(src)) {
  console.error('[inject-supabase-env] _FP_ENV_URL/_FP_ENV_ANON não encontrados em config.js');
  process.exit(1);
}

function escapeJsString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const clear = process.argv.includes('--clear');
const url = clear ? '' : String(process.env.SUPABASE_URL || '').trim();
const anon = clear ? '' : String(process.env.SUPABASE_ANON_KEY || '').trim();

if (!clear && (!url || !anon)) {
  console.log('[inject-supabase-env] sem SUPABASE_URL/ANON_KEY — mantém defaults');
  process.exit(0);
}

if (!clear) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
  } catch (e) {
    console.error('[inject-supabase-env] SUPABASE_URL inválida');
    process.exit(1);
  }
}

src = src.replace(/var _FP_ENV_URL\s*=\s*'[^']*'/, "var _FP_ENV_URL = '" + escapeJsString(url) + "'");
src = src.replace(/var _FP_ENV_ANON\s*=\s*'[^']*'/, "var _FP_ENV_ANON = '" + escapeJsString(anon) + "'");
fs.writeFileSync(cfgPath, src, 'utf8');
console.log('[inject-supabase-env]', clear ? 'limpo' : 'URL=' + url);
