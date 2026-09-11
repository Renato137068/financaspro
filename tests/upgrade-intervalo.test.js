/**
 * upgrade-intervalo.test.js — UPG-01: CTA mensal→anual e replacement Play.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('UPG-01 — troca de intervalo no paywall', () => {
  test('init-billing distingue Plano atual de Mudar para anual', () => {
    const src = fs.readFileSync(path.join(root, 'js/modules/init-billing.js'), 'utf8');
    expect(src).toMatch(/Mudar para anual/);
    expect(src).toMatch(/Mudar para mensal/);
    expect(src).toMatch(/sameInterval/);
    expect(src).toMatch(/getBillingInterval/);
    expect(src).toMatch(/oldProductId/);
  });

  test('cancelAtPeriodEnd mostra Reativar em vez de Plano atual', () => {
    const src = fs.readFileSync(path.join(root, 'js/modules/init-billing.js'), 'utf8');
    expect(src).toMatch(/cancelPending/);
    expect(src).toMatch(/billing-reativar/);
    expect(src).toMatch(/Reativar assinatura/);
    expect(src).toMatch(/resumeSubscription/);
  });

  test('plugin nativo aceita SubscriptionUpdateParams / replacement', () => {
    const src = fs.readFileSync(
      path.join(root, 'android/app/src/main/java/com/financaspro/app/PlayBillingPlugin.java'),
      'utf8',
    );
    expect(src).toMatch(/SubscriptionUpdateParams/);
    expect(src).toMatch(/setOldPurchaseToken/);
    expect(src).toMatch(/WITH_TIME_PRORATION/);
    expect(src).toMatch(/oldProductId/);
  });

  test('bridge encaminha oldProductId / oldPurchaseToken', () => {
    const src = fs.readFileSync(path.join(root, 'js/fp-native-billing-bridge.js'), 'utf8');
    expect(src).toMatch(/oldProductId/);
    expect(src).toMatch(/oldPurchaseToken/);
  });
});
