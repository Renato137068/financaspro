// backend/middleware/plan.js — enforcement de limites de plano SaaS
import prisma from '../lib/db.js';
import { AppError } from '../domain/errors.js';

const PLAN_LIMITS = {
  FREE: {
    maxUsers:        1,
    maxTransPerMonth: 100,
    maxAccounts:     3,
    maxBudgets:      5,
    aiFeatures:      false,
    teamFeatures:    false,
    reportExport:    false,
    advancedAlerts:  false,
  },
  PRO: {
    maxUsers:        5,
    maxTransPerMonth: Infinity,
    maxAccounts:     20,
    maxBudgets:      Infinity,
    aiFeatures:      true,
    teamFeatures:    true,
    reportExport:    true,
    advancedAlerts:  true,
  },
  BUSINESS: {
    maxUsers:        Infinity,
    maxTransPerMonth: Infinity,
    maxAccounts:     Infinity,
    maxBudgets:      Infinity,
    aiFeatures:      true,
    teamFeatures:    true,
    reportExport:    true,
    advancedAlerts:  true,
  },
};

const TIER_ORDER = { FREE: 0, PRO: 1, BUSINESS: 2 };

/** Busca o tier do plano ativo do usuário (via org pessoal ou individual). */
async function getUserPlanTier(userId) {
  // Verifica se usuário tem org com subscription ativa
  const membership = await prisma.organizationMember.findFirst({
    where: { userId, org: { active: true } },
    include: {
      org: {
        include: { subscription: { include: { plan: true } } },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  if (membership?.org?.subscription?.plan) {
    const { status, plan } = membership.org.subscription;
    if (['ACTIVE', 'TRIALING'].includes(status)) return plan.tier;
  }

  return 'FREE';
}

/**
 * Garante que o usuário tem pelo menos o tier informado.
 * Uso: router.post('/report', requirePlan('PRO'), handler)
 */
export function requirePlan(minTier) {
  return async (req, res, next) => {
    try {
      const tier = await getUserPlanTier(req.user.id);
      if (TIER_ORDER[tier] < TIER_ORDER[minTier]) {
        throw new AppError(`Recurso disponível apenas no plano ${minTier} ou superior`, 402);
      }
      req.planTier = tier;
      req.planLimits = PLAN_LIMITS[tier];
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Injeta req.planTier e req.planLimits sem bloquear.
 * Use em rotas que precisam saber o plano mas não exigem upgrade.
 */
export function injectPlan() {
  return async (req, res, next) => {
    try {
      const tier = await getUserPlanTier(req.user.id);
      req.planTier   = tier;
      req.planLimits = PLAN_LIMITS[tier];
      next();
    } catch {
      req.planTier   = 'FREE';
      req.planLimits = PLAN_LIMITS.FREE;
      next();
    }
  };
}

/** Primeiro instante do mês corrente, em hora local do servidor. */
function inicioDoMes() {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Verifica se o usuário atingiu o limite de transações do mês corrente.
 * Lança 402 se ultrapassado no plano FREE.
 *
 * Conta por `createdAt`, não por `date`. `date` é a data que o USUÁRIO digita:
 * contar por ela deixava o limite do plano FREE ser burlado sem esforço nenhum
 * — bastava lançar tudo com data do mês passado e o teto de 100 nunca era
 * alcançado. O que o limite comercial quer medir é quantos lançamentos foram
 * feitos neste mês, e isso é `createdAt`.
 *
 * Tombstones (`deletedAt`) saem da conta: um lançamento apagado não ocupa
 * cota, senão criar e apagar consumiria o mês do usuário.
 *
 * LIMITAÇÃO CONHECIDA — a checagem é otimista. Entre este `count` e o INSERT
 * do handler há uma janela em que N requisições simultâneas passam todas, e o
 * usuário fecha o mês com 100+N lançamentos. Tornar isso atômico exige mover a
 * contagem para dentro da transação de criação, o que atravessa três camadas
 * (rota → serviço → repositório) no caminho mais sensível do sistema. Como o
 * excedente é da ordem de unidades e o efeito é comercial, não financeiro, a
 * troca não compensa hoje. O que compensava era parar de contar por `date` —
 * isso era bypass total, não margem.
 */
export async function checkTransactionLimit(req, _res, next) {
  try {
    const tier = req.planTier || await getUserPlanTier(req.user.id);
    const limits = PLAN_LIMITS[tier];

    if (limits.maxTransPerMonth === Infinity) return next();

    const count = await prisma.transaction.count({
      where: { userId: req.user.id, createdAt: { gte: inicioDoMes() }, deletedAt: null },
    });

    if (count >= limits.maxTransPerMonth) {
      throw new AppError(
        `Limite de ${limits.maxTransPerMonth} transações/mês atingido. Faça upgrade para continuar.`,
        402
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}

/** Busca limites numéricos do tier (0 no seed = ilimitado). */
export function limitsForTier(tier) {
  const base = PLAN_LIMITS[tier] || PLAN_LIMITS.FREE;
  return base;
}

/** Tier do plano ativo da organização. */
export async function getOrgPlanTier(orgId) {
  const sub = await prisma.subscription.findUnique({
    where: { orgId },
  });
  if (!sub || !['ACTIVE', 'TRIALING'].includes(sub.status)) return 'FREE';

  const plan = await prisma.plan.findUnique({ where: { id: sub.planId } });
  if (plan) return plan.tier;

  return 'FREE';
}

/** Conta membros ativos + convites pendentes não expirados. */
export async function countOrgSeats(orgId) {
  const members = await prisma.organizationMember.count({ where: { orgId } });
  const pending = await prisma.invitation.count({
    where: { orgId, acceptedAt: null, expiresAt: { gt: new Date() } },
  });
  return members + pending;
}

/** Lança 402 se a org atingiu maxUsers do plano. */
export async function assertOrgMemberCapacity(orgId, { accepting = false } = {}) {
  const tier = await getOrgPlanTier(orgId);
  const limits = limitsForTier(tier);
  if (limits.maxUsers === Infinity) return;

  const seats = accepting
    ? await prisma.organizationMember.count({ where: { orgId } })
    : await countOrgSeats(orgId);

  if (seats >= limits.maxUsers) {
    throw new AppError(
      `Limite de ${limits.maxUsers} membros/convites do plano ${tier} atingido. Faça upgrade.`,
      402,
    );
  }
}

/** Lança 402 se o usuário atingiu maxAccounts. */
export async function assertAccountCapacity(userId, tier) {
  const limits = limitsForTier(tier || await getUserPlanTier(userId));
  if (limits.maxAccounts === Infinity) return;

  const count = await prisma.account.count({ where: { userId, active: true } });
  if (count >= limits.maxAccounts) {
    throw new AppError(
      `Limite de ${limits.maxAccounts} contas atingido. Faça upgrade para continuar.`,
      402,
    );
  }
}

/** Lança 402 ao criar orçamento novo (não upsert de categoria existente). */
export async function assertBudgetCapacity(userId, category, period = 'monthly', tier) {
  const limits = limitsForTier(tier || await getUserPlanTier(userId));
  if (limits.maxBudgets === Infinity) return;

  const existing = await prisma.budget.findUnique({
    where: { userId_category_period: { userId, category, period } },
  });
  if (existing) return;

  const count = await prisma.budget.count({ where: { userId, active: true } });
  if (count >= limits.maxBudgets) {
    throw new AppError(
      `Limite de ${limits.maxBudgets} orçamentos atingido. Faça upgrade para continuar.`,
      402,
    );
  }
}

export async function checkAccountLimit(req, _res, next) {
  try {
    const tier = req.planTier || await getUserPlanTier(req.user.id);
    await assertAccountCapacity(req.user.id, tier);
    next();
  } catch (err) {
    next(err);
  }
}

export async function checkBudgetLimit(req, _res, next) {
  try {
    const tier = req.planTier || await getUserPlanTier(req.user.id);
    const { category, period = 'monthly' } = req.body || {};
    if (category) await assertBudgetCapacity(req.user.id, category, period, tier);
    next();
  } catch (err) {
    next(err);
  }
}

export { PLAN_LIMITS, TIER_ORDER, getUserPlanTier };
