/**
 * transactionService.js - Regras puras de transacoes.
 * Pode ser reaproveitado no backend porque nao toca DOM nem localStorage.
 */
var TRANSACTION_SERVICE = (function() {
  var TIPOS = { RECEITA: 'receita', DESPESA: 'despesa', TRANSFERENCIA: 'transferencia' };

  // O saldo e os resumos abaixo tratam receita e despesa EXPLICITAMENTE. Somar
  // "tudo que não é receita" como despesa fazia uma transferência entre contas
  // aparecer como gasto do mês — dinheiro que só mudou de lugar reduzindo o
  // saldo e consumindo orçamento.

  /**
   * Centavos inteiros a partir de um valor em reais.
   *
   * Somar reais em ponto flutuante faz mil lançamentos de R$ 0,10 darem
   * 99,9999999999986. O orçamento e o saldo por conta já somavam em centavos;
   * o resumo do mês não — e o resultado era o dashboard exibindo um total de
   * despesas que NÃO batia com o consumo do orçamento sobre os mesmos dados.
   * Dois números diferentes para a mesma coisa, na mesma tela.
   */
  function paraCentavos(value) {
    var n = toNumber(value);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

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
    var cent = (Array.isArray(transacoes) ? transacoes : []).reduce(function(acc, t) {
      if (t.tipo === TIPOS.RECEITA) return acc + paraCentavos(t.valor);
      if (t.tipo === TIPOS.DESPESA) return acc - paraCentavos(t.valor);
      // Transferência não altera o total: sai de uma conta e entra em outra.
      return acc;
    }, 0);
    return cent / 100;
  }

  function summarizeMonth(transacoes, mes, ano) {
    var txMes = filterTransactions(transacoes, { mes: mes, ano: ano });
    var receitasC = 0;
    var despesasC = 0;
    txMes.forEach(function(t) {
      if (t.tipo === TIPOS.RECEITA) receitasC += paraCentavos(t.valor);
      // Explícito e não `else`: transferência entre contas não é gasto.
      else if (t.tipo === TIPOS.DESPESA) despesasC += paraCentavos(t.valor);
    });
    return {
      receitas: receitasC / 100,
      despesas: despesasC / 100,
      saldo: (receitasC - despesasC) / 100,
      total: txMes.length
    };
  }

  function summarizeByCategory(transacoes, mes, ano) {
    return filterTransactions(transacoes, { mes: mes, ano: ano }).reduce(function(acc, t) {
      if (!acc[t.categoria]) acc[t.categoria] = { receita: 0, despesa: 0 };
      // Round por categoria a cada soma: mantém o total em centavos exatos sem
      // mudar a forma do retorno, que outros módulos já consomem em reais.
      if (t.tipo === TIPOS.RECEITA) {
        acc[t.categoria].receita = (paraCentavos(acc[t.categoria].receita) + paraCentavos(t.valor)) / 100;
      } else if (t.tipo === TIPOS.DESPESA) {
        acc[t.categoria].despesa = (paraCentavos(acc[t.categoria].despesa) + paraCentavos(t.valor)) / 100;
      }
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
