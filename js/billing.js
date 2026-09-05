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

  /**
   * Limites por plano. `Infinity` = ilimitado.
   *
   * Espelha config/plan-limits.json (fonte canonica), onde ilimitado e `null`.
   * A paridade e verificada por tests/plan-limits-parity.test.js.
   *
   * Regra de produto (2026-09): o limite e de PROFUNDIDADE e AUTOMACAO, nunca
   * de volume de uso. Por isso maxTransPerMonth e Infinity ate no FREE: travar
   * o registro no meio do mes quebra o habito que sustenta o produto inteiro.
   */
  PLAN_LIMITS: {
    FREE: {
      maxUsers: 1,
      maxTransPerMonth: Infinity,
      maxAccounts: 5,
      maxBudgets: 5,
      maxCustomCategories: 5,
      maxGoals: 1,
      maxRecurring: 3,
      maxBillsToPay: 5,
      maxSubscriptions: 5,
      maxAttachments: 10,
      maxDevices: 1,
      historyMonths: 3,
      ocrPerMonth: 5,
      aiFeatures: false,
      teamFeatures: false,
      exportCsv: true,
      exportPdf: false,
      advancedAlerts: false,
      openFinance: false,
      learnedCategorization: false,
      futureInvoiceProjection: false,
      netWorthHistory: false,
    },
    PRO: {
      maxUsers: 2,
      maxTransPerMonth: Infinity,
      maxAccounts: Infinity,
      maxBudgets: Infinity,
      maxCustomCategories: Infinity,
      maxGoals: Infinity,
      maxRecurring: Infinity,
      maxBillsToPay: Infinity,
      maxSubscriptions: Infinity,
      maxAttachments: Infinity,
      maxDevices: Infinity,
      historyMonths: Infinity,
      ocrPerMonth: Infinity,
      aiFeatures: true,
      teamFeatures: true,
      exportCsv: true,
      exportPdf: true,
      advancedAlerts: true,
      openFinance: true,
      learnedCategorization: true,
      futureInvoiceProjection: true,
      netWorthHistory: true,
    },
    BUSINESS: {
      maxUsers: Infinity,
      maxTransPerMonth: Infinity,
      maxAccounts: Infinity,
      maxBudgets: Infinity,
      maxCustomCategories: Infinity,
      maxGoals: Infinity,
      maxRecurring: Infinity,
      maxBillsToPay: Infinity,
      maxSubscriptions: Infinity,
      maxAttachments: Infinity,
      maxDevices: Infinity,
      historyMonths: Infinity,
      ocrPerMonth: Infinity,
      aiFeatures: true,
      teamFeatures: true,
      exportCsv: true,
      exportPdf: true,
      advancedAlerts: true,
      openFinance: true,
      learnedCategorization: true,
      futureInvoiceProjection: true,
      netWorthHistory: true,
    },
  },

  /** Trial do SKU da loja (Play Console + Stripe Edge + Express + paywall). */
  TRIAL_DAYS: 7,

  /**
   * Pro de boas-vindas: dias de PRO concedidos na criacao da conta, SEM cartao.
   *
   * Trial reverso. O usuario forma habito COM os recursos pagos e depois os
   * perde, em vez de decidir sobre uma lista de features que nunca viu
   * funcionar. Concedido pelo backend como entitlement (status TRIALING), nao
   * pela loja -- por isso nao conflita com o trial de 7 dias do SKU.
   */
  WELCOME_TRIAL_DAYS: 14,

  /** Cota MENSAL de OCR no plano gratuito (renova na virada do mes). */
  OCR_FREE_PER_MONTH: 5,
  _OCR_USES_KEY: 'fp-ocr-uses',

  TIER_ORDER: { FREE: 0, PRO: 1, BUSINESS: 2 },

  /**
   * Vitrine do paywall. Os precos reais vem da loja (Play getProductDetails) ou
   * do backend; isto e o fallback offline e a fonte da copy.
   *
   * A copy vende CAPACIDADE, nao remocao de limite. "Sem limites" posiciona a
   * assinatura como pedagio -- o usuario paga para desfazer um obstaculo que o
   * proprio app criou. O que converte e o que o Pro FAZ por ele.
   */
  STATIC_PLANS: [
    {
      tier: 'FREE',
      name: 'Gratuito',
      priceMonthly: 0,
      priceYearly: 0,
      features: [
        'Lançamentos ilimitados, sempre',
        'Orçamento 50/30/20 completo',
        '5 contas e cartões',
        'Últimos 3 meses de gráficos e relatórios',
        'Exportação CSV e backup livres',
      ],
    },
    {
      tier: 'PRO',
      name: 'Pro',
      priceMonthly: 16.99,
      priceYearly: 129.99,
      features: [
        'Todo o seu histórico, com comparativo ano a ano',
        'Previsão de fim de mês e do fluxo futuro',
        'Encontra assinaturas esquecidas que você ainda paga',
        'Categoriza sozinho, aprendendo com você',
        'Fatura do cartão projetada, parcelas incluídas',
        'Celular, tablet e navegador sincronizados',
        'Modo casal — duas pessoas, uma vida financeira',
      ],
    },
    // Business não é oferecido na vitrine (SHOW_BUSINESS_PLAN: false).
    // Mantido fora de STATIC_PLANS para o paywall ter só Grátis + Pro.
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

  /** Path canônico no APK/web cloud: Edge Functions via SUPA_BILLING. */
  _useSupabaseBilling: function() {
    return typeof DADOS !== 'undefined'
      && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
      && typeof SUPA_BILLING !== 'undefined'
      && SUPA_BILLING.isActive && SUPA_BILLING.isActive();
  },

  getTier: function() {
    if (this._cache.tier) return this._cache.tier;
    var sub = this._cache.subscription;
    if (sub && sub.plan && sub.plan.tier && this._activeStatus(sub.status, sub)) {
      return sub.plan.tier;
    }
    if (typeof DADOS !== 'undefined' && DADOS.getConfig) {
      return this.tierFromPlano(DADOS.getConfig().plano);
    }
    return 'FREE';
  },

  /**
   * A assinatura da o tier, ou ja expirou?
   *
   * TRIALING sozinho nao basta. O trial do Stripe e virado pelo webhook, mas o
   * Pro de boas-vindas nao tem assinatura de loja por tras: sem olhar
   * `trialEndsAt`, um trial vencido daria PRO para sempre -- e o mesmo vale se
   * um webhook do Stripe atrasar ou falhar. A data e a fonte da verdade.
   */
  _activeStatus: function(status, sub) {
    if (status === 'ACTIVE') return true;
    if (status !== 'TRIALING') return false;
    var fim = sub && sub.trialEndsAt;
    if (!fim) return true;
    var t = new Date(fim).getTime();
    if (isNaN(t)) return true;
    return t > Date.now();
  },

  getLimits: function() {
    return this.PLAN_LIMITS[this.getTier()] || this.PLAN_LIMITS.FREE;
  },

  hasTier: function(minTier) {
    var current = this.TIER_ORDER[this.getTier()] || 0;
    var required = this.TIER_ORDER[minTier] || 0;
    return current >= required;
  },

  /** Competencia atual no formato AAAA-MM, para a cota mensal de OCR. */
  _competenciaAtual: function() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  },

  /**
   * Usos de OCR na competencia corrente.
   *
   * Antes eram 5 usos VITALICIOS: o usuario queimava os cinco numa tarde e o
   * recurso desaparecia para sempre, sem nunca mais lembra-lo de que existe.
   * Cota mensal mantem a lembranca viva e recria o desejo toda virada de mes.
   */
  _getOcrUses: function() {
    try {
      var raw = localStorage.getItem(this._OCR_USES_KEY);
      if (!raw) return 0;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.mes !== this._competenciaAtual()) return 0;
      var n = parseInt(parsed.usos, 10);
      return isNaN(n) || n < 0 ? 0 : n;
    } catch (e) {
      return 0;
    }
  },

  /** Quantos OCRs ainda cabem neste mes. Infinity no PRO+. */
  ocrRemaining: function() {
    var cap = this.getLimits().ocrPerMonth;
    if (cap === Infinity) return Infinity;
    return Math.max(0, cap - this._getOcrUses());
  },

  /** Consome 1 OCR da cota do mes. No-op para PRO+. */
  consumeOcrUse: function() {
    if (this.getLimits().ocrPerMonth === Infinity) return;
    try {
      localStorage.setItem(this._OCR_USES_KEY, JSON.stringify({
        mes: this._competenciaAtual(),
        usos: this._getOcrUses() + 1,
      }));
    } catch (e) { /* modo privado */ }
  },

  /**
   * Flags de plano. Vale igual dentro e fora da nuvem.
   *
   * Antes, `if (!isCloudUser()) return true` liberava tudo no modo local. O
   * efeito pratico era um segundo plano gratuito, mais generoso que o da
   * nuvem: criar conta PIORAVA a experiencia, e o funil local -> nuvem -> pago
   * tinha o incentivo economico apontando ao contrario.
   */
  canUse: function(feature) {
    var limits = this.getLimits();
    return !!limits[feature];
  },

  /**
   * Janela de analise disponivel no plano atual.
   *
   * Restringe GRAFICO, RELATORIO e COMPARATIVO -- nunca o extrato, a busca ou a
   * exportacao. O dado que o usuario digitou continua inteiro e exportavel para
   * sempre: limite de analise e limite justo, esconder dado e sequestro.
   *
   * @returns {{ meses: number, desde: Date|null, limitado: boolean }}
   */
  janelaAnalitica: function() {
    var meses = this.getLimits().historyMonths;
    if (meses === Infinity || !isFinite(meses)) {
      return { meses: Infinity, desde: null, limitado: false };
    }
    var d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() - (meses - 1));
    return { meses: meses, desde: d, limitado: true };
  },

  /** Limites numericos valem para todo mundo abaixo de PRO, com ou sem login. */
  shouldEnforceLimits: function() {
    return !this.hasTier('PRO');
  },

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
    var cfg = this._cfg();
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
    return (this._cfg().metas || []).length;
  },

  _countBillsToPay: function() {
    return (this._cfg().contasPagar || []).length;
  },

  _countSubscriptions: function() {
    return (this._cfg().assinaturas || []).length;
  },

  _countCustomCategories: function() {
    var custom = this._cfg().categoriasCustom || {};
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
    var limits = this.getLimits();
    return {
      transactionsThisMonth: this.countTransactionsThisMonth(),
      maxTransPerMonth: limits.maxTransPerMonth,
      accounts: this._countAccountsForLimit(),
      maxAccounts: limits.maxAccounts,
      budgets: this._countBudgets(),
      maxBudgets: limits.maxBudgets,
      goals: this._countGoals(),
      maxGoals: limits.maxGoals,
      recurring: this._countRecurring(),
      maxRecurring: limits.maxRecurring,
      billsToPay: this._countBillsToPay(),
      maxBillsToPay: limits.maxBillsToPay,
      subscriptions: this._countSubscriptions(),
      maxSubscriptions: limits.maxSubscriptions,
      customCategories: this._countCustomCategories(),
      maxCustomCategories: limits.maxCustomCategories,
      ocrThisMonth: this._getOcrUses(),
      ocrPerMonth: limits.ocrPerMonth,
      historyMonths: limits.historyMonths,
      tier: this.getTier(),
      enforcing: this.shouldEnforceLimits(),
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
    if (!this.shouldEnforceLimits()) return { allowed: true };

    var regra = this._QUOTAS[kind];
    if (!regra) return { allowed: true };

    var limits = this.getLimits();
    var teto = limits[regra.limite];
    if (teto === Infinity || !isFinite(teto)) return { allowed: true };

    var usage = this.getUsage();
    if ((usage[regra.uso] || 0) + increment <= teto) return { allowed: true };

    return {
      allowed: false,
      kind: kind,
      limit: teto,
      message: regra.msg.replace('%L', String(teto)),
    };
  },

  guardQuota: function(kind, increment, customMsg) {
    var result = this.checkQuota(kind, increment);
    if (!result.allowed) {
      this.onPaymentRequired({ message: customMsg || result.message, gate: kind });
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
    if (!this.shouldEnforceLimits()) return '';
    var usage = this.getUsage();
    var self = this;
    var partes = [];
    Object.keys(this._QUOTAS).forEach(function(kind) {
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

  listPlans: function() {
    var self = this;
    var onlyVitrine = function(plans) {
      return (plans || []).filter(function(p) {
        return p && p.tier !== 'BUSINESS';
      });
    };
    if (this._cache.plans) return Promise.resolve(onlyVitrine(this._cache.plans));
    if (typeof DADOS !== 'undefined' && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
        && typeof SUPA_BILLING !== 'undefined' && SUPA_BILLING.isActive()) {
      return SUPA_BILLING.listPlans().then(function(plans) {
        self._cache.plans = plans.length ? plans : self.STATIC_PLANS.slice();
        return onlyVitrine(self._cache.plans);
      }).catch(function() {
        return onlyVitrine(self.STATIC_PLANS.slice());
      });
    }
    if (typeof DADOS === 'undefined' || !DADOS._apiAtiva || !DADOS._apiAtiva()) {
      return Promise.resolve(onlyVitrine(this.STATIC_PLANS.slice()));
    }
    return DADOS._apiFetch('/api/v1/billing/plans').then(function(resp) {
      var plans = (resp && resp.data) ? resp.data : self.STATIC_PLANS;
      self._cache.plans = plans;
      return onlyVitrine(plans);
    }).catch(function() {
      return onlyVitrine(self.STATIC_PLANS.slice());
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
        if (sub && sub.plan && sub.plan.tier && self._activeStatus(sub.status, sub)) {
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
      if (sub && sub.plan && sub.plan.tier && self._activeStatus(sub.status, sub)) {
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

  _WELCOME_KEY: 'fp-welcome-trial-pedido',

  /**
   * E o Pro de boas-vindas, e nao o trial do SKU da loja?
   *
   * Importa para a copy: no trial da loja o cartao ja esta no arquivo e a
   * cobranca comeca sozinha; no de boas-vindas nao ha cartao nenhum e nada
   * sera cobrado. Dizer "sua cobranca comeca em 2 dias" para quem nunca deu
   * cartao e alarme falso -- e alarme falso em app financeiro custa confianca.
   */
  isWelcomeTrial: function(sub) {
    sub = sub || this._cache.subscription;
    return !!(sub && typeof sub.stripeSubId === 'string'
      && sub.stripeSubId.indexOf('welcome:') === 0);
  },

  /**
   * Pede o Pro de boas-vindas: WELCOME_TRIAL_DAYS dias de PRO, sem cartao.
   *
   * Idempotente em duas camadas. No servidor, uma linha por usuario para
   * sempre (fp_welcome_trial_grant) -- sair e entrar de novo nao renova. No
   * cliente, uma marca local que evita bater na Edge a cada login: 409 nao e
   * erro, e a resposta esperada de quem ja recebeu.
   *
   * Falha em silencio de proposito: nao ganhar o brinde nao pode atrapalhar o
   * login de ninguem.
   */
  claimWelcomeTrial: function() {
    var self = this;
    if (!this.isCloudUser()) return Promise.resolve(null);
    try {
      if (localStorage.getItem(this._WELCOME_KEY)) return Promise.resolve(null);
    } catch (e) { /* modo privado: tenta e deixa o servidor decidir */ }

    if (!this._useSupabaseBilling()) return Promise.resolve(null);

    var marcar = function() {
      try { localStorage.setItem(self._WELCOME_KEY, '1'); } catch (e) { /* */ }
    };

    return this.ensureOrg().then(function(orgId) {
      return SUPA_BILLING.invoke('welcome-trial', { orgId: orgId });
    }).then(function(out) {
      marcar();
      self.invalidateCache();
      return self.sync().then(function() {
        if (typeof FUNIL !== 'undefined') {
          FUNIL.marco(FUNIL.E.TRIAL_INICIADO, { origem: 'boas-vindas' });
        }
        return out;
      });
    }).catch(function(err) {
      // 409 = ja concedido, ou ja existe assinatura. Nos dois casos nao ha o
      // que fazer de novo, e insistir a cada login so gasta rede.
      if (err && err.status === 409) marcar();
      return null;
    });
  },

  sync: function() {
    var self = this;
    if (!this.isCloudUser()) return Promise.resolve(null);
    return this.fetchSubscription().then(function(sub) {
      if (sub && sub.plan && sub.plan.tier && self._activeStatus(sub.status, sub)) {
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
    if (this._useSupabaseBilling()) {
      var err = new Error('Assinatura via Express desativada no path Supabase. Use o checkout.');
      err.code = 'express-subscribe-disabled';
      return Promise.reject(err);
    }
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
    if (this._useSupabaseBilling()) {
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
      if (self._useSupabaseBilling()) {
        var miss = new Error('Checkout indisponível. Tente novamente em instantes.');
        miss.code = 'checkout-unavailable';
        throw miss;
      }
      return self.subscribe(planTier, interval);
    }).catch(function(err) {
      if (self._useSupabaseBilling()) throw err;
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
    if (this._useSupabaseBilling()) {
      return this.ensureOrg().then(function(orgId) {
        return SUPA_BILLING.invoke('stripe-cancel', { orgId: orgId });
      }).then(function(sub) {
        self._cache.subscription = sub;
        return self.sync().then(function() { return sub; });
      });
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
    if (typeof PLAY_BILLING !== 'undefined' && PLAY_BILLING.isAvailable()) {
      var playUrl = 'https://play.google.com/store/account/subscriptions?package=com.financaspro.mobile';
      if (typeof window !== 'undefined' && window.open) window.open(playUrl, '_blank');
      return Promise.resolve(this._cache.subscription);
    }
    var returnUrl = window.location.href.split('#')[0];
    if (this._useSupabaseBilling()) {
      return this.ensureOrg().then(function(orgId) {
        return SUPA_BILLING.invoke('stripe-portal', {
          orgId: orgId,
          returnUrl: returnUrl,
        });
      }).then(function(session) {
        if (session && session.url) {
          window.location.href = session.url;
        } else {
          throw new Error('Portal de pagamento indisponível');
        }
      });
    }
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
      return this.isWelcomeTrial(sub)
        ? name + ' · cortesia até ' + d.toLocaleDateString('pt-BR')
        : name + ' · trial até ' + d.toLocaleDateString('pt-BR');
    }
    if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
      var fim = new Date(sub.currentPeriodEnd);
      return name + ' · cancela em ' + fim.toLocaleDateString('pt-BR');
    }
    if (sub.status === 'PAST_DUE') return name + ' · pagamento pendente';
    return name;
  },

  /**
   * Alerta de ciclo de vida da assinatura (dunning / trial acabando / cancelamento).
   * Prioridade alta para banner no dashboard.
   */
  getLifecycleAlert: function() {
    var sub = this._cache.subscription;
    if (!sub || !this.isCloudUser()) return null;

    if (sub.status === 'PAST_DUE') {
      return {
        severity: 'warn',
        title: 'Pagamento pendente',
        message: 'Atualize o método de pagamento para manter o Pro ativo.',
        cta: 'portal',
        ctaLabel: 'Atualizar pagamento',
      };
    }

    if (sub.status === 'TRIALING' && sub.trialEndsAt) {
      var ends = new Date(sub.trialEndsAt).getTime();
      if (!isNaN(ends)) {
        var daysLeft = Math.ceil((ends - Date.now()) / 86400000);
        if (daysLeft >= 0 && daysLeft <= 3) {
          if (this.isWelcomeTrial(sub)) {
            return {
              severity: 'info',
              title: daysLeft === 0
                ? 'Seus dias de Pro acabam hoje'
                : ('Seus dias de Pro acabam em ' + daysLeft + ' dia' + (daysLeft === 1 ? '' : 's')),
              message: 'Nada será cobrado — você volta ao plano gratuito. Quer continuar com o Pro?',
              cta: 'paywall',
              ctaLabel: 'Continuar no Pro',
            };
          }
          return {
            severity: 'warn',
            title: daysLeft === 0 ? 'Trial acaba hoje' : ('Trial acaba em ' + daysLeft + ' dia' + (daysLeft === 1 ? '' : 's')),
            message: 'Depois disso a cobrança do Pro começa automaticamente.',
            cta: 'portal',
            ctaLabel: 'Gerenciar assinatura',
          };
        }
      }
    }

    if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
      var fim = new Date(sub.currentPeriodEnd);
      return {
        severity: 'info',
        title: 'Assinatura cancela em ' + fim.toLocaleDateString('pt-BR'),
        message: 'Você continua no Pro até essa data. Depois volta ao gratuito na nuvem.',
        cta: 'paywall',
        ctaLabel: 'Ver planos',
      };
    }

    return null;
  },

  /** Membros + convites pendentes da org atual (nuvem). */
  listTeam: function() {
    var self = this;
    if (!this.isCloudUser()) {
      return Promise.reject(new Error('Equipe exige login na nuvem'));
    }
    if (typeof DADOS !== 'undefined' && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
        && typeof SUPA_BILLING !== 'undefined' && SUPA_BILLING.isActive && SUPA_BILLING.isActive()) {
      return this.ensureOrg().then(function(orgId) {
        return Promise.all([
          SUPA_BILLING.listMembers(orgId),
          SUPA_BILLING.listInvitations(orgId),
        ]).then(function(parts) {
          return { orgId: orgId, members: parts[0], invitations: parts[1] };
        });
      });
    }
    return this.ensureOrg().then(function(orgId) {
      return Promise.all([
        DADOS._apiFetch('/api/v1/orgs/' + encodeURIComponent(orgId)),
        DADOS._apiFetch('/api/v1/orgs/' + encodeURIComponent(orgId) + '/invitations').catch(function() {
          return { data: [] };
        }),
      ]).then(function(parts) {
        var org = parts[0] || {};
        var inv = (parts[1] && parts[1].data) ? parts[1].data : (Array.isArray(parts[1]) ? parts[1] : []);
        var members = org.members || org.Members || [];
        return { orgId: orgId, members: members, invitations: inv, org: org };
      });
    });
  },

  inviteTeamMember: function(email, role) {
    var self = this;
    email = String(email || '').trim().toLowerCase();
    if (!email || email.indexOf('@') < 1) {
      return Promise.reject(new Error('Informe um e-mail válido'));
    }
    if (!this.canUse('teamFeatures')) {
      this.onPaymentRequired({ message: 'Convite de membros está disponível a partir do plano Pro.' });
      return Promise.reject(new Error('upgrade-necessario'));
    }
    var limits = this.getLimits();
    return this.listTeam().then(function(team) {
      var seats = (team.members || []).length + (team.invitations || []).length;
      if (limits.maxUsers !== Infinity && seats >= limits.maxUsers) {
        var msg = limits.maxUsers <= 2
          ? 'Plano Pro permite até ' + limits.maxUsers + ' pessoas (modo casal).'
          : 'Limite de membros do plano atingido.';
        self.onPaymentRequired({ message: msg });
        var err = new Error(msg);
        err.status = 402;
        throw err;
      }
      if (typeof DADOS !== 'undefined' && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
          && typeof SUPA_BILLING !== 'undefined' && SUPA_BILLING.isActive && SUPA_BILLING.isActive()) {
        return SUPA_BILLING.invoke('org-invite', {
          orgId: team.orgId,
          email: email,
          role: role || 'MEMBER',
        }).catch(function(err) {
          // Sem fallback para insert direto: isso pulava gate PRO+, teto de
          // assentos e e-mail. Edge ausente (404/503) = falha explícita.
          if (err && (err.status === 404 || err.status === 503)) {
            var unavailable = new Error(
              'Serviço de convites indisponível. Tente novamente em instantes.',
            );
            unavailable.status = err.status;
            unavailable.code = 'org-invite-unavailable';
            throw unavailable;
          }
          throw err;
        });
      }
      return DADOS._apiFetch('/api/v1/orgs/' + encodeURIComponent(team.orgId) + '/invite', {
        method: 'POST',
        body: JSON.stringify({ email: email, role: role || 'MEMBER' }),
      });
    });
  },

  acceptInvite: function(token) {
    if (!token) return Promise.reject(new Error('Convite inválido'));
    if (typeof DADOS !== 'undefined' && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
        && typeof SUPA_BILLING !== 'undefined' && SUPA_BILLING.isActive && SUPA_BILLING.isActive()) {
      return SUPA_BILLING.acceptInvitation(token);
    }
    return DADOS._apiFetch('/api/v1/orgs/invitations/' + encodeURIComponent(token) + '/accept', {
      method: 'POST',
      body: '{}',
    });
  },

  inviteShareUrl: function(token) {
    var base = window.location.href.split('#')[0].split('?')[0];
    return base + '?invite=' + encodeURIComponent(token);
  },

  revokeInvite: function(invitationId) {
    if (!invitationId) return Promise.reject(new Error('Convite inválido'));
    if (typeof DADOS !== 'undefined' && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
        && typeof SUPA_BILLING !== 'undefined' && SUPA_BILLING.isActive && SUPA_BILLING.isActive()) {
      return this.ensureOrg().then(function(orgId) {
        return SUPA_BILLING.revokeInvitation(orgId, invitationId);
      });
    }
    return this.ensureOrg().then(function(orgId) {
      return DADOS._apiFetch(
        '/api/v1/orgs/' + encodeURIComponent(orgId) + '/invitations/' + encodeURIComponent(invitationId),
        { method: 'DELETE' }
      );
    });
  },

  removeTeamMember: function(userId) {
    if (!userId) return Promise.reject(new Error('Membro inválido'));
    if (typeof DADOS !== 'undefined' && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
        && typeof SUPA_BILLING !== 'undefined' && SUPA_BILLING.isActive && SUPA_BILLING.isActive()) {
      return this.ensureOrg().then(function(orgId) {
        return SUPA_BILLING.removeMember(orgId, userId);
      });
    }
    return this.ensureOrg().then(function(orgId) {
      return DADOS._apiFetch(
        '/api/v1/orgs/' + encodeURIComponent(orgId) + '/members/' + encodeURIComponent(userId),
        { method: 'DELETE' }
      );
    });
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
    TRIAL_DAYS: BILLING.TRIAL_DAYS,
    WELCOME_TRIAL_DAYS: BILLING.WELCOME_TRIAL_DAYS,
    OCR_FREE_PER_MONTH: BILLING.OCR_FREE_PER_MONTH,
    STATIC_PLANS: BILLING.STATIC_PLANS,
    _useSupabaseBilling: function() {
      return BILLING._useSupabaseBilling();
    },
    /** Cota mensal de OCR (usa o localStorage do Jest/jsdom). */
    ocrQuota: function(opts) {
      opts = opts || {};
      var key = BILLING._OCR_USES_KEY;
      var prevTier = BILLING._cache.tier;
      BILLING._cache.tier = opts.tier || 'FREE';
      try {
        localStorage.setItem(key, JSON.stringify({
          mes: opts.mes || BILLING._competenciaAtual(),
          usos: opts.usesConsumed || 0,
        }));
      } catch (e) { /* */ }
      var remaining = BILLING.ocrRemaining();
      if (opts.consume) BILLING.consumeOcrUse();
      var out = { remaining: remaining, remainingAfter: BILLING.ocrRemaining() };
      BILLING._cache.tier = prevTier;
      try { localStorage.removeItem(key); } catch (e2) { /* */ }
      return out;
    },
    /** Janela de analise por tier — sem tocar em extrato/exportacao. */
    janelaAnalitica: function(tier) {
      var prev = BILLING._cache.tier;
      BILLING._cache.tier = tier || 'FREE';
      var out = BILLING.janelaAnalitica();
      BILLING._cache.tier = prev;
      return out;
    },
    /** A assinatura ainda vale? Expoe a regra de expiracao de trial. */
    entitlementAtivo: function(sub) {
      return BILLING._activeStatus(sub && sub.status, sub);
    },
    isWelcomeTrial: function(sub) {
      return BILLING.isWelcomeTrial(sub);
    },
    getLifecycleAlert: function(sub, isCloud) {
      if (!isCloud || !sub) return null;
      var prev = BILLING._cache.subscription;
      var prevCloud = BILLING.isCloudUser;
      BILLING._cache.subscription = sub;
      BILLING.isCloudUser = function() { return true; };
      var out = BILLING.getLifecycleAlert();
      BILLING._cache.subscription = prev;
      BILLING.isCloudUser = prevCloud;
      return out;
    },
    /**
     * Flag de plano. `isCloud` nao entra mais na conta: desde 2026-09 os
     * limites valem igual dentro e fora da nuvem. O parametro segue aceito
     * para nao quebrar chamadas antigas, mas e ignorado de proposito.
     */
    canUseFeature: function(feature, tier, _isCloud) {
      var limits = BILLING.PLAN_LIMITS[tier] || BILLING.PLAN_LIMITS.FREE;
      return !!limits[feature];
    },
    shouldEnforceLimits: function(tier, _isCloud) {
      return (BILLING.TIER_ORDER[tier] || 0) < (BILLING.TIER_ORDER.PRO || 1);
    },
    /** Quota pura, sem DOM: `usage` traz os contadores ja apurados. */
    checkQuota: function(kind, tier, _isCloud, usage, increment) {
      increment = increment || 1;
      if ((BILLING.TIER_ORDER[tier] || 0) >= (BILLING.TIER_ORDER.PRO || 1)) {
        return { allowed: true };
      }
      var regra = BILLING._QUOTAS[kind];
      if (!regra) return { allowed: true };
      var limits = BILLING.PLAN_LIMITS[tier] || BILLING.PLAN_LIMITS.FREE;
      var teto = limits[regra.limite];
      if (teto === Infinity || !isFinite(teto)) return { allowed: true };
      usage = usage || {};
      if ((usage[regra.uso] || 0) + increment > teto) {
        return { allowed: false, kind: kind, limit: teto };
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
