#!/usr/bin/env node
/**
 * auditoria-2anos-milhares.cjs
 *
 * Simulação de milhares de usuários × ~24 meses × todas as abas financeiras
 * + ciclo de billing (trial → mensal/anual → cancelar → recomprar).
 * Não altera o app — só audita a camada JS real via fixtures.
 *
 * Uso:
 *   node scripts/auditoria-2anos-milhares.cjs
 *   node scripts/auditoria-2anos-milhares.cjs --users 2000 --seed 20260912
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, loadCoreGlobals, loadLoader } = require('./lib/load-core.cjs');

// billing.js é ESM no package type=module — carrega helpers via createRequire + VM fallback
let billingHelpers;
try {
  const { createRequire } = require('module');
  const req = createRequire(__filename);
  billingHelpers = req(path.join(ROOT, 'js', 'billing.js'));
  if (!billingHelpers || typeof billingHelpers.entitlementAtivo !== 'function') {
    throw new Error('helpers incomplete');
  }
} catch (_e) {
  billingHelpers = null;
}

/** Fallback alinhado a BILLING._activeStatus / testes welcome-trial. */
function entitlementAtivo(sub, nowMs) {
  if (billingHelpers && typeof billingHelpers.entitlementAtivo === 'function' && nowMs == null) {
    return billingHelpers.entitlementAtivo(sub);
  }
  if (!sub || !sub.status) return false;
  const st = String(sub.status).toUpperCase();
  const now = nowMs != null ? nowMs : Date.now();
  if (st === 'TRIALING') {
    if (!sub.trialEndsAt) return false;
    return new Date(sub.trialEndsAt).getTime() > now;
  }
  if (st === 'ACTIVE' || st === 'PAST_DUE') {
    if (sub.currentPeriodEnd) return new Date(sub.currentPeriodEnd).getTime() > now;
    return st === 'ACTIVE';
  }
  return false;
}

function checkQuota(kind, tier, usage, increment) {
  if (billingHelpers && typeof billingHelpers.checkQuota === 'function') {
    return billingHelpers.checkQuota(kind, tier, true, usage, increment);
  }
  const limits = (billingHelpers && billingHelpers.PLAN_LIMITS) || {
    FREE: { maxGoals: 1, maxSubscriptions: 5, maxBillsToPay: 5, maxAccounts: 5 },
    PRO: { maxGoals: Infinity, maxSubscriptions: Infinity, maxBillsToPay: Infinity, maxAccounts: Infinity },
  };
  if ((tier === 'PRO' || tier === 'BUSINESS')) return { allowed: true };
  const map = {
    goal: ['maxGoals', 'goals'],
    subscription: ['maxSubscriptions', 'subscriptions'],
    bill: ['maxBillsToPay', 'billsToPay'],
    account: ['maxAccounts', 'accounts'],
  };
  const m = map[kind];
  if (!m) return { allowed: true };
  const teto = (limits[tier] || limits.FREE)[m[0]];
  if (teto === Infinity || !isFinite(teto)) return { allowed: true };
  if ((usage[m[1]] || 0) + (increment || 1) > teto) return { allowed: false, kind: kind, limit: teto };
  return { allowed: true };
}

function hasTier(current, min) {
  if (billingHelpers && typeof billingHelpers.hasTier === 'function') {
    return billingHelpers.hasTier(current, min);
  }
  const order = { FREE: 0, PRO: 1, BUSINESS: 2 };
  return (order[current] || 0) >= (order[min] || 0);
}

const ARGS = parseArgs(process.argv.slice(2));
const BASE_SEED = Number(ARGS.seed) || 20260912;
const NUM_USERS = Math.max(50, Math.min(5000, Number(ARGS.users) || 2000));
const YEARS = Math.max(1, Math.min(3, Number(ARGS.years) || 2));
const OUT_DIR = path.join(ROOT, 'docs', 'audit-runs');
const STAMP = String(BASE_SEED);
const OUT_JSON = path.join(OUT_DIR, `audit-2y-${STAMP}.json`);
const OUT_MD = path.join(OUT_DIR, `audit-2y-${STAMP}.md`);
const OUT_HTML = path.join(OUT_DIR, `audit-2y-${STAMP}.html`);

let FINDING_SEQ = 1;

