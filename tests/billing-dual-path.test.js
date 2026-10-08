/**
 * billing-dual-path.test.js — a cobrança na nuvem é só pelo Supabase.
 *
 * Até a saída da API Express (ADR 0007) havia dois caminhos, e este teste
 * garantia que o do Express não entrasse em silêncio no lugar do Supabase.
 * Agora só há um: sem Supabase (modo local), cada operação de nuvem falha com
 * um erro dizendo isso, e nenhuma chamada a /api/v1 sobrou no código.
 */
const { carregarScript } = require('./helpers/carregar-script.cjs');
const path = require('path');

const BILLING = carregarScript('js/billing.js');
const billingSrc = require('./helpers/esm-como-script.cjs').fonteComPartes(path.join(__dirname, '..', 'js/billing.js'));

describe('Cobrança só pelo Supabase', function() {
  test('nenhuma chamada à API Express sobrou', function() {
    expect(billingSrc).not.toMatch(/\/api\/v1\//);
    expect(billingSrc).not.toMatch(/_apiFetch|_apiAtiva/);
    expect(billingSrc).not.toMatch(/subscribe:\s*function/);
  });

  test('portal, cancelamento e reativação pelas Edge Functions', function() {
    expect(billingSrc).toMatch(/invoke\('stripe-cancel'/);
    expect(billingSrc).toMatch(/invoke\('stripe-resume'/);
    expect(billingSrc).toMatch(/invoke\('stripe-portal'/);
  });

  test('checkout sem URL é erro explícito, sem plano B', function() {
    const block = billingSrc.slice(
      billingSrc.indexOf('checkoutOrSubscribe:'),
      billingSrc.indexOf('cancelSubscription:'),
    );
    expect(block).toMatch(/checkout-unavailable/);
  });

  test('cancel/resume/portal usam isPlayManaged, não isAvailable', function() {
    expect(billingSrc).toMatch(/isPlayManaged:\s*function/);
    const cancel = billingSrc.slice(
      billingSrc.indexOf('cancelSubscription:'),
      billingSrc.indexOf('resumeSubscription:'),
    );
    const resume = billingSrc.slice(
      billingSrc.indexOf('resumeSubscription:'),
      billingSrc.indexOf('openPortal:'),
    );
    const portal = billingSrc.slice(
      billingSrc.indexOf('openPortal:'),
      billingSrc.indexOf('openPortal:') + 500,
    );
    expect(cancel).toMatch(/isPlayManaged\(/);
    expect(cancel).not.toMatch(/PLAY_BILLING\.isAvailable/);
    expect(resume).toMatch(/isPlayManaged\(/);
    expect(resume).not.toMatch(/PLAY_BILLING\.isAvailable/);
    expect(portal).toMatch(/isPlayManaged\(/);
  });
});

describe('Sem Supabase (modo local)', function() {
  const dadosAntes = global.DADOS;

  beforeEach(function() {
    global.DADOS = { _supabaseAtivo: function() { return false; }, getConfig: function() { return {}; } };
    BILLING._cache.orgId = null;
    BILLING._cache.plans = null;
  });
  afterAll(function() { global.DADOS = dadosAntes; });

  test('não é usuário de nuvem e não usa a cobrança do Supabase', function() {
    expect(BILLING.isCloudUser()).toBe(false);
    expect(BILLING._useSupabaseBilling()).toBe(false);
  });

  test('a vitrine mostra os planos estáticos, sem Business', async function() {
    const planos = await BILLING.listPlans();
    expect(planos.map(function(p) { return p.tier; })).toEqual(['FREE', 'PRO']);
  });

  test('textos da vitrine são sempre os do app; do banco vêm só os preços', async function() {
    BILLING._cache.plans = [
      { tier: 'FREE', priceMonthly: 0, priceYearly: 0, features: ['Transações básicas'] },
      { tier: 'PRO', priceMonthly: 19.99, priceYearly: 149.99, features: ['Transações ilimitadas'] },
    ];
    const planos = await BILLING.listPlans();
    const pro = planos.filter(function(p) { return p.tier === 'PRO'; })[0];
    const estatico = BILLING.STATIC_PLANS.filter(function(p) { return p.tier === 'PRO'; })[0];
    expect(pro.priceYearly).toBe(149.99);
    expect(pro.features).toEqual(estatico.features);
    expect(BILLING._cache.plans[1].features).toEqual(['Transações ilimitadas']);
  });

  test('a semente da tabela Plan repete os textos do app', function() {
    const fs = require('fs');
    const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase/seed/planos.sql'), 'utf8');
    BILLING.STATIC_PLANS.forEach(function(plano) {
      const linha = sql.slice(sql.indexOf("', '" + plano.tier + "', "));
      const json = linha.match(/'(\[[^']*\])'::jsonb/);
      expect(JSON.parse(json[1])).toEqual(plano.features);
    });
  });

  test.each([
    ['ensureOrg', function() { return BILLING.ensureOrg(); }],
    ['fetchSubscription', function() { return BILLING.fetchSubscription(); }],
    ['createCheckout', function() { return BILLING.createCheckout('PRO', 'monthly'); }],
    ['acceptInvite', function() { return BILLING.acceptInvite('tok'); }],
    ['revokeInvite', function() { return BILLING.revokeInvite('inv1'); }],
    ['removeTeamMember', function() { return BILLING.removeTeamMember('u1'); }],
  ])('%s falha dizendo que a nuvem não está disponível', async function(_nome, chamar) {
    await expect(chamar()).rejects.toMatchObject({ code: 'nuvem-indisponivel' });
  });
});
