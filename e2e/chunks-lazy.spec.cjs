/**
 * e2e/chunks-lazy.spec.cjs — telas que viraram chunk lazy continuam abrindo.
 *
 * Tirar um módulo do app.bundle.js é a forma mais silenciosa de apagar uma
 * funcionalidade: todo consumidor checa `typeof X !== 'undefined'`, então a
 * ausência não quebra nada — a tela só fica vazia. Aqui o build de produção é
 * exercitado de verdade: o chunk precisa ser pedido, carregar e renderizar.
 */
const { test, expect } = require('@playwright/test');
const { prepareOfflinePage } = require('./helpers.cjs');

test.describe('chunks lazy no build de produção', function() {
  test('Simulador carrega sob demanda e oferece "Criar meta no app"', async function({ page }) {
    const pedidos = [];
    page.on('request', function(req) {
      const url = req.url();
      if (url.indexOf('/js/lazy/') !== -1) pedidos.push(url.split('/js/lazy/')[1]);
    });
    await prepareOfflinePage(page);

    // Antes de abrir: nada do simulador no bundle eager.
    expect(await page.evaluate(function() { return typeof INIT_SIMULADOR; })).toBe('undefined');

    await page.evaluate(function() { mudarAba('config-simulador'); });
    await expect(page.locator('#simulador-panel [role="tab"]')).toHaveCount(4);
    expect(pedidos).toContain('simulador.bundle.js');

    // Modo Meta: o CTA depende de METAS, que mora no chunk 'metas'.
    await page.locator('#sim-tab-meta').click();
    await page.locator('#sim-m-objetivo').fill('12000');
    await page.locator('#sim-m-meses').fill('24');
    await page.locator('[data-action="sim-calc-meta"]').click();
    await expect(page.locator('[data-action="sim-criar-meta"]')).toBeVisible();
  });

  test('Extrato carrega sob demanda e lista os lançamentos', async function({ page }) {
    await prepareOfflinePage(page);
    expect(await page.evaluate(function() { return typeof INIT_EXTRATO; })).toBe('undefined');

    await page.evaluate(function() { mudarAba('extrato'); });
    await expect(page.locator('#lista-transacoes')).toContainText('Salário');
    expect(await page.evaluate(function() { return typeof INIT_EXTRATO; })).toBe('object');
  });

  test('Orçamento carrega sob demanda, inclusive por link direto para uma sub-aba', async function({ page }) {
    await prepareOfflinePage(page);
    expect(await page.evaluate(function() { return typeof INIT_ORCAMENTO; })).toBe('undefined');

    await page.evaluate(function() { mudarAba('orcamento', { orcSub: 'metas' }); });
    await page.waitForFunction(function() { return typeof INIT_ORCAMENTO !== 'undefined'; });
    await expect(page.locator('#orc-sub-tab-metas[aria-selected="true"]')).toHaveCount(1);
  });

  test('Perfil carrega sob demanda e os controles funcionam', async function({ page }) {
    await prepareOfflinePage(page);
    expect(await page.evaluate(function() { return typeof INIT_CONFIG; })).toBe('undefined');

    await page.evaluate(function() { mudarAba('config-seguranca'); });
    await page.waitForFunction(function() { return typeof INIT_CONFIG !== 'undefined'; });
    // O switch de relatórios de erro só grava se INIT_CONFIG.init ligou os controles.
    await page.locator('#chk-obs-erros').evaluate(function(el) { el.click(); });
    expect(await page.evaluate(function() { return DADOS.getConfig().obsErrorsEnabled; })).toBe(false);
  });

  test('backup pelo lembrete do dashboard baixa o arquivo antes de abrir o Perfil', async function({ page }) {
    await prepareOfflinePage(page);
    const download = page.waitForEvent('download');
    await page.evaluate(function() { CONFIG_USER.exportarDados(); });
    expect((await download).suggestedFilename()).toMatch(/\.json$/);
  });

  test('editar pelo alerta abre a transação mesmo antes de abrir o Extrato', async function({ page }) {
    await prepareOfflinePage(page);
    await page.evaluate(function() { ALERTAS._executarAcao('editarTransacao', { id: 'e2e-1' }); });
    await expect(page.locator('#novo-descricao')).toHaveValue('Salário');
    expect(await page.evaluate(function() {
      return document.getElementById('form-transacao').dataset.editId;
    })).toBe('e2e-1');
  });

  test('"Refazer tour" carrega o tour sob demanda', async function({ page }) {
    await prepareOfflinePage(page);
    expect(await page.evaluate(function() { return typeof ONBOARDING; })).toBe('undefined');

    // O botão mora em Perfil → Ajuda.
    await page.evaluate(function() { mudarAba('config-ajuda'); });
    await page.locator('#btn-refazer-onboarding').click();
    await expect(page.locator('#onboarding-overlay')).toBeVisible();
  });
});
