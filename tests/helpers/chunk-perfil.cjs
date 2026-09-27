/**
 * chunk-perfil.cjs — o Perfil (chunk lazy 'config') nos testes.
 *
 * INIT_CONFIG vem dividido em arquivos: init-config.js declara o objeto e os
 * seguintes (config-backup.js, config-bancos.js) acrescentam métodos com
 * Object.assign. Testar só o primeiro deixaria metade do Perfil de fora. A
 * lista sai de LAZY_CHUNKS.config em scripts/bundle-app.cjs, a mesma que o
 * build usa, para não divergir.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

function arquivosDoPerfil() {
  const bundle = fs.readFileSync(path.join(ROOT, 'scripts', 'bundle-app.cjs'), 'utf8');
  const m = bundle.match(/\n\s*config:\s*\[([^\]]*)\]/);
  if (!m) throw new Error('[chunk-perfil] LAZY_CHUNKS.config não encontrado em scripts/bundle-app.cjs');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

const ARQUIVOS_PERFIL = arquivosDoPerfil();

/** Fonte de todos os arquivos do Perfil, na ordem do chunk (para testes de texto). */
function fontePerfil() {
  return ARQUIVOS_PERFIL.map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')).join('\n');
}

/**
 * Roda o Perfil num contexto vm, cada arquivo com o nome real (cobertura).
 * `const INIT_CONFIG` vira `var   INIT_CONFIG` (mesmo tamanho) para o objeto
 * ficar no sandbox e os arquivos seguintes o enxergarem.
 */
function rodarPerfil(ctx) {
  for (const rel of ARQUIVOS_PERFIL) {
    const arquivo = path.join(ROOT, rel);
    const codigo = fs.readFileSync(arquivo, 'utf8').replace(/\bconst INIT_CONFIG =/, 'var   INIT_CONFIG =');
    vm.runInContext(codigo, ctx, { filename: arquivo });
  }
  return vm.runInContext('INIT_CONFIG', ctx);
}

module.exports = { ARQUIVOS_PERFIL, fontePerfil, rodarPerfil };
