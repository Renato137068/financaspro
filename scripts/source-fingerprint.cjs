#!/usr/bin/env node
/**
 * source-fingerprint.cjs — carimba em dist/ o hash do código-fonte que o gerou.
 *
 * Serve para responder "este dist/ foi gerado a partir do código atual?" sem
 * depender de mtime. mtime mente: qualquer script que regrave um arquivo com o
 * MESMO conteúdo (set-build-mode, inject-supabase-env --clear, um checkout)
 * deixa o fonte "mais novo" que o build sem que nada tenha mudado. Foi assim
 * que os testes de precache ficaram pulados no CI sem ninguém perceber.
 *
 * Roda como último passo de `npm run build`, depois de todo script que escreve
 * em js/ ou css/ (inject-supabase-env, setup-fonts).
 *
 * Uso:
 *   node scripts/source-fingerprint.cjs      # grava dist/.source-fingerprint
 *   require('./source-fingerprint.cjs')      # { calcular, ler, ARQUIVO }
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ARQUIVO = path.join(root, 'dist', '.source-fingerprint');

// O que entra no build do app: o mesmo recorte que a guarda de mtime usava.
const ENTRADAS = ['css', 'js', 'index.html'];

/** Hash SHA-256 de caminho + conteúdo de cada arquivo, em ordem estável. */
function calcular() {
  const arquivos = [];
  for (const entrada of ENTRADAS) {
    (function varrer(rel) {
      const full = path.join(root, rel);
      if (!fs.existsSync(full)) return;
      if (fs.statSync(full).isDirectory()) {
        for (const f of fs.readdirSync(full)) varrer(path.posix.join(rel, f));
      } else {
        arquivos.push(rel);
      }
    })(entrada);
  }
  arquivos.sort();

  const hash = crypto.createHash('sha256');
  for (const rel of arquivos) {
    hash.update(rel + '\0');
    hash.update(fs.readFileSync(path.join(root, rel)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** Hash gravado no último build, ou null se o dist/ não tem carimbo. */
function ler() {
  try { return fs.readFileSync(ARQUIVO, 'utf8').trim() || null; } catch { return null; }
}

module.exports = { calcular, ler, ARQUIVO };

if (require.main === module) {
  if (!fs.existsSync(path.dirname(ARQUIVO))) {
    console.error('[source-fingerprint] dist/ ausente — rode o build antes.');
    process.exit(1);
  }
  const fp = calcular();
  fs.writeFileSync(ARQUIVO, fp + '\n');
  console.log('[source-fingerprint]', fp.slice(0, 12), '→', path.relative(root, ARQUIVO));
}
