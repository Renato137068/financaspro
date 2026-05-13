/**
 * event-bus.js - Sistema de eventos modularizado por domínio
 * Substitui delegação global excessiva por organização clara
 * 
 * Design:
 * - Eventos organizados por namespace (nav, form, extrato, etc)
 * - Delegação por container (não global)
 * - Cleanup automático
 * - Debuggável
 */

const EVENT_BUS = {
  // Registro de namespaces e seus handlers
  _namespaces: new Map(),
  _activeListeners: [],
  _debug: false,
  
  // ============================================================
  // API CORE
  // ============================================================
  
  /**
   * Inicializa um namespace com delegação em container específico
   * @param {string} namespace - Nome do domínio (ex: 'nav', 'form', 'extrato')
   * @param {string} containerSelector - Seletor do container (ex: '#main-content', '.nav-bottom')
   * @param {Object} handlers - Map de data-action -> handler function
   */
  initNamespace: function(namespace, containerSelector, handlers) {
    if (this._namespaces.has(namespace)) {
      this.cleanupNamespace(namespace);
    }
    
    var container = document.querySelector(containerSelector);
    if (!container) {
      if (this._debug) console.warn('[EVENT_BUS] Container não encontrado:', containerSelector);
      return false;
    }
    
    // Criar bound handler para este namespace
    var boundHandler = this._createHandler(namespace, handlers);
    
    // Registrar
    this._namespaces.set(namespace, {
      container: container,
      containerSelector: containerSelector,
      handlers: handlers,
      boundHandler: boundHandler,
      listenerAttached: false
    });
    
    // Attach listener
    container.addEventListener('click', boundHandler);
    this._activeListeners.push({ namespace: namespace, type: 'click' });
    
    if (this._debug) console.log('[EVENT_BUS] Namespace inicializado:', namespace);
    return true;
  },
  
  /**
   * Cria handler de delegação para um namespace
   */
  _createHandler: function(namespace, handlers) {
    var self = this;
    
    return function(event) {
      // Encontrar elemento com data-action
      var target = event.target.closest('[data-action]');
      if (!target) return;
      
      var action = target.dataset.action;
      var handler = handlers[action];
      
      if (!handler) return; // Não é nosso evento
      
      // Prevenir comportamento padrão se necessário
      if (target.tagName === 'BUTTON' || target.tagName === 'A') {
        event.preventDefault();
      }
      
      // Executar handler
      try {
        var context = {
          event: event,
          target: target,
          namespace: namespace,
          action: action,
          dataset: target.dataset
        };
        
        handler.call(target, context);
        
        if (self._debug) {
          console.log('[EVENT_BUS] Action executada:', namespace + '.' + action);
        }
      } catch (e) {
        console.error('[EVENT_BUS] Erro no handler:', namespace + '.' + action, e);
      }
    };
  },
  
  /**
   * Limpa todos os listeners de um namespace
   */
  cleanupNamespace: function(namespace) {
    var config = this._namespaces.get(namespace);
    if (!config) return;
    
    if (config.container && config.boundHandler) {
      config.container.removeEventListener('click', config.boundHandler);
    }
    
    this._activeListeners = this._activeListeners.filter(function(l) {
      return l.namespace !== namespace;
    });
    
    this._namespaces.delete(namespace);
    
    if (this._debug) console.log('[EVENT_BUS] Namespace limpo:', namespace);
  },
  
  /**
   * Limpa todos os namespaces
   */
  cleanupAll: function() {
    var self = this;
    this._namespaces.forEach(function(config, namespace) {
      self.cleanupNamespace(namespace);
    });
  },
  
  /**
   * Re-inicializa um namespace (útil após render dinâmico)
   */
  refreshNamespace: function(namespace) {
    var config = this._namespaces.get(namespace);
    if (!config) return false;
    
    // Re-encontrar container (pode ter sido recriado no DOM)
    var newContainer = document.querySelector(config.containerSelector);
    if (!newContainer) return false;
    
    // Remover listener antigo
    if (config.container && config.boundHandler) {
      config.container.removeEventListener('click', config.boundHandler);
    }
    
    // Criar novo bound handler
    var newHandler = this._createHandler(namespace, config.handlers);
    newContainer.addEventListener('click', newHandler);
    
    // Atualizar config
    config.container = newContainer;
    config.boundHandler = newHandler;
    
    if (this._debug) console.log('[EVENT_BUS] Namespace refreshed:', namespace);
    return true;
  },
  
  // ============================================================
  // UTILITÁRIOS
  // ============================================================
  
  setDebug: function(enabled) {
    this._debug = enabled;
  },
  
  getActiveNamespaces: function() {
    return Array.from(this._namespaces.keys());
  },
  
  isActive: function(namespace) {
    return this._namespaces.has(namespace);
  }
};

