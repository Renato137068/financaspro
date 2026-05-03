/**
 * pipeline.js - Unified processing pipeline
 */

var PIPELINE = {
  processar: function(input) {
    if (!input || input.length < 2) return null;

    var parsed = PARSER.extrair(input);
    var aprendizado = APRENDIZADO.sugerir(parsed.desc);
    var fuzzy = typeof CATEGORIZADOR !== 'undefined' ? CATEGORIZADOR.detectar(parsed.desc) : null;

    var score = SCORE.calcular(fuzzy, aprendizado);

    return {
      categoria: score.categoria,
      tipo: score.tipo,
      banco: parsed.banco || aprendizado?.banco,
      cartao: parsed.cartao || aprendizado?.cartao,
      valor: parsed.valor,
      data: parsed.data,
      descricao: parsed.desc,
      confianca: score.confianca,
      fonte: score.fonte,
      score: score.score
    };
  },

  preencherForm: function(resultado) {
    if (!resultado) return false;

    if (resultado.categoria) {
      DOMUTILS.set('novo-categoria', resultado.categoria);
      DOMUTILS.set('novo-tipo', resultado.tipo);
    }
    if (resultado.banco) {
      DOMUTILS.set('novo-banco', resultado.banco);
    }
    if (resultado.cartao) {
      DOMUTILS.set('novo-cartao', resultado.cartao);
    }
    if (resultado.valor && !DOMUTILS.get('novo-valor').value) {
      var valorStr = resultado.valor.toFixed(2).replace('.', ',');
      DOMUTILS.set('novo-valor', valorStr);
    }
    if (resultado.data && !DOMUTILS.get('novo-data').value) {
      DOMUTILS.set('novo-data', resultado.data);
    }

    atualizarBadgeConfianca(resultado.confianca);
    return true;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PIPELINE;
}
