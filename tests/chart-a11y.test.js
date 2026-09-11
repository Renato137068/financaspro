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

describe('BarChart6M — janela analítica do plano', function() {
  /**
   * O gráfico mantém as seis colunas e esmaece as que caem fora do plano, em
   * vez de encolher para três. É o efeito de demonstração: o usuário vê a
   * FORMA do que está perdendo — e isso é o que converte. Um gráfico que
   * simplesmente fica menor não comunica nada.
   */
  function seisMeses(bloqueadosAteIndice) {
    var meses = ['Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set'];
    return meses.map(function(m, i) {
      var fora = i < bloqueadosAteIndice;
      return {
        mes: m,
        receitas: fora ? 0 : 5000 + i,
        despesas: fora ? 0 : 3000 + i,
        bloqueado: fora,
        silhueta: fora ? 0.5 : 0
      };
    });
  }

  test('mês bloqueado não vaza valor em lugar nenhum', function() {
    var el = UI.BarChart6M.render(seisMeses(3));
    var svg = el.querySelector('svg').outerHTML;
    var tabela = el.querySelector('table.sr-only');

    // Nem tooltip <title> nem tabela acessível podem carregar o número: se o
    // valor aparece em qualquer um dos dois, o limite não existe de verdade.
    ['Abr', 'Mai', 'Jun'].forEach(function(m) {
      expect(svg).not.toMatch(new RegExp('Receita ' + m));
      expect(svg).not.toMatch(new RegExp('Despesa ' + m));
    });
    expect(tabela.textContent).toContain('Disponível no plano Pro');

    // E os meses liberados continuam completos.
    expect(svg).toContain('Receita Set');
    expect(normMoeda(tabela.textContent)).toContain('R$ 5.005,00');
  });

  test('os seis meses continuam desenhados, os bloqueados como silhueta', function() {
    var el = UI.BarChart6M.render(seisMeses(3));
    var svg = el.querySelector('svg').outerHTML;

    // Seis rótulos de mês, sempre.
    ['Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set'].forEach(function(m) {
      expect(svg).toContain('>' + m + '<');
    });
    // A silhueta é cinza e translúcida — visível, sem competir com os dados.
    expect(svg).toContain('fill="#9aa5a0"');
  });

  test('o CTA nomeia quantos meses estão guardados', function() {
    var el = UI.BarChart6M.render(seisMeses(3));
    var cta = el.querySelector('.chart-6m-upsell');

    expect(cta).toBeTruthy();
    expect(cta.textContent).toContain('Mais 3 meses');
    // "já estão salvos" é a parte honesta: o dado não foi apagado, só a
    // análise dele é que é Pro.
    expect(cta.textContent).toContain('já estão salvos');
    expect(cta.getAttribute('data-action')).toBe('abrir-paywall');
  });

  test('sem bloqueio não há CTA nem silhueta', function() {
    var el = UI.BarChart6M.render(seisMeses(0));

    expect(el.querySelector('.chart-6m-upsell')).toBeNull();
    expect(el.querySelector('svg').outerHTML).not.toContain('#9aa5a0');
    expect(UI.BarChart6M.bloqueados(seisMeses(0))).toBe(0);
    expect(UI.BarChart6M.bloqueados(seisMeses(4))).toBe(4);
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
