// backend/routes/health.js — health check e métricas básicas
import { Router } from 'express';
import prisma from '../lib/db.js';

const router = Router();

router.get('/health', async (_req, res) => {
  const start = Date.now();
  let dbStatus = 'ok';

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'error';
  }

  const healthy = dbStatus === 'ok';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    latency: Date.now() - start,
    db: dbStatus,
  });
});

router.get('/metrics', (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    uptime: process.uptime(),
    memory: {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      external: mem.external,
    },
    pid: process.pid,
    nodeVersion: process.version,
  });
});

export default router;
