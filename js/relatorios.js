/**
 * relatorios.js — Resumos mensais e comparativos (sem DOM)
 */
const RELATORIOS = {
  resumoMes: function(mes, ano) {
    if (typeof TRANSACOES === 'undefined') return null;
    var txs = TRANSACOES.obter({ mes: mes, ano: ano });
    // Soma em centavos inteiros (padrão do app): somar t.valor em reais com +=
    // acumula erro de ponto flutuante, e saldo = receitas - despesas propaga
    // a deriva para os KPIs e para os diffs do comparativo mês a mês.
    var receitasCent = 0;
    var despesasCent = 0;
    var porCatCent = {};

    txs.forEach(function(t) {
      var cent = UTILS.paraCentavos(t.valor);
      if (t.tipo === CONFIG.TIPO_RECEITA) receitasCent += cent;
      else {
        despesasCent += cent;
        var cat = t.categoria || 'outro';
        porCatCent[cat] = (porCatCent[cat] || 0) + cent;
      }
    });

    var topCats = Object.keys(porCatCent).sort(function(a, b) { return porCatCent[b] - porCatCent[a]; }).slice(0, 5);
    return {
      mes: mes,
      ano: ano,
      receitas: receitasCent / 100,
      despesas: despesasCent / 100,
      saldo: (receitasCent - despesasCent) / 100,
      transacoes: txs.length,
      topCategorias: topCats.map(function(c) {
        return {
          categoria: c,
          label: CONFIG.getCatLabel ? CONFIG.getCatLabel(c) : c,
          valor: porCatCent[c] / 100,
          percentual: despesasCent > 0 ? Math.round((porCatCent[c] / despesasCent) * 100) : 0
        };
      })
    };
  },

  compararMesAnterior: function(mes, ano) {
    var prevMes = mes - 1;
    var prevAno = ano;
    if (prevMes < 1) { prevMes = 12; prevAno--; }
    var atual = this.resumoMes(mes, ano);
    var anterior = this.resumoMes(prevMes, prevAno);
    if (!atual || !anterior) return null;
    // Diffs também em centavos: subtrair dois valores em reais reintroduz a
    // deriva (0,01 não é exato em binário), gerando "-R$ 0,00" espúrios.
    return {
      atual: atual,
      anterior: anterior,
      diffReceitas: (UTILS.paraCentavos(atual.receitas) - UTILS.paraCentavos(anterior.receitas)) / 100,
      diffDespesas: (UTILS.paraCentavos(atual.despesas) - UTILS.paraCentavos(anterior.despesas)) / 100,
      diffSaldo: (UTILS.paraCentavos(atual.saldo) - UTILS.paraCentavos(anterior.saldo)) / 100
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RELATORIOS;
}
