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

  test('sw.js não cacheia respostas do Supabase (H1: dado financeiro at-rest)', () => {
    const src = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    // Existe uma allowlist explícita de origens cross-origin cacheáveis...
    expect(src).toMatch(/CACHEABLE_CROSS_ORIGIN\s*=\s*new Set\(/);
    // ...e ela NÃO contém a origem do Supabase (só asset estático de CDN).
    const allowlist = src.match(/CACHEABLE_CROSS_ORIGIN\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
    expect(allowlist).not.toBeNull();
    expect(allowlist[1]).not.toMatch(/supabase/i);
    // Cross-origin fora da allowlist é network-only (não toca no cache).
    expect(src).toMatch(/!isOrigem\s*&&\s*!crossOriginCacheavel/);
  });

  test('SUPA_AUTH expõe ping de saúde', () => {
    const src = fs.readFileSync(path.join(root, 'js', 'core', 'supabase.js'), 'utf8');
    expect(src).toContain('ping: function');
    expect(src).toContain('/auth/v1/health');
  });
});
