/**
 * transacoes.js - Transaction Management
 * Tier 1: Depends on config.js, dados.js, utils.js
 */

var TRANSACOES = {
  _cache: null,

  init: function() {
    this._cache = DADOS.getTransacoes();
  },

  criar: function(tipo, valor, categoria, data, descricao) {
    var validacao = UTILS.validarTransacao({
      tipo: tipo, valor: parseFloat(valor), categoria: categoria, data: data
    });
    if (!validacao.valido) throw new Error(validacao.erro);

    var transacao = {
      id: UTILS.gerarId(),
      tipo: tipo,
      valor: parseFloat(valor),
      categoria: categoria,
      data: data,
      descricao: descricao || '',
      dataCriacao: new Date().toISOString()
    };
    DADOS.salvarTransacao(transacao);
    this._cache = DADOS.getTransacoes();
    return transacao;
  },

  obter: function(filtros) {
    filtros = filtros || {};
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
    this._cache = DADOS.getTransacoes();
    return updated;
  },

  deletar: function(id) {
    var resultado = DADOS.deletarTransacao(id);
    this._cache = DADOS.getTransacoes();
    return resultado;
  },

  obterResumoMes: function(mes, ano) {
    var txMes = this.obter({ mes: mes, ano: ano });
    var receitas = 0, despesas = 0;
    txMes.forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_RECEITA) receitas += t.valor;
      else despesas += t.valor;
    });
    return { receitas: receitas, despesas: despesas, saldo: receitas - despesas, total: txMes.length };
  },

  obterResumoPorCategoria: function(mes, ano) {
    var txMes = this.obter({ mes: mes, ano: ano });
    var resumo = {};
    txMes.forEach(function(t) {
      if (!resumo[t.categoria]) resumo[t.categoria] = { receita: 0, despesa: 0 };
      if (t.tipo === CONFIG.TIPO_RECEITA) resumo[t.categoria].receita += t.valor;
      else resumo[t.categoria].despesa += t.valor;
    });
    return resumo;
  }
};

  obterResumoCategoriaMes: function(categoria, mes, ano) {
    var transacoes = UTILS.filtrarPorMes(this._cache, mes, ano);
    return transacoes.filter(function(t) { return t.categoria === categoria && t.tipo === 'despesa'; })
      .reduce(function(acc, t) { return acc + t.valor; }, 0);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TRANSACOES;
}
