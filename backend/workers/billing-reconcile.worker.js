// backend/workers/billing-reconcile.worker.js — reconciliação periódica Stripe ↔ banco
import { Worker } from 'bullmq';
import { BillingService } from '../domain/services/billing.service.js';
import { PlayBillingService } from '../domain/services/play-billing.service.js';
import { QUEUES } from '../lib/queue.js';
import logger from '../lib/logger.js';

export async function runBillingReconcile() {
  const inicio = Date.now();
  const stripe = await BillingService.reconcileAll();
  const play = await PlayBillingService.reconcileExpiries();
  return { ...stripe, play, duracaoMs: Date.now() - inicio };
}

export function startBillingReconcileWorker(connection) {
  if (!connection) return null;

  const worker = new Worker(
    QUEUES.BILLING,
    async () => runBillingReconcile(),
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Worker de reconciliação billing falhou');
  });

  return worker;
}
