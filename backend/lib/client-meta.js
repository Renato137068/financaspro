// backend/lib/client-meta.js — metadados de origem para auditoria
/** Extrai IP, user-agent e correlation ID (trace) de uma requisição Express. */
export function clientMetaFromRequest(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : (req.ip ?? null);

  return {
    ipAddress: ip,
    userAgent: req.headers['user-agent'] ?? null,
    correlationId: req.traceId ?? req.headers['x-trace-id'] ?? null,
  };
}
