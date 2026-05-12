/**
 * store-unified.js - Store unificada: fonte única de verdade
 * Consolida APP_STATE + APP_STORE em uma única store
 * Design: Path-based state com subscribers e persistência seletiva
 * 
 * Estrutura de estado:
 * - dados: { transacoes, contas, config, sessao }  // Dados da aplicação
 * - ui: { abaAtiva, filtros, formulario }           // Estado da interface
 * - cache: { transacoes, config, orcamentos }         // Cache temporário
 * - sync: { online, pending, lastSyncAt }           // Estado de sincronização
 */

const APP_STORE = {
  // ============================================================
  // ESTADO INTERNO
  // ============================================================

  _state: {
    // Dados da aplicação (não persistido automaticamente - DADOS gerencia)
    // NOTA: transacoes/contas/config não são armazenados aqui para evitar
    // duplicação. Use DADOS.getTransacoes() etc. para ler. Os campos *Ver
    // são contadores de versão: subscribers os observam para saber quando
    // re-ler da fonte de verdade (localStorage via DADOS).
    dados: {
      sessao: { token: null, user: null },
      transacoesVer: 0,
      configVer: 0,
      contasVer: 0,
      orcamentosVer: 0
    },
    
    // Estado da UI (persistido no localStorage)
    ui: {
      abaAtiva: 'resumo',
      filtros: {
        tipo: 'todos',
        categoria: null,
        busca: '',
        mesOffset: 0
      },
      formulario: {
        editId: null,
        dadosRascunho: {}
      }
    },
    
    // Cache temporário (não persistido)
    cache: {
      transacoes: null,
      config: null,
      orcamentos: null,
      ultimaAtualizacao: null
    },
    
    // Estado de sincronização
    sync: {
      online: false,
      pending: false,
      lastSyncAt: null
    }
  },
  
  _subscribers: new Map(),
  _initialized: false,
  _autoSaveInterval: null,
  _subscriberIdCounter: 0,

  // ---- Sistema de ações ----
  _actionHandlers: {},
  _actionLog: [],
  _actionLogMaxSize: 50,
  
  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================
  
  init: function() {
    if (this._initialized) return;
    
    this._carregarUIPersistido();
    this._setupAutoSave();
    this._initialized = true;
    
    console.log('[APP_STORE] Inicializado');
  },
  
  // ============================================================
  // API CORE: GET / SET / SUBSCRIBE
  // ============================================================
  
  /**
   * Obtém valor do estado por path
   * @param {string} path - Caminho (ex: 'dados.transacoes', 'ui.abaAtiva')
   * @returns {*} Valor clonado
   */
  get: function(path) {
    if (!path) return this._clone(this._state);
    
    var keys = path.split('.');
    var value = this._state;
    
    for (var i = 0; i < keys.length; i++) {
      if (value && typeof value === 'object' && keys[i] in value) {
        value = value[keys[i]];
      } else {
        return undefined;
      }
    }
    
    return this._clone(value);
  },
  
  /**
   * Define valor no estado
   * @param {string} path - Caminho da propriedade
   * @param {*} value - Novo valor
   * @param {Object} options - Opções { silent: false, persist: 'auto' }
   * @returns {*} Valor definido
   */
  set: function(path, value, options) {
    options = options || {};
    
    var keys = path.split('.');
    var target = this._state;
    
    // Navegar até o objeto pai
    for (var i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in target) || typeof target[keys[i]] !== 'object') {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }
    
    var key = keys[keys.length - 1];
    var oldValue = this._clone(target[key]);
    var newValue = this._clone(value);
    
    target[key] = newValue;
    
    // Notificar subscribers (a menos que silent)
    if (!options.silent) {
      this._notify(path, newValue, oldValue);
    }
    
    // Persistir se necessário
    var shouldPersist = options.persist === true || 
                       (options.persist !== false && path.startsWith('ui.'));
    if (shouldPersist) {
      this._persistirUI();
    }
    
    return newValue;
  },
  
  /**
   * Atualiza múltiplos campos de uma vez
   * @param {Object} patch - Objeto com paths e valores
   * @param {Object} options - Opções
   */
  patch: function(patch, options) {
    var self = this;
    Object.keys(patch).forEach(function(path) {
      self.set(path, patch[path], Object.assign({}, options, { silent: true }));
    });
    if (!options || !options.silent) {
      this._notify('*', this._clone(this._state), null);
    }
    return this.get();
  },
  
  /**
   * Assina mudanças em um caminho
   * @param {string} path - Caminho para observar ('*' para todos)
   * @param {Function} callback - (newValue, oldValue, path) => void
   * @returns {Function} Unsubscribe
   */
  subscribe: function(path, callback) {
    if (typeof callback !== 'function') return function() {};
    
    // ID sequencial + timestamp para evitar colisão
    this._subscriberIdCounter++;
    var id = Date.now() + '_' + this._subscriberIdCounter + '_' + Math.random().toString(36).substr(2, 5);
    this._subscribers.set(id, { path: path || '*', callback: callback, active: true });
    
    // Retornar função de unsubscribe
    var self = this;
    return function() {
      var sub = self._subscribers.get(id);
      if (sub) sub.active = false;
      self._subscribers.delete(id);
    };
  },
  
  /**
   * Assina mudanças uma única vez
   * @param {string} path - Caminho
   * @param {Function} callback - Chamado uma vez quando mudar
   * @param {Function} condition - (value) => boolean, quando verificar
   */
  once: function(path, callback, condition) {
    var self = this;
    var unsubscribe = this.subscribe(path, function(newVal, oldVal, changedPath) {
      if (!condition || condition(newVal)) {
        callback(newVal, oldVal, changedPath);
        unsubscribe();
      }
    });
    return unsubscribe;
  },
  
  // ============================================================
  // SISTEMA DE AÇÕES (fluxo unidirecional)
  // ============================================================

  /**
   * Registra handler para um tipo de ação.
   * @param {string} actionType - Constante de ACTIONS
   * @param {Function} handler - (payload) => void | Promise
   */
  registerActionHandler: function(actionType, handler) {
    this._actionHandlers[actionType] = handler;
  },

  /**
   * Ponto único de mutação: todas as mudanças de dados passam por aqui.
   * @param {string} actionType - Tipo da ação (use constantes de ACTIONS)
   * @param {*} payload - Dados da ação
   * @returns {*} Retorno do handler (pode ser Promise)
   */
  dispatch: function(actionType, payload) {
    // Registrar no log circular
    this._actionLog.push({ type: actionType, payload: payload, time: Date.now() });
    if (this._actionLog.length > this._actionLogMaxSize) {
      this._actionLog.shift();
    }

    var handler = this._actionHandlers[actionType];
    if (!handler) {
      // Ação sem handler: notifica subscribers para compatibilidade futura
      this._notify('action:' + actionType, payload, null);
      return;
    }

    try {
      var result = handler(payload);
      if (result && typeof result.then === 'function') {
        return result.catch(function(e) {
          console.error('[APP_STORE] Erro em ação async:', actionType, e);
          throw e;
        });
      }
      return result;
    } catch (e) {
      console.error('[APP_STORE] Erro em ação:', actionType, e);
      throw e;
    }
  },

  /**
   * Leitura derivada: aplica uma função de seleção sobre o estado interno.
   * Não duplica dados — apenas projeta o que o caller precisa.
   * @param {Function} selectorFn - (state) => valor derivado
   * @returns {*}
   */
  select: function(selectorFn) {
    return selectorFn(this._clone(this._state));
  },

  /**
   * Retorna cópia do log de ações (últimas N ações).
   * Útil para debug: APP_STORE.getActionLog()
   */
  getActionLog: function() {
    return this._actionLog.slice();
  },

  // ============================================================
  // PERSISTÊNCIA
  // ============================================================
  
  _persistirUI: function() {
    try {
      // Clonar para evitar referência direta e corrupção
      var estadoParaSalvar = {
        ui: this._clone(this._state.ui),
        timestamp: Date.now()
      };
      localStorage.setItem('fp-store-v2', JSON.stringify(estadoParaSalvar));
    } catch (e) {
      console.warn('[APP_STORE] Erro ao persistir:', e);
    }
  },
  
  _carregarUIPersistido: function() {
    try {
      var salvo = localStorage.getItem('fp-store-v2');
      if (salvo) {
        var estado = JSON.parse(salvo);
        // Validar se não é muito antigo (7 dias)
        if (estado.timestamp && (Date.now() - estado.timestamp) < 7 * 24 * 60 * 60 * 1000) {
          if (estado.ui && typeof estado.ui === 'object') {
            // Deep merge para preservar estrutura padrão
            this._state.ui = this._deepMerge(this._state.ui, estado.ui);
          }
        } else {
          console.log('[APP_STORE] Estado persistido expirado (>7 dias)');
        }
      }
    } catch (e) {
      console.warn('[APP_STORE] Erro ao carregar estado:', e);
    }
  },

  /**
   * Deep merge simples para objetos
   */
  _deepMerge: function(target, source) {
    var result = this._clone(target);
    for (var key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = result[key] && typeof result[key] === 'object' 
            ? this._deepMerge(result[key], source[key]) 
            : this._clone(source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    return result;
  },
  
  _setupAutoSave: function() {
    // Limpar interval anterior se existir (evita múltiplos intervals)
    if (this._autoSaveInterval) {
      clearInterval(this._autoSaveInterval);
    }
    var self = this;
    this._autoSaveInterval = setInterval(function() {
      self._persistirUI();
    }, 30000); // Auto-save a cada 30s
  },

  /**
   * Para auto-save (útil para logout)
   */
  stopAutoSave: function() {
    if (this._autoSaveInterval) {
      clearInterval(this._autoSaveInterval);
      this._autoSaveInterval = null;
    }
  },
  
  // ============================================================
  // NOTIFICAÇÃO
  // ============================================================
  
  _notify: function(path, newValue, oldValue) {
    var self = this;
    this._subscribers.forEach(function(sub, id) {
      // Pular se unsubscribed
      if (!sub.active) return;
      
      var shouldNotify = sub.path === '*' || 
                         path === sub.path || 
                         path.startsWith(sub.path + '.') ||
                         sub.path.startsWith(path + '.');
      
      if (shouldNotify) {
        try {
          sub.callback(newValue, oldValue, path);
        } catch (e) {
          console.warn('[APP_STORE] Erro no subscriber:', e);
          // Marcar como inativo se der erro para não repetir
          sub.active = false;
        }
      }
    });
  },
  
  // ============================================================
  // UTILITÁRIOS
  // ============================================================
  
  _clone: function(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  },
  
  /**
   * Obtém snapshot completo (para debug)
   */
  snapshot: function() {
    return this._clone(this._state);
  },
  
  /**
   * Reseta estado para padrões
   */
  reset: function() {
    this._state.ui = {
      abaAtiva: 'resumo',
      filtros: { tipo: 'todos', categoria: null, busca: '', mesOffset: 0 },
      formulario: { editId: null, dadosRascunho: {} }
    };
    this._state.cache = { transacoes: null, config: null, orcamentos: null, ultimaAtualizacao: null };
    this._persistirUI();
    this._notify('*', this._clone(this._state), null);
  },
  
  // ============================================================
  // API ESPECÍFICA: DADOS (compatibilidade com APP_STATE)
  // ============================================================
  
  /**
   * Sincroniza sessão do módulo DADOS para a store.
   * Transações/contas/config vivem em localStorage (DADOS) — não duplicamos aqui.
   * Subscribers observam os campos *Ver para saber quando re-ler de DADOS.
   */
  hydrateFromDados: function() {
    if (typeof DADOS === 'undefined') return this.get();

    return this.patch({
      'dados.sessao': DADOS.getSessao ? DADOS.getSessao() : { token: null, user: null }
    }, { silent: true });
  },
  
  // ============================================================
  // API ESPECÍFICA: UI
  // ============================================================
  
  ui: {
    setAba: function(aba) {
      APP_STORE.set('ui.abaAtiva', aba);
    },
    getAba: function() {
      return APP_STORE.get('ui.abaAtiva');
    },
    
    setFiltro: function(tipo, valor) {
      APP_STORE.set('ui.filtros.' + tipo, valor);
    },
    getFiltros: function() {
      return APP_STORE.get('ui.filtros');
    },
    limparFiltros: function() {
      APP_STORE.set('ui.filtros', { tipo: 'todos', categoria: null, busca: '', mesOffset: 0 });
    }
  },
  
  // ============================================================
  // API ESPECÍFICA: FORMULÁRIO
  // ============================================================
  
  form: {
    setRascunho: function(dados) {
      APP_STORE.set('ui.formulario.dadosRascunho', dados);
    },
    getRascunho: function() {
      return APP_STORE.get('ui.formulario.dadosRascunho') || {};
    },
    setEdicao: function(id) {
      APP_STORE.set('ui.formulario.editId', id);
    },
    getEdicao: function() {
      return APP_STORE.get('ui.formulario.editId');
    },
    limpar: function() {
      APP_STORE.set('ui.formulario', { editId: null, dadosRascunho: {} });
    }
  },
  
  // ============================================================
  // API ESPECÍFICA: CACHE
  // ============================================================
  
  cache: {
    set: function(tipo, dados) {
      APP_STORE.set('cache.' + tipo, dados, { persist: false });
      APP_STORE.set('cache.ultimaAtualizacao', Date.now(), { persist: false });
    },
    get: function(tipo, maxAgeMs) {
      var ultima = APP_STORE.get('cache.ultimaAtualizacao');
      if (maxAgeMs && ultima && (Date.now() - ultima) > maxAgeMs) {
        return null;
      }
      return APP_STORE.get('cache.' + tipo);
    },
    invalidar: function(tipo) {
      if (tipo) {
        APP_STORE.set('cache.' + tipo, null, { persist: false });
      } else {
        APP_STORE.set('cache', { transacoes: null, config: null, orcamentos: null, ultimaAtualizacao: null }, { persist: false });
      }
    }
  },
  
  // ============================================================
  // API ESPECÍFICA: SYNC
  // ============================================================
  
  sync: {
    setOnline: function(online) {
      APP_STORE.set('sync.online', online, { persist: false });
    },
    setPending: function(pending) {
      APP_STORE.set('sync.pending', pending, { persist: false });
    },
    setLastSync: function(timestamp) {
      APP_STORE.set('sync.lastSyncAt', timestamp, { persist: false });
    },
    getStatus: function() {
      return APP_STORE.get('sync');
    }
  }
};

// ============================================================
// ADAPTADOR DE COMPATIBILIDADE: APP_STATE
// Mantém API antiga funcionando, mas delega para APP_STORE
// ============================================================

var APP_STATE = {
  // Delega diretamente para APP_STORE com API compatível
  
  getState: function() {
    // Lê da fonte de verdade (localStorage via DADOS) para compatibilidade
    var dadosRef = typeof DADOS !== 'undefined' ? DADOS : null;
    return {
      transacoes: dadosRef && dadosRef.getTransacoes ? dadosRef.getTransacoes() : [],
      contas: dadosRef && dadosRef.getContas ? dadosRef.getContas() : [],
      config: dadosRef && dadosRef.getConfig ? dadosRef.getConfig() : {},
      sessao: APP_STORE.get('dados.sessao') || { token: null, user: null },
      sync: APP_STORE.get('sync') || { online: false, pending: false, lastSyncAt: null }
    };
  },

  setState: function(patch) {
    // Mantém compatibilidade: apenas sessao e sync vivem no store
    var newPatch = {};
    if (patch.sessao !== undefined) newPatch['dados.sessao'] = patch.sessao;
    if (patch.sync !== undefined) newPatch['sync'] = patch.sync;

    if (Object.keys(newPatch).length > 0) {
      APP_STORE.patch(newPatch, { persist: false });
    }
    // transacoes/contas/config: fonte da verdade é localStorage (DADOS)
    // Notificamos via contadores de versão, não copiando os dados
  },
  
  subscribe: function(listener) {
    // Subscribe genérico que notifica em qualquer mudança de dados
    return APP_STORE.subscribe('dados', listener);
  },
  
  hydrateFromDados: function() {
    return APP_STORE.hydrateFromDados();
  }
};

// Export para módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { APP_STORE: APP_STORE, APP_STATE: APP_STATE };
}
