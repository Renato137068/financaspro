/**
 * fatura-devida-backup.test.js — o "ainda devo" tem de sobreviver ao backup.
 *
 * faturasDevidas guarda as faturas vencidas que o usuário confirmou que ainda
 * deve (contam no limite/comprometido). O backup exporta a config inteira, mas
 * a importação usa uma allow-list (_IMPORT_CONFIG_ALLOWED). faturasPagas estava
 * nela; faturasDevidas não — então restaurar um backup apagava as confirmações
 * de dívida, e as faturas voltavam a "não confirmada" (fora do limite, pedindo
 * resposta de novo). Este teste trava a simetria com faturasPagas.
 * @jest-environment node
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function carregar() {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'js', 'modules', 'init-config.js'), 'utf8')
    .replace(/\bconst INIT_CONFIG =/, 'var INIT_CONFIG =');
  var stored = {};
  const sandbox = {
    document: { getElementById: function() { return null; } },
    console: { error: function() {}, warn: function() {}, log: function() {} },
    CONFIG: { VERSION: '11.0.0' },
    UTILS: { escapeHtml: function(s) { return String(s); } },
    DADOS: { getConfig: function() { return Object.assign({}, stored); } },
    Date: Date, String: String, Number: Number, Math: Math, JSON: JSON,
    Object: Object, Array: Array,
    module: { exports: {} },
  };
  sandbox.globalThis = sandbox;
  vm.runInContext(src, vm.createContext(sandbox),
    { filename: path.join(root, 'js', 'modules', 'init-config.js') });
  return sandbox.INIT_CONFIG;
}

describe('backup restaura faturasDevidas (simetria com faturasPagas)', function() {
  test('faturasDevidas está na allow-list de importação', function() {
    var C = carregar();
    expect(C._IMPORT_CONFIG_ALLOWED).toContain('faturasDevidas');
    expect(C._IMPORT_CONFIG_ALLOWED).toContain('faturasPagas'); // âncora do par
  });

  test('_mergeImportedConfig preserva as confirmações de dívida', function() {
    var C = carregar();
    var importado = {
      faturasPagas: { 'nubank|2026-05': '2026-05-20' },
      faturasDevidas: { 'nubank|2026-06': '2026-07-01' },
    };
    var merged = C._mergeImportedConfig(importado);
    expect(merged.faturasDevidas).toEqual({ 'nubank|2026-06': '2026-07-01' });
    expect(merged.faturasPagas).toEqual({ 'nubank|2026-05': '2026-05-20' });
  });

  test('sem faturasDevidas no backup, não quebra', function() {
    var C = carregar();
    var merged = C._mergeImportedConfig({ faturasPagas: {} });
    expect(merged.faturasDevidas).toBeUndefined();
  });
});
