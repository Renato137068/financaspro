/**
 * e2e/orcamento-subabas.spec.cjs — as sub-abas do Orçamento abrem desenhadas.
 *
 * Metas, Gastos fixos e Patrimônio chegam em chunks e só eram desenhados na
 * próxima renderização do Resumo: o primeiro toque na sub-aba mostrava o
 * painel vazio, sem lista, sem estado vazio e sem botão de criar. O jsdom não
 * pegava porque lá o Resumo volta a renderizar logo depois do boot.
 */
const { test, expect } = require('@playwright/test');
const { prepareOfflinePage } = require('./helpers.cjs');

test('Metas, Gastos fixos e Patrimônio aparecem no primeiro toque', async function({ page }) {
  await prepareOfflinePage(page);
  await page.evaluate(function() { mudarAba('orcamento'); });
  await expect(page.locator('#orc-sub-tab-metas')).toBeVisible();

  await page.locator('#orc-sub-tab-metas').click();
  await expect(page.locator('#metas-list > *').first()).toBeVisible();

  await page.locator('#orc-sub-tab-assinaturas').click();
  await expect(page.locator('#assinaturas-list .sub-kpis')).toBeVisible();
  // Entrada para a primeira conta a pagar (a seção do Resumo só aparece depois).
  await expect(page.locator('#assinaturas-list [data-action="conta-nova"]')).toBeVisible();

  await page.locator('#orc-sub-tab-patrimonio').click();
  await expect(page.locator('#patrimonio-panel > *').first()).toBeVisible();
});
