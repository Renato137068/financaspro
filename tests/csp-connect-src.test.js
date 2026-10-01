/**
 * csp-connect-src.test.js — connect-src só com o app e o Supabase.
 */
const { buildCspConnectSrc } = require('../scripts/csp-connect-src.cjs');

describe('buildCspConnectSrc', () => {
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  test('inclui origem do Supabase configurado em config.js', () => {
    const connect = buildCspConnectSrc();
    expect(connect).toContain('https://nubvlksibmpryltkfpei.supabase.co');
    expect(connect).toContain('wss://nubvlksibmpryltkfpei.supabase.co');
  });

  test('sem localhost (a API Express local saiu) nem Belvo (Open Finance saiu), em qualquer ambiente', () => {
    ['production', 'development', undefined].forEach((env) => {
      if (env === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = env;
      const connect = buildCspConnectSrc();
      expect(connect).not.toMatch(/localhost|127\.0\.0\.1|belvo/);
    });
  });
});
