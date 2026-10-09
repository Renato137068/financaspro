/**
 * e2e/backup-restaurar.spec.cjs — exportar com senha num aparelho e restaurar
 * pelo Perfil num aparelho limpo, no build de produção.
 *
 * Exportar já tinha E2E (chunks-lazy); restaurar só rodava no jsdom chamando
 * processarImport direto. Aqui o caminho é o da pessoa que trocou de celular:
 * Perfil → Backup e dados → Exportar (com senha); no aparelho novo, Perfil →
 * Backup e dados → Importar, escolhe o arquivo, digita a senha. A contagem de
 * lançamentos e o saldo têm de bater com os de antes, também depois do reload.
 */
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { prepareOfflinePage, waitForAppBoot, dismissOverlays } = require('./helpers.cjs');

const SENHA = 'senha-do-backup-e2e';

async function tocarAba(page, aba) {
  await page.locator('.nav-bottom [data-action="mudar-aba"][data-aba="' + aba + '"]').click();
  await expect(page.locator('#aba-' + aba)).toBeVisible();
}

/** Perfil → "Backup e dados", pelos toques. */
async function abrirBackupEDados(page) {
  await tocarAba(page, 'config');
  await page.locator('#aba-config [data-action="mudar-aba"][data-aba="config-dados"]').click();
  await expect(page.locator('#aba-config-dados')).toBeVisible();
  await expect(page.locator('#aba-config-dados')).not.toHaveAttribute('aria-busy', 'true');
}

async function criarDespesa(page, valor, descricao) {
  await tocarAba(page, 'novo');
  await page.locator('.data-chip[data-offset="0"]').click();
  await page.locator('#novo-valor').fill(valor);
  await page.locator('#novo-valor').blur();
  await page.locator('#novo-descricao').fill(descricao);
  await page.locator('#novo-descricao').blur();
  await page.locator('.btn-registrar').click();
}

const itensDoExtrato = (page) => page.locator('#lista-transacoes .ext-tx');

/** Aparelho novo: app já configurado, nenhum lançamento, modo local. */
async function aparelhoLimpo(browser, testInfo) {
  const origem = testInfo.project.use.baseURL;
  const contexto = await browser.newContext({
    baseURL: origem,
    viewport: { width: 360, height: 640 },
    locale: 'pt-BR',
    acceptDownloads: true,
    storageState: { cookies: [], origins: [{ origin: origem, localStorage: [{ name: 'fp-force-local', value: '1' }] }] },
  });
  const page = await contexto.newPage();
  await page.addInitScript(function() {
    localStorage.setItem('fp-force-local', '1');
    if (localStorage.getItem('fp-config')) return;
    localStorage.setItem('fp-config', JSON.stringify({
      nome: 'Aparelho novo', moeda: 'BRL', tema: 'light', plano: 'free', pinAtivo: false,
      onboardingConcluido: true, renda: 5000, _schemaVer: 2,
    }));
    localStorage.setItem('fp-transacoes', '[]');
    localStorage.setItem('fp-contas', '[]');
  });
  await page.goto('/?offline=1');
  await waitForAppBoot(page);
  await dismissOverlays(page);
  return { contexto: contexto, page: page };
}

test('backup com senha restaurado pelo Perfil num aparelho limpo: mesma contagem e mesmo saldo', async function({ page, browser }, testInfo) {
  const erros = [];
  page.on('pageerror', function(e) { erros.push(e.message || String(e)); });

  // ── Aparelho de origem: salário semeado + duas despesas pela tela.
  await prepareOfflinePage(page);
  await criarDespesa(page, '150,00', 'Backup E2E mercado');
  await criarDespesa(page, '49,90', 'Backup E2E farmácia');
  await tocarAba(page, 'extrato');
  await expect(itensDoExtrato(page)).toHaveCount(3);
  await tocarAba(page, 'resumo');
  const saldo = page.locator('#card-saldo-principal');
  await expect(saldo).toContainText('4.800,10');
  const saldoAntes = (await saldo.textContent()).replace(/\s+/g, ' ').trim();

  // ── Exportar com senha.
  await abrirBackupEDados(page);
  await page.locator('#aba-config-dados [data-action="exportar-dados"]').click();
  await page.locator('#input-senha-bkp').fill(SENHA);
  await page.locator('#input-senha-bkp2').fill(SENHA);
  const baixando = page.waitForEvent('download');
  await page.locator('#bs-ok').click();
  const download = await baixando;
  const arquivo = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(arquivo);
  const conteudo = fs.readFileSync(arquivo, 'utf8');
  expect(JSON.parse(conteudo).formato).toBe('backup-cifrado-financaspro');
  expect(conteudo).not.toContain('Backup E2E mercado');
  expect(erros).toEqual([]);

  // ── Aparelho limpo.
  const novo = await aparelhoLimpo(browser, testInfo);
  const p2 = novo.page;
  const erros2 = [];
  p2.on('pageerror', function(e) { erros2.push(e.message || String(e)); });
  try {
    await expect(p2.locator('#card-saldo-principal')).toContainText('0,00');
    await tocarAba(p2, 'extrato');
    await expect(itensDoExtrato(p2)).toHaveCount(0);

    // ── Restaurar: Importar abre o seletor de arquivo do sistema.
    await abrirBackupEDados(p2);
    const escolhendo = p2.waitForEvent('filechooser');
    await p2.locator('#aba-config-dados [data-action="abrir-import"]').click();
    await (await escolhendo).setFiles(arquivo);

    // Senha errada primeiro: pede de novo, sem alterar nada.
    await p2.locator('#input-senha-bkp').fill('senha-errada');
    await p2.locator('#bs-ok').click();
    await expect(p2.locator('#senha-bkp-msg')).toContainText(/incorreta/i);
    await p2.locator('#input-senha-bkp').fill(SENHA);
    await p2.locator('#bs-ok').click();

    await expect(p2.locator('.toast', { hasText: 'Importado: 3 transações' })).toBeVisible();

    await tocarAba(p2, 'extrato');
    await expect(itensDoExtrato(p2)).toHaveCount(3);
    await expect(itensDoExtrato(p2).filter({ hasText: 'Backup E2E farmácia' })).toContainText('49,90');
    await tocarAba(p2, 'resumo');
    await expect(p2.locator('#card-saldo-principal')).toHaveText(saldoAntes);

    // ── E continua lá depois de fechar e abrir.
    await p2.reload();
    await waitForAppBoot(p2);
    await dismissOverlays(p2);
    await expect(p2.locator('#card-saldo-principal')).toHaveText(saldoAntes);
    await tocarAba(p2, 'extrato');
    await expect(itensDoExtrato(p2)).toHaveCount(3);
    expect(erros2).toEqual([]);
  } finally {
    await novo.contexto.close();
  }
});
