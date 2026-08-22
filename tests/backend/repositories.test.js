/**
 * repositories.test.js — camada de acesso a dados com o client Prisma mockado.
 *
 * Aqui não se testa o Prisma: testa-se o *contrato* que os repositórios montam
 * — filtros, escopo por usuário e transformações antes de gravar. É exatamente
 * onde mora a diferença entre "usuário lê só o que é dele" e um vazamento
 * horizontal de dados.
 */
import { jest } from '@jest/globals';
import { hashToken } from '../../backend/lib/jwt.js';

let prisma, UserRepository, SessionRepository, AuditRepository, TransactionRepository, VerificationTokenRepository;

/** Client Prisma mínimo: cada model é um objeto de jest.fn(). */
function makePrisma() {
  const model = () => ({
    findUnique: jest.fn(async () => null),
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
    create: jest.fn(async ({ data }) => ({ id: 'novo', ...data })),
    update: jest.fn(async ({ data }) => ({ id: 'x', ...data })),
    updateMany: jest.fn(async () => ({ count: 1 })),
    upsert: jest.fn(async a => a),
    delete: jest.fn(async () => ({ id: 'x' })),
    count: jest.fn(async () => 0),
  });
  return {
    user: model(), session: model(), auditLog: model(),
    transaction: model(), userConfig: model(), verificationToken: model(),
    $transaction: jest.fn(async (ops) => {
      if (typeof ops === 'function') return ops(prisma);
      if (Array.isArray(ops)) return Promise.all(ops);
      return ops;
    }),
  };
}

beforeEach(async () => {
  jest.resetModules();
  prisma = makePrisma();
  jest.unstable_mockModule('../../backend/lib/db.js', () => ({ default: prisma }));

  ({ UserRepository } = await import('../../backend/domain/repositories/user.repository.js'));
  ({ SessionRepository } = await import('../../backend/domain/repositories/session.repository.js'));
  ({ AuditRepository } = await import('../../backend/domain/repositories/audit.repository.js'));
  ({ TransactionRepository } = await import('../../backend/domain/repositories/transaction.repository.js'));
  ({ VerificationTokenRepository } = await import('../../backend/domain/repositories/verification-token.repository.js'));
});

describe('UserRepository', () => {
  test('findByEmail usa a chave única de e-mail', async () => {
    await UserRepository.findByEmail('a@b.com');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'a@b.com' } });
  });

  test('findAll nunca projeta hash nem salt de senha', async () => {
    await UserRepository.findAll();
    const [{ select }] = prisma.user.findMany.mock.calls[0];

    expect(select.passwordHash).toBeUndefined();
    expect(select.passwordSalt).toBeUndefined();
    expect(select.email).toBe(true);
  });

  test('upsertConfig grava o mesmo payload na criação e na atualização', async () => {
    await UserRepository.upsertConfig('user-1', { renda: 5000 });
    const [args] = prisma.userConfig.upsert.mock.calls[0];

    expect(args.where).toEqual({ userId: 'user-1' });
    expect(args.update.data).toEqual({ renda: 5000 });
    expect(args.create).toEqual({ userId: 'user-1', data: { renda: 5000 } });
  });
});

