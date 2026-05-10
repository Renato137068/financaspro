/**
 * transactionService.js - Regras puras de transacoes.
 * Pode ser reaproveitado no backend porque nao toca DOM nem localStorage.
 */
var TRANSACTION_SERVICE = (function() {
  var TIPOS = { RECEITA: 'receita', DESPESA: 'despesa' };

  function toNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseFloat(value.replace(',', '.'));
    return NaN;
  }

  function assertValidTransaction(input) {
    if (!input || typeof input !== 'object') throw new Error('Transacao invalida');
    if ([TIPOS.RECEITA, TIPOS.DESPESA].indexOf(input.tipo) === -1) throw new Error('Tipo invalido');
    var valor = toNumber(input.valor);
    if (!Number.isFinite(valor) || valor <= 0) throw new Error('Valor invalido');
    if (!input.categoria || !String(input.categoria).trim()) throw new Error('Categoria obrigatoria');
    if (!input.data || Number.isNaN(Date.parse(input.data + 'T00:00:00'))) throw new Error('Data invalida');
    return true;
  }

  function createTransaction(input, deps) {
    deps = deps || {};
    var now = deps.now || new Date().toISOString();
    var idFactory = deps.idFactory || function() {
      return 'tx-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    };
    var tx = {
      id: input.id || idFactory(),
      tipo: input.tipo,
      valor: toNumber(input.valor),
      categoria: String(input.categoria).trim(),
      data: input.data,
      descricao: input.descricao ? String(input.descricao).trim() : '',
      banco: input.banco ? String(input.banco).trim() : '',
      cartao: input.cartao ? String(input.cartao).trim() : '',
      dataCriacao: input.dataCriacao || now
    };
    assertValidTransaction(tx);
    return tx;
  }

  function filterByMonth(transacoes, mes, ano) {
    return (Array.isArray(transacoes) ? transacoes : []).filter(function(t) {
      var d = new Date(t.data + 'T00:00:00');
      return d.getMonth() + 1 === mes && d.getFullYear() === ano;
    });
  }

  function filterTransactions(transacoes, filtros) {
    filtros = filtros || {};
    var result = Array.isArray(transacoes) ? transacoes.slice() : [];
    if (filtros.mes && filtros.ano) result = filterByMonth(result, filtros.mes, filtros.ano);
    if (filtros.tipo) result = result.filter(function(t) { return t.tipo === filtros.tipo; });
    if (filtros.categoria) result = result.filter(function(t) { return t.categoria === filtros.categoria; });
    result.sort(function(a, b) {
      var diff = new Date(a.data) - new Date(b.data);
      return filtros.ordenarPor === 'data-asc' ? diff : -diff;
    });
    return result;
  }

  function calculateBalance(transacoes) {
    return (Array.isArray(transacoes) ? transacoes : []).reduce(function(acc, t) {
      var valor = toNumber(t.valor);
      if (!Number.isFinite(valor)) return acc;
      return t.tipo === TIPOS.RECEITA ? acc + valor : acc - valor;
    }, 0);
  }

  function summarizeMonth(transacoes, mes, ano) {
    var txMes = filterTransactions(transacoes, { mes: mes, ano: ano });
    var receitas = 0;
    var despesas = 0;
    txMes.forEach(function(t) {
      if (t.tipo === TIPOS.RECEITA) receitas += toNumber(t.valor);
      else despesas += toNumber(t.valor);
    });
    return { receitas: receitas, despesas: despesas, saldo: receitas - despesas, total: txMes.length };
  }

  function summarizeByCategory(transacoes, mes, ano) {
    return filterTransactions(transacoes, { mes: mes, ano: ano }).reduce(function(acc, t) {
      if (!acc[t.categoria]) acc[t.categoria] = { receita: 0, despesa: 0 };
      if (t.tipo === TIPOS.RECEITA) acc[t.categoria].receita += toNumber(t.valor);
      else acc[t.categoria].despesa += toNumber(t.valor);
      return acc;
    }, {});
  }

  return {
    createTransaction: createTransaction,
    assertValidTransaction: assertValidTransaction,
    filterTransactions: filterTransactions,
    filterByMonth: filterByMonth,
    calculateBalance: calculateBalance,
    summarizeMonth: summarizeMonth,
    summarizeByCategory: summarizeByCategory
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TRANSACTION_SERVICE;
}
