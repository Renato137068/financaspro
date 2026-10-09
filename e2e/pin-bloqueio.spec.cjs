/**
 * e2e/pin-bloqueio.spec.cjs — ativar o PIN pelo Perfil e abrir o app trancado,
 * no build de produção.
 *
 * O PIN só tinha teste no jsdom (app-pin.test.js), que não pega tela de
 * bloqueio atrás de outro elemento, campo que não recebe o dedo ou PBKDF2 que
 * não roda no navegador de verdade. Aqui: Perfil → Segurança → liga o PIN pelo
 * interruptor, recarrega, erra uma vez, acerta e vê o dashboard.
 */
const { test, expect } = require('@playwright/test');
const { prepareOfflinePage, dismissOverlays } = require('./helpers.cjs');

const PIN = '4831';

async function tocarAba(page, aba) {
  await page.locator('.nav-bottom [data-action="mudar-aba"][data-aba="' + aba + '"]').click();
  await expect(page.locator('#aba-' + aba)).toBeVisible();
}

/** Toca no primeiro quadradinho e digita: cada dígito pula para o próximo. */
async function digitarPin(page, prefixo, pin) {
  await page.locator('#' + prefixo + '-1').click();
  await page.keyboard.type(pin);
}

const telaBloqueio = (page) => page.locator('.pin-lock-screen');

test('ativar o PIN pelo Perfil, recarregar, errar uma vez e acertar', async function({ page }) {
  const erros = [];
  page.on('pageerror', function(e) { erros.push(e.message || String(e)); });

  await prepareOfflinePage(page);
  await expect(telaBloqueio(page)).toHaveCount(0);

  // Perfil → Segurança → interruptor do PIN.
  await tocarAba(page, 'config');
  await page.locator('#aba-config [data-action="mudar-aba"][data-aba="config-seguranca"]').click();
  await expect(page.locator('#aba-config-seguranca')).toBeVisible();
  await expect(page.locator('#perfil-pin-toggle-status')).toHaveText('Desativado');
  await page.locator('label.perfil-switch', { has: page.locator('#chk-pin') }).click();

  // O modal de criação ganha o botão "Ativar PIN" logo depois de abrir.
  const ativar = page.locator('.modal-overlay .modal-btn');
  await expect(ativar).toHaveText('Ativar PIN');
  await digitarPin(page, 'pin', PIN);
  await ativar.click();
  await expect(page.locator('.modal-overlay')).toHaveCount(0);
  await expect(page.locator('#chk-pin')).toBeChecked();
  await expect(page.locator('#perfil-pin-toggle-status')).not.toHaveText('Desativado');

  // Abrir de novo: trancado, sem saldo à vista.
  await page.reload();
  await expect(telaBloqueio(page)).toBeVisible({ timeout: 20000 });
  await expect(page.locator('html')).toHaveClass(/pin-locked/);

  // Errar uma vez: continua trancado, avisa quantas tentativas restam.
  await digitarPin(page, 'unlock', '9137');
  await expect(page.locator('.toast', { hasText: /PIN incorreto/ })).toBeVisible();
  await expect(telaBloqueio(page)).toBeVisible();
  await expect(page.locator('#unlock-1')).toHaveValue('');

  // Acertar: a tela some e o dashboard aparece.
  await digitarPin(page, 'unlock', PIN);
  await expect(telaBloqueio(page)).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('html')).not.toHaveClass(/pin-locked/);
  await dismissOverlays(page);
  await expect(page.locator('#aba-resumo')).toBeVisible();
  await expect(page.locator('#card-saldo-principal')).toContainText('5.000,00');
  expect(erros).toEqual([]);
});
