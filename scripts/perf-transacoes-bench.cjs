#!/usr/bin/env node
/**
 * perf-transacoes-bench.cjs — benchmark rápido de filtros com histórico grande.
 *
 * Uso: node scripts/perf-transacoes-bench.cjs [--n 5000]
 */
'use strict';

const { loadCoreGlobals } = require('./lib/load-core.cjs');

const n = Number(process.argv.find((a, i) => process.argv[i - 1] === '--n') || 5000);

const { resetFixtures } = loadCoreGlobals();
resetFixtures();

for (let i = 0; i < n; i++) {
  const mes = (i % 12) + 1;
  DADOS.salvarTransacao({
    id: 'bench-' + i,
    tipo: i % 3 === 0 ? 'receita' : 'despesa',
    valor: (i % 50) + 1,
    categoria: i % 2 === 0 ? 'alimentacao' : 'transporte',
    data: '2025-' + String(mes).padStart(2, '0') + '-15',
    descricao: 'Bench ' + i,
    banco: 'Nubank',
    cartao: '',
  });
}
TRANSACOES.invalidateCache();

function bench(label, fn, reps) {
  reps = reps || 100;
  const t0 = Date.now();
  for (let i = 0; i < reps; i++) fn();
  const ms = Date.now() - t0;
  console.log(label + ': ' + ms + 'ms (' + reps + 'x, ~' + (ms / reps).toFixed(2) + 'ms/op)');
}

bench('obter mes/ano (indexado)', function() {
  TRANSACOES.obter({ mes: 8, ano: 2025 });
}, 200);

bench('obterRecentes(3)', function() {
  TRANSACOES.obterRecentes(3);
}, 200);

DADOS.salvarConfig({
  orcamentos: {
    alimentacao: { limite: 5000, definidoEm: '2026-01-01T00:00:00.000Z' },
    transporte: { limite: 3000, definidoEm: '2026-01-01T00:00:00.000Z' },
  },
});
ORCAMENTO.init();

bench('ORCAMENTO.obterStatusTodos', function() {
  ORCAMENTO.obterStatusTodos(8, 2025);
}, 100);

console.log('Transações:', n, '| monthIndex:', !!TRANSACOES._ensureMonthIndex());
