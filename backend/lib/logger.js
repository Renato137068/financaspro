// backend/lib/logger.js — logging estruturado com Pino + trace context automático
import pino from 'pino';
import CONFIG from '../config.js';
import { getTraceContext } from './tracer.js';

const logger = pino({
  level: CONFIG.logging.level,
  ...(CONFIG.logging.pretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {
        formatters: {
          level: (label) => ({ level: label }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
  // Injeta automaticamente traceId/spanId em todo log emitido dentro de uma request
  mixin() {
    const ctx = getTraceContext();
    return ctx ? { traceId: ctx.traceId, spanId: ctx.spanId } : {};
  },
  redact: {
    paths: ['req.headers.authorization', 'body.password', 'body.passwordHash', 'body.refreshToken'],
    censor: '[REDACTED]',
  },
  base: { service: 'financaspro-api', env: CONFIG.env },
});

export default logger;
