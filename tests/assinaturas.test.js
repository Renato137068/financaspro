/**
 * assinaturas.test.js — Lógica de assinaturas
 */

function proximaCobrancaAssinatura(diaCobranca, hojeStr) {
  var hoje = new Date(hojeStr + 'T12:00:00');
  hoje.setHours(0, 0, 0, 0);
  var ano = hoje.getFullYear();
  var mes = hoje.getMonth();
  var dia = Math.min(diaCobranca, new Date(ano, mes + 1, 0).getDate());
  var prox = new Date(ano, mes, dia);
  if (prox < hoje) {
    prox = new Date(ano, mes + 1, Math.min(diaCobranca, new Date(ano, mes + 2, 0).getDate()));
  }
  return [
    prox.getFullYear(),
    String(prox.getMonth() + 1).padStart(2, '0'),
    String(prox.getDate()).padStart(2, '0')
  ].join('-');
}

function totalMensalAssinaturas(lista) {
  return (lista || []).filter(function(a) { return a.ativa !== false; })
    .reduce(function(s, a) { return s + a.valor; }, 0);
}

describe('Assinaturas — cobrança e total', function() {
  test('próxima cobrança no mês atual ou seguinte', function() {
    expect(proximaCobrancaAssinatura(10, '2026-06-15')).toBe('2026-07-10');
    expect(proximaCobrancaAssinatura(20, '2026-06-15')).toBe('2026-06-20');
  });

  test('soma apenas assinaturas ativas', function() {
    var total = totalMensalAssinaturas([
      { valor: 30, ativa: true },
      { valor: 50, ativa: false },
      { valor: 20, ativa: true }
    ]);
    expect(total).toBe(50);
  });
});
