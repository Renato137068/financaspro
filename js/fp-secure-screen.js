/**
 * fp-secure-screen.js — FLAG_SECURE no Android durante telas sensíveis.
 * Contagem de referências: auth overlay e PIN podem estar ativos ao mesmo tempo.
 */
(function() {
  'use strict';

  var _refs = 0;

  function plugin() {
    try {
      return window.Capacitor
        && window.Capacitor.isNativePlatform
        && window.Capacitor.isNativePlatform()
        && window.Capacitor.Plugins
        && window.Capacitor.Plugins.FpSecureScreen;
    } catch (e) {
      return null;
    }
  }

  function sync() {
    var p = plugin();
    if (!p) return;
    if (_refs > 0) {
      p.enable().catch(function() { /* noop */ });
    } else {
      p.disable().catch(function() { /* noop */ });
    }
  }

  window.FP_SECURE_SCREEN = {
    retain: function() {
      _refs += 1;
      sync();
    },
    release: function() {
      if (_refs > 0) _refs -= 1;
      sync();
    },
    reset: function() {
      _refs = 0;
      sync();
    },
  };

  /* pin-guard pode marcar bloqueio antes deste script carregar. */
  try {
    if (window.__FP_PIN_EARLY_SECURE__ === 1) {
      window.FP_SECURE_SCREEN.retain();
      window.__FP_PIN_EARLY_SECURE_HELD__ = 1;
    }
  } catch (eEarly) { /* noop */ }
})();
