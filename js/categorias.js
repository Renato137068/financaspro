/**
 * categorias.js - Auto-categorization by description keywords
 * Tier 0.5: Depends on config.js only
 */

var CATEGORIAS = {
  REGRAS: [
    // === RECEITAS ===
    { regex: /sal[aá]rio|holerite|pagamento\s*(mensal|quinzenal)|contracheque|vencimento/i, tipo: 'receita', categoria: 'salario' },
    { regex: /freelance|freela|job\s*extra|bico|servi[cç]o\s*avulso/i, tipo: 'receita', categoria: 'salario' },
    { regex: /rendimento|dividendo|juros|a[cç][oõ]es|fii|fundo|cdb|tesouro|poupan[cç]a|invest/i, tipo: 'receita', categoria: 'salario' },
    { regex: /venda|vendas|mercado\s*livre|olx|shopee/i, tipo: 'receita', categoria: 'salario' },
    { regex: /reembolso|devolu[cç][aã]o|estorno|cashback/i, tipo: 'receita', categoria: 'salario' },

    // === DESPESAS: Alimentação ===
    { regex: /supermercado|hortifruti|a[cç]ougue|padaria|feira/i, tipo: 'despesa', categoria: 'alimentacao' },
    { regex: /restaurante|lanche|almo[cç]o|janta|jantar|caf[eé]|pizza|hamburguer|sushi|ifood|rappi|uber\s*eats/i, tipo: 'despesa', categoria: 'alimentacao' },
    { regex: /comida|refei[cç][aã]o|marmita|delivery|entrega\s*comida/i, tipo: 'despesa', categoria: 'alimentacao' },

    // === DESPESAS: Transporte ===
    { regex: /\buber\b|99|cabify|taxi|t[aá]xi|corrida/i, tipo: 'despesa', categoria: 'transporte' },
    { regex: /gasolina|combustivel|combust[ií]vel|etanol|alcool|[aá]lcool|diesel|abastec/i, tipo: 'despesa', categoria: 'transporte' },
    { regex: /[oô]nibus|metr[oô]|trem|barca|bals[ao]|passagem|bilhete\s*[uú]nico|\bvt\b|vale\s*transporte/i, tipo: 'despesa', categoria: 'transporte' },
    { regex: /estacionamento|ped[aá]gio|ipva|licenciamento|seguro\s*(auto|carro|ve[ií]culo)/i, tipo: 'despesa', categoria: 'transporte' },

    // === DESPESAS: Moradia ===
    { regex: /aluguel|condom[ií]nio|iptu|\bagua\b|\b[aá]gua\b|luz|energia|el[eé]trica|\bg[aá]s\b|internet|wifi|wi-fi/i, tipo: 'despesa', categoria: 'moradia' },
    { regex: /reforma|manuten[cç][aã]o\s*(casa|apt)|conserto|encanador|eletricista|pintor|marceneiro/i, tipo: 'despesa', categoria: 'moradia' },
    { regex: /m[oó]vel|m[oó]veis|eletrodom[eé]stico|decora[cç][aã]o/i, tipo: 'despesa', categoria: 'moradia' },

    // === DESPESAS: Saúde ===
    { regex: /farm[aá]cia|rem[eé]dio|medicamento|droga\s*ria|drogasil|raia|pague\s*menos/i, tipo: 'despesa', categoria: 'saude' },
    { regex: /m[eé]dico|consulta|exame|dentista|hospital|cl[ií]nica|psic[oó]logo|fisioterapia|terapia/i, tipo: 'despesa', categoria: 'saude' },
    { regex: /plano\s*de\s*sa[uú]de|unimed|amil|bradesco\s*sa[uú]de|sul\s*am[eé]rica/i, tipo: 'despesa', categoria: 'saude' },
    { regex: /academia|gym|crossfit|nutri[cç][aã]o|suplemento/i, tipo: 'despesa', categoria: 'saude' },

    // === DESPESAS: Lazer ===
    { regex: /cinema|teatro|show|concerto|ingresso|evento/i, tipo: 'despesa', categoria: 'lazer' },
    { regex: /netflix|spotify|disney|hbo|prime\s*video|youtube\s*premium|streaming|deezer|apple\s*music/i, tipo: 'despesa', categoria: 'lazer' },
    { regex: /viagem|hotel|pousada|airbnb|passagem\s*a[eé]rea|voo|hospedagem/i, tipo: 'despesa', categoria: 'lazer' },
    { regex: /jogo|game|playstation|xbox|nintendo|steam|bar|balada|festa|cerveja|bebida/i, tipo: 'despesa', categoria: 'lazer' },
    { regex: /livro|revista|kindle|assinatura/i, tipo: 'despesa', categoria: 'lazer' }
  ],

  detectar: function(descricao) {
    if (!descricao || typeof descricao !== 'string') return null;
    var texto = descricao.trim();
    if (texto.length < 2) return null;
    for (var i = 0; i < this.REGRAS.length; i++) {
      if (this.REGRAS[i].regex.test(texto)) {
        return { tipo: this.REGRAS[i].tipo, categoria: this.REGRAS[i].categoria };
      }
    }
    return null;
  },

  sugerirCategoria: function(descricao, tipoAtual) {
    var result = this.detectar(descricao);
    if (!result) return null;
    return { tipo: result.tipo, categoria: result.categoria };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CATEGORIAS;
}
