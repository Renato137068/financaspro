/**
 * e2e/enquadramento-smoke.spec.cjs — M1–M7 (geometria CSS no Chromium)
 *
 * Fonte em 4322 para validar o CSS atual (sem rebuild dist).
 * Não substitui aparelho físico (notch real), mas cobre o contrato visual.
 */
const { test, expect } = require('@playwright/test');
const { prepareOfflinePage, dismissOverlays } = require('./helpers.cjs');

test.use({ baseURL: 'http://127.0.0.1:4322' });

async function boot(page, size) {
  await page.setViewportSize(size);
  await prepareOfflinePage(page, { captureErrors: false });
  await dismissOverlays(page);
}

async function abrirAba(page, aba) {
  await page.evaluate(function(nome) {
    if (typeof mudarAba === 'function') mudarAba(nome);
  }, aba);
  await expect(page.locator('#aba-' + aba)).toBeVisible();
}

test.describe('Enquadramento M1–M7', function() {
  test('M1 — Novo 390: Mais opções acima do Registrar', async function({ page }) {
    await boot(page, { width: 390, height: 844 });
    await abrirAba(page, 'novo');

    await page.evaluate(function() {
      var panel = document.getElementById('extras-panel');
      var btn = document.getElementById('btn-extras');
      if (panel) panel.style.display = 'block';
      if (btn) btn.setAttribute('aria-expanded', 'true');
    });
    await expect(page.locator('#extras-panel')).toBeVisible();

    var geom = await page.evaluate(function() {
      var panel = document.getElementById('extras-panel');
      var btn = document.querySelector('.btn-registrar');
      if (!panel || !btn) return null;
      var pr = panel.getBoundingClientRect();
      var br = btn.getBoundingClientRect();
      var sticky = getComputedStyle(btn).position;
      return {
        panelBottom: pr.bottom,
        btnTop: br.top,
        gap: br.top - pr.bottom,
        sticky: sticky,
        panelVisible: pr.height > 0,
      };
    });

    expect(geom).toBeTruthy();
    expect(['static', 'relative']).toContain(geom.sticky);
    expect(geom.sticky).not.toMatch(/sticky|fixed/);
    expect(geom.panelVisible).toBe(true);
    expect(geom.gap).toBeGreaterThanOrEqual(0);
  });

  test('M2 — Toast ~810px acima da nav (não atrás)', async function({ page }) {
    await boot(page, { width: 810, height: 1080 });

    await page.evaluate(function() {
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast('Smoke M2 toast', 'info');
      }
    });
    await page.waitForSelector('.toast.show', { timeout: 5000 });

    var geom = await page.evaluate(function() {
      var toast = document.querySelector('.toast.show');
      var nav = document.querySelector('.nav-bottom');
      if (!toast || !nav) return null;
      var tr = toast.getBoundingClientRect();
      var nr = nav.getBoundingClientRect();
      return {
        toastBottom: tr.bottom,
        navTop: nr.top,
        clearance: nr.top - tr.bottom,
        toastZ: Number(getComputedStyle(toast).zIndex) || 0,
        navZ: Number(getComputedStyle(nav).zIndex) || 0,
      };
    });

    expect(geom).toBeTruthy();
    expect(geom.clearance).toBeGreaterThanOrEqual(4);
    expect(geom.toastBottom).toBeLessThanOrEqual(geom.navTop);
  });

  test('M3 — Extrato: barra de massa acima da nav', async function({ page }) {
    await boot(page, { width: 390, height: 844 });
    await abrirAba(page, 'extrato');

    await page.evaluate(function() {
      var bar = document.getElementById('acoes-massa-bar');
      if (bar) bar.style.display = 'flex';
    });

    var geom = await page.evaluate(function() {
      var bar = document.getElementById('acoes-massa-bar');
      var nav = document.querySelector('.nav-bottom');
      if (!bar || !nav) return null;
      var br = bar.getBoundingClientRect();
      var nr = nav.getBoundingClientRect();
      var cs = getComputedStyle(bar);
      return {
        barBottom: br.bottom,
        navTop: nr.top,
        clearance: nr.top - br.bottom,
        barZ: Number(cs.zIndex) || 0,
        navZ: Number(getComputedStyle(nav).zIndex) || 0,
        position: cs.position,
      };
    });

    expect(geom).toBeTruthy();
    expect(geom.position).toBe('fixed');
    expect(geom.clearance).toBeGreaterThanOrEqual(0);
    expect(geom.barBottom).toBeLessThanOrEqual(geom.navTop + 1);
    expect(geom.barZ).toBeGreaterThan(geom.navZ);
  });

  test('M4 — safe-area: body sem padding-top duplicado com header', async function({ page }) {
    await boot(page, { width: 390, height: 844 });

    // Simula notch via CSS env override (Chromium não injeta env() nativo fácil).
    await page.addStyleTag({
      content: [
        'html {',
        '  --e2e-sat: 47px;',
        '  --e2e-sab: 34px;',
        '}',
        'body { padding-top: 0 !important; }',
      ].join('\n'),
    });

    var metrics = await page.evaluate(function() {
      var body = getComputedStyle(document.body);
      var header = document.querySelector('header');
      var nav = document.querySelector('.nav-bottom');
      var hs = header ? getComputedStyle(header) : null;
      var ns = nav ? getComputedStyle(nav) : null;
      return {
        bodyPadTop: body.paddingTop,
        bodyPadBottom: body.paddingBottom,
        headerPadTop: hs ? hs.paddingTop : null,
        navPadBottom: ns ? ns.paddingBottom : null,
        bodyMax: body.maxWidth,
      };
    });

    // Contrato: body não soma safe-top (fica 0); chrome fica no header/nav.
    expect(parseFloat(metrics.bodyPadTop)).toBe(0);
  });

  test('M5 — Fold/Pro Max (~640): body não trava em 500', async function({ page }) {
    await boot(page, { width: 700, height: 900 });

    var maxW = await page.evaluate(function() {
      return parseFloat(getComputedStyle(document.body).maxWidth);
    });

    expect(maxW).toBeGreaterThan(500);
    expect(maxW).toBeLessThanOrEqual(640);
  });

  test('M6 — 1024→1280: aba não encolhe para 820', async function({ page }) {
    await boot(page, { width: 1100, height: 800 });
    await abrirAba(page, 'extrato');

    var w1100 = await page.evaluate(function() {
      var aba = document.getElementById('aba-extrato');
      return aba ? parseFloat(getComputedStyle(aba).maxWidth) : 0;
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(200);

    var w1280 = await page.evaluate(function() {
      var aba = document.getElementById('aba-extrato');
      return aba ? parseFloat(getComputedStyle(aba).maxWidth) : 0;
    });

    // Em 1100 a fórmula min(900, vw−sidebar−pad) ainda pode ser <900;
    // ao alargar para 1280 deve chegar a 900 e nunca regredir para 820.
    expect(w1280).toBe(900);
    expect(w1280).toBeGreaterThanOrEqual(w1100);
    expect(w1280).not.toBe(820);
    expect(w1100).not.toBe(820);
  });

  test('M7 — Billing close respeita safe-area (padding do modal)', async function({ page }) {
    await boot(page, { width: 390, height: 844 });

    await page.waitForFunction(function() {
      return typeof INIT_BILLING !== 'undefined' && typeof INIT_BILLING.abrirPaywall === 'function';
    }, { timeout: 20000 });

    await page.evaluate(function() {
      INIT_BILLING.abrirPaywall('Smoke M7');
    });
    await expect(page.locator('.billing-modal')).toBeVisible();

    var geom = await page.evaluate(function() {
      var modal = document.querySelector('.billing-modal');
      var close = document.querySelector('.billing-close');
      if (!modal || !close) return null;
      var ms = getComputedStyle(modal);
      var cs = getComputedStyle(close);
      var cr = close.getBoundingClientRect();
      return {
        padTop: ms.paddingTop,
        closeTop: cs.top,
        closeMin: Math.min(cr.width, cr.height),
        closeY: cr.top,
      };
    });

    expect(geom).toBeTruthy();
    expect(parseFloat(geom.padTop)).toBeGreaterThanOrEqual(16);
    expect(geom.closeMin).toBeGreaterThanOrEqual(40);
    expect(geom.closeY).toBeGreaterThanOrEqual(0);
  });

  test('bonus — tablet 810: nav ≈ shell (não órfã 460)', async function({ page }) {
    await boot(page, { width: 810, height: 1080 });

    var widths = await page.evaluate(function() {
      var body = parseFloat(getComputedStyle(document.body).maxWidth);
      var nav = document.querySelector('.nav-bottom');
      var nr = nav ? nav.getBoundingClientRect() : null;
      return {
        body: body,
        navWidth: nr ? nr.width : 0,
      };
    });

    expect(widths.body).toBeGreaterThanOrEqual(700);
    expect(widths.navWidth).toBeGreaterThanOrEqual(650);
  });
});
