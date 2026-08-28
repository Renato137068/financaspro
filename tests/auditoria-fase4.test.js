/**
 * auditoria-fase4.test.js — virtualização extrato, diagnóstico, conflito edição
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const extratoSrc = fs.readFileSync(path.join(root, 'js', 'modules', 'init-extrato.js'), 'utf8');
const dadosSrc = fs.readFileSync(path.join(root, 'js', 'core', 'dados.js'), 'utf8');
const healthSrc = fs.readFileSync(path.join(root, 'js', 'services', 'healthService.js'), 'utf8');
const navSrc = fs.readFileSync(path.join(root, 'js', 'modules', 'init-navigation.js'), 'utf8');

describe('fase 4 — virtualização do extrato', function() {
  test('viewport com spacers e janela por scroll', function() {
    expect(html).toMatch(/extrato-lista-viewport/);
    expect(html).toMatch(/extrato-virtual-spacer-top/);
    expect(extratoSrc).toMatch(/_renderGruposVirtual/);
    expect(extratoSrc).toMatch(/virtualThreshold:\s*100/);
    expect(extratoSrc).toMatch(/_calcularJanelaVirtual/);
    expect(extratoSrc).toMatch(/rolagem virtual/);
  });
});

describe('fase 4 — conflito multi-aba durante edição', function() {
  test('merge aborta se formulário está em modo edição', function() {
    expect(dadosSrc).toMatch(/form\.dataset\.editId/);
    expect(dadosSrc).toMatch(/enquanto você edita um lançamento/);
  });
});

describe('fase 4 — diagnóstico exportável', function() {
  test('healthService exporta JSON sem PII de descrições', function() {
    expect(healthSrc).toMatch(/exportarDiagnostico:\s*function/);
    expect(healthSrc).toMatch(/financaspro-diagnostico/);
    expect(healthSrc).not.toMatch(/descricao/);
  });

  test('perfil e navigation expõem exportar-diagnostico', function() {
    expect(html).toMatch(/data-action="exportar-diagnostico"/);
    expect(navSrc).toMatch(/'exportar-diagnostico'/);
  });
});
