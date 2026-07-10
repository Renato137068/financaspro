// backend/domain/services/sync-conflict.service.js
//
// Resolvedor de conflito do sync server-first (design #2, §6).
// PURO e sem dependências (nem Prisma) — para ser unit-testável sem banco.
//
// Regra única, à prova de dinheiro: Last-Writer-Wins por REGISTRO INTEIRO,
// comparando o timestamp da mutação do cliente (clientUpdatedAt) com o
// updatedAt armazenado no servidor. Nunca faz merge parcial de campos.
//
// Ações possíveis:
//   'create'          — não existe no servidor; criar (upsert)
//   'create-tombstone'— delete de algo inexistente; gravar tombstone (evita ressurreição)
//   'apply'           — mutação do cliente é mais nova; aplicar upsert (limpa tombstone)
//   'delete'          — delete mais novo; gravar deletedAt
//   'server-wins'     — servidor é igual/mais novo; devolve o registro autoritativo (status "stale")
//   'reject'          — timestamp inválido/no futuro além da margem

const DEFAULT_MAX_FUTURE_MS = 5 * 60 * 1000; // 5 min de tolerância a clock skew

function toMs(v) {
  if (v == null) return NaN;
  if (v instanceof Date) return v.getTime();
  const t = Date.parse(v);
  return Number.isNaN(t) ? NaN : t;
}

/**
 * @param {Object|null} existing  registro atual no servidor ou null
 *        { id, updatedAt, deletedAt? }
 * @param {Object} incoming  mutação do cliente
 *        { op:'upsert'|'delete', id, clientUpdatedAt, payload? }
 * @param {Object} [opts] { now?:number, maxFutureMs?:number }
 * @returns {{ action, record?, reason? }}
 */
export function resolveMutation(existing, incoming, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const maxFuture = opts.maxFutureMs != null ? opts.maxFutureMs : DEFAULT_MAX_FUTURE_MS;

  if (!incoming || (incoming.op !== 'upsert' && incoming.op !== 'delete')) {
    return { action: 'reject', reason: 'op-invalido' };
  }

  const inMs = toMs(incoming.clientUpdatedAt);
  if (Number.isNaN(inMs)) {
    return { action: 'reject', reason: 'timestamp-invalido' };
  }
  if (inMs > now + maxFuture) {
    return { action: 'reject', reason: 'timestamp-no-futuro' };
  }

  // Registro inexistente no servidor.
  if (!existing) {
    return incoming.op === 'delete'
      ? { action: 'create-tombstone' }
      : { action: 'create' };
  }

  const exMs = toMs(existing.updatedAt);
  // Se o servidor não tem updatedAt válido, trata a mutação como mais nova.
  const clienteMaisNovo = Number.isNaN(exMs) ? true : inMs > exMs;

  if (!clienteMaisNovo) {
    // Empate ou servidor mais novo → servidor vence.
    return { action: 'server-wins', record: existing };
  }

  return incoming.op === 'delete'
    ? { action: 'delete' }
    : { action: 'apply' };
}

/**
 * Aplica um lote de mutações a um mapa de registros existentes (por id),
 * devolvendo os resultados por opId. Útil para o endpoint POST /api/v1/sync.
 * @param {Map<string,Object>|Object} existingById
 * @param {Array} mutations  [{ opId, op, id, clientUpdatedAt, payload }]
 * @param {Object} [opts]
 * @returns {Array} [{ opId, id, ...resolveMutation() }]
 */
export function resolveBatch(existingById, mutations, opts = {}) {
  const get = (id) =>
    existingById instanceof Map ? existingById.get(id) : existingById[id];
  return (mutations || []).map((m) => {
    const res = resolveMutation(get(m.id) || null, m, opts);
    return Object.assign({ opId: m.opId, id: m.id }, res);
  });
}

export default { resolveMutation, resolveBatch };
