/**
 * metas.test.js — Progresso de metas financeiras
 */

function calcularProgressoMeta(meta) {
  if (!meta) return { percentual: 0, restante: 0, concluida: false };
  var pct = meta.valorAlvo > 0
    ? Math.min(100, Math.round((meta.valorAtual / meta.valorAlvo) * 100))
    : 0;
  var concluida = !!meta.concluida || meta.valorAtual >= meta.valorAlvo;
  return {
    percentual: pct,
    restante: Math.max(0, meta.valorAlvo - meta.valorAtual),
    concluida: concluida
  };
}

describe('Metas financeiras — progresso', function() {
  test('calcula percentual e restante', function() {
    var p = calcularProgressoMeta({ valorAlvo: 1000, valorAtual: 250, concluida: false });
    expect(p.percentual).toBe(25);
    expect(p.restante).toBe(750);
    expect(p.concluida).toBe(false);
  });

  test('marca concluída ao atingir alvo', function() {
    var p = calcularProgressoMeta({ valorAlvo: 100, valorAtual: 100, concluida: false });
    expect(p.concluida).toBe(true);
    expect(p.percentual).toBe(100);
  });
});
