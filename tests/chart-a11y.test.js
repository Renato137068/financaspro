/**
 * chart-a11y.test.js — alternativa textual para gráficos SVG do dashboard
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

var ctx;

function normMoeda(text) {
  return String(text).replace(/\u00a0/g, ' ');
}

beforeAll(function() {
  var sandbox = {
    window: window,
    document: document,
    console: console,
    UTILS: {
      formatarMoeda: function(v) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
      },
      escapeHtml: function(s) {
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      },
      labelCategoria: function(c) { return String(c); }
    },
    CONFIG: { getCatLabel: function(c) { return String(c); } }
  };
  sandbox.window.UI = {};
  sandbox.globalThis = sandbox;
  ctx = vm.createContext(sandbox);

  ['js/components/_base.js', 'js/components/LegendaChart.js',
    'js/components/BarChart6M.js', 'js/components/DonutChart.js'].forEach(function(rel) {
    var file = path.join(__dirname, '..', rel);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  });

  global.UI = sandbox.window.UI;
});

describe('BarChart6M — alternativa acessível', function() {
  test('expõe tabela sr-only com mês e valores', function() {
    var dados = [
      { mes: 'Jan', receitas: 5000, despesas: 3200 },
      { mes: 'Fev', receitas: 4800, despesas: 2900 }
    ];
    var el = UI.BarChart6M.render(dados);
    var tabela = el.querySelector('table.sr-only');

    expect(tabela).toBeTruthy();
    expect(tabela.textContent).toContain('Jan');
    expect(tabela.textContent).toContain('Fev');
    expect(normMoeda(tabela.textContent)).toContain('R$ 5.000,00');
    expect(normMoeda(tabela.textContent)).toContain('R$ 3.200,00');
    expect(el.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('svg').getAttribute('aria-label')).toBeNull();
  });
});

describe('DonutChart — alternativa acessível', function() {
  test('expõe tabela sr-only com categoria, valor e percentual', function() {
    var cats = [
      { nome: 'alimentacao', valor: 800, cor: '#ef6c00' },
      { nome: 'transporte', valor: 200, cor: '#1565c0' }
    ];
    var el = UI.DonutChart.render(cats, 1000);
    var tabela = el.querySelector('table.sr-only');

    expect(tabela).toBeTruthy();
    expect(tabela.textContent).toContain('alimentacao');
    expect(tabela.textContent).toContain('transporte');
    expect(normMoeda(tabela.textContent)).toContain('R$ 800,00');
    expect(tabela.textContent).toContain('80%');
    expect(el.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('svg').getAttribute('aria-label')).toBeNull();
  });
});
