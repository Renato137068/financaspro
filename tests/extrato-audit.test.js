/**
 * extrato-audit.test.js — regressões da auditoria da aba Extrato
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const extratoSrc = fs.readFileSync(path.join(root, 'js', 'modules', 'init-extrato.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function carregarExtrato(extra) {
  var sandbox = Object.assign({
    window: window,
    document: document,
    console: { error: function() {}, warn: function() {}, log: function() {} },
    CONFIG: {
      TIPO_RECEITA: 'receita',
      TIPO_DESPESA: 'despesa',
      TIPO_TRANSFERENCIA: 'transferencia',
      getCatLabel: function(s) { return s; }
    },
    UTILS: {
      escapeHtml: function(s) {
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      },
      formatarMoeda: function(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); },
      mostrarToast: function() {}
    },
    TRANSACOES: {
      obter: function() { return []; },
      obterPorId: function() { return null; },
      deletar: function() {}
    },
    INIT_MODALS: { confirm: function(msg, cb) { cb(); } },
    INIT_FORM: {},
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Date: Date,
    Math: Math
  }, extra || {});
  sandbox.globalThis = sandbox;
  var code = extratoSrc.replace(/\bconst INIT_EXTRATO =/, 'var INIT_EXTRATO =');
  vm.runInContext(code, vm.createContext(sandbox), {
    filename: path.join(root, 'js', 'modules', 'init-extrato.js')
  });
  var mod = sandbox.INIT_EXTRATO;
  mod.getCatIcon = function() { return ''; };
  mod.getCatCor = function() { return '#000'; };
  return mod;
}

describe('P1.1 — render unificado', function() {
  test('código morto _renderPage removido', function() {
    expect(extratoSrc).not.toMatch(/_renderPage\s*:\s*function/);
  });

  test('_carregarMais usa _renderGruposHtml e .ext-tx', function() {
    expect(extratoSrc).toMatch(/_carregarMais[\s\S]*?_renderGruposHtml/);
    expect(extratoSrc).not.toMatch(/_carregarMais[\s\S]*?extrato-item/);
  });
});

describe('P1.2 — teclado e semântica', function() {
  test('markup: lista sem role=list no container externo', function() {
    var lista = html.match(/id="lista-transacoes"[^>]*>/);
    expect(lista).toBeTruthy();
    expect(lista[0]).not.toMatch(/role="list"/);
    expect(lista[0]).not.toMatch(/aria-live/);
  });

  test('markup: região única de resumo do período', function() {
    expect(html).toMatch(/id="extrato-resumo-anuncio"[^>]*aria-live="polite"/);
    expect(html).not.toMatch(/class="kpi-card receita" role="status"/);
    expect(html).not.toMatch(/class="saldo-card" role="status"/);
  });

  test('runtime: Enter na linha abre edição', function() {
    document.body.innerHTML = '<div id="lista-transacoes"></div>';
    var calls = [];
    var mod = carregarExtrato({});
    mod.editarTransacao = function(id) { calls.push(id); };
    mod.listaTransacoesListener = false;
    var txs = [{ id: 'a1', data: '2026-08-24', descricao: 'Teste', categoria: 'outro', tipo: 'despesa', valor: 10 }];
    mod._renderGrupos({ HOJE: txs }, txs);
    var row = document.querySelector('.ext-tx');
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(calls).toEqual(['a1']);
  });

  test('_renderTransacaoItem: aria-label do checkbox inclui descrição', function() {
    document.body.innerHTML = '';
    var mod = carregarExtrato({});
    var htmlItem = mod._renderTransacaoItem({
      id: '1', data: '2026-08-01', descricao: 'Farmácia', categoria: 'saude', tipo: 'despesa', valor: 5
    });
    expect(htmlItem).toMatch(/aria-label="Selecionar: Farmácia"/);
    expect(htmlItem).toMatch(/role="listitem"/);
  });
});

describe('P1.3 — confirmação de exclusão em massa', function() {
  test('deletarSelecionados usa INIT_MODALS.confirm', function() {
    expect(extratoSrc).toMatch(/deletarSelecionados[\s\S]*?INIT_MODALS\.confirm/);
    expect(extratoSrc).not.toMatch(/deletarSelecionados[\s\S]*?if\s*\(\s*!confirm/);
  });
});

describe('P2.1 — CSV injection', function() {
  test('_neutralizarCsvCelula prefixa fórmulas', function() {
    var mod = carregarExtrato({});
    expect(mod._neutralizarCsvCelula('=SOMA(A1:A9)')).toBe("'=SOMA(A1:A9)");
    expect(mod._neutralizarCsvCelula('-100')).toBe("'-100");
    expect(mod._neutralizarCsvCelula('Mercado')).toBe('Mercado');
  });
});

describe('P2.2 — saldo acumulado não usado no render', function() {
  test('_renderGrupos não faz full-scan de TRANSACOES.obter({})', function() {
    var bloco = extratoSrc.match(/_renderGrupos\s*:\s*function[\s\S]*?},\s*\n\s*\/\*\*/);
    expect(bloco).toBeTruthy();
    expect(bloco[0]).not.toMatch(/TRANSACOES\.obter\(\{\}\)/);
    expect(bloco[0]).not.toMatch(/saldoAcumulado/);
  });
});

