/**
 * capacitor-native-smoke.test.js — pontes nativas Android (biometria, FLAG_SECURE).
 * Smoke estático: garante wiring Capacitor sem instrumented test.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('Capacitor — plugin FLAG_SECURE', function() {
  test('FpSecureScreenPlugin expõe enable/disable', function() {
    var java = ler('android/app/src/main/java/com/financaspro/app/FpSecureScreenPlugin.java');
    expect(java).toContain('@CapacitorPlugin(name = "FpSecureScreen")');
    expect(java).toContain('FLAG_SECURE');
    expect(java).toContain('public void enable');
    expect(java).toContain('public void disable');
  });

  test('MainActivity registra FpSecureScreenPlugin', function() {
    var main = ler('android/app/src/main/java/com/financaspro/app/MainActivity.java');
    expect(main).toMatch(/FpSecureScreenPlugin/);
  });

  test('fp-secure-screen.js chama plugin nativo', function() {
    var js = ler('js/fp-secure-screen.js');
    expect(js).toMatch(/FpSecureScreen|fpSecureScreen/);
    expect(js).toContain('enable');
    expect(js).toContain('disable');
  });
});

describe('Capacitor — biometria', function() {
  test('auth-biometric expõe enable/disable e bridge Capacitor', function() {
    var bio = ler('js/auth-biometric.js');
    expect(bio).toContain('disable:');
    expect(bio).toMatch(/BiometricAuth|NativeBiometric|@capacitor/);
  });

  test('authController desativa biometria no logout', function() {
    var auth = ler('js/authController.js');
    expect(auth).toContain('AUTH_BIOMETRIC.disable');
  });

  test('index inclui hint de biometria no overlay auth', function() {
    expect(ler('index.html')).toContain('id="auth-biometric-hint"');
  });
});

describe('Capacitor — PIN early secure', function() {
  test('pin-guard aciona early secure antes do pin.js', function() {
    var guard = ler('js/pin-guard.js');
    expect(guard).toContain('__FP_PIN_EARLY_SECURE__');
    expect(guard).toContain('fp-secure-screen');
  });
});
