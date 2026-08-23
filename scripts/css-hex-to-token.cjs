#!/usr/bin/env node
/**
 * css-hex-to-token.cjs — troca hex literal pelo token de mesmo valor.
 *
 * Regra única e deliberadamente conservadora: só substitui quando o valor
 * hexadecimal é **exatamente igual** ao de um token já declarado no `:root`.
 * A troca é, por construção, visualmente nula — o valor computado é o mesmo.
 *
 * O que NÃO faz: aproximar cor parecida para o token mais próximo. Isso
 * mudaria a aparência e exigiria revisão visual, que a análise estática não
 * substitui. Os hex sem equivalente ficam como estão e aparecem no relatório
 * de `check-css-tokens.cjs`.
 *
 * Uso: node scripts/css-hex-to-token.cjs [--dry]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cssDir = path.join(root, 'css');
const dsPath = path.join(cssDir, 'design-system.css');
const dryRun = process.argv.includes('--dry');

/** Normaliza #abc → #aabbcc, minúsculo. */
function normalizar(hex) {
  const v = hex.toLowerCase();
  if (v.length === 4) return '#' + v.slice(1).split('').map(c => c + c).join('');
  return v;
}

/** Mapa valor → nome do token, lido apenas do bloco :root (tema claro). */
function lerTokens() {
  const css = fs.readFileSync(dsPath, 'utf8');
  const bloco = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (!bloco) throw new Error('bloco :root não encontrado em design-system.css');

  const mapa = new Map();
  for (const [, nome, valor] of bloco[1].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
    const v = normalizar(valor);
    // Primeiro token vence: nomes semânticos vêm antes dos aliases no arquivo,
    // e é o nome semântico que queremos ver no CSS de componente.
    if (!mapa.has(v)) mapa.set(v, nome);
  }
  return mapa;
}

function listarCss(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listarCss(full));
    else if (ent.name.endsWith('.css')) out.push(full);
  }
  return out;
}

const tokens = lerTokens();
let totalTrocas = 0;
let arquivos = 0;
const semToken = new Map();

for (const file of listarCss(cssDir)) {
  if (file === dsPath) continue; // é a origem dos tokens

  const original = fs.readFileSync(file, 'utf8');
  let trocas = 0;

  // Preserva comentários: substituir hex dentro de /* ... */ não muda nada no
  // resultado e estraga a documentação — um comentário que explica "#242a27"
  // vira "var(--color-gray-800)" e perde justamente o valor que ilustrava.
  const comentarios = [];
  const semComentarios = original.replace(/\/\*[\s\S]*?\*\//g, (c) => {
    comentarios.push(c);
    return `\u0000C${comentarios.length - 1}\u0000`;
  });

  const novo = semComentarios.replace(/#[0-9a-fA-F]{3,6}\b/g, (hex) => {
    const v = normalizar(hex);
    const nome = tokens.get(v);
    if (!nome) {
      semToken.set(v, (semToken.get(v) || 0) + 1);
      return hex;
    }
    trocas++;
    return `var(--${nome})`;
  });

  const final = novo.replace(/\u0000C(\d+)\u0000/g, (_m, i) => comentarios[Number(i)]);

  if (trocas > 0) {
    if (!dryRun) fs.writeFileSync(file, final);
    console.log(`[hex→token] ${path.relative(root, file)}: ${trocas}`);
    totalTrocas += trocas;
    arquivos++;
  }
}

console.log(`\n[hex→token] ${totalTrocas} substituição(ões) em ${arquivos} arquivo(s)${dryRun ? ' (simulação)' : ''}`);
console.log(`[hex→token] ${[...semToken.values()].reduce((a, b) => a + b, 0)} hex sem token equivalente permanecem`);

if (semToken.size) {
  const top = [...semToken.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('\n  Mais frequentes sem token (candidatos a virar token novo):');
  top.forEach(([v, c]) => console.log(`    ${String(c).padStart(4)}  ${v}`));
}
