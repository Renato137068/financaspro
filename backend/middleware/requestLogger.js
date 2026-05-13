// backend/middleware/requestLogger.js — logging HTTP, tracing e coleta de métricas
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import logger from '../lib/logger.js';
import { runWithTraceContext } from '../lib/tracer.js';
import { httpRequestsTotal, httpRequestDurationMs, normalizeRoute } from '../lib/metrics.js';

// ─── pino-http ────────────────────────────────────────────────────────────────

export const requestLogger = pinoHttp({
  logger,
  // Reutiliza o traceId já atribuído por addTraceContext
  genReqId: (req) => req.traceId ?? req.headers['x-trace-id'] ?? randomUUID(),
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} → ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `${req.method} ${req.url} → ${res.statusCode} — ${err.message}`,
  serializers: {
    req: (req) => ({
      id:     req.id,
      method: req.method,
      url:    req.url,
      route:  normalizeRoute(req.url),
      ip:     req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.remoteAddress,
      ua:     req.headers['user-agent'],
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  // Suprime logs de health check para reduzir ruído
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
});

// ─── Trace context ────────────────────────────────────────────────────────────

/**
 * Cria contexto de trace por request:
 *  - Aceita X-Trace-Id do cliente ou gera um novo UUID.
 *  - Propaga via AsyncLocalStorage → todo log emitido dentro da request
 *    inclui automaticamente traceId e spanId (ver logger.js mixin).
 *  - Registra métricas HTTP (contador + histograma) ao fim da response.
 *  - Emite X-Trace-Id no header de resposta para rastreabilidade E2E.
 */
export function addTraceContext(req, res, next) {
  const traceId = req.headers['x-trace-id'] || randomUUID();
  const spanId  = randomUUID().slice(0, 8);
  const startNs = process.hrtime.bigint();

  req.traceId = traceId;
  req.spanId  = spanId;

  res.setHeader('X-Trace-Id',   traceId);
  res.setHeader('X-Request-Id', traceId); // backward compat

  runWithTraceContext({ traceId, spanId, startNs }, () => {
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
      const route      = normalizeRoute(req.path);

      httpRequestsTotal.inc({
        method: req.method,
        route,
        status: String(res.statusCode),
      });
      httpRequestDurationMs.observe({ method: req.method, route }, durationMs);
    });

    next();
  });
}
