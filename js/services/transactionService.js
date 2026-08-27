/**
 * transactionService.js - Regras puras de transacoes.
 * Pode ser reaproveitado no backend porque nao toca DOM nem localStorage.
 */
var TRANSACTION_SERVICE = (function() {
  var TIPOS = { RECEITA: 'receita', DESPESA: 'despesa', TRANSFERENCIA: 'transferencia' };

  function paraCentavos(value) {
    var n = toNumber(value);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  function toNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      if (typeof UTILS !== 'undefined' && UTILS.parseMoeda) return UTILS.parseMoeda(value);
      return parseFloat(String(value).trim().replace(',', '.'));
    }
    return NaN;
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function mesKey(ano, mes) {
    return ano + '-' + pad2(mes);
  }

  function parseDataParts(data) {
    var dataStr = String(data == null ? '' : data).split('T')[0];
    var parts = dataStr.split('-');
    if (parts.length !== 3) return null;
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (!y || !m || !d) return null;
    return { y: y, m: m, d: d, iso: dataStr };
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
    if (input.accountId) tx.accountId = String(input.accountId).trim();
    assertValidTransaction(tx);
    return tx;
  }

  function buildMonthIndex(transacoes) {
    var idx = Object.create(null);
    (Array.isArray(transacoes) ? transacoes : []).forEach(function(t) {
      if (!t || !t.data) return;
      var p = parseDataParts(t.data);
      if (!p) return;
      var key = mesKey(p.y, p.m);
      if (!idx[key]) idx[key] = [];
      idx[key].push(t);
    });
    return idx;
  }

  function filterByMonth(transacoes, mes, ano, opts) {
    opts = opts || {};
    var key = mesKey(ano, mes);
    var base = opts.monthIndex && opts.monthIndex[key]
      ? opts.monthIndex[key].slice()
      : (Array.isArray(transacoes) ? transacoes : []).filter(function(t) {
        var p = parseDataParts(t.data);
        return p && p.m === mes && p.y === ano;
      });
    if (opts.ate) {
      var ate = String(opts.ate).slice(0, 10);
      base = base.filter(function(t) {
        return String(t.data || '').slice(0, 10) <= ate;
      });
    }
    return base;
  }

  function filterTransactions(transacoes, filtros) {
    filtros = filtros || {};
    var result = Array.isArray(transacoes) ? transacoes.slice() : [];
    if (filtros.mes && filtros.ano) {
      result = filterByMonth(result, filtros.mes, filtros.ano, filtros);
    }
    if (filtros.tipo) result = result.filter(function(t) { return t.tipo === filtros.tipo; });
    if (filtros.categoria) result = result.filter(function(t) { return t.categoria === filtros.categoria; });
    var desc = filtros.ordenarPor !== 'data-asc';
    result.sort(function(a, b) {
      var da = String(a.data || '').slice(0, 10);
      var db = String(b.data || '').slice(0, 10);
      if (da === db) return 0;
      if (desc) return da > db ? -1 : 1;
      return da < db ? -1 : 1;
    });
    return result;
  }

  function calculateBalance(transacoes) {
    var cent = (Array.isArray(transacoes) ? transacoes : []).reduce(function(acc, t) {
      if (t.tipo === TIPOS.RECEITA) return acc + paraCentavos(t.valor);
      if (t.tipo === TIPOS.DESPESA) return acc - paraCentavos(t.valor);
      return acc;
    }, 0);
    return cent / 100;
  }

  function summarizeMonth(transacoes, mes, ano, opts) {
    opts = opts || {};
    var txMes = filterByMonth(transacoes, mes, ano, opts);
    var receitasC = 0;
    var despesasC = 0;
    txMes.forEach(function(t) {
      if (t.tipo === TIPOS.RECEITA) receitasC += paraCentavos(t.valor);
      else if (t.tipo === TIPOS.DESPESA) despesasC += paraCentavos(t.valor);
    });
    return {
      receitas: receitasC / 100,
      despesas: despesasC / 100,
      saldo: (receitasC - despesasC) / 100,
      total: txMes.length
    };
  }

  function summarizeByCategory(transacoes, mes, ano, opts) {
    opts = opts || {};
    return filterByMonth(transacoes, mes, ano, opts).reduce(function(acc, t) {
      var cat = t.categoria || 'outro';
      if (!acc[cat]) acc[cat] = { receita: 0, despesa: 0 };
      if (t.tipo === TIPOS.RECEITA) {
        acc[cat].receita = (paraCentavos(acc[cat].receita) + paraCentavos(t.valor)) / 100;
      } else if (t.tipo === TIPOS.DESPESA) {
        acc[cat].despesa = (paraCentavos(acc[cat].despesa) + paraCentavos(t.valor)) / 100;
      }
      return acc;
    }, {});
  }

  /** Top-K por data ISO sem sortear todo o histórico (O(n·k), k pequeno). */
  function topByDate(transacoes, limite, ordenarPor) {
    limite = limite || 3;
    var asc = ordenarPor === 'data-asc';
    function cmp(a, b) {
      var da = String(a.data || '').slice(0, 10);
      var db = String(b.data || '').slice(0, 10);
      if (da === db) return 0;
      if (asc) return da < db ? -1 : 1;
      return da > db ? -1 : 1;
    }
    var arr = Array.isArray(transacoes) ? transacoes : [];
    if (arr.length <= limite) return arr.slice().sort(cmp);

    var best = [];
    for (var i = 0; i < arr.length; i++) {
      var t = arr[i];
      if (!t || !t.data) continue;
      if (best.length < limite) {
        best.push(t);
        if (best.length === limite) best.sort(cmp);
        continue;
      }
      if (cmp(t, best[limite - 1]) < 0) {
        best[limite - 1] = t;
        best.sort(cmp);
      }
    }
    return best.sort(cmp);
  }

  return {
    createTransaction: createTransaction,
    assertValidTransaction: assertValidTransaction,
    filterTransactions: filterTransactions,
    filterByMonth: filterByMonth,
    buildMonthIndex: buildMonthIndex,
    calculateBalance: calculateBalance,
    summarizeMonth: summarizeMonth,
    summarizeByCategory: summarizeByCategory,
    topByDate: topByDate
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TRANSACTION_SERVICE;
}
