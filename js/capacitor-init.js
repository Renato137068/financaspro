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
      plugins.StatusBar.setBackgroundColor({ color: '#12694E' }).catch(function() {});
    }
    if (plugins.StatusBar.setStyle) {
      plugins.StatusBar.setStyle({ style: 'LIGHT' }).catch(function() {});
    }
  }

  /*
   * Botão voltar do Android. O evento 'backbutton' só existe com o plugin
   * @capacitor/app instalado; sem ele (até a v11.3.19) o voltar FECHAVA o app
   * de qualquer lugar: com um formulário ou uma janela aberta, numa aba
   * interna, no meio do Perfil. Com o plugin, o padrão do sistema fica
   * desligado e a ordem aqui é a que a pessoa espera:
   *   1. janela/folha aberta → fecha (o mesmo Esc que o teclado usa);
   *   2. sub-tela do Perfil → volta um nível (__fpHandleAndroidBack);
   *   3. outra aba → volta ao Resumo;
   *   4. no Resumo → minimiza o app, sem perder o estado.
   */
  function janelaAberta() {
    var seletores = '.modal-overlay, [role="dialog"], [role="alertdialog"], [aria-modal="true"]';
    var lista = document.querySelectorAll(seletores);
    for (var i = 0; i < lista.length; i++) {
      var el = lista[i];
      if (visivel(el)) return el;
    }
    return null;
  }

  function visivel(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.hidden || n.getAttribute('aria-hidden') === 'true') return false;
      var estilo = window.getComputedStyle ? window.getComputedStyle(n) : null;
      if (estilo && (estilo.display === 'none' || estilo.visibility === 'hidden')) return false;
    }
    return true;
  }

  function abaAtiva() {
    var ativa = document.querySelector('.aba.ativo');
    return ativa ? ativa.id.replace(/^aba-/, '') : null;
  }

  window.__fpVoltarAndroid = function() {
    // Telas que não se fecham (entrar na conta, PIN): voltar só minimiza.
    var trava = document.querySelector('.auth-overlay, .pin-lock-screen');
    if (trava && visivel(trava)) {
      if (plugins.App && plugins.App.minimizeApp) plugins.App.minimizeApp().catch(function() {});
      return 'minimizar';
    }
    if (janelaAberta()) {
      var esc = { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true };
      var alvo = document.activeElement && document.activeElement !== document.body
        ? document.activeElement : document;
      alvo.dispatchEvent(new KeyboardEvent('keydown', esc));
      return 'janela';
    }
    if (typeof window.__fpHandleAndroidBack === 'function' && window.__fpHandleAndroidBack()) {
      return 'subtela';
    }
    var aba = abaAtiva();
    if (aba && aba !== 'resumo' && typeof window.mudarAba === 'function') {
      window.mudarAba('resumo');
      return 'resumo';
    }
    if (plugins.App && plugins.App.minimizeApp) {
      plugins.App.minimizeApp().catch(function() {});
    }
    return 'minimizar';
  };

  if (!window.__fpVoltarOuvindo) {
    window.__fpVoltarOuvindo = true;
    document.addEventListener('backbutton', function(e) {
      e.preventDefault();
      window.__fpVoltarAndroid();
    }, false);
  }
})();
