#!/usr/bin/env node
/**
 * check-css-tokens.cjs — congela a dívida de valores literais no CSS.
 *
 * Mesma estratégia do `lint:changed` no JavaScript: a dívida existente é
 * tolerada, o código novo não. O script conta cores hexadecimais e tamanhos de
 * fonte declarados fora do design system e compara com um teto registrado em
 * `.css-debt.json`. Se o número sobe, o build falha; se desce, o script avisa
 * para baixar o teto no mesmo commit.
 *
 * Por que um checker próprio em vez de Stylelint: o projeto já tem quatro
 * verificadores nesse formato (XSS, contraste, bundle, precache) e nenhum
 * exige dependência nova. Uma dependência a mais no build precisa se pagar —
 * aqui a regra cabe em cem linhas.
 *
 * Uso:
 *   node scripts/check-css-tokens.cjs              # falha se a dívida cresceu
 *   node scripts/check-css-tokens.cjs --update     # regrava o teto
 *   node scripts/check-css-tokens.cjs --report     # só relata, sai 0
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cssDir = path.join(root, 'css');
const dividaPath = path.join(root, '.css-debt.json');

const atualizar = process.argv.includes('--update');
const reportOnly = process.argv.includes('--report');

// design-system.css é onde os literais DEVEM viver: é a definição dos tokens.
const ISENTOS = new Set(['design-system.css']);

function listarCss(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listarCss(full));
    else if (ent.name.endsWith('.css')) out.push(full);
  }
  return out;
}

/** Remove comentários — o que está documentado ali não é código. */
function semComentarios(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function medir() {
  const porArquivo = {};
  let hex = 0;
  let fontes = 0;

  for (const file of listarCss(cssDir)) {
    if (ISENTOS.has(path.basename(file))) continue;

    const src = semComentarios(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(root, file).replace(/\\/g, '/');

    // O lookahead evita falso-positivo com seletores de ID cujo nome começa
    // com dígitos hex (ex.: #aba-novo, #aba-resumo → "#aba" não é cor). Uma
    // cor real é seguida por ; , ) espaço ou fim — nunca por letra/dígito/-.
    const h = (src.match(/#[0-9a-fA-F]{3,6}(?![\w-])/g) || []).length;
    // Só px cru: rem/em/% e var() seguem a escala ou são intencionais.
    const f = (src.match(/font-size:\s*\d+px/g) || []).length;

    if (h || f) porArquivo[rel] = { hex: h, fontes: f };
    hex += h;
    fontes += f;
  }

  return { hex, fontes, porArquivo };
}

const medida = medir();
const total = medida.hex + medida.fontes;

let teto = null;
if (fs.existsSync(dividaPath)) {
  try { teto = JSON.parse(fs.readFileSync(dividaPath, 'utf8')); } catch { teto = null; }
}

console.log('\n[css-tokens] Valores literais fora do design system\n');
console.log(`  cores hexadecimais : ${String(medida.hex).padStart(4)}`);
console.log(`  font-size em px    : ${String(medida.fontes).padStart(4)}`);
console.log(`  total              : ${String(total).padStart(4)}`);

if (atualizar) {
  fs.writeFileSync(dividaPath, JSON.stringify({
    _comentario: 'Teto de valores literais no CSS. Só pode DIMINUIR. Regenerado por scripts/check-css-tokens.cjs --update',
    hex: medida.hex,
    fontes: medida.fontes,
    total,
    atualizadoEm: new Date().toISOString().slice(0, 10),
  }, null, 2) + '\n');
  console.log(`\n[css-tokens] teto regravado em ${path.basename(dividaPath)}\n`);
  process.exit(0);
}

if (!teto) {
  console.log('\n[css-tokens] sem teto registrado — rode com --update para criar.\n');
  process.exit(reportOnly ? 0 : 1);
}

console.log(`  teto registrado    : ${String(teto.total).padStart(4)}  (${teto.atualizadoEm})`);

const piores = Object.entries(medida.porArquivo)
  .sort((a, b) => (b[1].hex + b[1].fontes) - (a[1].hex + a[1].fontes))
  .slice(0, 6);

if (piores.length) {
  console.log('\n  Maior concentração:');
  for (const [arq, v] of piores) {
    console.log(`    ${String(v.hex + v.fontes).padStart(4)}  ${arq}  (${v.hex} cores, ${v.fontes} fontes)`);
  }
}

if (total > teto.total) {
  console.error(`\n[css-tokens] ✗ a dívida cresceu: ${total} contra teto de ${teto.total}.\n`);
  console.error('  Use um token do design-system.css em vez do valor literal.');
  console.error('  Se não existir token adequado, crie um — com nome semântico,');
  console.error('  não descritivo (--color-danger, não --vermelho).');
  console.error('  Aumentar o teto exige justificativa no mesmo commit.\n');
  process.exit(reportOnly ? 0 : 1);
}

if (total < teto.total) {
  console.log(`\n[css-tokens] ✓ dívida reduzida em ${teto.total - total}. Rode --update para travar o novo teto.\n`);
} else {
  console.log('\n[css-tokens] ✓ dívida estável\n');
}
