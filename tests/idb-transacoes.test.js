/**
 * idb-transacoes.test.js — migração de fp-transacoes para IndexedDB
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dadosSrc = fs.readFileSync(path.join(root, 'js', 'core', 'dados.js'), 'utf8');
const idbSrc = fs.readFileSync(path.join(root, 'js', 'core', 'idb-kv.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const reconcilerSrc = fs.readFileSync(path.join(root, 'js', 'utilities', 'finance-reconciler.js'), 'utf8');

describe('IndexedDB para transações', function() {
  test('módulo idb-kv existe e expõe init/get/set', function() {
    expect(idbSrc).toMatch(/var IDB_KV/);
    expect(idbSrc).toMatch(/init:\s*function/);
    expect(idbSrc).toMatch(/get:\s*function/);
    expect(idbSrc).toMatch(/set:\s*function/);
  });

  test('dados.js integra backend idb com cache e ping multi-aba', function() {
    expect(html).toMatch(/idb-kv\.js/);
    expect(dadosSrc).toMatch(/_prepararStorageTransacoes/);
    expect(dadosSrc).toMatch(/_ativarBackendIdbTransacoes/);
    expect(dadosSrc).toMatch(/TX_SYNC_PING_KEY/);
    expect(dadosSrc).toMatch(/_hidratarTransacoesIdb/);
    expect(dadosSrc).toMatch(/LIMIAR_MIGRAR_TX_COUNT/);
  });

  test('init retorna Promise para lifecycle aguardar hidratação', function() {
    expect(dadosSrc).toMatch(/init:\s*function\(\)[\s\S]*return this\._initPromise/);
  });

  test('merge multi-aba usa SYNC_MERGE quando outra aba grava', function() {
    expect(dadosSrc).toMatch(/_mesclarTransacoesRemotas/);
    expect(dadosSrc).toMatch(/SYNC_MERGE\.mergeDelta/);
  });
});

describe('reconciliador amigável', function() {
  test('FINANCE_RECONCILER expõe verificarPainel', function() {
    expect(reconcilerSrc).toMatch(/function verificarPainel/);
    expect(reconcilerSrc).toMatch(/verificarPainel:\s*verificarPainel/);
    expect(reconcilerSrc).toMatch(/COMPROMISSOS\.disponivel/);
  });

  test('perfil tem ação verificar-numeros', function() {
    expect(html).toMatch(/data-action="verificar-numeros"/);
  });
});
