/**
 * play-billing.js — integração Google Play Billing (Android cloud).
 * Depende de: DADOS, BILLING, Capacitor (opcional).
 *
 * Fluxo: BillingClient no app nativo → purchaseToken → POST /billing/play/:orgId/verify
 * O entitlement fica centralizado no backend; Stripe continua válido para web.
 *
 * ES Module (ADR 0005): chega sob demanda no chunk 'conta'
 * (js/esm/chunks/conta.js, via LAZY.load), que o publica em window.
 */

import { BILLING } from './billing.js';
import { DADOS } from './core/dados.js';

const PLAY_BILLING = {
  PRODUCT_IDS: {
    PRO_MONTHLY: 'financaspro.pro.monthly',
    PRO_YEARLY: 'financaspro.pro.yearly',
    BUSINESS_MONTHLY: 'financaspro.business.monthly',
    BUSINESS_YEARLY: 'financaspro.business.yearly',
  },

  productIdForTier: function(tier, interval) {
    var ids = PLAY_BILLING.PRODUCT_IDS;
    if (tier === 'PRO') return interval === 'yearly' ? ids.PRO_YEARLY : ids.PRO_MONTHLY;
    if (tier === 'BUSINESS') return interval === 'yearly' ? ids.BUSINESS_YEARLY : ids.BUSINESS_MONTHLY;
    return null;
  },

  isAvailable: function() {
    if (typeof DADOS !== 'undefined' && DADOS._nuvemAtiva && !DADOS._nuvemAtiva()) return false;
    return !!(typeof window !== 'undefined' && window.Capacitor
      && typeof window.Capacitor.isNativePlatform === 'function'
      && window.Capacitor.isNativePlatform());
  },

  _orgId: function() {
    if (typeof BILLING !== 'undefined' && BILLING._cache && BILLING._cache.orgId) {
      return BILLING._cache.orgId;
    }
    return null;
  },

  verifyOnServer: function(productId, purchaseToken) {
    var orgId = PLAY_BILLING._orgId();
    if (!orgId) {
      return Promise.reject(new Error('conta-cloud-indisponivel'));
    }

    var verify = function(resp) {
      if (typeof BILLING !== 'undefined' && BILLING.sync) {
        return BILLING.sync().then(function() { return resp; });
      }
      return resp;
    };

    if (typeof DADOS === 'undefined' || !DADOS._supabaseAtivo || !DADOS._supabaseAtivo()
        || typeof SUPA_BILLING === 'undefined' || !SUPA_BILLING.isActive()) {
      return Promise.reject(new Error('conta-cloud-indisponivel'));
    }
    return BILLING.ensureOrg().then(function(resolvedOrgId) {
      return SUPA_BILLING.invoke('play-verify', {
        orgId: resolvedOrgId,
        productId: productId,
        purchaseToken: purchaseToken,
        packageName: 'com.financaspro.mobile',
      });
    }).then(verify);
  },

  /**
   * Compra (ou troca de ciclo) via plugin nativo.
   * @param {string} productId
   * @param {{ oldProductId?: string, oldPurchaseToken?: string }=} opts
   *   Quando troca mensal↔anual, passar o SKU antigo (e opcionalmente o token).
   *   Sem token, o nativo consulta compras ativas e usa o replacement do Play.
   */
  purchase: function(productId, opts) {
    if (!PLAY_BILLING.isAvailable()) {
      return Promise.reject(new Error('play-billing-indisponivel'));
    }
    if (typeof window.__fpNativeBilling === 'object'
        && typeof window.__fpNativeBilling.purchase === 'function') {
      var self = PLAY_BILLING;
      opts = opts || {};
      return window.__fpNativeBilling.purchase(productId, opts).then(function(result) {
        return self.verifyOnServer(productId, result.purchaseToken);
      });
    }
    return Promise.reject(new Error('plugin-play-billing-nao-instalado'));
  },

  restore: function() {
    if (!PLAY_BILLING.isAvailable()) {
      return Promise.reject(new Error('play-billing-indisponivel'));
    }
    if (typeof window.__fpNativeBilling === 'object'
        && typeof window.__fpNativeBilling.restore === 'function') {
      var self = PLAY_BILLING;
      return window.__fpNativeBilling.restore().then(function(purchases) {
        var list = purchases || [];
        var chain = Promise.resolve();
        list.forEach(function(p) {
          chain = chain.then(function() {
            return self.verifyOnServer(p.productId, p.purchaseToken);
          });
        });
        return chain.then(function() { return list; });
      });
    }
    return Promise.reject(new Error('plugin-play-billing-nao-instalado'));
  },

  /**
   * Preços oficiais do Play (quando o plugin expõe getProductDetails).
   * @returns {Promise<Array<{productId:string,formattedPrice:string}>>}
   */
  getProductDetails: function(productIds) {
    if (!PLAY_BILLING.isAvailable()) {
      return Promise.reject(new Error('play-billing-indisponivel'));
    }
    if (typeof window.__fpNativeBilling === 'object'
        && typeof window.__fpNativeBilling.getProductDetails === 'function') {
      var ids = productIds;
      if (!ids || !ids.length) {
        // Só Pro — Business não é vendido no app.
        ids = [PLAY_BILLING.PRODUCT_IDS.PRO_MONTHLY, PLAY_BILLING.PRODUCT_IDS.PRO_YEARLY];
      }
      return window.__fpNativeBilling.getProductDetails(ids);
    }
    return Promise.reject(new Error('plugin-play-billing-nao-instalado'));
  },
};

export { PLAY_BILLING };
export default PLAY_BILLING;
