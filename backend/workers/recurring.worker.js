// backend/workers/recurring.worker.js — processa transações recorrentes vencidas
import { Worker } from 'bullmq';
import prisma from '../lib/db.js';
import logger from '../lib/logger.js';
import { QUEUES, enqueue } from '../lib/queue.js';

// Nota: não há mapa de "dias por frequência" de propósito. Mensal, trimestral
// e anual usam mês de calendário (addMonths) — tratá-los como 30/90/365 dias
// faria a recorrência escorregar alguns dias por ano em relação à data
// contratada pelo usuário.

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Soma meses limitando o dia ao último do mês destino.
 *
 * `d.setMonth(d.getMonth() + 1)` sobre 31/01 NÃO devolve 28/02 — o Date
 * transborda para 03/03. Numa recorrência isso não é um erro pontual: a data
 * nova vira a base da próxima, e o vencimento deriva para sempre
 * (31 → 03 → 03 → 03...). Um aluguel do dia 31 passa a ser cobrado dia 3
 * depois do primeiro ciclo, sem que ninguém tenha mudado nada.
 *
 * Preserva a hora do original: `nextDue` é comparado com `lte: now`, e zerar
 * a hora anteciparia todo lançamento em algumas horas.
 */
function addMonths(date, months) {
  const d = new Date(date);
  const dia = d.getDate();

  // Vai para o dia 1 antes de mexer no mês: assim o setMonth nunca transborda.
  d.setDate(1);
  d.setMonth(d.getMonth() + months);

  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ultimoDia));
  return d;
}

/**
 * Próxima data de vencimento a partir da atual.
 *
 * Exportada para teste: a aritmética de calendário é a parte do worker onde um
 * erro passa despercebido em produção — um mês somado como 30 dias faz a
 * recorrência escorregar alguns dias por ano.
 */
export function nextDueDate(frequency, fromDate) {
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

/**
 * Processa todas as recorrências vencidas.
 *
 * Exportada para teste: rodar dentro de um Worker do BullMQ exigiria Redis, e
 * o que importa validar aqui é o comportamento — que um erro numa recorrência
 * não aborte as demais, e que o lançamento e o avanço da data aconteçam na
 * mesma transação.
 */
export async function processRecurring(_job) {
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
      let claimed = false;

      await prisma.$transaction(async (tx) => {
        const oldNextDue = rec.nextDue;
        const next = nextDueDate(rec.frequency, oldNextDue);
        const shouldDeactivate = rec.endDate && next > rec.endDate;

        // Claim atômico: só um worker/processamento avança nextDue deste período.
        const claim = await tx.recurringTransaction.updateMany({
          where: { id: rec.id, active: true, nextDue: oldNextDue },
          data: { nextDue: next, active: !shouldDeactivate },
        });
        if (claim.count === 0) return;

        claimed = true;
        await tx.transaction.create({
          data: {
            userId:      rec.userId,
            orgId:       rec.orgId,
            type:        rec.type,
            amount:      rec.amount,
            description: rec.description,
            category:    rec.category,
            date:        oldNextDue,
            accountId:   rec.accountId || null,
            recurring:   true,
          },
        });
      });

      if (!claimed) continue;

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
