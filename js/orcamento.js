/**
 * orcamento.js - Budget Management
 * Tier 1: Depends on config.js, dados.js, utils.js, transacoes.js
 */

var ORCAMENTO = {
  _cache: null,

  init: function() {
    this._carregarOrcamentos();
  },

  _carregarOrcamentos: function() {
    var config = DADOS.getConfig();
    this._cache = config.orcamentos || {};
  },

  definirLimite: function(categoria, limite) {
    if (typeof BUDGET_SERVICE !== 'undefined') {
      this._cache = BUDGET_SERVICE.setBudget(this._cache, categoria, limite);
    } else {
      if (limite <= 0) {
        throw new Error('Limite deve ser maior que 0');
      }
      this._cache[categoria] = {
        limite: parseFloat(limite),
        definidoEm: new Date().toISOString()
      };
    }
    this._salvarOrcamentos();
    return this._cache[categoria];
  },

  obterLimite: function(categoria) {
    var entry = this._cache[categoria];
    return entry ? entry.limite : null;
  },

  obterTodos: function() {
    var result = {};
    var keys = Object.keys(this._cache);
    for (var i = 0; i < keys.length; i++) {
      result[keys[i]] = this._cache[keys[i]];
    }
    return result;
  },

  deletarLimite: function(categoria) {
    this._cache = typeof BUDGET_SERVICE !== 'undefined'
      ? BUDGET_SERVICE.removeBudget(this._cache, categoria)
      : (delete this._cache[categoria], this._cache);
    this._salvarOrcamentos();
  },

  calcularGastoMes: function(categoria, mes, ano) {
    if (typeof BUDGET_SERVICE !== 'undefined') {
      return BUDGET_SERVICE.calculateSpent(TRANSACOES.obter({}), categoria, mes, ano);
    }
    var transacoes = TRANSACOES.obter({ mes: mes, ano: ano, categoria: categoria });
    var total = 0;
    for (var i = 0; i < transacoes.length; i++) {
      if (transacoes[i].tipo === CONFIG.TIPO_DESPESA) {
        total += transacoes[i].valor;
      }
    }
    return total;
  },

  obterStatus: function(categoria, mes, ano) {
    if (typeof BUDGET_SERVICE !== 'undefined') {
      return BUDGET_SERVICE.getStatus(this._cache, TRANSACOES.obter({}), categoria, mes, ano);
    }
    var limite = this.obterLimite(categoria);
    if (!limite) {
      return {
        categoria: categoria,
        limite: null,
        gasto: 0,
        percentual: 0,
        status: 'sem-limite'
      };
    }
    var gasto = this.calcularGastoMes(categoria, mes, ano);
    var percentual = (gasto / limite) * 100;
    var status = 'ok';
    if (percentual >= 100) {
      status = 'excedido';
    } else if (percentual >= 80) {
      status = 'alerta';
    }
    return {
      categoria: categoria,
      limite: limite,
      gasto: gasto,
      percentual: Math.round(percentual),
      status: status,
      restante: Math.max(0, limite - gasto)
    };
  },

  obterStatusTodos: function(mes, ano) {
    if (typeof BUDGET_SERVICE !== 'undefined') {
      return BUDGET_SERVICE.getAllStatus(this._cache, TRANSACOES.obter({}), mes, ano);
    }
    var categorias = Object.keys(this._cache);
    var self = this;
    return categorias.map(function(cat) {
      return self.obterStatus(cat, mes, ano);
    });
  },

  _salvarOrcamentos: function() {
    var config = DADOS.getConfig();
    config.orcamentos = this._cache;
    DADOS.salvarConfig(config);
    if (typeof APP_STATE !== 'undefined') APP_STATE.setState({ config: config });
    if (typeof DADOS._pushOrcamentoApi === 'function') {
      var chaves = Object.keys(this._cache);
      for (var i = 0; i < chaves.length; i++) {
        var entry = this._cache[chaves[i]];
        if (entry && typeof entry.limite === 'number') {
          DADOS._pushOrcamentoApi(chaves[i], entry.limite);
        }
      }
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ORCAMENTO;
}
