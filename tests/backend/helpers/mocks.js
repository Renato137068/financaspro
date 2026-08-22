/**
 * mocks.js — fábricas de duplos de teste para os repositórios e libs do backend.
 *
 * Todos os repositórios são objetos literais com métodos async, então mocká-los
 * é substituir o módulo inteiro por um objeto com jest.fn(). Centralizar as
 * fábricas evita divergência entre suítes quando a interface de um repo muda.
 */
import { jest } from '@jest/globals';

/** Cria um objeto cujas chaves são jest.fn() resolvendo `undefined`. */
export function fnObject(names) {
  const out = {};
  for (const n of names) out[n] = jest.fn(async () => undefined);
  return out;
}

export const makeUserRepo = () =>
  fnObject(['findByEmail', 'findById', 'findAll', 'create', 'update', 'getConfig', 'upsertConfig']);

export const makeSessionRepo = () =>
  fnObject(['findByToken', 'create', 'revokeByUserAndToken', 'revokeAllForUser', 'rotateToken']);

export const makeAuditRepo = () => fnObject(['log', 'list']);

export const makeVerificationRepo = () =>
  fnObject(['create', 'findValid', 'consume', 'consumeForPasswordReset', 'deleteForUser']);

export const makeBillingRepo = () =>
  fnObject([
    'listPlans', 'findPlan', 'findSubscription', 'createSubscription', 'updateSubscription',
    'recordUsage', 'getUsage', 'listInvoices', 'createInvoice', 'updateInvoice',
    'findByStripeSubId', 'findByStripeCustomerId',
    'findInvoiceByStripeId', 'upsertInvoice', 'claimWebhookEvent', 'releaseWebhookEvent',
    'upsertSubscription', 'setStripeCustomerIfEmpty', 'findStripeLinkedSubscriptions',
  ]);

export const makeLogger = () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
});

/** Redis indisponível — força o caminho de fallback em memória. */
export const makeRedisOffline = () => ({
  default: { isAvailable: false, client: null },
});

export const makeQueue = () => ({
  enqueue: jest.fn(async () => ({ id: 'job-1' })),
  QUEUES: { EMAIL: 'email', RECURRING: 'recurring' },
});

/** Usuário de banco plausível; sobrescreva o que a asserção precisar. */
export function userFixture(over = {}) {
  return {
    id: 'user-1',
    name: 'Renato',
    email: 'renato@example.com',
    role: 'USER',
    active: true,
    emailVerified: false,
    totpEnabled: false,
    totpSecret: null,
    passwordSalt: '00112233445566778899aabbccddeeff',
    passwordHash: null, // preenchido por hashFor() nos testes que precisam
    ...over,
  };
}

/** Resposta mínima do Express para testar middlewares sem servidor HTTP. */
export function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    getHeader(k) { return this.headers[k]; },
    end() { return this; },
  };
  return res;
}
