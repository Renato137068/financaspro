/**
 * auditoria-fase6.test.js — replay visual + gate de performance em CI
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const healthSrc = fs.readFileSync(path.join(root, 'js', 'services', 'healthService.js'), 'utf8');
const navSrc = fs.readFileSync(path.join(root, 'js', 'modules', 'init-navigation.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const gateExists = fs.existsSync(path.join(root, 'scripts', 'extrato-perf-gate.cjs'));
const gateSrc = gateExists
  ? fs.readFileSync(path.join(root, 'scripts', 'extrato-perf-gate.cjs'), 'utf8')
  : '';

describe('fase 6 — replay visual da sessão', function() {
  test('perfil expõe replay-sessao e healthService renderiza timeline', function() {
    expect(html).toMatch(/data-action="replay-sessao"/);
    expect(healthSrc).toMatch(/mostrarReplaySessao:\s*function/);
    expect(healthSrc).toMatch(/session-replay-list/);
    expect(navSrc).toMatch(/'replay-sessao'/);
  });
});

describe('fase 6 — benchmark extrato em CI', function() {
  test('script extrato-perf-gate existe com tetos da auditoria', function() {
    expect(gateExists).toBe(true);
    expect(gateSrc).toMatch(/10000|N/);
    expect(gateSrc).toMatch(/obterRecentes/);
    expect(gateSrc).toMatch(/MAX_MS_RECENTES/);
  });

  test('test:ci executa extrato-perf-gate', function() {
    expect(pkg.scripts['test:ci']).toMatch(/extrato-perf-gate/);
  });
});
