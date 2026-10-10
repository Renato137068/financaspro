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
const { carregarScript } = require('./helpers/carregar-script.cjs');
const { regrasDoBilling } = require('./helpers/billing-regras.cjs');
const BILLING = carregarScript('js/billing.js');
const billing = regrasDoBilling(BILLING);

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

describe('Pedido do Pro de boas-vindas (claimWelcomeTrial)', function() {
  // A marca local de "já pedido" só pode nascer de uma recusa definitiva. O
  // servidor antigo respondia 409 "assinatura-ja-existe" até para a FREE que
  // toda org ganha ao nascer, e o app desistia para sempre (auditoria do
  // servidor, 09/10).
  const KEY = BILLING._WELCOME_KEY;
  let resposta;
  const originais = {};

  beforeAll(function() {
    ['isCloudUser', '_useSupabaseBilling', 'ensureOrg', 'sync', 'invalidateCache'].forEach(function(k) {
      originais[k] = BILLING[k];
    });
    BILLING.isCloudUser = () => true;
    BILLING._useSupabaseBilling = () => true;
    BILLING.ensureOrg = () => Promise.resolve('org1');
    BILLING.sync = () => Promise.resolve(null);
    BILLING.invalidateCache = () => {};
    global.SUPA_BILLING = { invoke: jest.fn(() => resposta()) };
  });

  afterAll(function() {
    Object.assign(BILLING, originais);
    delete global.SUPA_BILLING;
  });

  beforeEach(function() {
    localStorage.removeItem(KEY);
    global.SUPA_BILLING.invoke.mockClear();
  });

  function recusa(status, codigo) {
    return () => Promise.reject(Object.assign(new Error(codigo), { status: status }));
  }

  test.each([
    ['welcome-trial-ja-concedido'],
    ['assinatura-paga-existe'],
  ])('409 %s marca e não pede de novo', async function(codigo) {
    resposta = recusa(409, codigo);
    await BILLING.claimWelcomeTrial();
    expect(localStorage.getItem(KEY)).toBe('1');
    await BILLING.claimWelcomeTrial();
    expect(global.SUPA_BILLING.invoke).toHaveBeenCalledTimes(1);
  });

  test.each([
    [409, 'assinatura-ja-existe'],
    [500, 'erro-interno'],
    [401, 'nao-autenticado'],
  ])('%s %s não marca: tenta no próximo login', async function(status, codigo) {
    resposta = recusa(status, codigo);
    await expect(BILLING.claimWelcomeTrial()).resolves.toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test('concedido marca', async function() {
    resposta = () => Promise.resolve({ tier: 'PRO', status: 'TRIALING' });
    await BILLING.claimWelcomeTrial();
    expect(localStorage.getItem(KEY)).toBe('1');
  });
});