describe('SessionRepository', () => {
  const TOKEN = 'refresh-token-em-claro';

  test('busca pelo hash, nunca pelo token em claro', async () => {
    await SessionRepository.findByToken(TOKEN);
    const [args] = prisma.session.findUnique.mock.calls[0];

    expect(args.where.refreshToken).toBe(hashToken(TOKEN));
    expect(args.where.refreshToken).not.toBe(TOKEN);
  });

  test('create persiste o hash e preserva os demais campos', async () => {
    const expiresAt = new Date();
    await SessionRepository.create({ userId: 'user-1', refreshToken: TOKEN, expiresAt, ipAddress: '1.2.3.4' });
    const [{ data }] = prisma.session.create.mock.calls[0];

    expect(data.refreshToken).toBe(hashToken(TOKEN));
    expect(data.userId).toBe('user-1');
    expect(data.ipAddress).toBe('1.2.3.4');
    expect(JSON.stringify(data)).not.toContain(TOKEN);
  });

  test('revokeAllForUser só alcança sessões ainda ativas', async () => {
    await SessionRepository.revokeAllForUser('user-1');
    const [args] = prisma.session.updateMany.mock.calls[0];

    expect(args.where).toEqual({ userId: 'user-1', revokedAt: null });
    expect(args.data.revokedAt).toBeInstanceOf(Date);
  });

  test('revokeByUserAndToken casa usuário E hash (não só o token)', async () => {
    await SessionRepository.revokeByUserAndToken('user-1', TOKEN);
    const [args] = prisma.session.updateMany.mock.calls[0];

    expect(args.where).toEqual({ userId: 'user-1', refreshToken: hashToken(TOKEN) });
  });

  test('rotateToken revoga a antiga e cria a nova na mesma transação', async () => {
    const ok = await SessionRepository.rotateToken('sess-antiga', { userId: 'user-1', refreshToken: TOKEN, expiresAt: new Date() });

    expect(ok).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sess-antiga', revokedAt: null } }),
    );
    expect(prisma.session.create).toHaveBeenCalled();
  });

  test('rotateToken retorna false se a sessão já foi revogada', async () => {
    prisma.session.updateMany.mockResolvedValueOnce({ count: 0 });

    const ok = await SessionRepository.rotateToken('sess-antiga', { userId: 'user-1', refreshToken: TOKEN, expiresAt: new Date() });

    expect(ok).toBe(false);
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
});

describe('VerificationTokenRepository', () => {
  test('consume só marca tokens ainda não usados', async () => {
    prisma.verificationToken.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(VerificationTokenRepository.consume('tok-1')).resolves.toBe(true);
    expect(prisma.verificationToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'tok-1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  test('consume retorna false quando token já foi usado', async () => {
    prisma.verificationToken.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(VerificationTokenRepository.consume('tok-1')).resolves.toBe(false);
  });
});

describe('AuditRepository', () => {
  test('grava os campos de rastreabilidade', async () => {
    await AuditRepository.log({
      userId: 'user-1', action: 'login', resource: 'user',
      ipAddress: '9.9.9.9', userAgent: 'jest',
    });
    const [{ data }] = prisma.auditLog.create.mock.calls[0];

    expect(data).toMatchObject({ userId: 'user-1', action: 'login', ipAddress: '9.9.9.9' });
  });
});

describe('TransactionRepository', () => {
  test('findMany sempre escopa por userId', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);
    await TransactionRepository.findMany('user-1', { limit: 50, offset: 0 });
    const [{ where }] = prisma.transaction.findMany.mock.calls[0];

    expect(where.userId).toBe('user-1');
  });

  test('filtros opcionais ausentes não viram cláusulas undefined', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);
    await TransactionRepository.findMany('user-1', { limit: 50, offset: 0 });
    const [{ where }] = prisma.transaction.findMany.mock.calls[0];

    expect(Object.keys(where)).toEqual(['userId', 'deletedAt']);
  });

  test('intervalo de datas vira gte/lte', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);
    await TransactionRepository.findMany('user-1', {
      dateFrom: '2026-01-01', dateTo: '2026-01-31', limit: 50, offset: 0,
    });
    const [{ where }] = prisma.transaction.findMany.mock.calls[0];

    expect(where.date.gte).toBeInstanceOf(Date);
    expect(where.date.lte).toBeInstanceOf(Date);
  });

  test('meta.hasMore reflete corretamente o fim da paginação', async () => {
    prisma.$transaction.mockResolvedValue([[{ id: 't1' }], 120]);
    const out = await TransactionRepository.findMany('user-1', { limit: 50, offset: 0 });
    expect(out.meta).toEqual({ total: 120, limit: 50, offset: 0, hasMore: true });

    prisma.$transaction.mockResolvedValue([[{ id: 't1' }], 40]);
    const fim = await TransactionRepository.findMany('user-1', { limit: 50, offset: 0 });
    expect(fim.meta.hasMore).toBe(false);
  });

  test('findById exige dono — impede leitura horizontal', async () => {
    await TransactionRepository.findById('tx-1', 'user-1');
    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({ where: { id: 'tx-1', userId: 'user-1', deletedAt: null } });
  });

  test('findByOpenFinanceId retorna null sem consultar quando o id é vazio', async () => {
    await expect(TransactionRepository.findByOpenFinanceId('user-1', null)).resolves.toBeNull();
    expect(prisma.transaction.findFirst).not.toHaveBeenCalled();
  });

  test('findByOpenFinanceId escopa por usuário na deduplicação', async () => {
    await TransactionRepository.findByOpenFinanceId('user-1', 'of-123');
    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', openFinanceId: 'of-123', deletedAt: null },
    });
  });
});

/**
 * update, delete e createTombstone são o caminho por onde um usuário poderia
 * alcançar o registro de outro. O escopo por userId não pode estar só no
 * `findFirst` de leitura: precisa estar na cláusula que ESCREVE, senão um id
 * adivinhado altera dado alheio. Estes testes prendem isso.
 */