/** Perfis comportamentais + jornada de plano. */
const PERSONAS = {
  A: { id: 'A', nome: 'Organizado-mensal', peso: 0.10, txPerMonth: [4, 10], journey: 'monthly' },
  B: { id: 'B', nome: 'Desorganizado-free', peso: 0.09, txPerMonth: [2, 8], journey: 'free' },
  C: { id: 'C', nome: 'Intensivo-anual', peso: 0.09, txPerMonth: [12, 28], journey: 'annual' },
  D: { id: 'D', nome: 'Casual-trial-churn', peso: 0.08, txPerMonth: [0, 3], journey: 'trial_churn' },
  E: { id: 'E', nome: 'Erroneo-edge', peso: 0.08, txPerMonth: [3, 9], journey: 'free' },
  F: { id: 'F', nome: 'Negocio-reativa', peso: 0.08, txPerMonth: [8, 18], journey: 'churn_reactivate' },
  G: { id: 'G', nome: 'Historico-pro', peso: 0.08, txPerMonth: [10, 22], journey: 'monthly' },
  H: { id: 'H', nome: 'Familia-anual', peso: 0.07, txPerMonth: [6, 14], journey: 'annual' },
  I: { id: 'I', nome: 'Estudante-free', peso: 0.07, txPerMonth: [1, 5], journey: 'free' },
  J: { id: 'J', nome: 'Investidor-past_due', peso: 0.07, txPerMonth: [5, 12], journey: 'past_due' },
  K: { id: 'K', nome: 'Freelancer-mensal-cancel', peso: 0.07, txPerMonth: [7, 16], journey: 'monthly_cancel' },
  L: { id: 'L', nome: 'Power-upgrade-downgrade', peso: 0.12, txPerMonth: [15, 35], journey: 'upgrade_downgrade' },
};

const CATS_D = ['alimentacao', 'transporte', 'moradia', 'saude', 'lazer', 'assinaturas', 'educacao', 'outro'];
const CATS_R = ['salario', 'freelance', 'investimentos', 'vendas'];
const EDGE_VALS = [0.01, 0.1, 1, 999.99, 10000];
const START = { y: 2024, m: 9 }; // 24 meses até ago/2026 se YEARS=2

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--users') out.users = argv[++i];
    else if (argv[i] === '--seed') out.seed = argv[++i];
    else if (argv[i] === '--years') out.years = argv[++i];
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

