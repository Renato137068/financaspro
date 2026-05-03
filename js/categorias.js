/**
 * categorias.js - Auto-categorization by description keywords
 * Tier 1: Depends on config.js
 */

var CATEGORIAS = (function() {
  var REGRAS = [
    { regex: /supermercado|mercado|padaria|açougue|hortifruti|ifood|rappi|delivery|restaurante|lanchonete|café|pizza|hamburguer|sushi/i, cat: 'alimentacao' },
    { regex: /uber|99|táxi|taxi|ônibus|metro|metrô|combustivel|combustível|gasolina|estacionamento|pedágio|pedagio|passagem/i, cat: 'transporte' },
    { regex: /aluguel|condomínio|condominio|iptu|água|agua|luz|energia|internet|telefone|gas|gás/i, cat: 'moradia' },
    { regex: /farmácia|farmacia|remédio|remedio|médico|medico|consulta|exame|plano de saúde|hospital|dentista/i, cat: 'saude' },
    { regex: /escola|faculdade|curso|livro|mensalidade|material escolar|udemy|alura/i, cat: 'educacao' },
    { regex: /cinema|netflix|spotify|steam|jogos|jogo|teatro|show|viagem|hotel|passeio|academia|gym/i, cat: 'lazer' },
    { regex: /salário|salario|pagamento|holerite/i, cat: 'salario' },
    { regex: /freelance|projeto|consultoria|honorários|honorarios/i, cat: 'freelance' },
  ];

  return {
    detectar: function(descricao) {
      if (!descricao) return null;
      for (var i = 0; i < REGRAS.length; i++) {
        if (REGRAS[i].regex.test(descricao)) return REGRAS[i].cat;
      }
      return null;
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CATEGORIAS;
}
