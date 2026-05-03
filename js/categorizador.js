/**
 * categorizador.js - Intelligent categorization with fuzzy matching + typo detection
 * Usa Levenshtein distance para detectar erros de digitação e contexto
 */

var CATEGORIZADOR = {
  // Dicionário expandido com múltiplas variações e typos comuns
  DICIONARIO: {
    alimentacao: {
      tipo: 'despesa',
      palavras: [
        'supermercado', 'mercado', 'padaria', 'pão', 'açougue', 'carne', 'fruta', 'verdura',
        'ifood', 'rappi', 'uber eats', 'delivery', 'restaurante', 'lanchonete', 'bar', 'boteco',
        'café', 'pizza', 'hamburguer', 'sushi', 'churrascaria', 'comida', 'almoço', 'janta',
        'café da manhã', 'açai', 'sanduiche', 'pastel', 'bolo', 'doce', 'chocolate',
        'refrigerante', 'cerveja', 'vinho', 'bebida', 'suco', 'água', 'pão de queijo',
        'bife', 'frango', 'peixe', 'macarrão', 'arroz', 'feijão', 'batata',
        // Variações e typos comuns
        'supermercto', 'supermcado', 'padria', 'rrestaurante', 'retaurante', 'ifood'
      ]
    },
    transporte: {
      tipo: 'despesa',
      palavras: [
        'uber', 'taxi', 'táxi', 'taxii', 'ônibus', 'onibus', 'metrô', 'metro', 'combustivel', 'combustível',
        'gasolina', 'diesel', 'passagem', 'passagem aérea', 'voo', 'aviao', 'avião', 'trem',
        'estacionamento', 'pedágio', 'pedagio', 'viagem', 'viagem de carro', 'carona',
        'bike', 'bicicleta', 'patinete', 'aplicativo de transporte',
        '99pop', '99taxi', 'loggi', 'moto taxi', 'uber moto',
        // Typos
        'taix', 'onbus', 'gasoina', 'estaconamento', 'passjem'
      ]
    },
    moradia: {
      tipo: 'despesa',
      palavras: [
        'aluguel', 'alugel', 'condomínio', 'condominio', 'iptu', 'água', 'agua', 'luz', 'energia',
        'internet', 'telefone', 'gás', 'gas', 'wifi', 'wi-fi', 'conta de luz', 'conta de água',
        'reforma', 'pintura', 'hidráulico', 'encanador', 'pedreiro', 'eletricista', 'manutenção',
        'seguro moradia', 'taxa condominio', 'limpeza', 'faxina', 'bota fora',
        // Typos
        'alugel', 'condominio', 'eletricista', 'manutencao'
      ]
    },
    saude: {
      tipo: 'despesa',
      palavras: [
        'farmácia', 'farmacia', 'remédio', 'remedio', 'medicamento', 'médico', 'medico', 'consulta',
        'exame', 'laboratório', 'laboratorio', 'hospital', 'clínica', 'clinica', 'dentista',
        'odonto', 'psicólogo', 'psicologo', 'psicologia', 'terapeuta', 'fisioterapia', 'academia',
        'gym', 'plano de saúde', 'plano saude', 'seguro saude', 'vitamina', 'suplemento',
        'cirurgia', 'ortopedia', 'cardiologia', 'dermatologia', 'oftalmologia',
        // Typos
        'farmacea', 'medico', 'consultorio', 'exam', 'denstista'
      ]
    },
    lazer: {
      tipo: 'despesa',
      palavras: [
        'cinema', 'filmes', 'netflix', 'spotify', 'prime video', 'disney', 'hbo', 'crunchyroll',
        'steam', 'jogos', 'jogo', 'playstation', 'xbox', 'nintendo', 'game',
        'teatro', 'show', 'concerto', 'música ao vivo', 'festa', 'balada',
        'viagem', 'hotel', 'hospedagem', 'airbnb', 'resort', 'praia', 'montanha',
        'parque', 'passeio', 'entrada', 'ingresso', 'livro', 'ebook', 'audiobook',
        // Typos
        'neflix', 'spotifi', 'steam', 'jogo', 'theatro', 'show'
      ]
    },
    educacao: {
      tipo: 'despesa',
      palavras: [
        'escola', 'faculdade', 'universidade', 'cursinho', 'curso', 'aula', 'aulas',
        'livro', 'livros', 'material escolar', 'material de estudo', 'apostila',
        'udemy', 'alura', 'coursera', 'skillshare', 'plataforma de cursos',
        'mensalidade', 'tuição', 'boleto escola', 'taxa de inscrição',
        'professor particular', 'reforço', 'aula particular',
        // Typos
        'facudade', 'univercidade', 'cursu', 'livraria'
      ]
    },
    salario: {
      tipo: 'receita',
      palavras: [
        'salário', 'salario', 'pagamento', 'paga', 'ordenado', 'remuneração', 'remuneracao',
        'depósito salário', 'deposito salario', 'holerite', '13º', '13 salario',
        'bônus', 'bonus', 'comissão', 'comissao', 'gorjeta', 'dinheiro',
        // Typos
        'salario', 'pagmento', 'holrite', 'remuneraçao'
      ]
    },
    freelance: {
      tipo: 'receita',
      palavras: [
        'freelance', 'freelancer', 'projeto', 'trabalho', 'cliente', 'invoice', 'fatura',
        'consultoria', 'consultoria', 'honorários', 'honorarios', 'prestação de serviço',
        'serviço autônomo', 'renda extra', 'gig economy', 'trabalho por conta',
        // Typos
        'freelancer', 'freelance', 'projeto', 'consultoria'
      ]
    },
    investimentos: {
      tipo: 'receita',
      palavras: [
        'investimento', 'rendimento', 'dividendo', 'juros', 'aplicação', 'aplicacao',
        'cdb', 'lci', 'lca', 'fundos', 'fundo', 'renda fixa', 'tesouro direto',
        'ações', 'acoes', 'stock', 'bolsa', 'b3', 'trading', 'lucro',
        'poupança', 'poupanca', 'retorno', 'ganho', 'lucro',
        // Typos
        'investmento', 'dividendo', 'aplicacao', 'tesouro'
      ]
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

  // Detectar categoria com fuzzy matching
  detectar: function(texto) {
    if (!texto || texto.length < 2) return null;

    var palavras = texto.toLowerCase().split(/\s+/);
    var melhorScore = 0;
    var melhorCategoria = null;
    var melhorTipo = null;

    // Para cada categoria
    Object.keys(this.DICIONARIO).forEach(function(categoria) {
      var dados = CATEGORIZADOR.DICIONARIO[categoria];
      var scoreCategoria = 0;

      // Para cada palavra do texto
      palavras.forEach(function(palavra) {
        // Buscar match exato ou próximo
        dados.palavras.forEach(function(dicionarioPalavra) {
          var sim = CATEGORIZADOR.similaridade(palavra, dicionarioPalavra);
          // Match exato: 100%, match com 80%+ de similaridade: conta como match
          if (sim > 0.8 || palavra === dicionarioPalavra.substring(0, palavra.length)) {
            scoreCategoria += sim * 2; // Dar peso maior para matches
          }
        });
      });

      // Normalizar score pela quantidade de palavras
      scoreCategoria = scoreCategoria / palavras.length;

      if (scoreCategoria > melhorScore) {
        melhorScore = scoreCategoria;
        melhorCategoria = categoria;
        melhorTipo = dados.tipo;
      }
    });

    // Retornar se score > 0.3 (30% de confiança)
    if (melhorScore > 0.3) {
      return {
        categoria: melhorCategoria,
        tipo: melhorTipo,
        confianca: melhorScore > 0.7 ? 'alta' : 'media'
      };
    }

    return null;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CATEGORIZADOR;
}