describe('P2.3 — transferência não conta como saída', function() {
  test('renderExtratoResumo trata tipo explicitamente', function() {
    document.body.innerHTML =
      '<span id="saldo-valor"></span><span id="kpi-entradas"></span>' +
      '<span id="kpi-saidas"></span><span id="kpi-movimentacoes"></span>' +
      '<span id="saldo-period"></span><span id="extrato-resumo-anuncio"></span>';
    var mod = carregarExtrato({
      TRANSACOES: {
        obter: function() { return []; }
      }
    });
    mod.getExtratoMesAno = function() { return { mes: 8, ano: 2026, date: new Date(2026, 7, 1) }; };
    mod.renderExtratoResumo([
      { tipo: 'receita', valor: 1000 },
      { tipo: 'despesa', valor: 200 },
      { tipo: 'transferencia', valor: 500 }
    ]);
    expect(document.getElementById('kpi-saidas').textContent).toBe('R$ 200,00');
    expect(document.getElementById('kpi-entradas').textContent).toBe('R$ 1000,00');
    expect(document.getElementById('saldo-valor').textContent).toBe('R$ 800,00');
  });
});

describe('Filtros avançados colapsáveis', function() {
  test('markup: painel avançado oculto por padrão com aria no botão', function() {
    expect(html).toMatch(/id="extrato-filtros-avancados"[^>]*hidden/);
    expect(html).toMatch(/id="btn-filtros-avancados"[^>]*data-action="toggle-filtros-avancados"/);
    expect(html).toMatch(/aria-controls="extrato-filtros-avancados"/);
    expect(html).toMatch(/id="filtros-categoria"/);
    expect(html).toMatch(/class="ordenacao-container"/);
  });

  test('toggleFiltrosAvancados alterna hidden e aria-expanded', function() {
    document.body.innerHTML =
      '<button id="btn-filtros-avancados" aria-expanded="false"></button>' +
      '<div id="extrato-filtros-avancados" hidden></div>';
    var mod = carregarExtrato();
    mod.toggleFiltrosAvancados();
    expect(document.getElementById('extrato-filtros-avancados').hasAttribute('hidden')).toBe(false);
    expect(document.getElementById('btn-filtros-avancados').getAttribute('aria-expanded')).toBe('true');
    mod.toggleFiltrosAvancados();
    expect(document.getElementById('extrato-filtros-avancados').hasAttribute('hidden')).toBe(true);
    expect(document.getElementById('btn-filtros-avancados').getAttribute('aria-expanded')).toBe('false');
  });

  test('atualizarBadgeFiltrosAvancados reflete categoria e ordenação', function() {
    document.body.innerHTML =
      '<button id="btn-filtros-avancados"></button>' +
      '<span id="filtro-avancados-count" hidden>0</span>';
    var mod = carregarExtrato();
    mod.state.filtroCat = null;
    mod.state.ordenacao = 'data-desc';
    mod.atualizarBadgeFiltrosAvancados();
    expect(document.getElementById('filtro-avancados-count').hidden).toBe(true);

    mod.state.filtroCat = 'alimentacao';
    mod.state.ordenacao = 'valor-desc';
    mod.atualizarBadgeFiltrosAvancados();
    expect(document.getElementById('filtro-avancados-count').textContent).toBe('2');
    expect(document.getElementById('filtro-avancados-count').hidden).toBe(false);
  });
});
