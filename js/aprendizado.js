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
          categoria: categoria, tipo: tipo || 'despesa',
          banco: banco || null, cartao: cartao || null,
          contador: 1, mediaValor: valor || 0,
          ultimaUsada: hoje, primeiraUsada: hoje
        };
      } else if (hist.categoria === categoria) {
        // Reforça entrada existente
        hist.contador++;
        hist.ultimaUsada = hoje;
        if (banco)  hist.banco  = banco;
        if (cartao) hist.cartao = cartao;
        if (valor)  hist.mediaValor = (hist.mediaValor * (hist.contador - 1) + valor) / hist.contador;
      } else {
        // Categoria diferente → entrada alternativa (evita sobreposição)
        var altKey = p + '__' + categoria;
        if (!APRENDIZADO.HISTORICO[altKey]) {
          APRENDIZADO.HISTORICO[altKey] = {
            categoria: categoria, tipo: tipo || 'despesa',
            banco: banco || null, cartao: cartao || null,
            contador: 1, mediaValor: valor || 0,
            ultimaUsada: hoje, primeiraUsada: hoje
          };
        } else {
          APRENDIZADO.HISTORICO[altKey].contador++;
          APRENDIZADO.HISTORICO[altKey].ultimaUsada = hoje;
        }
      }
    });

    DADOS.salvarAprendizado(APRENDIZADO.HISTORICO);
  },

  sugerir: function(desc) {
    if (!desc) return null;
    var tokens = desc.toLowerCase().split(/\s+/);
    var candidatos = [];

    tokens.forEach(function(p) {
      Object.keys(APRENDIZADO.HISTORICO).forEach(function(key) {
        if (key === p || key.startsWith(p + '__')) {
          candidatos.push(APRENDIZADO.HISTORICO[key]);
        }
      });
    });

    if (candidatos.length === 0) return null;
    return candidatos.reduce(function(a, b) {
      return a.contador > b.contador ? a : b;
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = APRENDIZADO;
}
