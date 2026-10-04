/**
 * billing-regras.cjs — regras puras do BILLING para os testes.
 *
 * Antes moravam no fim de js/billing.js, atrás de `typeof module`: no
 * navegador o bloco nunca rodava, só os testes o usavam. Com billing.js como
 * ES Module (ADR 0005), ficam aqui, em volta do BILLING real carregado:
 *
 *   const regras = regrasDoBilling(carregarScript('js/billing.js'));
 */
function regrasDoBilling(BILLING) {
  return {
    tierFromPlano: BILLING.tierFromPlano.bind(BILLING),
    planoFromTier: BILLING.planoFromTier.bind(BILLING),
    getTier: BILLING.getTier.bind(BILLING),
    getBillingInterval: BILLING.getBillingInterval.bind(BILLING),
    _persistEntitlement: BILLING._persistEntitlement.bind(BILLING),
    _readPersistedEntitlement: BILLING._readPersistedEntitlement.bind(BILLING),
    _ENTITLEMENT_KEY: BILLING._ENTITLEMENT_KEY,
    PLAN_LIMITS: BILLING.PLAN_LIMITS,
    TRIAL_DAYS: BILLING.TRIAL_DAYS,
    WELCOME_TRIAL_DAYS: BILLING.WELCOME_TRIAL_DAYS,
    STATIC_PLANS: BILLING.STATIC_PLANS,
    isWelcomeTrial: BILLING.isWelcomeTrial.bind(BILLING),
    isPlayManaged: BILLING.isPlayManaged.bind(BILLING),
    _useSupabaseBilling: function() {
      return BILLING._useSupabaseBilling();
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
    BILLING: BILLING,
  };
}

module.exports = { regrasDoBilling };
