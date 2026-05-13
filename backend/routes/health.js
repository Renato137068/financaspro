// backend/routes/health.js — health check e métricas Prometheus
import { Router } from 'express';
import prisma from '../lib/db.js';
import registry from '../lib/metrics.js';
import redis from '../lib/redis.js';
import { getWorkerStatus } from '../workers/index.js';

const router = Router();

// ─── /health ─────────────────────────────────────────────────────────────────

router.get('/health', async (_req, res) => {
  const start = Date.now();
  let dbStatus = 'ok';
  let redisStatus = redis.status;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'error';
  }

  // Ping Redis se disponível
  if (redis.isAvailable) {
    try {
      await redis.client.ping();
      redisStatus = 'ok';
    } catch {
      redisStatus = 'error';
    }
  }

  const eventLoopLagMs = await measureEventLoopLag();
  const healthy = dbStatus === 'ok';

  res.status(healthy ? 200 : 503).json({
    status:         healthy ? 'ok' : 'degraded',
    timestamp:      new Date().toISOString(),
    uptime:         Math.floor(process.uptime()),
    latency:        Date.now() - start,
    eventLoopLagMs: parseFloat(eventLoopLagMs.toFixed(3)),
    db:             dbStatus,
    redis:          redisStatus,
    workers:        getWorkerStatus(),
  });
});

// ─── /metrics (formato Prometheus text) ──────────────────────────────────────

router.get('/metrics', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(registry.toPrometheus());
});

// ─── /metrics.json ────────────────────────────────────────────────────────────

router.get('/metrics.json', (_req, res) => {
  res.json(registry.toJSON());
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mede o lag do event loop agendando um setImmediate e calculando o atraso. */
function measureEventLoopLag() {
  const startNs = process.hrtime.bigint();
  return new Promise(resolve =>
    setImmediate(() =>
      resolve(Number(process.hrtime.bigint() - startNs) / 1_000_000)
    )
  );
}

export default router;
