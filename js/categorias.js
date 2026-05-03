/**
 * categorias.js - Auto-categorization with ML learning
 * Tier 1: Depends on config.js, dados.js
 */

var CATEGORIAS = (function() {
  var REGRAS = [
    { regex: /supermercado|mercado|padaria|açougue|hortifruti|ifood|rappi|delivery|restaurante|lanchonete|café|pizza|hamburguer|sushi|bar|boteco/i, cat: 'alimentacao', tipo: 'despesa' },
    { regex: /uber|99|táxi|taxi|ônibus|metro|metrô|combustivel|combustível|gasolina|estacionamento|pedágio|pedagio|passagem|viajem|aéreo|aereo/i, cat: 'transporte', tipo: 'despesa' },
    { regex: /aluguel|condomínio|condominio|iptu|água|agua|luz|energia|internet|telefone|gas|gás|wifi/i, cat: 'moradia', tipo: 'despesa' },
    { regex: /farmácia|farmacia|remédio|remedio|médico|medico|consulta|exame|plano de saúde|hospital|dentista|psicólogo|psicólogo|vitamina/i, cat: 'saude', tipo: 'despesa' },
    { regex: /escola|faculdade|curso|livro|mensalidade|material escolar|udemy|alura|formação/i, cat: 'educacao', tipo: 'despesa' },
    { regex: /cinema|netflix|spotify|steam|jogos|jogo|teatro|show|viagem|hotel|passeio|academia|gym|lazer|recreação/i, cat: 'lazer', tipo: 'despesa' },
    { regex: /salário|salario|pagamento|holerite|13º|13|décimo|bonus|bônus/i, cat: 'salario', tipo: 'receita' },
    { regex: /freelance|projeto|consultoria|honorários|honorarios|freelancer|trabalho/i, cat: 'freelance', tipo: 'receita' },
    { regex: /investimento|rendimento|dividendo|juros|cdb|fundo|renda fixa/i, cat: 'investimentos', tipo: 'receita' },
  ];

  var HISTORICO = {};

  return {
    init: function() {
      this.analisarHistorico();
    },

    // Aprende padrões do histórico
    analisarHistorico: function() {
      if (typeof DADOS === 'undefined') return;
      var transacoes = DADOS.getTransacoes();
      HISTORICO = {};
      transacoes.forEach(function(t) {
        var desc = String(t.descricao).toLowerCase().trim();
        var palavras = desc.split(/\s+/);
        palavras.forEach(function(palavra) {
          if (palavra.length > 3) {
            HISTORICO[palavra] = HISTORICO[palavra] || {};
            HISTORICO[palavra][t.categoria] = (HISTORICO[palavra][t.categoria] || 0) + 1;
          }
        });
      });
    },

    // Detectar categoria por regra + histórico
    detectar: function(descricao) {
      if (!descricao) return null;

      var resultado = null;
      for (var i = 0; i < REGRAS.length; i++) {
        if (REGRAS[i].regex.test(descricao)) {
          resultado = { categoria: REGRAS[i].cat, tipo: REGRAS[i].tipo, confianca: 'alta' };
          break;
        }
      }

      // Se não achou regra, busca no histórico
      if (!resultado) {
        var palavras = descricao.toLowerCase().split(/\s+/);
        var votos = {};
        palavras.forEach(function(palavra) {
          if (HISTORICO[palavra]) {
            Object.keys(HISTORICO[palavra]).forEach(function(cat) {
              votos[cat] = (votos[cat] || 0) + HISTORICO[palavra][cat];
            });
          }
        });

        if (Object.keys(votos).length > 0) {
          var topCat = Object.keys(votos).reduce(function(a, b) {
            return votos[a] > votos[b] ? a : b;
          });
          resultado = { categoria: topCat, tipo: 'despesa', confianca: 'media' };
        }
      }

      return resultado;
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CATEGORIAS;
}
