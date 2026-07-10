/**
 * relatorios.test.js — Resumo mensal
 */

function resumoMesSimples(txs) {
  var receitas = 0;
  var despesas = 0;
  txs.forEach(function(t) {
    if (t.tipo === 'receita') receitas += t.valor;
    else despesas += t.valor;
  });
  return { receitas: receitas, despesas: despesas, saldo: receitas - despesas };
}

describe('Relatórios — resumo mensal', function() {
  test('calcula receitas, despesas e saldo', function() {
    var r = resumoMesSimples([
      { tipo: 'receita', valor: 5000 },
      { tipo: 'despesa', valor: 1200 },
      { tipo: 'despesa', valor: 800 }
    ]);
    expect(r.receitas).toBe(5000);
    expect(r.despesas).toBe(2000);
    expect(r.saldo).toBe(3000);
  });
});
