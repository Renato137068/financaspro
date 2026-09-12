/**
 * auto-categorizer.js - categorizacao automatica em bastidores
 *
 * Ordem das regras importa: padrões específicos (Uber Eats, Amazon Prime,
 * aluguel recebido) vêm ANTES dos genéricos (uber, amazon, aluguel).
 */

const AUTO_CATEGORIZER = {
  REGRAS: [
    // ── Específicos primeiro (evitam colisão com genéricos) ─────────────
    { regex: /uber\s*eats|ubereats/i, cat: 'alimentacao', tipo: 'despesa' },
    { regex: /ifood|rappi|james\s*delivery|delivery/i, cat: 'alimentacao', tipo: 'despesa' },
    { regex: /amazon\s*prime|prime\s*video|primevideo/i, cat: 'assinaturas', tipo: 'despesa' },
    { regex: /aluguel\s+recebido|recebimento\s+de\s+aluguel/i, cat: 'aluguel_recebido', tipo: 'receita' },
    { regex: /mercado\s*livre|mercadolivre|\bml\b|magalu|magazine\s*luiza|americanas|shopee|mercado\s*pago|mercadopago/i, cat: 'compras', tipo: 'despesa' },
    { regex: /estorno|reembolso|cashback|restituicao|restituicao\s+ir|restituicao\s+imposto/i, cat: 'reembolsos', tipo: 'receita' },
    { regex: /juros\s+(do\s+)?(cheque|cartao|atraso|rotativo|especial)|anuidade|tarifa\s+ted|tarifa\s+banc|encargo|taxa\s+banc|emprestimo\s+pessoal/i, cat: 'servicos_financeiros', tipo: 'despesa' },
    { regex: /google\s*play|apple\.com\/bill|apple\.com|icloud|microsoft\s*\*?xbox|xbox\s*game\s*pass|office\s*365/i, cat: 'assinaturas', tipo: 'despesa' },

    // ── Despesas por domínio ─────────────────────────────────────────────
    { regex: /supermercado|padaria|acougue|hortifruti|feira|quitanda|ceia|restaurante|lanchonete|starbucks|outback|acai|assai|carrefour|pao\s*de\s*acucar|mcdonald|burger\s*king|pizza|hamburguer|sushi|boteco|churrascaria|\bmercado\b(?!\s*livre)/i, cat: 'alimentacao', tipo: 'despesa' },
    { regex: /\b(uber|99pop|99taxi|taxi|onibus|metro|bilhete\s*unico|combustivel|gasolina|diesel|estacionamento|pedagio|posto\s*ipiranga|posto\s*shell|raizen|oficina|troca\s+de\s+oleo)\b/i, cat: 'transporte', tipo: 'despesa' },
    { regex: /aluguel|condominio|iptu|financiamento\s+imovel|enel|sabesp|cpfl|companhia\s+de\s+saneamento|agua|luz|energia|internet|telefone|celular|botijao|wifi|faxina|tim\s+brasil|vivo\s+fibra|claro\s+celular|recarga\s+celular/i, cat: 'moradia', tipo: 'despesa' },
    { regex: /farmacia|drogasil|drogaraia|drogaria|remedio|medico|consulta|exame|plano\s+de\s+saude|hospital|dentista|psicologo|academia|smart\s*fit|gym|vitamina|hapvida|fleury|unimed/i, cat: 'saude', tipo: 'despesa' },
    { regex: /escola|faculdade|curso|udemy|alura|coursera|material\s+escolar|livraria|formacao/i, cat: 'educacao', tipo: 'despesa' },
    { regex: /cinema|teatro|show|steam|jogos|passeio|ingresso|rock\s*in\s*rio|cinemark/i, cat: 'lazer', tipo: 'despesa' },
    { regex: /netflix|spotify|deezer|youtube\s*premium|hbo|disney\+|disney\s*plus|globoplay|paramount|apple\s*tv|dropbox|adobe|streaming|crunchyroll/i, cat: 'assinaturas', tipo: 'despesa' },
    { regex: /seguro(\s+(auto|vida|moradia|saude))?|seguradora|porto\s+seguro|tokio\s+marine|sulamerica/i, cat: 'seguros', tipo: 'despesa' },
    { regex: /\bipva\b|\biof\b|\birpf\b|imposto|darf/i, cat: 'impostos', tipo: 'despesa' },
    { regex: /anuidade|tarifa|multa|encargo/i, cat: 'servicos_financeiros', tipo: 'despesa' },
    { regex: /\bamazon\b|loja|shopping|olx/i, cat: 'compras', tipo: 'despesa' },
    { regex: /roupa|camisa|calca|vestido|sapato|tenis|zara|renner|nike/i, cat: 'vestuario', tipo: 'despesa' },
    { regex: /hotel|airbnb|hospedagem|passagem\s+aerea|turismo|\bviagem\b|\bgol\b.*passagem|passagem.*\bgol\b/i, cat: 'viagem', tipo: 'despesa' },
    { regex: /\bpet\b|petz|veterin|racao|banho\s+e\s+tosa/i, cat: 'pet', tipo: 'despesa' },
    { regex: /salao|cabelo|cabeleireiro|barbearia|barbeiro|manicure|unha|cosmetico|maquiagem|skincare|perfume/i, cat: 'beleza', tipo: 'despesa' },
    { regex: /mesada|creche|fralda|escola\s+infantil/i, cat: 'familia', tipo: 'despesa' },
    { regex: /doacao|dizimo|ong\b|igreja/i, cat: 'doacoes', tipo: 'despesa' },

    // ── Receitas ────────────────────────────────────────────────────────
    { regex: /salario|holerite|13[oº]?\s*salario|decimo\s+terceiro|\bbonus\b|ordenado/i, cat: 'salario', tipo: 'receita' },
    { regex: /freelance|freelancer|consultoria|honorarios/i, cat: 'freelance', tipo: 'receita' },
    { regex: /investimento|rendimento|dividendo|cdb|fundo|renda\s+fixa|tesouro/i, cat: 'investimentos', tipo: 'receita' },
    { regex: /\bvr\b|\bva\b|vale[\s-]?refeicao|vale[\s-]?alimentacao|beneficio/i, cat: 'beneficios', tipo: 'receita' },
    { regex: /pix\s+recebido|doacao\s+recebida|presente\s+recebido/i, cat: 'presentes', tipo: 'receita' },
    { regex: /premio|sorteio/i, cat: 'premios', tipo: 'receita' },
    { regex: /\bvenda\b|\bolx\b.*venda|venda.*\bolx\b/i, cat: 'vendas', tipo: 'receita' }
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
    // Normaliza acentos: as regras são escritas sem acento, então "água",
    // "décimo", "farmácia" passam a casar (antes caíam em "outro").
    var raw = String(descricao);
    var desc = (typeof CATEGORIZADOR !== 'undefined' && CATEGORIZADOR.normalizarExtrato)
      ? CATEGORIZADOR.normalizarExtrato(raw)
      : raw.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!desc) {
      desc = raw.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    // Textos bancários genéricos demais: não chute categoria.
    var bruto = raw.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/^(pix\s+enviado|deb\s*automatico|ted\s+\d|compra\s+cartao(\s+final)?|transferencia\s+propria|nubank(\s+nu)?(\s+pagamentos)?)\b/i.test(bruto)
      || /^pag\*[\w\s.]+$/i.test(bruto.trim())) {
      return { categoria: 'outro', tipo: 'despesa', confianca: 'baixa' };
    }

    for (var i = 0; i < this.REGRAS.length; i++) {
      if (this.REGRAS[i].regex.test(desc) || this.REGRAS[i].regex.test(bruto)) {
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
