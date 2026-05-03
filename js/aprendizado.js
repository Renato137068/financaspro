/**
 * aprendizado.js - Auto-learning from user patterns
 */

var APRENDIZADO = {
  HISTORICO: {},

  init: function() {
    this.HISTORICO = DADOS.obterAprendizado() || {};
  },

  registrar: function(descricao, categoria, banco, cartao) {
    if (!descricao || !categoria) return;
    var palavras = descricao.toLowerCase().split(/\s+/);

    palavras.forEach(function(p) {
      if (p.length < 3) return;
      if (!APRENDIZADO.HISTORICO[p]) APRENDIZADO.HISTORICO[p] = {};
      APRENDIZADO.HISTORICO[p][categoria] = (APRENDIZADO.HISTORICO[p][categoria] || 0) + 1;

      if (banco && !APRENDIZADO.HISTORICO[p]._banco) {
        APRENDIZADO.HISTORICO[p]._banco = banco;
      }
      if (cartao && !APRENDIZADO.HISTORICO[p]._cartao) {
        APRENDIZADO.HISTORICO[p]._cartao = cartao;
      }
    });

    DADOS.salvarAprendizado(APRENDIZADO.HISTORICO);
  },

  sugerir: function(descricao) {
    if (!descricao) return null;
    var palavras = descricao.toLowerCase().split(/\s+/);
    var scores = {}, banco = null, cartao = null;
    var maxScore = 0;

    palavras.forEach(function(p) {
      var hist = APRENDIZADO.HISTORICO[p];
      if (!hist) return;

      Object.keys(hist).forEach(function(cat) {
        if (cat.startsWith('_')) return;
        scores[cat] = (scores[cat] || 0) + hist[cat];
        maxScore = Math.max(maxScore, scores[cat]);
      });

      if (hist._banco) banco = hist._banco;
      if (hist._cartao) cartao = hist._cartao;
    });

    var topCat = null;
    for (var cat in scores) {
      if (scores[cat] === maxScore && maxScore > 0) {
        topCat = cat;
        break;
      }
    }

    return topCat ? {categoria: topCat, banco: banco, cartao: cartao, tipo: 'aprendizado'} : null;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = APRENDIZADO;
}