describe('TransactionRepository — escrita escopada por usuário', () => {
  test('update filtra por id E userId no updateMany', async () => {
    prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
    prisma.transaction.findFirst.mockResolvedValue({ id: 't1', userId: 'user-1' });

    await TransactionRepository.update('t1', 'user-1', { description: 'nova' });

    const [{ where }] = prisma.transaction.updateMany.mock.calls[0];
    expect(where).toEqual({ id: 't1', userId: 'user-1' });
  });

  test('update de registro de outro usuário devolve null, não erro', async () => {
    // count 0 = a cláusula não casou. Devolver null deixa a rota responder 404
    // em vez de vazar a existência do registro alheio com um 403.
    prisma.transaction.updateMany.mockResolvedValue({ count: 0 });

    const out = await TransactionRepository.update('t1', 'intruso', { description: 'x' });

    expect(out).toBeNull();
    expect(prisma.transaction.findFirst).not.toHaveBeenCalled();
  });

  test('softDelete marca deletedAt sem apagar a linha', async () => {
    prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
    prisma.transaction.findFirst.mockResolvedValue({ id: 't1' });

    await TransactionRepository.softDelete('t1', 'user-1', '2026-08-22T10:00:00.000Z');

    const [{ where, data }] = prisma.transaction.updateMany.mock.calls[0];
    expect(where).toEqual({ id: 't1', userId: 'user-1' });
    expect(data.deletedAt).toEqual(new Date('2026-08-22T10:00:00.000Z'));
    // Nunca um DELETE físico: o tombstone é o que faz o sync propagar a
    // remoção para os outros dispositivos.
    expect(prisma.transaction.delete).not.toHaveBeenCalled();
  });

  test('softDelete sem data usa o instante atual', async () => {
    prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
    prisma.transaction.findFirst.mockResolvedValue({ id: 't1' });

    const antes = Date.now();
    await TransactionRepository.softDelete('t1', 'user-1');
    const [{ data }] = prisma.transaction.updateMany.mock.calls[0];

    expect(data.deletedAt.getTime()).toBeGreaterThanOrEqual(antes);
  });

  test('softDelete de registro alheio devolve null', async () => {
    prisma.transaction.updateMany.mockResolvedValue({ count: 0 });
    expect(await TransactionRepository.softDelete('t1', 'intruso')).toBeNull();
  });

  test('delete (depreciado) apenas delega para softDelete', async () => {
    prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
    prisma.transaction.findFirst.mockResolvedValue({ id: 't1' });

    await TransactionRepository.delete('t1', 'user-1');

    expect(prisma.transaction.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.delete).not.toHaveBeenCalled();
  });
});

describe('TransactionRepository.createTombstone', () => {
  const QUANDO = '2026-08-22T10:00:00.000Z';

  test('registro próprio: marca deletedAt com o horário do cliente', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 't1', userId: 'user-1' });

    await TransactionRepository.createTombstone('user-1', 't1', QUANDO);

    const [{ where, data }] = prisma.transaction.update.mock.calls[0];
    expect(where).toEqual({ id: 't1' });
    expect(data.deletedAt).toEqual(new Date(QUANDO));
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  test('id inexistente: cria a lápide, sem ressuscitar valor', async () => {
    prisma.transaction.findFirst.mockResolvedValue(null);
    prisma.transaction.findUnique.mockResolvedValue(null);

    await TransactionRepository.createTombstone('user-1', 't-novo', QUANDO);

    const [{ data }] = prisma.transaction.create.mock.calls[0];
    expect(data.id).toBe('t-novo');
    expect(data.userId).toBe('user-1');
    // amount 0 é essencial: a lápide entra nos mesmos agregados das demais
    // transações, e qualquer valor aqui apareceria no saldo do usuário.
    expect(data.amount).toBe(0);
    expect(data.deletedAt).toEqual(new Date(QUANDO));
  });

  test('id já pertence a OUTRO usuário: recusa com ID_COLLISION', async () => {
    // Sem esta guarda, um cliente conseguiria apagar o lançamento de outra
    // pessoa só mandando o id dela numa operação de sync.
    prisma.transaction.findFirst.mockResolvedValue(null);
    prisma.transaction.findUnique.mockResolvedValue({ userId: 'outro' });

    await expect(
      TransactionRepository.createTombstone('user-1', 't1', QUANDO),
    ).rejects.toMatchObject({ code: 'ID_COLLISION' });

    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });
});

