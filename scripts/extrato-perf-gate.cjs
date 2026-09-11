#!/usr/bin/env node
/**
 * extrato-perf-gate.cjs — gate de performance para extrato com histórico grande.
 * Falha o CI se obterRecentes ou slice virtual degradarem além do teto da auditoria.
 *
 * Uso: node scripts/extrato-perf-gate.cjs [--n 10000]
 */
'use strict';

const { loadCoreGlobals } = require('./lib/load-core.cjs');

const args = process.argv.slice(2);
const nArg = args.find(function(a, i) { return args[i - 1] === '--n'; });
const N = Number(nArg || 10000);
const REPS_RECENTES = 50;
const REPS_SLICE = 200;
const MAX_MS_RECENTES = 12;
const MAX_MS_SLICE = 0.5;

const { resetFixtures } = loadCoreGlobals();
resetFixtures();

for (let i = 0; i < N; i++) {
  const mes = (i % 12) + 1;
  DADOS.salvarTransacao({
    id: 'gate-' + i,
    tipo: i % 3 === 0 ? 'receita' : 'despesa',
    valor: (i % 50) + 1,
    categoria: i % 2 === 0 ? 'alimentacao' : 'transporte',
    data: '2025-' + String(mes).padStart(2, '0') + '-15',
    descricao: 'Gate ' + i,
    banco: 'Nubank',
    cartao: '',
  });
}
TRANSACOES.invalidateCache();

function medianaMs(fn, reps) {
  const times = [];
  for (let i = 0; i < reps; i++) {
    const t0 = process.hrtime.bigint();
    fn();
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort(function(a, b) { return a - b; });
  return times[Math.floor(times.length / 2)];
}

const msRecentes = medianaMs(function() {
  TRANSACOES.obterRecentes(3);
}, REPS_RECENTES);

const todas = DADOS.getTransacoes();
const msSlice = medianaMs(function() {
  const start = Math.floor(todas.length / 2);
  todas.slice(start, start + 60);
}, REPS_SLICE);

console.log('[extrato-perf-gate] transações:', N);
console.log('[extrato-perf-gate] obterRecentes(3) mediana:', msRecentes.toFixed(2), 'ms/op (teto', MAX_MS_RECENTES + ')');
console.log('[extrato-perf-gate] virtual slice mediana:', msSlice.toFixed(4), 'ms/op (teto', MAX_MS_SLICE + ')');

let falhou = false;
if (msRecentes > MAX_MS_RECENTES) {
  console.error('[extrato-perf-gate] FALHA: obterRecentes acima do teto');
  falhou = true;
}
if (msSlice > MAX_MS_SLICE) {
  console.error('[extrato-perf-gate] FALHA: slice virtual acima do teto');
  falhou = true;
}

if (falhou) process.exit(1);
console.log('[extrato-perf-gate] OK');
process.exit(0);
