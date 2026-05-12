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
  },
  PRO: {
    maxUsers:        5,
    maxTransPerMonth: Infinity,
    maxAccounts:     20,
    maxBudgets:      Infinity,
    aiFeatures:      true,
    teamFeatures:    true,
    reportExport:    true,
  },
  BUSINESS: {
    maxUsers:        Infinity,
    maxTransPerMonth: Infinity,
    maxAccounts:     Infinity,
    maxBudgets:      Infinity,
    aiFeatures:      true,
    teamFeatures:    true,
    reportExport:    true,
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

/**
 * Verifica se o usuário atingiu o limite de transações do mês corrente.
 * Lança 402 se ultrapassado no plano FREE.
 */
export async function checkTransactionLimit(req, _res, next) {
  try {
    const tier = req.planTier || await getUserPlanTier(req.user.id);
    const limits = PLAN_LIMITS[tier];

    if (limits.maxTransPerMonth === Infinity) return next();

    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const count = await prisma.transaction.count({
      where: { userId: req.user.id, date: { gte: start } },
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

export { PLAN_LIMITS, TIER_ORDER };
