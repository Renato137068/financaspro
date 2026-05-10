/**
 * auto-categorizer.js - ML de categorização automática
 * Extraído de categorias.js legado - funcionalidade de aprendizado
 */

const AUTO_CATEGORIZER = {
  REGRAS: [
    { regex: /supermercado|mercado|padaria|açougue|hortifruti|ifood|rappi|delivery|restaurante|lanchonete|café|pizza|hamburguer|sushi|bar|boteco/i, cat: 'alimentacao', tipo: 'despesa' },
    { regex: /uber|99|táxi|taxi|ônibus|metro|metrô|combustivel|combustível|gasolina|estacionamento|pedágio|pedagio|passagem|viajem|aéreo|aereo/i, cat: 'transporte', tipo: 'despesa' },
    { regex: /aluguel|condomínio|condominio|iptu|água|agua|luz|energia|internet|telefone|\bg[aá]s\b|wifi/i, cat: 'moradia', tipo: 'despesa' },
    { regex: /farmácia|farmacia|remédio|remedio|médico|medico|consulta|exame|plano de saúde|hospital|dentista|psicólogo|academia|gym|vitamina/i, cat: 'saude', tipo: 'despesa' },
    { regex: /escola|faculdade|curso|livro|mensalidade|material escolar|udemy|alura|formação/i, cat: 'educacao', tipo: 'despesa' },
    { regex: /cinema|netflix|spotify|steam|jogos|jogo|teatro|show|viagem|hotel|passeio|lazer|recreação/i, cat: 'lazer', tipo: 'despesa' },
    { regex: /salário|salario|pagamento|holerite|13º|13|décimo|bonus|bônus/i, cat: 'salario', tipo: 'receita' },
    { regex: /freelance|projeto|consultoria|honorários|honorarios|freelancer|trabalho/i, cat: 'freelance', tipo: 'receita' },
    { regex: /investimento|rendimento|dividendo|juros|cdb|fundo|renda fixa/i, cat: 'investimentos', tipo: 'receita' }
  ],

  HISTORICO: {},

  init: function() {
    this.analisarHistorico();
  },

  analisarHistorico: function() {
    try {
      if (typeof DADOS === 'undefined') return;
      var transacoes = DADOS.getTransacoes();
      if (!Array.isArray(transacoes)) return;

      this.HISTORICO = {};
      transacoes.forEach(function(t) {
        if (!t.descricao) return;
        var desc = String(t.descricao).toLowerCase().trim();
        var palavras = desc.split(/\s+/);
        palavras.forEach(function(palavra) {
          if (palavra.length > 3) {
            this.HISTORICO[palavra] = this.HISTORICO[palavra] || {};
            this.HISTORICO[palavra][t.categoria] = (this.HISTORICO[palavra][t.categoria] || 0) + 1;
          }
        }.bind(this));
      }.bind(this));
    } catch (e) {
      console.warn('[AUTO_CATEGORIZER] Erro ao analisar histórico:', e);
    }
  },

  detectar: function(descricao) {
    if (!descricao) return null;
    var desc = String(descricao).toLowerCase().trim();

    // Tier 1: Regras predefinidas
    for (var i = 0; i < this.REGRAS.length; i++) {
      if (this.REGRAS[i].regex.test(desc)) {
        return { categoria: this.REGRAS[i].cat, tipo: this.REGRAS[i].tipo, confianca: 'alta' };
      }
    }

    // Tier 2: Aprendizado do histórico
    var palavras = desc.split(/\s+/);
    var candidatos = {};

    palavras.forEach(function(p) {
      if (p.length <= 3) return;
      var mapa = this.HISTORICO[p];
      if (!mapa) return;

      for (var cat in mapa) {
        candidatos[cat] = (candidatos[cat] || 0) + mapa[cat];
      }
    }.bind(this));

    var melhorCat = null, melhorScore = 0;
    for (var cat in candidatos) {
      if (candidatos[cat] > melhorScore) {
        melhorScore = candidatos[cat];
        melhorCat = cat;
      }
    }

    if (melhorCat && melhorScore >= 2) {
      var tipo = CATEGORIES.getTipo(melhorCat) || 'despesa';
      return { categoria: melhorCat, tipo: tipo, confianca: melhorScore >= 4 ? 'media' : 'baixa' };
    }

    return null;
  }
};

// Expor compatibilidade
if (typeof CATEGORIAS !== 'undefined') {
  CATEGORIAS = AUTO_CATEGORIZER;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AUTO_CATEGORIZER;
}
