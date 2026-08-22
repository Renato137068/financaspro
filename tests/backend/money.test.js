/**
 * money.test.js — backend lib/money.js
 */
import { assertValidAmount, fromCents, MAX_AMOUNT, toCents } from '../../backend/lib/money.js';

describe('backend/lib/money', () => {
  test('toCents / fromCents são inversos para 2 casas', () => {
    expect(fromCents(toCents(1234.56))).toBe(1234.56);
  });

  test('assertValidAmount rejeita NaN e Infinity', () => {
    expect(() => assertValidAmount(NaN)).toThrow(/inválido/i);
    expect(() => assertValidAmount(Infinity)).toThrow(/inválido/i);
  });

  test('assertValidAmount rejeita zero e negativo por padrão', () => {
    expect(() => assertValidAmount(0)).toThrow(/limite/i);
    expect(() => assertValidAmount(-1)).toThrow(/limite/i);
  });

  test('assertValidAmount aceita valor positivo dentro do limite', () => {
    expect(assertValidAmount(99.99)).toBe(99.99);
    expect(assertValidAmount(MAX_AMOUNT)).toBe(MAX_AMOUNT);
  });

  test('assertValidAmount rejeita acima do teto', () => {
    expect(() => assertValidAmount(MAX_AMOUNT + 0.01)).toThrow(/limite/i);
  });
});
