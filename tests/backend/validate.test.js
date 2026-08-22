/**
 * validate.test.js — schemas Zod e middlewares de validação.
 *
 * Estes schemas são a fronteira entre a internet e o banco: o que passa aqui
 * chega ao Prisma. Cada caso cobre uma entrada que um cliente hostil enviaria.
 */
import { jest } from '@jest/globals';
import {
  validateBody, validateQuery, validateParams, paginationSchema,
  registerSchema, loginSchema, transactionSchema,
  accountSchema, budgetSchema, recurringSchema,
  idParamSchema, orgIdParamSchema, orgMemberParamSchema, tokenParamSchema,
} from '../../backend/middleware/validate.js';
import { mockRes } from './helpers/mocks.js';

/** Roda um middleware de validação e devolve o resultado observável. */
function run(mw, req) {
  const res = mockRes();
  const next = jest.fn();
  mw(req, res, next);
  return { res, next, passed: next.mock.calls.length === 1 };
}

describe('validateBody', () => {
  test('422 com detalhamento por campo quando o corpo é inválido', () => {
    const { res, passed } = run(validateBody(registerSchema), {
      body: { name: '', email: 'nao-e-email', password: 'curta' },
    });

    expect(passed).toBe(false);
    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe('Dados inválidos');
    expect(Object.keys(res.body.fields)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  test('substitui req.body pelos dados já normalizados', () => {
    const req = { body: { name: '  Renato  ', email: '  RENATO@EXAMPLE.COM ', password: 'senha123!' } };
    const { passed } = run(validateBody(registerSchema), req);

    expect(passed).toBe(true);
    expect(req.body.name).toBe('Renato');       // trim aplicado
    expect(req.body.email).toBe('renato@example.com'); // lowercase aplicado
  });

  test('corpo ausente é rejeitado, não tratado como vazio', () => {
    const { res } = run(validateBody(registerSchema), { body: undefined });
    expect(res.statusCode).toBe(422);
  });
});

describe('validateQuery — paginationSchema', () => {
  test('aplica defaults quando a query vem vazia', () => {
    const req = { query: {} };
    run(validateQuery(paginationSchema), req);
    expect(req.query).toEqual({ limit: 50, offset: 0 });
  });

  test('coage strings da querystring para número', () => {
    const req = { query: { limit: '10', offset: '20' } };
    run(validateQuery(paginationSchema), req);
    expect(req.query).toEqual({ limit: 10, offset: 20 });
  });

  test('limite acima do teto é rejeitado (evita varredura da tabela)', () => {
    const { res } = run(validateQuery(paginationSchema), { query: { limit: '100000' } });
    expect(res.statusCode).toBe(422);
  });

  test('offset negativo é rejeitado', () => {
    const { res } = run(validateQuery(paginationSchema), { query: { offset: '-5' } });
    expect(res.statusCode).toBe(422);
  });
});

describe('validateParams', () => {
  const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  test('aceita UUID válido e segue adiante', () => {
    const req = { params: { id: UUID } };
    const { passed, res } = run(validateParams(idParamSchema), req);

    expect(passed).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(req.params.id).toBe(UUID);
  });

  test('400 para id não-UUID — não deixa o erro virar 500 do Prisma', () => {
    const { res, passed } = run(validateParams(idParamSchema), { params: { id: '../../etc/passwd' } });

    expect(passed).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Identificador inválido na URL');
    expect(res.body.fields.id).toBeDefined();
  });

  test.each([
    ['numérico', '12345'],
    ['uuid truncado', '3f2504e0-4f89-41d3-9a0c'],
    ['string vazia', ''],
    ['injeção SQL', "1' OR '1'='1"],
  ])('rejeita id %s', (_label, id) => {
    const { res } = run(validateParams(idParamSchema), { params: { id } });
    expect(res.statusCode).toBe(400);
  });

  test('preserva a identidade de req.params (Express reusa o objeto)', () => {
    const params = { id: UUID };
    const req = { params };
    run(validateParams(idParamSchema), req);

    expect(req.params).toBe(params);
  });

  test('orgMemberParamSchema exige os dois identificadores', () => {
    expect(run(validateParams(orgMemberParamSchema), { params: { orgId: UUID, userId: UUID } }).passed).toBe(true);
    expect(run(validateParams(orgMemberParamSchema), { params: { orgId: UUID, userId: 'abc' } }).passed).toBe(false);
    expect(run(validateParams(orgMemberParamSchema), { params: { orgId: 'abc', userId: UUID } }).passed).toBe(false);
  });

  test('orgIdParamSchema valida orgId', () => {
    expect(run(validateParams(orgIdParamSchema), { params: { orgId: UUID } }).passed).toBe(true);
    expect(run(validateParams(orgIdParamSchema), { params: { orgId: 'minha-org' } }).passed).toBe(false);
  });

  test('tokenParamSchema aceita hex de 64 e rejeita o resto', () => {
    const hex = 'a'.repeat(64);
    expect(run(validateParams(tokenParamSchema), { params: { token: hex } }).passed).toBe(true);
    expect(run(validateParams(tokenParamSchema), { params: { token: 'a'.repeat(63) } }).passed).toBe(false);
    expect(run(validateParams(tokenParamSchema), { params: { token: 'z'.repeat(64) } }).passed).toBe(false);
    expect(run(validateParams(tokenParamSchema), { params: { token: '' } }).passed).toBe(false);
  });
});

describe('registerSchema', () => {
  test('exige senha com número ou caractere especial', () => {
    expect(registerSchema.safeParse({ name: 'A', email: 'a@b.com', password: 'apenasletras' }).success).toBe(false);
    expect(registerSchema.safeParse({ name: 'A', email: 'a@b.com', password: 'comnumero1' }).success).toBe(true);
    expect(registerSchema.safeParse({ name: 'A', email: 'a@b.com', password: 'comespecial!' }).success).toBe(true);
  });

  test('exige no mínimo 8 caracteres', () => {
    expect(registerSchema.safeParse({ name: 'A', email: 'a@b.com', password: 'curta1!' }).success).toBe(false);
  });

  test('rejeita senha absurdamente longa (proteção contra DoS de hashing)', () => {
    const enorme = 'a1'.repeat(200);
    expect(registerSchema.safeParse({ name: 'A', email: 'a@b.com', password: enorme }).success).toBe(false);
  });

  test('rejeita nome vazio após trim', () => {
    expect(registerSchema.safeParse({ name: '   ', email: 'a@b.com', password: 'senha123!' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  test('normaliza o e-mail para minúsculas', () => {
    const out = loginSchema.safeParse({ email: 'A@B.COM', password: 'x' });
    expect(out.success).toBe(true);
    expect(out.data.email).toBe('a@b.com');
  });

  test('não impõe política de senha no login (só no cadastro)', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'a' }).success).toBe(true);
  });
});

describe('transactionSchema', () => {
  const base = {
    type: 'despesa', amount: 25.5, description: 'Café',
    category: 'alimentacao', date: '2026-08-09T12:00:00.000Z',
  };

  test('aceita transação bem formada e aplica defaults', () => {
    const out = transactionSchema.safeParse(base);
    expect(out.success).toBe(true);
    expect(out.data.tags).toEqual([]);
    expect(out.data.recurring).toBe(false);
  });

  test('rejeita valor zero ou negativo', () => {
    expect(transactionSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...base, amount: -10 }).success).toBe(false);
  });

  test('rejeita tipo fora do domínio', () => {
    expect(transactionSchema.safeParse({ ...base, type: 'investimento' }).success).toBe(false);
  });

  test('aceita transferencia com accountId e targetAccountId UUID', () => {
    const UUID_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    const UUID_B = '9c858901-8a57-4791-81fe-4c455b099bc9';
    const out = transactionSchema.safeParse({
      ...base,
      type: 'transferencia',
      category: 'transferencia',
      accountId: UUID_A,
      targetAccountId: UUID_B,
    });
    expect(out.success).toBe(true);
  });

  test('transferencia sem targetAccountId é rejeitada', () => {
    const UUID_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect(transactionSchema.safeParse({
      ...base,
      type: 'transferencia',
      category: 'transferencia',
      accountId: UUID_A,
    }).success).toBe(false);
  });

  test('exige data ISO 8601', () => {
    expect(transactionSchema.safeParse({ ...base, date: '09/08/2026' }).success).toBe(false);
  });

  test('accountId precisa ser UUID quando informado', () => {
    expect(transactionSchema.safeParse({ ...base, accountId: 'abc' }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...base, accountId: null }).success).toBe(true);
  });

  test('limita a quantidade de tags', () => {
    const tags = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(transactionSchema.safeParse({ ...base, tags }).success).toBe(false);
  });

  test('trunca descrição acima do limite via rejeição', () => {
    expect(transactionSchema.safeParse({ ...base, description: 'x'.repeat(256) }).success).toBe(false);
  });
});

describe('accountSchema', () => {
  test('aceita conta válida com defaults de moeda e saldo', () => {
    const out = accountSchema.safeParse({ name: 'Nubank', type: 'checking' });
    expect(out.success).toBe(true);
    expect(out.data.currency).toBe('BRL');
    expect(out.data.balance).toBe(0);
  });

  test('rejeita tipo desconhecido', () => {
    expect(accountSchema.safeParse({ name: 'X', type: 'cripto' }).success).toBe(false);
  });

  test('moeda precisa ter exatamente 3 letras', () => {
    expect(accountSchema.safeParse({ name: 'X', type: 'checking', currency: 'REAL' }).success).toBe(false);
  });

  test('saldo negativo é permitido (cartão de crédito)', () => {
    expect(accountSchema.safeParse({ name: 'Cartão', type: 'credit', balance: -1200 }).success).toBe(true);
  });
});

describe('budgetSchema', () => {
  test('exige limite positivo', () => {
    expect(budgetSchema.safeParse({ category: 'alimentacao', limit: 0 }).success).toBe(false);
    expect(budgetSchema.safeParse({ category: 'alimentacao', limit: 800 }).success).toBe(true);
  });

  test('período padrão é mensal', () => {
    const out = budgetSchema.safeParse({ category: 'alimentacao', limit: 800 });
    expect(out.data.period).toBe('monthly');
  });
});

describe('recurringSchema', () => {
  const base = {
    type: 'despesa', amount: 59.9, description: 'Streaming',
    frequency: 'monthly',
    startDate: '2026-08-01T00:00:00.000Z',
    nextDue: '2026-09-01T00:00:00.000Z',
  };

  test('aceita recorrência válida', () => {
    expect(recurringSchema.safeParse(base).success).toBe(true);
  });

  test('rejeita frequência desconhecida', () => {
    expect(recurringSchema.safeParse({ ...base, frequency: 'quinzenal' }).success).toBe(false);
  });

  test('endDate é opcional e aceita null', () => {
    expect(recurringSchema.safeParse({ ...base, endDate: null }).success).toBe(true);
  });
});
