/**
 * budgetService.js - Regras puras de orcamento.
 */
var BUDGET_SERVICE = (function() {
  function normalizeLimit(limite) {
    var value = typeof limite === 'number' ? limite : parseFloat(String(limite).replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) throw new Error('Limite deve ser maior que 0');
    return value;
  }

  function setBudget(budgets, categoria, limite, now) {
    if (!categoria || !String(categoria).trim()) throw new Error('Categoria obrigatoria');
    var next = Object.assign({}, budgets || {});
    next[String(categoria).trim()] = {
      limite: normalizeLimit(limite),
      definidoEm: now || new Date().toISOString()
    };
    return next;
  }

  function removeBudget(budgets, categoria) {
    var next = Object.assign({}, budgets || {});
    delete next[categoria];
    return next;
  }

  function calculateSpent(transacoes, categoria, mes, ano) {
    if (typeof TRANSACTION_SERVICE === 'undefined') return 0;
    return TRANSACTION_SERVICE.filterTransactions(transacoes, {
      mes: mes,
      ano: ano,
      categoria: categoria,
      tipo: 'despesa'
    }).reduce(function(total, t) { return total + Number(t.valor || 0); }, 0);
  }

  function getStatus(budgets, transacoes, categoria, mes, ano) {
    var entry = budgets && budgets[categoria];
    if (!entry) {
      return { categoria: categoria, limite: null, gasto: 0, percentual: 0, status: 'sem-limite' };
    }
    var gasto = calculateSpent(transacoes, categoria, mes, ano);
    var limite = normalizeLimit(entry.limite);
    var percentual = limite > 0 ? (gasto / limite) * 100 : 0;
    var status = percentual >= 100 ? 'excedido' : percentual >= 80 ? 'alerta' : 'ok';
    return {
      categoria: categoria,
      limite: limite,
      gasto: gasto,
      percentual: Math.round(percentual),
      status: status,
      restante: Math.max(0, limite - gasto)
    };
  }

  function getAllStatus(budgets, transacoes, mes, ano) {
    return Object.keys(budgets || {}).map(function(categoria) {
      return getStatus(budgets, transacoes, categoria, mes, ano);
    });
  }

  return {
    setBudget: setBudget,
    removeBudget: removeBudget,
    calculateSpent: calculateSpent,
    getStatus: getStatus,
    getAllStatus: getAllStatus
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BUDGET_SERVICE;
}
