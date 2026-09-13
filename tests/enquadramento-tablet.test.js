/**
 * enquadramento-tablet.test.js — auditoria de enquadramento responsivo.
 *
 * O tablet em retrato (768–1023px) deixou de ser um "celular gigante" (coluna
 * estreita centralizada) e passou a usar a largura do dispositivo: shell mais
 * largo + grid de 2 colunas do Resumo já a partir de 768px, mantendo a nav
 * inferior (melhor no toque). E o campo de valor do "Novo lançamento" deixou de
 * ser uma caixa flutuante deslocada.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const style = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const breakpoints = fs.readFileSync(path.join(root, 'css', 'utilities', 'breakpoints.css'), 'utf8');
const formNovo = fs.readFileSync(path.join(root, 'css', 'features', 'form-novo.css'), 'utf8');

describe('Tablet em retrato (768–1023) usa a largura do dispositivo', function() {
  test('shell do tablet alarga para ~960px (não coluna de 720)', function() {
    expect(breakpoints).toMatch(/--app-shell-tablet:\s*960px/);
    expect(breakpoints).not.toMatch(/--app-shell-tablet:\s*720px/);
  });

  test('grid de 2 colunas do Resumo começa em 768px', function() {
    expect(style).toMatch(
      /@media \(min-width: 768px\)\s*\{[\s\S]*?main \.aba\.ativo\[id="aba-resumo"\]\s*\{[\s\S]*?display:\s*grid/
    );
  });

  test('há um ajuste de grid específico do tablet 768–1023', function() {
    expect(style).toMatch(
      /@media \(min-width: 768px\) and \(max-width: 1023px\)\s*\{[\s\S]*?main \.aba\.ativo\[id="aba-resumo"\]/
    );
  });

  test('a nav inferior é mantida no tablet (não vira sidebar abaixo de 1024)', function() {
    // O shell desktop (sidebar + nav-bottom escondida) só entra em ≥1024.
    expect(style).toMatch(/@media \(min-width: 1024px\)[\s\S]*?\.nav-bottom\s*\{[\s\S]*?display:\s*none/);
  });

  test('greeting não duplica espaço (margin + gap) dentro do grid', function() {
    expect(style).toMatch(/main \.aba\.ativo\[id="aba-resumo"\] > #dashboard-greeting/);
  });
});

describe('Campo de valor do "Novo lançamento"', function() {
  test('não usa mais box-shadow de elevação (caixa flutuante)', function() {
    var bloco = formNovo.slice(formNovo.indexOf('.valor-input {'), formNovo.indexOf('.valor-input::placeholder'));
    expect(bloco).not.toMatch(/box-shadow:\s*var\(--elevacao-1\)/);
    expect(bloco).toMatch(/border-bottom:\s*2px solid/);
  });

  test('o grupo R$ + número se comporta como uma unidade centralizada', function() {
    var bloco = formNovo.slice(formNovo.indexOf('.valor-input-wrapper {'), formNovo.indexOf('.valor-prefix'));
    expect(bloco).toMatch(/width:\s*fit-content/);
    expect(bloco).toMatch(/margin-inline:\s*auto/);
  });
});
