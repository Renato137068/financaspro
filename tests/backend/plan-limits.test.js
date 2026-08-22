/**
 * plan-limits.test.js — Fase 6: enforcement de limites de plano.
 */
import { jest } from '@jest/globals';
import { createPrismaFake } from '../../scripts/lib/prisma-fake.mjs';

let prisma, assertAccountCapacity, assertBudgetCapacity, assertOrgMemberCapacity, checkTransactionLimit;

beforeEach(async () => {
  jest.resetModules();
  prisma = createPrismaFake();
  jest.unstable_mockModule('../../backend/lib/db.js', () => ({ default: prisma }));

  ({
    assertAccountCapacity,
    assertBudgetCapacity,
    assertOrgMemberCapacity,
    checkTransactionLimit,
  } = await import('../../backend/middleware/plan.js'));
});

const USER = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';

async function seedFreePlan() {
  await prisma.plan.create({
    data: {
      id: 'plan-free', name: 'Free', tier: 'FREE',
      priceMonthly: 0, priceYearly: 0,
      maxUsers: 1, maxAccounts: 3, maxBudgets: 5, maxTransPerMonth: 100,
    },
  });
  await prisma.subscription.create({
    data: {
      orgId: ORG, planId: 'plan-free', status: 'ACTIVE',
      currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 86400000),
    },
  });
}

describe('assertAccountCapacity', () => {
  test('FREE bloqueia na 4ª conta', async () => {
    await seedFreePlan();
    for (let i = 0; i < 3; i++) {
      await prisma.account.create({
        data: { userId: USER, name: `C${i}`, type: 'checking', active: true },
      });
    }

    await expect(assertAccountCapacity(USER, 'FREE')).rejects.toMatchObject({ status: 402 });
  });
});

describe('assertBudgetCapacity', () => {
  test('FREE bloqueia 6º orçamento novo', async () => {
    await seedFreePlan();
    for (let i = 0; i < 5; i++) {
      await prisma.budget.create({
        data: {
          userId: USER, category: `cat-${i}`, period: 'monthly',
          limit: 100, active: true,
        },
      });
    }

    await expect(assertBudgetCapacity(USER, 'novo', 'monthly', 'FREE'))
      .rejects.toMatchObject({ status: 402 });
  });

  test('upsert de categoria existente não conta como novo', async () => {
    await seedFreePlan();
    await prisma.budget.create({
      data: { userId: USER, category: 'mercado', period: 'monthly', limit: 100, active: true },
    });

    await expect(assertBudgetCapacity(USER, 'mercado', 'monthly', 'FREE')).resolves.toBeUndefined();
  });
});

describe('assertOrgMemberCapacity', () => {
  test('FREE com 1 membro bloqueia convite extra', async () => {
    await seedFreePlan();
    await prisma.organizationMember.create({
      data: { orgId: ORG, userId: USER, role: 'OWNER' },
    });

    await expect(assertOrgMemberCapacity(ORG)).rejects.toMatchObject({ status: 402 });
  });
});

/**
 * O teto mensal do plano FREE contava por `date` — a data que o usuário digita
 * no formulário. Lançar com data retroativa nunca encostava no limite: bypass
 * completo, sem exigir nenhuma manha técnica. Agora conta por `createdAt`.
 */
describe('checkTransactionLimit — mês contado por createdAt', () => {
  const MES_PASSADO = new Date(Date.now() - 45 * 86400000);

  /** Executa o middleware e devolve o erro que ele passou ao next(), se houver. */
  function rodar(req) {
    return new Promise((resolve) => {
      checkTransactionLimit(req, {}, (err) => resolve(err || null));
    });
  }

  async function semearTransacoes(qtd, { date, createdAt }) {
    for (let i = 0; i < qtd; i++) {
      await prisma.transaction.create({
        data: {
          id: `tx-${i}-${createdAt.getTime()}`,
          userId: USER, type: 'despesa', amount: 10,
          description: 'x', category: 'outros',
          date, createdAt,
        },
      });
    }
  }

  test('lançamento com data retroativa NÃO escapa do teto', async () => {
    // Criados agora (conta), mas datados do mês passado (antes, não contava).
    await semearTransacoes(100, { date: MES_PASSADO, createdAt: new Date() });

    const err = await rodar({ user: { id: USER }, planTier: 'FREE' });

    expect(err).toBeTruthy();
    expect(err.status).toBe(402);
    expect(err.message).toMatch(/Limite de 100 transações\/mês/);
  });

  test('lançamento criado no mês passado não ocupa a cota deste mês', async () => {
    await semearTransacoes(100, { date: new Date(), createdAt: MES_PASSADO });

    const err = await rodar({ user: { id: USER }, planTier: 'FREE' });

    expect(err).toBeNull();
  });

  test('transação apagada (tombstone) não ocupa cota', async () => {
    await semearTransacoes(100, { date: new Date(), createdAt: new Date() });
    for (const tx of prisma.__store.get('transaction').values()) tx.deletedAt = new Date();

    const err = await rodar({ user: { id: USER }, planTier: 'FREE' });

    expect(err).toBeNull();
  });

  test('plano PRO não tem teto mensal', async () => {
    await semearTransacoes(100, { date: new Date(), createdAt: new Date() });

    const err = await rodar({ user: { id: USER }, planTier: 'PRO' });

    expect(err).toBeNull();
  });
});
