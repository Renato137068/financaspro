/**
 * welcome-trial.test.js — Pro de boas-vindas: 14 dias, sem cartão.
 *
 * Dois riscos concretos cobertos aqui:
 *
 *   1. TRIAL VENCIDO QUE NUNCA EXPIRA. `_activeStatus` aceitava TRIALING sem
 *      olhar a data. Para o Stripe isso funcionava porque o webhook vira o
 *      status; um entitlement nosso não tem webhook nenhum, então um trial
 *      vencido daria PRO para sempre — um rombo de receita silencioso.
 *   2. COPY DESONESTA. O aviso de fim de trial dizia "a cobrança começa
 *      automaticamente". Para quem nunca deu cartão isso é alarme falso, e
 *      alarme falso em app financeiro custa exatamente o ativo da marca.
 */
const billing = require('../js/billing.js');

const DIA = 86400000;

function sub(extra) {
  return Object.assign({
    status: 'TRIALING',
    plan: { tier: 'PRO' },
    trialEndsAt: new Date(Date.now() + 5 * DIA).toISOString(),
    stripeSubId: 'welcome:user-1',
  }, extra || {});
}

describe('Constantes', function() {
  test('o Pro de boas-vindas dura mais que o trial do SKU', function() {
    // 7 dias não cobrem um fechamento de mês — que é quando o app mostra
    // para que serve. O de boas-vindas precisa atravessar uma virada.
    expect(billing.WELCOME_TRIAL_DAYS).toBe(14);
    expect(billing.WELCOME_TRIAL_DAYS).toBeGreaterThan(billing.TRIAL_DAYS);
  });
});

describe('Trial vencido não vale mais o tier', function() {
  test('trial de cortesia dentro do prazo dá PRO', function() {
    expect(billing.entitlementAtivo(sub())).toBe(true);
  });

  test('trial vencido ontem NÃO dá mais PRO', function() {
    // Sem esta regra, quem ganhou 14 dias ficaria PRO para sempre: não há
    // webhook de loja para virar o status de um entitlement nosso.
    expect(billing.entitlementAtivo(
      sub({ trialEndsAt: new Date(Date.now() - DIA).toISOString() }),
    )).toBe(false);
  });

  test('ACTIVE não depende de data de trial', function() {
    expect(billing.entitlementAtivo(
      sub({ status: 'ACTIVE', trialEndsAt: new Date(Date.now() - 90 * DIA).toISOString() }),
    )).toBe(true);
  });

  test('TRIALING sem data continua valendo (assinatura da loja antiga)', function() {
    expect(billing.entitlementAtivo(sub({ trialEndsAt: null }))).toBe(true);
  });

  test('CANCELED nunca vale', function() {
    expect(billing.entitlementAtivo(sub({ status: 'CANCELED' }))).toBe(false);
  });
});

describe('Cortesia x assinatura de loja', function() {
  test('a marca de origem distingue os dois', function() {
    expect(billing.isWelcomeTrial(sub())).toBe(true);
    expect(billing.isWelcomeTrial(sub({ stripeSubId: 'sub_stripe_123' }))).toBe(false);
    expect(billing.isWelcomeTrial(sub({ stripeSubId: 'play:token' }))).toBe(false);
    expect(billing.isWelcomeTrial(null)).toBe(false);
  });
});

describe('Aviso de fim de trial', function() {
  test('trial de cortesia não promete cobrança que não existe', function() {
    const alerta = billing.getLifecycleAlert(
      sub({ trialEndsAt: new Date(Date.now() + 2 * DIA).toISOString() }),
      true,
    );
    expect(alerta).toBeTruthy();
    expect(alerta.message).toMatch(/Nada será cobrado/i);
    expect(alerta.message).not.toMatch(/cobrança do Pro começa/i);
    expect(alerta.cta).toBe('paywall');
  });

  test('trial da loja continua avisando da cobrança', function() {
    const alerta = billing.getLifecycleAlert(
      sub({
        trialEndsAt: new Date(Date.now() + 2 * DIA).toISOString(),
        stripeSubId: 'sub_stripe_123',
      }),
      true,
    );
    expect(alerta).toBeTruthy();
    expect(alerta.message).toMatch(/cobrança do Pro começa/i);
    expect(alerta.cta).toBe('portal');
  });

  test('longe do fim não há aviso nenhum', function() {
    const alerta = billing.getLifecycleAlert(
      sub({ trialEndsAt: new Date(Date.now() + 10 * DIA).toISOString() }),
      true,
    );
    expect(alerta).toBeNull();
  });
});
