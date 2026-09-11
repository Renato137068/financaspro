/**
 * e2e/contraste-real.spec.cjs — mede o contraste de TODO texto visível contra o
 * fundo que ele realmente tem na tela.
 *
 * Por que isto existe, se já há axe e scripts/check-contrast.cjs:
 *
 *  - o check-contrast.cjs compara PARES DECLARADOS de tokens. Ele mede a coisa
 *    certa, mas só a que está na lista — e o CSS pode estar usando outro token.
 *    Foi exatamente o que aconteceu: 135 regras escreviam
 *    `color: var(--color-primary-600)`, um verde escuro correto sobre branco e
 *    de 1,93:1 sobre o card escuro. Nenhum par cobria isso.
 *
 *  - o axe também não reprovou esses casos. Ele pula elementos cujo fundo não
 *    consegue resolver com segurança, e boa parte das falhas estava justamente
 *    em superfícies tingidas e translúcidas.
 *
 * Esta varredura compõe a pilha inteira de fundos (inclusive alfa) até a raiz e
 * aplica a fórmula do WCAG. Sete falhas reais apareceram na primeira execução,
 * todas no tema escuro, todas invisíveis para as duas ferramentas anteriores.
 *
 * Limite conhecido: onde há gradiente no caminho, o fundo não é uma cor só e o
 * elemento é pulado. São poucos — a essa altura o produto tem seis gradientes.
 */
const { test, expect } = require('@playwright/test');
const { prepareOfflinePage } = require('./helpers.cjs');

const ABAS = ['resumo', 'novo', 'extrato', 'orcamento', 'config'];

const SONDA = function() {
  function rgb(s) {
    const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const n = m[1].split(',').map(x => parseFloat(x));
    return { r:n[0], g:n[1], b:n[2], a: n.length > 3 ? n[3] : 1 };
  }
  function sobre(frente, fundo) {
    const a = frente.a;
    return { r: frente.r*a + fundo.r*(1-a), g: frente.g*a + fundo.g*(1-a),
             b: frente.b*a + fundo.b*(1-a), a: 1 };
  }
  function lum(c) {
    const f = (v) => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b);
  }
  function razao(a, b) {
    const la = lum(a), lb = lum(b);
    return (Math.max(la,lb) + 0.05) / (Math.min(la,lb) + 0.05);
  }
  function fundoDe(el) {
    let acumulado = { r:255, g:255, b:255, a:1 };
    const pilha = [];
    let n = el;
    while (n && n !== document.documentElement) { pilha.push(n); n = n.parentElement; }
    pilha.push(document.documentElement);
    for (let i = pilha.length - 1; i >= 0; i--) {
      const c = getComputedStyle(pilha[i]);
      const bg = rgb(c.backgroundColor);
      if (bg && bg.a > 0) acumulado = sobre(bg, acumulado);
      // gradiente: não dá para compor, então marcamos e saímos
      if (c.backgroundImage && c.backgroundImage !== 'none' && /gradient/.test(c.backgroundImage))
        return { cor: acumulado, gradiente: true };
    }
    return { cor: acumulado, gradiente: false };
  }
  const saida = [];
  for (const e of document.querySelectorAll('*')) {
    const caixa = e.getBoundingClientRect();
    if (!(caixa.width > 0 && caixa.height > 0)) continue;
    if (e.childElementCount) continue;
    const texto = (e.textContent || '').trim();
    if (!texto || texto.length > 60) continue;
    const c = getComputedStyle(e);
    if (parseFloat(c.opacity) < 0.95) continue;
    const cor = rgb(c.color); if (!cor) continue;
    const f = fundoDe(e);
    if (f.gradiente) continue;
    const efetiva = cor.a < 1 ? sobre(cor, f.cor) : cor;
    const r = razao(efetiva, f.cor);
    const px = parseFloat(c.fontSize);
    const peso = parseInt(c.fontWeight, 10) || 400;
    const grande = px >= 24 || (px >= 18.66 && peso >= 700);
    const minimo = grande ? 3 : 4.5;
    if (r < minimo) {
      saida.push({
        texto: texto.slice(0, 26),
        classe: String(e.className).slice(0, 34) || e.tagName.toLowerCase(),
        cor: c.color, fundo: `rgb(${Math.round(f.cor.r)}, ${Math.round(f.cor.g)}, ${Math.round(f.cor.b)})`,
        razao: Math.round(r * 100) / 100, minimo, px,
      });
    }
  }
  return saida;
};

for (const tema of ['light', 'dark']) {
  test(`contraste real de todo texto — tema ${tema}`, async function({ page }) {
    await prepareOfflinePage(page);
    await page.evaluate(function(t) {
      document.documentElement.setAttribute('data-theme', t);
    }, tema);

    const falhas = [];
    for (const aba of ABAS) {
      await page.evaluate(function(a) {
        if (typeof mudarAba === 'function') mudarAba(a);
      }, aba);
      await page.waitForTimeout(600);
      const r = await page.evaluate(SONDA);
      r.forEach(function(x) { falhas.push(`${aba} · ${x.classe} · ${x.razao}:1 (min ${x.minimo}) — ${x.cor} sobre ${x.fundo} «${x.texto}»`); });
    }
    expect([...new Set(falhas)], `texto abaixo do mínimo WCAG AA no tema ${tema}`).toEqual([]);
  });
}

test.describe('contraste real — overlays críticos', function() {
  for (const tema of ['light', 'dark']) {
    test(`auth overlay — tema ${tema}`, async function({ page }) {
      await prepareOfflinePage(page);
      await page.evaluate(function(t) {
        document.documentElement.setAttribute('data-theme', t);
        var ov = document.getElementById('auth-overlay');
        if (ov) ov.style.display = '';
        document.body.classList.add('auth-overlay-open');
      }, tema);
      await expect(page.locator('#auth-overlay')).toBeVisible();
      await page.waitForTimeout(400);
      const falhas = await page.evaluate(SONDA);
      const msgs = falhas.map(function(x) {
        return `auth · ${x.classe} · ${x.razao}:1 (min ${x.minimo}) — ${x.cor} sobre ${x.fundo} «${x.texto}»`;
      });
      expect([...new Set(msgs)], `auth overlay abaixo do AA no tema ${tema}`).toEqual([]);
    });
  }

  test.describe('paywall (fonte 4322)', function() {
    test.use({ baseURL: 'http://127.0.0.1:4322' });

    for (const tema of ['light', 'dark']) {
      test(`paywall — tema ${tema}`, async function({ page }) {
        await prepareOfflinePage(page);
        await page.waitForFunction(function() {
          return typeof INIT_BILLING !== 'undefined'
            && typeof INIT_BILLING.abrirPaywall === 'function';
        }, { timeout: 30000 });
        await page.evaluate(function(t) {
          document.documentElement.setAttribute('data-theme', t);
          INIT_BILLING.abrirPaywall('Contraste paywall');
        }, tema);
        await expect(page.locator('.billing-modal, .billing-overlay').first()).toBeVisible({ timeout: 10000 });
        await page.waitForTimeout(400);
        const falhas = await page.evaluate(SONDA);
        const msgs = falhas.map(function(x) {
          return `paywall · ${x.classe} · ${x.razao}:1 (min ${x.minimo}) — ${x.cor} sobre ${x.fundo} «${x.texto}»`;
        });
        expect([...new Set(msgs)], `paywall abaixo do AA no tema ${tema}`).toEqual([]);
      });
    }
  });
});
