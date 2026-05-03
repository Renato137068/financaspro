/**
 * score.js - Unified confidence scoring
 */

var SCORE = {
  _cache: {},

  calcular: function(fuzzy, aprendizado, contextual) {
    var key = (fuzzy?.categoria || '') + ':' + (aprendizado?.categoria || '');
    if (this._cache[key]) return this._cache[key];

    var pesos = {fuzzy: 0.5, aprendizado: 0.35, contextual: 0.15};
    var scoreFuzzy = fuzzy ? (fuzzy.confianca === 'alta' ? 0.9 : 0.6) : 0;
    var scoreAprend = aprendizado ? 0.8 : 0;
    var scoreCtx = contextual ? 0.7 : 0;

    var total = (scoreFuzzy * pesos.fuzzy) +
                (scoreAprend * pesos.aprendizado) +
                (scoreCtx * pesos.contextual);

    var confianca = total > 0.75 ? 'alta' : total > 0.5 ? 'media' : 'baixa';
    var categoria = fuzzy?.categoria || aprendizado?.categoria;
    var tipo = fuzzy?.tipo || aprendizado?.tipo || 'despesa';
    var fonte = fuzzy && fuzzy.confianca === 'alta' ? 'fuzzy' : 'aprendizado';

    var resultado = {
      score: parseFloat(total.toFixed(2)),
      categoria: categoria,
      tipo: tipo,
      confianca: confianca,
      fonte: fonte
    };

    this._cache[key] = resultado;
    return resultado;
  },

  limparCache: function() {
    if (Object.keys(this._cache).length > 500) {
      this._cache = {};
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SCORE;
}
