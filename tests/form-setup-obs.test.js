/**
 * form-setup-obs.test.js — P2.3: falhas de setup vão para OBS
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('P2.3 — erros de setup observáveis', function() {
  test('setupFormNovo chama OBS.captureError com form-setup:<nome>', function() {
    var calls = [];
    var sandbox = {
      window: window,
      document: document,
      console: { warn: function() {}, error: function() {}, log: function() {} },
      OBS: {
        captureError: function(err, ctx) { calls.push({ err: err, ctx: ctx }); }
      },
      Object: Object,
      Array: Array,
      String: String,
      Function: Function
    };
    sandbox.globalThis = sandbox;

    // Stub mínimo: só o método setupFormNovo isolado
    var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'modules', 'init-form.js'), 'utf8');
    var m = src.match(/setupFormNovo:\s*function\s*\(\)\s*\{[\s\S]*?\n  \},/);
    expect(m).toBeTruthy();

    var code =
      'var INIT_FORM = {' + m[0] + '\n' +
      '  setupEntradaRapida: function setupEntradaRapida() { throw new Error("boom-setup"); },\n' +
      '  setupTipoToggle: function setupTipoToggle() {},\n' +
      '  setupMascaraValor: function setupMascaraValor() {},\n' +
      '  setupQuickAmounts: function setupQuickAmounts() {},\n' +
      '  setupCategoriaGrid: function setupCategoriaGrid() {},\n' +
      '  setupDateChips: function setupDateChips() {},\n' +
      '  setupExtrasToggle: function setupExtrasToggle() {},\n' +
      '  setupRecorrencia: function setupRecorrencia() {},\n' +
      '  setupParcelamento: function setupParcelamento() {},\n' +
      '  setupAutoCategorizacao: function setupAutoCategorizacao() {},\n' +
      '  setupContextoCategorizacao: function setupContextoCategorizacao() {},\n' +
      '  setupSmartDescriptionSuggestions: function setupSmartDescriptionSuggestions() {},\n' +
      '  setupPaymentContextChips: function setupPaymentContextChips() {},\n' +
      '  setupAutocomplete: function setupAutocomplete() {},\n' +
      '  setupFormSubmit: function setupFormSubmit() {},\n' +
      '  setupParcelaPreview: function setupParcelaPreview() {},\n' +
      '  setupFormProgress: function setupFormProgress() {}\n' +
      '};';

    // O bloco extraído usa this.setupX — precisa estar no objeto
    // Reescreve o array fns para apontar aos stubs nomeados acima via this.
    var ctx = vm.createContext(sandbox);
    vm.runInContext(code, ctx, {
      filename: path.join(__dirname, 'form-setup-obs.sandbox.js')
    });

    expect(function() {
      ctx.INIT_FORM.setupFormNovo();
    }).not.toThrow();

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0].ctx.contexto).toMatch(/^form-setup:/);
    expect(String(calls[0].err && calls[0].err.message)).toMatch(/boom-setup/);
  });

  test('fonte chama OBS.captureError no catch do setup', function() {
    var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'modules', 'init-form.js'), 'utf8');
    var bloco = src.match(/setupFormNovo:\s*function\s*\(\)\s*\{[\s\S]*?\n  \},/);
    expect(bloco[0]).toMatch(/OBS\.captureError/);
    expect(bloco[0]).toMatch(/form-setup:/);
  });
});
