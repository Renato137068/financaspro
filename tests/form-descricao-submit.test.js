/**
 * form-descricao-submit.test.js — P2.4: descrição vazia deriva da categoria
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('P2.4 — descrição opcional com rótulo derivado', function() {
  var INIT_FORM;
  var processados;

  beforeAll(function() {
    processados = [];
    var sandbox = {
      window: window,
      document: document,
      console: console,
      CONFIG: {
        TIPO_DESPESA: 'despesa',
        TIPO_RECEITA: 'receita',
        normalizeCategoriaFinal: function(c, t) { return c || (t === 'receita' ? 'outros' : 'outro'); }
      },
      UTILS: {
        labelCategoria: function(c) {
          return ({ alimentacao: 'Alimentação', outro: 'Outro' })[c] || c;
        },
        mostrarToast: function() {}
      },
      Object: Object,
      Array: Array,
      String: String,
      Number: Number,
      Date: Date,
      Math: Math
    };
    sandbox.globalThis = sandbox;

    var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'modules', 'init-form.js'), 'utf8');
    var m = src.match(/handleFormSubmit:\s*function\s*\([\s\S]*?\n  \},/);
    expect(m).toBeTruthy();

    var code =
      'var INIT_FORM = {' + m[0] + '\n' +
      '  obterValorNumerico: function() { return 50; },\n' +
      '  obterSugestaoContextual: function() { return null; },\n' +
      '  processarTransacao: function() {\n' +
      '    processados.push(Array.prototype.slice.call(arguments));\n' +
      '  }\n' +
      '};\n' +
      'var processados = [];';

    var ctx = vm.createContext(Object.assign({}, sandbox, { processados: processados }));
    vm.runInContext(code, ctx, {
      filename: path.join(__dirname, 'form-descricao-submit.sandbox.js')
    });
    INIT_FORM = ctx.INIT_FORM;
    // sincronizar o array do sandbox
    processados = ctx.processados;
    global.__p24 = { INIT_FORM: INIT_FORM, processados: processados, ctx: ctx };
  });

  beforeEach(function() {
    processados.length = 0;
    if (global.__p24) global.__p24.ctx.processados.length = 0;
    document.body.innerHTML =
      '<input id="novo-tipo" value="despesa">' +
      '<input id="novo-categoria" value="alimentacao">' +
      '<input id="novo-data" value="2026-08-24">' +
      '<input id="novo-descricao" value="">' +
      '<input id="novo-banco" value="">' +
      '<input id="novo-cartao" value="">' +
      '<input id="novo-nota" value="">' +
      '<div id="desc-error"></div>';
  });

  test('sem descrição: usa rótulo da categoria e avisa em #desc-error', function() {
    var IF = global.__p24.INIT_FORM;
    var procs = global.__p24.ctx.processados;
    IF.handleFormSubmit({ preventDefault: function() {} });

    expect(procs.length).toBe(1);
    // args: tipo, valor, categoria, data, descricao, ...
    expect(procs[0][4]).toBe('Alimentação');
    expect(document.getElementById('novo-descricao').value).toBe('Alimentação');
    expect(document.getElementById('desc-error').textContent).toMatch(/Sem descrição/);
    expect(document.getElementById('desc-error').textContent).toMatch(/Alimentação/);
  });

  test('com descrição: preserva o texto e limpa #desc-error', function() {
    document.getElementById('novo-descricao').value = 'Mercado Extra';
    document.getElementById('desc-error').textContent = 'aviso antigo';
    var IF = global.__p24.INIT_FORM;
    var procs = global.__p24.ctx.processados;
    IF.handleFormSubmit({ preventDefault: function() {} });

    expect(procs[0][4]).toBe('Mercado Extra');
    expect(document.getElementById('desc-error').textContent).toBe('');
  });

  test('fonte documenta a regra opcional+derivar', function() {
    var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'modules', 'init-form.js'), 'utf8');
    expect(src).toMatch(/descrição opcional/i);
    expect(src).toMatch(/desc-error/);
    expect(src).toMatch(/labelCategoria\(categoria\)/);
  });
});
