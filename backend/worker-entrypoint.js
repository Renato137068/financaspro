// backend/worker-entrypoint.js — processo standalone de workers (Docker/PM2)
import 'dotenv/config';
import prisma from './lib/db.js';
import redis from './lib/redis.js';
import { startWorkers, stopWorkers } from './workers/index.js';
import logger from './lib/logger.js';

async function main() {
  try {
    await prisma.$connect();
    logger.info('Worker: banco conectado');

    await redis.connect();
    if (!redis.isAvailable) {
      logger.fatal('Redis obrigatório para workers — encerrando');
      process.exit(1);
    }

    await startWorkers();
    logger.info('Workers em execução. Aguardando jobs...');

    const shutdown = async (signal) => {
      logger.info({ signal }, 'Worker: encerrando...');
      await stopWorkers();
      redis.disconnect();
      await prisma.$disconnect();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
  } catch (err) {
    logger.fatal({ err }, 'Worker: falha ao iniciar');
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Worker: uncaughtException');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Worker: unhandledRejection');
  process.exit(1);
});

main();
