// backend/server.js — servidor Express enterprise (Fase 5+)
import logger from './lib/logger.js';
import prisma from './lib/db.js';
import redis from './lib/redis.js';
import { closeAllQueues } from './lib/queue.js';
import { startWorkers, stopWorkers } from './workers/index.js';
import { appErrorsTotal, activeConnections } from './lib/metrics.js';
import CONFIG from './config.js';
import { createApp } from './app.js';

const app = createApp();

async function start() {
  try {
    await prisma.$connect();
    logger.info('Conexão com banco de dados estabelecida');

    await redis.connect();
    if (CONFIG.isProd && CONFIG.requireRedis && !redis.isAvailable) {
      throw new Error('REDIS_URL obrigatório em produção (REQUIRE_REDIS=1)');
    }
    if (CONFIG.isProd && !redis.isAvailable) {
      logger.warn('Redis indisponível em produção — rate limit usará memória local');
    }
    await startWorkers();

    const server = app.listen(CONFIG.port, () => {
      logger.info({ port: CONFIG.port, env: CONFIG.env }, 'FinançasPro API iniciada');
    });

    server.on('connection', () => activeConnections.inc());
    server.on('close',      () => activeConnections.dec());

    const shutdown = async (signal) => {
      logger.info({ signal }, 'Encerrando servidor...');
      server.close(async () => {
        await stopWorkers();
        await closeAllQueues();
        redis.disconnect();
        await prisma.$disconnect();
        logger.info('Servidor encerrado com sucesso');
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
  } catch (err) {
    logger.fatal({ err }, 'Falha ao iniciar servidor');
    await prisma.$disconnect();
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  appErrorsTotal.inc({ type: 'uncaught_exception' });
  logger.fatal({ err }, 'uncaughtException — encerrando processo');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  appErrorsTotal.inc({ type: 'unhandled_rejection' });
  logger.fatal({ err: reason }, 'unhandledRejection — encerrando processo');
  process.exit(1);
});

start();
