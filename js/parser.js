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

  /**
   * Converte um token numérico brasileiro em número.
   *
   * Trata os quatro formatos que aparecem de verdade:
   *   "32,90"     -> 32.90   (vírgula decimal)
   *   "32.90"     -> 32.90   (ponto decimal)
   *   "1.250,00"  -> 1250.00 (ponto de milhar + vírgula decimal)
   *   "45.000"    -> 45000   (ponto de milhar sem centavos)
   *
   * A regra que desambigua ponto de milhar de ponto decimal: milhar sempre vem
   * em grupos de exatamente 3 dígitos até o fim do token.
   *
   * @returns {number|null} null se não for um número reconhecível
   */
  _paraNumero: function(token) {
    var t = String(token).replace(/^r\$\s*/i, '').trim();
    if (!/^\d[\d.,]*$/.test(t)) return null;

    var temVirgula = t.indexOf(',') !== -1;
    var temPonto = t.indexOf('.') !== -1;
    var normalizado;

    if (temVirgula && temPonto) {
      // "1.250,00" — ponto é milhar, vírgula é decimal.
      normalizado = t.replace(/\./g, '').replace(',', '.');
    } else if (temVirgula) {
      normalizado = t.replace(',', '.');
    } else if (temPonto) {
      // "45.000" é milhar; "32.90" é decimal. Grupos de 3 até o fim = milhar.
      normalizado = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
    } else {
      normalizado = t;
    }

    var n = parseFloat(normalizado);
    return isFinite(n) ? n : null;
  },

  extrair: function(texto) {
    // Só espaço separa tokens. Incluir a vírgula aqui quebrava todo valor com
    // centavos: "Uber 32,90" virava ['uber','32','90'], os dois números casavam
    // com /^\d+$/ e o ÚLTIMO vencia — o app gravava R$ 90,00 em silêncio.
    var tokens = String(texto || '').toLowerCase().split(/\s+/);
    var r = {valor: null, desc: [], data: null, banco: null, cartao: null};

    // Bancos dinâmicos do config + fixos
    var config = typeof DADOS !== 'undefined' ? DADOS.getConfig() : {};
    // config.bancos tem duas formas: strings (legado) e { nome, tipo } (atual).
    // Chamar b.toLowerCase() direto estourava para quem tinha cadastrado um
    // banco pela tela de configurações — e derrubava a entrada rápida inteira.
    var nomeDe = function(b) {
      if (typeof UTILS !== 'undefined' && typeof UTILS.nomeDeConta === 'function') {
        return UTILS.nomeDeConta(b);
      }
      if (typeof b === 'string') return b.trim();
      return (b && typeof b.nome === 'string') ? b.nome.trim() : '';
    };
    var bancosUser = (config.bancos || [])
      .map(function(b) { return nomeDe(b).toLowerCase(); })
      .filter(Boolean);
    var bancosFixos = ['nubank','itaú','itau','caixa','bradesco','santander','bbva','inter','sicredi'];
    var todosBancos = bancosFixos.concat(bancosUser);

    tokens.forEach(function(token) {
      if (!token) return;

      // Pontuação de fim de frase não pode virar parte do token.
      token = token.replace(/[;:!?]+$/, '').replace(/(?![\d])[.,]+$/, '');
      if (!token) return;

      var num = PARSER._paraNumero(token);
      // Primeiro valor vence: em "paguei 32,90 no uber 2x", o 2 não sobrescreve.
      if (num !== null) {
        if (r.valor === null) r.valor = num;
        return;
      }

      if (token.length < 2) return;

      if (/^(hoje|ontem|anteontem|amanhã?|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)$/.test(token)) {
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

  /**
   * Formata uma data como YYYY-MM-DD no fuso LOCAL.
   *
   * `toISOString()` converte para UTC: em America/Sao_Paulo (UTC-3), tudo
   * lançado depois das 21h saía com a data do dia seguinte. A pessoa registra
   * o jantar e ele aparece amanhã — no extrato, no orçamento e no gráfico.
   *
   * Delega a UTILS quando disponível; a cópia local existe porque parser.js é
   * carregado em contexto de teste sem UTILS.
   */
  _iso: function(d) {
    if (typeof UTILS !== 'undefined' && typeof UTILS.dataLocalIso === 'function') {
      return UTILS.dataLocalIso(d);
    }
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  },

  parseData: function(str) {
    var hoje = new Date();
    var dow = hoje.getDay();
    var s = String(str || '').toLowerCase();

    var offsets = {'hoje': 0, 'ontem': 1, 'anteontem': 2, 'amanhã': -1, 'amanha': -1};
    if (offsets[s] !== undefined) {
      var d = new Date(hoje);
      d.setDate(d.getDate() - offsets[s]);
      return PARSER._iso(d);
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
      return PARSER._iso(d2);
    }

    return null;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PARSER;
}
