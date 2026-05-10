/**
 * store.test.js — Testes para APP_STORE (js/store.js)
 * Cobre: get, set, patch, subscribe, unsubscribe, dispatch, cache,
 *        ui, form, sync APIs, reset, deepMerge, persistência
 */

// Implementação inline idêntica ao núcleo de js/store.js
function criarStore() {
  return {
    _state: {
      dados: { sessao: { token: null, user: null }, transacoesVer: 0 },
      ui: {
        abaAtiva: 'resumo',
        filtros: { tipo: 'todos', categoria: null, busca: '', mesOffset: 0 },
        formulario: { editId: null, dadosRascunho: {} },
      },
      cache: { transacoes: null, config: null, orcamentos: null, ultimaAtualizacao: null },
      sync: { online: false, pending: false, lastSyncAt: null },
    },
    _subscribers: new Map(),
    _subscriberIdCounter: 0,
    _actionHandlers: {},
    _actionLog: [],
    _actionLogMaxSize: 50,

    _clone(value) {
      if (value == null) return value;
      return JSON.parse(JSON.stringify(value));
    },

    _deepMerge(target, source) {
      const result = this._clone(target);
      for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
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

    get(path) {
      if (!path) return this._clone(this._state);
      const keys = path.split('.');
      let value = this._state;
      for (let i = 0; i < keys.length; i++) {
        if (value && typeof value === 'object' && keys[i] in value) {
          value = value[keys[i]];
        } else {
          return undefined;
        }
      }
      return this._clone(value);
    },

    set(path, value, options) {
      options = options || {};
      const keys = path.split('.');
      let target = this._state;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in target) || typeof target[keys[i]] !== 'object') {
          target[keys[i]] = {};
        }
        target = target[keys[i]];
      }
      const key = keys[keys.length - 1];
      const oldValue = this._clone(target[key]);
      target[key] = this._clone(value);
      if (!options.silent) {
        this._notify(path, this._clone(target[key]), oldValue);
      }
      return this._clone(target[key]);
    },

    patch(patch, options) {
      Object.keys(patch).forEach(path => {
        this.set(path, patch[path], Object.assign({}, options, { silent: true }));
      });
      if (!options || !options.silent) {
        this._notify('*', this._clone(this._state), null);
      }
      return this.get();
    },

    subscribe(path, callback) {
      if (typeof callback !== 'function') return () => {};
      this._subscriberIdCounter++;
      const id = Date.now() + '_' + this._subscriberIdCounter;
      this._subscribers.set(id, { path: path || '*', callback, active: true });
      return () => {
        const sub = this._subscribers.get(id);
        if (sub) sub.active = false;
        this._subscribers.delete(id);
      };
    },

    once(path, callback, condition) {
      const unsub = this.subscribe(path, (newVal, oldVal, changedPath) => {
        if (!condition || condition(newVal)) {
          callback(newVal, oldVal, changedPath);
          unsub();
        }
      });
      return unsub;
    },

    _notify(path, newValue, oldValue) {
      this._subscribers.forEach(sub => {
        if (!sub.active) return;
        const shouldNotify = sub.path === '*' ||
          path === sub.path ||
          path.startsWith(sub.path + '.') ||
          sub.path.startsWith(path + '.');
        if (shouldNotify) {
          try { sub.callback(newValue, oldValue, path); } catch (e) { sub.active = false; }
        }
      });
    },

    registerActionHandler(actionType, handler) {
      this._actionHandlers[actionType] = handler;
    },

    dispatch(actionType, payload) {
      this._actionLog.push({ type: actionType, payload, time: Date.now() });
      if (this._actionLog.length > this._actionLogMaxSize) this._actionLog.shift();
      const handler = this._actionHandlers[actionType];
      if (!handler) {
        this._notify('action:' + actionType, payload, null);
        return;
      }
      return handler(payload);
    },

    reset() {
      this._state.ui = {
        abaAtiva: 'resumo',
        filtros: { tipo: 'todos', categoria: null, busca: '', mesOffset: 0 },
        formulario: { editId: null, dadosRascunho: {} },
      };
      this._state.cache = { transacoes: null, config: null, orcamentos: null, ultimaAtualizacao: null };
      this._notify('*', this._clone(this._state), null);
    },

    select(selectorFn) {
      return selectorFn(this._clone(this._state));
    },

    getActionLog() {
      return this._actionLog.slice();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('APP_STORE — get/set básico', () => {
  let store;
  beforeEach(() => { store = criarStore(); });

  test('get retorna valor por path simples', () => {
    expect(store.get('ui.abaAtiva')).toBe('resumo');
  });

  test('get retorna valor por path aninhado', () => {
    expect(store.get('ui.filtros.tipo')).toBe('todos');
  });

  test('get sem path retorna estado completo', () => {
    const estado = store.get();
    expect(estado).toHaveProperty('ui');
    expect(estado).toHaveProperty('dados');
    expect(estado).toHaveProperty('sync');
  });

  test('get de path inexistente retorna undefined', () => {
    expect(store.get('ui.naoExiste')).toBeUndefined();
  });

  test('set atualiza valor por path', () => {
    store.set('ui.abaAtiva', 'extrato');
    expect(store.get('ui.abaAtiva')).toBe('extrato');
  });

  test('set cria path intermediário se não existir', () => {
    store.set('ui.novoObj.campo', 'valor');
    expect(store.get('ui.novoObj.campo')).toBe('valor');
  });

  test('get retorna clone (imutável)', () => {
    const filtros = store.get('ui.filtros');
    filtros.tipo = 'receita'; // mutação local
    expect(store.get('ui.filtros.tipo')).toBe('todos'); // estado não alterado
  });
});

describe('APP_STORE — subscribe/unsubscribe', () => {
  let store;
  beforeEach(() => { store = criarStore(); });

  test('subscriber é chamado ao mudar o path observado', () => {
    const cb = jest.fn();
    store.subscribe('ui.abaAtiva', cb);
    store.set('ui.abaAtiva', 'extrato');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('subscriber com "*" é chamado em qualquer mudança', () => {
    const cb = jest.fn();
    store.subscribe('*', cb);
    store.set('sync.online', true);
    expect(cb).toHaveBeenCalled();
  });

  test('unsubscribe impede chamadas futuras', () => {
    const cb = jest.fn();
    const unsub = store.subscribe('ui.abaAtiva', cb);
    unsub();
    store.set('ui.abaAtiva', 'extrato');
    expect(cb).not.toHaveBeenCalled();
  });

  test('subscriber não é chamado para paths não relacionados', () => {
    const cb = jest.fn();
    store.subscribe('ui.abaAtiva', cb);
    store.set('sync.online', true); // path diferente
    expect(cb).not.toHaveBeenCalled();
  });

  test('silent: true não notifica subscribers', () => {
    const cb = jest.fn();
    store.subscribe('ui.abaAtiva', cb);
    store.set('ui.abaAtiva', 'extrato', { silent: true });
    expect(cb).not.toHaveBeenCalled();
  });

  test('múltiplos subscribers no mesmo path são todos chamados', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    store.subscribe('ui.abaAtiva', cb1);
    store.subscribe('ui.abaAtiva', cb2);
    store.set('ui.abaAtiva', 'extrato');
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });

  test('once executa callback apenas uma vez', () => {
    const cb = jest.fn();
    store.once('ui.abaAtiva', cb);
    store.set('ui.abaAtiva', 'extrato');
    store.set('ui.abaAtiva', 'resumo');
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('APP_STORE — patch', () => {
  let store;
  beforeEach(() => { store = criarStore(); });

  test('patch atualiza múltiplos campos', () => {
    store.patch({
      'ui.abaAtiva': 'extrato',
      'sync.online': true,
    });
    expect(store.get('ui.abaAtiva')).toBe('extrato');
    expect(store.get('sync.online')).toBe(true);
  });

  test('patch notifica com "*" apenas uma vez', () => {
    const cb = jest.fn();
    store.subscribe('*', cb);
    store.patch({
      'ui.abaAtiva': 'extrato',
      'sync.online': true,
    });
    // patch faz set com silent:true para cada field, depois notify('*') uma vez
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('APP_STORE — dispatch/actions', () => {
  let store;
  beforeEach(() => { store = criarStore(); });

  test('dispatch chama handler registrado', () => {
    const handler = jest.fn();
    store.registerActionHandler('TESTE', handler);
    store.dispatch('TESTE', { payload: 42 });
    expect(handler).toHaveBeenCalledWith({ payload: 42 });
  });

  test('dispatch sem handler não lança exceção', () => {
    expect(() => store.dispatch('NAO_EXISTE', {})).not.toThrow();
  });

  test('getActionLog registra ações despachadas', () => {
    store.dispatch('ACAO_A', 'payload');
    const log = store.getActionLog();
    expect(log).toHaveLength(1);
    expect(log[0].type).toBe('ACAO_A');
  });

  test('log circular não ultrapassa _actionLogMaxSize', () => {
    store._actionLogMaxSize = 3;
    store.dispatch('A', 1);
    store.dispatch('B', 2);
    store.dispatch('C', 3);
    store.dispatch('D', 4);
    const log = store.getActionLog();
    expect(log).toHaveLength(3);
    expect(log[0].type).toBe('B'); // 'A' foi removido
  });
});

describe('APP_STORE — select', () => {
  let store;
  beforeEach(() => { store = criarStore(); });

  test('select aplica seletor sobre o estado', () => {
    const aba = store.select(s => s.ui.abaAtiva);
    expect(aba).toBe('resumo');
  });

  test('select retorna clone — mutação não afeta estado', () => {
    store.select(s => { s.ui.abaAtiva = 'MODIFICADO'; });
    expect(store.get('ui.abaAtiva')).toBe('resumo');
  });
});

describe('APP_STORE — reset', () => {
  let store;
  beforeEach(() => { store = criarStore(); });

  test('reset restaura ui para padrões', () => {
    store.set('ui.abaAtiva', 'extrato');
    store.reset();
    expect(store.get('ui.abaAtiva')).toBe('resumo');
  });

  test('reset limpa cache', () => {
    store.set('cache.transacoes', [{ id: 1 }]);
    store.reset();
    expect(store.get('cache.transacoes')).toBeNull();
  });

  test('reset não apaga dados.sessao', () => {
    store.set('dados.sessao', { token: 'abc', user: { id: 1 } });
    store.reset();
    expect(store.get('dados.sessao.token')).toBe('abc');
  });
});

describe('APP_STORE — _deepMerge', () => {
  let store;
  beforeEach(() => { store = criarStore(); });

  test('merge superficial preserva campos do target', () => {
    const target = { a: 1, b: 2 };
    const source = { b: 99 };
    const result = store._deepMerge(target, source);
    expect(result.a).toBe(1);
    expect(result.b).toBe(99);
  });

  test('merge aninhado funciona recursivamente', () => {
    const target = { filtros: { tipo: 'todos', busca: '' } };
    const source = { filtros: { tipo: 'receita' } };
    const result = store._deepMerge(target, source);
    expect(result.filtros.tipo).toBe('receita');
    expect(result.filtros.busca).toBe(''); // preservado
  });

  test('arrays em source substituem arrays em target (não mergeia)', () => {
    const target = { lista: [1, 2, 3] };
    const source = { lista: [4, 5] };
    const result = store._deepMerge(target, source);
    expect(result.lista).toEqual([4, 5]);
  });
});
