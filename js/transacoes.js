/**
 * @file transacoes.js — Transaction Management
 * @module TRANSACOES
 * Tier 1. Depende de: config.js, dados.js, utils.js
 */

/**
 * @typedef {Object} ResumoMes
 * @property {number} receitas
 * @property {number} despesas
 * @property {number} saldo
 * @property {number} total
 */

/**
 * @typedef {Object} FiltroTransacao
 * @property {number} [mes] — 1-12
 * @property {number} [ano]
 * @property {'receita'|'despesa'} [tipo]
 * @property {string} [categoria]
 * @property {'data-asc'|'data-desc'} [ordenarPor]
 */

var TRANSACOES = {
  _cache: null,
  _cacheTimestamp: null,
  _cacheTTL: 30000, // 30 segundos

  /**
   * Inicializa cache de transações a partir do localStorage.
   */
  init: function() {
    this._cache = DADOS.getTransacoes();
    this._cacheTimestamp = Date.now();
    if (typeof APP_STATE !== 'undefined') {
      APP_STATE.setState({ transacoes: this._cache });
    }
  },

  /**
   * Verifica se o cache expirou
   */
  _isCacheExpired: function() {
    return !this._cacheTimestamp || (Date.now() - this._cacheTimestamp) > this._cacheTTL;
  },

  /**
   * Atualiza cache se necessário
   */
  _refreshCache: function() {
    if (this._isCacheExpired()) {
      this._cache = DADOS.getTransacoes();
      this._cacheTimestamp = Date.now();
      if (typeof APP_STATE !== 'undefined') {
        APP_STATE.setState({ transacoes: this._cache });
      }
    }
  },

  /**
   * Invalida cache forçadamente
   */
  invalidateCache: function() {
    this._cacheTimestamp = null;
    this._refreshCache();
  },

  /**
   * Cria nova transação com validação.
   * @param {'receita'|'despesa'} tipo
   * @param {number|string} valor
   * @param {string} categoria
   * @param {string} data — YYYY-MM-DD
   * @param {string} [descricao]
   * @param {string} [banco]
   * @param {string} [cartao]
   * @returns {Transacao}
   * @throws {Error} se inválida
   */
  criar: function(tipo, valor, categoria, data, descricao, banco, cartao) {
    if (typeof CONFIG !== 'undefined' && typeof CONFIG.normalizeCategoriaFinal === 'function') {
      categoria = CONFIG.normalizeCategoriaFinal(categoria, tipo);
    }
    var transacao = typeof TRANSACTION_SERVICE !== 'undefined'
      ? TRANSACTION_SERVICE.createTransaction({
        tipo: tipo,
        valor: valor,
        categoria: categoria,
        data: data,
        descricao: descricao,
        banco: banco,
        cartao: cartao
      }, { idFactory: UTILS.gerarId })
      : (function() {
        var validacao = UTILS.validarTransacao({
          tipo: tipo, valor: parseFloat(valor), categoria: categoria, data: data
        });
        if (!validacao.valido) throw new Error(validacao.erro);
        return {
          id: UTILS.gerarId(),
          tipo: tipo,
          valor: parseFloat(valor),
          categoria: categoria,
          data: data,
          descricao: descricao || '',
          banco: banco || '',
          cartao: cartao || '',
          dataCriacao: new Date().toISOString()
        };
      })();
    DADOS.salvarTransacao(transacao);
    this._cache = DADOS.getTransacoes();
    if (typeof APP_STATE !== 'undefined') APP_STATE.setState({ transacoes: this._cache });
    return transacao;
  },

  /**
   * Filtra cache de transações.
   * @param {FiltroTransacao} [filtros]
   * @returns {Transacao[]}
   */
  obter: function(filtros) {
    this._refreshCache();
    filtros = filtros || {};
    if (typeof TRANSACTION_SERVICE !== 'undefined') {
      return TRANSACTION_SERVICE.filterTransactions(this._cache || [], filtros);
    }
    var resultado = this._cache.slice();

    if (filtros.mes && filtros.ano) {
      resultado = UTILS.filtrarPorMes(resultado, filtros.mes, filtros.ano);
    }
    if (filtros.tipo) {
      resultado = UTILS.filtrarPorTipo(resultado, filtros.tipo);
    }
    if (filtros.categoria) {
      resultado = resultado.filter(function(t) { return t.categoria === filtros.categoria; });
    }
    if (filtros.ordenarPor === 'data-asc') {
      resultado.sort(function(a, b) { return new Date(a.data) - new Date(b.data); });
    } else {
      resultado.sort(function(a, b) { return new Date(b.data) - new Date(a.data); });
    }
    return resultado;
  },

  obterPorId: function(id) {
    for (var i = 0; i < this._cache.length; i++) {
      if (this._cache[i].id === id) return this._cache[i];
    }
    return null;
  },

  atualizar: function(id, updates) {
    var transacao = this.obterPorId(id);
    if (!transacao) throw new Error('Transacao nao encontrada');
    var updated = Object.assign({}, transacao, updates);
    var validacao = UTILS.validarTransacao(updated);
    if (!validacao.valido) throw new Error(validacao.erro);
    DADOS.salvarTransacao(updated);
    this.invalidateCache();
    return updated;
  },

  deletar: function(id) {
    var resultado = DADOS.deletarTransacao(id);
    this.invalidateCache();
    return resultado;
  },

  /**
   * Resumo agregado do mês.
   * @param {number} mes
   * @param {number} ano
   * @returns {ResumoMes}
   */
  obterResumoMes: function(mes, ano) {
    if (typeof TRANSACTION_SERVICE !== 'undefined') {
      return TRANSACTION_SERVICE.summarizeMonth(this._cache || [], mes, ano);
    }
    var txMes = this.obter({ mes: mes, ano: ano });
    var receitas = 0, despesas = 0;
    txMes.forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_RECEITA) receitas += t.valor;
      else despesas += t.valor;
    });
    return { receitas: receitas, despesas: despesas, saldo: receitas - despesas, total: txMes.length };
  },

  obterResumoPorCategoria: function(mes, ano) {
    if (typeof TRANSACTION_SERVICE !== 'undefined') {
      return TRANSACTION_SERVICE.summarizeByCategory(this._cache || [], mes, ano);
    }
    var txMes = this.obter({ mes: mes, ano: ano });
    var resumo = {};
    txMes.forEach(function(t) {
      if (!resumo[t.categoria]) resumo[t.categoria] = { receita: 0, despesa: 0 };
      if (t.tipo === CONFIG.TIPO_RECEITA) resumo[t.categoria].receita += t.valor;
      else resumo[t.categoria].despesa += t.valor;
    });
    return resumo;
  },

  // Compatibilidade com suíte de testes legado
  obterPorCategoria: function(mes, ano) {
    var resumo = this.obterResumoPorCategoria(mes, ano);
    var resultado = {};
    Object.keys(resumo).forEach(function(cat) {
      resultado[cat] = resumo[cat].despesa || 0;
    });
    return resultado;
  },

  obterResumoCategoriaMes: function(categoria, mes, ano) {
    var transacoes = UTILS.filtrarPorMes(this._cache, mes, ano);
    return transacoes.filter(function(t) { return t.categoria === categoria && t.tipo === 'despesa'; })
      .reduce(function(acc, t) { return acc + t.valor; }, 0);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TRANSACOES;
}
