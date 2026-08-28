/**
 * responsive-passe4.test.js — grid 1024+, safe-area e extremos 320/1920
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const style = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const responsive = fs.readFileSync(path.join(root, 'css', 'utilities', 'responsive.css'), 'utf8');
const toasts = fs.readFileSync(path.join(root, 'css', 'components', 'toasts.css'), 'utf8');
const uxPolish = fs.readFileSync(path.join(root, 'css', 'utilities', 'ux-polish.css'), 'utf8');

describe('P4 — faixa 1024–1280px', function() {
  test('Resumo em 2 colunas a partir de 1024px', function() {
    expect(style).toMatch(/@media \(min-width: 1024px\)[\s\S]*main \.aba\.ativo\[id="aba-resumo"\]/);
    expect(style).not.toMatch(/@media \(min-width: 1280px\)[\s\S]*main \.aba\.ativo\[id="aba-resumo"\]/);
  });

  test('sidebar mais estreita entre 1024 e 1279px', function() {
    expect(style).toMatch(/@media \(min-width: 1024px\) and \(max-width: 1279px\)[\s\S]*--sidebar-width:\s*200px/);
  });
});

describe('P4 — safe-area em fixos', function() {
  test('nav inferior e header respeitam safe-area', function() {
    expect(style).toMatch(/\.nav-bottom[\s\S]*env\(safe-area-inset-bottom/);
    expect(style).toMatch(/header[\s\S]*env\(safe-area-inset-top/);
  });

  test('toast e FAB usam safe-area', function() {
    expect(toasts).toMatch(/env\(safe-area-inset-bottom/);
    expect(uxPolish).toMatch(/\.btn-registrar[\s\S]*env\(safe-area-inset-bottom/);
  });
});

describe('P4 — extremos 320px e 1920px', function() {
  test('regras para 320px sem overflow', function() {
    expect(responsive).toMatch(/@media \(max-width: 320px\)/);
    expect(responsive).toMatch(/overflow-x:\s*clip/);
  });

  test('teto de largura em 1920px', function() {
    expect(style).toMatch(/@media \(min-width: 1920px\)[\s\S]*main \.aba\.ativo\[id="aba-resumo"\]/);
  });
});
