/**
 * auth-fase3.test.js — guardas estáticos Fase 2/3 da auditoria auth (Supabase).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('Auth Fase 3 — Supabase e recovery', () => {
  test('supabase expõe recovery, updatePassword e reauth', () => {
    const supa = fs.readFileSync(path.join(root, 'js/core/supabase.js'), 'utf8');
    expect(supa).toContain('consumeAuthCallback');
    expect(supa).toContain('updatePassword');
    expect(supa).toContain('reauthWithPassword');
    expect(supa).toContain('isRecoveryPending');
    expect(supa).toContain('PASSWORD_RECOVERY');
    expect(supa).toContain('_authRedirectUrl');
    expect(supa).toContain('app.financaspro.com');
  });

  test('authController trata reset de senha e valida e-mail', () => {
    const auth = fs.readFileSync(path.join(root, 'js/authController.js'), 'utf8');
    expect(auth).toContain('_authValidarEmail');
    expect(auth).toContain('auth-reset-password-form');
    expect(auth).toContain('_mostrarResetSenha');
    expect(auth).toContain('fp-auth-recovery');
    expect(auth).toContain('Por segurança, confirme sua identidade');
    expect(auth).toContain('showTotpStep');
    expect(auth).toContain('_authGateMfaThenSuccess');
  });

  test('index inclui formulário de nova senha', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    expect(html).toContain('id="auth-reset-password-form"');
    expect(html).toContain('id="auth-reset-password"');
  });

  test('AndroidManifest declara deep link app.financaspro.com', () => {
    const manifest = fs.readFileSync(
      path.join(root, 'android/app/src/main/AndroidManifest.xml'),
      'utf8',
    );
    expect(manifest).toContain('android:autoVerify="true"');
    expect(manifest).toContain('android:host="app.financaspro.com"');
    expect(manifest).toContain('android:scheme="https"');
  });

  test('2FA no Perfil usa MFA Supabase quando ativo', () => {
    const tfa = fs.readFileSync(path.join(root, 'js/modules/init-2fa.js'), 'utf8');
    expect(tfa).toContain('_isSupabaseMode');
    expect(tfa).toContain('mfaEnrollStart');
    expect(tfa).toContain('mfaUnenroll');
    expect(tfa).toContain('mfaRecoveryGenerate');
    expect(tfa).toContain('card.hidden = false');
  });

  test('exclusão Supabase exige reautenticação com senha', () => {
    const nav = fs.readFileSync(path.join(root, 'js/modules/init-navigation.js'), 'utf8');
    expect(nav).toContain('reauthWithPassword');
    expect(nav).toMatch(/Digite sua senha para confirmar a exclusão/);
  });

  test('supabase expõe MFA TOTP (enroll/verify/gate)', () => {
    const supa = fs.readFileSync(path.join(root, 'js/core/supabase.js'), 'utf8');
    expect(supa).toContain('_mfaGateAfterPassword');
    expect(supa).toContain('verifyMfa');
    expect(supa).toContain('mfaEnrollStart');
    expect(supa).toContain('challengeAndVerify');
    expect(supa).toContain('DADOS.verifyTotpLoginApi');
  });
});

describe('Auth Fase 3 — biometria após logout', () => {
  test('authLimparAoSair desativa biometria', () => {
    const auth = fs.readFileSync(path.join(root, 'js/authController.js'), 'utf8');
    const bio = fs.readFileSync(path.join(root, 'js/auth-biometric.js'), 'utf8');
    expect(auth).toContain('AUTH_BIOMETRIC.disable');
    expect(bio).toContain('disable:');
  });
});
