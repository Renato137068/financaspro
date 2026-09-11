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

  /** Reais → centavos inteiros. Somar centavos não acumula erro; somar reais sim. */
  function centavos(valor) {
    var n = Number(valor);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  function calculateSpent(transacoes, categoria, mes, ano) {
    if (typeof TRANSACTION_SERVICE === 'undefined') return 0;
    var list = Array.isArray(transacoes) ? transacoes : [];
    var filtered;
    if (mes != null && ano != null) {
      filtered = TRANSACTION_SERVICE.filterTransactions(list, {
        mes: mes,
        ano: ano,
        categoria: categoria,
        tipo: 'despesa'
      });
    } else {
      filtered = list.filter(function(t) {
        return t.tipo === 'despesa' && t.categoria === categoria;
      });
    }
    var totalC = filtered.reduce(function(total, t) { return total + centavos(t.valor || 0); }, 0);
    return totalC / 100;
  }

  /**
   * Status e percentual exibido, derivados da MESMA comparação em centavos.
   *
   * Antes o status vinha do percentual exato e a tela mostrava o arredondado —
   * eram dois números diferentes. Com 99,6% consumido a tela dizia "100%"
   * enquanto o selo dizia "atenção": a interface se contradizia.
   *
   * Regra: a tela só mostra 100% quando o limite foi de fato atingido. Abaixo
   * disso o percentual é limitado a 99, o que é honesto — ainda não estourou.
   */
  function avaliar(gasto, limite) {
    var gastoC = centavos(gasto);
    var limiteC = centavos(limite);
    if (limiteC <= 0) return { percentual: 0, status: 'ok', restante: 0 };

    var excedido = gastoC >= limiteC;
    var emAlerta = gastoC * 100 >= limiteC * 80;
    var bruto = Math.round((gastoC / limiteC) * 100);

    return {
      percentual: excedido ? bruto : Math.min(99, bruto),
      status: excedido ? 'excedido' : emAlerta ? 'alerta' : 'ok',
      restante: Math.max(0, limiteC - gastoC) / 100
    };
  }

  function getStatus(budgets, transacoes, categoria, mes, ano) {
    var entry = budgets && budgets[categoria];
    if (!entry) {
      return { categoria: categoria, limite: null, gasto: 0, percentual: 0, status: 'sem-limite' };
    }
    var gasto = calculateSpent(transacoes, categoria, mes, ano);
    var limite = normalizeLimit(entry.limite);
    var aval = avaliar(gasto, limite);
    return {
      categoria: categoria,
      limite: limite,
      gasto: gasto,
      percentual: aval.percentual,
      status: aval.status,
      restante: aval.restante
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
    avaliar: avaliar,
    getStatus: getStatus,
    getAllStatus: getAllStatus
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BUDGET_SERVICE;
}
