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
        if (typeof renderLucideIconsNow === 'function') {
          renderLucideIconsNow();
        } else if (typeof renderLucideIcons === 'function') {
          renderLucideIcons();
        }
        var abaParam = _bootParams.get('aba');
        if (abaParam && typeof mudarAba === 'function') {
          try { mudarAba(abaParam); } catch (e) {}
        }
        self._handleBelvoReturn();
      })
      .catch(function(e) {
        console.error('[BOOT] Falha crítica na inicialização:', e && e.message || e);
        if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
          UTILS.mostrarToast('Erro crítico ao inicializar. Recarregue a página.', 'error');
        }
      });
  },

  _handleBelvoReturn: function() {
    if (typeof window === 'undefined' || typeof OPEN_FINANCE === 'undefined') return;
    var params = new URLSearchParams(window.location.search);
    if (!params.get('belvo')) return;

    OPEN_FINANCE.handleBelvoCallback(params).then(function(conn) {
      var clean = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', clean);
      if (conn && typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast('Conta bancária conectada via Belvo.', 'success');
      }
      if (typeof INIT_OPEN_FINANCE !== 'undefined' && INIT_OPEN_FINANCE.refreshCard) {
        INIT_OPEN_FINANCE.refreshCard();
      }
    }).catch(function(err) {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast(err.message || 'Falha ao concluir conexão Belvo.', 'error');
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
