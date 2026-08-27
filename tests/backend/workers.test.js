/**
 * workers.test.js — processamento em background.
 *
 * Workers rodam fora do ciclo de requisição: quando falham, ninguém recebe um
 * 500 — o lançamento simplesmente não aparece, ou aparece duas vezes. É o tipo
 * de bug que o usuário descobre semanas depois, ao conferir o extrato.
 */
import { jest } from '@jest/globals';
import { makeLogger } from './helpers/mocks.js';
import { createPrismaFake } from '../../scripts/lib/prisma-fake.mjs';

let prisma, enqueue, processRecurring, nextDueDate, sendEmail, TEMPLATES;

beforeEach(async () => {
  jest.resetModules();
  prisma = createPrismaFake();
  enqueue = jest.fn(async () => ({ id: 'job' }));

  jest.unstable_mockModule('../../backend/lib/db.js', () => ({ default: prisma }));
  jest.unstable_mockModule('../../backend/lib/logger.js', makeLogger);
  jest.unstable_mockModule('../../backend/lib/queue.js', () => ({
    enqueue, QUEUES: { EMAIL: 'email', RECURRING: 'recurring-processor' }, getConnection: () => null,
  }));
  // bullmq só é usado para instanciar o Worker; nada disso roda nos testes.
  jest.unstable_mockModule('bullmq', () => ({
    Worker: class { constructor() { this.on = () => this; } on() { return this; } },
    Queue: class {}, QueueEvents: class {},
  }));

  ({ processRecurring, nextDueDate } = await import('../../backend/workers/recurring.worker.js'));
  ({ sendEmail, TEMPLATES } = await import('../../backend/workers/email.worker.js'));
});

const ONTEM = new Date(Date.now() - 86400_000);
const AMANHA = new Date(Date.now() + 86400_000);

/** Cria uma recorrência vencida no store. */
async function recorrenteVencida(over = {}) {
  return prisma.recurringTransaction.create({
    data: {
      userId: 'user-1', orgId: null, type: 'despesa', amount: 59.9,
      description: 'Streaming', category: 'lazer', frequency: 'monthly',
      nextDue: ONTEM, endDate: null, active: true, ...over,
    },
  });
}

// ─── aritmética de calendário ────────────────────────────────────────────────
describe('nextDueDate', () => {
  const base = new Date('2026-01-31T12:00:00.000Z');

  test('diária avança um dia', () => {
    expect(nextDueDate('daily', new Date('2026-03-10T00:00:00Z')).getUTCDate()).toBe(11);
  });

  test('semanal avança sete dias', () => {
    const out = nextDueDate('weekly', new Date('2026-03-10T00:00:00Z'));
    expect(out.getUTCDate()).toBe(17);
  });

  test('quinzenal avança catorze dias', () => {
    const out = nextDueDate('biweekly', new Date('2026-03-10T00:00:00Z'));
    expect(out.getUTCDate()).toBe(24);
  });

  test('mensal usa mês de calendário, não 30 dias', () => {
    // A diferença importa: somar 30 dias faria a recorrência escorregar
    // ~5 dias por ano em relação à data contratada.
    const out = nextDueDate('monthly', new Date('2026-01-15T12:00:00Z'));
    expect(out.getMonth()).toBe(new Date('2026-02-15T12:00:00Z').getMonth());
  });

  test('trimestral avança três meses', () => {
    const jan = new Date('2026-01-15T12:00:00Z');
    expect(nextDueDate('quarterly', jan).getMonth()).toBe(3); // abril
  });

  test('anual avança doze meses', () => {
    const out = nextDueDate('yearly', new Date('2026-01-15T12:00:00Z'));
    expect(out.getFullYear()).toBe(2027);
  });

  test('31 de janeiro + 1 mês cai no último dia de fevereiro, não em março', () => {
    // O `setMonth` cru transbordava para 03/03 — e como a data nova vira a base
    // do ciclo seguinte, o vencimento derivava para sempre (31 → 03 → 03...).
    // Um aluguel do dia 31 passava a ser cobrado dia 3 sem ninguém mudar nada.
    const out = nextDueDate('monthly', base);
    expect(out.getTime()).toBeGreaterThan(base.getTime());
    expect(out.getMonth()).toBe(1);   // fevereiro
    expect(out.getDate()).toBe(28);   // 2026 não é bissexto
  });

  test('mensal não deriva ao longo de um ano inteiro a partir do dia 31', () => {
    // O teste que importa: doze ciclos seguidos precisam cair em doze meses
    // distintos, sempre no último dia disponível.
    let atual = new Date('2026-01-31T12:00:00.000Z');
    const meses = [];
    const dias = [];
    for (let i = 0; i < 12; i++) {
      atual = nextDueDate('monthly', atual);
      meses.push(atual.getFullYear() + '-' + atual.getMonth());
      dias.push(atual.getDate());
    }
    expect(new Set(meses).size).toBe(12);
    // Nenhum ciclo caiu no começo do mês — sinal clássico do transbordo.
    dias.forEach((d) => expect(d).toBeGreaterThan(27));
  });

  test('ano bissexto usa 29 de fevereiro', () => {
    const out = nextDueDate('monthly', new Date('2024-01-31T12:00:00.000Z'));
    expect(out.getMonth()).toBe(1);
    expect(out.getDate()).toBe(29);
  });

  test('preserva a hora do vencimento original', () => {
    // nextDue é comparado com `lte: now`; zerar a hora anteciparia o lançamento.
    const out = nextDueDate('monthly', base);
    expect(out.getHours()).toBe(base.getHours());
    expect(out.getMinutes()).toBe(base.getMinutes());
  });

  test('frequência desconhecida cai no padrão de 30 dias', () => {
    const out = nextDueDate('a-cada-lua-cheia', new Date('2026-03-01T00:00:00Z'));
    expect(out.getUTCDate()).toBe(31);
  });
});

