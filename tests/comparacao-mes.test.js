/**
 * comparacao-mes.test.js — badge de variação vs mês anterior.
 * @jest-environment jsdom
 *
 * Foco: uma variação que arredonda a 0% não pode virar "↑ +0%" nem "↓ -0%".
 * O toFixed(0) de -0,3 dá "-0", então o badge exibia um sinal e uma seta que
 * não existem — o dashboard afirmando queda/alta num mês praticamente estável.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let UI;

beforeAll(function() {
  var sandbox = { window: window, document: document, console: console };
  sandbox.window.UI = {};
  sandbox.globalThis = sandbox;
  var ctx = vm.createContext(sandbox);
  var arquivo = path.join(__dirname, '..', 'js', 'components', 'ComparacaoMes.js');
  var src = fs.readFileSync(arquivo, 'utf8');
  vm.runInContext(src, ctx, { filename: arquivo });
  UI = ctx.window.UI;
});

describe('UI.ComparacaoMes.html', function() {
  test('sem mês anterior mostra travessão neutro', function() {
    expect(UI.ComparacaoMes.html(100, 0)).toContain('comp-neutro');
    expect(UI.ComparacaoMes.html(100, null)).toContain('—');
  });

  test('alta relevante é positiva com seta para cima', function() {
    var h = UI.ComparacaoMes.html(150, 100); // +50%
    expect(h).toContain('comp-bom');
    expect(h).toContain('↑ +50%');
  });

  test('queda de despesa (inverso) é boa', function() {
    var h = UI.ComparacaoMes.html(50, 100, true); // -50%, inverso
    expect(h).toContain('comp-bom');
    expect(h).toContain('↓ -50%');
  });

  test('variação que arredonda a 0% é neutra — sem "+0%"/"-0%" nem seta', function() {
    // queda de 0,2% (arredonda a 0)
    var down = UI.ComparacaoMes.html(4990, 5000);
    expect(down).toContain('comp-neutro');
    expect(down).toContain('≈ 0%');
    expect(down).not.toContain('-0%');
    expect(down).not.toContain('↓');
    // alta de 0,2% (arredonda a 0)
    var up = UI.ComparacaoMes.html(5010, 5000);
    expect(up).toContain('≈ 0%');
    expect(up).not.toContain('+0%');
    expect(up).not.toContain('↑');
  });
});

describe('UI.ComparacaoMes.render', function() {
  test('variação ~0% vira elemento neutro, sem sinal falso', function() {
    var el = UI.ComparacaoMes.render(4990, 5000);
    expect(el.className).toBe('comp-neutro');
    expect(el.textContent).toContain('≈ 0%');
    expect(el.textContent).not.toContain('-0');
  });

  test('alta relevante marca comp-bom com seta para cima', function() {
    var el = UI.ComparacaoMes.render(200, 100);
    expect(el.className).toBe('comp-bom');
    expect(el.textContent).toContain('↑ +100%');
  });
});
