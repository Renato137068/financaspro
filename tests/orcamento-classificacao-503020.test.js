/**
 * orcamento-classificacao-503020.test.js — roadmap da auditoria do Orçamento:
 *   Permite classificar QUALQUER categoria (inclusive as personalizadas) como
 *   Necessidade / Desejo / Poupança, em vez de jogar tudo que está fora das
 *   listas fixas em "Desejo". Categorias marcadas como Poupança saem do consumo
 *   (Necessidades/Desejos) e somam na poupança do mês.
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'modules', 'init-orcamento.js'), 'utf8');

function carregar(extra) {
  var config = { renda: 5000, regra503020: { nec: 50, des: 30, pou: 20 } };
  var txs = [];
  var sandbox = Object.assign({
    window: window,
    document: document,
    getComputedStyle: function() { return { getPropertyValue: function() { return ''; } }; },
    console: { error: function() {}, warn: function() {}, log: function() {} },
    CONFIG: {
      TIPO_RECEITA: 'receita',
      TIPO_DESPESA: 'despesa',
      getCatLabel: function(c) {
        return ({ alimentacao: 'Alimentação', lazer: 'Lazer' })[c] || c;
      }
    },
    UTILS: {
      formatarMoeda: function(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); },
      escapeHtml: function(s) {
        return String(s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      },
      mostrarToast: function() {},
      labelCategoria: function(c) { return c; }
    },
    DADOS: {
      getConfig: function() { return Object.assign({}, config); },
      salvarConfig: function(p) { Object.assign(config, p); }
    },
    TRANSACOES: {
      obter: function(filtros) {
        return txs.filter(function(t) {
          if (!filtros) return true;
          var d = new Date(t.data + 'T00:00:00');
          if (filtros.mes && d.getMonth() + 1 !== filtros.mes) return false;
          if (filtros.ano && d.getFullYear() !== filtros.ano) return false;
          return true;
        });
      }
    },
    ORCAMENTO: {
      obterTodos: function() { return {}; },
      obterStatus: function(cat) { return { categoria: cat, limite: null, gasto: 0, percentual: 0, status: 'sem-limite' }; },
      projetarCategoria: function() { return { risco: 'ok', percentual: 0 }; },
      categoriasEmRisco: function() { return []; },
      mensagemRisco: function() { return ''; }
    },
    Object: Object, Array: Array, String: String, Number: Number,
    Date: Date, Math: Math, setTimeout: setTimeout
  }, extra || {});
  sandbox._setTxs = function(list) { txs = list; };
  sandbox._setConfig = function(c) { Object.assign(config, c); };
  sandbox._getConfig = function() { return config; };
  sandbox.globalThis = sandbox;
  var code = src.replace(/\bconst INIT_ORCAMENTO =/, 'var INIT_ORCAMENTO =');
  vm.runInContext(code, vm.createContext(sandbox), {
    filename: path.join(root, 'js', 'modules', 'init-orcamento.js')
  });
  return sandbox;
}

function hojeStr() {
  var h = new Date();
  return h.getFullYear() + '-' + String(h.getMonth() + 1).padStart(2, '0') + '-' +
    String(h.getDate()).padStart(2, '0');
}

function montarHeaderDom() {
  document.body.innerHTML =
    '<div id="orc-renda-setup" style="display:none"></div>' +
    '<div id="orc-dashboard" style="display:none">' +
    '<div id="orc-saldo-disponivel"></div><div id="orc-percent-restante"></div>' +
    '<div id="orc-tendencia"></div><div id="orc-total-planejado"></div>' +
    '<div id="orc-total-realizado"></div><div id="orc-categorias-criticas"></div>' +
    '<div id="orc-economia-mes"></div><div id="orc-trend-indicator"></div>' +
    '<span id="orc-nec-pct"></span><span id="orc-des-pct"></span><span id="orc-pou-pct"></span>' +
    '<span id="orc-nec-gasto"></span><span id="orc-nec-limite"></span>' +
    '<div class="orc-progress"><div id="orc-nec-bar" class="orc-progress-fill"></div></div>' +
    '<span id="orc-nec-percent"></span>' +
    '<span id="orc-des-gasto"></span><span id="orc-des-limite"></span>' +
    '<div class="orc-progress"><div id="orc-des-bar" class="orc-progress-fill"></div></div>' +
    '<span id="orc-des-percent"></span>' +
    '<span id="orc-pou-gasto"></span><span id="orc-pou-limite"></span>' +
    '<div class="orc-progress"><div id="orc-pou-bar" class="orc-progress-fill"></div></div>' +
    '<span id="orc-pou-percent"></span><span id="orc-pou-percent-label"></span>' +
    '<div id="orc-insights"></div><div id="orc-live-region"></div>' +
    '<div id="orc-categorias">' +
      '<div id="orc-group-critical" style="display:none"><span id="orc-critical-count"></span><div id="orc-critical-list"></div></div>' +
      '<div id="orc-group-attention" style="display:none"><span id="orc-attention-count"></span><div id="orc-attention-list"></div></div>' +
      '<div id="orc-group-healthy" style="display:none"><span id="orc-healthy-count"></span><div id="orc-healthy-list"></div></div>' +
      '<div id="orc-categorias-empty" style="display:none"></div>' +
    '</div></div>';
}

describe('classificarCategoria503020 — override por categoria', function() {
  test('sem override: categoria fora das listas cai em "desejos" (comportamento antigo)', function() {
    var sb = carregar();
    expect(sb.INIT_ORCAMENTO.classificarCategoria503020('alimentacao')).toBe('necessidades');
    expect(sb.INIT_ORCAMENTO.classificarCategoria503020('lazer')).toBe('desejos');
    expect(sb.INIT_ORCAMENTO.classificarCategoria503020('MinhaCategoria')).toBe('desejos');
  });

  test('override vence a lista fixa e vale para categoria personalizada', function() {
    var sb = carregar();
    sb._setConfig({ classificacao503020: { MinhaCategoria: 'poupanca', lazer: 'necessidades' } });
    expect(sb.INIT_ORCAMENTO.classificarCategoria503020('MinhaCategoria')).toBe('poupanca');
    expect(sb.INIT_ORCAMENTO.classificarCategoria503020('lazer')).toBe('necessidades');
  });

  test('override inválido é ignorado (cai no default)', function() {
    var sb = carregar();
    sb._setConfig({ classificacao503020: { lazer: 'inexistente' } });
    expect(sb.INIT_ORCAMENTO.classificarCategoria503020('lazer')).toBe('desejos');
  });
});

describe('calculateBudgetData — categoria "poupanca" vira reserva, não consumo', function() {
  test('despesa marcada como poupança sai do realizado e soma na poupança', function() {
    var d = hojeStr();
    var sb = carregar();
    sb._setConfig({ classificacao503020: { Investir: 'poupanca' } });
    sb._setTxs([
      { tipo: 'receita', valor: 5000, categoria: 'salario', data: d },
      { tipo: 'despesa', valor: 2000, categoria: 'alimentacao', data: d },
      { tipo: 'despesa', valor: 1000, categoria: 'Investir', data: d }
    ]);
    var data = sb.INIT_ORCAMENTO.calculateBudgetData();
    // Consumo = só alimentação (2000). O investimento não entra em nec/des.
    expect(data.gastoNec).toBe(2000);
    expect(data.gasDes).toBe(0);
    expect(data.realizado).toBe(2000);
    // Saldo disponível = renda − consumo = 5000 − 2000 = 3000.
    expect(data.saldoDisponivel).toBe(3000);
    // Poupança = receitas − despesas + poupança-classificada = 5000 − 3000 + 1000 = 3000.
    expect(data.poupancaReal).toBe(3000);
  });

  test('sem override o cálculo é idêntico ao histórico', function() {
    var d = hojeStr();
    var sb = carregar();
    sb._setTxs([
      { tipo: 'receita', valor: 5000, categoria: 'salario', data: d },
      { tipo: 'despesa', valor: 2000, categoria: 'alimentacao', data: d },
      { tipo: 'despesa', valor: 1000, categoria: 'lazer', data: d }
    ]);
    var data = sb.INIT_ORCAMENTO.calculateBudgetData();
    expect(data.gastoNec).toBe(2000);
    expect(data.gasDes).toBe(1000);
    expect(data.realizado).toBe(3000);
    expect(data.poupancaReal).toBe(2000); // 5000 − 3000
  });
});

describe('soma em centavos — sem resíduo de float (bate com o Resumo)', function() {
  test('3 × R$ 0,10 = R$ 0,30 exato (float daria 0,30000000000000004)', function() {
    var d = hojeStr();
    var sb = carregar();
    sb._setTxs([
      { tipo: 'despesa', valor: 0.1, categoria: 'alimentacao', data: d },
      { tipo: 'despesa', valor: 0.1, categoria: 'alimentacao', data: d },
      { tipo: 'despesa', valor: 0.1, categoria: 'alimentacao', data: d }
    ]);
    var data = sb.INIT_ORCAMENTO.calculateBudgetData();
    expect(data.gastoNec).toBe(0.3);
    expect(data.catGastos.alimentacao).toBe(0.3);
    // A prova do bug antigo: a soma em float não seria exatamente 0,3.
    expect(0.1 + 0.1 + 0.1).not.toBe(0.3);
  });

  test('centavos fracionados não acumulam erro (várias despesas de 33,33)', function() {
    var d = hojeStr();
    var sb = carregar();
    var txs = [];
    for (var i = 0; i < 10; i++) txs.push({ tipo: 'despesa', valor: 33.33, categoria: 'lazer', data: d });
    sb._setTxs(txs);
    var data = sb.INIT_ORCAMENTO.calculateBudgetData();
    expect(data.gasDes).toBe(333.3);
    expect(data.realizado).toBe(333.3);
  });
});

describe('_catItemHtml — badge interativo', function() {
  test('renderiza botão com data-cat e rótulo do grupo atual', function() {
    var sb = carregar();
    sb._setConfig({ classificacao503020: { lazer: 'poupanca' } });
    var html = sb.INIT_ORCAMENTO._catItemHtml('lazer', 300, 5000, '');
    expect(html).toMatch(/<button[^>]*class="orc-cat-badge poupanca"/);
    expect(html).toMatch(/data-cat="lazer"/);
    expect(html).toMatch(/onclick="classificarCategoriaOrcamento\(this\)"/);
    expect(html).toMatch(/>Poupança<\/button>/);
  });

  test('escapa o nome da categoria no data-cat e no aria-label', function() {
    var sb = carregar();
    var html = sb.INIT_ORCAMENTO._catItemHtml('a"b', 10, 5000, '');
    expect(html).toContain('data-cat="a&quot;b"');
    expect(html).not.toContain('data-cat="a"b"');
  });
});

describe('ciclo e persistência da classificação', function() {
  test('cicloClassificacao503020 gira Necessidade → Desejo → Poupança → Necessidade', function() {
    montarHeaderDom();
    var sb = carregar();
    // alimentacao começa como necessidades (lista fixa)
    sb.INIT_ORCAMENTO.cicloClassificacao503020('alimentacao');
    expect(sb._getConfig().classificacao503020.alimentacao).toBe('desejos');
    sb.INIT_ORCAMENTO.cicloClassificacao503020('alimentacao');
    expect(sb._getConfig().classificacao503020.alimentacao).toBe('poupanca');
    sb.INIT_ORCAMENTO.cicloClassificacao503020('alimentacao');
    expect(sb._getConfig().classificacao503020.alimentacao).toBe('necessidades');
  });

  test('definirClassificacao503020 grava e ignora grupo inválido', function() {
    montarHeaderDom();
    var sb = carregar();
    sb.INIT_ORCAMENTO.definirClassificacao503020('MinhaCat', 'poupanca');
    expect(sb._getConfig().classificacao503020.MinhaCat).toBe('poupanca');
    sb.INIT_ORCAMENTO.definirClassificacao503020('MinhaCat', 'xpto');
    expect(sb._getConfig().classificacao503020.MinhaCat).toBe('poupanca'); // inalterado
  });
});
