#!/usr/bin/env node
/**
 * auditoria-usuarios-virtuais.cjs
 *
 * Simulação determinística de usuários virtuais contra a camada financeira real.
 * Não altera o app — emite relatório em docs/audit-runs/.
 *
 * Uso:
 *   node scripts/auditoria-usuarios-virtuais.cjs
 *   node scripts/auditoria-usuarios-virtuais.cjs --users 500 --seed 20260826
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, loadCoreGlobals } = require('./lib/load-core.cjs');

const ARGS = parseArgs(process.argv.slice(2));
const BASE_SEED = Number(ARGS.seed) || 20260826;
const NUM_USERS = Math.max(50, Math.min(500, Number(ARGS.users) || 250));
const OUT_DIR = path.join(ROOT, 'docs', 'audit-runs');
const OUT_JSON = path.join(OUT_DIR, `virtual-users-${BASE_SEED}.json`);
const OUT_MD = path.join(OUT_DIR, `virtual-users-${BASE_SEED}.md`);

const CATEGORIAS_D = ['alimentacao', 'transporte', 'moradia', 'lazer', 'outro'];
const CATEGORIAS_R = ['salario', 'freelance', 'investimentos'];
const BANCOS = ['Nubank', 'Itaú', 'Caixa', 'Bradesco'];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--users') out.users = argv[++i];
    else if (argv[i] === '--seed') out.seed = argv[++i];
  }
  return out;
}

function mulberry32(a) {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function isoDate(y, m, d) {
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function addFinding(findings, f) {
  findings.push(Object.assign({ seed: BASE_SEED, ts: new Date().toISOString() }, f));
}

function dedupeFindings(findings) {
  const map = new Map();
  for (const f of findings) {
    const key = f.severidade + '|' + f.acao;
    if (!map.has(key)) {
      map.set(key, Object.assign({}, f, { ocorrencias: 1 }));
    } else {
      map.get(key).ocorrencias += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const ord = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return (ord[a.severidade] || 9) - (ord[b.severidade] || 9);
  });
}

function simulateUser(userId, rng, stats, findings, resetFixtures) {
  resetFixtures();

  const contaId = 'aaaaaaaa-bbbb-4ccc-dddd-' + String(userId).padStart(12, '0');
  DADOS.salvarContas([{ id: contaId, nome: pick(rng, BANCOS), tipo: 'corrente' }]);
  DADOS.salvarConfig({
    bancos: BANCOS.slice(0, 2 + (userId % 3)),
    saldosIniciais: {},
    orcamentos: {
      alimentacao: { limite: 800 + (userId % 5) * 100, definidoEm: '2026-01-01T00:00:00.000Z' },
      transporte: { limite: 400, definidoEm: '2026-01-01T00:00:00.000Z' },
    },
  });
  CONTAS.init();
  TRANSACOES.init();
  ORCAMENTO.init();

  const numTx = 40 + Math.floor(rng() * 80);
  const hoje = new Date(2026, 7, 26);
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;

  for (let i = 0; i < numTx; i++) {
    const op = rng();
    const dia = 1 + Math.floor(rng() * 28);
    const data = isoDate(ano, mes, dia);
    const tipo = op < 0.55 ? 'despesa' : 'receita';
    const cat = tipo === 'receita' ? pick(rng, CATEGORIAS_R) : pick(rng, CATEGORIAS_D);
    const valor = Math.round((5 + rng() * 500) * 100) / 100;
    const banco = CONTAS.getById(contaId).nome;

    try {
      if (op < 0.08 && i > 5) {
        const txs = DADOS.getTransacoes();
        const alvo = txs[Math.floor(rng() * txs.length)];
        if (alvo) {
          TRANSACOES.deletar(alvo.id);
          stats.deleted++;
        }
      } else if (op < 0.18 && i > 3) {
        const txs = DADOS.getTransacoes();
        const alvo = txs[Math.floor(rng() * txs.length)];
        if (alvo) {
          TRANSACOES.atualizar(alvo.id, { valor: valor, descricao: 'Edit ' + i });
          stats.edited++;
        }
      } else if (op < 0.22 && DADOS.getContas().length >= 2) {
        stats.transfers++;
      } else {
        TRANSACOES.criar(tipo, valor, cat, data, 'Sim ' + userId + '-' + i, banco, '', {
          accountId: contaId,
        });
        stats.created++;
      }
    } catch (e) {
      stats.rejected++;
      if (stats.rejected <= 3) {
        addFinding(findings, {
          severidade: 'P2',
          acao: 'criar-rejeitado',
          userId,
          causaProvavel: e.message,
        });
      }
    }

    if (rng() < 0.15) {
      TRANSACOES.obter({ mes, ano });
      stats.filters++;
    }
    if (rng() < 0.1) {
      ORCAMENTO.obterStatusTodos(mes, ano);
      stats.filters++;
    }
  }

  // Probe por usuário: saldo mês realizado vs contas (futuros no mês)
  const futuro = isoDate(ano, mes, 28);
  if (parseInt(futuro.slice(8, 10), 10) > 26) {
    try {
      TRANSACOES.criar('despesa', 50, 'outro', isoDate(ano, mes, 31), 'Futuro probe', BANCOS[0], '', {
        accountId: contaId,
      });
    } catch (_e) { /* noop */ }
  }

  TRANSACOES.invalidateCache();
  const hojeIso = isoDate(ano, mes, 26);
  const realizado = TRANSACOES.obterResumoMes(mes, ano, { ate: hojeIso });
  const projetado = TRANSACOES.obterResumoMes(mes, ano);
  const saldoContas = CONTAS.saldoTotal();

  if (Math.abs(realizado.saldo - saldoContas) > 0.02 && projetado.saldo !== realizado.saldo) {
    // Esperado: realizado alinhado às contas; projetado pode incluir futuros
    if (Math.abs(projetado.saldo - saldoContas) < 0.02 && Math.abs(realizado.saldo - saldoContas) > 0.02) {
      addFinding(findings, {
        severidade: 'P1',
        acao: 'saldo-mes-realizado-vs-contas',
        userId,
        causaProvavel: 'Card realizado diverge de contas enquanto projetado alinha',
        evidencia: { realizado: realizado.saldo, contas: saldoContas, projetado: projetado.saldo },
      });
    }
  }

  if (Math.abs(projetado.saldo - realizado.saldo) < 0.001 && futuro > hojeIso) {
    addFinding(findings, {
      severidade: 'P1',
      acao: 'saldo-mes-sem-cutoff-futuro',
      userId,
      causaProvavel: 'Resumo mês completo igual ao realizado apesar de lançamento futuro',
    });
  }

  stats.txFinal += DADOS.getTransacoes().length;
}

