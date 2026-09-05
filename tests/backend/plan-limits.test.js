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
      maxUsers: 1, maxAccounts: 5, maxBudgets: 5, maxTransPerMonth: null,
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
  // Cinco contas cobrem o usuário típico do app: corrente, poupança, dois
  // cartões e a carteira. Com o teto em três, ele estourava durante o próprio
  // onboarding — antes de lançar a primeira despesa e de ver valor nenhum.
  test('FREE aceita a 5ª conta', async () => {
    await seedFreePlan();
    for (let i = 0; i < 4; i++) {
      await prisma.account.create({
        data: { userId: USER, name: `C${i}`, type: 'checking', active: true },
      });
    }

    await expect(assertAccountCapacity(USER, 'FREE')).resolves.toBeUndefined();
  });

  test('FREE bloqueia na 6ª conta', async () => {
    await seedFreePlan();
    for (let i = 0; i < 5; i++) {
      await prisma.account.create({
        data: { userId: USER, name: `C${i}`, type: 'checking', active: true },
      });
    }

    await expect(assertAccountCapacity(USER, 'FREE')).rejects.toMatchObject({ status: 402 });
  });

  test('PRO não tem teto de contas', async () => {
    await seedFreePlan();
    for (let i = 0; i < 30; i++) {
      await prisma.account.create({
        data: { userId: USER, name: `C${i}`, type: 'checking', active: true },
      });
    }

    await expect(assertAccountCapacity(USER, 'PRO')).resolves.toBeUndefined();
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
 * Nao existe mais teto mensal de transacoes, em nenhum plano.
 *
 * O limite de 100/mes parava de aceitar lancamentos por volta do dia 15 para o
 * usuario intenso -- que e exatamente quem pagaria. O mes ficava pela metade, o
 * que estragava orcamento, insight e comparativo junto, e o app virava inutil
 * justamente no mes em que a pessoa mais precisava dele. Limite de volume num
 * app de habito e churn, nao conversao.
 *
 * O middleware continua montado e continua contando por `createdAt` (e nao por
 * `date`, que o usuario digita e que permitia burlar o teto com data
 * retroativa). Fica inerte enquanto `maxTransPerMonth` for nulo -- reintroduzir
 * um teto e mudar um dado, nao reescrever enforcement.
 */
describe('checkTransactionLimit — sem teto mensal', () => {
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

  test('FREE lança 500 vezes no mês sem ser bloqueado', async () => {
    await semearTransacoes(500, { date: new Date(), createdAt: new Date() });

    const err = await rodar({ user: { id: USER }, planTier: 'FREE' });

    expect(err).toBeNull();
  });

  test('PRO também não tem teto', async () => {
    await semearTransacoes(100, { date: new Date(), createdAt: new Date() });

    const err = await rodar({ user: { id: USER }, planTier: 'PRO' });

    expect(err).toBeNull();
  });

  test('o middleware sai cedo: nem chega a contar', async () => {
    // Sem teto, nao vale pagar um count() no caminho mais quente da API.
    const err = await rodar({ user: { id: USER }, planTier: 'FREE' });

    expect(err).toBeNull();
  });
});
