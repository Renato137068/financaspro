/**
 * categorizador.js - Intelligent categorization with fuzzy matching + typo detection
 * Usa Levenshtein distance para detectar erros de digitação e contexto
 */

var CATEGORIZADOR = {
  // Dicionário expandido com múltiplas variações, marcas BR e typos comuns.
  // Frases com espaço (ex.: "uber eats") são testadas no texto inteiro antes do fuzzy por palavra.
  DICIONARIO: {
    alimentacao: {
      tipo: 'despesa',
      palavras: [
        'supermercado', 'mercado', 'padaria', 'pão', 'açougue', 'carne', 'fruta', 'verdura',
        'ifood', 'rappi', 'uber eats', 'ubereats', 'delivery', 'restaurante', 'lanchonete', 'bar', 'boteco',
        'café', 'pizza', 'hamburguer', 'sushi', 'churrascaria', 'comida', 'almoço', 'janta',
        'café da manhã', 'açai', 'acai', 'sanduiche', 'pastel', 'bolo', 'doce', 'chocolate',
        'refrigerante', 'cerveja', 'vinho', 'bebida', 'suco', 'pão de queijo',
        'feira', 'hortifruti', 'quitanda', 'ceia',
        'bife', 'frango', 'peixe', 'macarrão', 'arroz', 'feijão', 'batata',
        'starbucks', 'outback', 'assai', 'assaí', 'carrefour', 'mcdonalds', 'burger king',
        'pao de acucar', 'pão de açúcar',
        'supermercto', 'supermcado', 'padria', 'rrestaurante', 'retaurante'
      ]
    },
    transporte: {
      tipo: 'despesa',
      palavras: [
        'uber', 'uberr', 'taxi', 'táxi', 'taxii', 'ônibus', 'onibus', 'metrô', 'metro',
        'combustivel', 'combustível', 'gasolina', 'diesel',
        'estacionamento', 'pedágio', 'pedagio', 'carona',
        'bike', 'bicicleta', 'patinete', 'aplicativo de transporte',
        '99pop', '99taxi', 'loggi', 'moto taxi', 'uber moto',
        'bilhete unico', 'bilhete único', 'posto ipiranga', 'ipiranga', 'posto shell', 'shell', 'raizen',
        'oficina', 'troca de oleo', 'troca de óleo',
        'taix', 'onbus', 'gasoina', 'estaconamento'
      ]
    },
    viagem: {
      tipo: 'despesa',
      palavras: [
        'viagem', 'hotel', 'hospedagem', 'airbnb', 'resort', 'turismo',
        'passagem aérea', 'passagem aerea', 'voo', 'aviao', 'avião',
        'gol', 'latam', 'azul', 'decolar'
      ]
    },
    moradia: {
      tipo: 'despesa',
      palavras: [
        'aluguel', 'alugel', 'condomínio', 'condominio', 'iptu', 'água', 'agua', 'luz', 'energia',
        'internet', 'telefone', 'celular', 'conta de celular', 'conta do celular', 'tim', 'vivo', 'claro', 'oi',
        'gás', 'gas', 'botijão', 'botijao', 'wifi', 'wi-fi', 'conta de luz', 'conta de água',
        'reforma', 'pintura', 'hidráulico', 'encanador', 'pedreiro', 'eletricista', 'manutenção',
        'seguro moradia', 'taxa condominio', 'limpeza', 'faxina', 'bota fora',
        'enel', 'sabesp', 'cpfl', 'saneamento', 'financiamento imovel', 'financiamento imóvel',
        'recarga celular',
        'manutencao'
      ]
    },
    saude: {
      tipo: 'despesa',
      palavras: [
        'farmácia', 'farmacia', 'remédio', 'remedio', 'medicamento', 'médico', 'medico', 'consulta',
        'exame', 'laboratório', 'laboratorio', 'hospital', 'clínica', 'clinica', 'dentista',
        'odonto', 'psicólogo', 'psicologo', 'psicologia', 'terapeuta', 'fisioterapia', 'academia',
        'gym', 'smart fit', 'plano de saúde', 'plano saude', 'seguro saude', 'vitamina', 'suplemento',
        'cirurgia', 'ortopedia', 'cardiologia', 'dermatologia', 'oftalmologia',
        'drogasil', 'drogaraia', 'drogaria', 'hapvida', 'fleury', 'unimed',
        'farmacea', 'consultorio', 'denstista'
      ]
    },
    lazer: {
      tipo: 'despesa',
      palavras: [
        'cinema', 'cinemark', 'filmes', 'crunchyroll',
        'steam', 'jogos', 'jogo', 'playstation', 'nintendo', 'game',
        'teatro', 'show', 'concerto', 'música ao vivo', 'festa', 'balada',
        'praia', 'montanha', 'parque', 'passeio', 'ingresso',
        'theatro'
      ]
    },
    assinaturas: {
      tipo: 'despesa',
      palavras: [
        'netflix', 'spotify', 'prime video', 'amazon prime', 'disney', 'disney+', 'disney plus', 'hbo', 'hbo max',
        'youtube premium', 'deezer', 'globoplay', 'paramount', 'apple tv', 'icloud', 'dropbox',
        'adobe', 'office 365', 'streaming',
        'google play', 'apple.com/bill', 'apple.com', 'xbox', 'game pass',
        'neflix', 'spotifi'
      ]
    },
    compras: {
      tipo: 'despesa',
      palavras: [
        'amazon', 'mercado livre', 'mercadolivre', 'magalu', 'magazine luiza',
        'americanas', 'shopee', 'mercado pago', 'mercadopago', 'shopping', 'olx'
      ]
    },
    pet: {
      tipo: 'despesa',
      palavras: [
        'pet', 'petz', 'veterinario', 'veterinário', 'ração', 'racao',
        'banho e tosa', 'tosa', 'cachorro', 'gato'
      ]
    },
    seguros: {
      tipo: 'despesa',
      palavras: [
        'seguro', 'seguradora', 'porto seguro', 'tokio marine', 'sulamerica',
        'seguro auto', 'seguro vida'
      ]
    },
    impostos: {
      tipo: 'despesa',
      palavras: ['ipva', 'iof', 'irpf', 'imposto', 'darf', 'tributo']
    },
    servicos_financeiros: {
      tipo: 'despesa',
      palavras: [
        'anuidade', 'tarifa', 'tarifa ted', 'juros cheque', 'cheque especial',
        'multa', 'encargo', 'emprestimo', 'empréstimo', 'emprestimo pessoal'
      ]
    },
    familia: {
      tipo: 'despesa',
      palavras: ['mesada', 'creche', 'fralda', 'escola infantil', 'filho']
    },
    doacoes: {
      tipo: 'despesa',
      palavras: ['doação', 'doacao', 'dízimo', 'dizimo', 'ong', 'igreja']
    },
    beleza: {
      tipo: 'despesa',
      palavras: [
        'cabelo', 'corte de cabelo', 'salão', 'salao', 'cabeleireiro', 'barbearia', 'barbeiro',
        'manicure', 'pedicure', 'unha', 'cosmético', 'cosmetico', 'maquiagem', 'skincare',
        'depilação', 'depilacao', 'estética', 'estetica', 'perfume'
      ]
    },
    vestuario: {
      tipo: 'despesa',
      palavras: [
        'roupa', 'roupas', 'camisa', 'camiseta', 'calça', 'calca', 'vestido',
        'sapato', 'tênis', 'tenis', 'sandália', 'sandalia', 'blusa', 'casaco', 'jaqueta',
        'moda', 'loja de roupa', 'zara', 'renner', 'nike'
      ]
    },
    presentes: {
      tipo: 'despesa',
      palavras: [
        'presente', 'presentes', 'lembrança', 'lembranca', 'aniversário', 'aniversario',
        'presente de natal', 'presente pro', 'presente para'
      ]
    },
    educacao: {
      tipo: 'despesa',
      palavras: [
        'escola', 'faculdade', 'universidade', 'cursinho', 'curso', 'aula', 'aulas',
        'livro', 'livros', 'material escolar', 'material de estudo', 'apostila',
        'udemy', 'alura', 'coursera', 'skillshare', 'plataforma de cursos',
        'boleto escola', 'taxa de inscrição',
        'professor particular', 'reforço', 'aula particular',
        'facudade', 'univercidade', 'cursu', 'livraria'
      ]
    },
    salario: {
      tipo: 'receita',
      palavras: [
        'salário', 'salario', 'ordenado', 'remuneração', 'remuneracao',
        'depósito salário', 'deposito salario', 'holerite', '13º', '13 salario',
        'décimo terceiro', 'decimo terceiro', 'décimo', 'decimo', '13o salario', 'adiantamento',
        'bônus', 'bonus', 'comissão', 'comissao',
        'holrite', 'remuneraçao'
      ]
    },
    freelance: {
      tipo: 'receita',
      palavras: [
        'freelance', 'freelancer', 'projeto', 'consultoria', 'honorários', 'honorarios',
        'prestação de serviço', 'serviço autônomo', 'renda extra', 'invoice'
      ]
    },
    investimentos: {
      tipo: 'receita',
      palavras: [
        'investimento', 'rendimento', 'dividendo', 'aplicação', 'aplicacao',
        'cdb', 'lci', 'lca', 'fundos', 'fundo', 'renda fixa', 'tesouro direto',
        'ações', 'acoes', 'stock', 'bolsa', 'b3', 'trading',
        'poupança', 'poupanca', 'retorno',
        'investmento', 'tesouro'
      ]
    },
    reembolsos: {
      tipo: 'receita',
      palavras: ['estorno', 'reembolso', 'cashback', 'restituicao', 'restituição', 'restituicao ir']
    },
    beneficios: {
      tipo: 'receita',
      palavras: ['vale refeição', 'vale refeicao', 'vale alimentação', 'vale alimentacao', 'vr', 'va', 'benefício', 'beneficio']
    },
    aluguel_recebido: {
      tipo: 'receita',
      palavras: ['aluguel recebido', 'recebimento de aluguel']
    },
    vendas: {
      tipo: 'receita',
      palavras: ['venda', 'vendas', 'venda olx']
    },
    premios: {
      tipo: 'receita',
      palavras: ['prêmio', 'premio', 'sorteio']
    }
  },

  // Levenshtein distance - detecta similaridade entre strings
  distancia: function(a, b) {
    var matriz = [];
    for (var i = 0; i <= b.length; i++) {
      matriz[i] = [i];
    }
    for (var j = 0; j <= a.length; j++) {
      matriz[0][j] = j;
    }
    for (i = 1; i <= b.length; i++) {
      for (j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matriz[i][j] = matriz[i - 1][j - 1];
        } else {
          matriz[i][j] = Math.min(
            matriz[i - 1][j - 1] + 1,
            matriz[i][j - 1] + 1,
            matriz[i - 1][j] + 1
          );
        }
      }
    }
    return matriz[b.length][a.length];
  },

  // Calcular similaridade (0-1)
  similaridade: function(a, b) {
    var dist = this.distancia(a.toLowerCase(), b.toLowerCase());
    var maxLen = Math.max(a.length, b.length);
    return 1 - (dist / maxLen);
  },

  _cache: new Map(),
  _CACHE_MAX: 300,

  /**
   * Limpa ruído típico de fatura/extrato BR sem chamar API.
   * Ex.: "PG *MP *MERCADOPAGO SP" → "mercadopago"
   */
  normalizarExtrato: function(texto) {
    if (!texto) return '';
    var s = String(texto).toLowerCase().trim();
    try {
      s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (e) { /* IE antigo */ }
    s = s
      .replace(/\b(compra\s+cartao(\s+final)?(\s+\d+)?|deb\s*automatico|pix\s+enviado|ted\s+\d+)\b/gi, ' ')
      .replace(/\b(ebn|pag|pg|mp|ifood\s*\*|uber\s*\*|rappi\s*\*)\s*/gi, ' ')
      .replace(/[*_/\\|]+/g, ' ')
      .replace(/\b(sao\s+paulo|rio\s+de\s+janeiro|brasil|help\.[a-z0-9.]+)\b/gi, ' ')
      .replace(/\b\d{4,}\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return s;
  },

  detectar: function(texto) {
    if (!texto || texto.length < 2) return null;

    // Normaliza lixo de extrato antes do fuzzy (IFOOD*, PG *MP *, etc.)
    var chave = this.normalizarExtrato
      ? this.normalizarExtrato(texto)
      : String(texto).toLowerCase().trim();
    if (!chave || chave.length < 2) return null;
    if (this._cache.has(chave)) {
      // LRU: re-insert para mover para o final (mais recente)
      var cached = this._cache.get(chave);
      this._cache.delete(chave);
      this._cache.set(chave, cached);
      return cached;
    }

    // 1) Frases / tokens longos no texto inteiro (vence fuzzy por palavra)
    var melhorScore = 0, melhorCategoria = null, melhorTipo = null, melhorLen = 0;
    Object.keys(this.DICIONARIO).forEach(function(categoria) {
      var dados = CATEGORIZADOR.DICIONARIO[categoria];
      dados.palavras.forEach(function(dp) {
        var alvo = String(dp).toLowerCase();
        if (alvo.length < 3) return;
        var matched = false;
        if (alvo.indexOf(' ') >= 0) {
          matched = chave.indexOf(alvo) !== -1;
        } else {
          // Word-boundary: evita "game" dentro de "pagamentos"
          var re = new RegExp('(?:^|[^a-z0-9áàâãéêíóôõúç])' + alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[^a-z0-9áàâãéêíóôõúç]|$)', 'i');
          matched = re.test(chave);
        }
        if (!matched) return;
        var peso = alvo.indexOf(' ') >= 0 ? 3.5 : (alvo.length >= 6 ? 2.6 : 1.8);
        if (alvo.length <= 3) peso = 2.2;
        if (peso > melhorScore || (peso === melhorScore && alvo.length > melhorLen)) {
          melhorScore = peso;
          melhorLen = alvo.length;
          melhorCategoria = categoria;
          melhorTipo = dados.tipo;
        }
      });
    });
    if (melhorScore >= 1.8) {
      var hitFrase = {
        categoria: melhorCategoria,
        tipo: melhorTipo,
        confianca: melhorScore >= 2.6 ? 'alta' : 'media'
      };
      this._cache.set(chave, hitFrase);
      if (this._cache.size > this._CACHE_MAX) {
        this._cache.delete(this._cache.keys().next().value);
      }
      return hitFrase;
    }

    // 2) Fuzzy por palavra (typos)
    var palavras = chave.split(/\s+/);
    melhorScore = 0;
    melhorCategoria = null;
    melhorTipo = null;

    Object.keys(this.DICIONARIO).forEach(function(categoria) {
      var dados = CATEGORIZADOR.DICIONARIO[categoria];
      var scoreCategoria = 0;

      palavras.forEach(function(palavra) {
        if (palavra.length < 3) return;
        // Evita "casa" → "casaco" / prefixos frouxos
        dados.palavras.forEach(function(dp) {
          var alvo = String(dp).toLowerCase();
          if (alvo.indexOf(' ') >= 0) return; // frases já cobertas acima
          if (Math.abs(palavra.length - alvo.length) > 3) return;
          if (palavra.length > 3 && alvo.length > 3 && palavra[0] !== alvo[0]) return;

          var sim = CATEGORIZADOR.similaridade(palavra, alvo);
          var prefixOk = palavra.length >= 5
            && alvo.length - palavra.length <= 2
            && alvo.indexOf(palavra) === 0;
          if (sim > 0.84 || prefixOk) {
            scoreCategoria += sim * 2;
          }
        });
      });

      if (palavras.length) scoreCategoria /= palavras.length;
      if (scoreCategoria > melhorScore) {
        melhorScore = scoreCategoria;
        melhorCategoria = categoria;
        melhorTipo = dados.tipo;
      }
    });

    var resultado = melhorScore > 0.35 ? {
      categoria: melhorCategoria,
      tipo: melhorTipo,
      confianca: melhorScore > 0.7 ? 'alta' : 'media'
    } : null;

    this._cache.set(chave, resultado);
    if (this._cache.size > this._CACHE_MAX) {
      var oldest = this._cache.keys().next().value;
      this._cache.delete(oldest);
    }
    return resultado;
  }
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CATEGORIZADOR;
}
