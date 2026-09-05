/**
 * ocr-runtime-wiring.test.js — guardas que o OCR de fato carrega no browser.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('OCR — wiring que quebrava em produção', function() {
  test('CSP pinada em @5.1.1 e libera wasm-unsafe-eval + worker blob', function() {
    const csp = ler('index.html').match(/Content-Security-Policy"[^>]*content="([^"]+)"/)[1];
    expect(csp).toContain('tesseract.js@5.1.1/');
    expect(csp).toContain('tesseract.js-core@5.1.1/');
    expect(csp).not.toMatch(/tesseract\.js@5\//); // @5/ NÃO casa com @5.1.1/
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).toMatch(/worker-src[^;]*blob:/);
  });

  test('init do OCR não passa método nu para UTILS.tentar', function() {
    const nav = ler('js/modules/init-navigation.js');
    expect(nav).toContain("function() { OCR.init(); }");
    expect(nav).not.toMatch(/UTILS\.tentar\('chunk\.ocr\.init',\s*OCR\.init\)/);
  });

  test('vendor tesseract existe ou sync-vendor documenta CDN', function() {
    const vendor = path.join(root, 'js/vendor/tesseract.min.js');
    const sync = ler('scripts/sync-vendor.cjs');
    expect(sync).toMatch(/tesseract/);
    if (fs.existsSync(vendor)) {
      expect(fs.statSync(vendor).size).toBeGreaterThan(10000);
    }
  });

  test('ocr.bundle e órfãos tratam vendor tesseract', function() {
    const orphans = ler('scripts/check-dist-orphans.cjs');
    expect(orphans).toContain('tesseract\\.min\\.js');
  });
});
