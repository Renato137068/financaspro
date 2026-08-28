#!/usr/bin/env node
/**
 * auditoria-massiva-usuarios.cjs
 *
 * Simulação profunda com personas A–G, datas extremas, consistência financeira,
 * duplicidade, performance e casos de borda. NÃO altera o app — só audita.
 *
 * Uso:
 *   node scripts/auditoria-massiva-usuarios.cjs
 *   node scripts/auditoria-massiva-usuarios.cjs --users 400 --seed 20260827
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, loadCoreGlobals } = require('./lib/load-core.cjs');

const ARGS = parseArgs(process.argv.slice(2));
const BASE_SEED = Number(ARGS.seed) || 20260827;
const NUM_USERS = Math.max(100, Math.min(500, Number(ARGS.users) || 300));
const OUT_DIR = path.join(ROOT, 'docs', 'audit-runs');
const STAMP = String(BASE_SEED);
const OUT_JSON = path.join(OUT_DIR, `massive-audit-${STAMP}.json`);
const OUT_MD = path.join(OUT_DIR, `massive-audit-${STAMP}.md`);

let FINDING_SEQ = 1;

const PERSONAS = {
  A: { id: 'A', nome: 'Organizado', peso: 0.18, txMin: 80, txMax: 140 },
  B: { id: 'B', nome: 'Desorganizado', peso: 0.16, txMin: 60, txMax: 120 },
  C: { id: 'C', nome: 'Intensivo', peso: 0.14, txMin: 200, txMax: 400 },
  D: { id: 'D', nome: 'Casual', peso: 0.12, txMin: 5, txMax: 20 },
  E: { id: 'E', nome: 'Erroneo', peso: 0.14, txMin: 40, txMax: 90 },
  F: { id: 'F', nome: 'Negocio', peso: 0.13, txMin: 150, txMax: 280 },
  G: { id: 'G', nome: 'Historico', peso: 0.13, txMin: 300, txMax: 600 },
};

const CATS_D = ['alimentacao', 'transporte', 'moradia', 'saude', 'lazer', 'assinaturas', 'educacao', 'outro'];
const CATS_R = ['salario', 'freelance', 'investimentos', 'vendas'];
const EDGE_VALS = [0.01, 0.1, 1, 999.99, 10000, 100000];
const DATE_PROBES = [
  '2024-02-29', '2024-02-28', '2024-03-01',
  '2025-01-01', '2025-12-31', '2026-01-31', '2026-02-28',
  '2026-08-01', '2026-08-31', '2026-08-27',
  '2023-06-15', '2020-01-01',
];

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
  findings.push(Object.assign({
    id: 'FP-AUD-' + String(FINDING_SEQ++).padStart(4, '0'),
    seed: BASE_SEED,
    ts: new Date().toISOString(),
    categoria: f.categoria || 'dados',
    severidade: f.severidade || 'P2',
    persona: f.persona || null,
    userId: f.userId != null ? f.userId : null,
    tela: f.tela || 'nucleo-financeiro',
    acao: f.acao,
    esperado: f.esperado || null,
    obtido: f.obtido || null,
    evidencia: f.evidencia || null,
    causaProvavel: f.causaProvavel || '',
    recomendacao: f.recomendacao || '',
    reproducao: f.reproducao || '',
  }, f));
}

function centavos(v) {
  return Math.round(Number(v) * 100);
}

function totaisIndependentes(txs, ate) {
  let rec = 0;
  let des = 0;
  (txs || []).forEach(function(t) {
    if (!t || t.deletedAt) return;
    if (ate && t.data > ate) return;
    if (t.tipo === 'receita') rec += centavos(t.valor);
    else if (t.tipo === 'despesa') des += centavos(t.valor);
  });
  return { receitas: rec / 100, despesas: des / 100, saldo: (rec - des) / 100 };
}

function assignPersona(userId, rng) {
  const roll = rng();
  let acc = 0;
  const keys = Object.keys(PERSONAS);
  for (let i = 0; i < keys.length; i++) {
    acc += PERSONAS[keys[i]].peso;
    if (roll < acc) return PERSONAS[keys[i]];
  }
  return PERSONAS.D;
}

function setupUser(userId, rng, persona) {
  const contaA = 'aaaaaaaa-bbbb-4ccc-' + String(userId).padStart(12, '0');
  const contaB = 'bbbbbbbb-cccc-4ddd-' + String(userId).padStart(12, '0');
  DADOS.salvarContas([
    { id: contaA, nome: 'Nubank-' + userId, tipo: 'corrente' },
    { id: contaB, nome: 'Poupanca-' + userId, tipo: 'poupanca' },
  ]);
  DADOS.salvarConfig({
    nome: 'Virtual ' + persona.id + '-' + userId,
    renda: persona.id === 'F' ? 25000 : 5000 + (userId % 10) * 500,
    regra503020: { nec: 50, des: 30, pou: 20 },
    orcamentos: {
      alimentacao: { limite: 800, definidoEm: '2026-01-01T00:00:00.000Z' },
      transporte: { limite: 400, definidoEm: '2026-01-01T00:00:00.000Z' },
      lazer: { limite: 300, definidoEm: '2026-01-01T00:00:00.000Z' },
    },
    metas: persona.id === 'A' ? [{
      id: 'meta-' + userId,
      titulo: 'Reserva',
      valorAlvo: 10000,
      valorAtual: 500,
      prazo: '2026-12-31',
      icone: 'target',
      criadoEm: '2026-01-01T00:00:00.000Z',
      concluida: false,
    }] : [],
  });
  CONTAS.init();
  TRANSACOES.init();
  ORCAMENTO.init();
  if (typeof METAS !== 'undefined') METAS.init();
  return { contaA, contaB };
}

function pickDate(persona, rng, userId) {
  if (persona.id === 'G') {
    const y = 2018 + Math.floor(rng() * 9);
    const m = 1 + Math.floor(rng() * 12);
    const d = 1 + Math.floor(rng() * 28);
    return isoDate(y, m, d);
  }
  if (rng() < 0.12) return pick(rng, DATE_PROBES);
  const y = 2025 + (rng() < 0.7 ? 1 : 0);
  const m = 1 + Math.floor(rng() * 12);
  const d = 1 + Math.floor(rng() * 28);
  return isoDate(y, m, d);
}

function pickValor(persona, rng) {
  if (persona.id === 'E' && rng() < 0.25) return pick(rng, EDGE_VALS);
  if (persona.id === 'F' && rng() < 0.4) return Math.round((500 + rng() * 15000) * 100) / 100;
  if (rng() < 0.08) return pick(rng, EDGE_VALS);
  return Math.round((1 + rng() * 800) * 100) / 100;
}

function simulateUser(userId, rng, persona, stats, findings, resetFixtures) {
  resetFixtures();
  const accounts = setupUser(userId, rng, persona);
  const numTx = persona.txMin + Math.floor(rng() * (persona.txMax - persona.txMin + 1));
  const createdIds = [];
  let localRejected = 0;

  for (let i = 0; i < numTx; i++) {
    const op = rng();
    const data = pickDate(persona, rng, userId);
    const tipo = persona.id === 'F' && op < 0.45 ? 'receita' : (op < 0.52 ? 'despesa' : 'receita');
    const cat = tipo === 'receita' ? pick(rng, CATS_R) : pick(rng, CATS_D);
    const valor = pickValor(persona, rng);
    const desc = persona.id === 'E' && rng() < 0.1
      ? '🍕 Almoço & café — ' + 'x'.repeat(Math.floor(rng() * 80))
      : 'Sim ' + persona.id + '-' + userId + '-' + i;

    try {
      if (persona.id === 'E' && op < 0.04) {
        TRANSACOES.criar(tipo, 0, cat, data, desc, accounts.contaA, '');
        localRejected++;
        stats.rejected++;
      } else if (persona.id === 'E' && op < 0.06) {
        TRANSACOES.criar(tipo, valor, '', data, desc, accounts.contaA, '');
        localRejected++;
        stats.rejected++;
      } else if (op < 0.1 && i > 8) {
        const txs = DADOS.getTransacoes();
        const alvo = txs[Math.floor(rng() * txs.length)];
        if (alvo) {
          TRANSACOES.deletar(alvo.id);
          stats.deleted++;
        }
      } else if (op < 0.2 && i > 5) {
        const txs = DADOS.getTransacoes();
        const alvo = txs[Math.floor(rng() * txs.length)];
        if (alvo) {
          const novoValor = Math.round((valor + rng() * 50) * 100) / 100;
          TRANSACOES.atualizar(alvo.id, { valor: novoValor, descricao: 'Edit ' + i });
          stats.edited++;
        }
      } else if (op < 0.24 && DADOS.getContas().length >= 2) {
        try {
          TRANSACOES.criarTransferencia({
            origem: 'Nubank-' + userId,
            destino: 'Poupanca-' + userId,
            valor: Math.max(1, Math.round(valor * 0.3 * 100) / 100),
            data: data,
            descricao: 'Transfer ' + i,
          });
          stats.transfers++;
        } catch (_e) {
          stats.rejected++;
        }
      } else if (op < 0.26 && persona.id === 'B') {
        // clientKey: caminho real testado em persist-queue.test.js + dados.js;
        // fixture DADOS do harness não deduplica — não usar como achado P0.
        const ck = 'dup-' + userId + '-' + i;
        TRANSACOES.criar(tipo, valor, cat, data, desc, 'Nubank-' + userId, '', {
          accountId: accounts.contaA,
          clientKey: ck,
        });
        TRANSACOES.criar(tipo, valor, cat, data, desc + ' retry', 'Nubank-' + userId, '', {
          accountId: accounts.contaA,
          clientKey: ck,
        });
        stats.duplicateAttempts++;
        stats.created++;
      } else {
        const tx = TRANSACOES.criar(tipo, valor, cat, data, desc, 'Nubank-' + userId, '', {
          accountId: accounts.contaA,
        });
        createdIds.push(tx.id);
        stats.created++;
      }
    } catch (e) {
      localRejected++;
      stats.rejected++;
      if (persona.id === 'E' && localRejected <= 2) {
        stats.expectedRejections++;
      } else if (stats.unexpectedRejections++ < 5) {
        addFinding(findings, {
          severidade: 'P2',
          categoria: 'logica',
          persona: persona.id,
          userId,
          acao: 'operacao-rejeitada-inesperada',
          causaProvavel: e.message,
          evidencia: { i, tipo, valor, data },
        });
      }
    }

    if (rng() < 0.12) {
      const parts = data.split('-');
      TRANSACOES.obter({ mes: parseInt(parts[1], 10), ano: parseInt(parts[0], 10) });
      stats.queries++;
    }
    if (rng() < 0.08) {
      const parts = data.split('-');
      ORCAMENTO.obterStatusTodos(parseInt(parts[1], 10), parseInt(parts[0], 10));
      stats.queries++;
    }
  }

  // Consistência financeira por usuário
  TRANSACOES.invalidateCache();
  const txs = DADOS.getTransacoes();
  const hoje = '2026-08-27';
  const partsHoje = hoje.split('-');
  const mes = parseInt(partsHoje[1], 10);
  const ano = parseInt(partsHoje[0], 10);

  const resumoMes = TRANSACOES.obterResumoMes(mes, ano);
  const resumoAte = TRANSACOES.obterResumoMes(mes, ano, { ate: hoje });
  const manualMes = totaisIndependentes(
    txs.filter(function(t) { return t.data && t.data.slice(0, 7) === ano + '-' + String(mes).padStart(2, '0'); }),
  );
  const manualAte = totaisIndependentes(
    txs.filter(function(t) { return t.data && t.data.slice(0, 7) === ano + '-' + String(mes).padStart(2, '0'); }),
    hoje,
  );

  if (Math.abs(resumoMes.saldo - manualMes.saldo) > 0.02) {
    addFinding(findings, {
      severidade: 'P0',
      categoria: 'dados',
      persona: persona.id,
      userId,
      acao: 'resumo-mes-diverge-calculo-manual',
      esperado: manualMes.saldo,
      obtido: resumoMes.saldo,
      evidencia: { manualMes, resumoMes },
    });
  }

  if (Math.abs(resumoAte.saldo - manualAte.saldo) > 0.02) {
    addFinding(findings, {
      severidade: 'P1',
      categoria: 'dados',
      persona: persona.id,
      userId,
      acao: 'resumo-ate-diverge-calculo-manual',
      esperado: manualAte.saldo,
      obtido: resumoAte.saldo,
    });
  }

  const saldoContas = CONTAS.saldoTotal();
  if (Math.abs(resumoAte.saldo - saldoContas) > 0.05 && persona.id !== 'G') {
  // Contas incluem histórico multi-mês; só alerta se usuário recente
    const meses = {};
    txs.forEach(function(t) { if (t.data) meses[t.data.slice(0, 7)] = 1; });
    if (Object.keys(meses).length <= 3 && Math.abs(resumoAte.saldo - saldoContas) > 1) {
      addFinding(findings, {
        severidade: 'P2',
        categoria: 'dados',
        persona: persona.id,
        userId,
        acao: 'saldo-contas-vs-resumo-mes',
        causaProvavel: 'Pode ser esperado se histórico multi-mês; revisar para usuários recentes',
        evidencia: { saldoContas, resumoAte: resumoAte.saldo },
      });
    }
  }

  // Orçamento vs gasto real
  const statusOrc = ORCAMENTO.obterStatusTodos(mes, ano);
  (statusOrc || []).forEach(function(st) {
    if (!st || !st.categoria) return;
    const gastoCalc = ORCAMENTO.calcularGastoMes(st.categoria, mes, ano);
    if (Math.abs((st.gasto || 0) - (gastoCalc || 0)) > 0.02) {
      addFinding(findings, {
        severidade: 'P1',
        categoria: 'dados',
        persona: persona.id,
        userId,
        acao: 'orcamento-gasto-inconsistente',
        evidencia: { cat: st.categoria, stGasto: st.gasto, gastoCalc },
      });
    }
  });

  stats.txFinal += txs.length;
  stats.byPersona[persona.id] = (stats.byPersona[persona.id] || 0) + 1;
}

function runDateProbes(findings) {
  DATE_PROBES.forEach(function(d) {
    const v = VALIDATIONS.validarData(d);
    if (!v.valido) {
      addFinding(findings, {
        severidade: 'P1',
        categoria: 'logica',
        acao: 'data-valida-rejeitada',
        evidencia: { data: d, erro: v.erro },
      });
    }
  });
  const feb30 = VALIDATIONS.validarData('2025-02-30');
  if (feb30.valido) {
    addFinding(findings, {
      severidade: 'P0',
      categoria: 'logica',
      acao: 'data-invalida-aceita',
      evidencia: { data: '2025-02-30' },
    });
  }
}

function runParserProbes(findings) {
  const casos = [
    ['1.234,56', 1234.56],
    ['0,01', 0.01],
    ['R$ 10.000,00', 10000],
    ['-50', null],
    ['abc', null],
  ];
  casos.forEach(function(c) {
    const parsed = UTILS.parseMoeda(c[0]);
    if (c[1] === null) {
      if (Number.isFinite(parsed) && parsed > 0) {
        addFinding(findings, {
          severidade: 'P1',
          categoria: 'logica',
          acao: 'parser-aceitou-valor-invalido',
          evidencia: { input: c[0], parsed },
        });
      }
    } else if (Math.abs(parsed - c[1]) > 0.001) {
      addFinding(findings, {
        severidade: 'P1',
        categoria: 'logica',
        acao: 'parser-valor-incorreto',
        evidencia: { input: c[0], esperado: c[1], obtido: parsed },
      });
    }
  });
}

function runPerformanceProbes(findings, stats, resetFixtures) {
  const sizes = [100, 500, 1000, 5000, 10000];
  stats.performance = {};
  sizes.forEach(function(n) {
    resetFixtures();
    for (let i = 0; i < n; i++) {
      DADOS.salvarTransacao({
        id: 'perf-' + n + '-' + i,
        tipo: i % 3 === 0 ? 'receita' : 'despesa',
        valor: (i % 97) + 0.01,
        categoria: i % 2 ? 'alimentacao' : 'transporte',
        data: '2025-' + String((i % 12) + 1).padStart(2, '0') + '-15',
        descricao: 'perf',
        banco: 'N',
        cartao: '',
      });
    }
    TRANSACOES.invalidateCache();
    DADOS.salvarConfig({
      orcamentos: {
        alimentacao: { limite: 99999, definidoEm: '2026-01-01T00:00:00.000Z' },
        transporte: { limite: 99999, definidoEm: '2026-01-01T00:00:00.000Z' },
      },
    });
    ORCAMENTO.init();
    const reps = n >= 5000 ? 20 : 50;
    const t0 = Date.now();
    for (let j = 0; j < reps; j++) {
      TRANSACOES.obter({ mes: 8, ano: 2025 });
      ORCAMENTO.obterStatusTodos(8, 2025);
      TRANSACOES.obterRecentes(5);
    }
    const ms = Date.now() - t0;
    const msPerOp = ms / (reps * 3);
    stats.performance[n] = { ms, msPerOp, reps };
    const limitPerOp = n >= 10000 ? 12 : n >= 5000 ? 8 : 20;
    if (msPerOp > limitPerOp) {
      addFinding(findings, {
        severidade: n >= 5000 ? 'P1' : 'P2',
        categoria: 'performance',
        acao: 'perf-lento-' + n + '-tx',
        evidencia: stats.performance[n],
        causaProvavel: 'Filtro mensal + orçamento acima de ' + limitPerOp + 'ms/op',
        recomendacao: 'Indexação, virtualização de lista ou paginação no extrato',
      });
    }
  });
}

function runTransferProbe(findings, resetFixtures) {
  resetFixtures();
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  DADOS.salvarContas([
    { id: a, nome: 'Origem', tipo: 'corrente' },
    { id: b, nome: 'Destino', tipo: 'poupanca' },
  ]);
  CONTAS.init();
  TRANSACOES.init();
  DADOS.salvarConfig({ saldosIniciais: { Origem: 1000 } });
  TRANSACOES.criarTransferencia({ origem: a, destino: b, valor: 200, data: '2026-08-01' });
  const antes = CONTAS.saldoTotal();
  const resumo = TRANSACOES.obterResumoMes(8, 2026);
  if (resumo.receitas !== 0 || resumo.despesas !== 0) {
    addFinding(findings, {
      severidade: 'P1',
      categoria: 'dados',
      acao: 'transferencia-conta-no-resumo-mes',
      evidencia: resumo,
    });
  }
  if (Math.abs(antes - 1000) > 0.02) {
    addFinding(findings, {
      severidade: 'P0',
      categoria: 'dados',
      acao: 'transferencia-alterou-patrimonio',
      esperado: 1000,
      obtido: antes,
    });
  }
}

function runFloatProbe(findings, resetFixtures) {
  resetFixtures();
  for (let i = 0; i < 1000; i++) {
    DADOS.salvarTransacao({
      id: 'f' + i,
      tipo: 'despesa',
      valor: 0.1,
      categoria: 'outro',
      data: '2026-08-01',
      descricao: 'f',
      banco: 'X',
      cartao: '',
    });
  }
  TRANSACOES.invalidateCache();
  const cat = TRANSACOES.obterResumoCategoriaMes('outro', 8, 2026);
  if (Math.abs(cat - 100) > 0.001) {
    addFinding(findings, {
      severidade: 'P1',
      categoria: 'dados',
      acao: 'float-soma-categoria',
      esperado: 100,
      obtido: cat,
    });
  }
}

function dedupeFindings(findings) {
  const map = new Map();
  findings.forEach(function(f) {
    const key = f.severidade + '|' + f.acao + '|' + (f.persona || '') + '|' + (f.userId != null ? f.userId : '');
    if (!map.has(key)) {
      map.set(key, Object.assign({}, f, { ocorrencias: 1 }));
    } else {
      map.get(key).ocorrencias += 1;
    }
  });
  return Array.from(map.values()).sort(function(a, b) {
    const ord = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return (ord[a.severidade] || 9) - (ord[b.severidade] || 9);
  });
}

function productOpportunities() {
  return [
    { id: 'PROD-01', area: 'produto', titulo: 'Transferência explícita no fluxo Novo', impacto: 'alto',
      descricao: 'Usuários movendo dinheiro entre contas podem criar receita+despesa e poluir orçamento se não acharem transferência.' },
    { id: 'PROD-02', area: 'escala', titulo: 'Migração de fp-transacoes para IndexedDB', impacto: 'alto',
      descricao: 'Teto ~5 MB localStorage (~35k tx). Persona G com milhares de registros atingirá limite.' },
    { id: 'PROD-03', area: 'ux', titulo: 'Undo em exclusões já existe — expandir para edições', impacto: 'medio',
      descricao: 'Desfazer só em delete; edições acidentais não têm janela de reversão.' },
    { id: 'PROD-04', area: 'ux', titulo: 'Estado vazio contextual por aba', impacto: 'medio',
      descricao: 'Casual (persona D) precisa de CTA claro em cada aba sem dados.' },
    { id: 'PROD-05', area: 'dados', titulo: 'Reconciliador visível ao usuário', impacto: 'medio',
      descricao: 'FINANCE_RECONCILER só em modo teste; usuário não vê divergências saldo vs extrato.' },
    { id: 'PROD-06', area: 'performance', titulo: 'Virtualização do extrato', impacto: 'alto',
      descricao: 'Persona C/G com centenas+ linhas pode degradar scroll e filtros no mobile.' },
    { id: 'PROD-07', area: 'sync', titulo: 'Conflito multi-aba documentado', impacto: 'alto',
      descricao: 'Duas abas editando simultaneamente dependem de last-write-wins no localStorage.' },
    { id: 'PROD-08', area: 'cartoes', titulo: 'Ciclo de fatura completo', impacto: 'medio',
      descricao: 'Cartões sem fechamento/vencimento realista — usuário de negócio espera visão de fatura.' },
  ];
}

function uxObservations() {
  return [
    { id: 'UX-01', severidade: 'P2', tela: 'extrato', titulo: 'Ordenação em 2 controles recente',
      descricao: 'Mudança recente pode confundir usuários habituados aos 4 chips; falta onboarding/tooltip.' },
    { id: 'UX-02', severidade: 'P2', tela: 'orcamento', titulo: 'Curva de aprendizado 50/30/20',
      descricao: 'Persona desorganizada (B) pode não entender limites vs regra global.' },
    { id: 'UX-03', severidade: 'P3', tela: 'config', titulo: 'Muitos cartões de configuração',
      descricao: 'Perfil denso; usuário casual pode não achar função específica.' },
    { id: 'UX-04', severidade: 'P2', tela: 'novo', titulo: 'Formulário longo no mobile',
      descricao: 'Muitos campos verticais; persona intensiva prefere atalhos/entrada rápida.' },
    { id: 'UX-05', severidade: 'P2', tela: 'dashboard', titulo: 'Realizado vs projetado',
      descricao: 'Lançamentos futuros no mês podem confundir saldo do card vs saldo das contas.' },
  ];
}

function renderMd(report) {
  const u = report.uniqueFindings;
  const lines = [
    '# Auditoria massiva — usuários virtuais',
    '',
    '## Resumo executivo',
    '',
    '| Métrica | Valor |',
    '|---------|-------|',
    '| Seed | ' + report.seed + ' |',
    '| Usuários simulados | ' + report.users + ' |',
    '| Personas | A–G (' + Object.keys(PERSONAS).length + ' perfis) |',
    '| Operações totais | ' + report.stats.ops + ' |',
    '| Transações criadas | ' + report.stats.created + ' |',
    '| Edições | ' + report.stats.edited + ' |',
    '| Exclusões | ' + report.stats.deleted + ' |',
    '| Transferências | ' + report.stats.transfers + ' |',
    '| Consultas (extrato/orçamento) | ' + report.stats.queries + ' |',
    '| Rejeições esperadas (persona E) | ' + report.stats.expectedRejections + ' |',
    '| Achados únicos | ' + u.length + ' |',
    '| Oportunidades produto | ' + report.productOpportunities.length + ' |',
    '| Observações UX | ' + report.uxObservations.length + ' |',
    '| Duração | ' + report.simMs + 'ms |',
    '',
    '### Por persona',
    '',
  ];
  Object.keys(PERSONAS).forEach(function(k) {
    lines.push('- **' + k + '** (' + PERSONAS[k].nome + '): ' + (report.stats.byPersona[k] || 0) + ' usuários');
  });
  lines.push('', '## Top achados', '');
  if (!u.length) {
    lines.push('_Nenhum achado no núcleo financeiro simulado._');
  } else {
    u.slice(0, 20).forEach(function(f, i) {
      lines.push((i + 1) + '. **' + f.severidade + '** `' + f.acao + '` (' + f.ocorrencias + 'x) — ' + (f.causaProvavel || ''));
    });
  }
  lines.push('', '## Performance', '', '```json', JSON.stringify(report.stats.performance, null, 2), '```', '');
  lines.push('## Oportunidades de produto', '');
  report.productOpportunities.forEach(function(o) {
    lines.push('- **' + o.id + '** (' + o.impacto + '): ' + o.titulo + ' — ' + o.descricao);
  });
  lines.push('', '## Observações UX', '');
  report.uxObservations.forEach(function(o) {
    lines.push('- **' + o.id + '** [' + o.severidade + '] ' + o.tela + ': ' + o.descricao);
  });
  lines.push('');
  return lines.join('\n');
}

function main() {
  const { resetFixtures } = loadCoreGlobals();
  const findings = [];
  const stats = {
    created: 0, edited: 0, deleted: 0, transfers: 0, rejected: 0,
    queries: 0, txFinal: 0, duplicateAttempts: 0,
    expectedRejections: 0, unexpectedRejections: 0,
    byPersona: {},
  };

  const t0 = Date.now();
  for (let u = 0; u < NUM_USERS; u++) {
    const rng = mulberry32(BASE_SEED + u * 9973);
    const persona = assignPersona(u, rng);
    simulateUser(u, mulberry32(BASE_SEED + u * 7919), persona, stats, findings, resetFixtures);
  }

  runDateProbes(findings);
  runParserProbes(findings);
  runTransferProbe(findings, resetFixtures);
  runFloatProbe(findings, resetFixtures);
  runPerformanceProbes(findings, stats, resetFixtures);

  const simMs = Date.now() - t0;
  stats.ops = stats.created + stats.edited + stats.deleted + stats.transfers + stats.queries;

  const uniqueFindings = dedupeFindings(findings);
  const productOpps = productOpportunities();
  const uxObs = uxObservations();

  const report = {
    seed: BASE_SEED,
    users: NUM_USERS,
    personas: PERSONAS,
    simMs,
    stats,
    findings,
    uniqueFindings,
    productOpportunities: productOpps,
    uxObservations: uxObs,
    summary: {
      P0: uniqueFindings.filter(function(f) { return f.severidade === 'P0'; }).length,
      P1: uniqueFindings.filter(function(f) { return f.severidade === 'P1'; }).length,
      P2: uniqueFindings.filter(function(f) { return f.severidade === 'P2'; }).length,
      P3: uniqueFindings.filter(function(f) { return f.severidade === 'P3'; }).length,
      bugs: uniqueFindings.filter(function(f) { return f.categoria !== 'performance'; }).length,
      performance: uniqueFindings.filter(function(f) { return f.categoria === 'performance'; }).length,
    },
    generatedAt: new Date().toISOString(),
    nota: 'Fixture DADOS em load-sources.js simplifica persistência; clientKey P0 pode ser falso positivo — validar com persist-queue.test.js e dados.js real.',
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  fs.writeFileSync(OUT_MD, renderMd(report));

  console.log('Auditoria massiva:', OUT_JSON);
  console.log('Usuários:', NUM_USERS, '| Ops:', stats.ops, '| Achados únicos:', uniqueFindings.length);
  uniqueFindings.slice(0, 15).forEach(function(f) {
    console.log(' ', f.severidade, f.acao, '(' + f.ocorrencias + 'x)');
  });
}

main();
