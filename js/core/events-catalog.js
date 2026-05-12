/**
 * events-catalog.js - Catálogo central de eventos
 * Namespace padronizado para evitar caos no event bus
 * 
 * Convenção: {dominio}:{acao}:{contexto?}
 * Exemplos:
 *   - transactions:created
 *   - transactions:updated:success
 *   - budget:limit:exceeded
 */

const EVENTS = {
  // ============================================================
  // DOMÍNIO: TRANSACTIONS
  // ============================================================
  TRANSACTIONS: {
    CREATED: 'transactions:created',
    UPDATED: 'transactions:updated',
    DELETED: 'transactions:deleted',
    SYNCED: 'transactions:synced',
    IMPORTED: 'transactions:imported',
    FILTERED: 'transactions:filtered'
  },

  // ============================================================
  // DOMÍNIO: BUDGET/ORÇAMENTO
  // ============================================================
  BUDGET: {
    UPDATED: 'budget:updated',
    LIMIT_EXCEEDED: 'budget:limit:exceeded',
    LIMIT_WARNING: 'budget:limit:warning',
    CALCULATED: 'budget:calculated'
  },

  // ============================================================
  // DOMÍNIO: AUTH
  // ============================================================
  AUTH: {
    LOGIN: 'auth:login',
    LOGOUT: 'auth:logout',
    SESSION_EXPIRED: 'auth:session:expired',
    TOKEN_REFRESH: 'auth:token:refresh'
  },

  // ============================================================
  // DOMÍNIO: UI/NAVIGATION
  // ============================================================
  UI: {
    TAB_CHANGED: 'ui:tab:changed',
    MODAL_OPENED: 'ui:modal:opened',
    MODAL_CLOSED: 'ui:modal:closed',
    THEME_CHANGED: 'ui:theme:changed',
    SCROLL_TO: 'ui:scroll:to'
  },

  // ============================================================
  // DOMÍNIO: RENDER
  // ============================================================
  RENDER: {
    REQUESTED: 'render:requested',
    COMPLETED: 'render:completed',
    DASHBOARD_UPDATED: 'render:dashboard:updated'
  },

  // ============================================================
  // DOMÍNIO: SYNC
  // ============================================================
  SYNC: {
    STARTED: 'sync:started',
    COMPLETED: 'sync:completed',
    FAILED: 'sync:failed',
    OFFLINE: 'sync:offline',
    ONLINE: 'sync:online'
  },

  // ============================================================
  // DOMÍNIO: FORM
  // ============================================================
  FORM: {
    SUBMITTED: 'form:submitted',
    VALIDATED: 'form:validated',
    ERROR: 'form:error',
    RESET: 'form:reset'
  },

  // ============================================================
  // UTILITÁRIO: VALIDAÇÃO DE EVENTOS
  // ============================================================
  
  /**
   * Verifica se um evento está no catálogo
   */
  isValid: function(eventName) {
    var allEvents = this._getAllEvents();
    return allEvents.includes(eventName);
  },

  /**
   * Lista todos os eventos registrados
   */
  listAll: function() {
    return this._getAllEvents();
  },

  /**
   * Obtém categoria de um evento
   */
  getCategory: function(eventName) {
    var parts = eventName.split(':');
    return parts[0] || 'unknown';
  },

  _getAllEvents: function() {
    var events = [];
    var domains = [
      this.TRANSACTIONS,
      this.BUDGET,
      this.AUTH,
      this.UI,
      this.RENDER,
      this.SYNC,
      this.FORM
    ];
    
    domains.forEach(function(domain) {
      for (var key in domain) {
        if (typeof domain[key] === 'string') {
          events.push(domain[key]);
        }
      }
    });
    
    return events;
  }
};

// ============================================================
// EVENT BUS COM CATALOGO (wrappers para validação)
// ============================================================

const EVENT_BUS_CATALOG = {
  _debug: false,

  /**
   * Emite evento com validação de catálogo
   */
  emit: function(eventName, data) {
    if (this._debug && !EVENTS.isValid(eventName)) {
      console.warn('[EVENT_BUS] Evento não catalogado:', eventName);
    }

    if (typeof EVENT_BUS !== 'undefined' && EVENT_BUS.emit) {
      EVENT_BUS.emit(eventName, data);
    }

    // Também dispara como CustomEvent no document
    var event = new CustomEvent(eventName, { detail: data });
    document.dispatchEvent(event);

    if (this._debug) {
      console.log('[EVENT]', eventName, data);
    }
  },

  /**
   * Assina evento com validação
   */
  on: function(eventName, callback) {
    if (!EVENTS.isValid(eventName)) {
      console.warn('[EVENT_BUS] Assinando evento não catalogado:', eventName);
    }

    var handler = function(e) {
      callback(e.detail, e);
    };

    document.addEventListener(eventName, handler);

    // Retorna função de unsubscribe
    return function() {
      document.removeEventListener(eventName, handler);
    };
  },

  /**
   * Assina uma vez
   */
  once: function(eventName, callback) {
    var unsubscribe = this.on(eventName, function(data, e) {
      callback(data, e);
      unsubscribe();
    });
    return unsubscribe;
  },

  setDebug: function(enabled) {
    this._debug = enabled;
  }
};

// Compatibilidade: expor globalmente
window.EVENTS = EVENTS;
window.EVENT_BUS_CATALOG = EVENT_BUS_CATALOG;

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EVENTS: EVENTS, EVENT_BUS_CATALOG: EVENT_BUS_CATALOG };
}
