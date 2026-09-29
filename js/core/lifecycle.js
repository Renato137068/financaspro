/**
 * lifecycle.js - Lifecycle manager para inicialização controlada
 * Registra módulos, gerencia dependências, retry, logs estruturados
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */

import { UTILS } from './utils.js';
import { DOMUTILS } from './domUtils.js';
import { AUTO_CATEGORIZER } from '../auto-categorizer.js';
import { CATEGORIES } from '../categories.js';
import { TRANSACOES } from '../transacoes.js';
import { ORCAMENTO } from '../orcamento.js';
import { RECORRENTES } from '../recorrentes.js';
import { CONTAS_PAGAR } from '../contas-pagar.js';
import { verificarBackupAutomatico } from '../services/healthService.js';
import { INSIGHT_ACOES } from '../modules/insight-acoes.js';
import { EVENT_INIT } from './event-bus.js';
import { SHORTCUTS } from '../shortcuts.js';
import { ALERTAS } from '../alertas.js';
import { INSIGHTS } from '../insights.js';
import { CONFIG_USER } from '../config-user.js';
import { RENDER_CORE } from '../render-core.js';
import { RENDER } from '../render.js';
import { INIT_NAVIGATION } from '../modules/init-navigation.js';
import { INIT_MODALS } from '../modules/init-modals.js';
import { verificarPinAoAbrir } from '../pin.js';
import { INIT_FORM } from '../modules/init-form.js';
import { BILLING } from '../billing.js';
import { setupAuthUI, atualizarBarraSessao, setupLogoutButton } from '../authController.js';
import { DAILY_REMINDER } from '../utilities/daily-reminder.js';
import { INIT_CONTAS_PAGAR } from '../modules/init-contas-pagar.js';
import { APP_STORE } from './store.js';
import { DADOS } from './dados.js';