// ─── processamento ───────────────────────────────────────────────────────────
describe('processRecurring', () => {
  test('sem recorrências vencidas não faz nada', async () => {
    await recorrenteVencida({ nextDue: AMANHA });

    const out = await processRecurring({});

    expect(out).toEqual({ processed: 0 });
    expect(enqueue).not.toHaveBeenCalled();
  });

  test('ignora recorrências desativadas', async () => {
    await recorrenteVencida({ active: false });

    const out = await processRecurring({});
    expect(out).toEqual({ processed: 0 });
  });

  test('lança a transação com os dados da recorrência', async () => {
    const rec = await recorrenteVencida();

    await processRecurring({});
    const criadas = await prisma.transaction.findMany({ where: { userId: 'user-1' } });

    expect(criadas).toHaveLength(1);
    expect(criadas[0]).toMatchObject({
      type: 'despesa', amount: 59.9, description: 'Streaming', recurring: true,
    });
    expect(criadas[0].date.getTime()).toBe(rec.nextDue.getTime());
  });

  test('propaga accountId da recorrência para a transação gerada', async () => {
    const accountId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    await recorrenteVencida({ accountId });

    await processRecurring({});
    const criadas = await prisma.transaction.findMany({ where: { userId: 'user-1' } });

    expect(criadas).toHaveLength(1);
    expect(criadas[0].accountId).toBe(accountId);
  });

  test('avança nextDue para o próximo período', async () => {
    const rec = await recorrenteVencida();

    await processRecurring({});
    const atualizada = await prisma.recurringTransaction.findUnique({ where: { id: rec.id } });

    expect(atualizada.nextDue.getTime()).toBeGreaterThan(rec.nextDue.getTime());
    expect(atualizada.active).toBe(true);
  });

  test('rodar duas vezes não duplica o mesmo período', async () => {
    // O avanço de nextDue é o que garante idempotência: na segunda passada a
    // recorrência não está mais vencida.
    await recorrenteVencida();

    await processRecurring({});
    const segunda = await processRecurring({});

    expect(segunda.processed).toBe(0);
    expect(await prisma.transaction.count({ where: { userId: 'user-1' } })).toBe(1);
  });

  test('não lança transação quando o claim condicional perde a corrida', async () => {
    await recorrenteVencida();
    const original = prisma.recurringTransaction.updateMany;
    prisma.recurringTransaction.updateMany = jest.fn(async () => ({ count: 0 }));

    const out = await processRecurring({});

    expect(out.processed).toBe(0);
    expect(await prisma.transaction.count({ where: { userId: 'user-1' } })).toBe(0);
    prisma.recurringTransaction.updateMany = original;
  });

  test('desativa ao ultrapassar a data final', async () => {
    const rec = await recorrenteVencida({ endDate: new Date(Date.now() - 3600_000) });

    await processRecurring({});
    const atualizada = await prisma.recurringTransaction.findUnique({ where: { id: rec.id } });

    expect(atualizada.active).toBe(false);
  });

  test('mantém ativa quando ainda há período pela frente', async () => {
    const rec = await recorrenteVencida({ endDate: new Date(Date.now() + 365 * 86400_000) });

    await processRecurring({});
    const atualizada = await prisma.recurringTransaction.findUnique({ where: { id: rec.id } });

    expect(atualizada.active).toBe(true);
  });

  test('notifica o usuário por e-mail', async () => {
    await recorrenteVencida();

    await processRecurring({});

    expect(enqueue).toHaveBeenCalledWith('email', 'recurring-processed',
      expect.objectContaining({ userId: 'user-1', description: 'Streaming' }));
  });

  test('processa várias recorrências na mesma execução', async () => {
    await recorrenteVencida({ description: 'A' });
    await recorrenteVencida({ description: 'B' });
    await recorrenteVencida({ description: 'C' });

    const out = await processRecurring({});

    expect(out.processed).toBe(3);
    expect(await prisma.transaction.count({})).toBe(3);
  });

  test('falha em uma recorrência não aborta as demais', async () => {
    // Cenário real: um registro corrompido no meio do lote. Sem isolamento por
    // item, uma linha ruim impediria o lançamento de todas as outras.
    await recorrenteVencida({ description: 'boa-1' });
    await recorrenteVencida({ description: 'ruim' });
    await recorrenteVencida({ description: 'boa-2' });

    const original = prisma.$transaction;
    let chamada = 0;
    prisma.$transaction = async (arg) => {
      chamada++;
      if (chamada === 2) throw new Error('registro corrompido');
      return original(arg);
    };

    const out = await processRecurring({});

    expect(out.processed).toBe(2);
    expect(out.errors).toBe(1);
  });

  test('falha ao enfileirar e-mail não impede o lançamento', async () => {
    await recorrenteVencida();
    enqueue.mockRejectedValue(new Error('Redis fora do ar'));

    const out = await processRecurring({});

    // O lançamento já foi persistido antes da fila; o erro é contabilizado.
    expect(await prisma.transaction.count({})).toBe(1);
    expect(out.errors).toBe(1);
  });
});

