/**
 * build-mode-residual.test.js — residuais da reauditoria (local mode, PIN flag, OCR SRI).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');

describe('Build mode local vs cloud', () => {
  test('config expõe FP_BUILD_MODE e BUILD_MODE', () => {
    const cfg = fs.readFileSync(path.join(root, 'js/core/config.js'), 'utf8');
    expect(cfg).toContain("FP_BUILD_MODE = 'cloud'");
    expect(cfg).toContain('BUILD_MODE:');
    expect(cfg).toContain('_fpWantLocal');
    expect(cfg).toContain('_FP_CLOUD_URL');
    expect(cfg).toContain('_FP_ENV_URL');
    expect(cfg).toContain('_FP_ENV_ANON');
  });

  test('set-build-mode alterna e restaura cloud', () => {
    const script = path.join(root, 'scripts/set-build-mode.cjs');
    const cfgPath = path.join(root, 'js/core/config.js');
    execSync('node "' + script + '" local', { stdio: 'pipe' });
    expect(fs.readFileSync(cfgPath, 'utf8')).toContain("FP_BUILD_MODE = 'local'");
    execSync('node "' + script + '" cloud', { stdio: 'pipe' });
    expect(fs.readFileSync(cfgPath, 'utf8')).toContain("FP_BUILD_MODE = 'cloud'");
  });

  test('inject-supabase-env sobrescreve e --clear restaura', () => {
    const script = path.join(root, 'scripts/inject-supabase-env.cjs');
    const cfgPath = path.join(root, 'js/core/config.js');
    execSync('node "' + script + '"', {
      stdio: 'pipe',
      env: {
        ...process.env,
        SUPABASE_URL: 'https://example-project.supabase.co',
        SUPABASE_ANON_KEY: 'test-anon-key',
      },
    });
    let cfg = fs.readFileSync(cfgPath, 'utf8');
    expect(cfg).toContain("var _FP_ENV_URL = 'https://example-project.supabase.co'");
    expect(cfg).toContain("var _FP_ENV_ANON = 'test-anon-key'");
    execSync('node "' + script + '" --clear', { stdio: 'pipe' });
    cfg = fs.readFileSync(cfgPath, 'utf8');
    expect(cfg).toContain("var _FP_ENV_URL = ''");
    expect(cfg).toContain("var _FP_ENV_ANON = ''");
  });

  test('package.json tem android:bundle:local e inject no build', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts['android:bundle:local']).toContain('set-build-mode.cjs local');
    expect(pkg.scripts.build).toContain('inject-supabase-env.cjs');
  });
});

describe('PIN flag plano + tema', () => {
  test('pin-guard usa financaspro_pin_locked e early FLAG_SECURE', () => {
    const guard = fs.readFileSync(path.join(root, 'js/pin-guard.js'), 'utf8');
    expect(guard).toContain('financaspro_pin_locked');
    expect(guard).toContain('financaspro_tema');
    expect(guard).toContain('enc3:');
    expect(guard).toContain('__FP_PIN_EARLY_SECURE__');
  });

  test('pin.js sincroniza LOCK_FLAG e libera early secure', () => {
    const pin = fs.readFileSync(path.join(root, 'js/pin.js'), 'utf8');
    expect(pin).toContain('syncLockFlag');
    expect(pin).toContain('financaspro_pin_locked');
    expect(pin).toContain('__FP_PIN_EARLY_SECURE_HELD__');
  });

  test('fp-secure-screen retém early PIN', () => {
    const js = fs.readFileSync(path.join(root, 'js/fp-secure-screen.js'), 'utf8');
    expect(js).toContain('__FP_PIN_EARLY_SECURE__');
    expect(js).toContain('retain()');
  });
});

describe('OCR desativado no produto', () => {
  test('stub OCR sem Tesseract / câmera', () => {
    const ocr = fs.readFileSync(path.join(root, 'js/ocr.js'), 'utf8');
    expect(ocr).toMatch(/no-op|desativado|removido/i);
    expect(ocr).not.toContain('tesseract.js@5.1.1');
    expect(ocr).not.toContain('btn-ocr-scan');
  });

  test('index não carrega ocr.js; lifecycle não chama OCR.init', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const life = fs.readFileSync(path.join(root, 'js/core/lifecycle.js'), 'utf8');
    expect(html).not.toMatch(/src="js\/ocr\.js"/);
    expect(life).not.toMatch(/OCR\.init/);
  });

  test('dados._apiAtiva é false em Capacitor nativo', () => {
    const dados = fs.readFileSync(path.join(root, 'js/core/dados.js'), 'utf8');
    expect(dados).toMatch(/isNativePlatform[\s\S]{0,120}return false/);
  });

  test('authController não sugere localhost:4000', () => {
    const auth = fs.readFileSync(path.join(root, 'js/authController.js'), 'utf8');
    expect(auth).not.toMatch(/localhost:4000/);
  });

  test('billing portal/cancel no path Supabase usam Edge Functions', () => {
    const billing = fs.readFileSync(path.join(root, 'js/billing.js'), 'utf8');
    expect(billing).toContain('_supabaseAtivo');
    expect(billing).toMatch(/stripe-portal/);
    expect(billing).toMatch(/stripe-cancel/);
    expect(billing).not.toMatch(/Gerenciar pagamento pelo navegador ainda não está disponível/);
    expect(billing).not.toMatch(/Cancelamento pelo navegador ainda não está disponível/);
  });

  test('dois trials distintos, cada um no seu canal', () => {
    const billing = fs.readFileSync(path.join(root, 'js/billing.js'), 'utf8');
    const initBilling = fs.readFileSync(path.join(root, 'js/modules/init-billing.js'), 'utf8');
    // 7 dias é o trial do SKU da loja; 14 é o Pro de boas-vindas, concedido
    // pelo backend sem cartão. São coisas diferentes e podem coexistir.
    expect(billing).toMatch(/TRIAL_DAYS:\s*7/);
    expect(billing).toMatch(/WELCOME_TRIAL_DAYS:\s*14/);
    // Duas colunas convertem melhor que três quando a terceira não tem persona.
    expect(initBilling).toMatch(/SHOW_BUSINESS_PLAN:\s*false/);
  });

  test('UI de equipe e aceite de convite no path Supabase', () => {
    const initBilling = fs.readFileSync(path.join(root, 'js/modules/init-billing.js'), 'utf8');
    const billing = fs.readFileSync(path.join(root, 'js/billing.js'), 'utf8');
    const supa = fs.readFileSync(path.join(root, 'js/core/supabase-billing.js'), 'utf8');
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    expect(initBilling).toMatch(/abrirEquipe/);
    expect(billing).toMatch(/inviteTeamMember/);
    expect(billing).toMatch(/org-invite/);
    expect(billing).toMatch(/acceptInvite/);
    expect(supa).toMatch(/fp_accept_org_invitation/);
    expect(index).toMatch(/data-action="abrir-equipe"/);
  });

  test('Edge notify usa Resend e org-invite existe', () => {
    const email = fs.readFileSync(path.join(root, 'supabase/functions/_shared/email.ts'), 'utf8');
    const invite = fs.readFileSync(path.join(root, 'supabase/functions/org-invite/index.ts'), 'utf8');
    expect(email).toMatch(/api\.resend\.com/);
    expect(email).toMatch(/RESEND_API_KEY/);
    expect(invite).toMatch(/invite-member/);
  });

  test('lifecycle banner e revogar convite estão wired', () => {
    const billing = fs.readFileSync(path.join(root, 'js/billing.js'), 'utf8');
    const init = fs.readFileSync(path.join(root, 'js/modules/init-billing.js'), 'utf8');
    const nav = fs.readFileSync(path.join(root, 'js/modules/init-navigation.js'), 'utf8');
    expect(billing).toMatch(/getLifecycleAlert/);
    expect(billing).toMatch(/revokeInvite/);
    expect(init).toMatch(/getLifecycleAlert/);
    expect(init).toMatch(/equipe-revogar/);
    expect(nav).toMatch(/billing-portal-banner/);
    expect(fs.existsSync(path.join(root, 'docs/deploy-billing-edge.md'))).toBe(true);
  });
});