// ============================================================
// HANDLERS PRE-DEFINIDOS POR DOMÍNIO (Organização)
// ============================================================

const EVENT_HANDLERS = {
  // --- NAVEGAÇÃO ---
  nav: {
    'mudar-aba': function(ctx) {
      var aba = ctx.dataset.aba || ctx.target.dataset.aba;
      if (aba && typeof mudarAba === 'function') {
        mudarAba(aba);
      }
    }
  },
  
  // --- FORMULÁRIO NOVO ---
  form: {
    'toggle-extras': function(ctx) {
      var panel = document.getElementById('extras-panel');
      var arrow = document.getElementById('extras-arrow');
      var btn = ctx.target;
      if (!panel) return;
      
      var isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
      if (arrow) arrow.textContent = isOpen ? '▼' : '▲';
      btn.setAttribute('aria-expanded', String(!isOpen));
    },
    
    'selecionar-categoria': function(ctx) {
      var categoria = ctx.dataset.categoria;
      var tipo = ctx.dataset.tipo || 'despesa';
      
      // Atualizar visual
      document.querySelectorAll('.cat-btn').forEach(function(btn) {
        btn.classList.remove('ativo');
      });
      ctx.target.classList.add('ativo');
      
      // Atualizar input hidden
      var input = document.getElementById('novo-categoria');
      if (input) input.value = categoria;
      
      // Disparar evento customizado
      document.dispatchEvent(new CustomEvent('categoria:selecionada', {
        detail: { categoria: categoria, tipo: tipo }
      }));
    }
  },
  
  // --- EXTRATO ---
  extrato: {
    'navegar-periodo': function(ctx) {
      var dir = parseInt(ctx.dataset.dir || '0', 10);
      if (typeof INIT_EXTRATO !== 'undefined' && typeof INIT_EXTRATO.navegarPeriodo === 'function') {
        INIT_EXTRATO.navegarPeriodo(dir);
      }
    },
    
    'filtro-tipo': function(ctx) {
      var filtro = ctx.dataset.filtro || 'todos';
      if (typeof INIT_EXTRATO !== 'undefined' && typeof INIT_EXTRATO.setFiltroTipo === 'function') {
        INIT_EXTRATO.setFiltroTipo(filtro);
      }
    },
    
    'ordenar': function(ctx) {
      var ordenacao = ctx.dataset.ordenacao || 'data-desc';
      if (typeof INIT_EXTRATO !== 'undefined' && typeof INIT_EXTRATO.setOrdenacao === 'function') {
        INIT_EXTRATO.setOrdenacao(ordenacao);
      }
    },
    
    'limpar-filtros': function() {
      if (typeof INIT_EXTRATO !== 'undefined' && typeof INIT_EXTRATO.limparFiltros === 'function') {
        INIT_EXTRATO.limparFiltros();
      }
    },
    
    'abrir-busca-avancada': function() {
      var container = document.getElementById('busca-avancada-container');
      if (container) {
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
      }
    },
    
    'aplicar-busca-avancada': function() {
      if (typeof INIT_EXTRATO !== 'undefined' && typeof INIT_EXTRATO.aplicarBuscaAvancada === 'function') {
        INIT_EXTRATO.aplicarBuscaAvancada();
      }
    },
    
    'deletar-selecionados': function() {
      if (typeof INIT_EXTRATO !== 'undefined' && typeof INIT_EXTRATO.deletarSelecionados === 'function') {
        INIT_EXTRATO.deletarSelecionados();
      }
    },
    
    'cancelar-selecao': function() {
      if (typeof INIT_EXTRATO !== 'undefined' && typeof INIT_EXTRATO.cancelarSelecao === 'function') {
        INIT_EXTRATO.cancelarSelecao();
      }
    },
    
    'exportar-excel': function() {
      if (typeof INIT_EXTRATO !== 'undefined' && typeof INIT_EXTRATO.exportarExcel === 'function') {
        INIT_EXTRATO.exportarExcel();
      }
    },
    
    'exportar-pdf': function() {
      if (typeof INIT_EXTRATO !== 'undefined' && typeof INIT_EXTRATO.exportarExtrato === 'function') {
        INIT_EXTRATO.exportarExtrato();
      }
    }
  },
  
  // --- ORÇAMENTO ---
  orcamento: {
    'salvar-renda-orcamento': function() {
      if (typeof salvarRendaOrcamento === 'function') salvarRendaOrcamento();
    },
    
    'editar-renda-orcamento': function() {
      if (typeof editarRendaOrcamento === 'function') editarRendaOrcamento();
    },
    
    'editar-regra-503020': function() {
      if (typeof editarRegra503020 === 'function') editarRegra503020();
    },
    
    'toggle-detalhes-categorias': function() {
      if (typeof toggleDetalhesCategorias === 'function') toggleDetalhesCategorias();
    }
  },
  
  // --- CONFIGURAÇÕES ---
  config: {
    'abrir-editar-perfil': function() {
      if (typeof INIT_CONFIG !== 'undefined' && typeof INIT_CONFIG.abrirEditarPerfil === 'function') {
        INIT_CONFIG.abrirEditarPerfil();
      }
    },
    
    'abrir-editar-renda': function() {
      if (typeof abrirEditarRenda === 'function') abrirEditarRenda();
    },
    
    'abrir-config-bancos': function() {
      if (typeof INIT_CONFIG !== 'undefined' && typeof INIT_CONFIG.abrirConfigBancos === 'function') {
        INIT_CONFIG.abrirConfigBancos();
      }
    },
    
    'gerenciar-categorias': function(ctx) {
      var tipo = ctx.dataset.tipo;
      if (typeof abrirGerenciarCategorias === 'function') {
        abrirGerenciarCategorias(tipo);
      }
    },
    
    'exportar-dados': function() {
      if (typeof exportarDados === 'function') exportarDados();
    },
    
    'abrir-import': function() {
      var importInput = document.getElementById('import-file');
      if (importInput) importInput.click();
    },
    
    'abrir-changelog': function() {
      if (typeof abrirChangelog === 'function') abrirChangelog();
    },
    
    'abrir-feedback': function() {
      if (typeof abrirFeedback === 'function') abrirFeedback();
    },
    
    'limpar-dados': function() {
      if (typeof CONFIG_USER !== 'undefined' && CONFIG_USER.limparDados) {
        CONFIG_USER.limparDados();
      }
    }
  },
  
  // --- DASHBOARD ---
  dashboard: {
    'toggle-graficos': function() {
      var panel = document.getElementById('graficos-panel');
      var arrow = document.getElementById('graficos-arrow');
      var btn = document.getElementById('btn-graficos');
      if (!panel) return;
      
      var isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
      if (arrow) arrow.textContent = isOpen ? '▼' : '▲';
      if (btn) btn.setAttribute('aria-expanded', String(!isOpen));
    },
    
    'abrir-entrada-rapida': function() {
      if (typeof abrirEntradaRapida === 'function') abrirEntradaRapida();
    }
  }
};

