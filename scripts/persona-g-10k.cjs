#!/usr/bin/env node
/**
 * persona-g-10k.cjs — simulação anual Persona G com 10k+ transações.
 * Valida consistência financeira e performance após histórico longo.
 *
 * Uso: node scripts/persona-g-10k.cjs [--n 10500]
 */
'use strict';

const { loadCoreGlobals } = require('./lib/load-core.cjs');

const args = process.argv.slice(2);
const nArg = args.find(function(a, i) { return args[i - 1] === '--n'; });
const N = Math.max(10000, Number(nArg || 10500));
const MAX_MS_RECENTES = 12;
const REPS = 30;

const { resetFixtures } = loadCoreGlobals();
resetFixtures();

const contaA = 'aaaaaaaa-bbbb-4ccc-000000000001';
const contaB = 'bbbbbbbb-cccc-4ddd-000000000001';
DADOS.salvarContas([
  { id: contaA, nome: 'Nubank-G', tipo: 'corrente' },
  { id: contaB, nome: 'Poupanca-G', tipo: 'poupanca' },
]);
DADOS.salvarConfig({
  nome: 'Persona G stress',
  renda: 8000,
  orcamentos: {
    alimentacao: { limite: 1200, definidoEm: '2026-01-01T00:00:00.000Z' },
    transporte: { limite: 600, definidoEm: '2026-01-01T00:00:00.000Z' },
  },
});
CONTAS.init();
TRANSACOES.init();
ORCAMENTO.init();

function isoDate(y, m, d) {
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function pickDate(i) {
  const y = 2018 + (i % 9);
  const m = 1 + (i % 12);
  const d = 1 + (i % 28);
  return isoDate(y, m, d);
}

for (let i = 0; i < N; i++) {
  const data = pickDate(i);
  const tipo = i % 4 === 0 ? 'receita' : 'despesa';
  const cat = tipo === 'receita' ? 'salario' : (i % 2 ? 'alimentacao' : 'transporte');
  DADOS.salvarTransacao({
    id: 'pg-' + i,
    tipo: tipo,
    valor: Math.round(((i % 500) + 1 + (i % 97) * 0.01) * 100) / 100,
    categoria: cat,
    data: data,
    descricao: 'PersonaG ' + i,
    banco: 'Nubank-G',
    cartao: '',
  });
}
TRANSACOES.invalidateCache();

const txs = DADOS.getTransacoes();
const resumo = TRANSACOES.obterResumoMes(8, 2026);
let rec = 0;
let des = 0;
txs.forEach(function(t) {
  if (!t || t.deletedAt) return;
  if (t.data && t.data.slice(0, 7) === '2026-08') {
    if (t.tipo === 'receita') rec += Math.round(t.valor * 100);
    else if (t.tipo === 'despesa') des += Math.round(t.valor * 100);
  }
});
const manualSaldo = (rec - des) / 100;

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
  TRANSACOES.obterRecentes(5);
}, REPS);

console.log('[persona-g-10k] transações:', txs.length);
console.log('[persona-g-10k] resumo ago/2026 saldo:', resumo.saldo, '| manual:', manualSaldo);
console.log('[persona-g-10k] obterRecentes(5) mediana:', msRecentes.toFixed(2), 'ms/op');

let falhou = false;
if (Math.abs(resumo.saldo - manualSaldo) > 0.02) {
  console.error('[persona-g-10k] FALHA: resumo diverge do cálculo manual');
  falhou = true;
}
if (txs.length < 10000) {
  console.error('[persona-g-10k] FALHA: menos de 10k transações');
  falhou = true;
}
if (msRecentes > MAX_MS_RECENTES) {
  console.error('[persona-g-10k] FALHA: obterRecentes acima do teto');
  falhou = true;
}

if (falhou) process.exit(1);
console.log('[persona-g-10k] OK');
process.exit(0);
