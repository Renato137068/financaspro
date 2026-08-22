/**
 * org.service.test.js — propriedade da organização e caminho de saída.
 *
 * Origem: a auditoria de dimensões ocultas mediu o custo de sair do produto e
 * achou um beco. Quem era dono de uma organização não podia apagar a conta
 * (409) e não tinha como passar a propriedade adiante — a única alternativa
 * era `deleteOrg`, que leva junto os dados de todos os outros membros.
 *
 * O efeito prático: para exercer o direito de exclusão, a pessoa precisava
 * destruir o trabalho de terceiros ou manter a conta aberta para sempre.
 *
 * Estes testes cobrem a transferência de propriedade e as garantias que ela
 * precisa ter para não virar escalada de privilégio.
 */
import { jest } from '@jest/globals';
import { makeLogger } from './helpers/mocks.js';
import { createPrismaFake } from '../../scripts/lib/prisma-fake.mjs';

let prisma, OrgService, UserService;

beforeEach(async () => {
  jest.resetModules();
  prisma = createPrismaFake();

  jest.unstable_mockModule('../../backend/lib/db.js', () => ({ default: prisma }));
  jest.unstable_mockModule('../../backend/lib/logger.js', makeLogger);
  jest.unstable_mockModule('../../backend/lib/queue.js', () => ({
    enqueue: jest.fn(async () => ({ id: 'job' })),
    QUEUES: { EMAIL: 'email' },
    getConnection: () => null,
  }));

  ({ OrgService } = await import('../../backend/domain/services/org.service.js'));
  ({ UserService } = await import('../../backend/domain/services/user.service.js'));
});

/** Organização com dono e, opcionalmente, outros membros. */
async function orgCom(membros = [], { planTier = 'PRO' } = {}) {
  await prisma.organization.create({
    data: { id: 'o1', name: 'Acme', slug: 'acme', ownerId: 'dono', active: true },
  });
  await prisma.organizationMember.create({
    data: { orgId: 'o1', userId: 'dono', role: 'OWNER' },
  });
  for (const m of membros) {
    await prisma.organizationMember.create({ data: { orgId: 'o1', ...m } });
  }
  const planId = planTier === 'PRO' ? 'plan-pro' : 'plan-free';
  await prisma.plan.create({
    data: {
      id: planId, name: planTier, tier: planTier,
      priceMonthly: 0, priceYearly: 0,
      maxUsers: planTier === 'PRO' ? 5 : 1,
      maxAccounts: 20, maxBudgets: 5, maxTransPerMonth: 100,
    },
  });
  await prisma.subscription.create({
    data: {
      orgId: 'o1', planId, status: 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 86400000 * 365),
    },
  });
}

const papelDe = async (userId) => (await prisma.organizationMember.findUnique({
  where: { orgId_userId: { orgId: 'o1', userId } },
}))?.role;

describe('transferOwnership — o caminho de saída do dono', () => {
  test('transfere para um membro existente', async () => {
    await orgCom([{ userId: 'membro', role: 'MEMBER' }]);

    const out = await OrgService.transferOwnership('o1', 'membro', 'dono');

    expect(out).toEqual({ orgId: 'o1', ownerId: 'membro' });
    expect((await prisma.organization.findFirst({ where: { id: 'o1' } })).ownerId).toBe('membro');
  });

  test('o novo dono recebe o papel OWNER', async () => {
    // `ownerId` e o papel precisam andar juntos: as checagens de permissão
    // olham `ownerId`, mas a tela mostra o papel. Divergir confunde os dois.
    await orgCom([{ userId: 'membro', role: 'MEMBER' }]);

    await OrgService.transferOwnership('o1', 'membro', 'dono');

    expect(await papelDe('membro')).toBe('OWNER');
  });

  test('o dono anterior vira ADMIN, não perde o acesso', async () => {
    // Tirar o acesso junto com a propriedade transformaria a transferência
    // numa saída forçada — quem transfere costuma continuar trabalhando ali.
    await orgCom([{ userId: 'membro', role: 'MEMBER' }]);

    await OrgService.transferOwnership('o1', 'membro', 'dono');

    expect(await papelDe('dono')).toBe('ADMIN');
  });

  test('depois de transferir, o antigo dono consegue apagar a conta', async () => {
    // Este é o ponto do exercício: fechar o beco sem saída.
    await prisma.user.create({ data: { id: 'dono', email: 'a@b.c', name: 'D' } });
    await orgCom([{ userId: 'membro', role: 'MEMBER' }]);

    await expect(UserService.deleteAccount('dono')).rejects.toMatchObject({ status: 409 });

    await OrgService.transferOwnership('o1', 'membro', 'dono');

    await expect(UserService.deleteAccount('dono')).resolves.toMatchObject({ deleted: true });
  });

  test('a organização continua existindo depois da saída do dono', async () => {
    await prisma.user.create({ data: { id: 'dono', email: 'a@b.c', name: 'D' } });
    await orgCom([{ userId: 'membro', role: 'MEMBER' }]);

    await OrgService.transferOwnership('o1', 'membro', 'dono');
    await UserService.deleteAccount('dono');

    const org = await prisma.organization.findFirst({ where: { id: 'o1' } });
    expect(org).not.toBeNull();
    expect(org.ownerId).toBe('membro');
  });
});

