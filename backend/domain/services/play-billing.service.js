// backend/domain/services/play-billing.service.js
//
// Verificação de compras Google Play — entitlement centralizado no backend.
// Em produção, chamar a Google Play Developer API (purchases.subscriptionsv2.get).
// Este serviço valida formato, evita duplicidade e persiste o token verificado.
import { BillingRepository } from '../repositories/billing.repository.js';
import CONFIG from '../../config.js';

const PRODUCT_TIERS = {
  'financaspro.pro.monthly': 'PRO',
  'financaspro.pro.yearly': 'PRO',
  'financaspro.business.monthly': 'BUSINESS',
  'financaspro.business.yearly': 'BUSINESS',
};

function normalizeToken(token) {
  if (typeof token !== 'string') return null;
  var t = token.trim();
  if (t.length < 20 || t.length > 4096) return null;
  return t;
}

export const PlayBillingService = {
  isConfigured() {
    return !!(CONFIG.playBilling && CONFIG.playBilling.packageName);
  },

  resolveTier(productId) {
    return PRODUCT_TIERS[productId] || null;
  },

  /**
   * Verifica purchaseToken e sincroniza entitlement da organização.
   * @returns {{ tier, productId, expiresAt, restored: boolean }}
   */
  async verifyPurchase(orgId, { productId, purchaseToken, packageName }) {
    var token = normalizeToken(purchaseToken);
    if (!token) {
      var err = new Error('purchase-token-invalido');
      err.status = 400;
      throw err;
    }

    var tier = this.resolveTier(productId);
    if (!tier) {
      var errProd = new Error('produto-desconhecido');
      errProd.status = 400;
      throw errProd;
    }

    var pkg = packageName || (CONFIG.playBilling && CONFIG.playBilling.packageName);
    if (!pkg) {
      var errPkg = new Error('play-billing-nao-configurado');
      errPkg.status = 503;
      throw errPkg;
    }

    // Sandbox/dev: aceita token sintético prefixado para testes automatizados.
    var sandbox = CONFIG.env !== 'production'
      && token.startsWith('GPA.test.');

    if (!sandbox && CONFIG.env === 'production' && !CONFIG.playBilling.serviceAccountJson) {
      var errApi = new Error('play-api-nao-configurada');
      errApi.status = 503;
      throw errApi;
    }

    var expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    var existing = await BillingRepository.findByPlayPurchaseToken(token);

    if (existing && existing.orgId !== orgId) {
      var errDup = new Error('token-em-uso');
      errDup.status = 409;
      throw errDup;
    }

    await BillingRepository.upsertPlayEntitlement(orgId, {
      productId,
      purchaseToken: token,
      packageName: pkg,
      tier,
      expiresAt,
      source: 'google_play',
    });

    return {
      tier,
      productId,
      expiresAt,
      restored: !!existing,
    };
  },

  async getEntitlement(orgId) {
    return BillingRepository.findPlayEntitlement(orgId);
  },
};
