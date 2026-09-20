/**
 * dom-safe-boot.test.js — patch do DOM_SAFE não pode rodar antes do bundle terminar
 */
const fs = require('fs');
const path = require('path');

describe('DOM_SAFE_PATCH — ordem de boot', () => {
  test('não chama apply() imediatamente quando readyState !== complete', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'dom-safe.js'), 'utf8');
    expect(src).toMatch(/document\.readyState === 'complete'/);
    expect(src).toMatch(/DOMContentLoaded/);
    expect(src).not.toMatch(/readyState === 'loading'\)[\s\S]*?\} else \{\s*DOM_SAFE_PATCH\.apply\(\)/);
  });

  test('patchAutocomplete tolera INIT_FORM em TDZ', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'dom-safe.js'), 'utf8');
    expect(src).toMatch(/catch \(e\)/);
    expect(src).toMatch(/typeof INIT_FORM !== 'undefined' \? INIT_FORM : null/);
  });
});

describe('DOM_SAFE.createCategoriaChip — rótulo não vai no innerHTML', () => {
  // O rótulo pode ser o nome de uma categoria custom (texto do usuário). Num
  // helper chamado "DOM seguro", ele não pode ser concatenado no innerHTML —
  // deve entrar como text node. Guard por análise da fonte (a função não tem
  // chamadores hoje; o teste evita que a regressão volte quando ganhar um).
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'dom-safe.js'), 'utf8');
  const bloco = src.slice(src.indexOf('createCategoriaChip:'), src.indexOf('createProgressBar:'));

  test('o innerHTML do chip não concatena options.label', () => {
    expect(bloco).not.toMatch(/innerHTML\s*=\s*[^;]*options\.label/);
  });

  test('o rótulo entra como text node', () => {
    expect(bloco).toMatch(/createTextNode\([^)]*options\.label/);
  });
});
