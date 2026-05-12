// backend/lib/queue.js — BullMQ factory de filas e helpers
import { Queue, QueueEvents } from 'bullmq';
import redis from './redis.js';
import logger from './logger.js';

const queues = new Map();

/** Opções padrão de conexão compartilhadas entre filas e workers. */
export function getConnection() {
  if (!redis.isAvailable) return null;
  return redis.client;
}

/** Nomes de filas disponíveis */
export const QUEUES = {
  RECURRING:  'recurring-processor',
  EMAIL:      'email',
  REPORT:     'report-generator',
  AI_ANALYSIS:'ai-analysis',
};

/**
 * Retorna (ou cria) uma instância de Queue para o nome dado.
 * Retorna null se Redis não estiver disponível.
 */
export function getQueue(name) {
  if (!redis.isAvailable) {
    logger.debug({ queue: name }, 'Redis indisponível — Queue desativada');
    return null;
  }

  if (queues.has(name)) return queues.get(name);

  const queue = new Queue(name, {
    connection: redis.client,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });

  queue.on('error', (err) => logger.error({ err, queue: name }, 'Erro na fila'));

  queues.set(name, queue);
  return queue;
}

/**
 * Enfileira um job com dados e opções.
 * Falha silenciosamente se Redis indisponível.
 */
export async function enqueue(queueName, jobName, data, opts = {}) {
  const queue = getQueue(queueName);
  if (!queue) return null;

  try {
    const job = await queue.add(jobName, data, opts);
    logger.debug({ queue: queueName, jobName, jobId: job.id }, 'Job enfileirado');
    return job;
  } catch (err) {
    logger.error({ err, queue: queueName, jobName }, 'Falha ao enfileirar job');
    return null;
  }
}

/** Fecha todas as filas abertas (chamado no shutdown). */
export async function closeAllQueues() {
  const promises = [...queues.values()].map(q => q.close());
  await Promise.allSettled(promises);
  queues.clear();
}

/** Agenda um job recorrente via cron (BullMQ repeat). */
export async function scheduleRecurring(queueName, jobName, cronPattern, data = {}) {
  const queue = getQueue(queueName);
  if (!queue) return null;

  return queue.add(jobName, data, {
    repeat: { pattern: cronPattern },
    jobId: `cron:${queueName}:${jobName}`,
  });
}
