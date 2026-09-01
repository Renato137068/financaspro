/**
 * billing.js — Planos SaaS, paywall e integração Stripe (backend)
 * Depende de: DADOS, CONFIG, UTILS
 */
var BILLING = {
  _cache: {
    orgId: null,
    subscription: null,
    plans: null,
    tier: null,
  },

  PLAN_LIMITS: {
    FREE: {
      maxTransPerMonth: 100,
      maxAccounts: 3,
      maxBudgets: 5,
      aiFeatures: false,
      teamFeatures: false,
      reportExport: false,
      advancedAlerts: false,
    },
    PRO: {
      maxTransPerMonth: Infinity,
      maxAccounts: 20,
      maxBudgets: Infinity,
      aiFeatures: true,
      teamFeatures: true,
      reportExport: true,
      advancedAlerts: true,
    },
    BUSINESS: {
      maxTransPerMonth: Infinity,
      maxAccounts: Infinity,
      maxBudgets: Infinity,
      aiFeatures: true,
      teamFeatures: true,
      reportExport: true,
      advancedAlerts: true,
    },
  },

  TIER_ORDER: { FREE: 0, PRO: 1, BUSINESS: 2 },

  STATIC_PLANS: [
    {
      tier: 'FREE',
      name: 'Gratuito',
      priceMonthly: 0,
      priceYearly: 0,
      features: ['Até 100 lançamentos/mês na nuvem', 'Orçamento 50/30/20', '3 contas/cartões', 'Dados locais offline'],
    },
    {
      tier: 'PRO',
      name: 'Pro',
      priceMonthly: 16.9,
      priceYearly: 129,
      features: [
        'Transações ilimitadas',
        'IA e previsão financeira',
        'OCR de comprovantes',
        'Exportação e alertas avançados',
        'Trial de 14 dias',
      ],
    },
    {
      tier: 'BUSINESS',
      name: 'Business',
      priceMonthly: 79.9,
      priceYearly: 799,
      features: [
        'Tudo do Pro',
        'Membros ilimitados',
        'Múltiplas organizações',
        'Suporte prioritário',
      ],
    },
  ],

  init: function() {
    var self = this;
    if (typeof DADOS !== 'undefined' && DADOS._nuvemAtiva && DADOS._nuvemAtiva()) {
      if (this.isCloudUser()) {
        self.sync().catch(function() {});
      }
    }
  },

  tierFromPlano: function(plano) {
    var raw = String(plano || 'free').toLowerCase().trim();
    if (raw === 'business' || raw === 'enterprise') return 'BUSINESS';
    if (raw === 'premium' || raw === 'pro' || raw === 'paid' || raw === 'plus') return 'PRO';
    return 'FREE';
  },

  planoFromTier: function(tier) {
    var t = String(tier || 'FREE').toUpperCase();
    if (t === 'BUSINESS') return 'business';
    if (t === 'PRO') return 'pro';
    return 'free';
  },

  isCloudUser: function() {
    if (typeof DADOS === 'undefined') return false;
    if (DADOS._supabaseAtivo && DADOS._supabaseAtivo()) {
      return !!(typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.getSessionSync
        && SUPA_AUTH.getSessionSync() && SUPA_AUTH.getSessionSync().user);
    }
    return DADOS._apiAtiva && DADOS._apiAtiva()
      && DADOS.getSessao && DADOS.getSessao().user;
  },

  getTier: function() {
    if (this._cache.tier) return this._cache.tier;
    var sub = this._cache.subscription;
    if (sub && sub.plan && sub.plan.tier && this._activeStatus(sub.status)) {
      return sub.plan.tier;
    }
    if (typeof DADOS !== 'undefined' && DADOS.getConfig) {
      return this.tierFromPlano(DADOS.getConfig().plano);
    }
    return 'FREE';
  },

  _activeStatus: function(status) {
    return status === 'ACTIVE' || status === 'TRIALING';
  },

  getLimits: function() {
    return this.PLAN_LIMITS[this.getTier()] || this.PLAN_LIMITS.FREE;
  },

  hasTier: function(minTier) {
    var current = this.TIER_ORDER[this.getTier()] || 0;
    var required = this.TIER_ORDER[minTier] || 0;
    return current >= required;
  },

  /**
   * Recursos premium na nuvem exigem tier; modo 100% local permanece liberado.
   */
  canUse: function(feature) {
    if (!this.isCloudUser()) return true;
    var limits = this.getLimits();
    return !!limits[feature];
  },

  /** Limites numéricos só valem para usuário na nuvem sem tier PRO+. */
  shouldEnforceLimits: function() {
    if (!this.isCloudUser()) return false;
    return !this.hasTier('PRO');
  },

  countTransactionsThisMonth: function() {
    if (typeof TRANSACOES === 'undefined' || !TRANSACOES.obter) return 0;
    var now = new Date();
    return TRANSACOES.obter({ mes: now.getMonth() + 1, ano: now.getFullYear() }).length;
  },

  _countAccountsForLimit: function() {
    var total = 0;
    if (typeof DADOS !== 'undefined' && DADOS.getConfig) {
      var cfg = DADOS.getConfig();
      total += (cfg.bancos || []).length;
      total += (cfg.cartoes || []).length;
    }
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

  getUsage: function() {
    var limits = this.getLimits();
    return {
      transactionsThisMonth: this.countTransactionsThisMonth(),
      maxTransPerMonth: limits.maxTransPerMonth,
      accounts: this._countAccountsForLimit(),
      maxAccounts: limits.maxAccounts,
      budgets: this._countBudgets(),
      maxBudgets: limits.maxBudgets,
      tier: this.getTier(),
      enforcing: this.shouldEnforceLimits(),
    };
  },

  checkQuota: function(kind, increment) {
    increment = increment || 1;
    if (!this.shouldEnforceLimits()) return { allowed: true };
    var limits = this.getLimits();
    var usage = this.getUsage();
    if (kind === 'transaction') {
      if (limits.maxTransPerMonth !== Infinity
          && usage.transactionsThisMonth + increment > limits.maxTransPerMonth) {
        return {
          allowed: false,
          message: 'Limite de ' + limits.maxTransPerMonth + ' lançamentos/mês no plano gratuito. Assine o Pro para continuar.',
        };
      }
    }
    if (kind === 'account') {
      if (limits.maxAccounts !== Infinity
          && usage.accounts + increment > limits.maxAccounts) {
        return {
          allowed: false,
          message: 'Limite de ' + limits.maxAccounts + ' contas/cartões no plano gratuito. O Pro libera mais.',
        };
      }
    }
    if (kind === 'budget') {
      if (limits.maxBudgets !== Infinity
          && usage.budgets + increment > limits.maxBudgets) {
        return {
          allowed: false,
          message: 'Limite de ' + limits.maxBudgets + ' orçamentos no plano gratuito. O Pro libera ilimitados.',
        };
      }
    }
    return { allowed: true };
  },

  guardQuota: function(kind, increment, customMsg) {
    var result = this.checkQuota(kind, increment);
    if (!result.allowed) {
      this.onPaymentRequired({ message: customMsg || result.message });
      return false;
    }
    return true;
  },

  getUsageLabel: function() {
    if (!this.shouldEnforceLimits()) return '';
    var usage = this.getUsage();
    var parts = [];
    var maxT = usage.maxTransPerMonth === Infinity ? '∞' : String(usage.maxTransPerMonth);
    parts.push(usage.transactionsThisMonth + '/' + maxT + ' lançamentos');
    if (usage.maxAccounts !== Infinity) {
      parts.push(usage.accounts + '/' + usage.maxAccounts + ' contas');
    }
    if (usage.maxBudgets !== Infinity) {
      parts.push(usage.budgets + '/' + usage.maxBudgets + ' orçamentos');
    }
    return parts.join(' · ');
  },

  onPaymentRequired: function(errBody) {
    var msg = (errBody && (errBody.error || errBody.message)) || 'Upgrade necessário para continuar.';
    if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
      UTILS.mostrarToast(msg, 'warning');
    }
    if (typeof INIT_BILLING !== 'undefined' && INIT_BILLING.abrirPaywall) {
      INIT_BILLING.abrirPaywall(msg);
    }
  },

  listPlans: function() {
    var self = this;
    if (this._cache.plans) return Promise.resolve(this._cache.plans);
    if (typeof DADOS !== 'undefined' && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
        && typeof SUPA_BILLING !== 'undefined' && SUPA_BILLING.isActive()) {
      return SUPA_BILLING.listPlans().then(function(plans) {
        self._cache.plans = plans.length ? plans : self.STATIC_PLANS.slice();
        return self._cache.plans;
      }).catch(function() {
        return self.STATIC_PLANS.slice();
      });
    }
    if (typeof DADOS === 'undefined' || !DADOS._apiAtiva || !DADOS._apiAtiva()) {
      return Promise.resolve(this.STATIC_PLANS.slice());
    }
    return DADOS._apiFetch('/api/v1/billing/plans').then(function(resp) {
      var plans = (resp && resp.data) ? resp.data : self.STATIC_PLANS;
      self._cache.plans = plans;
      return plans;
    }).catch(function() {
      return self.STATIC_PLANS.slice();
    });
  },

  ensureOrg: function() {
    var self = this;
    if (this._cache.orgId) return Promise.resolve(this._cache.orgId);
    if (typeof DADOS !== 'undefined' && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
        && typeof SUPA_BILLING !== 'undefined' && SUPA_BILLING.isActive()) {
      return SUPA_BILLING.ensureOrg().then(function(orgId) {
        self._cache.orgId = orgId;
        return orgId;
      });
    }
    if (typeof DADOS === 'undefined' || !DADOS._apiAtiva || !DADOS._apiAtiva()) {
      return Promise.reject(new Error('API indisponível'));
    }
    return DADOS._apiFetch('/api/v1/orgs').then(function(resp) {
      var orgs = (resp && resp.data) ? resp.data : [];
      if (orgs.length > 0) {
        var owner = null;
        for (var i = 0; i < orgs.length; i++) {
          if (orgs[i].myRole === 'OWNER') { owner = orgs[i]; break; }
        }
        self._cache.orgId = (owner || orgs[0]).id;
        return self._cache.orgId;
      }
      var nome = 'Minha Finanças';
      if (DADOS.getConfig) {
        var cfg = DADOS.getConfig();
        if (cfg && cfg.nome && cfg.nome !== 'Usuário' && cfg.nome !== 'Usuario') {
          nome = cfg.nome;
        }
      }
      return DADOS._apiFetch('/api/v1/orgs', {
        method: 'POST',
        body: JSON.stringify({ name: nome }),
      }).then(function(org) {
        self._cache.orgId = org.id;
        return org.id;
      });
    });
  },

  fetchSubscription: function() {
    var self = this;
    if (typeof DADOS !== 'undefined' && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
        && typeof SUPA_BILLING !== 'undefined' && SUPA_BILLING.isActive()) {
      return this.ensureOrg().then(function(orgId) {
        return SUPA_BILLING.fetchSubscription(orgId);
      }).then(function(sub) {
        self._cache.subscription = sub;
        if (sub && sub.plan && sub.plan.tier && self._activeStatus(sub.status)) {
          self._cache.tier = sub.plan.tier;
        }
        return sub;
      }).catch(function(err) {
        if (err && err.status === 404) {
          self._cache.subscription = null;
          self._cache.tier = 'FREE';
          return null;
        }
        throw err;
      });
    }
    return this.ensureOrg().then(function(orgId) {
      return DADOS._apiFetch('/api/v1/billing/' + encodeURIComponent(orgId) + '/subscription');
    }).then(function(sub) {
      self._cache.subscription = sub;
      if (sub && sub.plan && sub.plan.tier && self._activeStatus(sub.status)) {
        self._cache.tier = sub.plan.tier;
      }
      return sub;
    }).catch(function(err) {
      if (err && err.status === 404) {
        self._cache.subscription = null;
        self._cache.tier = 'FREE';
        return null;
      }
      throw err;
    });
  },

  sync: function() {
    var self = this;
    if (!this.isCloudUser()) return Promise.resolve(null);
    return this.fetchSubscription().then(function(sub) {
      if (sub && sub.plan && sub.plan.tier && self._activeStatus(sub.status)) {
        var plano = self.planoFromTier(sub.plan.tier);
        if (typeof DADOS !== 'undefined' && DADOS.getConfig && DADOS.salvarConfig) {
          var atual = DADOS.getConfig().plano;
          if (atual !== plano) DADOS.salvarConfig({ plano: plano });
        }
      }
      if (typeof INIT_CONFIG !== 'undefined' && INIT_CONFIG.refreshPerfil) {
        INIT_CONFIG.refreshPerfil();
      }
      if (typeof INIT_BILLING !== 'undefined' && INIT_BILLING.refreshPlanoCard) {
        INIT_BILLING.refreshPlanoCard();
      }
      return sub;
    });
  },

  subscribe: function(planTier, interval) {
    var self = this;
    interval = interval || 'monthly';
    return this.ensureOrg().then(function(orgId) {
      return DADOS._apiFetch('/api/v1/billing/' + encodeURIComponent(orgId) + '/subscribe', {
        method: 'POST',
        body: JSON.stringify({ planTier: planTier, interval: interval }),
      });
    }).then(function(sub) {
      self._cache.subscription = sub;
      if (sub && sub.plan && sub.plan.tier) {
        self._cache.tier = sub.plan.tier;
      }
      return self.sync();
    });
  },

  createCheckout: function(planTier, interval) {
    var base = window.location.href.split('#')[0].split('?')[0];
    if (typeof DADOS !== 'undefined' && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
        && typeof SUPA_BILLING !== 'undefined' && SUPA_BILLING.isActive()) {
      return this.ensureOrg().then(function(orgId) {
        return SUPA_BILLING.invoke('stripe-checkout', {
          orgId: orgId,
          planTier: planTier,
          interval: interval || 'monthly',
          successUrl: base + '?billing=success',
          cancelUrl: base + '?billing=cancel',
        });
      });
    }
    return this.ensureOrg().then(function(orgId) {
      return DADOS._apiFetch('/api/v1/billing/' + encodeURIComponent(orgId) + '/checkout', {
        method: 'POST',
        body: JSON.stringify({
          planTier: planTier,
          interval: interval || 'monthly',
          successUrl: base,
          cancelUrl: base,
        }),
      });
    });
  },

  checkoutOrSubscribe: function(planTier, interval) {
    var self = this;
    return this.createCheckout(planTier, interval).then(function(session) {
      if (session && session.url) {
        window.location.href = session.url;
        return { redirected: true };
      }
      return self.subscribe(planTier, interval);
    }).catch(function(err) {
      if (err && (err.status === 503 || err.status === 500)) {
        return self.subscribe(planTier, interval);
      }
      throw err;
    });
  },

  cancelSubscription: function() {
    var self = this;
    if (typeof PLAY_BILLING !== 'undefined' && PLAY_BILLING.isAvailable()) {
      var url = 'https://play.google.com/store/account/subscriptions?package=com.financaspro.mobile';
      if (typeof window !== 'undefined' && window.open) window.open(url, '_blank');
      return Promise.resolve(self._cache.subscription);
    }
    return this.ensureOrg().then(function(orgId) {
      return DADOS._apiFetch('/api/v1/billing/' + encodeURIComponent(orgId) + '/cancel', {
        method: 'POST',
        body: '{}',
      });
    }).then(function(sub) {
      self._cache.subscription = sub;
      return sub;
    });
  },

  openPortal: function() {
    var returnUrl = window.location.href.split('#')[0];
    return this.ensureOrg().then(function(orgId) {
      return DADOS._apiFetch('/api/v1/billing/' + encodeURIComponent(orgId) + '/portal', {
        method: 'POST',
        body: JSON.stringify({ returnUrl: returnUrl }),
      });
    }).then(function(session) {
      if (session && session.url) {
        window.location.href = session.url;
      } else {
        throw new Error('Portal de pagamento indisponível');
      }
    });
  },

  getStatusLabel: function() {
    var sub = this._cache.subscription;
    if (!sub) {
      return this.isCloudUser() ? 'Gratuito na nuvem' : 'Gratuito · uso local';
    }
    var name = (sub.plan && sub.plan.name) ? sub.plan.name : this.getTier();
    if (sub.status === 'TRIALING' && sub.trialEndsAt) {
      var d = new Date(sub.trialEndsAt);
      return name + ' · trial até ' + d.toLocaleDateString('pt-BR');
    }
    if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
      var fim = new Date(sub.currentPeriodEnd);
      return name + ' · cancela em ' + fim.toLocaleDateString('pt-BR');
    }
    if (sub.status === 'PAST_DUE') return name + ' · pagamento pendente';
    return name;
  },

  invalidateCache: function() {
    this._cache = { orgId: null, subscription: null, plans: null, tier: null };
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    tierFromPlano: BILLING.tierFromPlano.bind(BILLING),
    planoFromTier: BILLING.planoFromTier.bind(BILLING),
    PLAN_LIMITS: BILLING.PLAN_LIMITS,
    canUseFeature: function(feature, tier, isCloud) {
      if (!isCloud) return true;
      var limits = BILLING.PLAN_LIMITS[tier] || BILLING.PLAN_LIMITS.FREE;
      return !!limits[feature];
    },
    shouldEnforceLimits: function(tier, isCloud) {
      if (!isCloud) return false;
      return (BILLING.TIER_ORDER[tier] || 0) < (BILLING.TIER_ORDER.PRO || 1);
    },
    checkQuota: function(kind, tier, isCloud, usage, increment) {
      increment = increment || 1;
      if (!isCloud || (BILLING.TIER_ORDER[tier] || 0) >= (BILLING.TIER_ORDER.PRO || 1)) {
        return { allowed: true };
      }
      var limits = BILLING.PLAN_LIMITS[tier] || BILLING.PLAN_LIMITS.FREE;
      usage = usage || {};
      if (kind === 'transaction' && limits.maxTransPerMonth !== Infinity
          && (usage.transactionsThisMonth || 0) + increment > limits.maxTransPerMonth) {
        return { allowed: false };
      }
      return { allowed: true };
    },
    hasTier: function(currentTier, minTier) {
      var current = BILLING.TIER_ORDER[currentTier] || 0;
      var required = BILLING.TIER_ORDER[minTier] || 0;
      return current >= required;
    },
  };
}
