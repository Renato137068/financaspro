/**
 * app-bootstrap.js - Startup orchestration com Lifecycle Manager
 * Versão refatorada usando LIFECYCLE para inicialização controlada
 */

var APP_BOOTSTRAP = {
  _useLifecycle: true,
  _initialized: false,
  _hooksRegistered: false,

  inicializar: function() {
    // Prevenir inicialização dupla
    if (this._initialized) {
      console.warn('[APP_BOOTSTRAP] Já inicializado, ignorando...');
      return;
    }

    // Verificar se lifecycle manager está disponível e funcional
    var lifecycleAvailable = this._useLifecycle && 
                            typeof LIFECYCLE !== 'undefined' && 
                            LIFECYCLE && 
                            typeof LIFECYCLE.init === 'function';

    if (lifecycleAvailable) {
      this._inicializarComLifecycle();
    } else {
      this._inicializarLegado();
    }
  },

  /**
   * Nova inicialização com lifecycle manager
   */
  _inicializarComLifecycle: function() {
    var self = this;

    try {
      console.log('[APP_BOOTSTRAP] Usando Lifecycle Manager');

      // Registrar módulos padrão (apenas uma vez)
      if (typeof LIFECYCLE_BOOT !== 'undefined' && LIFECYCLE_BOOT.registerDefaults) {
        LIFECYCLE_BOOT.registerDefaults();
      }

      // Hooks para observabilidade (apenas uma vez)
      if (!this._hooksRegistered) {
        LIFECYCLE.beforeInit(function() {
          console.log('[BOOT] Iniciando inicialização orquestrada...');
        });

        LIFECYCLE.afterInit(function(result) {
          console.log('[BOOT] Inicialização concluída');
          if (!self._initialized) {
            self._setupPostInit();
            self._initialized = true;
          }
        });

        LIFECYCLE.onError(function(data) {
          console.error('[BOOT] Erro em', data.module, ':', data.error);
        });

        this._hooksRegistered = true;
      }

      // Iniciar orquestração
      LIFECYCLE.init().then(function(result) {
        if (result && result.failed && result.failed.length > 0) {
          console.warn('[BOOT] Alguns módulos não inicializaram:', result.failed);
        }
      }).catch(function(e) {
        console.error('[BOOT] Falha crítica:', e);
        // Fallback para legado em caso de falha crítica
        if (!self._initialized) {
          console.warn('[BOOT] Tentando fallback legado...');
          self._inicializarLegado();
        }
      });

    } catch (e) {
      console.error('Erro na inicialização:', e && e.message, e && e.stack);
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast('Erro ao inicializar: ' + (e && e.message || 'Erro desconhecido'), 'error');
      }
      // Fallback para legado
      this._inicializarLegado();
    }
  },

  /**
   * Inicialização legada (fallback)
   */
  _inicializarLegado: function() {
    console.log('[APP_BOOTSTRAP] Usando inicialização legada');
    var self = this;

    try {
      if (typeof DOMUTILS !== 'undefined') DOMUTILS.init();
      if (typeof DADOS !== 'undefined') {
        DADOS.init();
        if (DADOS.setupStorageSync) DADOS.setupStorageSync();
      }
      this.setupAuth();
      this._ativarAppLegado();
    } catch (e) {
      console.error('Erro na inicialização legada:', e && e.message);
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast('Erro ao inicializar: ' + (e && e.message || 'Erro desconhecido'), 'error');
      }
    }
  },

  _ativarAppLegado: function() {
    var self = this;

    // Código legado mantido para compatibilidade
    // Cada init é protegido individualmente
    var safeInit = function(moduleName, initFn) {
      try {
        if (typeof initFn === 'function') {
          initFn();
        }
      } catch (e) {
        console.warn('[BOOT] Falha ao inicializar ' + moduleName + ':', e && e.message);
      }
    };

    safeInit('TRANSACOES', function() { if (typeof TRANSACOES !== 'undefined') TRANSACOES.init(); });
    safeInit('ORCAMENTO', function() { if (typeof ORCAMENTO !== 'undefined') ORCAMENTO.init(); });
    safeInit('CATEGORIES', function() { if (typeof CATEGORIES !== 'undefined') CATEGORIES.init(); });
    safeInit('AUTO_CATEGORIZER', function() { if (typeof AUTO_CATEGORIZER !== 'undefined') AUTO_CATEGORIZER.init(); });
    safeInit('APRENDIZADO', function() { if (typeof APRENDIZADO !== 'undefined') APRENDIZADO.init(); });

    if (typeof verificarArmazenamento === 'function') verificarArmazenamento();

    safeInit('AUTOMACAO', function() { if (typeof AUTOMACAO !== 'undefined') AUTOMACAO.init(); });
    safeInit('RENDER', function() { if (typeof RENDER !== 'undefined') RENDER.init(); });
    safeInit('CONFIG_USER', function() { 
      if (typeof CONFIG_USER !== 'undefined') {
        CONFIG_USER.init();
        if (CONFIG_USER.aplicarTema) CONFIG_USER.aplicarTema();
      }
    });

    if (typeof verificarPinAoAbrir === 'function') verificarPinAoAbrir();

    safeInit('APP_STORE', function() { if (typeof APP_STORE !== 'undefined') APP_STORE.init(); });
    safeInit('INIT_NAVIGATION', function() { if (typeof INIT_NAVIGATION !== 'undefined') INIT_NAVIGATION.init(); });
    safeInit('INIT_FORM', function() { if (typeof INIT_FORM !== 'undefined') INIT_FORM.init(); });
    safeInit('INIT_EXTRATO', function() { if (typeof INIT_EXTRATO !== 'undefined') INIT_EXTRATO.init(); });
    safeInit('INIT_CONFIG', function() { if (typeof INIT_CONFIG !== 'undefined') INIT_CONFIG.init(); });
    safeInit('INIT_MODALS', function() { if (typeof INIT_MODALS !== 'undefined') INIT_MODALS.init(); });
    // EVENT_INIT.setup() removido: INIT_NAVIGATION já registra todos os data-action handlers via delegação global

    if (!this._initialized) {
      this._setupPostInit();
      this._initialized = true;
    }
  },

  /**
   * Setup pós-inicialização (usado por ambos os modos)
   */
  _setupPostInit: function() {
    // Data default
    try {
      var dataInput = document.getElementById('novo-data');
      if (dataInput && !dataInput.value) {
        var hoje = new Date();
        var yyyy = hoje.getFullYear();
        var mm = String(hoje.getMonth() + 1).padStart(2, '0');
        var dd = String(hoje.getDate()).padStart(2, '0');
        dataInput.value = yyyy + '-' + mm + '-' + dd;
      }
    } catch (e) {
      console.warn('[BOOT] Erro ao setar data default:', e);
    }

    // Aviso migração PIN
    try {
      if (typeof DADOS !== 'undefined' && DADOS.getConfig && DADOS.salvarConfig) {
        var cfg = DADOS.getConfig();
        if (cfg && cfg._migracaoPinV2) {
          setTimeout(function() {
            if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
              UTILS.mostrarToast('Atualização de segurança aplicada. Recrie seu PIN nas Configurações.', 'warning');
            }
          }, 1000);
          DADOS.salvarConfig({ _migracaoPinV2: false });
        }
      }
    } catch (e) {
      console.warn('[BOOT] Erro ao verificar migração PIN:', e);
    }

    // Input bindings
    this._bindInputs();

    // Shortcuts
    if (typeof SHORTCUTS !== 'undefined') SHORTCUTS.init();

    // Backup
    if (typeof verificarBackupAutomatico === 'function') verificarBackupAutomatico();
    if (typeof atualizarBarraSessao === 'function') atualizarBarraSessao();

    console.log('[APP] FinançasPro pronto');
  },

  _bindInputs: function() {
    var bindOn = function(id, ev, fn) {
      var el = document.getElementById(id);
      if (el && typeof fn === 'function') el.addEventListener(ev, fn);
    };
    bindOn('extrato-busca', 'input', function() {
      if (typeof INIT_EXTRATO !== 'undefined') INIT_EXTRATO.filtrarExtrato();
    });
    bindOn('chk-darkmode', 'change', function() {
      if (typeof CONFIG_USER !== 'undefined') CONFIG_USER.toggleTema();
    });
    bindOn('chk-alerta-orc', 'change', function() {
      if (typeof toggleAlertaOrcamento === 'function') toggleAlertaOrcamento();
    });
    bindOn('chk-lembrete', 'change', function() {
      if (typeof toggleLembreteDiario === 'function') toggleLembreteDiario();
    });
    bindOn('chk-pin', 'change', function() {
      if (typeof togglePinSeguranca === 'function') togglePinSeguranca();
    });
  },

  setupAuth: function() {
    if (typeof setupAuthUI === 'function') setupAuthUI();
  },

  // Mantido para compatibilidade
  ativarApp: function() {
    return this._ativarAppLegado();
  }
};

// Permitir desativar lifecycle via query param (debug)
if (typeof window !== 'undefined') {
  var params = new URLSearchParams(window.location.search);
  if (params.get('lifecycle') === 'off') {
    APP_BOOTSTRAP._useLifecycle = false;
    console.log('[BOOT] Lifecycle manager desativado via query param');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = APP_