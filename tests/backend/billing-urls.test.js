/**
 * billing-urls.test.js — Fase 6: URLs de retorno Stripe restritas.
 */
import { assertAllowedRedirectUrl, allowedBillingOrigins } from '../../backend/lib/billing-urls.js';

const ORIGINAL_APP_URL = process.env.APP_URL;

beforeEach(() => {
  process.env.APP_URL = 'https://app.financaspro.com.br';
  delete process.env.BILLING_ALLOWED_ORIGINS;
});

afterAll(() => {
  if (ORIGINAL_APP_URL === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = ORIGINAL_APP_URL;
});

describe('allowedBillingOrigins', () => {
  test('inclui APP_URL', () => {
    expect(allowedBillingOrigins()).toContain('https://app.financaspro.com.br');
  });

  test('inclui origens extras de BILLING_ALLOWED_ORIGINS', () => {
    process.env.BILLING_ALLOWED_ORIGINS = 'https://staging.example.com,https://other.example.com';
    expect(allowedBillingOrigins()).toEqual(expect.arrayContaining([
      'https://app.financaspro.com.br',
      'https://staging.example.com',
      'https://other.example.com',
    ]));
  });
});

describe('assertAllowedRedirectUrl', () => {
  test('aceita URL na mesma origem do app', () => {
    expect(() => assertAllowedRedirectUrl('https://app.financaspro.com.br/conta?x=1')).not.toThrow();
  });

  test('rejeita domínio externo (open redirect)', () => {
    expect(() => assertAllowedRedirectUrl('https://evil.example/phish'))
      .toThrow(/não permitida/i);
  });

  test('rejeita protocolo não HTTP(S)', () => {
    expect(() => assertAllowedRedirectUrl('javascript:alert(1)'))
      .toThrow(/HTTP/i);
  });
});
