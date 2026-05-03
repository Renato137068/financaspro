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
    var r = {valor: null, desc: [], data: null, banco: null, cartao: null};

    // Bancos dinâmicos do config + fixos
    var config = typeof DADOS !== 'undefined' ? DADOS.getConfig() : {};
    var bancosUser = (config.bancos || []).map(function(b) { return b.toLowerCase(); });
    var bancosFixos = ['nubank','itaú','itau','caixa','bradesco','santander','bbva','inter','sicredi'];
    var todosBancos = bancosFixos.concat(bancosUser);

    tokens.forEach(function(token) {
      if (!token || token.length < 2) return;

      if (/^\d+([.,]\d{1,2})?$/.test(token)) {
        r.valor = parseFloat(token.replace(',', '.'));
      } else if (/^(hoje|ontem|anteontem|amanhã?|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)$/.test(token)) {
        r.data = PARSER.parseData(token);
      } else if (todosBancos.indexOf(token) !== -1) {
        r.banco = token;
      } else if (/^(cr[eé]dito|d[eé]bito)$/.test(token)) {
        r.cartao = token;
      } else if (token.length >= 3) {
        r.desc.push(token);
      }
    });

    r.desc = r.desc.join(' ');
    return r;
  },

  parseData: function(str) {
    var hoje = new Date();
    var dow  = hoje.getDay();
    var s    = str.toLowerCase();

    var offsets = {'hoje': 0, 'ontem': 1, 'anteontem': 2, 'amanhã': -1, 'amanha': -1};
    if (offsets[s] !== undefined) {
      var d = new Date(hoje);
      d.setDate(d.getDate() - offsets[s]);
      return d.toISOString().split('T')[0];
    }

    var diasSemana = {
      'domingo': 0, 'segunda': 1, 'terca': 2, 'terça': 2,
      'quarta': 3, 'quinta': 4, 'sexta': 5, 'sabado': 6, 'sábado': 6
    };
    if (diasSemana[s] !== undefined) {
      var alvo = diasSemana[s];
      var diff = (dow - alvo + 7) % 7 || 7; // Sempre para trás, mínimo 1 dia
      var d2 = new Date(hoje);
      d2.setDate(d2.getDate() - diff);
      return d2.toISOString().split('T')[0];
    }

    return null;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PARSER;
}
