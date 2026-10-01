/**
 * billing/cotas.js — contagem de uso e as cotas do plano grátis (checar, barrar, rótulo, resposta 402).
 *
 * Parte de BILLING (js/billing.js, que importa todas as partes): cada uma
 * acrescenta seus métodos ao mesmo objeto, criado em billing/base.js. Os
 * métodos continuam se chamando por BILLING.x.
 */

import { BILLING } from './base.js';
import { UTILS } from '../core/utils.js';
import { FUNIL } from '../utilities/funil.js';
import { TRANSACOES } from '../transacoes.js';
import { ORCAMENTO } from '../orcamento.js';
import { CONTAS } from '../contas.js';
import { DADOS } from '../core/dados.js';

Object.assign(BILLING, {

  countTransactionsThisMonth: function() {
    if (typeof TRANSACOES === 'undefined' || !TRANSACOES.obter) return 0;
    var now = new Date();
    return TRANSACOES.obter({ mes: now.getMonth() + 1, ano: now.getFullYear() }).length;
  },

  _cfg: function() {
    return (typeof DADOS !== 'undefined' && DADOS.getConfig) ? (DADOS.getConfig() || {}) : {};
  },

  _countAccountsForLimit: function() {
    var total = 0;
    var cfg = BILLING._cfg();
    total += (cfg.bancos || []).length;
    total += (cfg.cartoes || []).length;
    if (typeof CONTAS !== 'undefined' && CONTAS.listar) {
      total += CONTAS.listar().length;
    }
    return total;
  },

  _countBudgets: function() {
    if (typeof ORCAMENTO !== 'undefined' && ORCAMENTO.obterTodos) {
      var all = ORCAMENTO.obterTodos();
      return Object.keys(all).filter(function(k) {
        return all[k] && Number(all[k].limite) > 0;
      }).length;
    }
    return 0;
  },

  _countGoals: function() {
    return (BILLING._cfg().metas || []).length;
  },

  _countBillsToPay: function() {
    return (BILLING._cfg().contasPagar || []).length;
  },

  _countSubscriptions: function() {
    return (BILLING._cfg().assinaturas || []).length;
  },

  _countCustomCategories: function() {
    var custom = BILLING._cfg().categoriasCustom || {};
    var total = 0;
    Object.keys(custom).forEach(function(tipo) {
      if (Array.isArray(custom[tipo])) total += custom[tipo].length;
    });
    return total;
  },

  /** Recorrencia mora na transacao, nao numa lista propria: conta os modelos. */
  _countRecurring: function() {
    if (typeof DADOS === 'undefined' || !DADOS.getTransacoes) return 0;
    var txs = DADOS.getTransacoes() || [];
    var vistos = {};
    txs.forEach(function(t) {
      if (!t || !t.recorrencia || t.recorrencia === 'unica') return;
      var chave = (t.descricao || '') + '|' + t.valor + '|' + t.recorrencia;
      vistos[chave] = true;
    });
    return Object.keys(vistos).length;
  },

  getUsage: function() {
    var limits = BILLING.getLimits();
    return {
      transactionsThisMonth: BILLING.countTransactionsThisMonth(),
      maxTransPerMonth: limits.maxTransPerMonth,
      accounts: BILLING._countAccountsForLimit(),
      maxAccounts: limits.maxAccounts,
      budgets: BILLING._countBudgets(),
      maxBudgets: limits.maxBudgets,
      goals: BILLING._countGoals(),
      maxGoals: limits.maxGoals,
      recurring: BILLING._countRecurring(),
      maxRecurring: limits.maxRecurring,
      billsToPay: BILLING._countBillsToPay(),
      maxBillsToPay: limits.maxBillsToPay,
      subscriptions: BILLING._countSubscriptions(),
      maxSubscriptions: limits.maxSubscriptions,
      customCategories: BILLING._countCustomCategories(),
      maxCustomCategories: limits.maxCustomCategories,
      historyMonths: limits.historyMonths,
      tier: BILLING.getTier(),
      enforcing: BILLING.shouldEnforceLimits(),
    };
  },

  /**
   * Cada quota: onde contar, qual teto e o que dizer ao estourar.
   *
   * A mensagem nomeia o que o Pro FAZ, nao o limite que ele remove -- e o que
   * o usuario le no momento em que decide.
   */
  _QUOTAS: {
    account: {
      limite: 'maxAccounts', uso: 'accounts',
      msg: 'Sua vida financeira já passa de %L contas. O Pro acompanha todas, sem teto.',
    },
    budget: {
      limite: 'maxBudgets', uso: 'budgets',
      msg: 'O plano gratuito controla %L categorias. O Pro controla quantas você quiser.',
    },
    goal: {
      limite: 'maxGoals', uso: 'goals',
      msg: 'Duas metas ao mesmo tempo é coisa de quem planeja. O Pro libera quantas quiser.',
    },
    recurring: {
      limite: 'maxRecurring', uso: 'recurring',
      msg: 'O gratuito automatiza %L lançamentos recorrentes. O Pro automatiza todos.',
    },
    bill: {
      limite: 'maxBillsToPay', uso: 'billsToPay',
      msg: 'O gratuito acompanha %L contas a pagar. O Pro acompanha o mês inteiro.',
    },
    subscription: {
      limite: 'maxSubscriptions', uso: 'subscriptions',
      msg: 'O gratuito monitora %L gastos fixos. O Pro monitora todos e ainda encontra os que você esqueceu.',
    },
    category: {
      limite: 'maxCustomCategories', uso: 'customCategories',
      msg: 'O gratuito guarda %L categorias suas. O Pro guarda quantas você criar.',
    },
  },

  /**
   * Verifica se cabe mais `increment` itens de `kind` no plano atual.
   *
   * Nao existe quota de transacao: volume de uso nunca e limitado. Travar o
   * registro no dia 15 quebra o habito de quem paga e enfurece quem nao paga.
   */
  checkQuota: function(kind, increment) {
    increment = increment || 1;
    if (!BILLING.shouldEnforceLimits()) return { allowed: true };

    var regra = BILLING._QUOTAS[kind];
    if (!regra) return { allowed: true };

    var limits = BILLING.getLimits();
    var teto = limits[regra.limite];
    if (teto === Infinity || !isFinite(teto)) return { allowed: true };

    var usage = BILLING.getUsage();
    if ((usage[regra.uso] || 0) + increment <= teto) return { allowed: true };

    return {
      allowed: false,
      kind: kind,
      limit: teto,
      message: regra.msg.replace('%L', String(teto)),
    };
  },

  guardQuota: function(kind, increment, customMsg) {
    var result = BILLING.checkQuota(kind, increment);
    if (!result.allowed) {
      BILLING.onPaymentRequired({ message: customMsg || result.message, gate: kind });
      return false;
    }
    return true;
  },

  /**
   * Rotulo de uso no perfil. So mostra o que esta perto de encostar no teto --
   * uma linha com sete contadores nao e lida, e ainda faz o gratuito parecer
   * uma prisao.
   */
  getUsageLabel: function() {
    if (!BILLING.shouldEnforceLimits()) return '';
    var usage = BILLING.getUsage();
    var self = BILLING;
    var partes = [];
    Object.keys(BILLING._QUOTAS).forEach(function(kind) {
      var regra = self._QUOTAS[kind];
      var teto = usage[regra.limite];
      if (teto === Infinity || !isFinite(teto)) return;
      var atual = usage[regra.uso] || 0;
      if (atual < teto * 0.6) return;
      partes.push(atual + '/' + teto + ' ' + kind);
    });
    if (usage.historyMonths !== Infinity && isFinite(usage.historyMonths)) {
      partes.unshift(usage.historyMonths + ' meses de análise');
    }
    return partes.join(' · ');
  },

  /**
   * Um gate barrou a acao. Abre o paywall com o contexto que barrou.
   *
   * Sem toast: a mesma frase aparecia duas vezes, uma no rodape e outra dentro
   * do modal que abre em seguida. Repetir a negativa faz o limite parecer
   * maior do que e -- e o lugar certo da mensagem e ao lado do botao de
   * assinar, nao num aviso que some sozinho.
   */
  onPaymentRequired: function(errBody) {
    var msg = (errBody && (errBody.error || errBody.message)) || 'Upgrade necessário para continuar.';
    // Qual gate barrou, e no dia quantos de uso. Estas duas colunas respondem
    // a pergunta que decide o modelo: os limites chegam cedo demais?
    if (typeof FUNIL !== 'undefined') {
      FUNIL.evento(FUNIL.E.GATE_ENCONTRADO, {
        gate: (errBody && errBody.gate) || 'desconhecido',
        dia: FUNIL.diasDeUso(),
      });
    }
    if (typeof INIT_BILLING !== 'undefined' && INIT_BILLING.abrirPaywall) {
      INIT_BILLING.abrirPaywall(msg);
      return;
    }
    // Sem UI de paywall carregada (teste, boot parcial): ai o toast e o unico
    // canal, e calar seria pior que repetir.
    if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
      UTILS.mostrarToast(msg, 'warning');
    }
  },
});
