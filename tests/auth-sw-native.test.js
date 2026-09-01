/**
 * auth-sw-native.test.js — SW não deve rodar no app nativo nem interceptar Supabase.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('Auth + Service Worker (app nativo)', () => {
  test('sw-register desativa SW no Capacitor nativo', () => {
    const src = fs.readFileSync(path.join(root, 'js', 'sw-register.js'), 'utf8');
    expect(src).toContain('isNativePlatform');
    expect(src).toContain('unregister');
  });

  test('sw.js não intercepta fetch cross-origin', () => {
    const src = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    expect(src).toMatch(/if\s*\(\s*!isOrigem\s*\)/);
  });

  test('SUPA_AUTH expõe ping de saúde', () => {
    const src = fs.readFileSync(path.join(root, 'js', 'core', 'supabase.js'), 'utf8');
    expect(src).toContain('ping: function');
    expect(src).toContain('/auth/v1/health');
  });
});
