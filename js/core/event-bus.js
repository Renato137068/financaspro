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
    // Falha fechada: sem mapa de handlers, `handlers[action]` estouraria a cada
    // clique dentro do container — um erro por clique, em silêncio, no console.
    if (!handlers || typeof handlers !== 'object') {
      if (this._debug) console.warn('[EVENT_BUS] Namespace sem handlers:', namespace);
      return false;
    }

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
    
    if (this._debug) console.warn('[EVENT_BUS] Namespace inicializado:', namespace);
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
          console.warn('[EVENT_BUS] Action executada:', namespace + '.' + action);
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
    
    if (this._debug) console.warn('[EVENT_BUS] Namespace limpo:', namespace);
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
    
    if (this._debug) console.warn('[EVENT_BUS] Namespace refreshed:', namespace);
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
    // --- FORMULÁRIO NOVO ---
  form: {
    'toggle-extras': function(ctx) {
      var panel = document.getElementById('extras-panel');
      var arrow = document.getElementById('extras-arrow');
      var btn = ctx.target;
      if (!panel) return;
      
      var isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
      if (arrow) arrow.classList.toggle('expanded', !isOpen);
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

    'toggle-filtros-avancados': function() {
      if (typeof INIT_EXTRATO !== 'undefined' && typeof INIT_EXTRATO.toggleFiltrosAvancados === 'function') {
        INIT_EXTRATO.toggleFiltrosAvancados();
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
    }
    
    
  },
  
  // --- ORÇAMENTO ---
  orcamento: {
    
    
    'editar-regra-503020': function() {
      if (typeof editarRegra503020 === 'function') editarRegra503020();
    }
    
  },
  
  // --- CONFIGURAÇÕES ---
    // --- DASHBOARD ---
  };

// ============================================================
// INICIALIZAÇÃO SIMPLIFICADA
// ============================================================

const EVENT_INIT = {
  setup: function() {
    // Limpar qualquer setup anterior
    EVENT_BUS.cleanupAll();
    
    // Inicializar namespaces
    // Só os namespaces que ainda têm handlers próprios.
    //
    // 'nav', 'dashboard' e 'config' foram removidos: todas as ações deles já
    // eram tratadas por INIT_NAVIGATION, no listener do document. Como o clique
    // borbulha do container até o document, os dois handlers viam o MESMO
    // evento e a ação rodava duas vezes — 'navegar-periodo' andava dois meses
    // por clique, 'toggle-graficos' abria e fechava o painel, 'exportar-excel'
    // baixava dois arquivos.
    //
    // O que sobrou aqui é o que só existe aqui: busca avançada, seleção em
    // massa e ordenação do extrato, além de toggle-extras e a grade de
    // categorias do formulário.
    EVENT_BUS.initNamespace('form', '#form-transacao', EVENT_HANDLERS.form);
    EVENT_BUS.initNamespace('extrato', '#aba-extrato', EVENT_HANDLERS.extrato);
    EVENT_BUS.initNamespace('orcamento', '#aba-orcamento', EVENT_HANDLERS.orcamento);
    
    console.warn('[EVENT_INIT] Eventos inicializados:', EVENT_BUS.getActiveNamespaces());
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
