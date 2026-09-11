/**
 * ux-passe2.test.js — desfazer, backup banner, ordenação extrato
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const extratoSrc = fs.readFileSync(path.join(root, 'js', 'modules', 'init-extrato.js'), 'utf8');
const metasSrc = fs.readFileSync(path.join(root, 'js', 'modules', 'init-metas.js'), 'utf8');
const healthSrc = fs.readFileSync(path.join(root, 'js', 'services', 'healthService.js'), 'utf8');
const utilsSrc = fs.readFileSync(path.join(root, 'js', 'core', 'utils.js'), 'utf8');

describe('P2 — desfazer em exclusões', function() {
  test('extrato usa agendarExclusao com janela de 5s', function() {
    expect(extratoSrc).toMatch(/agendarExclusao/);
    expect(extratoSrc).toMatch(/duracaoMs:\s*5000/);
    expect(extratoSrc).toMatch(/pendenteExclusao/);
  });

  test('metas usa agendarExclusao', function() {
    expect(metasSrc).toMatch(/agendarExclusao\('meta-'/);
    expect(metasSrc).toMatch(/duracaoMs:\s*5000/);
  });

  test('helper agendarExclusao existe em UTILS', function() {
    expect(utilsSrc).toMatch(/agendarExclusao:\s*function/);
    expect(utilsSrc).toMatch(/mostrarToastAcao/);
  });
});

describe('P2 — backup não-bloqueante', function() {
  test('healthService usa banner em vez de fpConfirm', function() {
    expect(healthSrc).toMatch(/mostrarBanner/);
    expect(healthSrc).not.toMatch(/fpConfirm/);
  });
});

describe('P2 — ordenação em 2 controles', function() {
  test('markup: campo Data|Valor + botão de direção', function() {
    expect(html).toMatch(/ordenacao-campo-btn[^>]*data-ordenacao-campo="data"/);
    expect(html).toMatch(/ordenacao-campo-btn[^>]*data-ordenacao-campo="valor"/);
    expect(html).toMatch(/ordenacao-dir-btn[^>]*data-action="toggle-ordenacao-dir"/);
    expect(html).not.toMatch(/data-ordenacao="data-desc"/);
  });

  test('init-extrato compõe data-desc/asc e valor-desc/asc', function() {
    expect(extratoSrc).toMatch(/setOrdenacaoCampo/);
    expect(extratoSrc).toMatch(/toggleOrdenacaoDir/);
    expect(extratoSrc).toMatch(/_comporOrdenacao/);
  });
});
