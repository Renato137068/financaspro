/**
 * play-billing.test.js — mapeamento SKU + verify/purchase/restore.
 */
const path = require('path');
const vm = require('vm');
const { rodarNoContexto } = require('./helpers/esm-como-script.cjs');

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
    Promise: Promise,
  });
  rodarNoContexto(ctx, path.join(__dirname, '..', 'js', 'play-billing.js'));
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

  test('purchase encaminha opts de troca de ciclo ao nativo', async () => {
    const purchase = jest.fn(() => Promise.resolve({ purchaseToken: 'tok-upg' }));
    const { PB } = loadPlayBilling({
      window: {
        Capacitor: { isNativePlatform: () => true },
        __fpNativeBilling: { purchase },
      },
    });
    await PB.purchase('financaspro.pro.yearly', {
      oldProductId: 'financaspro.pro.monthly',
    });
    expect(purchase).toHaveBeenCalledWith(
      'financaspro.pro.yearly',
      expect.objectContaining({ oldProductId: 'financaspro.pro.monthly' }),
    );
  });

  test('reconhece a compra na Play só depois de o servidor confirmar', async () => {
    const ordem = [];
    const invoke = jest.fn(() => { ordem.push('verify'); return Promise.resolve({ ok: true }); });
    const acknowledge = jest.fn(() => { ordem.push('ack'); return Promise.resolve(); });
    const { PB } = loadPlayBilling({
      invoke,
      window: {
        Capacitor: { isNativePlatform: () => true },
        __fpNativeBilling: {
          purchase: () => Promise.resolve({ purchaseToken: 'tok-1' }),
          acknowledge,
        },
      },
    });
    await PB.purchase('financaspro.pro.monthly');
    expect(ordem).toEqual(['verify', 'ack']);
    expect(acknowledge).toHaveBeenCalledWith('tok-1');
  });

  test('servidor recusou: a compra fica sem reconhecimento (a Play devolve sozinha)', async () => {
    const acknowledge = jest.fn(() => Promise.resolve());
    const { PB } = loadPlayBilling({
      invoke: jest.fn(() => Promise.reject(new Error('token-em-uso'))),
      window: {
        Capacitor: { isNativePlatform: () => true },
        __fpNativeBilling: {
          purchase: () => Promise.resolve({ purchaseToken: 'tok-1' }),
          acknowledge,
        },
      },
    });
    await expect(PB.purchase('financaspro.pro.monthly')).rejects.toThrow('token-em-uso');
    expect(acknowledge).not.toHaveBeenCalled();
  });

  test('falha ao reconhecer não desfaz a compra já confirmada', async () => {
    const { PB } = loadPlayBilling({
      window: {
        Capacitor: { isNativePlatform: () => true },
        __fpNativeBilling: {
          purchase: () => Promise.resolve({ purchaseToken: 'tok-1' }),
          acknowledge: () => Promise.reject(new Error('falha-reconhecer')),
        },
      },
    });
    await expect(PB.purchase('financaspro.pro.monthly')).resolves.toEqual({ ok: true });
  });

  test('restore verifica e reconhece cada compra', async () => {
    const acknowledge = jest.fn(() => Promise.resolve());
    const { PB, invoke } = loadPlayBilling({
      window: {
        Capacitor: { isNativePlatform: () => true },
        __fpNativeBilling: {
          restore: () => Promise.resolve([{ productId: 'financaspro.pro.yearly', purchaseToken: 'tok-r' }]),
          acknowledge,
        },
      },
    });
    await PB.restore();
    expect(invoke).toHaveBeenCalledWith('play-verify', expect.objectContaining({ purchaseToken: 'tok-r' }));
    expect(acknowledge).toHaveBeenCalledWith('tok-r');
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
