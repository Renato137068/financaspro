// backend/lib/logger.js — logging estruturado com Pino
import pino from 'pino';
import CONFIG from '../config.js';

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
  redact: {
    paths: ['req.headers.authorization', 'body.password', 'body.passwordHash', 'body.refreshToken'],
    censor: '[REDACTED]',
  },
  base: { service: 'financaspro-api', env: CONFIG.env },
});

export default logger;
