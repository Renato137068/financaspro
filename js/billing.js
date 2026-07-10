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
    },
    PRO: {
      maxTransPerMonth: Infinity,
      maxAccounts: 20,
      maxBudgets: Infinity,
      aiFeatures: true,
      teamFeatures: true,
      reportExport: true,
    },
    BUSINESS: {
      maxTransPerMonth: Infinity,
      maxAccounts: Infinity,
      maxBudgets: Infinity,
      aiFeatures: true,
      teamFeatures: true,
      reportExport: true,
    },
  },

  TIER_ORDER: { FREE: 0, PRO: 1, BUSINESS: 2 },

  STATIC_PLANS: [
    {
      tier: 'FREE',
      name: 'Gratuito',
      priceMonthly: 0,
      priceYearly: 0,
      features: ['Transações básicas', 'Orçamentos', 'Relatórios simples', 'Dados locais offline'],
    },
    {
      tier: 'PRO',
      name: 'Pro',
      priceMonthly: 16.9,
      priceYearly: 119,
      features: [
        'Transações ilimitadas',
        'IA e previsão financeira',
        'OCR de comprovantes',
        'Exportação avançada',
        'Até 5 membros',
      ],
    },
    {
      tier: 'BUSINESS',
      name: 'Business',
      priceMonthly: 99.9,
      priceYearly: 999,
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
    if (typeof DADOS !== 'undefined' && DADOS._apiAtiva && DADOS._apiAtiva()) {
      var sessao = DADOS.getSessao();
      if (sessao && sessao.user) {
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
    return typeof DADOS !== 'undefined'
      && DADOS._apiAtiva && DADOS._apiAtiva()
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
    hasTier: function(currentTier, minTier) {
      var current = BILLING.TIER_ORDER[currentTier] || 0;
      var required = BILLING.TIER_ORDER[minTier] || 0;
      return current >= required;
    },
  };
}
