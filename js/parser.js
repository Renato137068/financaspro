/**
 * parser.js - Natural language parsing for quick input
 */

var PARSER = {
  padoes: [
    { regex: /(\d+(?:[.,]\d{2})?)\s*(?:reais|real|r\$)?/i, tipo: 'valor' },
    { regex: /(?:ontem|anteontem|hoje|amanhã|segunda|terça|quarta|quinta|sexta|sábado|domingo)/i, tipo: 'data' },
    { regex: /(?:nubank|itaú|itau|caixa|bradesco|santander|banco|bbva)/i, tipo: 'banco' },
    { regex: /(?:crédito|credito|débito|debito)/i, tipo: 'cartao' }
  ],

  extrair: function(texto) {
    var resultado = {valor: null, data: null, banco: null, cartao: null, desc: ''};
    var temp = texto;

    PARSER.padoes.forEach(function(p) {
      var match = temp.match(p.regex);
      if (match) {
        if (p.tipo === 'valor') {
          resultado.valor = parseFloat(match[1].replace(',', '.'));
          temp = temp.replace(match[0], '').trim();
        } else if (p.tipo === 'data') {
          resultado.data = PARSER.parseData(match[0]);
          temp = temp.replace(match[0], '').trim();
        } else if (p.tipo === 'banco') {
          resultado.banco = match[0];
        } else if (p.tipo === 'cartao') {
          resultado.cartao = match[0];
        }
      }
    });

    resultado.desc = temp.trim();
    return resultado;
  },

  parseData: function(str) {
    var hoje = new Date();
    var map = {
      'hoje': 0, 'ontem': 1, 'anteontem': 2,
      'amanhã': -1, 'amanha': -1,
      'segunda': 1, 'terça': 2, 'terca': 2, 'quarta': 3,
      'quinta': 4, 'sexta': 5, 'sábado': 6, 'sabado': 6, 'domingo': 0
    };

    var offset = map[str.toLowerCase()];
    if (offset === undefined) return null;

    var data = new Date(hoje);
    data.setDate(data.getDate() - offset);
    return data.toISOString().split('T')[0];
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PARSER;
}
