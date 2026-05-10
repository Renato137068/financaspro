/**
 * score.js - Unified confidence scoring
 */

var SCORE = {
  _cache: new Map(),
  _CACHE_MAX: 500,

  calcular: function(fuzzy, aprendizado, contextual) {
    var fScore = fuzzy ? (fuzzy.confianca === 'alta' ? 0.9 : 0.6) : 0;
    var aScore = aprendizado ? Math.min(0.5 + (aprendizado.contador || 1) * 0.05, 0.95) : 0;
    var cScore = contextual ? 0.7 : 0;

    var key = fScore + ':' + aScore + ':' + cScore;
    if (this._cache.has(key)) {
      var hit = this._cache.get(key);
      this._cache.delete(key);
      this._cache.set(key, hit);
      return hit;
    }

    var total = fScore * 0.5 + aScore * 0.35 + cScore * 0.15;

    var resultado = {
      score     : parseFloat(total.toFixed(2)),
      categoria : (fuzzy && fuzzy.categoria) || (aprendizado && aprendizado.categoria),
      tipo      : (fuzzy && fuzzy.tipo) || (aprendizado && aprendizado.tipo) || 'despesa',
      confianca : total > 0.75 ? 'alta' : total > 0.5 ? 'media' : 'baixa',
      fonte     : (fuzzy && fuzzy.confianca === 'alta') ? 'fuzzy' : 'aprendizado'
    };

    this._cache.set(key, resultado);
    if (this._cache.size > this._CACHE_MAX) {
      var oldest = this._cache.keys().next().value;
      this._cache.delete(oldest);
    }
    return resultado;
  },

  limparCache: function() {
    if (this._cache.size > this._CACHE_MAX) this._cache.clear();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SCORE;
}
