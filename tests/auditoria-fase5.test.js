/**
 * auditoria-fase5.test.js — conflitos multi-aba + replay de sessão
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dadosSrc = fs.readFileSync(path.join(root, 'js', 'core', 'dados.js'), 'utf8');
const syncSrc = fs.readFileSync(path.join(root, 'js', 'core', 'sync-merge.js'), 'utf8');
const sessionSrc = fs.readFileSync(path.join(root, 'js', 'core', 'session-log.js'), 'utf8');
const healthSrc = fs.readFileSync(path.join(root, 'js', 'services', 'healthService.js'), 'utf8');
const modalsSrc = fs.readFileSync(path.join(root, 'js', 'modules', 'init-modals.js'), 'utf8');

describe('fase 5 — resolução manual de conflitos', function() {
  test('SYNC_MERGE expõe detectarConflitos e aplicarResolucoes', function() {
    expect(syncSrc).toMatch(/detectarConflitos:\s*function/);
    expect(syncSrc).toMatch(/aplicarResolucoes:\s*function/);
  });

  test('dados.js integra modal de conflito no merge', function() {
    expect(dadosSrc).toMatch(/_mostrarModalConflitos/);
    expect(dadosSrc).toMatch(/_mesclarTransacoesComConflitos/);
    expect(dadosSrc).toMatch(/Manter desta aba/);
  });
});

describe('fase 5 — replay de sessão no diagnóstico', function() {
  test('session-log registrado no index e exportado', function() {
    expect(html).toMatch(/session-log\.js/);
    expect(sessionSrc).toMatch(/registrar:\s*function/);
    expect(healthSrc).toMatch(/sessao:/);
    expect(healthSrc).toMatch(/SESSION_LOG\.snapshot/);
  });

  test('dados registra eventos de merge e conflito', function() {
    expect(dadosSrc).toMatch(/SESSION_LOG\.registrar\('merge_multiaba'/);
    expect(dadosSrc).toMatch(/SESSION_LOG\.registrar\('conflito_multiaba'/);
  });

  test('fpConfirm aceita HTML confiável para modal de conflito', function() {
    expect(modalsSrc).toMatch(/trustedHtml/);
    expect(modalsSrc).toMatch(/cancelLabel/);
  });
});
