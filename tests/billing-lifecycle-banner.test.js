/**
 * billing-lifecycle-banner.test.js — DOM do banner de dunning e de cota.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadInitBilling(billingStub) {
  const document = {
    getElementById: function(id) {
      if (id === 'fp-usage-banner') return this._banner;
      if (id === 'dashboard-onboarding') return { hidden: true };
      return null;
    },
    _banner: {
      hidden: true,
      className: '',
      innerHTML: '',
    },
    createElement: function() { return { className: '', setAttribute: function() {}, innerHTML: '', appendChild: function() {}, addEventListener: function() {}, querySelector: function() { return null; }, querySelectorAll: function() { return []; } }; },
    body: { appendChild: function() {} },
  };
  const ctx = {
    document: document,
    window: {},
    sessionStorage: { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} },
    URLSearchParams: function() { this.get = function() { return null; }; },
    BILLING: billingStub,
    UTILS: { escapeHtml: function(s) { return String(s); } },
    FocusTrap: undefined,
    renderLucideIcons: undefined,
    renderLucideIconsNow: undefined,
    module: { exports: {} },
    console: console,
  };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/modules/init-billing.js'), 'utf8');
  vm.runInContext(src, ctx, { filename: path.join(__dirname, '..', 'js/modules/init-billing.js') });
  return { INIT: ctx.module.exports || ctx.INIT_BILLING, banner: document._banner, document };
}

describe('refreshUsageBanner', function() {
  test('PAST_DUE renderiza CTA portal', function() {
    const { INIT, banner } = loadInitBilling({
      getLifecycleAlert: function() {
        return {
          severity: 'warn',
          title: 'Pagamento pendente',
          message: 'Atualize o método.',
          cta: 'portal',
          ctaLabel: 'Atualizar pagamento',
        };
      },
      shouldEnforceLimits: function() { return false; },
      isCloudUser: function() { return true; },
    });
    INIT.refreshUsageBanner();
    expect(banner.hidden).toBe(false);
    expect(banner.innerHTML).toMatch(/Pagamento pendente/);
    expect(banner.innerHTML).toMatch(/billing-portal-banner/);
  });

  test('cota de OCR quase no fim mostra o banner', function() {
    const { INIT, banner } = loadInitBilling({
      getLifecycleAlert: function() { return null; },
      isCloudUser: function() { return false; },
      ocrRemaining: function() { return 1; },
      shouldEnforceLimits: function() { return false; },
    });
    INIT.refreshUsageBanner();
    expect(banner.hidden).toBe(false);
    expect(banner.innerHTML).toMatch(/1 escaneamento/);
    expect(banner.innerHTML).toMatch(/abrir-paywall/);
    // O banner vende o que o Pro faz, não o limite que ele remove.
    expect(banner.innerHTML).not.toMatch(/sem limite/i);
    expect(banner.innerHTML).toMatch(/quantos comprovantes quiser/);
  });

  test('PRO não vê banner de cota — ocrRemaining é Infinity', function() {
    const { INIT, banner } = loadInitBilling({
      getLifecycleAlert: function() { return null; },
      isCloudUser: function() { return true; },
      ocrRemaining: function() { return Infinity; },
      shouldEnforceLimits: function() { return false; },
    });
    INIT.refreshUsageBanner();
    expect(banner.hidden).toBe(true);
  });

  test('FREE sem nada perto do teto não vê banner algum', function() {
    // Um banner permanente listando o que o gratuito não tem transforma o
    // plano numa reclamação diária, e ninguém assina por irritação.
    const { INIT, banner } = loadInitBilling({
      getLifecycleAlert: function() { return null; },
      isCloudUser: function() { return false; },
      ocrRemaining: function() { return 5; },
      shouldEnforceLimits: function() { return true; },
      getUsageLabel: function() { return ''; },
    });
    INIT.refreshUsageBanner();
    expect(banner.hidden).toBe(true);
  });
});
