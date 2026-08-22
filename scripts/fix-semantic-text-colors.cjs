#!/usr/bin/env node
/**
 * fix-semantic-text-colors.cjs — troca cor de TEXTO semântica pelo token acessível.
 *
 * Script de migração pontual e idempotente. Substitui apenas declarações da
 * propriedade `color:` que usam os tons vivos (--color-success, --color-warning,
 * --color-danger, --color-info) pelo alias -text correspondente, que alterna
 * entre um tom escurecido no tema claro e um tom claro no tema escuro.
 *
 * NÃO toca em `background`, `border-color`, `fill` ou `stroke`: ali os tons
 * vivos são corretos. O critério WCAG para elemento não-textual é 3:1, e todos
 * passam — o problema é exclusivamente quando a cor vira texto.
 *
 * Uso: node scripts/fix-semantic-text-colors.cjs [--dry]
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cssDir = path.join(root, 'css');
const dryRun = process.argv.includes('--dry');

const SEMANTICAS = ['success', 'warning', 'danger', 'info'];

// Arquivos onde a cor viva sobre fundo colorido é correta: o toast tem fundo
// semântico e texto branco, um caso que se resolve por outro caminho.
const IGNORAR = new Set(['toasts.css']);

function listarCss(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listarCss(full));
    else if (ent.name.endsWith('.css')) out.push(full);
  }
  return out;
}

let totalTrocas = 0;
let arquivosTocados = 0;

for (const file of listarCss(cssDir)) {
  const nome = path.basename(file);
  if (IGNORAR.has(nome)) continue;
  if (file.includes('design-system.css')) continue; // é a fonte dos tokens

  let src = fs.readFileSync(file, 'utf8');
  let trocas = 0;

  for (const s of SEMANTICAS) {
    // Só a propriedade `color` exata — precedida por início de linha, `{` ou `;`.
    // O lookbehind evita casar `border-color`, `background-color`, `outline-color`.
    const re = new RegExp(`(^|[{;\\s])color:\\s*var\\(--color-${s}\\)`, 'gm');
    src = src.replace(re, (m, pre) => {
      // Não converte o que já foi convertido numa execução anterior.
      trocas++;
      return `${pre}color: var(--color-${s}-text)`;
    });
  }

  if (trocas > 0) {
    if (!dryRun) fs.writeFileSync(file, src);
    console.log(`[cor-texto] ${path.relative(root, file)}: ${trocas} troca(s)`);
    totalTrocas += trocas;
    arquivosTocados++;
  }
}

console.log(`[cor-texto] ${totalTrocas} declaração(ões) em ${arquivosTocados} arquivo(s)${dryRun ? ' (simulação)' : ''}`);
