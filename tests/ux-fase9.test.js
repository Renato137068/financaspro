/**
 * ux-fase9.test.js — guardas estáticos da Fase 9 (UX, sync feedback, PWA).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('Fase 9 — UX e acessibilidade', () => {
  test('cadastro exige 8 caracteres e hint acessível', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    expect(html).toContain('minlength="8"');
    expect(html).toContain('auth-register-password-hint');
    expect(html).toContain('aria-describedby="auth-register-password-hint"');
    expect(html).not.toContain('Minimo de 6 caracteres');
  });

  test('password-policy compartilhado com validations', () => {
    const policy = fs.readFileSync(path.join(root, 'js/core/password-policy.js'), 'utf8');
    const val = fs.readFileSync(path.join(root, 'js/core/validations.js'), 'utf8');
    expect(policy).toContain('PASSWORD_POLICY');
    expect(val).toContain('validarSenha');
    expect(val).toContain('PASSWORD_POLICY');
  });

  test('authController valida senha antes do register', () => {
    const auth = fs.readFileSync(path.join(root, 'js/authController.js'), 'utf8');
    expect(auth).toContain('VALIDATIONS.validarSenha');
  });
});

describe('Fase 9 — feedback de sincronização', () => {
  test('store expõe saving, flushing e lastError', () => {
    const store = fs.readFileSync(path.join(root, 'js/core/store.js'), 'utf8');
    expect(store).toContain('saving: false');
    expect(store).toContain('setSaving');
    expect(store).toContain('setLastError');
    expect(store).toContain('flushing');
  });

  test('actions cobre salvando, falha e conflito', () => {
    const actions = fs.readFileSync(path.join(root, 'js/services/actions.js'), 'utf8');
    expect(actions).toContain('SYNC_SALVANDO');
    expect(actions).toContain('setLastError');
    expect(actions).not.toMatch(/SYNC_FALHAR[\s\S]*setOnline\(false\)/);
  });

  test('sync-indicator distingue estados explícitos', () => {
    const ind = fs.readFileSync(path.join(root, 'js/utilities/sync-indicator.js'), 'utf8');
    expect(ind).toContain('Salvo no servidor');
    expect(ind).toContain('Salvando');
    expect(ind).toContain('conflito');
    expect(ind).toContain('Falha ao sincronizar');
    expect(ind).toContain('sync-indicator-dismiss');
    expect(ind).toContain('fp-sync-indicator-dismissed');
  });

  test('mudarAba reseta rolagem ao trocar de aba', () => {
    const nav = fs.readFileSync(path.join(root, 'js/modules/init-navigation.js'), 'utf8');
    expect(nav).toMatch(/scrollTo\s*\(/);
    expect(nav).toContain('scrollTop = 0');
  });

  test('convite de onboarding usa role status e etapa explícita', () => {
    const onb = fs.readFileSync(path.join(root, 'js/onboarding.js'), 'utf8');
    expect(onb).toContain("role', 'status'");
    expect(onb).toContain('Etapa 1 de 2');
  });
});

describe('Fase 9 — PWA', () => {
  test('manifest é instalável', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.icons.some((i) => i.sizes === '512x512')).toBe(true);
  });

  test('sw-register oferece prompt de atualização', () => {
    const sw = fs.readFileSync(path.join(root, 'js/sw-register.js'), 'utf8');
    expect(sw).toContain('mostrarUpdatePrompt');
    expect(sw).toContain('SKIP_WAITING');
    expect(sw).toContain('controllerchange');
  });

  test('service worker não cacheia API', () => {
    const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    expect(sw).toContain("url.pathname.startsWith('/api/')");
  });
});
