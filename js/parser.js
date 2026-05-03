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
    var tokens = texto.toLowerCase().split(/[\s,]+/);
    var resultado = {valor: null, desc: [], data: null, banco: null, cartao: null};

    tokens.forEach(function(token) {
      if (!token) return;

      // Valor
      if (/^\d+([.,]\d{2})?$/.test(token)) {
        resultado.valor = parseFloat(token.replace(',', '.'));
      }
      // Data
      else if (/^(hoje|ontem|amanhã|amanha|segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)$/.test(token)) {
        resultado.data = PARSER.parseData(token);
      }
      // Banco
      else if (/^(nubank|itaú|itau|caixa|bradesco|santander|banco|bbva)$/.test(token)) {
        resultado.banco = token;
      }
      // Cartão
      else if (/^(crédito|débito|credito|debito)$/.test(token)) {
        resultado.cartao = token;
      }
      // Descrição
      else if (token.length > 2) {
        resultado.desc.push(token);
      }
    });

    resultado.desc = resultado.desc.join(' ');
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
