/**
 * fp-native-billing-bridge.js — expõe window.__fpNativeBilling via plugin Capacitor.
 * Carregado só no app Android; no web é no-op.
 */
(function() {
  if (typeof window === 'undefined' || !window.Capacitor) return;
  if (typeof window.Capacitor.isNativePlatform === 'function'
      && !window.Capacitor.isNativePlatform()) return;

  var plugin = window.Capacitor.Plugins && window.Capacitor.Plugins.PlayBilling;
  if (!plugin) return;

  window.__fpNativeBilling = {
    purchase: function(productId) {
      return plugin.purchase({ productId: productId }).then(function(result) {
        return {
          productId: (result && result.productId) || productId,
          purchaseToken: result && result.purchaseToken,
        };
      });
    },
    restore: function() {
      return plugin.restore().then(function(result) {
        return (result && result.purchases) ? result.purchases : [];
      });
    },
    getProductDetails: function(productIds) {
      return plugin.getProductDetails({ productIds: productIds || [] }).then(function(result) {
        return (result && result.products) ? result.products : [];
      });
    },
  };
})();
