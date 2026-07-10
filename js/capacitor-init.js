/**
 * capacitor-init.js — Status bar, splash e classe body para layout nativo
 * Carregado apenas quando Capacitor está presente (WebView Android).
 */
(function initCapacitor() {
  if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) {
    return;
  }

  document.documentElement.classList.add('capacitor-ready');
  document.body.classList.add('capacitor-app');

  var plugins = window.Capacitor.Plugins || {};

  if (plugins.SplashScreen && plugins.SplashScreen.hide) {
    plugins.SplashScreen.hide({ fadeOutDuration: 300 }).catch(function() {});
  }

  if (plugins.StatusBar) {
    if (plugins.StatusBar.setOverlaysWebView) {
      plugins.StatusBar.setOverlaysWebView({ overlay: false }).catch(function() {});
    }
    if (plugins.StatusBar.setBackgroundColor) {
      plugins.StatusBar.setBackgroundColor({ color: '#00723F' }).catch(function() {});
    }
    if (plugins.StatusBar.setStyle) {
      plugins.StatusBar.setStyle({ style: 'LIGHT' }).catch(function() {});
    }
  }

  document.addEventListener('backbutton', function(e) {
    if (typeof window.__fpHandleAndroidBack === 'function') {
      var handled = window.__fpHandleAndroidBack();
      if (handled) {
        e.preventDefault();
      }
    }
  }, false);
})();
