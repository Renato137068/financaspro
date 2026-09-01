/**
 * csp-connect-src.test.js — Supabase deve estar no connect-src do build.
 */
const { buildCspConnectSrc } = require('../scripts/csp-connect-src.cjs');

describe('buildCspConnectSrc', () => {
  test('inclui origem do Supabase configurado em config.js', () => {
    const connect = buildCspConnectSrc();
    expect(connect).toContain('https://nubvlksibmpryltkfpei.supabase.co');
    expect(connect).toContain('wss://nubvlksibmpryltkfpei.supabase.co');
  });
});
