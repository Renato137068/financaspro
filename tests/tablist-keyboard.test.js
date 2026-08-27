/**
 * tablist-keyboard.test.js — WAI-ARIA Tabs: setas, Home/End, roving tabindex
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const tablistSrc = fs.readFileSync(path.join(root, 'js', 'utilities', 'tablist-keyboard.js'), 'utf8');
const focusSrc = fs.readFileSync(path.join(root, 'js', 'utilities', 'focus-trap.js'), 'utf8');
const orcSrc = fs.readFileSync(path.join(root, 'js', 'modules', 'init-orcamento.js'), 'utf8');

function carregarTablistKeyboard() {
  var sandbox = {
    window: window,
    document: document,
    console: console,
    module: { exports: {} },
    WeakSet: WeakSet,
    Array: Array,
    Object: Object
  };
  sandbox.globalThis = sandbox;
    vm.runInContext(tablistSrc, vm.createContext(sandbox), { filename: path.join(root, 'js', 'utilities', 'tablist-keyboard.js') });
  return sandbox.TablistKeyboard || sandbox.module.exports;
}

describe('TablistKeyboard — contrato', function() {
  test('implementa setas, Home/End e roving tabindex', function() {
    expect(tablistSrc).toMatch(/ArrowRight/);
    expect(tablistSrc).toMatch(/ArrowLeft/);
    expect(tablistSrc).toMatch(/Home/);
    expect(tablistSrc).toMatch(/End/);
    expect(tablistSrc).toMatch(/tabindex/);
    expect(tablistSrc).toMatch(/aria-selected/);
  });
});

describe('TablistKeyboard — runtime', function() {
  var TablistKeyboard;

  beforeEach(function() {
    TablistKeyboard = carregarTablistKeyboard();
    document.body.innerHTML =
      '<div role="tablist" id="tl">' +
        '<button type="button" role="tab" id="t1" aria-selected="true" tabindex="0">A</button>' +
        '<button type="button" role="tab" id="t2" aria-selected="false" tabindex="-1">B</button>' +
        '<button type="button" role="tab" id="t3" aria-selected="false" tabindex="-1">C</button>' +
      '</div>';
  });

  test('ArrowRight move foco e chama onSelect', function() {
    var tl = document.getElementById('tl');
    var calls = [];
    TablistKeyboard.init(tl, {
      onSelect: function(tab, meta) {
        calls.push({ id: tab.id, focus: meta.focus });
        tab.setAttribute('aria-selected', 'true');
      }
    });
    document.getElementById('t1').focus();
    document.getElementById('tl').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement.id).toBe('t2');
    expect(calls.length).toBe(1);
    expect(calls[0].id).toBe('t2');
    expect(calls[0].focus).toBe(true);
    expect(document.getElementById('t2').getAttribute('tabindex')).toBe('0');
    expect(document.getElementById('t1').getAttribute('tabindex')).toBe('-1');
  });

  test('Home e End vão para primeira e última aba', function() {
    var tl = document.getElementById('tl');
    TablistKeyboard.init(tl, { onSelect: function(tab) { tab.click(); } });
    document.getElementById('t2').focus();
    tl.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement.id).toBe('t3');
    tl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement.id).toBe('t1');
  });
});

describe('INIT_ORCAMENTO.mudarSubAba — roving tabindex', function() {
  function carregarOrcamento() {
    var sandbox = {
      window: window,
      document: document,
      console: console,
      UTILS: { mostrarToast: function() {}, formatarMoeda: function(v) { return 'R$ ' + v; } },
      DADOS: { getConfig: function() { return {}; }, salvarConfig: function() {} },
      sessionStorage: { setItem: function() {}, getItem: function() { return null; } },
      module: { exports: {} },
      Object: Object,
      Array: Array,
      String: String,
      parseFloat: parseFloat
    };
    sandbox.globalThis = sandbox;
    var code = orcSrc.replace(/\bconst INIT_ORCAMENTO =/, 'var INIT_ORCAMENTO =');
    vm.runInContext(code, vm.createContext(sandbox), { filename: path.join(root, 'js', 'modules', 'init-orcamento.js') });
    return sandbox.INIT_ORCAMENTO;
  }

  test('aba ativa tabindex=0, demais -1; focusTab opcional', function() {
    document.body.innerHTML =
      '<div id="aba-orcamento">' +
        '<button type="button" data-orc-sub="planejamento" class="ativo" aria-selected="true" tabindex="0">P</button>' +
        '<button type="button" data-orc-sub="metas" aria-selected="false" tabindex="-1">M</button>' +
        '<div id="orc-sub-panel-planejamento" class="orc-sub-panel ativo"></div>' +
        '<div id="orc-sub-panel-metas" class="orc-sub-panel" hidden></div>' +
      '</div>';
    var INIT_ORCAMENTO = carregarOrcamento();
    INIT_ORCAMENTO.mudarSubAba('metas', { focusTab: true });
    expect(document.querySelector('[data-orc-sub="metas"]').getAttribute('tabindex')).toBe('0');
    expect(document.querySelector('[data-orc-sub="planejamento"]').getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement.getAttribute('data-orc-sub')).toBe('metas');
  });
});

describe('FocusTrap — retorno de foco ao gatilho', function() {
  test('deactivate restaura o elemento focado na construção', function() {
    document.body.innerHTML =
      '<button type="button" id="trigger">Abrir</button>' +
      '<div id="modal"><button type="button" id="inside">OK</button></div>';
    var trigger = document.getElementById('trigger');
    trigger.focus();
    var sandbox = { document: document, module: { exports: {} } };
    sandbox.globalThis = sandbox;
    vm.runInContext(focusSrc, vm.createContext(sandbox), { filename: path.join(root, 'js', 'utilities', 'focus-trap.js') });
    var FocusTrap = sandbox.FocusTrap || sandbox.module.exports;
    var trap = new FocusTrap(document.getElementById('modal'));
    trap.activate(document.getElementById('inside'));
    expect(document.activeElement.id).toBe('inside');
    trap.deactivate();
    expect(document.activeElement.id).toBe('trigger');
  });
});