function addMonths(y, m, delta) {
  const idx = (y * 12 + (m - 1)) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

function monthsInSpan() {
  return YEARS * 12;
}

function addFinding(findings, f) {
  findings.push(Object.assign({
    id: 'FP-2Y-' + String(FINDING_SEQ++).padStart(4, '0'),
    seed: BASE_SEED,
    ts: new Date().toISOString(),
    categoria: f.categoria || 'dados',
    severidade: f.severidade || 'P2',
    persona: f.persona || null,
    userId: f.userId != null ? f.userId : null,
    tela: f.tela || 'nucleo',
    acao: f.acao,
    causaProvavel: f.causaProvavel || '',
    evidencia: f.evidencia || null,
  }, f));
}

function centavos(v) {
  return Math.round(Number(v) * 100);
}

function assignPersona(rng) {
  const roll = rng();
  let acc = 0;
  const keys = Object.keys(PERSONAS);
  for (let i = 0; i < keys.length; i++) {
    acc += PERSONAS[keys[i]].peso;
    if (roll < acc) return PERSONAS[keys[i]];
  }
  return PERSONAS.I;
}

/** Estado de entitlement simulado (espelha regras de BILLING.entitlementAtivo). */
function makeEntitlement(journey, monthIdx, rng) {
  const now = addMonths(START.y, START.m, monthIdx);
  const periodEnd = addMonths(now.y, now.m, 1);
  const endIso = isoDate(periodEnd.y, periodEnd.m, 28) + 'T23:59:59.000Z';
  const pastEnd = isoDate(addMonths(now.y, now.m, -2).y, addMonths(now.y, now.m, -2).m, 1) + 'T00:00:00.000Z';

  switch (journey) {
    case 'free':
      return { tier: 'FREE', status: 'NONE', interval: null, cancelAtPeriodEnd: false };
    case 'trial_churn':
      if (monthIdx < 1) {
        return {
          tier: 'PRO', status: 'TRIALING', interval: 'month',
          trialEndsAt: isoDate(addMonths(START.y, START.m, 1).y, addMonths(START.y, START.m, 1).m, 15) + 'T00:00:00.000Z',
          cancelAtPeriodEnd: false,
        };
      }
      return { tier: 'FREE', status: 'CANCELED', interval: 'month', cancelAtPeriodEnd: false };
    case 'monthly':
      return { tier: 'PRO', status: 'ACTIVE', interval: 'month', currentPeriodEnd: endIso, cancelAtPeriodEnd: false };
    case 'annual':
      return { tier: 'PRO', status: 'ACTIVE', interval: 'year', currentPeriodEnd: endIso, cancelAtPeriodEnd: false };
    case 'monthly_cancel':
      if (monthIdx < 8) {
        return { tier: 'PRO', status: 'ACTIVE', interval: 'month', currentPeriodEnd: endIso, cancelAtPeriodEnd: monthIdx >= 6 };
      }
      return { tier: 'FREE', status: 'CANCELED', interval: 'month', cancelAtPeriodEnd: false };
    case 'churn_reactivate':
      if (monthIdx < 4) {
        return { tier: 'PRO', status: 'ACTIVE', interval: 'month', currentPeriodEnd: endIso, cancelAtPeriodEnd: false };
      }
      if (monthIdx < 10) {
        return { tier: 'FREE', status: 'CANCELED', interval: 'month', cancelAtPeriodEnd: false };
      }
      return { tier: 'PRO', status: 'ACTIVE', interval: 'year', currentPeriodEnd: endIso, cancelAtPeriodEnd: false };
    case 'past_due':
      if (monthIdx < 6) {
        return { tier: 'PRO', status: 'ACTIVE', interval: 'month', currentPeriodEnd: endIso, cancelAtPeriodEnd: false };
      }
      if (monthIdx < 8) {
        return { tier: 'PRO', status: 'PAST_DUE', interval: 'month', currentPeriodEnd: endIso, cancelAtPeriodEnd: false };
      }
      return { tier: 'FREE', status: 'PAST_DUE', interval: 'month', currentPeriodEnd: pastEnd, cancelAtPeriodEnd: false };
    case 'upgrade_downgrade': {
      if (monthIdx < 3) return { tier: 'FREE', status: 'NONE', interval: null, cancelAtPeriodEnd: false };
      if (monthIdx < 12) return { tier: 'PRO', status: 'ACTIVE', interval: 'month', currentPeriodEnd: endIso, cancelAtPeriodEnd: false };
      if (monthIdx < 18) return { tier: 'PRO', status: 'ACTIVE', interval: 'year', currentPeriodEnd: endIso, cancelAtPeriodEnd: false };
      if (rng() < 0.3) return { tier: 'FREE', status: 'CANCELED', interval: 'year', cancelAtPeriodEnd: false };
      return { tier: 'PRO', status: 'ACTIVE', interval: 'month', currentPeriodEnd: endIso, cancelAtPeriodEnd: false };
    }
    default:
      return { tier: 'FREE', status: 'NONE', interval: null, cancelAtPeriodEnd: false };
  }
}

function applyBillingStub(ent, simNowMs) {
  let resolved = 'FREE';
  if (ent.status !== 'NONE' && ent.status !== 'INACTIVE') {
    const ativo = entitlementAtivo({
      status: ent.status,
      trialEndsAt: ent.trialEndsAt || null,
      currentPeriodEnd: ent.currentPeriodEnd || null,
    }, simNowMs);
    if (ativo) resolved = 'PRO';
  }

  global.BILLING = {
    getTier: function() { return resolved; },
    hasTier: function(min) { return hasTier(resolved, min); },
    guardQuota: function(kind, increment) {
      const check = checkQuota(kind, resolved, {
        goals: (typeof METAS !== 'undefined' && METAS.listar) ? METAS.listar().length : 0,
        subscriptions: (typeof ASSINATURAS !== 'undefined' && ASSINATURAS.listar) ? ASSINATURAS.listar().length : 0,
        billsToPay: (typeof CONTAS_PAGAR !== 'undefined' && CONTAS_PAGAR.listarPendentes) ? CONTAS_PAGAR.listarPendentes().length : 0,
        accounts: (typeof DADOS !== 'undefined' && DADOS.getContas) ? DADOS.getContas().length : 0,
      }, increment || 1);
      return !!(check && check.allowed);
    },
    PLAN_LIMITS: (billingHelpers && billingHelpers.PLAN_LIMITS) || {},
    _cache: { tier: resolved, subscription: ent },
  };
  return { resolved, ent };
}

function setupUser(userId, rng, persona) {
  const contaA = 'aaaaaaaa-bbbb-4ccc-' + String(userId).padStart(12, '0');
  const contaB = 'bbbbbbbb-cccc-4ddd-' + String(userId).padStart(12, '0');
  DADOS.salvarContas([
    { id: contaA, nome: 'Corrente-' + userId, tipo: 'corrente' },
    { id: contaB, nome: 'Reserva-' + userId, tipo: 'poupanca' },
  ]);
  DADOS.salvarConfig({
    nome: 'Virtual ' + persona.id + '-' + userId,
    renda: persona.id === 'F' || persona.id === 'L' ? 18000 : 3500 + (userId % 20) * 400,
    regra503020: { nec: 50, des: 30, pou: 20 },
    orcamentos: {
      alimentacao: { limite: 900, definidoEm: '2024-09-01T00:00:00.000Z' },
      transporte: { limite: 450, definidoEm: '2024-09-01T00:00:00.000Z' },
      lazer: { limite: 350, definidoEm: '2024-09-01T00:00:00.000Z' },
      moradia: { limite: 2000, definidoEm: '2024-09-01T00:00:00.000Z' },
    },
    metas: [],
    assinaturas: [],
    contasPagar: [],
    patrimonio: { ativos: [], dividas: [] },
  });
  CONTAS.init();
  TRANSACOES.init();
  ORCAMENTO.init();
  if (typeof METAS !== 'undefined') METAS.init();
  if (typeof PATRIMONIO !== 'undefined' && PATRIMONIO.init) PATRIMONIO.init();
  if (typeof ASSINATURAS !== 'undefined' && ASSINATURAS.init) ASSINATURAS.init();
  if (typeof CONTAS_PAGAR !== 'undefined' && CONTAS_PAGAR.init) CONTAS_PAGAR.init();
  return { contaA, contaB };
}

function simulateUser(userId, rng, persona, stats, findings, resetFixtures) {
  resetFixtures();
  const accounts = setupUser(userId, rng, persona);
  const totalMonths = monthsInSpan();
  let billingEvents = { trial: 0, purchase: 0, cancel: 0, reactivate: 0, annual: 0, monthly: 0, pastDue: 0 };
  let lastTier = 'FREE';
  let metaIds = [];
  let ativoIds = [];
  let dividaIds = [];

  for (let mi = 0; mi < totalMonths; mi++) {
    const ym = addMonths(START.y, START.m, mi);
    const simNowMs = new Date(ym.y, ym.m - 1, 15).getTime();
    const ent = makeEntitlement(persona.journey, mi, rng);
    const { resolved } = applyBillingStub(ent, simNowMs);

    if (resolved === 'PRO' && lastTier === 'FREE') {
      if (billingEvents.cancel > 0) {
        billingEvents.reactivate++;
        stats.billingReactivate++;
      } else {
        billingEvents.purchase++;
        stats.billingPurchase++;
      }
      if (ent.interval === 'year') { billingEvents.annual++; stats.billingAnnual++; }
      else if (ent.interval === 'month') { billingEvents.monthly++; stats.billingMonthly++; }
    }
    if (resolved === 'FREE' && lastTier === 'PRO') {
      billingEvents.cancel++;
      stats.billingCancel++;
    }
    if (ent.status === 'TRIALING') { billingEvents.trial++; stats.billingTrial++; }
    if (ent.status === 'PAST_DUE') { billingEvents.pastDue++; stats.billingPastDue++; }
    lastTier = resolved;

    // ── Cadastro / metas (aba Metas) ──
    if (mi === 0 || (rng() < 0.08 && metaIds.length < 4)) {
      try {
        const m = METAS.criar({
          titulo: 'Meta ' + persona.id + '-' + userId + '-' + mi,
          valorAlvo: 1000 + Math.floor(rng() * 20000),
          valorAtual: Math.floor(rng() * 200),
          prazo: isoDate(ym.y + 1, ym.m, 15),
        });
        metaIds.push(m.id);
        stats.metasCreated++;
      } catch (e) {
        stats.quotaBlocks++;
        if (resolved === 'PRO') {
          addFinding(findings, {
            severidade: 'P1', categoria: 'billing', tela: 'metas', persona: persona.id, userId,
            acao: 'meta-bloqueada-em-pro', causaProvavel: e.message,
          });
        } else {
          stats.quotaExpected++;
        }
      }
    }
    if (metaIds.length && rng() < 0.35) {
      try {
        METAS.registrarAporte(pick(rng, metaIds), 50 + Math.floor(rng() * 400));
        stats.metasAporte++;
      } catch (_e) { stats.rejected++; }
    }

    // ── Patrimônio (ativos + dívidas) ──
    if (mi === 0 || (rng() < 0.06 && ativoIds.length < 6)) {
      try {
        const a = PATRIMONIO.criarAtivo({
          nome: 'Ativo-' + userId + '-' + mi,
          tipo: pick(rng, ['investimento', 'imovel', 'veiculo', 'outro']),
          valor: 1000 + Math.floor(rng() * 80000),
        });
        ativoIds.push(a.id);
        stats.ativosCreated++;
      } catch (e) {
        stats.rejected++;
      }
    }
    if (mi === 1 || (rng() < 0.05 && dividaIds.length < 4)) {
      try {
        const d = PATRIMONIO.criarDivida({
          nome: 'Divida-' + userId + '-' + mi,
          tipo: pick(rng, ['emprestimo', 'financiamento', 'cartao', 'outro']),
          valor: 500 + Math.floor(rng() * 40000),
        });
        dividaIds.push(d.id);
        stats.dividasCreated++;
      } catch (_e) { stats.rejected++; }
    }
    if (ativoIds.length && rng() < 0.1) {
      try {
        PATRIMONIO.atualizarAtivo(pick(rng, ativoIds), { valor: 500 + Math.floor(rng() * 90000) });
        stats.ativosUpdated++;
      } catch (_e) { stats.rejected++; }
    }

    // ── Assinaturas / gastos fixos ──
    if (mi === 0 || rng() < 0.04) {
      try {
        ASSINATURAS.criar({
          nome: pick(rng, ['Netflix', 'Spotify', 'Gym', 'iCloud', 'Office']),
          valor: 19.9 + Math.floor(rng() * 80),
          diaCobranca: 1 + Math.floor(rng() * 28),
        });
        stats.assinaturasCreated++;
      } catch (e) {
        if (e.code === 'quota' || /Limite/.test(e.message)) {
          stats.quotaBlocks++;
          if (resolved === 'PRO') {
            addFinding(findings, {
              severidade: 'P1', categoria: 'billing', tela: 'assinaturas', persona: persona.id, userId,
              acao: 'assinatura-bloqueada-em-pro', causaProvavel: e.message,
            });
          } else stats.quotaExpected++;
        } else stats.rejected++;
      }
    }

    // ── Contas a pagar / dívidas do mês ──
    if (rng() < 0.25) {
      try {
        const c = CONTAS_PAGAR.criar({
          descricao: 'Conta ' + mi + '-' + userId,
          valor: 40 + Math.floor(rng() * 600),
          vencimento: isoDate(ym.y, ym.m, 5 + Math.floor(rng() * 20)),
          categoria: pick(rng, CATS_D),
          recorrente: rng() < 0.3,
        });
        stats.contasPagarCreated++;
        if (rng() < 0.55 && c && c.id) {
          CONTAS_PAGAR.marcarPago(c.id, false);
          stats.contasPagarPaid++;
        }
      } catch (e) {
        if (e.code === 'quota' || /Limite/.test(e.message)) {
          stats.quotaBlocks++;
          if (resolved === 'PRO') {
            addFinding(findings, {
              severidade: 'P1', categoria: 'billing', tela: 'contas-pagar', persona: persona.id, userId,
              acao: 'conta-pagar-bloqueada-em-pro', causaProvavel: e.message,
            });
          } else stats.quotaExpected++;
        } else stats.rejected++;
      }
    }

    // ── Lançamentos do mês (Extrato / Novo) ──
    const [tMin, tMax] = persona.txPerMonth;
    const nTx = tMin + Math.floor(rng() * (tMax - tMin + 1));
    for (let i = 0; i < nTx; i++) {
      const dia = 1 + Math.floor(rng() * 28);
      const data = isoDate(ym.y, ym.m, dia);
      const op = rng();
      const tipo = op < 0.55 ? 'despesa' : 'receita';
      const cat = tipo === 'receita' ? pick(rng, CATS_R) : pick(rng, CATS_D);
      let valor = persona.id === 'E' && rng() < 0.2
        ? pick(rng, EDGE_VALS)
        : Math.round((5 + rng() * 900) * 100) / 100;
      const desc = 'Sim2y ' + persona.id + '-' + userId + '-' + mi + '-' + i;

      try {
        if (persona.id === 'E' && op < 0.03) {
          TRANSACOES.criar(tipo, 0, cat, data, desc, accounts.contaA, '');
          stats.rejected++;
          stats.expectedRejections++;
        } else if (op < 0.08 && i > 2) {
          const txs = DADOS.getTransacoes();
          const alvo = txs[Math.floor(rng() * Math.min(txs.length, 40))];
          if (alvo) { TRANSACOES.deletar(alvo.id); stats.deleted++; }
        } else if (op < 0.15 && i > 1) {
          const txs = DADOS.getTransacoes();
          const alvo = txs[Math.floor(rng() * Math.min(txs.length, 40))];
          if (alvo) {
            TRANSACOES.atualizar(alvo.id, { valor: Math.round((valor + 10) * 100) / 100 });
            stats.edited++;
          }
        } else if (op < 0.18) {
          TRANSACOES.criarTransferencia({
            origem: accounts.contaA,
            destino: accounts.contaB,
            valor: Math.max(1, Math.round(valor * 0.2 * 100) / 100),
            data: data,
            descricao: 'TF ' + mi,
          });
          stats.transfers++;
        } else {
          TRANSACOES.criar(tipo, valor, cat, data, desc, 'Corrente-' + userId, '', {
            accountId: accounts.contaA,
          });
          stats.created++;
        }
      } catch (e) {
        stats.rejected++;
        if (persona.id === 'E') stats.expectedRejections++;
        else if (stats.unexpectedRejections++ < 8) {
          addFinding(findings, {
            severidade: 'P2', categoria: 'logica', tela: 'extrato', persona: persona.id, userId,
            acao: 'operacao-rejeitada-inesperada', causaProvavel: e.message,
            evidencia: { mi, i, tipo, valor, data },
          });
        }
      }
    }

    // Consultas (Dashboard / Extrato / Orçamento / Patrimônio)
    if (rng() < 0.4) {
      TRANSACOES.obter({ mes: ym.m, ano: ym.y });
      ORCAMENTO.obterStatusTodos(ym.m, ym.y);
      stats.queries++;
    }
    if (rng() < 0.2 && typeof PATRIMONIO.patrimonioLiquido === 'function') {
      PATRIMONIO.patrimonioLiquido();
      stats.queries++;
    }
  }

  // ── Consistência final ──
  TRANSACOES.invalidateCache();
  const txs = DADOS.getTransacoes();
  const fim = addMonths(START.y, START.m, totalMonths - 1);
  const resumo = TRANSACOES.obterResumoMes(fim.m, fim.y);
  let rec = 0;
  let des = 0;
  const prefix = fim.y + '-' + String(fim.m).padStart(2, '0');
  txs.forEach(function(t) {
    if (!t || t.deletedAt) return;
    if (!t.data || t.data.slice(0, 7) !== prefix) return;
    if (t.tipo === 'receita') rec += centavos(t.valor);
    else if (t.tipo === 'despesa') des += centavos(t.valor);
  });
  const manualSaldo = (rec - des) / 100;
  if (Math.abs(resumo.saldo - manualSaldo) > 0.05) {
    addFinding(findings, {
      severidade: 'P0', categoria: 'dados', tela: 'extrato', persona: persona.id, userId,
      acao: 'resumo-mes-diverge-apos-2anos',
      causaProvavel: 'obterResumoMes != soma manual',
      evidencia: { resumo: resumo.saldo, manualSaldo, nTx: txs.length },
    });
  }

  if (typeof PATRIMONIO !== 'undefined' && PATRIMONIO.patrimonioLiquido) {
    const liq = PATRIMONIO.patrimonioLiquido();
    const ativos = PATRIMONIO.totalAtivos ? PATRIMONIO.totalAtivos() : null;
    const dividas = PATRIMONIO.totalDividas ? PATRIMONIO.totalDividas() : null;
    if (ativos != null && dividas != null && Math.abs(liq - (ativos - dividas)) > 0.05) {
      addFinding(findings, {
        severidade: 'P0', categoria: 'dados', tela: 'patrimonio', persona: persona.id, userId,
        acao: 'patrimonio-liquido-inconsistente',
        evidencia: { liq, ativos, dividas },
      });
    }
  }

  // Billing journey sanity via helpers
  const sample = makeEntitlement(persona.journey, Math.floor(totalMonths / 2), rng);
  const mid = addMonths(START.y, START.m, Math.floor(totalMonths / 2));
  const midMs = new Date(mid.y, mid.m - 1, 15).getTime();
  if (sample.status === 'ACTIVE' && sample.currentPeriodEnd) {
    const ativo = entitlementAtivo({
      status: 'ACTIVE',
      currentPeriodEnd: sample.currentPeriodEnd,
    }, midMs);
    if (!ativo) {
      addFinding(findings, {
        severidade: 'P1', categoria: 'billing', tela: 'billing', persona: persona.id, userId,
        acao: 'entitlement-ativo-falso-negativo',
        evidencia: sample,
      });
    }
  }

  stats.txFinal += txs.length;
  stats.byPersona[persona.id] = (stats.byPersona[persona.id] || 0) + 1;
  stats.byJourney[persona.journey] = (stats.byJourney[persona.journey] || 0) + 1;
  stats.usersCompleted++;
}

function dedupeFindings(findings) {
  const map = new Map();
  findings.forEach(function(f) {
    const key = f.severidade + '|' + f.acao + '|' + (f.persona || '');
    if (!map.has(key)) map.set(key, Object.assign({}, f, { ocorrencias: 1 }));
    else map.get(key).ocorrencias += 1;
  });
  return Array.from(map.values()).sort(function(a, b) {
    const ord = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return (ord[a.severidade] || 9) - (ord[b.severidade] || 9);
  });
}

function renderMd(report) {
  const lines = [
    '# Auditoria 2 anos — milhares de usuários',
    '',
    '## Resumo',
    '',
    '| Métrica | Valor |',
    '|---------|-------|',
    '| Seed | ' + report.seed + ' |',
    '| Usuários | ' + report.users + ' |',
    '| Meses simulados / usuário | ' + report.months + ' |',
    '| Personas | ' + Object.keys(PERSONAS).length + ' |',
    '| Tx criadas | ' + report.stats.created + ' |',
    '| Edições / exclusões / TF | ' + report.stats.edited + ' / ' + report.stats.deleted + ' / ' + report.stats.transfers + ' |',
    '| Metas / aportes | ' + report.stats.metasCreated + ' / ' + report.stats.metasAporte + ' |',
    '| Ativos / dívidas | ' + report.stats.ativosCreated + ' / ' + report.stats.dividasCreated + ' |',
    '| Assinaturas | ' + report.stats.assinaturasCreated + ' |',
    '| Contas a pagar (criadas/pagas) | ' + report.stats.contasPagarCreated + ' / ' + report.stats.contasPagarPaid + ' |',
    '| Billing purchase / cancel / reactivate | ' + report.stats.billingPurchase + ' / ' + report.stats.billingCancel + ' / ' + report.stats.billingReactivate + ' |',
    '| Billing mensal / anual / trial / past_due | ' + report.stats.billingMonthly + ' / ' + report.stats.billingAnnual + ' / ' + report.stats.billingTrial + ' / ' + report.stats.billingPastDue + ' |',
    '| Quota blocks (esperados) | ' + report.stats.quotaBlocks + ' (' + report.stats.quotaExpected + ') |',
    '| Achados únicos | ' + report.uniqueFindings.length + ' |',
    '| Duração | ' + report.simMs + 'ms |',
    '',
    '### Por persona',
    '',
  ];
  Object.keys(PERSONAS).forEach(function(k) {
    lines.push('- **' + k + '** ' + PERSONAS[k].nome + ' [' + PERSONAS[k].journey + ']: ' + (report.stats.byPersona[k] || 0));
  });
  lines.push('', '### Por jornada de billing', '');
  Object.keys(report.stats.byJourney || {}).forEach(function(j) {
    lines.push('- **' + j + '**: ' + report.stats.byJourney[j]);
  });
  lines.push('', '## Achados', '');
  if (!report.uniqueFindings.length) lines.push('_Nenhum achado crítico na simulação._');
  else {
    report.uniqueFindings.slice(0, 30).forEach(function(f, i) {
      lines.push((i + 1) + '. **' + f.severidade + '** `' + f.acao + '` (' + f.ocorrencias + 'x) — ' + (f.causaProvavel || ''));
    });
  }
  lines.push('');
  return lines.join('\n');
}

function renderHtml(report) {
  const findingsRows = report.uniqueFindings.length
    ? report.uniqueFindings.slice(0, 40).map(function(f) {
      return '<tr><td>' + f.severidade + '</td><td><code>' + f.acao + '</code></td><td>' + f.ocorrencias + '</td><td>' + (f.tela || '') + '</td><td>' + (f.causaProvavel || '') + '</td></tr>';
    }).join('')
    : '<tr><td colspan="5">Nenhum achado</td></tr>';
  const personaRows = Object.keys(PERSONAS).map(function(k) {
    return '<tr><td>' + k + '</td><td>' + PERSONAS[k].nome + '</td><td>' + PERSONAS[k].journey + '</td><td>' + (report.stats.byPersona[k] || 0) + '</td></tr>';
  }).join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Auditoria 2 anos</title>
<style>
body{font-family:system-ui,sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;color:#1a1a1a;background:#fafafa}
h1{font-size:1.5rem} table{border-collapse:collapse;width:100%;margin:1rem 0;background:#fff}
th,td{border:1px solid #ddd;padding:.45rem .6rem;font-size:.9rem;text-align:left}
th{background:#f0f0f0} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.75rem;margin:1rem 0}
.card{background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:.75rem} .card b{display:block;font-size:1.25rem}
</style></head><body>
<h1>Auditoria 2 anos — milhares de usuários</h1>
<p>Seed <b>${report.seed}</b> · ${report.users} usuários · ${report.months} meses · ${report.simMs}ms</p>
<div class="grid">
<div class="card"><span>Tx criadas</span><b>${report.stats.created}</b></div>
<div class="card"><span>Metas</span><b>${report.stats.metasCreated}</b></div>
<div class="card"><span>Patrimônio</span><b>${report.stats.ativosCreated + report.stats.dividasCreated}</b></div>
<div class="card"><span>Compras plano</span><b>${report.stats.billingPurchase}</b></div>
<div class="card"><span>Cancelamentos</span><b>${report.stats.billingCancel}</b></div>
<div class="card"><span>Reativações</span><b>${report.stats.billingReactivate}</b></div>
<div class="card"><span>Achados</span><b>${report.uniqueFindings.length}</b></div>
</div>
<h2>Personas</h2>
<table><thead><tr><th>ID</th><th>Nome</th><th>Jornada</th><th>Users</th></tr></thead><tbody>${personaRows}</tbody></table>
<h2>Achados</h2>
<table><thead><tr><th>Sev</th><th>Ação</th><th>N</th><th>Tela</th><th>Causa</th></tr></thead><tbody>${findingsRows}</tbody></table>
</body></html>`;
}

function main() {
  const { resetFixtures } = loadCoreGlobals();
  // Garante PATRIMONIO/ASSINATURAS/CONTAS_PAGAR no global (já carregados por loadCoreModules)
  if (typeof PATRIMONIO === 'undefined' || typeof METAS === 'undefined') {
    console.error('[audit-2y] módulos core incompletos');
    process.exit(1);
  }

  const findings = [];
  const stats = {
    created: 0, edited: 0, deleted: 0, transfers: 0, rejected: 0, queries: 0,
    txFinal: 0, expectedRejections: 0, unexpectedRejections: 0,
    metasCreated: 0, metasAporte: 0,
    ativosCreated: 0, ativosUpdated: 0, dividasCreated: 0,
    assinaturasCreated: 0, contasPagarCreated: 0, contasPagarPaid: 0,
    billingPurchase: 0, billingCancel: 0, billingReactivate: 0,
    billingMonthly: 0, billingAnnual: 0, billingTrial: 0, billingPastDue: 0,
    quotaBlocks: 0, quotaExpected: 0, usersCompleted: 0,
    byPersona: {}, byJourney: {},
  };

  console.log('[audit-2y] users=%d months=%d seed=%d', NUM_USERS, monthsInSpan(), BASE_SEED);
  const t0 = Date.now();
  for (let u = 0; u < NUM_USERS; u++) {
    const rng = mulberry32(BASE_SEED + u * 9973);
    const persona = assignPersona(rng);
    simulateUser(u, mulberry32(BASE_SEED + u * 7919), persona, stats, findings, resetFixtures);
    if ((u + 1) % 200 === 0) {
      console.log('[audit-2y] progresso %d/%d (%dms)', u + 1, NUM_USERS, Date.now() - t0);
    }
  }
  const simMs = Date.now() - t0;
  stats.ops = stats.created + stats.edited + stats.deleted + stats.transfers + stats.queries
    + stats.metasCreated + stats.ativosCreated + stats.dividasCreated + stats.assinaturasCreated
    + stats.contasPagarCreated;

  const uniqueFindings = dedupeFindings(findings);
  const report = {
    seed: BASE_SEED,
    users: NUM_USERS,
    months: monthsInSpan(),
    years: YEARS,
    personas: PERSONAS,
    stats: stats,
    uniqueFindings: uniqueFindings,
    findingsSample: findings.slice(0, 100),
    simMs: simMs,
  };

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  fs.writeFileSync(OUT_MD, renderMd(report));
  fs.writeFileSync(OUT_HTML, renderHtml(report));

  console.log('[audit-2y] OK — %d users, %d ops, %d achados, %dms', NUM_USERS, stats.ops, uniqueFindings.length, simMs);
  console.log('[audit-2y] MD  ', OUT_MD);
  console.log('[audit-2y] HTML', OUT_HTML);
  console.log('[audit-2y] JSON', OUT_JSON);

  const p0 = uniqueFindings.filter(function(f) { return f.severidade === 'P0'; });
  if (p0.length) {
    console.error('[audit-2y] FALHA: %d achados P0', p0.length);
    process.exitCode = 1;
  }
}

main();
