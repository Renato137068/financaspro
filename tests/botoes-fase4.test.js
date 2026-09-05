/**
 * botoes-fase4.test.js — guardas estáticas da Fase 4 (QA botões).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function ler(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('Fase 4 — botões / touch', function() {
  test('cache bust style.css modular-v8', function() {
    expect(ler('index.html')).toMatch(/style\.css\?v=modular-v8/);
  });

  test('secao-link tem min-height 44px', function() {
    var cards = ler('css/components/cards.css');
    var dash = ler('css/layouts/dashboard.css');
    expect(cards).toMatch(/\.secao-link\s*\{[\s\S]*?min-height:\s*var\(--tap-target-min/);
    expect(dash).toMatch(/\.secao-link\s*\{[\s\S]*?min-height:\s*var\(--tap-target-min/);
  });

  test('btn-anexo e anexo-chip-remove ≥ 44px', function() {
    var css = ler('css/features/anexos.css');
    expect(css).toMatch(/\.btn-anexo\s*\{[\s\S]*?min-height:\s*var\(--tap-target-min/);
    expect(css).toMatch(/\.anexo-chip-remove\s*\{[\s\S]*?min-height:\s*var\(--tap-target-min/);
  });

  test('biometria secondary outline', function() {
    expect(ler('css/features/auth.css'))
      .toMatch(/\.auth-biometric-btn\s*\{[\s\S]*?border:\s*2px\s+solid/);
  });

  test('FAB e nav compartilham --nav-bottom-bg', function() {
    var ds = ler('css/design-system.css');
    expect(ds).toMatch(/--nav-bottom-bg:\s*rgba\(255,\s*255,\s*255/);
    expect(ds).toMatch(/\[data-theme="dark"\][\s\S]*?--nav-bottom-bg:\s*rgba\(18,\s*28,\s*20/);
    expect(ler('css/components/navigation.css'))
      .toMatch(/border:\s*3px\s+solid\s+var\(--nav-bottom-bg/);
    expect(ler('css/themes/dark-mode.css'))
      .toMatch(/\.auth-biometric-btn\s*\{[\s\S]*?color:\s*var\(--color-success-light\)/);
  });
});