function runGlobalProbes(findings, stats, resetFixtures) {
  resetFixtures();

  // P1 float: mil parcelas de centavos
  for (let i = 0; i < 1000; i++) {
    DADOS.salvarTransacao({
      id: 'c' + i,
      tipo: 'despesa',
      valor: 0.1,
      categoria: 'outro',
      data: '2026-08-01',
      descricao: 'c',
      banco: 'X',
      cartao: '',
    });
  }
  TRANSACOES.invalidateCache();
  const cat = TRANSACOES.obterResumoCategoriaMes('outro', 8, 2026);
  if (Math.abs(cat - 100) > 0.001) {
    addFinding(findings, {
      severidade: 'P1',
      acao: 'float-resumo-categoria',
      causaProvavel: 'Soma float em obterResumoCategoriaMes',
      evidencia: { esperado: 100, obtido: cat },
    });
  }

  // P2 calcularSaldo ignora transferência
  const saldo = UTILS.calcularSaldo([
    { tipo: 'receita', valor: 100 },
    { tipo: 'transferencia', valor: 50 },
  ]);
  if (saldo !== 100) {
    addFinding(findings, {
      severidade: 'P2',
      acao: 'calcular-saldo-transferencia',
      causaProvavel: 'UTILS.calcularSaldo não ignora transferência',
      evidencia: { saldo },
    });
  }

  // Performance 5k
  resetFixtures();
  for (let i = 0; i < 5000; i++) {
    DADOS.salvarTransacao({
      id: 'p' + i,
      tipo: i % 3 === 0 ? 'receita' : 'despesa',
      valor: 1,
      categoria: 'outro',
      data: '2025-' + String((i % 12) + 1).padStart(2, '0') + '-10',
      descricao: 'p',
      banco: 'N',
      cartao: '',
    });
  }
  TRANSACOES.invalidateCache();
  DADOS.salvarConfig({
    orcamentos: { outro: { limite: 9999, definidoEm: '2026-01-01T00:00:00.000Z' } },
  });
  ORCAMENTO.init();
  const t0 = Date.now();
  for (let j = 0; j < 30; j++) {
    TRANSACOES.obter({ mes: 8, ano: 2025 });
    ORCAMENTO.obterStatusTodos(8, 2025);
  }
  const perfMs = Date.now() - t0;
  stats.performance = { ops30: perfMs, msPerOp: perfMs / 30 };
  if (perfMs > 800) {
    addFinding(findings, {
      severidade: 'P2',
      acao: 'perf-5k-lento',
      causaProvavel: 'Filtros mensais/orçamento acima de 800ms para 30 ops',
      evidencia: stats.performance,
    });
  }

  // accountId write-path
  resetFixtures();
  const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  DADOS.salvarContas([{ id: UUID, nome: 'Nubank', tipo: 'corrente' }]);
  CONTAS.init();
  const tx = TRANSACOES.criar('receita', 10, 'salario', '2026-08-01', 'T', 'Nubank', '');
  if (tx.accountId !== UUID) {
    addFinding(findings, {
      severidade: 'P2',
      acao: 'accountId-nao-resolvido',
      causaProvavel: 'criar não gravou accountId pelo nome',
      evidencia: { accountId: tx.accountId },
    });
  }
}

