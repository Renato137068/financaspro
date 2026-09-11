/**
 * auditoria-fase7.test.js — replay HTML exportável + Persona G 10k
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const healthSrc = fs.readFileSync(path.join(root, 'js', 'services', 'healthService.js'), 'utf8');
const navSrc = fs.readFileSync(path.join(root, 'js', 'modules', 'init-navigation.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const personaExists = fs.existsSync(path.join(root, 'scripts', 'persona-g-10k.cjs'));
const personaSrc = personaExists
  ? fs.readFileSync(path.join(root, 'scripts', 'persona-g-10k.cjs'), 'utf8')
  : '';

describe('fase 7 — replay HTML para suporte', function() {
  test('exportar replay gera documento standalone', function() {
    expect(html).toMatch(/data-action="exportar-replay-sessao"/);
    expect(healthSrc).toMatch(/exportarReplaySessao:\s*function/);
    expect(healthSrc).toMatch(/financaspro-replay-/);
    expect(healthSrc).toMatch(/_montarDocumentoReplayHtml/);
    expect(navSrc).toMatch(/'exportar-replay-sessao'/);
  });
});

describe('fase 7 — Persona G 10k no harness', function() {
  test('script persona-g-10k existe com validações', function() {
    expect(personaExists).toBe(true);
    expect(personaSrc).toMatch(/10000|10500|N/);
    expect(personaSrc).toMatch(/obterRecentes/);
    expect(personaSrc).toMatch(/resumo diverge/);
  });

  test('test:ci executa persona-g-10k', function() {
    expect(pkg.scripts['test:ci']).toMatch(/persona-g-10k/);
  });
});
