/**
 * score.js - Unified confidence scoring
 *
 * Quando há aprendizado útil (uso reforçado ou correção do usuário), a
 * categoria do aprendizado VENCE o fuzzy — o usuário ensinou o app.
 */

var SCORE = {
  _cache: new Map(),
  _CACHE_MAX: 500,

  _netAprendizado: function(aprendizado) {
    if (!aprendizado) return 0;
    // Mesmo default do aScore: entrada sem contador conta como 1 uso
    var c = (aprendizado.contador == null) ? 1 : aprendizado.contador;
    return c - (aprendizado.penalidades || 0) * 2;
  },

  _aprendizadoManda: function(aprendizado) {
    if (!aprendizado || !aprendizado.categoria) return false;
    if (aprendizado.fraseExata || aprendizado.correcao) return true;
    return this._netAprendizado(aprendizado) > 0;
  },

  calcular: function(fuzzy, aprendizado, contextual) {
    var fScore = fuzzy ? (fuzzy.confianca === 'alta' ? 0.9 : 0.6) : 0;
    var aScore = aprendizado ? Math.min(0.5 + (aprendizado.contador || 1) * 0.05, 0.95) : 0;
    var cScore = contextual ? 0.7 : 0;

    var key = fScore + ':' + aScore + ':' + cScore + ':' +
      ((fuzzy && fuzzy.categoria) || '') + ':' + ((aprendizado && aprendizado.categoria) || '') +
      ':' + (!!this._aprendizadoManda(aprendizado));
    if (this._cache.has(key)) {
      var hit = this._cache.get(key);
      this._cache.delete(key);
      this._cache.set(key, hit);
      return hit;
    }

    var total = fScore * 0.5 + aScore * 0.35 + cScore * 0.15;
    var manda = this._aprendizadoManda(aprendizado);
    var categoria;
    var tipo;
    var fonte;

    if (manda) {
      categoria = aprendizado.categoria;
      tipo = aprendizado.tipo || 'despesa';
      fonte = 'aprendizado';
      // Correção explícita / frase exata: confiança alta o bastante para autopreencher
      if (aprendizado.fraseExata || aprendizado.correcao || this._netAprendizado(aprendizado) >= 2) {
        total = Math.max(total, 0.76);
      } else {
        total = Math.max(total, 0.51);
      }
    } else {
      categoria = (fuzzy && fuzzy.categoria) || (aprendizado && aprendizado.categoria);
      tipo = (fuzzy && fuzzy.tipo) || (aprendizado && aprendizado.tipo) || 'despesa';
      fonte = (fuzzy && fuzzy.confianca === 'alta') ? 'fuzzy' : 'aprendizado';
    }

    var resultado = {
      score     : parseFloat(total.toFixed(2)),
      categoria : categoria,
      tipo      : tipo,
      confianca : total > 0.75 ? 'alta' : total > 0.5 ? 'media' : 'baixa',
      fonte     : fonte
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
