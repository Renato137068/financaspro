/**
 * play-billing.test.js — mapeamento tier → productId Google Play.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPlayBilling() {
  const ctx = vm.createContext({
    window: {},
    DADOS: { _apiAtiva: () => true },
    BILLING: { _cache: { orgId: 'org-1' } },
    module: { exports: {} },
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'play-billing.js'), 'utf8'),
    ctx,
    { filename: path.join(__dirname, '..', 'js', 'play-billing.js') },
  );
  return ctx.PLAY_BILLING;
}

describe('PLAY_BILLING', () => {
  test('productIdForTier mapeia Pro e Business', () => {
    const PB = loadPlayBilling();
    expect(PB.productIdForTier('PRO', 'monthly')).toBe('financaspro.pro.monthly');
    expect(PB.productIdForTier('PRO', 'yearly')).toBe('financaspro.pro.yearly');
    expect(PB.productIdForTier('BUSINESS', 'monthly')).toBe('financaspro.business.monthly');
    expect(PB.productIdForTier('BUSINESS', 'yearly')).toBe('financaspro.business.yearly');
    expect(PB.productIdForTier('FREE', 'monthly')).toBeNull();
  });
});
