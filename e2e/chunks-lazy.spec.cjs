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
      // Chunk do Vite: js/<chunk>-<hash>.js.
      const m = req.url().match(/\/js\/([\w-]+)-[\w-]{8}\.js$/);
      if (m) pedidos.push(m[1]);
    });
    await prepareOfflinePage(page);

    // Antes de abrir: nada do simulador no bundle eager.
    expect(await page.evaluate(function() { return typeof INIT_SIMULADOR; })).toBe('undefined');
    expect(pedidos).not.toContain('simulador');

    await page.evaluate(function() { mudarAba('config-simulador'); });
    await expect(page.locator('#simulador-panel [role="tab"]')).toHaveCount(4);
    expect(pedidos).toContain('simulador');

    // Modo Meta: o CTA depende de METAS, que mora no chunk 'metas'.
    await page.locator('#sim-tab-meta').click();
    await page.locator('#sim-m-objetivo').fill('12000');
    await page.locator('#sim-m-meses').fill('24');
    await page.locator('[data-action="sim-calc-meta"]').click();
    await expect(page.locator('[data-action="sim-criar-meta"]')).toBeVisible();
  });

  // O CSS da tela chega com o chunk (TELAS.estilo): fora do CSS do primeiro
  // acesso, mas aplicado antes de a tela aparecer.
  test('o CSS do Simulador chega com o chunk, não no primeiro acesso', async function({ page }) {
    await prepareOfflinePage(page);
    const regrasSim = function() {
      return Array.from(document.styleSheets).some(function(s) {
        try {
          return Array.from(s.cssRules).some(function(r) { return /\.sim-tabs\b/.test(r.selectorText || ''); });
        } catch (e) { return false; }
      });
    };
    expect(await page.evaluate(regrasSim)).toBe(false);

    await page.evaluate(function() { mudarAba('config-simulador'); });
    await expect(page.locator('#simulador-panel [role="tab"]')).toHaveCount(4);
    expect(await page.locator('style[data-chunk="simulador"]').count()).toBe(1);
    expect(await page.evaluate(regrasSim)).toBe(true);
    await expect(page.locator('.sim-tabs')).toHaveCSS('display', 'flex');
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

  // Orçamento e sub-telas do Perfil vêm fora do index.html (telas/, com o
  // chunk). Tela que chega vazia, ou com ícone fora do subset do lucide (que
  // puxaria a lib completa, ~390 KB), passaria despercebida sem este teste.
  test('telas que chegam com o chunk aparecem completas e com ícones do subset', async function({ page }) {
    const pedidos = [];
    page.on('request', function(req) { pedidos.push(req.url()); });
    await prepareOfflinePage(page);
    expect(await page.locator('#aba-orcamento').getAttribute('aria-busy')).toBe('true');

    await page.evaluate(function() { mudarAba('orcamento'); });
    await expect(page.locator('#aba-orcamento .orc-tablist [role="tab"]').first()).toBeVisible();
    await expect(page.locator('#aba-orcamento')).not.toHaveAttribute('aria-busy', 'true');

    for (const tela of ['config-categorias', 'config-ajuda', 'config-suporte', 'editar-perfil']) {
      await page.evaluate(function(t) { mudarAba(t); }, tela);
      await expect(page.locator('#aba-' + tela)).not.toHaveAttribute('aria-busy', 'true');
      await expect(page.locator('#aba-' + tela + ' .perfil-header, #aba-' + tela + ' h2').first()).toBeVisible();
    }

    // Todo <i data-lucide> das telas virou <svg>: nenhum ícone ficou pendente.
    const pendentes = await page.evaluate(function() {
      return Array.from(document.querySelectorAll('[data-tela] i[data-lucide]')).map(function(i) { return i.getAttribute('data-lucide'); });
    });
    expect(pendentes).toEqual([]);
    expect(pedidos.filter(function(u) { return u.indexOf('lucide-full') !== -1; })).toEqual([]);
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

  // Chunks ES Module (ADR 0005): import() dinâmico, que o Vite divide em
  // js/<nome>-<hash>.js. Pedidos só ao abrir o painel, e renderizam.
  test('previsão e relatórios (chunks ES Module) chegam ao abrir o painel', async function({ page }) {
    const pedidos = [];
    page.on('request', function(req) {
      const m = req.url().match(/\/js\/([\w-]+)-[\w-]{8}\.js$/);
      if (m) pedidos.push(m[1]);
    });
    await prepareOfflinePage(page);
    expect(await page.evaluate(function() { return [typeof PREVISAO, typeof INIT_RELATORIOS]; }))
      .toEqual(['undefined', 'undefined']);
    expect(pedidos).not.toContain('previsao');

    await page.evaluate(function() { INIT_NAVIGATION.togglePrevisao(); });
    await expect(page.locator('#previsao-painel')).not.toBeEmpty();
    expect(pedidos).toContain('previsao');

    await page.evaluate(function() { INIT_NAVIGATION.toggleRelatorios(); });
    await expect(page.locator('#relatorios-panel')).not.toBeEmpty();
    expect(pedidos).toContain('relatorios');
    expect(await page.evaluate(function() { return [typeof PREVISAO, typeof INIT_RELATORIOS]; }))
      .toEqual(['object', 'object']);
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
