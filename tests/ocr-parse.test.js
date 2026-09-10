/**
 * ocr-parse.test.js — OCR removido do produto (07/09/2026).
 * Stub em js/ocr.js; anexos manuais de comprovante permanecem no formulário.
 */
const fs = require('fs');
const path = require('path');
const OCR = require('../js/ocr.js');

describe('OCR desativado', function() {
  test('stub exporta init/abrirScanner sem parser', function() {
    expect(typeof OCR.init).toBe('function');
    expect(typeof OCR.abrirScanner).toBe('function');
    expect(OCR._parseComprovante).toBeUndefined();
    OCR.init();
    OCR.abrirScanner();
  });

  test('código não injeta botão de câmera', function() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'ocr.js'), 'utf8');
    expect(src).toMatch(/removido|desativado|no-op/i);
    expect(src).not.toMatch(/btn-ocr-scan/);
    expect(src).not.toMatch(/tesseract/i);
  });
});
