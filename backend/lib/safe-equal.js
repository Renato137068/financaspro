// backend/lib/safe-equal.js — comparação de segredos em tempo constante
import { createHash, timingSafeEqual } from 'crypto';

/**
 * Compara um valor recebido com um segredo sem vazar, pelo tempo de resposta,
 * quantos caracteres iniciais conferem. `!==` para no primeiro byte diferente
 * — medindo isso, um atacante adivinha o segredo caractere a caractere.
 *
 * Os dois lados passam por SHA-256 antes do `timingSafeEqual`: assim os
 * buffers têm sempre o mesmo tamanho e nem o comprimento do segredo vaza.
 */
export function safeEqual(provided, secret) {
  if (typeof provided !== 'string' || typeof secret !== 'string' || !secret) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

export default safeEqual;
