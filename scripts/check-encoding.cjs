#!/usr/bin/env node
/**
 * scripts/check-encoding.cjs — reprova qualquer caractere de substituição
 * Unicode (U+FFFD) no fonte rastreado pelo git.
 *
 * NB: este arquivo NAO pode conter o U+FFFD literal, senão o guard reprova a
 * si mesmo. Onde o glifo precisa aparecer (na mensagem ao usuário) ele é
 * construído em tempo de execução com String.fromCharCode(0xFFFD) — ver GLIFO.
 *
 * Por que existe: a auditoria pré-beta encontrou 48 acentos corrompidos em
 * js/core/config.js — a acentuação de palavras como "Alimentacao" virava
 * "Alimenta" + U+FFFD + "ao". O U+FFFD é o que sobra quando bytes que não são
 * UTF-8 válido (um arquivo salvo em latin1/CP-1252, por exemplo) são relidos e
 * regravados como UTF-8. Nenhum grep pega isso antes de virar bug de tela; um
 * passo de CI barato pega.
 *
 * Escopo: só arquivos de TEXTO rastreados (git ls-files), por extensão — nunca
 * binários. Sai com código 1 e lista arquivo:linha:coluna do primeiro achado
 * em cada arquivo; sai 0 quando limpo.
 */
'use strict';

const fs = require('fs');
const { execSync } = require('child_process');

// Extensões de texto onde um U+FFFD é sempre um defeito. Binários (png, aab,
// woff, ico, keystore…) ficam de fora de propósito.
const TEXT_EXT = new Set([
  'js', 'cjs', 'mjs', 'ts', 'jsx', 'tsx',
  'json', 'css', 'scss', 'less',
  'html', 'htm', 'svg', 'xml',
  'md', 'txt', 'sql', 'yml', 'yaml',
  'sh', 'env', 'properties', 'gradle', 'kt', 'java',
]);

// Bytes UTF-8 do caractere de substituição U+FFFD, e o glifo em si (montado em
// runtime para não colocar o literal no fonte — o próprio guard o reprovaria).
const FFFD = Buffer.from([0xef, 0xbf, 0xbd]);
const GLIFO = String.fromCharCode(0xFFFD);

function tracked() {
  const out = execSync('git ls-files -z', { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  return out
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

function extOf(file) {
  const dot = file.lastIndexOf('.');
  if (dot < 0) return '';
  return file.slice(dot + 1).toLowerCase();
}

function localizar(buf) {
  // Devolve {linha, coluna, total} do primeiro U+FFFD, contando linhas até ele.
  const idx = buf.indexOf(FFFD);
  if (idx < 0) return null;
  let linha = 1;
  let inicioLinha = 0;
  for (let i = 0; i < idx; i++) {
    if (buf[i] === 0x0a) { linha++; inicioLinha = i + 1; }
  }
  // coluna aproximada em bytes desde o início da linha (basta para localizar)
  const coluna = idx - inicioLinha + 1;
  let total = 0;
  let from = 0;
  for (;;) {
    const at = buf.indexOf(FFFD, from);
    if (at < 0) break;
    total++;
    from = at + FFFD.length;
  }
  return { linha, coluna, total };
}

function main() {
  const arquivos = tracked().filter((f) => TEXT_EXT.has(extOf(f)));
  const ruins = [];

  for (const f of arquivos) {
    let buf;
    try {
      buf = fs.readFileSync(f);
    } catch (e) {
      // arquivo apagado do índice mas ainda listado — ignora
      continue;
    }
    const hit = localizar(buf);
    if (hit) ruins.push({ f, ...hit });
  }

  if (ruins.length) {
    console.error(`\n✗ Caractere de substituição U+FFFD ("${GLIFO}") encontrado no fonte:\n`);
    for (const r of ruins) {
      const plural = r.total > 1 ? ` (${r.total} ocorrências)` : '';
      console.error(`  ${r.f}:${r.linha}:${r.coluna}${plural}`);
    }
    console.error(
      '\nIsso é acentuação corrompida (arquivo salvo fora de UTF-8 e relido como UTF-8).'
      + '\nAbra o arquivo no primeiro local apontado, reescreva o(s) caractere(s) correto(s)'
      + '\ne salve como UTF-8. Veja scripts/check-encoding.cjs para o racional.\n'
    );
    process.exit(1);
  }

  console.log(`✓ Encoding: ${arquivos.length} arquivos de texto sem U+FFFD.`);
}

main();