function renderMd(meta, unique) {
  const lines = [
    '# Auditoria — usuários virtuais',
    '',
    `- Seed: **${meta.seed}**`,
    `- Usuários: **${meta.users}**`,
    `- Operações: **${meta.ops}** (criados ${meta.created}, editados ${meta.edited}, excluídos ${meta.deleted})`,
    `- Duração simulação: **${meta.simMs}ms**`,
    `- Performance 5k (30 ops): **${meta.performance ? meta.performance.ops30 + 'ms' : 'n/a'}**`,
    '',
    '## Achados únicos',
    '',
  ];
  if (!unique.length) {
    lines.push('_Nenhum achado — núcleo financeiro OK._');
  } else {
    for (const f of unique) {
      lines.push(`- **${f.severidade}** \`${f.acao}\` (${f.ocorrencias}x) — ${f.causaProvavel || ''}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const { resetFixtures } = loadCoreGlobals();
  const findings = [];
  const stats = {
    created: 0, edited: 0, deleted: 0, transfers: 0, rejected: 0,
    filters: 0, txFinal: 0,
  };

  const t0 = Date.now();
  for (let u = 0; u < NUM_USERS; u++) {
    simulateUser(u, mulberry32(BASE_SEED + u * 9973), stats, findings, resetFixtures);
  }
  runGlobalProbes(findings, stats, resetFixtures);
  const simMs = Date.now() - t0;

  const uniqueFindings = dedupeFindings(findings);
  const p0 = uniqueFindings.filter((f) => f.severidade === 'P0').length;
  const p1 = uniqueFindings.filter((f) => f.severidade === 'P1').length;

  const report = {
    seed: BASE_SEED,
    users: NUM_USERS,
    simMs,
    stats,
    findings,
    uniqueFindings,
    summary: { P0: p0, P1: p1, P2: uniqueFindings.filter((f) => f.severidade === 'P2').length,
      P3: uniqueFindings.filter((f) => f.severidade === 'P3').length },
    performance: stats.performance,
    generatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  fs.writeFileSync(OUT_MD, renderMd({
    seed: BASE_SEED,
    users: NUM_USERS,
    ops: stats.created + stats.edited + stats.deleted + stats.filters,
    created: stats.created,
    edited: stats.edited,
    deleted: stats.deleted,
    simMs,
    performance: stats.performance,
  }, uniqueFindings));

  console.log('Auditoria concluída:', OUT_JSON);
  console.log('Usuários:', NUM_USERS, '| P1 únicos:', p1, '| P2+:', uniqueFindings.length - p1 - p0);
  if (uniqueFindings.length) {
    uniqueFindings.forEach((f) => {
      console.log(' ', f.severidade, f.acao, '(' + f.ocorrencias + 'x)');
    });
  } else {
    console.log(' Nenhum achado único.');
  }
}

main();
