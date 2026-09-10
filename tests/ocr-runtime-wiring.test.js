/**
 * ocr-runtime-wiring.test.js — OCR removido do produto (07/09/2026).
 * Garante que wiring antigo (CSP Tesseract / OCR.init) não volte.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('OCR — removido (sem wiring de produção)', function() {
  test('CSP não piná Tesseract nem wasm-unsafe-eval de OCR', function() {
    const csp = ler('index.html').match(/Content-Security-Policy"[^>]*content="([^"]+)"/)[1];
    expect(csp).not.toMatch(/tesseract\.js/);
    expect(csp).not.toContain('tesseract.js-core');
  });

  test('navegação não chama OCR.init', function() {
    const nav = ler('js/modules/init-navigation.js');
    expect(nav).not.toMatch(/OCR\.init\s*\(/);
    expect(nav).not.toMatch(/chunk\.ocr/);
  });

  test('index não carrega ocr.js', function() {
    const html = ler('index.html');
    expect(html).not.toMatch(/src=["']js\/ocr\.js["']/);
  });
});
