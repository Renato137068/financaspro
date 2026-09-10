/**
 * responsive-passe4.test.js — grid 1024+, safe-area e extremos 320/1920
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const style = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const base = fs.readFileSync(path.join(root, 'css', 'base.css'), 'utf8');
const responsive = fs.readFileSync(path.join(root, 'css', 'utilities', 'responsive.css'), 'utf8');
const toasts = fs.readFileSync(path.join(root, 'css', 'components', 'toasts.css'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'css', 'components', 'navigation.css'), 'utf8');
const forms = fs.readFileSync(path.join(root, 'css', 'components', 'forms.css'), 'utf8');
const extrato = fs.readFileSync(path.join(root, 'css', 'layouts', 'extrato.css'), 'utf8');
const mobileApp = fs.readFileSync(path.join(root, 'css', 'utilities', 'mobile-app.css'), 'utf8');
const uxPolish = fs.readFileSync(path.join(root, 'css', 'utilities', 'ux-polish.css'), 'utf8');

describe('P4 — faixa 1024–1280px', function() {
  test('Resumo em 2 colunas a partir de 1024px', function() {
    expect(style).toMatch(/@media \(min-width: 1024px\)[\s\S]*main \.aba\.ativo\[id="aba-resumo"\]/);
    expect(style).not.toMatch(/@media \(min-width: 1280px\)[\s\S]*main \.aba\.ativo\[id="aba-resumo"\]/);
  });

  test('sidebar mais estreita entre 1024 e 1279px', function() {
    expect(style).toMatch(/@media \(min-width: 1024px\) and \(max-width: 1279px\)[\s\S]*--sidebar-width:\s*200px/);
  });

  test('abas não-Resumo usam 900px (sem regressão 820 em ≥1024)', function() {
    expect(style).toMatch(/@media \(min-width: 1024px\)[\s\S]*main \.aba\s*\{[\s\S]*max-width:\s*900px/);
    expect(style).not.toMatch(/main \.aba\s*\{[\s\S]*max-width:\s*820px/);
  });
});

describe('P4 — safe-area em fixos', function() {
  test('nav inferior e header respeitam safe-area', function() {
    expect(style).toMatch(/\.nav-bottom[\s\S]*env\(safe-area-inset-bottom/);
    expect(style).toMatch(/header[\s\S]*env\(safe-area-inset-top/);
  });

  test('toast elevado até 1023; baixo só em ≥1024', function() {
    expect(toasts).toMatch(/bottom:\s*calc\(124px \+ env\(safe-area-inset-bottom/);
    expect(toasts).toMatch(/@media \(min-width: 1024px\)[\s\S]*bottom:\s*calc\(24px \+ env\(safe-area-inset-bottom/);
    expect(toasts).not.toMatch(/@media \(min-width: 768px\)\s*\{[\s\S]*bottom:\s*calc\(24px/);
  });

  test('Registrar não é sticky; body não duplica safe-top', function() {
    const formNovo = fs.readFileSync(path.join(root, 'css/features/form-novo.css'), 'utf8');
    expect(formNovo).toMatch(/\.btn-registrar[\s\S]*position:\s*static/);
    expect(formNovo).not.toMatch(/\.btn-registrar[\s\S]*position:\s*sticky/);
    expect(mobileApp).not.toMatch(/body\s*\{[^}]*padding-top:\s*var\(--safe-top\)/);
  });

  test('ações em massa acima da nav com --nav-clearance', function() {
    expect(extrato).toMatch(/\.acoes-massa-bar[\s\S]*--nav-clearance/);
    expect(extrato).toMatch(/\.acoes-massa-bar[\s\S]*z-index:\s*calc\(var\(--z-nav\) \+ 10\)/);
    expect(uxPolish).toMatch(/--nav-clearance:/);
    expect(uxPolish).toMatch(/--app-header-offset:/);
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

  test('folds 481–767 ampliam body; FAB até 1023; extras 1 col ≤480', function() {
    expect(base).toMatch(/@media \(min-width: 481px\) and \(max-width: 767px\)[\s\S]*--app-shell-fold|max-width:\s*(var\(--app-shell-fold|640px)/);
    expect(base).toMatch(/--app-shell-fold|640px/);
    expect(navigation).toMatch(/@media \(max-width: 1023px\)[\s\S]*\[data-aba="novo"\]/);
    expect(forms).toMatch(/\.extras-banco-pagamento[\s\S]*@media \(max-width: 480px\)[\s\S]*grid-template-columns:\s*1fr/);
  });

  test('nav alarga no tablet; quick-amount ≥44px; landscape phone', function() {
    expect(style).toMatch(/@media \(min-width: 768px\) and \(max-width: 1023px\)[\s\S]*\.nav-bottom[\s\S]*--app-shell-tablet/);
    const formNovo = fs.readFileSync(path.join(root, 'css/features/form-novo.css'), 'utf8');
    expect(formNovo).toMatch(/\.quick-amount[\s\S]*min-height:\s*var\(--tap-target-min/);
    expect(base).toMatch(/orientation:\s*landscape/);
    expect(base).toMatch(/100dvh/);
    const bp = fs.readFileSync(path.join(root, 'css/utilities/breakpoints.css'), 'utf8');
    expect(bp).toMatch(/--app-shell-tablet:/);
    expect(bp).toMatch(/--nav-max-phone:/);
  });
});
