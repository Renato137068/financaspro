/**
 * play-billing.test.js — mapeamento SKU + verify/purchase/restore.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPlayBilling(overrides) {
  overrides = overrides || {};
  const invoke = overrides.invoke || jest.fn(() => Promise.resolve({ ok: true }));
  const apiFetch = overrides.apiFetch || jest.fn(() => Promise.resolve({ data: { ok: true } }));
  const ctx = vm.createContext({
    window: overrides.window || {},
    DADOS: {
      _nuvemAtiva: overrides.nuvemAtiva || (() => true),
      _supabaseAtivo: overrides.supabaseAtivo || (() => true),
      _apiFetch: apiFetch,
    },
    BILLING: {
      _cache: { orgId: 'org-1' },
      ensureOrg: () => Promise.resolve('org-1'),
      sync: () => Promise.resolve(null),
    },
    SUPA_BILLING: {
      isActive: () => true,
      invoke: invoke,
    },
    module: { exports: {} },
    Promise: Promise,
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'play-billing.js'), 'utf8'),
    ctx,
    { filename: 'play-billing.js' },
  );
  return { PB: ctx.PLAY_BILLING, invoke, apiFetch, ctx };
}

describe('PLAY_BILLING', () => {
  test('productIdForTier mapeia Pro (Business existe no mapa mas fora da vitrine)', () => {
    const { PB } = loadPlayBilling();
    expect(PB.productIdForTier('PRO', 'monthly')).toBe('financaspro.pro.monthly');
    expect(PB.productIdForTier('PRO', 'yearly')).toBe('financaspro.pro.yearly');
    expect(PB.productIdForTier('BUSINESS', 'monthly')).toBe('financaspro.business.monthly');
    expect(PB.productIdForTier('FREE', 'monthly')).toBeNull();
  });

  test('isAvailable false sem nuvem', () => {
    const { PB } = loadPlayBilling({
      nuvemAtiva: () => false,
      window: {
        Capacitor: { isNativePlatform: () => true },
      },
    });
    expect(PB.isAvailable()).toBe(false);
  });

  test('verifyOnServer usa play-verify no path Supabase', async () => {
    const { PB, invoke } = loadPlayBilling();
    await PB.verifyOnServer('financaspro.pro.monthly', 'tok-1');
    expect(invoke).toHaveBeenCalledWith('play-verify', expect.objectContaining({
      orgId: 'org-1',
      productId: 'financaspro.pro.monthly',
      purchaseToken: 'tok-1',
    }));
  });

  test('purchase rejeita sem plugin nativo', async () => {
    const { PB } = loadPlayBilling({
      window: {
        Capacitor: { isNativePlatform: () => true },
      },
    });
    await expect(PB.purchase('financaspro.pro.monthly'))
      .rejects.toThrow(/plugin-play-billing-nao-instalado/);
  });

  test('purchase com mock nativo chama verify', async () => {
    const { PB, invoke } = loadPlayBilling({
      window: {
        Capacitor: { isNativePlatform: () => true },
        __fpNativeBilling: {
          purchase: () => Promise.resolve({ purchaseToken: 'tok-nativo' }),
        },
      },
    });
    await PB.purchase('financaspro.pro.monthly');
    expect(invoke).toHaveBeenCalledWith('play-verify', expect.objectContaining({
      purchaseToken: 'tok-nativo',
    }));
  });

  test('restore devolve lista vazia sem plugin purchases', async () => {
    const { PB } = loadPlayBilling({
      window: {
        Capacitor: { isNativePlatform: () => true },
        __fpNativeBilling: {
          restore: () => Promise.resolve([]),
        },
      },
    });
    await expect(PB.restore()).resolves.toEqual([]);
  });

  test('getProductDetails usa bridge nativo', async () => {
    const { PB } = loadPlayBilling({
      window: {
        Capacitor: { isNativePlatform: () => true },
        __fpNativeBilling: {
          getProductDetails: (ids) => Promise.resolve([
            { productId: ids[0], formattedPrice: 'R$ 16,99' },
          ]),
        },
      },
    });
    const out = await PB.getProductDetails(['financaspro.pro.monthly']);
    expect(out[0].formattedPrice).toBe('R$ 16,99');
  });
});
