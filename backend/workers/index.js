// backend/workers/index.js — registry de workers + agendamento de crons
import redis from '../lib/redis.js';
import { QUEUES, scheduleRecurring } from '../lib/queue.js';
import { startRecurringWorker } from './recurring.worker.js';
import { startEmailWorker } from './email.worker.js';
import logger from '../lib/logger.js';

const activeWorkers = [];

export async function startWorkers() {
  if (!redis.isAvailable) {
    logger.info('Redis indisponível — workers desativados');
    return;
  }

  const connection = redis.client;

  const recurringWorker = startRecurringWorker(connection);
  const emailWorker     = startEmailWorker(connection);

  if (recurringWorker) activeWorkers.push(recurringWorker);
  if (emailWorker)     activeWorkers.push(emailWorker);

  // Cron: processa recorrentes todo dia à meia-noite
  await scheduleRecurring(
    QUEUES.RECURRING,
    'daily-run',
    '0 0 * * *',
    {}
  );

  logger.info({ count: activeWorkers.length }, 'Workers iniciados');
}

export async function stopWorkers() {
  const closers = activeWorkers.map(w => w.close());
  await Promise.allSettled(closers);
  activeWorkers.length = 0;
  logger.info('Workers encerrados');
}

export function getWorkerStatus() {
  return activeWorkers.map(w => ({
    name:    w.name,
    running: w.isRunning(),
    paused:  w.isPaused(),
  }));
}
