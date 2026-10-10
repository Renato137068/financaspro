/**
 * e2e/auth-supabase-ui.spec.cjs — markup e login Supabase (opcional via secrets CI).
 *
 * Variáveis:
 *   E2E_SUPABASE=1
 *   E2E_EMAIL / E2E_PASSWORD — conta sem MFA
 *   E2E_SUPABASE_MFA_EMAIL / E2E_SUPABASE_MFA_PASSWORD / E2E_TOTP_SECRET — conta com TOTP
 */
const { test, expect } = require('@playwright/test');
const { authenticator } = require('otplib');

async function loginSupabase(page, email, password, totpSecret) {
  await page.goto('/');
  await page.fill('#auth-login-email', email);
  await page.locator('#auth-login-step-email button[type="submit"]').click();
  await page.fill('#auth-login-password', password);
  await page.locator('#auth-login-form button[type="submit"]').click();

  var totp = page.locator('#auth-totp-form');
  if (await totp.isVisible({ timeout: 8000 }).catch(function() { return false; })) {
    if (!totpSecret) {
      throw new Error('Conta exige TOTP — defina E2E_TOTP_SECRET ou use conta sem MFA');
    }
    var code = authenticator.generate(totpSecret);
    await page.fill('#auth-totp-code', code);
    await page.locator('#auth-totp-form button[type="submit"]').click();
  }

  await expect(page.locator('#auth-overlay')).toBeHidden({ timeout: 25000 });
}

/* Build cloud de verdade, sem o modo local que playwright.config.cjs aplica
   por padrão: com `fp-force-local` o overlay de login nunca aparece, e o teste
   do e-mail inválido passava sem conferir nada. Mesmo opt-out de
   auth-offline-entrada.spec.cjs. Vale também para o login real abaixo. */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Auth Supabase — UI estática', function() {
  /* Nenhum teste de UI fala com o Supabase de produção: o health responde
     aqui mesmo, e nada mais é chamado antes do login. */
  test.beforeEach(async function({ page }) {
    await page.route('**://*.supabase.co/**', function(rota) {
      return rota.fulfill({ status: 200, contentType: 'application/json', body: '{"name":"GoTrue"}' });
    });
  });

  test('dist inclui overlay de login, recovery e TOTP', async function({ page }) {
    await page.goto('/');
    await expect(page.locator('#auth-overlay')).toBeAttached();
    await expect(page.locator('#auth-login-step-email')).toBeAttached();
    await expect(page.locator('#auth-reset-password-form')).toBeAttached();
    await expect(page.locator('#auth-biometric-hint')).toBeAttached();
    await expect(page.locator('#auth-resend-email-btn')).toBeAttached();
    await expect(page.locator('#auth-totp-form')).toBeAttached();
    await expect(page.locator('#auth-totp-code')).toBeAttached();
    await expect(page.locator('#auth-totp-back')).toBeAttached();
    await expect(page.locator('#auth-totp-form')).toBeHidden();
    await expect(page.locator('.auth-footer-note')).toContainText(/Supabase|nuvem/i);
  });

  test('etapa e-mail rejeita formato inválido', async function({ page }) {
    await page.goto('/');
    await expect(page.locator('#auth-overlay')).toBeVisible({ timeout: 20000 });
    var campo = page.locator('#auth-login-email');
    var continuar = page.locator('#auth-login-step-email button[type="submit"]');

    // Sem "@": o próprio navegador barra o envio (input type=email).
    await campo.fill('email-invalido');
    await continuar.click();
    expect(await campo.evaluate(function(el) { return el.validity.typeMismatch; })).toBe(true);
    await expect(page.locator('#auth-login-form')).toBeHidden();

    // Sem domínio com ponto: o navegador aceita, a regra do app recusa.
    await campo.fill('ana@exemplo');
    await continuar.click();
    await expect(page.locator('#auth-message')).toContainText(/e-mail válido/i);
    await expect(page.locator('#auth-login-form')).toBeHidden();
  });
});

test.describe('Auth Supabase — login real (CI secrets)', function() {
  test('login sem MFA', async function({ page }) {
    test.skip(
      !process.env.E2E_SUPABASE || !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
      'Defina E2E_SUPABASE=1 E2E_EMAIL E2E_PASSWORD'
    );
    await loginSupabase(page, process.env.E2E_EMAIL, process.env.E2E_PASSWORD, null);
  });

  test('login com MFA TOTP', async function({ page }) {
    test.skip(
      !process.env.E2E_SUPABASE
        || !process.env.E2E_SUPABASE_MFA_EMAIL
        || !process.env.E2E_SUPABASE_MFA_PASSWORD
        || !process.env.E2E_TOTP_SECRET,
      'Defina E2E_SUPABASE_MFA_EMAIL, E2E_SUPABASE_MFA_PASSWORD, E2E_TOTP_SECRET'
    );
    await loginSupabase(
      page,
      process.env.E2E_SUPABASE_MFA_EMAIL,
      process.env.E2E_SUPABASE_MFA_PASSWORD,
      process.env.E2E_TOTP_SECRET,
    );
  });
});
