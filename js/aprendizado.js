/**
 * aprendizado.js - Advanced learning with rich metadata
 */

var APRENDIZADO = {
  HISTORICO: {},
  PRUNE_DIAS: 90, // descarta entradas inativas há 90 dias
  PRUNE_CONTADOR_MIN: 2, // ...se contador < 2
  MAX_ENTRADAS: 5000, // hard cap

  init: function() {
    this.HISTORICO = DADOS.obterAprendizado() || {};
    this.prune();
  },

  prune: function() {
    var keys = Object.keys(this.HISTORICO);
    if (keys.length === 0) return 0;

    var hoje = new Date();
    var cortoMs = this.PRUNE_DIAS * 24 * 60 * 60 * 1000;
    var removidos = 0;
    var self = this;

    keys.forEach(function(k) {
      var h = self.HISTORICO[k];
      if (!h) { delete self.HISTORICO[k]; removidos++; return; }
      var ult = new Date(h.ultimaUsada || 0).getTime();
      var idade = hoje.getTime() - ult;
      if (idade > cortoMs && (h.contador || 0) < self.PRUNE_CONTADOR_MIN) {
        delete self.HISTORICO[k];
        removidos++;
      }
    });

    // Hard cap: mantém top N por contador
    var atual = Object.keys(this.HISTORICO);
    if (atual.length > this.MAX_ENTRADAS) {
      var ordenado = atual.map(function(k){ return [k, self.HISTORICO[k].contador||0]; })
        .sort(function(a,b){ return b[1] - a[1]; });
      var aRemover = ordenado.slice(this.MAX_ENTRADAS);
      aRemover.forEach(function(par){ delete self.HISTORICO[par[0]]; removidos++; });
    }

    if (removidos > 0) DADOS.salvarAprendizado(this.HISTORICO);
    return removidos;
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
        if (banco) hist.banco = banco;
        if (cartao) hist.cartao = cartao;
        if (valor) hist.mediaValor = (hist.mediaValor * (hist.contador - 1) + valor) / hist.contador;
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
      if (p.length < 3) return;

      if (APRENDIZADO.HISTORICO[p]) {
        candidatos.push(APRENDIZADO.HISTORICO[p]);
      }
      if (!APRENDIZADO.HISTORICO[p]) {
        var prefixo = p + '__';
        var chaves = Object.keys(APRENDIZADO.HISTORICO);
        for (var i = 0; i < chaves.length; i++) {
          if (chaves[i].indexOf(prefixo) === 0) {
            candidatos.push(APRENDIZADO.HISTORICO[chaves[i]]);
          }
        }
      }
    });

    if (candidatos.length === 0) return null;

    // Score = contador - penalidades (correções negativas)
    return candidatos.reduce(function(a, b) {
      var sa = (a.contador || 0) - (a.penalidades || 0) * 2;
      var sb = (b.contador || 0) - (b.penalidades || 0) * 2;
      return sa >= sb ? a : b;
    });
  },

  // Feedback loop: chamado quando usuário corrige uma sugestão.
  // Penaliza palavras associadas à categoria errada, reforça a correta.
  registrarCorrecao: function(desc, categoriaErrada, categoriaCorreta) {
    if (!desc || !categoriaErrada || !categoriaCorreta) return;
    if (categoriaErrada === categoriaCorreta) return;

    var palavras = desc.toLowerCase().split(/\s+/);
    var alterou = false;

    palavras.forEach(function(p) {
      if (p.length < 3) return;

      // Penaliza entrada da categoria errada
      var entrada = APRENDIZADO.HISTORICO[p];
      if (entrada && entrada.categoria === categoriaErrada) {
        entrada.penalidades = (entrada.penalidades || 0) + 1;
        alterou = true;
      }
      var altErrada = p + '__' + categoriaErrada;
      if (APRENDIZADO.HISTORICO[altErrada]) {
        APRENDIZADO.HISTORICO[altErrada].penalidades = (APRENDIZADO.HISTORICO[altErrada].penalidades || 0) + 1;
        alterou = true;
      }
    });

    if (alterou) DADOS.salvarAprendizado(this.HISTORICO);
    // Reforço da correta acontece via registrar() chamado no submit normal
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = APRENDIZADO;
}
