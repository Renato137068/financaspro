/**
 * ui-consistency-passe5.test.js — cartões equivalentes e microcopy
 */
const fs = require('fs');
const path = require('path');
const { indexComTelas } = require('./helpers/index-com-telas.cjs');

const root = path.join(__dirname, '..');
// orcamento-tela.css: a parte que só a tela do Orçamento desenha (chega com o chunk).
const orcamento = ['orcamento.css', 'orcamento-tela.css']
  .map((f) => fs.readFileSync(path.join(root, 'css', 'layouts', f), 'utf8')).join('\n');
// index.html com as telas lazy (telas/) de volta nas cascas.
const html = indexComTelas();

describe('P5 — cartões equivalentes', function() {
  test('orcamento-item alinhado ao padrão perfil/meta (xl + shadow-superficie)', function() {
    expect(orcamento).toMatch(/\.orcamento-item \{[\s\S]*border-radius:\s*var\(--radius-xl\)/);
    expect(orcamento).toMatch(/\.orcamento-item \{[\s\S]*box-shadow:\s*var\(--shadow-superficie\)/);
    expect(orcamento).not.toMatch(/0 3px 10px var\(--color-overlay-md\)/);
  });

  test('orc-kpi-card alinhado ao kpi-card do extrato', function() {
    expect(orcamento).toMatch(/\.orc-kpi-card \{[\s\S]*box-shadow:\s*var\(--shadow-superficie\)/);
    expect(orcamento).toMatch(/\.orc-kpi-card:hover[\s\S]*var\(--shadow-card-hover\)/);
    expect(orcamento).toMatch(/\.orc-kpi-card-icon[\s\S]*width:\s*48px/);
    expect(orcamento).toMatch(/\.orc-kpi-card-icon[\s\S]*border-radius:\s*var\(--radius-lg\)/);
  });
});

describe('P5 — microcopy', function() {
  test('rótulo Orçamento consistente no empty state', function() {
    expect(html).toMatch(/Configurações › Orçamento/);
    expect(html).not.toMatch(/Configurações › Orçamentos/);
  });
});
