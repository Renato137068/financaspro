// backend/workers/recurring.worker.js — processa transações recorrentes vencidas
import { Worker } from 'bullmq';
import prisma from '../lib/db.js';
import logger from '../lib/logger.js';
import { QUEUES, enqueue } from '../lib/queue.js';

const FREQUENCY_DAYS = {
  daily:     1,
  weekly:    7,
  biweekly:  14,
  monthly:   30,
  quarterly: 90,
  yearly:    365,
};

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function nextDueDate(frequency, fromDate) {
  switch (frequency) {
    case 'daily':     return addDays(fromDate, 1);
    case 'weekly':    return addDays(fromDate, 7);
    case 'biweekly':  return addDays(fromDate, 14);
    case 'monthly':   return addMonths(fromDate, 1);
    case 'quarterly': return addMonths(fromDate, 3);
    case 'yearly':    return addMonths(fromDate, 12);
    default:          return addDays(fromDate, 30);
  }
}

async function processRecurring(_job) {
  const now = new Date();

  // Busca todas as recorrentes ativas com nextDue <= agora
  const due = await prisma.recurringTransaction.findMany({
    where: { active: true, nextDue: { lte: now } },
  });

  if (due.length === 0) {
    logger.info('Nenhuma transação recorrente vencida');
    return { processed: 0 };
  }

  let processed = 0;
  let errors = 0;

  for (const rec of due) {
    try {
      await prisma.$transaction(async (tx) => {
        // Cria a transação efetiva
        await tx.transaction.create({
          data: {
            userId:      rec.userId,
            orgId:       rec.orgId,
            type:        rec.type,
            amount:      rec.amount,
            description: rec.description,
            category:    rec.category,
            date:        rec.nextDue,
            recurring:   true,
          },
        });

        // Avança a próxima data de vencimento
        const next = nextDueDate(rec.frequency, rec.nextDue);
        const shouldDeactivate = rec.endDate && next > rec.endDate;

        await tx.recurringTransaction.update({
          where: { id: rec.id },
          data: {
            nextDue: next,
            active:  !shouldDeactivate,
          },
        });
      });

      processed++;

      // Notifica o usuário por e-mail (async)
      await enqueue(QUEUES.EMAIL, 'recurring-processed', {
        userId:      rec.userId,
        description: rec.description,
        amount:      rec.amount.toString(),
        type:        rec.type,
        date:        rec.nextDue,
      });
    } catch (err) {
      errors++;
      logger.error({ err, recurringId: rec.id }, 'Erro ao processar recorrente');
    }
  }

  logger.info({ processed, errors, total: due.length }, 'Recorrentes processadas');
  return { processed, errors };
}

export function startRecurringWorker(connection) {
  if (!connection) return null;

  const worker = new Worker(QUEUES.RECURRING, processRecurring, {
    connection,
    concurrency: 5,
  });

  worker.on('completed', (job, result) =>
    logger.info({ jobId: job.id, result }, 'Recorrentes: job concluído')
  );

  worker.on('failed', (job, err) =>
    logger.error({ jobId: job?.id, err }, 'Recorrentes: job falhou')
  );

  logger.info('Worker recurring-processor iniciado');
  return worker;
}
