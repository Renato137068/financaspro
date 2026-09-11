/**
 * money.js — validação e normalização monetária no backend (centavos / limites).
 */

/** Espelha Decimal(15,2) do Prisma. */
export const MAX_AMOUNT = 999_999_999_999.99;
export const MIN_POSITIVE = 0.01;

export function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return NaN;
  return Math.round(amount * 100);
}

export function fromCents(cents) {
  if (!Number.isFinite(cents)) return NaN;
  return cents / 100;
}

/**
 * Valida valor de API e devolve número com 2 casas decimais.
 * @throws {Error} se inválido ou fora do limite
 */
export function assertValidAmount(amount, { allowZero = false } = {}) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    const err = new Error('Valor inválido');
    err.code = 'INVALID_AMOUNT';
    throw err;
  }
  const min = allowZero ? 0 : MIN_POSITIVE;
  if (amount < min || amount > MAX_AMOUNT) {
    const err = new Error('Valor fora do limite permitido');
    err.code = 'AMOUNT_OUT_OF_RANGE';
    throw err;
  }
  return fromCents(toCents(amount));
}

export function sumCents(values) {
  return (values || []).reduce((acc, v) => {
    const c = toCents(v);
    return acc + (Number.isFinite(c) ? c : 0);
  }, 0);
}
