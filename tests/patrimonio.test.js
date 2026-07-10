/**
 * patrimonio.test.js — Patrimônio líquido
 */

function calcularPatrimonioLiquido(ativos, dividas) {
  var totalA = (ativos || []).reduce(function(s, a) { return s + (a.valor || 0); }, 0);
  var totalD = (dividas || []).reduce(function(s, d) { return s + (d.valor || 0); }, 0);
  return { ativos: totalA, dividas: totalD, liquido: totalA - totalD };
}

describe('Patrimônio — cálculo líquido', function() {
  test('soma ativos e subtrai dívidas', function() {
    var r = calcularPatrimonioLiquido(
      [{ valor: 10000 }, { valor: 5000 }],
      [{ valor: 3000 }, { valor: 2000 }]
    );
    expect(r.ativos).toBe(15000);
    expect(r.dividas).toBe(5000);
    expect(r.liquido).toBe(10000);
  });

  test('patrimônio negativo quando dívidas superam ativos', function() {
    var r = calcularPatrimonioLiquido([{ valor: 2000 }], [{ valor: 8000 }]);
    expect(r.liquido).toBe(-6000);
  });
});
