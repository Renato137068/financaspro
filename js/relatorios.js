/**
 * relatorios.js — Resumos mensais e comparativos (sem DOM)
 */
const RELATORIOS = {
  resumoMes: function(mes, ano) {
    if (typeof TRANSACOES === 'undefined') return null;
    var txs = TRANSACOES.obter({ mes: mes, ano: ano });
    var receitas = 0;
    var despesas = 0;
    var porCat = {};

    txs.forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_RECEITA) receitas += t.valor;
      else {
        despesas += t.valor;
        var cat = t.categoria || 'outro';
        porCat[cat] = (porCat[cat] || 0) + t.valor;
      }
    });

    var topCats = Object.keys(porCat).sort(function(a, b) { return porCat[b] - porCat[a]; }).slice(0, 5);
    return {
      mes: mes,
      ano: ano,
      receitas: receitas,
      despesas: despesas,
      saldo: receitas - despesas,
      transacoes: txs.length,
      topCategorias: topCats.map(function(c) {
        return {
          categoria: c,
          label: CONFIG.getCatLabel ? CONFIG.getCatLabel(c) : c,
          valor: porCat[c],
          percentual: despesas > 0 ? Math.round((porCat[c] / despesas) * 100) : 0
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
    return {
      atual: atual,
      anterior: anterior,
      diffReceitas: atual.receitas - anterior.receitas,
      diffDespesas: atual.despesas - anterior.despesas,
      diffSaldo: atual.saldo - anterior.saldo
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RELATORIOS;
}
