/**
 * app-bootstrap.js — Orquestrador de inicialização
 * Responsabilidade única: delegar ao LIFECYCLE e reagir ao resultado.
 * Toda a lógica de módulos vive em lifecycle.js (LIFECYCLE_BOOT).
 */

var APP_BOOTSTRAP = {
  _initialized: false,

  inicializar: function() {
    if (this._initialized) {
      console.warn('[BOOT] Já inicializado, ignorando...');
      return;
    }

    if (typeof LIFECYCLE === 'undefined' || typeof LIFECYCLE.init !== 'function') {
      console.error('[BOOT] LIFECYCLE não encontrado — verifique a ordem de carregamento dos scripts.');
      return;
    }

    this._orquestrar();
  },

  _orquestrar: function() {
    var self = this;

    if (typeof LIFECYCLE_BOOT !== 'undefined' && LIFECYCLE_BOOT.registerDefaults) {
      LIFECYCLE_BOOT.registerDefaults();
    }

    LIFECYCLE.onError(function(data) {
      console.error('[BOOT] Erro em "' + data.module + '":', data.error);
    });

    LIFECYCLE.init()
      .then(function(result) {
        self._initialized = true;
        if (result.failed && result.failed.length > 0) {
          console.warn('[BOOT] Módulos não inicializados:', result.failed.map(function(f) { return f.name; }));
        }
      })
      .catch(function(e) {
        console.error('[BOOT] Falha crítica na inicialização:', e && e.message || e);
        if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
          UTILS.mostrarToast('Erro crítico ao inicializar. Recarregue a página.', 'error');
        }
      });
  }
};

// Permitir desativar lifecycle via query param (?lifecycle=off) para depuração
if (typeof window !== 'undefined') {
  var _bootParams = new URLSearchParams(window.location.search);
  if (_bootParams.get('lifecycle') === 'off') {
    APP_BOOTSTRAP.inicializar = function() {
      console.warn('[BOOT] Lifecycle desativado via query param — app não será inicializado.');
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = APP_BOOTSTRAP;
}
