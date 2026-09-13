/**
 * orcamento-preview-cor.test.js — cores do preview de orçamento no Novo
 *
 * Correção #1 da auditoria da aba Novo Lançamento: a barra e o texto do
 * preview de impacto (atualizarOrcamentoPreview) usavam cores hex fixas em JS
 * ('#c9573a'/'#c98a1e'/'#2f9c6d'), presas à paleta clara e fora do tema
 * escuro. Agora usam tokens do design-system. Teste estático, no estilo dos
 * demais testes de regressão do repo.
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'modules', 'init-form.js'), 'utf8'
);

describe('preview de orçamento — cores por token', function() {
  test('a atribuição de cor usa tokens do design-system', function() {
    // A linha `var cor = pctNovo > 100 ? ... : ...` do preview de orçamento.
    expect(src).toMatch(/var cor = pctNovo[^\n]*var\(--color-danger\)[^\n]*var\(--color-warning\)[^\n]*var\(--color-success\)/);
  });

  test('as cores hex fixas do preview sumiram do módulo', function() {
    expect(src).not.toMatch(/#c9573a/i);
    expect(src).not.toMatch(/#c98a1e/i);
    expect(src).not.toMatch(/#2f9c6d/i);
  });
});
