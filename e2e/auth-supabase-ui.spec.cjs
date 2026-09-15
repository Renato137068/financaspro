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

test.describe('Auth Supabase — UI estática', function() {
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
    var overlay = page.locator('#auth-overlay');
    if (await overlay.isVisible()) {
      await page.fill('#auth-login-email', 'email-invalido');
      await page.locator('#auth-login-step-email button[type="submit"]').click();
      await expect(page.locator('#auth-message')).toContainText(/e-mail válido/i);
      await expect(page.locator('#auth-login-form')).toBeHidden();
    }
  });
});

test.describe('Auth Supabase — login real (CI secrets)', function() {
  // O login real precisa do transporte Supabase ATIVO. A config global do
  // Playwright injeta fp-force-local=1 (modo piloto, sem Supabase) em toda a
  // suíte; sem desligar isso, o app sobe em modo local e o fluxo de login
  // Supabase nem existe — o teste passaria por engano ou travaria. Zerar o
  // storageState remove a flag e devolve o comportamento cloud, exatamente
  // como auth-offline-entrada.spec.cjs faz. (Sem secrets, os testes abaixo
  // são pulados, então isto é inócuo até o Supabase de staging existir.)
  test.use({ storageState: { cookies: [], origins: [] } });

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
