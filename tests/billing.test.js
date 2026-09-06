/**
 * billing.test.js — Mapeamento de planos e limites SaaS
 */

var billingHelpers = require('../js/billing.js');

describe('Billing — tiers e limites', function() {
  test('mapeia plano local para tier', function() {
    expect(billingHelpers.tierFromPlano('free')).toBe('FREE');
    expect(billingHelpers.tierFromPlano('premium')).toBe('PRO');
    expect(billingHelpers.tierFromPlano('pro')).toBe('PRO');
    expect(billingHelpers.tierFromPlano('business')).toBe('BUSINESS');
  });

  test('mapeia tier para plano local', function() {
    expect(billingHelpers.planoFromTier('FREE')).toBe('free');
    expect(billingHelpers.planoFromTier('PRO')).toBe('pro');
    expect(billingHelpers.planoFromTier('BUSINESS')).toBe('business');
  });

  test('hasTier compara ordem corretamente', function() {
    expect(billingHelpers.hasTier('FREE', 'PRO')).toBe(false);
    expect(billingHelpers.hasTier('PRO', 'PRO')).toBe(true);
    expect(billingHelpers.hasTier('BUSINESS', 'PRO')).toBe(true);
  });

  test('o plano vale igual dentro e fora da nuvem', function() {
    // Havia dois planos gratuitos, e o melhor era o que não pedia cadastro:
    // offline liberava tudo. Criar conta piorava a experiência, e o funil
    // local -> nuvem -> pago tinha o incentivo apontando ao contrário.
    expect(billingHelpers.canUseFeature('aiFeatures', 'FREE', false)).toBe(false);
    expect(billingHelpers.canUseFeature('aiFeatures', 'FREE', true)).toBe(false);
    expect(billingHelpers.canUseFeature('aiFeatures', 'PRO', false)).toBe(true);
    expect(billingHelpers.canUseFeature('advancedAlerts', 'FREE', true)).toBe(false);
    expect(billingHelpers.canUseFeature('advancedAlerts', 'PRO', true)).toBe(true);
  });

  test('não existe teto de lançamentos em nenhum plano', function() {
    // Limite de volume num app de hábito quebra o hábito: o usuário intenso
    // — justamente quem pagaria — batia no teto por volta do dia 15 e ficava
    // com o mês pela metade.
    expect(billingHelpers.PLAN_LIMITS.FREE.maxTransPerMonth).toBe(Infinity);
    expect(billingHelpers.PLAN_LIMITS.PRO.maxTransPerMonth).toBe(Infinity);
  });

  test('o limite é de profundidade e capacidade, não de uso', function() {
    var free = billingHelpers.PLAN_LIMITS.FREE;
    expect(free.maxAccounts).toBe(5);
    expect(free.historyMonths).toBe(3);
    expect(free.maxGoals).toBe(1);
    expect(free.maxRecurring).toBe(3);
    expect(free.ocrPerMonth).toBe(5);
    expect(billingHelpers.PLAN_LIMITS.PRO.historyMonths).toBe(Infinity);
    expect(billingHelpers.PLAN_LIMITS.PRO.maxAccounts).toBe(Infinity);
  });

  test('exportar o próprio dado nunca é pago; o relatório em PDF é', function() {
    expect(billingHelpers.canUseFeature('exportCsv', 'FREE', true)).toBe(true);
    expect(billingHelpers.canUseFeature('exportCsv', 'FREE', false)).toBe(true);
    expect(billingHelpers.canUseFeature('exportPdf', 'FREE', true)).toBe(false);
    expect(billingHelpers.canUseFeature('exportPdf', 'PRO', true)).toBe(true);
  });

  test('gates novos de automação e profundidade', function() {
    ['learnedCategorization', 'futureInvoiceProjection', 'netWorthHistory'].forEach(function(flag) {
      expect(billingHelpers.canUseFeature(flag, 'FREE', true)).toBe(false);
      expect(billingHelpers.canUseFeature(flag, 'PRO', true)).toBe(true);
    });
  });

  test('janela analítica limita análise, e só no FREE', function() {
    var free = billingHelpers.janelaAnalitica('FREE');
    expect(free.meses).toBe(3);
    expect(free.limitado).toBe(true);
    expect(free.desde instanceof Date).toBe(true);

    var pro = billingHelpers.janelaAnalitica('PRO');
    expect(pro.limitado).toBe(false);
    expect(pro.desde).toBeNull();
  });

  test('canUseFeature bloqueia teamFeatures e openFinance no FREE na nuvem', function() {
    expect(billingHelpers.canUseFeature('teamFeatures', 'FREE', true)).toBe(false);
    expect(billingHelpers.canUseFeature('teamFeatures', 'PRO', true)).toBe(true);
    expect(billingHelpers.canUseFeature('openFinance', 'FREE', true)).toBe(false);
  });

  test('maxUsers e openFinance alinhados ao canônico', function() {
    expect(billingHelpers.PLAN_LIMITS.FREE.maxUsers).toBe(1);
    expect(billingHelpers.PLAN_LIMITS.PRO.maxUsers).toBe(2);
    expect(billingHelpers.PLAN_LIMITS.BUSINESS.maxUsers).toBe(Infinity);
    expect(billingHelpers.canUseFeature('openFinance', 'FREE', true)).toBe(false);
    expect(billingHelpers.canUseFeature('openFinance', 'PRO', true)).toBe(true);
  });

  test('trial do SKU em 7 dias, Pro de boas-vindas em 14', function() {
    expect(billingHelpers.TRIAL_DAYS).toBe(7);
    expect(billingHelpers.WELCOME_TRIAL_DAYS).toBe(14);
    expect(billingHelpers.OCR_FREE_PER_MONTH).toBe(5);
  });

  test('o preço promovido é o anual (tiers do Play)', function() {
    var pro = billingHelpers.STATIC_PLANS.filter(function(p) { return p.tier === 'PRO'; })[0];
    expect(pro.priceMonthly).toBe(16.99);
    expect(pro.priceYearly).toBe(129.99);
    // Anual abaixo de 12× mensal; desconto ~36% (tiers BRL da Play).
    expect(pro.priceYearly).toBeLessThan(pro.priceMonthly * 12);
    expect(1 - pro.priceYearly / (pro.priceMonthly * 12)).toBeGreaterThan(0.30);
    expect(1 - pro.priceYearly / (pro.priceMonthly * 12)).toBeLessThan(0.45);
  });

  test('vitrine só tem Grátis + Pro (sem Business)', function() {
    var tiers = billingHelpers.STATIC_PLANS.map(function(p) { return p.tier; });
    expect(tiers).toEqual(['FREE', 'PRO']);
  });

  test('getLifecycleAlert cobre PAST_DUE e trial acabando', function() {
    var past = billingHelpers.getLifecycleAlert({ status: 'PAST_DUE' }, true);
    expect(past).toBeTruthy();
    expect(past.cta).toBe('portal');
    expect(past.severity).toBe('warn');

    var amanha = new Date(Date.now() + 86400000).toISOString();
    var trial = billingHelpers.getLifecycleAlert({
      status: 'TRIALING',
      trialEndsAt: amanha,
    }, true);
    expect(trial).toBeTruthy();
    expect(trial.title).toMatch(/Trial/i);

    expect(billingHelpers.getLifecycleAlert(null, true)).toBeNull();
    expect(billingHelpers.getLifecycleAlert({ status: 'ACTIVE' }, false)).toBeNull();
  });

  test('shouldEnforceLimits vale offline também', function() {
    expect(billingHelpers.shouldEnforceLimits('FREE', false)).toBe(true);
    expect(billingHelpers.shouldEnforceLimits('FREE', true)).toBe(true);
    expect(billingHelpers.shouldEnforceLimits('PRO', false)).toBe(false);
    expect(billingHelpers.shouldEnforceLimits('PRO', true)).toBe(false);
  });

  test('checkQuota não conhece quota de transação', function() {
    var r = billingHelpers.checkQuota('transaction', 'FREE', true, { transactionsThisMonth: 5000 }, 1);
    expect(r.allowed).toBe(true);
  });

  test('checkQuota trava capacidade no teto, e libera no PRO', function() {
    expect(billingHelpers.checkQuota('account', 'FREE', false, { accounts: 5 }, 1).allowed).toBe(false);
    expect(billingHelpers.checkQuota('account', 'FREE', false, { accounts: 4 }, 1).allowed).toBe(true);
    expect(billingHelpers.checkQuota('goal', 'FREE', true, { goals: 1 }, 1).allowed).toBe(false);
    expect(billingHelpers.checkQuota('recurring', 'FREE', true, { recurring: 3 }, 1).allowed).toBe(false);
    expect(billingHelpers.checkQuota('bill', 'FREE', true, { billsToPay: 5 }, 1).allowed).toBe(false);
    expect(billingHelpers.checkQuota('category', 'FREE', true, { customCategories: 5 }, 1).allowed).toBe(false);

    expect(billingHelpers.checkQuota('account', 'PRO', false, { accounts: 99 }, 1).allowed).toBe(true);
    expect(billingHelpers.checkQuota('goal', 'PRO', false, { goals: 99 }, 1).allowed).toBe(true);
  });

  test('entitlementAtivo: ACTIVE com currentPeriodEnd no passado não é Pro', function() {
    var passado = new Date(Date.now() - 86400000).toISOString();
    var futuro = new Date(Date.now() + 86400000).toISOString();
    expect(billingHelpers.entitlementAtivo({ status: 'ACTIVE', currentPeriodEnd: passado })).toBe(false);
    expect(billingHelpers.entitlementAtivo({ status: 'ACTIVE', currentPeriodEnd: futuro })).toBe(true);
    expect(billingHelpers.entitlementAtivo({ status: 'ACTIVE' })).toBe(true);
    expect(billingHelpers.entitlementAtivo({ status: 'TRIALING', trialEndsAt: passado })).toBe(false);
  });
});