const LIFECYCLE = {
  // Registro de módulos
  _modules: new Map(),
  _initialized: [],
  _failed: [],
  _profiling: {},
  _debug: false,
  _hooks: {
    beforeInit: [],
    afterInit: [],
    onError: []
  },

  // ============================================================
  // REGISTRO DE MÓDULOS
  // ============================================================

  /**
   * Registra um módulo para inicialização
   * @param {string} name - Nome do módulo
   * @param {Function} initFn - Função de inicialização
   * @param {Object} options - { depends, critical, retries, timeout }
   */
  register: function(name, initFn, options) {
    options = options || {};

    if (LIFECYCLE._modules.has(name)) {
      console.warn('[LIFECYCLE] Módulo já registrado:', name);
      return false;
    }

    LIFECYCLE._modules.set(name, {
      name: name,
      init: initFn,
      depends: options.depends || [],
      critical: options.critical !== false, // default true
      retries: options.retries || 1,
      timeout: options.timeout || 5000,
      initialized: false,
      error: null,
      attempts: 0,
      duration: 0
    });

    if (LIFECYCLE._debug) {
      console.warn('[LIFECYCLE] Registrado:', name, 'deps:', options.depends || []);
    }

    return true;
  },

  // ============================================================
  // INICIALIZAÇÃO ORQUESTRADA
  // ============================================================

  /**
   * Inicializa todos os módulos em ordem de dependência
   */
  init: function() {
    var self = LIFECYCLE;
    var startTime = performance.now();
    LIFECYCLE._initialized = [];
    LIFECYCLE._failed = [];

    console.warn('[LIFECYCLE] Iniciando orquestração...');

    // Executar hooks beforeInit
    LIFECYCLE._runHooks('beforeInit');

    // Resolver ordem de inicialização (topological sort)
    var order = LIFECYCLE._resolveOrder();

    if (!order) {
      return Promise.reject(new Error('Ciclo de dependências detectado!'));
    }

    // Inicializar sequencialmente usando Promise chain (ES5 compatible)
    var promise = Promise.resolve();
    order.forEach(function(name) {
      promise = promise.then(function() {
        return self._initModule(name);
      }).catch(function(e) {
        // Se módulo crítico falhou, interromper
        if (e.critical) {
          throw e;
        }
        // Se não crítico, continuar
        console.warn('[LIFECYCLE] Continuando após falha não-crítica em', name);
      });
    });

    return promise.then(function() {
      // Executar hooks afterInit
      self._runHooks('afterInit');

      var totalTime = (performance.now() - startTime).toFixed(2);
      console.warn('[LIFECYCLE] Concluído em', totalTime + 'ms');
      console.warn('[LIFECYCLE] Sucesso:', self._initialized.length, 'Falhas:', self._failed.length);

      return {
        success: self._initialized,
        failed: self._failed,
        duration: parseFloat(totalTime)
      };
    });
  },

  /**
   * Inicializa um módulo específico com retry
   */
  _initModule: function(name) {
    var self = LIFECYCLE;
    var module = LIFECYCLE._modules.get(name);
    if (!module || module.initialized) return Promise.resolve();

    // Verificar dependências - incluindo falhas prévias
    for (var i = 0; i < module.depends.length; i++) {
      var dep = module.depends[i];
      var depModule = LIFECYCLE._modules.get(dep);

      if (!depModule) {
        var error = 'Dependência não existe: ' + dep;
        LIFECYCLE._markFailed(module, error);
        return module.critical ? Promise.reject({ critical: true, error: error }) : Promise.resolve();
      }

      if (!depModule.initialized) {
        // Verificar se dependência falhou
        var depFailed = LIFECYCLE._failed.find(function(f) { return f.name === dep; });
        if (depFailed) {
          error = 'Dependência falhou: ' + dep + ' - ' + depFailed.error;
          LIFECYCLE._markFailed(module, error);
          return module.critical ? Promise.reject({ critical: true, error: error }) : Promise.resolve();
        }
        error = 'Dependência não inicializada: ' + dep;
        LIFECYCLE._markFailed(module, error);
        return module.critical ? Promise.reject({ critical: true, error: error }) : Promise.resolve();
      }
    }

    // Tentar inicializar
    var start = performance.now();

    function tryInit(attempt) {
      module.attempts = attempt;

      return new Promise(function(resolve, reject) {
        // Timeout controlado
        var timeoutId = setTimeout(function() {
          reject(new Error('Timeout após ' + module.timeout + 'ms'));
        }, module.timeout);

        // Executar init
        try {
          var result = module.init();
          // Suporta tanto sync quanto async
          Promise.resolve(result).then(function() {
            clearTimeout(timeoutId);
            resolve();
          }).catch(function(e) {
            clearTimeout(timeoutId);
            reject(e);
          });
        } catch (e) {
          clearTimeout(timeoutId);
          reject(e);
        }
      }).then(function() {
        // Sucesso
        module.duration = performance.now() - start;
        self._markSuccess(module);
        return Promise.resolve();
      }).catch(function(e) {
        // Falha - tentar novamente se houver retries
        console.warn('[LIFECYCLE] Tentativa', attempt, 'falhou para', name, ':', e.message || e);

        if (attempt < module.retries) {
          return self._delay(100 * attempt).then(function() {
            return tryInit(attempt + 1);
          });
        }

        // Esgotou tentativas
        module.duration = performance.now() - start;
        self._markFailed(module, 'Falhou após ' + module.retries + ' tentativas: ' + (e.message || e));
        return Promise.resolve();
      });
    }

    return tryInit(1);
  },

  _markSuccess: function(module) {
    module.initialized = true;
    module.error = null;
    LIFECYCLE._initialized.push(module.name);

    if (LIFECYCLE._debug) {
      console.warn('[LIFECYCLE] <i data-lucide="check"></i>', module.name, '(' + module.duration.toFixed(2) + 'ms)');
    }
  },

  _markFailed: function(module, error) {
    module.error = error;
    LIFECYCLE._failed.push({ name: module.name, error: error });

    // Executar hooks onError
    LIFECYCLE._runHooks('onError', { module: module.name, error: error });

    if (module.critical) {
      console.error('[LIFECYCLE] ✗ CRÍTICO:', module.name, '-', error);
      throw new Error('Falha crítica em ' + module.name + ': ' + error);
    } else {
      console.warn('[LIFECYCLE] ✗', module.name, '-', error, '(não crítico)');
    }
  },

  // ============================================================
  // RESOLUÇÃO DE DEPENDÊNCIAS
  // ============================================================

  _resolveOrder: function() {
    var visited = new Set();
    var temp = new Set();
    var result = [];
    var self = LIFECYCLE;

    var visit = function(name) {
      if (temp.has(name)) return false; // Ciclo detectado
      if (visited.has(name)) return true;

      var module = self._modules.get(name);
      if (!module) return false;

      temp.add(name);

      for (var i = 0; i < module.depends.length; i++) {
        if (!visit(module.depends[i])) return false;
      }

      temp.delete(name);
      visited.add(name);
      result.push(name);
      return true;
    };

    // ES5 compatible iteration
    var moduleNames = [];
    LIFECYCLE._modules.forEach(function(module, name) {
      moduleNames.push(name);
    });

    for (var i = 0; i < moduleNames.length; i++) {
      if (!visit(moduleNames[i])) return null;
    }

    return result;
  },

  // ============================================================
  // HOOKS
  // ============================================================

  beforeInit: function(fn) {
    LIFECYCLE._hooks.beforeInit.push(fn);
  },

  afterInit: function(fn) {
    LIFECYCLE._hooks.afterInit.push(fn);
  },

  onError: function(fn) {
    LIFECYCLE._hooks.onError.push(fn);
  },

  _runHooks: function(type, data) {
    LIFECYCLE._hooks[type].forEach(function(fn) {
      try {
        fn(data);
      } catch (e) {
        console.warn('[LIFECYCLE] Hook falhou:', e);
      }
    });
  },

  // ============================================================
  // UTILITÁRIOS
  // ============================================================

  _delay: function(ms) {
    return new Promise(function(resolve) {
      setTimeout(resolve, ms);
    });
  },

  setDebug: function(enabled) {
    LIFECYCLE._debug = enabled;
  },

  getStatus: function() {
    var status = {};
    LIFECYCLE._modules.forEach(function(module, name) {
      status[name] = {
        initialized: module.initialized,
        attempts: module.attempts,
        duration: module.duration,
        error: module.error
      };
    });
    return status;
  },

  isInitialized: function(name) {
    var module = LIFECYCLE._modules.get(name);
    return module ? module.initialized : false;
  }
};

