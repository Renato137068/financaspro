/**
 * csp-connect-src.test.js — Supabase e prod sem localhost no connect-src.
 */
const { buildCspConnectSrc } = require('../scripts/csp-connect-src.cjs');

describe('buildCspConnectSrc', () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevFp = process.env.FP_CSP_PROD;

  afterEach(() => {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevFp === undefined) delete process.env.FP_CSP_PROD;
    else process.env.FP_CSP_PROD = prevFp;
  });

  test('inclui origem do Supabase configurado em config.js', () => {
    const connect = buildCspConnectSrc({ prod: true });
    expect(connect).toContain('https://nubvlksibmpryltkfpei.supabase.co');
    expect(connect).toContain('wss://nubvlksibmpryltkfpei.supabase.co');
  });

  test('produção (opts.prod) não inclui localhost', () => {
    delete process.env.NODE_ENV;
    const connect = buildCspConnectSrc({ prod: true });
    expect(connect).not.toMatch(/localhost/);
    expect(connect).not.toMatch(/127\.0\.0\.1/);
  });

  test('dev (sem prod) inclui localhost:4000', () => {
    delete process.env.NODE_ENV;
    delete process.env.FP_CSP_PROD;
    const connect = buildCspConnectSrc({ prod: false });
    expect(connect).toContain('http://localhost:4000');
  });
});