// ─── e-mails ─────────────────────────────────────────────────────────────────
describe('sendEmail', () => {
  test('template inexistente não lança — apenas ignora', async () => {
    await expect(sendEmail({ data: { to: 'a@b.com', templateName: 'nao-existe', data: {} } }))
      .resolves.toBeUndefined();
  });

  test('fora de produção simula o envio', async () => {
    const out = await sendEmail({
      data: { to: 'a@b.com', templateName: 'password-reset', data: { url: 'https://x', name: 'Renato' } },
    });
    expect(out).toEqual({ simulated: true });
  });
});

describe('TEMPLATES', () => {
  test('todos produzem assunto e texto não vazios', () => {
    const dadosGenericos = {
      description: 'Item', amount: '10.5', type: 'despesa', date: new Date().toISOString(),
      orgName: 'Org', token: 'tok', planName: 'Pro', nextBilling: new Date().toISOString(),
      accessUntil: new Date().toISOString(), url: 'https://x', name: 'Renato',
    };

    // Acumula os problemas e falha uma vez só, listando todos — mais útil que
    // parar no primeiro template quebrado.
    const problemas = [];
    for (const [nome, fn] of Object.entries(TEMPLATES)) {
      const { subject, text } = fn(dadosGenericos);
      if (!subject) problemas.push(`${nome}: assunto vazio`);
      if (!text || text.length < 20) problemas.push(`${nome}: texto curto demais`);
      if (String(text).includes('undefined')) problemas.push(`${nome}: placeholder não substituído`);
    }

    expect(problemas).toEqual([]);
  });

  test('valor monetário sai com duas casas', () => {
    const { text } = TEMPLATES['recurring-processed']({
      description: 'Streaming', amount: '59.9', type: 'despesa', date: new Date().toISOString(),
    });
    expect(text).toContain('R$ 59.90');
  });

  test('e-mail de reset informa validade e uso único', () => {
    const { text } = TEMPLATES['password-reset']({ url: 'https://x/reset', expiresMin: 60, name: 'Renato' });

    expect(text).toContain('https://x/reset');
    expect(text).toMatch(/60 minutos/);
    expect(text).toMatch(/uma vez/i);
    // Não pode culpar o usuário nem sugerir que a conta foi comprometida.
    expect(text).toMatch(/ignore este e-mail/i);
  });

  test('nome ausente não gera saudação quebrada', () => {
    const { text } = TEMPLATES['email-verify']({ url: 'https://x' });

    expect(text).not.toContain('undefined');
    expect(text.startsWith('Olá!')).toBe(true);
  });
});
