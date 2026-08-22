// backend/workers/retention.worker.js — aplica a política de retenção (LGPD)
import { Worker } from 'bullmq';
import { purgeExpired } from '../lib/retention.js';
import { QUEUES } from '../lib/queue.js';
import logger from '../lib/logger.js';

/**
 * Roda o expurgo. Separado do Worker para poder ser testado e para poder ser
 * disparado à mão numa investigação, sem depender do agendador.
 */
export async function runRetention() {
  const inicio = Date.now();
  const resumo = await purgeExpired();
  const duracaoMs = Date.now() - inicio;

  // Falha parcial precisa ser visível: um expurgo que apagou 4 de 5 tabelas e
  // reportou "ok" deixaria dado retido além do prazo sem ninguém saber.
  if (resumo.falhas > 0) {
    logger.warn({ ...resumo, duracaoMs }, 'Expurgo concluído com falhas parciais');
  }

  return { ...resumo, duracaoMs };
}

export function startRetentionWorker(connection) {
  if (!connection) return null;

  const worker = new Worker(
    QUEUES.RETENTION,
    async () => runRetention(),
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Worker de retenção falhou');
  });

  return worker;
}
