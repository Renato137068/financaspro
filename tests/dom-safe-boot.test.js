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
