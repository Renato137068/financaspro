/**
 * play-store-fase2.test.js — guardas da auditoria Play Store (Fases 2–3).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('Play Store Fase 2 — PIN honesto', () => {
  test('Perfil explica que PIN oculta, não criptografa', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    expect(html).toContain('perfil-pin-toggle-status');
    expect(html).toMatch(/Oculta saldos.*não criptografa/i);
  });

  test('Modal de criar PIN repete limitação', () => {
    const pin = fs.readFileSync(path.join(root, 'js/pin.js'), 'utf8');
    expect(pin).toMatch(/Não criptografa dados/i);
  });

  test('init-config atualiza subtítulo do toggle PIN', () => {
    const cfg = fs.readFileSync(path.join(root, 'js/modules/init-config.js'), 'utf8');
    expect(cfg).toContain('perfil-pin-toggle-status');
    expect(cfg).toContain('oculta saldos');
  });
});

describe('Play Store Fase 2 — FLAG_SECURE', () => {
  test('Plugin Android registrado', () => {
    const main = fs.readFileSync(
      path.join(root, 'android/app/src/main/java/com/financaspro/app/MainActivity.java'),
      'utf8',
    );
    expect(main).toContain('FpSecureScreenPlugin');
    const plugin = fs.readFileSync(
      path.join(root, 'android/app/src/main/java/com/financaspro/app/FpSecureScreenPlugin.java'),
      'utf8',
    );
    expect(plugin).toContain('FLAG_SECURE');
  });

  test('JS bridge com retain/release', () => {
    const js = fs.readFileSync(path.join(root, 'js/fp-secure-screen.js'), 'utf8');
    expect(js).toContain('FpSecureScreen');
    expect(js).toContain('retain');
    expect(js).toContain('release');
    expect(js).toContain('__FP_PIN_EARLY_SECURE__');
    expect(fs.readFileSync(path.join(root, 'js/authController.js'), 'utf8'))
      .toContain('FP_SECURE_SCREEN.retain');
    expect(fs.readFileSync(path.join(root, 'js/pin.js'), 'utf8'))
      .toContain('FP_SECURE_SCREEN.retain');
    expect(fs.readFileSync(path.join(root, 'js/pin-guard.js'), 'utf8'))
      .toContain('__FP_PIN_EARLY_SECURE__');
  });
});

describe('Play Store Fase 3 — sync e App Links', () => {
  test('sync-indicator usa isCloudUser', () => {
    const ind = fs.readFileSync(path.join(root, 'js/utilities/sync-indicator.js'), 'utf8');
    expect(ind).toContain('BILLING.isCloudUser');
    expect(ind).toContain('nuvemConectada');
    expect(ind).not.toMatch(/não pede\s+cadastro/i);
  });

  test('assetlinks.json e cópia para dist', () => {
    const links = JSON.parse(
      fs.readFileSync(path.join(root, '.well-known/assetlinks.json'), 'utf8'),
    );
    expect(links[0].target.package_name).toBe('com.financaspro.mobile');
    const copy = fs.readFileSync(path.join(root, 'scripts/copy-static.cjs'), 'utf8');
    expect(copy).toContain('.well-known');
  });

  test('script SHA-256 para assetlinks', () => {
    expect(fs.existsSync(path.join(root, 'scripts/print-android-sha256.cjs'))).toBe(true);
  });
});
