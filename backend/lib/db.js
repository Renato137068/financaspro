// backend/lib/db.js — singleton do Prisma Client
import { PrismaClient } from '@prisma/client';
import logger from './logger.js';

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

prisma.$on('error', (e) => logger.error({ err: e }, 'Prisma error'));
prisma.$on('warn', (e) => logger.warn({ msg: e.message }, 'Prisma warning'));

// Log slow queries (>500ms) em desenvolvimento
if (process.env.NODE_ENV !== 'production') {
  prisma.$on('query', (e) => {
    if (e.duration > 500) logger.warn({ query: e.query, duration: e.duration }, 'Slow query');
  });
}

export default prisma;