describe('transferOwnership — o que não pode acontecer', () => {
  test('quem não é dono não transfere', async () => {
    await orgCom([{ userId: 'membro', role: 'MEMBER' }, { userId: 'outro', role: 'ADMIN' }]);

    await expect(OrgService.transferOwnership('o1', 'outro', 'membro'))
      .rejects.toMatchObject({ status: 403 });
  });

  test('não é possível promover quem não é membro', async () => {
    // Sem esta checagem, o dono daria acesso total a dados financeiros a uma
    // pessoa que nunca entrou na organização.
    await orgCom();

    await expect(OrgService.transferOwnership('o1', 'estranho', 'dono'))
      .rejects.toMatchObject({ status: 400 });
  });

  test('transferir para si mesmo é recusado', async () => {
    await orgCom();

    await expect(OrgService.transferOwnership('o1', 'dono', 'dono'))
      .rejects.toMatchObject({ status: 400 });
  });

  test('organização inexistente devolve 404', async () => {
    await expect(OrgService.transferOwnership('fantasma', 'x', 'dono'))
      .rejects.toMatchObject({ status: 404 });
  });

  test('uma transferência recusada não altera nada', async () => {
    await orgCom([{ userId: 'membro', role: 'MEMBER' }]);

    await OrgService.transferOwnership('o1', 'estranho', 'dono').catch(() => {});

    expect((await prisma.organization.findFirst({ where: { id: 'o1' } })).ownerId).toBe('dono');
    expect(await papelDe('dono')).toBe('OWNER');
    expect(await papelDe('membro')).toBe('MEMBER');
  });

  test('a organização nunca fica com dois OWNER', async () => {
    await orgCom([{ userId: 'membro', role: 'MEMBER' }]);

    await OrgService.transferOwnership('o1', 'membro', 'dono');

    const owners = (await prisma.organizationMember.findMany({ where: { orgId: 'o1' } }))
      .filter(m => m.role === 'OWNER');
    expect(owners.map(m => m.userId)).toEqual(['membro']);
  });
});

describe('OrgService.create — org + subscription FREE atômicos', () => {
  test('cria subscription FREE junto com a organização', async () => {
    await prisma.plan.create({
      data: {
        id: 'plan-free', name: 'Grátis', tier: 'FREE',
        priceMonthly: 0, priceYearly: 0,
      },
    });
    await prisma.user.create({ data: { id: 'dono', email: 'a@b.c', name: 'D' } });

    const org = await OrgService.create('dono', { name: 'Nova Org' });

    const sub = await prisma.subscription.findUnique({ where: { orgId: org.id } });
    expect(sub).not.toBeNull();
    expect(sub.planId).toBe('plan-free');
    expect(sub.status).toBe('ACTIVE');
  });
});

describe('OrgService.acceptInvitation — aceite atômico', () => {
  test('aceita convite e cria membro', async () => {
    await orgCom();
    await prisma.user.create({ data: { id: 'convidado', email: 'conv@example.com', name: 'C' } });
    const inv = await prisma.invitation.create({
      data: {
        orgId: 'o1', email: 'conv@example.com', role: 'MEMBER',
        token: 'tok-aceitar', expiresAt: new Date(Date.now() + 86400_000),
      },
    });

    const out = await OrgService.acceptInvitation(inv.token, 'convidado');

    expect(out).toEqual({ orgId: 'o1', role: 'MEMBER' });
    expect(await papelDe('convidado')).toBe('MEMBER');
    const atualizado = await prisma.invitation.findUnique({ where: { token: inv.token } });
    expect(atualizado.acceptedAt).not.toBeNull();
  });

  test('segundo aceite do mesmo token falha com 409', async () => {
    await orgCom();
    await prisma.user.create({ data: { id: 'convidado', email: 'conv@example.com', name: 'C' } });
    const inv = await prisma.invitation.create({
      data: {
        orgId: 'o1', email: 'conv@example.com', role: 'MEMBER',
        token: 'tok-duplo', expiresAt: new Date(Date.now() + 86400_000),
      },
    });

    await OrgService.acceptInvitation(inv.token, 'convidado');

    await expect(OrgService.acceptInvitation(inv.token, 'convidado'))
      .rejects.toMatchObject({ status: 409 });
  });
});
