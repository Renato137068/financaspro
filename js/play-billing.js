/**
 * play-billing.js — integração Google Play Billing (Android cloud).
 * Depende de: DADOS, BILLING, Capacitor (opcional).
 *
 * Fluxo: BillingClient no app nativo → purchaseToken → POST /billing/play/:orgId/verify
 * O entitlement fica centralizado no backend; Stripe continua válido para web.
 */
var PLAY_BILLING = {
  PRODUCT_IDS: {
    PRO_MONTHLY: 'financaspro.pro.monthly',
    PRO_YEARLY: 'financaspro.pro.yearly',
    BUSINESS_MONTHLY: 'financaspro.business.monthly',
    BUSINESS_YEARLY: 'financaspro.business.yearly',
  },

  productIdForTier: function(tier, interval) {
    var ids = this.PRODUCT_IDS;
    if (tier === 'PRO') return interval === 'yearly' ? ids.PRO_YEARLY : ids.PRO_MONTHLY;
    if (tier === 'BUSINESS') return interval === 'yearly' ? ids.BUSINESS_YEARLY : ids.BUSINESS_MONTHLY;
    return null;
  },

  isAvailable: function() {
    if (typeof DADOS !== 'undefined' && DADOS._apiAtiva && !DADOS._apiAtiva()) return false;
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
    var orgId = this._orgId();
    if (!orgId || typeof DADOS === 'undefined' || !DADOS._apiFetch) {
      return Promise.reject(new Error('conta-cloud-indisponivel'));
    }
    return DADOS._apiFetch('/api/v1/billing/play/' + encodeURIComponent(orgId) + '/verify', {
      method: 'POST',
      body: JSON.stringify({
        productId: productId,
        purchaseToken: purchaseToken,
        packageName: 'com.financaspro.mobile',
      }),
    }).then(function(resp) {
      if (typeof BILLING !== 'undefined' && BILLING.sync) {
        return BILLING.sync().then(function() { return resp && resp.data ? resp.data : resp; });
      }
      return resp && resp.data ? resp.data : resp;
    });
  },

  /**
   * Ponto de extensão para plugin Capacitor/Google Play Billing Library.
   * Enquanto o plugin nativo não estiver instalado, retorna erro explícito.
   */
  purchase: function(productId) {
    if (!this.isAvailable()) {
      return Promise.reject(new Error('play-billing-indisponivel'));
    }
    if (typeof window.__fpNativeBilling === 'object'
        && typeof window.__fpNativeBilling.purchase === 'function') {
      var self = this;
      return window.__fpNativeBilling.purchase(productId).then(function(result) {
        return self.verifyOnServer(productId, result.purchaseToken);
      });
    }
    return Promise.reject(new Error('plugin-play-billing-nao-instalado'));
  },

  restore: function() {
    if (!this.isAvailable()) {
      return Promise.reject(new Error('play-billing-indisponivel'));
    }
    if (typeof window.__fpNativeBilling === 'object'
        && typeof window.__fpNativeBilling.restore === 'function') {
      var self = this;
      return window.__fpNativeBilling.restore().then(function(purchases) {
        var chain = Promise.resolve();
        (purchases || []).forEach(function(p) {
          chain = chain.then(function() {
            return self.verifyOnServer(p.productId, p.purchaseToken);
          });
        });
        return chain;
      });
    }
    return Promise.reject(new Error('plugin-play-billing-nao-instalado'));
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PLAY_BILLING;
}
