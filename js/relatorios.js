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
  },

  /** Despesa do mês por categoria, em centavos inteiros. */
  _despesaPorCategoria: function(mes, ano) {
    var porCat = {};
    if (typeof TRANSACOES === 'undefined') return porCat;
    TRANSACOES.obter({ mes: mes, ano: ano }).forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_RECEITA) return;
      var cat = t.categoria || 'outro';
      porCat[cat] = (porCat[cat] || 0) + UTILS.paraCentavos(t.valor);
    });
    return porCat;
  },

  /**
   * Média de gasto por categoria nos N meses ANTERIORES ao mês consultado,
   * confrontada com o gasto do próprio mês — a linha de base pessoal que
   * responde "estou gastando mais do que o meu normal nisto?" sem exigir que o
   * usuário configure orçamento algum. Distinta de compararMesAnterior (que
   * olha só o mês passado) e da previsão por ritmo/IA (que projeta o futuro).
   *
   * A média usa denominador fixo (a janela): um mês sem gasto na categoria
   * conta como zero, porque foi isso que aconteceu. Para não disparar alarme
   * falso numa categoria que só apareceu uma vez, cada item traz mesesComDados
   * — quem consome decide o corte.
   *
   * @param {number} mes 1-12
   * @param {number} ano
   * @param {number} [janela=3] meses de referência
   * @returns {Array<{categoria:string, label:string, atual:number, media:number,
   *   diff:number, variacao:?number, mesesComDados:number}>} maior desvio (R$) primeiro
   */
  mediaPorCategoria: function(mes, ano, janela) {
    if (typeof TRANSACOES === 'undefined') return [];
    var meses = (janela && janela > 0) ? janela : 3;

    var atualCent = this._despesaPorCategoria(mes, ano);

    var somaAntCent = {};
    var mesesComDado = {};
    var m = mes, a = ano;
    for (var i = 0; i < meses; i++) {
      m -= 1;
      if (m < 1) { m = 12; a -= 1; }
      var porCat = this._despesaPorCategoria(m, a);
      Object.keys(porCat).forEach(function(cat) {
        somaAntCent[cat] = (somaAntCent[cat] || 0) + porCat[cat];
        mesesComDado[cat] = (mesesComDado[cat] || 0) + 1;
      });
    }

    var cats = {};
    Object.keys(atualCent).forEach(function(c) { cats[c] = true; });
    Object.keys(somaAntCent).forEach(function(c) { cats[c] = true; });

    var lista = Object.keys(cats).map(function(cat) {
      var atual = atualCent[cat] || 0;
      var mediaCent = Math.round((somaAntCent[cat] || 0) / meses);
      var diff = atual - mediaCent;
      return {
        categoria: cat,
        label: (typeof CONFIG !== 'undefined' && CONFIG.getCatLabel) ? CONFIG.getCatLabel(cat) : cat,
        atual: atual / 100,
        media: mediaCent / 100,
        diff: diff / 100,
        variacao: mediaCent > 0 ? Math.round((diff / mediaCent) * 100) : null,
        mesesComDados: mesesComDado[cat] || 0
      };
    });

    lista.sort(function(x, y) { return Math.abs(y.diff) - Math.abs(x.diff); });
    return lista;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RELATORIOS;
}
