/**
 * orcamento.js - Budget Management
 * Tier 1: Depends on config.js, dados.js, utils.js, transacoes.js
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */

import { UTILS } from './core/utils.js';
import { TRANSACOES } from './transacoes.js';
import { BUDGET_SERVICE } from './services/budgetService.js';
import { BILLING } from './billing.js';

const ORCAMENTO = {
  _cache: null,

  init: function() {
    ORCAMENTO._carregarOrcamentos();
  },

  _carregarOrcamentos: function() {
    var config = DADOS.getConfig();
    ORCAMENTO._cache = config.orcamentos || {};
  },

  definirLimite: function(categoria, limite) {
    var isNovo = !ORCAMENTO._cache[categoria] || !(ORCAMENTO._cache[categoria].limite > 0);
    if (isNovo && typeof BILLING !== 'undefined' && !BILLING.guardQuota('budget', 1)) {
      throw new Error('Limite de orçamentos atingido');
    }
    ORCAMENTO._cache = BUDGET_SERVICE.setBudget(ORCAMENTO._cache, categoria, limite);
    if (typeof DADOS !== 'undefined' && typeof DADOS.upsertOrcamento === 'function') {
      var entry = DADOS.upsertOrcamento(categoria, ORCAMENTO._cache[categoria].limite);
      ORCAMENTO._cache[categoria] = Object.assign({}, ORCAMENTO._cache[categoria], entry);
    } else {
      ORCAMENTO._salvarOrcamentos();
    }
    if (typeof APP_STATE !== 'undefined') APP_STATE.setState({ config: DADOS.getConfig() });
    return ORCAMENTO._cache[categoria];
  },

  obterLimite: function(categoria) {
    var entry = ORCAMENTO._cache[categoria];
    return entry ? entry.limite : null;
  },

  obterTodos: function() {
    var result = {};
    var keys = Object.keys(ORCAMENTO._cache);
    for (var i = 0; i < keys.length; i++) {
      result[keys[i]] = ORCAMENTO._cache[keys[i]];
    }
    return result;
  },

  deletarLimite: function(categoria) {
    if (typeof DADOS !== 'undefined' && typeof DADOS.deletarOrcamento === 'function') {
      DADOS.deletarOrcamento(categoria);
      delete ORCAMENTO._cache[categoria];
    } else {
      ORCAMENTO._cache = BUDGET_SERVICE.removeBudget(ORCAMENTO._cache, categoria);
      ORCAMENTO._salvarOrcamentos();
    }
    if (typeof APP_STATE !== 'undefined') APP_STATE.setState({ config: DADOS.getConfig() });
  },

  calcularGastoMes: function(categoria, mes, ano) {
    // BUDGET_SERVICE soma em centavos: acumular reais em float faz mil parcelas
    // de R$ 0,10 darem 99,9999999999986 e o limite de R$ 100 nunca ser atingido.
    var txsMes = TRANSACOES.obter({ mes: mes, ano: ano });
    return BUDGET_SERVICE.calculateSpent(txsMes, categoria, null, null);
  },

  obterStatus: function(categoria, mes, ano) {
    // Status e percentual saem da mesma comparação em centavos (BUDGET_SERVICE),
    // para a tela nunca dizer 100% com selo de alerta.
    var txsMes = TRANSACOES.obter({ mes: mes, ano: ano });
    return BUDGET_SERVICE.getStatus(ORCAMENTO._cache, txsMes, categoria, null, null);
  },

  /**
   * Projeta como a categoria fecha o mês, no ritmo atual.
   *
   * O selo "excedido" só aparece depois do estrago. Um aviso no dia 18 — "87%
   * usados, faltam 13 dias" — ainda dá tempo de segurar. É a diferença entre
   * um relatório e uma ferramenta.
   *
   * A projeção é deliberadamente linear: gasto por dia decorrido vezes os dias
   * do mês. Modelar sazonalidade ou dia da semana exigiria um histórico que a
   * maioria dos usuários não tem, e erraria com ar de precisão — pior que
   * errar de forma óbvia.
   *
   * @param {string} categoria
   * @param {Date} [hoje] injetável para teste
   * @returns {{categoria:string, limite:?number, gasto:number, percentual:number,
   *            gastoDiario:number, projecao:?number, diasDecorridos:number,
   *            diasRestantes:number, excedente:number, tetoDiarioSugerido:number,
   *            risco:'sem-limite'|'cedo-demais'|'ok'|'vai-estourar'|'estourado'}}
   */
  projetarCategoria: function(categoria, hoje) {
    var ref = (hoje && typeof hoje.getTime === 'function' && !isNaN(hoje.getTime()))
      ? hoje : new Date();

    var mes = ref.getMonth() + 1;
    var ano = ref.getFullYear();
    var diasDecorridos = ref.getDate();
    var diasNoMes = new Date(ano, mes, 0).getDate();
    var diasRestantes = diasNoMes - diasDecorridos;

    var limite = ORCAMENTO.obterLimite(categoria);
    var gasto = ORCAMENTO.calcularGastoMes(categoria, mes, ano);

    var base = {
      categoria: categoria,
      limite: limite || null,
      gasto: gasto,
      percentual: 0,
      gastoDiario: 0,
      projecao: null,
      diasDecorridos: diasDecorridos,
      diasRestantes: diasRestantes,
      excedente: 0,
      tetoDiarioSugerido: 0,
      risco: 'sem-limite'
    };

    if (!limite) return base;

    var gastoC = UTILS.paraCentavos(gasto);
    var limiteC = UTILS.paraCentavos(limite);
    base.percentual = Math.round((gastoC / limiteC) * 100);

    // Antes do dia 3 o ritmo é ruído: um almoço caro no dia 2 projetaria um
    // estouro que não existe, e um alarme falso ensina a ignorar os próximos.
    if (diasDecorridos < 3) {
      base.risco = 'cedo-demais';
      return base;
    }

    base.gastoDiario = Math.round((gastoC / diasDecorridos)) / 100;
    var projecaoC = Math.round((gastoC / diasDecorridos) * diasNoMes);
    base.projecao = projecaoC / 100;

    if (gastoC >= limiteC) {
      base.risco = 'estourado';
      base.excedente = (gastoC - limiteC) / 100;
      base.tetoDiarioSugerido = 0;
      return base;
    }

    // Quanto ainda dá para gastar por dia sem estourar. É a informação que
    // transforma o alerta em ação — "pare" não ajuda; "R$ 10 por dia" ajuda.
    base.tetoDiarioSugerido = diasRestantes > 0
      ? Math.round((limiteC - gastoC) / diasRestantes) / 100
      : 0;

    base.risco = projecaoC > limiteC ? 'vai-estourar' : 'ok';
    return base;
  },

  /** Categorias que vão estourar ou já estouraram, da pior para a melhor. */
  categoriasEmRisco: function(hoje) {
    var self = ORCAMENTO;
    return Object.keys(ORCAMENTO._cache)
      .map(function(cat) { return self.projetarCategoria(cat, hoje); })
      .filter(function(p) { return p.risco === 'vai-estourar' || p.risco === 'estourado'; })
      .sort(function(a, b) { return b.percentual - a.percentual; });
  },

  /**
   * Frase pronta para a UI. Vazia quando não há nada de acionável a dizer —
   * um card que sempre fala vira ruído e para de ser lido.
   */
  mensagemRisco: function(categoria, hoje) {
    var p = ORCAMENTO.projetarCategoria(categoria, hoje);
    var nome = (typeof UTILS.labelCategoria === 'function')
      ? UTILS.labelCategoria(categoria) : categoria;

    if (p.risco === 'estourado') {
      return nome + ': limite estourado em ' + UTILS.formatarMoeda(p.excedente) + '.';
    }

    if (p.risco === 'vai-estourar') {
      return 'Você já usou ' + p.percentual + '% do orçamento de ' + nome
        + ' e ainda faltam ' + p.diasRestantes + ' dias para o fim do mês. '
        + 'Para não estourar, o teto é ' + UTILS.formatarMoeda(p.tetoDiarioSugerido)
        + ' por dia.';
    }

    return '';
  },

  obterStatusTodos: function(mes, ano) {
    var txsMes = TRANSACOES.obter({ mes: mes, ano: ano });
    return BUDGET_SERVICE.getAllStatus(ORCAMENTO._cache, txsMes, null, null);
  },

  _salvarOrcamentos: function() {
    var config = DADOS.getConfig();
    config.orcamentos = ORCAMENTO._cache;
    DADOS.salvarConfig(config);
    if (typeof APP_STATE !== 'undefined') APP_STATE.setState({ config: config });
    if (typeof DADOS._pushOrcamentoApi === 'function') {
      var chaves = Object.keys(ORCAMENTO._cache);
      for (var i = 0; i < chaves.length; i++) {
        var entry = ORCAMENTO._cache[chaves[i]];
        if (entry && typeof entry.limite === 'number') {
          DADOS._pushOrcamentoApi(chaves[i], entry.limite);
        }
      }
    }
  }
};

export { ORCAMENTO };
export default ORCAMENTO;
