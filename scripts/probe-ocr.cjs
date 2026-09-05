/**
 * scripts/probe-ocr.cjs — prova se o OCR funciona de ponta a ponta no browser.
 *
 * Valida:
 *  1. Botão #btn-ocr-scan aparece na aba Novo
 *  2. Vendor local js/vendor/tesseract.min.js existe (ou CDN)
 *  3. Tesseract carrega sob CSP do app
 *  4. Recognize extrai texto de um comprovante sintético
 *  5. OCR._parseComprovante preenche valor/data
 *
 * Uso: node scripts/probe-ocr.cjs
 */
const { chromium } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const PORT = 4339;
const findings = [];

function note(level, msg) {
  findings.push({ level, msg });
  const tag = level === 'ok' ? 'OK' : level === 'warn' ? 'WARN' : 'FAIL';
  console.log('[' + tag + '] ' + msg);
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

function startStaticServer(dir) {
  return new Promise(function(resolve) {
    const server = http.createServer(function(req, res) {
      var urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      var file = path.join(dir, urlPath.replace(/^\//, '').replace(/\.\./g, ''));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': contentType(file) });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', function() { resolve(server); });
  });
}

async function main() {
  const vendorLocal = path.join(root, 'js/vendor/tesseract.min.js');
  if (fs.existsSync(vendorLocal)) {
    note('ok', 'Vendor local presente: js/vendor/tesseract.min.js');
  } else {
    note('warn', 'Vendor local AUSENTE — OCR depende 100% do CDN jsDelivr (offline = falha do motor)');
  }

  // Preferir dist se existir; senão raiz (vite/dev assets incompletos).
  let serveDir = path.join(root, 'dist');
  if (!fs.existsSync(path.join(serveDir, 'index.html'))) {
    note('warn', 'dist/ ausente — servindo raiz (pode falhar lazy chunks)');
    serveDir = root;
  } else {
    note('ok', 'Servindo dist/');
  }

  const server = await startStaticServer(serveDir);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(60000);

  const cspViolations = [];
  page.on('console', function(msg) {
    if (/Content Security Policy|Refused to|CSP/i.test(msg.text())) {
      cspViolations.push(msg.text());
    }
  });
  page.on('pageerror', function(err) {
    note('warn', 'pageerror: ' + err.message);
  });

  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  // Abrir aba Novo (mobile usa bottom-nav; sidebar fica hidden no viewport 360)
  const switched = await page.evaluate(function() {
    var btns = document.querySelectorAll('[data-aba="novo"]');
    for (var i = 0; i < btns.length; i++) {
      var el = btns[i];
      var style = window.getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        el.click();
        return 'click-visible';
      }
    }
    if (window.INIT_NAVIGATION && typeof window.INIT_NAVIGATION.mudarAba === 'function') {
      window.INIT_NAVIGATION.mudarAba('novo');
      return 'mudarAba';
    }
    if (btns[0]) { btns[0].click(); return 'click-force'; }
    return null;
  });
  if (switched) note('ok', 'Aba Novo aberta via ' + switched);
  else note('fail', 'Não foi possível abrir aba Novo');
  await page.waitForTimeout(2500);

  // Forçar load do chunk OCR se API pública existir
  await page.evaluate(function() {
    if (window.INIT_NAVIGATION && window.INIT_NAVIGATION.carregarChunkOcr) {
      return new Promise(function(resolve) {
        window.INIT_NAVIGATION.carregarChunkOcr(function() { resolve(true); });
        setTimeout(function() { resolve(false); }, 12000);
      });
    }
    return false;
  });
  await page.waitForTimeout(800);

  // Força init (corrige perda de `this` no UTILS.tentar antigo)
  await page.evaluate(function() {
    if (typeof OCR !== 'undefined' && OCR.init) OCR.init();
  });
  await page.waitForTimeout(200);

  const hasOcr = await page.evaluate(function() { return typeof window.OCR !== 'undefined'; });
  if (hasOcr) note('ok', 'Módulo OCR carregado no window');
  else note('fail', 'Módulo OCR NÃO carregou (chunk lazy ou bundle)');

  const btn = page.locator('#btn-ocr-scan');
  if (await btn.count()) note('ok', 'Botão #btn-ocr-scan injetado na UI');
  else note('fail', 'Botão #btn-ocr-scan ausente — init não rodou ou .er-wrapper sumiu');

  // Paywall: simular FREE na nuvem
  const paywall = await page.evaluate(function() {
    if (typeof window.OCR === 'undefined' || typeof window.BILLING === 'undefined') {
      return { skipped: true };
    }
    var origCloud = window.BILLING.isCloudUser;
    var origTier = window.BILLING.getTier;
    window.BILLING.isCloudUser = function() { return true; };
    window.BILLING.getTier = function() { return 'FREE'; };
    var opened = false;
    var origPay = window.INIT_BILLING && window.INIT_BILLING.abrirPaywall;
    if (window.INIT_BILLING) {
      window.INIT_BILLING.abrirPaywall = function() { opened = true; };
    }
    window.OCR.abrirScanner();
    window.BILLING.isCloudUser = origCloud;
    window.BILLING.getTier = origTier;
    if (window.INIT_BILLING && origPay) window.INIT_BILLING.abrirPaywall = origPay;
    return { opened: opened, canUse: window.BILLING.canUse('aiFeatures') === false || opened };
  });
  if (paywall.skipped) note('warn', 'Paywall OCR não testado (OCR/BILLING ausente)');
  else if (paywall.opened) note('ok', 'FREE na nuvem: OCR abre paywall (esperado)');
  else note('warn', 'FREE na nuvem: paywall NÃO disparou — pode estar liberado indevidamente');

  // Teste real Tesseract: canvas com texto de comprovante (timeout generoso — baixa lang data)
  const ocrResult = await page.evaluate(async function() {
    if (typeof OCR === 'undefined') return { error: 'OCR missing' };

    var canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 320;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 640, 320);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 28px Arial';
    ctx.fillText('SUPERMERCADO XYZ', 40, 60);
    ctx.font = '24px Arial';
    ctx.fillText('Total: R$ 127,45', 40, 120);
    ctx.fillText('Data: 10/08/2026', 40, 170);
    ctx.fillText('Pago via Pix', 40, 220);
    ctx.fillText('Nubank', 40, 270);

    var t0 = Date.now();
    try {
      var texto = await Promise.race([
        OCR._extrairTexto(canvas),
        new Promise(function(_, rej) {
          setTimeout(function() { rej(new Error('timeout 90s em _extrairTexto')); }, 90000);
        }),
      ]);
      var parsed = OCR._parseComprovante(texto || '');
      return {
        ok: true,
        ms: Date.now() - t0,
        texto: (texto || '').slice(0, 400),
        parsed: parsed,
        tesseractLoaded: !!OCR._tesseractLoaded,
        hasWindowTesseract: typeof window.Tesseract !== 'undefined',
      };
    } catch (e) {
      return {
        ok: false,
        ms: Date.now() - t0,
        error: String(e && e.message || e),
        tesseractLoaded: !!OCR._tesseractLoaded,
        hasWindowTesseract: typeof window.Tesseract !== 'undefined',
      };
    }
  });

  if (ocrResult.error && !ocrResult.ok) {
    note('fail', 'Extração OCR falhou: ' + ocrResult.error);
  } else if (!ocrResult.texto || !String(ocrResult.texto).trim()) {
    note('fail', 'Tesseract retornou texto vazio em ' + ocrResult.ms + 'ms (CSP/worker/lang?)');
    note('warn', 'tesseractLoaded=' + ocrResult.tesseractLoaded + ' window.Tesseract=' + ocrResult.hasWindowTesseract);
  } else {
    note('ok', 'Texto OCR obtido em ' + ocrResult.ms + 'ms: ' + JSON.stringify(ocrResult.texto).slice(0, 180));
    var p = ocrResult.parsed || {};
    if (p.valor && Math.abs(p.valor - 127.45) < 0.05) note('ok', 'Parser extraiu valor R$ 127,45');
    else note('warn', 'Parser valor=' + p.valor + ' (esperado ~127.45) — OCR ruidoso ou regex frágil');
    if (p.descricao) note('ok', 'Parser descrição: ' + p.descricao);
    else note('warn', 'Parser sem descrição');
    if (p.cartao === 'pix' || /pix/i.test(ocrResult.texto)) note('ok', 'Método Pix detectável no texto/parse');
    else note('warn', 'Pix não detectado (cartao=' + p.cartao + ')');
  }

  if (cspViolations.length) {
    note('fail', 'Violações CSP durante OCR (' + cspViolations.length + '):');
    cspViolations.slice(0, 5).forEach(function(v) { note('fail', '  ' + v.slice(0, 200)); });
  } else {
    note('ok', 'Nenhuma violação CSP reportada no console');
  }

  // CSP worker-src check no meta
  const cspMeta = await page.evaluate(function() {
    var m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return m ? m.content : '';
  });
  if (/worker-src/i.test(cspMeta)) note('ok', 'CSP declara worker-src');
  else note('warn', 'CSP sem worker-src explícito — workers caem em script-src (blob: pode falhar)');
  if (/blob:/.test(cspMeta) && /script-src|worker-src/.test(cspMeta)) {
    // check if blob in script or worker
    if (/worker-src[^;]*blob:/.test(cspMeta) || /script-src[^;]*blob:/.test(cspMeta)) {
      note('ok', 'CSP permite blob: para workers/scripts');
    } else {
      note('warn', 'CSP menciona blob: só em img-src — workers blob: provavelmente bloqueados');
    }
  }

  await browser.close();
  server.close();

  const fails = findings.filter(function(f) { return f.level === 'fail'; }).length;
  const warns = findings.filter(function(f) { return f.level === 'warn'; }).length;
  console.log('\n=== RESUMO OCR ===');
  console.log('fails=' + fails + ' warns=' + warns + ' oks=' + findings.filter(function(f) { return f.level === 'ok'; }).length);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch(function(err) {
  console.error(err);
  process.exit(2);
});
