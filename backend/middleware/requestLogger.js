// backend/middleware/requestLogger.js — logging de requisições HTTP com Pino
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import logger from '../lib/logger.js';

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} → ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `${req.method} ${req.url} → ${res.statusCode} — ${err.message}`,
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      ip: req.headers['x-forwarded-for'] ?? req.remoteAddress,
      ua: req.headers['user-agent'],
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  // Não loga health checks (reduz ruído em monitoramento)
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
});

/**
 * Adiciona o requestId ao header de resposta para rastreabilidade.
 */
export function addRequestId(req, res, next) {
  res.setHeader('X-Request-Id', req.id ?? randomUUID());
  next();
}
