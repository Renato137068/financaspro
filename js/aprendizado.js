/**
 * aprendizado.js - Advanced learning with rich metadata
 */

var APRENDIZADO = {
  HISTORICO: {},

  init: function() {
    this.HISTORICO = DADOS.obterAprendizado() || {};
  },

  registrar: function(desc, categoria, tipo, banco, cartao, valor) {
    if (!desc || !categoria) return;
    var palavras = desc.toLowerCase().split(/\s+/);
    var hoje = new Date().toISOString().split('T')[0];

    palavras.forEach(function(p) {
      if (p.length < 3) return;

      var hist = APRENDIZADO.HISTORICO[p];
      if (!hist) {
        APRENDIZADO.HISTORICO[p] = {
          categoria: categoria,
          tipo: tipo || 'despesa',
          banco: banco || null,
          cartao: cartao || null,
          frequencia: 'mensal',
          ultimaUsada: hoje,
          contador: 1,
          mediaValor: valor || 0,
          primeiraUsada: hoje
        };
      } else {
        hist.contador++;
        hist.ultimaUsada = hoje;
        if (valor) {
          hist.mediaValor = (hist.mediaValor * (hist.contador - 1) + valor) / hist.contador;
        }
      }
    });

    DADOS.salvarAprendizado(APRENDIZADO.HISTORICO);
  },

  sugerir: function(desc) {
    if (!desc) return null;
    var palavras = desc.toLowerCase().split(/\s+/);
    var sugestoes = [];

    palavras.forEach(function(p) {
      if (APRENDIZADO.HISTORICO[p]) {
        sugestoes.push(APRENDIZADO.HISTORICO[p]);
      }
    });

    if (sugestoes.length === 0) return null;

    var melhor = sugestoes.reduce(function(a, b) {
      return a.contador > b.contador ? a : b;
    });

    return melhor;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = APRENDIZADO;
}
