/**
 * score.js - Unified confidence scoring
 */

var SCORE = {
  _cache: {},

  calcular: function(fuzzy, aprendizado, contextual) {
    var fScore = fuzzy      ? (fuzzy.confianca === 'alta' ? 0.9 : 0.6) : 0;
    var aScore = aprendizado ? Math.min(0.5 + (aprendizado.contador || 1) * 0.05, 0.95) : 0;
    var cScore = contextual  ? 0.7 : 0;

    var key = fScore + ':' + aScore + ':' + cScore;
    if (this._cache[key]) return this._cache[key];

    var total = fScore * 0.5 + aScore * 0.35 + cScore * 0.15;

    var resultado = {
      score     : parseFloat(total.toFixed(2)),
      categoria : (fuzzy && fuzzy.categoria) || (aprendizado && aprendizado.categoria),
      tipo      : (fuzzy && fuzzy.tipo)      || (aprendizado && aprendizado.tipo) || 'despesa',
      confianca : total > 0.75 ? 'alta' : total > 0.5 ? 'media' : 'baixa',
      fonte     : (fuzzy && fuzzy.confianca === 'alta') ? 'fuzzy' : 'aprendizado'
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
