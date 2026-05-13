/**
 * auto-categorizer.js - categorizacao automatica em bastidores
 */

const AUTO_CATEGORIZER = {
  REGRAS: [
    { regex: /supermercado|mercado|padaria|acougue|hortifruti|ifood|rappi|delivery|restaurante|lanchonete|cafe|pizza|hamburguer|sushi|bar|boteco/i, cat: 'alimentacao', tipo: 'despesa' },
    { regex: /uber|99|taxi|onibus|metro|combustivel|gasolina|estacionamento|pedagio|passagem/i, cat: 'transporte', tipo: 'despesa' },
    { regex: /aluguel|condominio|iptu|agua|luz|energia|internet|telefone|gas|wifi/i, cat: 'moradia', tipo: 'despesa' },
    { regex: /farmacia|remedio|medico|consulta|exame|plano de saude|hospital|dentista|psicologo|academia|gym|vitamina/i, cat: 'saude', tipo: 'despesa' },
    { regex: /escola|faculdade|curso|livro|mensalidade|material escolar|udemy|alura|formacao/i, cat: 'educacao', tipo: 'despesa' },
    { regex: /cinema|teatro|show|jogos|passeio|lazer/i, cat: 'lazer', tipo: 'despesa' },
    { regex: /netflix|spotify|deezer|youtube premium|prime video|hbo|disney\+|icloud|dropbox|adobe/i, cat: 'assinaturas', tipo: 'despesa' },
    { regex: /seguro|seguradora|porto seguro|tokio marine|sulamerica/i, cat: 'seguros', tipo: 'despesa' },
    { regex: /iof|irpf|imposto|taxa|darf|ipva/i, cat: 'impostos', tipo: 'despesa' },
    { regex: /anuidade|tarifa|juros|multa|encargo|taxa banc/i, cat: 'servicos_financeiros', tipo: 'despesa' },
    { regex: /loja|shopping|amazon|mercado livre|magalu|americanas|compra/i, cat: 'compras', tipo: 'despesa' },
    { regex: /roupa|camisa|calca|vestido|sapato|tenis/i, cat: 'vestuario', tipo: 'despesa' },
    { regex: /hotel|passagem|airbnb|viagem|turismo/i, cat: 'viagem', tipo: 'despesa' },
    { regex: /pet|veterin|racao|banho e tosa/i, cat: 'pet', tipo: 'despesa' },
    { regex: /salao|barbearia|cosmetico|maquiagem|skincare/i, cat: 'beleza', tipo: 'despesa' },
    { regex: /salario|pagamento|holerite|13|decimo|bonus/i, cat: 'salario', tipo: 'receita' },
    { regex: /freelance|projeto|consultoria|honorarios|freelancer|trabalho/i, cat: 'freelance', tipo: 'receita' },
    { regex: /investimento|rendimento|dividendo|juros|cdb|fundo|renda fixa/i, cat: 'investimentos', tipo: 'receita' },
    { regex: /estorno|reembolso|cashback/i, cat: 'reembolsos', tipo: 'receita' },
    { regex: /vale|beneficio|vr|va/i, cat: 'beneficios', tipo: 'receita' },
    { regex: /presente|pix recebido|doacao recebida/i, cat: 'presentes', tipo: 'receita' },
    { regex: /aluguel recebido/i, cat: 'aluguel_recebido', tipo: 'receita' },
    { regex: /premio|sorteio/i, cat: 'premios', tipo: 'receita' }
  ],

  HISTORICO: {},

  init: function() { this.analisarHistorico(); },

  analisarHistorico: function() {
    try {
      if (typeof DADOS === 'undefined') return;
      var transacoes = DADOS.getTransacoes();
      if (!Array.isArray(transacoes)) return;
      this.HISTORICO = {};
      transacoes.forEach(function(t) {
        if (!t.descricao) return;
        var palavras = String(t.descricao).toLowerCase().trim().split(/\s+/);
        palavras.forEach(function(p) {
          if (p.length <= 3) return;
          this.HISTORICO[p] = this.HISTORICO[p] || {};
          this.HISTORICO[p][t.categoria] = (this.HISTORICO[p][t.categoria] || 0) + 1;
        }.bind(this));
      }.bind(this));
    } catch (e) {
      console.warn('[AUTO_CATEGORIZER] erro:', e);
    }
  },

  detectar: function(descricao) {
    if (!descricao) return null;
    var desc = String(descricao).toLowerCase().trim();

    for (var i = 0; i < this.REGRAS.length; i++) {
      if (this.REGRAS[i].regex.test(desc)) {
        return { categoria: this.REGRAS[i].cat, tipo: this.REGRAS[i].tipo, confianca: 'alta' };
      }
    }

    var palavras = desc.split(/\s+/);
    var candidatos = {};
    palavras.forEach(function(p) {
      if (p.length <= 3) return;
      var mapa = this.HISTORICO[p];
      if (!mapa) return;
      for (var cat in mapa) candidatos[cat] = (candidatos[cat] || 0) + mapa[cat];
    }.bind(this));

    var melhorCat = null;
    var melhorScore = 0;
    for (var cat in candidatos) {
      if (candidatos[cat] > melhorScore) { melhorScore = candidatos[cat]; melhorCat = cat; }
    }

    if (melhorCat && melhorScore >= 2) {
      return { categoria: melhorCat, tipo: 'despesa', confianca: melhorScore >= 4 ? 'media' : 'baixa' };
    }

    return { categoria: 'outro', tipo: 'despesa', confianca: 'baixa' };
  }
};

var CATEGORIAS = AUTO_CATEGORIZER;
if (typeof module !== 'undefined' && module.exports) module.exports = AUTO_CATEGORIZER;