// ============================================================
// REGISTROS PADRÃO DO SISTEMA
// ============================================================

const LIFECYCLE_BOOT = {
  registerDefaults: function() {
    // Core (sem dependências)
    LIFECYCLE.register('dom-utils', function() {
      if (typeof DOMUTILS !== 'undefined') DOMUTILS.init();
    }, { critical: true });

    LIFECYCLE.register('dados', function() {
      if (typeof DADOS !== 'undefined') return DADOS.init();
    }, { depends: ['dom-utils'], critical: true });

    LIFECYCLE.register('store', function() {
      if (typeof APP_STORE !== 'undefined') APP_STORE.init();
    }, { depends: ['dados'], critical: true });

    // Negócio (depende de core)
    LIFECYCLE.register('transacoes', function() {
      if (typeof TRANSACOES !== 'undefined') TRANSACOES.init();
    }, { depends: ['dados'], critical: true });

    LIFECYCLE.register('orcamento', function() {
      if (typeof ORCAMENTO !== 'undefined') ORCAMENTO.init();
    }, { depends: ['dados'], critical: false });

    LIFECYCLE.register('categorias', function() {
      if (typeof CATEGORIES !== 'undefined') CATEGORIES.init();
      if (typeof AUTO_CATEGORIZER !== 'undefined') AUTO_CATEGORIZER.init();
    }, { depends: ['dados'], critical: false });

    // UI (depende de negócio)
    LIFECYCLE.register('render-core', function() {
      // Render core é registrado automaticamente
    }, { depends: ['store'], critical: false });

    LIFECYCLE.register('event-bus', function() {
      if (typeof EVENT_INIT !== 'undefined') EVENT_INIT.setup();
    }, { depends: ['store'], critical: false });

    LIFECYCLE.register('init-modules', function() {
      if (typeof INIT_NAVIGATION !== 'undefined') INIT_NAVIGATION.init();
      if (typeof INIT_FORM !== 'undefined') INIT_FORM.init();
      if (typeof INIT_EXTRATO !== 'undefined') INIT_EXTRATO.init();
      if (typeof INIT_CONFIG !== 'undefined') INIT_CONFIG.init();
      if (typeof INSIGHT_ACOES !== 'undefined') INSIGHT_ACOES.init();
      if (typeof INIT_MODALS !== 'undefined') INIT_MODALS.init();
      if (typeof METAS !== 'undefined') METAS.init();
      if (typeof INIT_METAS !== 'undefined') INIT_METAS.init();
      if (typeof CONTAS_PAGAR !== 'undefined') CONTAS_PAGAR.init();
      if (typeof INIT_CONTAS_PAGAR !== 'undefined') INIT_CONTAS_PAGAR.init();
      if (typeof ASSINATURAS !== 'undefined') ASSINATURAS.init();
      if (typeof INIT_ASSINATURAS !== 'undefined') INIT_ASSINATURAS.init();
      if (typeof PATRIMONIO !== 'undefined') PATRIMONIO.init();
      if (typeof INIT_PATRIMONIO !== 'undefined') INIT_PATRIMONIO.init();
      if (typeof ANEXOS !== 'undefined') ANEXOS.init();
      if (typeof INIT_ANEXOS !== 'undefined') INIT_ANEXOS.init();
      if (typeof INIT_SIMULADOR !== 'undefined') INIT_SIMULADOR.init();
      if (typeof BILLING !== 'undefined') BILLING.init();
      if (typeof INIT_BILLING !== 'undefined') INIT_BILLING.init();
      if (typeof INIT_2FA !== 'undefined') INIT_2FA.init();
      if (typeof INIT_OPEN_FINANCE !== 'undefined') INIT_OPEN_FINANCE.init();
    }, { depends: ['event-bus', 'render-core'], critical: false });

    // Finalização
    LIFECYCLE.register('app-ready', function() {
      if (typeof RENDER !== 'undefined') RENDER.init();
      if (typeof CONFIG_USER !== 'undefined') CONFIG_USER.aplicarTema();
      if (typeof verificarPinAoAbrir === 'function') verificarPinAoAbrir();

      // Conecta store → RENDER_CORE para re-renders automáticos após mutações
      if (typeof RENDER_CORE !== 'undefined' && RENDER_CORE.connectToStore) {
        RENDER_CORE.connectToStore();
      }
    }, { depends: ['init-modules', 'transacoes'], critical: true });

    // Pós-init: data default, migração PIN, IA, shortcuts, onboarding
    LIFECYCLE.register('post-init', function() {
      // Data default no formulário
      var dataInput = document.getElementById('novo-data');
      if (dataInput && !dataInput.value) {
        var hoje = new Date();
        dataInput.value = [
          hoje.getFullYear(),
          String(hoje.getMonth() + 1).padStart(2, '0'),
          String(hoje.getDate()).padStart(2, '0')
        ].join('-');
      }

      // Aviso migração PIN (legado v1 → v2)
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

      // Shortcuts
      if (typeof SHORTCUTS !== 'undefined') SHORTCUTS.init();

      // Backup e sessão
      if (typeof verificarBackupAutomatico === 'function') verificarBackupAutomatico();
      // Modo Supabase: liga a tela de login (no modo local ela fica desativada).
      if (typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.isActive()
          && typeof setupAuthUI === 'function') {
        setupAuthUI();
      }
      if (typeof setupLogoutButton === 'function') setupLogoutButton();
      if (typeof atualizarBarraSessao === 'function') atualizarBarraSessao();

      // Onboarding (adiado para não competir com auth/PIN)
      setTimeout(function() {
        if (typeof ONBOARDING !== 'undefined' && ONBOARDING.iniciar) ONBOARDING.iniciar();
      }, 400);

      // Recorrentes devidas: o próprio cliente materializa, no modo local e na
      // nuvem Supabase (que não tem worker de recorrência — ver
      // RECORRENTES._ehModoLocal e docs/adr/0004). Só a API Express legada,
      // quando ativa, deixa o processo com o worker BullMQ.
      if (typeof RECORRENTES !== 'undefined' && RECORRENTES.processarNaAbertura) {
        try { RECORRENTES.processarNaAbertura(); } catch (e) {
          if (typeof OBS !== 'undefined' && OBS.captureError) {
            OBS.captureError(e, { contexto: 'lifecycle.recorrentes' });
          }
        }
      }

      // Lembrete diário (se ativo e permissão concedida)
      setTimeout(function() {
        if (typeof DAILY_REMINDER !== 'undefined') DAILY_REMINDER.maybeRemind();
        if (typeof CONTAS_PAGAR !== 'undefined') CONTAS_PAGAR.notificarVencimentos();
      }, 2500);

      // RISK-04: reconciliação Play perto do boot (Android + nuvem).
      // Carrega o chunk `conta` (PLAY_BILLING + INIT_BILLING) e força 1×/sessão
      // — não depende de o usuário abrir Config. RTDN continua primário.
      setTimeout(function() {
        try {
          if (typeof BILLING === 'undefined' || !BILLING.isCloudUser || !BILLING.isCloudUser()) return;
          var native = typeof window !== 'undefined' && window.Capacitor
            && typeof window.Capacitor.isNativePlatform === 'function'
            && window.Capacitor.isNativePlatform();
          if (!native) return;
          if (typeof INIT_NAVIGATION === 'undefined' || !INIT_NAVIGATION.carregarChunkConta) return;
          INIT_NAVIGATION.carregarChunkConta(function() {
            if (typeof INIT_BILLING !== 'undefined' && INIT_BILLING._reconciliarPlay) {
              INIT_BILLING._reconciliarPlay({ force: true });
            }
          });
        } catch (e) {
          if (typeof OBS !== 'undefined' && OBS.captureError) {
            OBS.captureError(e, { contexto: 'lifecycle.play-reconcile-boot' });
          }
        }
      }, 2800);

      // Fase 8: IA Nativa
      if (typeof ALERTAS !== 'undefined' && ALERTAS.init) ALERTAS.init();
      if (typeof PREVISAO !== 'undefined' && PREVISAO.init) PREVISAO.init();
      if (typeof INSIGHTS !== 'undefined' && INSIGHTS.mostrarOrcamento) {
        setTimeout(function() { INSIGHTS.mostrarOrcamento(); }, 200);
      }

      // Botão fechar painel de alertas
      var btnFecharAlertas = document.getElementById('btn-fechar-alertas');
      if (btnFecharAlertas) {
        btnFecharAlertas.addEventListener('click', function() {
          var s = document.getElementById('secao-alertas-painel');
          if (s) s.style.display = 'none';
        });
      }

      console.warn('[APP] FinançasPro pronto');
    }, { depends: ['app-ready'], critical: false });
  }
};

export { LIFECYCLE, LIFECYCLE_BOOT };
