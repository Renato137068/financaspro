#!/usr/bin/env node
/**
 * check-bundle-budget.cjs — orçamento de peso do build de produção.
 *
 * Regressão de performance é invisível: ninguém abre um PR dizendo "isto
 * adiciona 300 KB ao primeiro acesso". Este script torna o custo explícito e
 * falha o CI quando um limite é ultrapassado.
 *
 * O número que mais importa é o PRECACHE TOTAL: é exatamente quantos bytes o
 * service worker baixa no primeiro acesso, antes de o usuário conseguir usar
 * qualquer coisa — tipicamente em 4G, num celular modesto.
 *
 * Uso:
 *   node scripts/check-bundle-budget.cjs            # falha se estourar
 *   node scripts/check-bundle-budget.cjs --report   # só relata, sai 0
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const reportOnly = process.argv.includes('--report');

const KB = 1024;

// Limites com folga deliberada sobre o valor atual: o objetivo é barrar um
// salto acidental, não travar o desenvolvimento em cada quilobyte.
const BUDGETS = {
  // 1350→1360 KB (2026-09-12): acompanha o +7 KB do index.html da
  // reestruturação da aba Perfil, mantendo folga em vez de ficar no limite.
  precacheTotal: { max: 1360 * KB, label: 'Precache total (1º acesso)' },
  appBundle: { max: 580 * KB, label: 'js/app.bundle.js', file: 'js/app.bundle.js' },
  vendorBundle: { max: 260 * KB, label: 'js/vendor.bundle.js', file: 'js/vendor.bundle.js' },
  cssBundle: { max: 300 * KB, label: 'CSS bundle', glob: /^css\/index-.*\.css$/ },
  // 100→112 KB (2026-09-12): reestruturação da aba Perfil em menu + sub-telas
  // (divulgação progressiva) adiciona ~7 KB de markup — aumento intencional.
  indexHtml: { max: 112 * KB, label: 'index.html', file: 'index.html' },
};

function size(rel) {
  const full = path.join(dist, rel);
  return fs.existsSync(full) ? fs.statSync(full).size : 0;
}

function findByPattern(re) {
  const results = [];
  (function walk(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(path.join(dir, ent.name), rel);
      else if (re.test(rel)) results.push(rel);
    }
  })(dist, '');
  return results;
}

/** Soma o peso real das URLs listadas no precache do service worker. */
function precacheStats() {
  const swPath = path.join(dist, 'sw.js');
  if (!fs.existsSync(swPath)) return null;

  const sw = fs.readFileSync(swPath, 'utf8');
  const bloco = sw.match(/const urlsParaCache = (\[[\s\S]*?\]);/);
  if (!bloco) return null;

  let urls;
  try { urls = JSON.parse(bloco[1]); } catch { return null; }

  let total = 0;
  const ausentes = [];
  const itens = [];
  // "/" e "/index.html" apontam para o mesmo arquivo — contar as duas entradas
  // inflaria o total em ~80 KB e daria uma falsa sensação de folga.
  const jaContado = new Set();

  for (const url of urls) {
    const rel = url.replace(/^\//, '') || 'index.html';
    if (jaContado.has(rel)) continue;
    jaContado.add(rel);

    const bytes = size(rel);
    if (bytes === 0) ausentes.push(url);
    else { total += bytes; itens.push([rel, bytes]); }
  }

  itens.sort((a, b) => b[1] - a[1]);
  return { total, count: urls.length, ausentes, itens };
}

function fmt(bytes) {
  return `${(bytes / KB).toFixed(0)} KB`;
}

if (!fs.existsSync(dist)) {
  console.error('[bundle-budget] dist/ ausente — rode `npm run build` antes.');
  process.exit(reportOnly ? 0 : 1);
}

const falhas = [];
console.log('\n[bundle-budget] Orçamento do build de produção\n');

const pc = precacheStats();
if (pc) {
  const b = BUDGETS.precacheTotal;
  const ok = pc.total <= b.max;
  if (!ok) falhas.push(`${b.label}: ${fmt(pc.total)} (limite ${fmt(b.max)})`);
  console.log(`  ${ok ? '✓' : '✗'} ${b.label.padEnd(30)} ${fmt(pc.total).padStart(9)}  / ${fmt(b.max)}  (${pc.count} URLs)`);

  if (pc.ausentes.length) {
    console.log(`\n  ⚠ ${pc.ausentes.length} URL(s) no precache não existem em dist/:`);
    pc.ausentes.slice(0, 5).forEach(u => console.log(`      ${u}`));
    falhas.push(`precache referencia ${pc.ausentes.length} arquivo(s) inexistente(s)`);
  }
} else {
  console.log('  ⚠ não foi possível ler o precache de dist/sw.js');
}

for (const [, b] of Object.entries(BUDGETS)) {
  if (!b.file && !b.glob) continue;
  const bytes = b.file ? size(b.file) : findByPattern(b.glob).reduce((s, f) => s + size(f), 0);
  if (bytes === 0) { console.log(`  – ${b.label.padEnd(30)} ${'ausente'.padStart(9)}`); continue; }
  const ok = bytes <= b.max;
  if (!ok) falhas.push(`${b.label}: ${fmt(bytes)} (limite ${fmt(b.max)})`);
  console.log(`  ${ok ? '✓' : '✗'} ${b.label.padEnd(30)} ${fmt(bytes).padStart(9)}  / ${fmt(b.max)}`);
}

if (pc && pc.itens.length) {
  console.log('\n  Maiores itens do precache:');
  pc.itens.slice(0, 8).forEach(([rel, bytes]) => {
    console.log(`      ${fmt(bytes).padStart(9)}  ${rel}`);
  });
}

if (falhas.length && !reportOnly) {
  console.error('\n[bundle-budget] ✗ orçamento estourado:\n');
  falhas.forEach(f => console.error(`   · ${f}`));
  console.error('\n  Se o aumento for intencional, ajuste BUDGETS neste script');
  console.error('  no mesmo commit — assim a decisão fica registrada no histórico.\n');
  process.exit(1);
}

console.log(`\n[bundle-budget] ✓ dentro do orçamento\n`);
