/**
 * auth-offline-entrada.spec.cjs — entrar sem rede, com sessão guardada.
 *
 * Esta é a única spec que roda contra o build CLOUD de verdade: ela não chama
 * seedOfflineStorage (que força o modo local), porque o que está sob teste é
 * justamente o comportamento com Supabase configurado e fora de alcance.
 *
 * O bug que ela guarda: no build cloud, sem alcançar o servidor, o overlay de
 * login subia sobre o dashboard e as únicas saídas exigiam rede. Como o
 * desbloqueio é revogado a cada ida ao segundo plano, bastava trocar de app e
 * voltar sem sinal para ficar trancado fora dos próprios lançamentos.
 *
 * E a causa raiz, que só apareceu no navegador: com o access_token vencido — o
 * caso normal de abrir o app no dia seguinte — o getSession() do supabase-js
 * entra em retry com backoff e a promessa fica pendente por dezenas de
 * segundos. Por isso o cenário aqui usa token VENCIDO: com token válido o
 * teste passaria mesmo com a versão quebrada.
 */
const { test, expect } = require('@playwright/test');

/* Opt-out do modo local que playwright.config.cjs aplica por padrão: esta é a
   única spec que precisa do Supabase ATIVO, porque o que está sob teste é o
   comportamento com servidor configurado e fora de alcance. */
test.use({ storageState: { cookies: [], origins: [] } });

const CHAVE_SESSAO = 'fp-supabase-auth';

/** Sessão do supabase-js gravada no disco, como a de quem já entrou uma vez. */
async function semearSessao(page, opts) {
  const vencida = !opts || opts.vencida !== false;
  await page.addInitScript(function(payload) {
    const exp = Math.floor(Date.now() / 1000) + payload.deslocamento;
    localStorage.setItem(payload.chave, JSON.stringify({
      access_token: 'e2e.token.falso',
      refresh_token: 'e2e-refresh',
      expires_at: exp,
      token_type: 'bearer',
      user: {
        id: 'e2e-user',
        email: 'renato@exemplo.com',
        user_metadata: { name: 'Renato' },
      },
    }));
    localStorage.setItem('fp-auth-last-email', 'renato@exemplo.com');
  }, { chave: CHAVE_SESSAO, deslocamento: vencida ? -3600 : 3600 });
}

/** Corta tudo que for Supabase: "sem rede" determinístico, sem depender do CI. */
async function derrubarServidor(page) {
  await page.route('**://*.supabase.co/**', function(rota) {
    return rota.abort('internetdisconnected');
  });
}

/** Servidor de pé: só o health precisa responder para o app se considerar online. */
async function levantarServidor(page) {
  await page.route('**://*.supabase.co/**', function(rota) {
    return rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"name":"GoTrue"}',
    });
  });
}

const BOTAO_OFFLINE = '#auth-offline-btn';
const FORM_SENHA = '#auth-login-form';

test.describe('sem conexão, com sessão neste aparelho', function() {
  test('a saída offline aparece e o campo de senha some', async function({ page }) {
    await derrubarServidor(page);
    await semearSessao(page);
    await page.goto('/');

    // O ping tem teto de 8s; a UI reage assim que ele falha.
    await expect(page.locator(BOTAO_OFFLINE)).toBeVisible({ timeout: 20000 });

    // A senha só se confere no servidor — deixá-la à vista seria um convite a
    // um erro que o app não tem como julgar.
    await expect(page.locator(FORM_SENHA)).toBeHidden();

    await expect(page.locator('#auth-message'))
      .toContainText(/sem conex/i);
  });

  test('um toque entra no app e o dashboard renderiza', async function({ page }) {
    const erros = [];
    page.on('pageerror', function(e) { erros.push(e.message || String(e)); });

    await derrubarServidor(page);
    await semearSessao(page);
    await page.goto('/');

    await page.locator(BOTAO_OFFLINE).click({ timeout: 20000 });

    await expect(page.locator('#auth-overlay')).toBeHidden();
    await expect(page.locator('#aba-resumo')).toBeVisible();
    await expect(page.locator('#card-saldo-principal')).toContainText(/R\$/);

    expect(erros).toEqual([]);
  });

  test('o app avisa que está offline, sem prometer sincronização', async function({ page }) {
    await derrubarServidor(page);
    await semearSessao(page);
    await page.goto('/');
    await page.locator(BOTAO_OFFLINE).click({ timeout: 20000 });

    // O toast some sozinho; basta ter aparecido.
    await expect(page.locator('body')).toContainText(/sem conex/i, { timeout: 8000 });
  });

  test('sem sessão guardada não há saída offline — é visitante, não usuário', async function({ page }) {
    await derrubarServidor(page);
    // Sem semearSessao: ninguém nunca entrou neste aparelho.
    await page.goto('/');
    await page.waitForTimeout(12000);
    await expect(page.locator(BOTAO_OFFLINE)).toBeHidden();
  });
});

test.describe('com o servidor de pé, nada muda', function() {
  test('o desbloqueio continua sendo por senha', async function({ page }) {
    await levantarServidor(page);
    await semearSessao(page, { vencida: false });
    await page.goto('/');

    await expect(page.locator(FORM_SENHA)).toBeVisible({ timeout: 20000 });
    await expect(page.locator(BOTAO_OFFLINE)).toBeHidden();
    await expect(page.locator('#auth-message')).toContainText(/confirme sua identidade/i);
  });
});
