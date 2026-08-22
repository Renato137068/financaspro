// backend/lib/retention.js — política de retenção de dados (LGPD art. 15 e 16)
import prisma from './db.js';
import logger from './logger.js';

/**
 * Por quanto tempo cada tabela guarda dado, e por quê.
 *
 * Antes desta política o sistema não apagava nada por prazo: sessões expiradas,
 * tokens usados, convites vencidos e logs de auditoria ficavam para sempre. A
 * LGPD (art. 15, IV e art. 16) exige eliminação quando a finalidade se encerra
 * — "ninguém pediu para apagar" não é base legal para guardar indefinidamente.
 *
 * A regra prática: quanto mais o registro identifica alguém, mais curto o
 * prazo. Uma sessão expirada não serve para nada e some rápido; um log de
 * auditoria precisa durar mais porque é a prova de que as coisas aconteceram.
 *
 * `dias` conta a partir de `campo`. Prazos vêm de env para permitir ajuste por
 * exigência contratual sem alterar código.
 */
function env(nome, padrao) {
  const v = Number(process.env[nome]);
  return Number.isFinite(v) && v > 0 ? v : padrao;
}

export const RETENTION_POLICY = [
  {
    modelo: 'session',
    campo: 'expiresAt',
    dias: env('RETENTION_SESSION_DAYS', 30),
    motivo: 'Sessão expirada não autentica mais ninguém; guardá-la só preserva '
      + 'o vínculo entre um dispositivo e uma pessoa.',
  },
  {
    modelo: 'verificationToken',
    campo: 'expiresAt',
    dias: env('RETENTION_TOKEN_DAYS', 7),
    motivo: 'Token de verificação vencido é lixo criptográfico. A janela de 7 '
      + 'dias existe só para investigar tentativa de uso indevido.',
  },
  {
    modelo: 'invitation',
    campo: 'expiresAt',
    dias: env('RETENTION_INVITATION_DAYS', 30),
    motivo: 'Convite vencido guarda o e-mail de alguém que talvez nunca tenha '
      + 'virado usuário — a pessoa com menos motivo para ter dado seu retido.',
  },
  {
    modelo: 'jobLog',
    campo: 'createdAt',
    dias: env('RETENTION_JOBLOG_DAYS', 90),
    motivo: 'Diagnóstico operacional. Depois de um trimestre não se investiga '
      + 'mais um job isolado; o que importa virou métrica agregada.',
  },
  {
    modelo: 'auditLog',
    campo: 'createdAt',
    dias: env('RETENTION_AUDIT_DAYS', 365),
    motivo: 'Prazo mais longo porque é a prova de quem fez o quê — inclusive a '
      + 'prova de que uma exclusão foi atendida. Um ano cobre o ciclo de '
      + 'contestação típico.',
  },
  {
    modelo: 'syncOp',
    campo: 'processedAt',
    dias: env('RETENTION_SYNCOP_DAYS', 90),
    motivo: 'Registro de idempotência do sync v2. Após reconciliação, só serve '
      + 'para deduplicar retries — não é dado financeiro do usuário.',
  },
  {
    modelo: 'stripeWebhookEvent',
    campo: 'processedAt',
    dias: env('RETENTION_STRIPE_EVENT_DAYS', 90),
    motivo: 'Ledger de idempotência de webhooks Stripe. Após processamento, '
      + 'só impede reprocessamento duplicado.',
  },
];

/**
 * Tabelas que NÃO têm prazo, com a justificativa. Existe para forçar decisão
 * explícita: o teste de política falha se um modelo do schema não estiver nem
 * na política acima nem nesta lista.
 */
export const RETENTION_EXEMPT = {
  user: 'Conta ativa. Some por pedido do titular (deleteAccount).',
  userConfig: 'Preferências da conta ativa; cascade na exclusão.',
  transaction: 'Conteúdo do usuário. Ele decide quando apagar.',
  account: 'Conteúdo do usuário.',
  budget: 'Conteúdo do usuário.',
  recurringTransaction: 'Conteúdo do usuário.',
  openFinanceConnection: 'Vínculo bancário ativo; revogado pelo usuário.',
  organization: 'Entidade ativa.',
  organizationMember: 'Vínculo ativo; cascade na saída.',
  plan: 'Catálogo, não é dado pessoal.',
  subscription: 'Registro fiscal — prazo definido por obrigação contábil, não por esta política.',
  invoice: 'Registro fiscal — idem.',
  usageRecord: 'Base de faturamento; segue o prazo fiscal da Invoice.',
};

/**
 * Apaga o que passou do prazo. Idempotente: rodar duas vezes no mesmo dia não
 * causa dano, porque o critério é a data e não uma marcação de processado.
 *
 * `client` é injetável para teste — a alternativa seria mockar o módulo do
 * Prisma inteiro, o que testaria o mock em vez desta função.
 */
export async function purgeExpired(client = prisma, agora = new Date()) {
  const resultados = [];

  for (const regra of RETENTION_POLICY) {
    const corte = new Date(agora.getTime() - regra.dias * 86400000);
    const delegate = client[regra.modelo];

    if (!delegate || typeof delegate.deleteMany !== 'function') {
      // Modelo renomeado no schema e não atualizado aqui. Falhar silenciosamente
      // faria a política parecer aplicada enquanto o dado se acumula.
      logger.error({ modelo: regra.modelo }, 'Retenção: modelo inexistente no client Prisma');
      resultados.push({ modelo: regra.modelo, erro: 'modelo inexistente', removidos: 0 });
      continue;
    }

    try {
      const { count } = await delegate.deleteMany({
        where: { [regra.campo]: { lt: corte } },
      });
      resultados.push({ modelo: regra.modelo, removidos: count, corte });
      if (count > 0) {
        logger.info({ modelo: regra.modelo, removidos: count, dias: regra.dias }, 'Retenção aplicada');
      }
    } catch (err) {
      // Um modelo que falha não pode impedir os outros de serem expurgados.
      logger.error({ modelo: regra.modelo, err: err.message }, 'Retenção falhou');
      resultados.push({ modelo: regra.modelo, erro: err.message, removidos: 0 });
    }
  }

  const total = resultados.reduce((a, r) => a + r.removidos, 0);
  const falhas = resultados.filter(r => r.erro).length;
  logger.info({ total, falhas }, 'Expurgo de retenção concluído');

  return { total, falhas, resultados };
}
