/**
 * score.js - Unified confidence scoring
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */

const SCORE = {
  _cache: new Map(),
  _CACHE_MAX: 500,

  calcular: function(fuzzy, aprendizado, contextual) {
    var fScore = fuzzy ? (fuzzy.confianca === 'alta' ? 0.9 : 0.6) : 0;
    var aScore = aprendizado ? Math.min(0.5 + (aprendizado.contador || 1) * 0.05, 0.95) : 0;
    var cScore = contextual ? 0.7 : 0;

    // A chave precisa capturar tudo que o resultado carrega — não só os pesos
    // numéricos. categoria/tipo vêm de fuzzy/aprendizado e NÃO entram em
    // fScore/aScore/cScore: sem eles, "Uber" e "Netflix" (ambos fuzzy alta,
    // sem aprendizado) colidiam na chave "0.9:0:0" e o segundo herdava a
    // categoria do primeiro na entrada rápida.
    var key = [
      fScore, aScore, cScore,
      (fuzzy && fuzzy.categoria) || '', (fuzzy && fuzzy.tipo) || '',
      (aprendizado && aprendizado.categoria) || '', (aprendizado && aprendizado.tipo) || ''
    ].join('|');
    if (SCORE._cache.has(key)) {
      var hit = SCORE._cache.get(key);
      SCORE._cache.delete(key);
      SCORE._cache.set(key, hit);
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

    SCORE._cache.set(key, resultado);
    if (SCORE._cache.size > SCORE._CACHE_MAX) {
      var oldest = SCORE._cache.keys().next().value;
      SCORE._cache.delete(oldest);
    }
    return resultado;
  },

  limparCache: function() {
    if (SCORE._cache.size > SCORE._CACHE_MAX) SCORE._cache.clear();
  }
};

export { SCORE };
export default SCORE;