// ============================================================
// INICIALIZAÇÃO SIMPLIFICADA
// ============================================================

const EVENT_INIT = {
  setup: function() {
    // Limpar qualquer setup anterior
    EVENT_BUS.cleanupAll();
    
    // Inicializar namespaces
    EVENT_BUS.initNamespace('nav', '.nav-bottom', EVENT_HANDLERS.nav);
    EVENT_BUS.initNamespace('dashboard', '#main-content', EVENT_HANDLERS.dashboard);
    EVENT_BUS.initNamespace('form', '#form-transacao', EVENT_HANDLERS.form);
    EVENT_BUS.initNamespace('extrato', '#aba-extrato', EVENT_HANDLERS.extrato);
    EVENT_BUS.initNamespace('orcamento', '#aba-orcamento', EVENT_HANDLERS.orcamento);
    EVENT_BUS.initNamespace('config', '#aba-config', EVENT_HANDLERS.config);
    
    console.log('[EVENT_INIT] Eventos inicializados:', EVENT_BUS.getActiveNamespaces());
  },
  
  refresh: function(namespace) {
    if (namespace) {
      EVENT_BUS.refreshNamespace(namespace);
    } else {
      // Refresh todos
      EVENT_BUS.getActiveNamespaces().forEach(function(ns) {
        EVENT_BUS.refreshNamespace(ns);
      });
    }
  }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EVENT_BUS: EVENT_BUS, EVENT_HANDLERS: EVENT_HANDLERS, EVENT_INIT: EVENT_INIT };
}
