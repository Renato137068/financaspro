#!/usr/bin/env node
/**
 * auditoria-verificacao-fixes.cjs
 *
 * Checklist determinístico dos achados P1/P2 da auditoria matinal (20260826).
 * Cada probe reproduz o cenário original e marca OK/FALHA.
 *
 * Uso: node scripts/auditoria-verificacao-fixes.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, loadCoreGlobals } = require('./lib/load-core.cjs');

const OUT_DIR = path.join(ROOT, 'docs', 'audit-runs');
const OUT_JSON = path.join(OUT_DIR, 'verificacao-fixes-20260826.json');
const OUT_MD = path.join(OUT_DIR, 'verificacao-fixes-20260826.md');

const UUID_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const UUID_B = '9c858901-8a57-4791-81fe-4c455b099bc9';

function check(id, titulo, severidade, fn) {
  try {
    const out = fn();
    if (out && out.skip) {
      return { id, titulo, severidade, status: 'SKIP', detalhe: out.motivo || '' };
    }
    if (out && out.ok === false) {
      return { id, titulo, severidade, status: 'FALHA', detalhe: out.motivo || '', evidencia: out.evidencia };
    }
    return { id, titulo, severidade, status: 'OK', detalhe: (out && out.detalhe) || '' };
  } catch (e) {
    return { id, titulo, severidade, status: 'ERRO', detalhe: e.message || String(e) };
  }
}

function main() {
  const { resetFixtures } = loadCoreGlobals();
  const probes = [];

  // ─── P1: saldo do mês realizado vs futuros (repro exato da manhã) ─────────
  probes.push(check('P1-01', 'Saldo realizado exclui lançamentos futuros no mês', 'P1', () => {
    resetFixtures();
    DADOS.salvarTransacao({
      id: 'tx1', tipo: 'receita', valor: 5000, categoria: 'salario',
      data: '2026-08-01', descricao: 'Salário', banco: 'Nubank', cartao: '',
    });
    DADOS.salvarTransacao({
      id: 'tx2', tipo: 'despesa', valor: 400, categoria: 'outro',
      data: '2026-08-31', descricao: 'Futuro', banco: 'Nubank', cartao: '',
    });
    TRANSACOES.invalidateCache();
    const completo = TRANSACOES.obterResumoMes(8, 2026);
    const realizado = TRANSACOES.obterResumoMes(8, 2026, { ate: '2026-08-26' });
    if (completo.saldo !== 4600) {
      return { ok: false, motivo: 'Mês completo deveria ser 4600', evidencia: { completo } };
    }
    if (realizado.saldo !== 5000) {
      return { ok: false, motivo: 'Realizado deveria ser 5000 (sem despesa 31/08)', evidencia: { realizado } };
    }
    return { detalhe: 'completo=4600, realizado=5000' };
  }));

  probes.push(check('P1-02', 'Saldo realizado alinha com saldo das contas (cutoff hoje)', 'P1', () => {
    resetFixtures();
    DADOS.salvarContas([{ id: UUID_A, nome: 'Nubank', tipo: 'corrente' }]);
    DADOS.salvarConfig({ bancos: ['Nubank'], saldosIniciais: { Nubank: 0 } });
    CONTAS.init();
    TRANSACOES.criar('receita', 5000, 'salario', '2026-08-01', 'Salário', 'Nubank', '', { accountId: UUID_A });
    TRANSACOES.criar('despesa', 400, 'outro', '2026-08-31', 'Futuro', 'Nubank', '', { accountId: UUID_A });
    TRANSACOES.invalidateCache();
    const realizado = TRANSACOES.obterResumoMes(8, 2026, { ate: '2026-08-26' });
    const contas = CONTAS.saldoTotal();
    if (Math.abs(realizado.saldo - contas) > 0.02) {
      return { ok: false, motivo: 'Divergência mês realizado × contas', evidencia: { realizado: realizado.saldo, contas } };
    }
    return { detalhe: 'realizado=' + realizado.saldo + ', contas=' + contas };
  }));

  // ─── P1: centavos / float ─────────────────────────────────────────────────
  probes.push(check('P1-03', 'Resumo categoria usa centavos (1000 × R$0,10 = R$100)', 'P1', () => {
    resetFixtures();
    for (let i = 0; i < 1000; i++) {
      DADOS.salvarTransacao({
        id: 'c' + i, tipo: 'despesa', valor: 0.1, categoria: 'outro',
        data: '2026-08-01', descricao: 'c', banco: 'X', cartao: '',
      });
    }
    TRANSACOES.invalidateCache();
    const cat = TRANSACOES.obterResumoCategoriaMes('outro', 8, 2026);
    if (Math.abs(cat - 100) > 0.001) {
      return { ok: false, motivo: 'Esperado 100', evidencia: { cat } };
    }
    return { detalhe: 'cat=' + cat };
  }));

  probes.push(check('P1-04', 'UTILS.calcularSaldo ignora transferências', 'P2', () => {
    resetFixtures();
    const s = UTILS.calcularSaldo([
      { tipo: 'receita', valor: 1000 },
      { tipo: 'despesa', valor: 200 },
      { tipo: 'transferencia', valor: 500 },
    ]);
    if (s !== 800) return { ok: false, motivo: 'Esperado 800', evidencia: { s } };
    return { detalhe: 'saldo=800' };
  }));

  // ─── P1/P3: performance ≥5k ───────────────────────────────────────────────
  probes.push(check('P1-05', 'Performance: 50 filtros mensais em 5k txs < 500ms', 'P1', () => {
    resetFixtures();
    for (let i = 0; i < 5000; i++) {
      DADOS.salvarTransacao({
        id: 'p' + i, tipo: i % 3 === 0 ? 'receita' : 'despesa', valor: 1,
        categoria: 'outro', data: '2025-' + String((i % 12) + 1).padStart(2, '0') + '-10',
        descricao: 'p', banco: 'N', cartao: '',
      });
    }
    DADOS.salvarConfig({
      orcamentos: {
        alimentacao: { limite: 5000, definidoEm: '2026-01-01T00:00:00.000Z' },
        transporte: { limite: 3000, definidoEm: '2026-01-01T00:00:00.000Z' },
      },
    });
    TRANSACOES.invalidateCache();
    ORCAMENTO.init();
    const t0 = Date.now();
    for (let j = 0; j < 50; j++) {
      TRANSACOES.obter({ mes: 8, ano: 2025 });
      ORCAMENTO.obterStatusTodos(8, 2025);
    }
    const ms = Date.now() - t0;
    if (ms >= 500) return { ok: false, motivo: 'Lento demais', evidencia: { ms } };
    return { detalhe: ms + 'ms' };
  }));

  probes.push(check('P1-06', 'monthIndex construído após obterResumoMes', 'P1', () => {
    resetFixtures();
    DADOS.salvarTransacao({
      id: 't1', tipo: 'receita', valor: 10, categoria: 'salario',
      data: '2026-08-05', descricao: 'x', banco: 'N', cartao: '',
    });
    TRANSACOES.invalidateCache();
    TRANSACOES.obterResumoMes(8, 2026);
    if (!TRANSACOES._monthIndex) return { ok: false, motivo: '_monthIndex ausente' };
    return { detalhe: 'índice presente' };
  }));

  // ─── accountId + patrimônio ───────────────────────────────────────────────
  probes.push(check('P2-01', 'accountId gravado no criar()', 'P2', () => {
    resetFixtures();
    DADOS.salvarContas([{ id: UUID_A, nome: 'Nubank', tipo: 'corrente' }]);
    CONTAS.init();
    const tx = TRANSACOES.criar('receita', 100, 'salario', '2026-08-01', 'T', 'Nubank', '');
    if (tx.accountId !== UUID_A) {
      return { ok: false, motivo: 'accountId não resolvido', evidencia: { accountId: tx.accountId } };
    }
    return { detalhe: 'accountId=' + tx.accountId };
  }));

  probes.push(check('P2-02', 'Saldo sobrevive a rename de conta', 'P2', () => {
    resetFixtures();
    DADOS.salvarContas([{ id: UUID_A, nome: 'Nubank', tipo: 'corrente' }]);
    DADOS.salvarConfig({ bancos: ['Nubank'], saldosIniciais: { Nubank: 1000 } });
    CONTAS.init();
    TRANSACOES.criar('despesa', 100, 'outro', '2026-08-04', 'M', 'Nubank', '', { accountId: UUID_A });
    CONTAS.salvar({ id: UUID_A, nome: 'Nu Conta', tipo: 'corrente' });
    CONTAS.propagarRename(UUID_A, 'Nubank', 'Nu Conta');
    const depois = CONTAS.saldos().find((c) => c.nome === 'Nu Conta');
    if (!depois || depois.saldo !== 900) {
      return { ok: false, motivo: 'Saldo errado após rename', evidencia: { depois } };
    }
    return { detalhe: 'saldo=900' };
  }));

  probes.push(check('P2-03', 'Patrimônio detecta dupla contagem', 'P2', () => {
    resetFixtures();
    DADOS.salvarContas([{ id: UUID_A, nome: 'Nubank', tipo: 'corrente' }]);
    DADOS.salvarConfig({ bancos: ['Nubank'], saldosIniciais: { Nubank: 500 } });
    CONTAS.init();
    PATRIMONIO.criarAtivo({ nome: 'Nubank', tipo: 'corrente', valor: 500, contaId: UUID_A });
    const r = PATRIMONIO.reconciliarContas();
    if (!r.overlaps || r.overlaps.length !== 1) {
      return { ok: false, motivo: 'Overlap não detectado', evidencia: r };
    }
    return { detalhe: '1 overlap' };
  }));

  // ─── recorrentes ──────────────────────────────────────────────────────────
  probes.push(check('P2-04', 'Recorrente materializa com accountId (modo local)', 'P2', () => {
    resetFixtures();
    DADOS._modoLocal = true;
    DADOS.salvarContas([{ id: UUID_A, nome: 'Nubank', tipo: 'corrente' }]);
    CONTAS.init();
    DADOS.salvarConfig({
      recorrentes: [{
        id: 'rec-1', tipo: 'despesa', valor: 99, categoria: 'assinaturas',
        descricao: 'Stream', frequencia: 'mensal', dataInicio: '2026-08-05',
        ativo: true, banco: 'Nubank', accountId: UUID_A,
      }],
    });
    const criadas = RECORRENTES.processar(new Date(2026, 7, 10));
    if (!criadas.length || criadas[0].accountId !== UUID_A) {
      return { ok: false, motivo: 'accountId ausente na tx gerada', evidencia: { criadas } };
    }
    return { detalhe: 'accountId propagado' };
  }));

  probes.push(check('P2-05', 'FINANCE_CONTRACT recorrentePtToEn inclui accountId', 'P2', () => {
    resetFixtures();
    const en = FINANCE_CONTRACT.recorrentePtToEn({
      tipo: 'despesa', valor: 59.9, descricao: 'Aluguel', categoria: 'moradia',
      frequencia: 'mensal', dataInicio: '2026-06-05', banco: 'Nubank',
    }, [{ id: UUID_A, nome: 'Nubank' }]);
    if (en.accountId !== UUID_A) {
      return { ok: false, motivo: 'accountId não no payload EN', evidencia: en };
    }
    return { detalhe: 'accountId no sync payload' };
  }));

  // ─── select unificado ─────────────────────────────────────────────────────
  probes.push(check('P2-06', 'renderBancoSelect mescla fp-contas + legado', 'P2', () => {
    resetFixtures();
    DADOS.salvarContas([{ id: UUID_A, nome: 'Nubank', tipo: 'corrente' }]);
    DADOS.salvarConfig({ bancos: [{ nome: 'Itaú', tipo: 'Conta Corrente' }] });
    CONTAS.init();
    if (typeof document === 'undefined') return { skip: true, motivo: 'sem DOM' };
    document.body.innerHTML = '<select id="novo-banco"></select>';
    CONTAS.renderBancoSelect('novo-banco');
    const sel = document.getElementById('novo-banco');
    const values = Array.from(sel.options).map((o) => o.value).filter(Boolean);
    if (!values.includes(UUID_A) || !values.includes('Itaú')) {
      return { ok: false, motivo: 'Opções incompletas', evidencia: { values } };
    }
    return { detalhe: 'id + legado presentes' };
  }));

  // ─── obterRecentes ────────────────────────────────────────────────────────
  probes.push(check('P3-01', 'obterRecentes(3) retorna as mais novas', 'P3', () => {
    resetFixtures();
    for (let i = 0; i < 100; i++) {
      DADOS.salvarTransacao({
        id: 'r' + i, tipo: 'despesa', valor: 1, categoria: 'outro',
        data: '2026-01-' + String((i % 28) + 1).padStart(2, '0'),
        descricao: 'r', banco: 'X', cartao: '',
      });
    }
    DADOS.salvarTransacao({
      id: 'nova', tipo: 'despesa', valor: 9, categoria: 'outro',
      data: '2026-12-31', descricao: 'Última', banco: 'X', cartao: '',
    });
    TRANSACOES.invalidateCache();
    const recentes = TRANSACOES.obterRecentes(3);
    if (!recentes.length || recentes[0].id !== 'nova') {
      return { ok: false, motivo: 'Top-1 incorreto', evidencia: { recentes: recentes.map((t) => t.id) } };
    }
    return { detalhe: 'top=nova' };
  }));

  const falhas = probes.filter((p) => p.status === 'FALHA' || p.status === 'ERRO');
  const ok = probes.filter((p) => p.status === 'OK').length;
  const report = {
    generatedAt: new Date().toISOString(),
    referencia: 'Auditoria matinal 20260826 — verificação pós-fixes',
    total: probes.length,
    ok,
    falhas: falhas.length,
    skips: probes.filter((p) => p.status === 'SKIP').length,
    veredito: falhas.length === 0 ? 'CORRIGIDO' : 'PENDENTE',
    probes,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

  const md = [
    '# Verificação pós-fixes — auditoria 20260826',
    '',
    `Gerado: ${report.generatedAt}`,
    '',
    `**Veredito: ${report.veredito}** — ${ok}/${probes.length} probes OK` +
      (falhas.length ? `, **${falhas.length} falha(s)**` : ''),
    '',
    '| ID | Sev | Status | Detalhe |',
    '|---|---|---|---|',
  ];
  for (const p of probes) {
    md.push(`| ${p.id} | ${p.severidade} | **${p.status}** | ${p.detalhe || p.motivo || ''} |`);
  }
  if (falhas.length) {
    md.push('', '## Falhas', '');
    for (const f of falhas) {
      md.push(`- **${f.id}** (${f.severidade}): ${f.detalhe}`);
      if (f.evidencia) md.push('  ```json\n  ' + JSON.stringify(f.evidencia, null, 2) + '\n  ```');
    }
  }
  md.push('');
  fs.writeFileSync(OUT_MD, md.join('\n'));

  console.log('Verificação:', report.veredito, `(${ok}/${probes.length} OK)`);
  probes.forEach((p) => console.log(' ', p.status, p.id, '-', p.titulo));
  if (falhas.length) process.exit(1);
}

main();
