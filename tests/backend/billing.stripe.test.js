/**
 * billing.stripe.test.js — caminhos com Stripe configurado.
 *
 * Complementa billing.service.test.js, que cobre o modo sem Stripe. Aqui o SDK
 * é substituído por um duplo, o que permite exercitar assinatura, checkout,
 * portal e — sobretudo — os cinco tipos de webhook.
 *
 * Webhook é o ponto do sistema onde um erro custa dinheiro de verdade: um
 * `invoice.payment_succeeded` não processado deixa o cliente pagando sem
 * acesso; um `payment_failed` ignorado deixa inadimplente com acesso liberado.
 */
import { jest } from '@jest/globals';
import { makeBillingRepo, makeLogger } from './helpers/mocks.js';

const SEG = 1_000;
const AGORA = Math.floor(Date.now() / 1000);

let BillingRepository, BillingService, stripe, enqueue;

/** Duplo do SDK do Stripe com apenas o que o serviço usa. */
function makeStripe() {
  return {
    customers: { create: jest.fn(async () => ({ id: 'cus_novo' })) },
    subscriptions: {
      create: jest.fn(async () => ({
        id: 'sub_stripe_1',
        status: 'trialing',
        current_period_start: AGORA,
        current_period_end: AGORA + 30 * 86400,
        trial_end: AGORA + 14 * 86400,
      })),
      update: jest.fn(async () => ({ id: 'sub_stripe_1', cancel_at_period_end: true })),
      retrieve: jest.fn(async () => ({
        id: 'sub_stripe_1',
        status: 'active',
        current_period_start: AGORA,
        current_period_end: AGORA + 30 * 86400,
        trial_end: null,
        cancel_at_period_end: false,
        metadata: { planTier: 'PRO' },
      })),
    },
    billingPortal: { sessions: { create: jest.fn(async () => ({ url: 'https://portal.stripe/x' })) } },
    checkout: { sessions: { create: jest.fn(async () => ({ id: 'cs_1', url: 'https://checkout.stripe/x' })) } },
    webhooks: { constructEvent: jest.fn() },
  };
}

const PRO_PLAN = {
  id: 'plan-pro', tier: 'PRO', name: 'Pro',
  stripePriceIdMonthly: 'price_m', stripePriceIdYearly: 'price_y',
};

beforeEach(async () => {
  jest.resetModules();
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';

  BillingRepository = makeBillingRepo();
  stripe = makeStripe();
  enqueue = jest.fn(async () => ({ id: 'job' }));

  jest.unstable_mockModule('../../backend/domain/repositories/billing.repository.js', () => ({ BillingRepository }));
  jest.unstable_mockModule('../../backend/lib/logger.js', makeLogger);
  jest.unstable_mockModule('../../backend/lib/queue.js', () => ({
    enqueue, QUEUES: { EMAIL: 'email', RECURRING: 'recurring' },
  }));
  // O serviço faz `import('stripe')` sob demanda e usa `mod.default`.
  jest.unstable_mockModule('stripe', () => ({ default: jest.fn(() => stripe) }));

  ({ BillingService } = await import('../../backend/domain/services/billing.service.js'));

  BillingRepository.claimWebhookEvent.mockResolvedValue(true);
  BillingRepository.findInvoiceByStripeId.mockResolvedValue(null);
  BillingRepository.upsertInvoice.mockImplementation(async (d) => d);
});

afterAll(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

/** Monta o evento que constructEvent devolveria e dispara o webhook. */
async function dispararWebhook(type, object, eventId = 'evt_test_1') {
  stripe.webhooks.constructEvent.mockReturnValue({ id: eventId, type, data: { object } });
  return BillingService.handleWebhook('{"raw":true}', 'assinatura');
}

// ─── assinatura ──────────────────────────────────────────────────────────────
describe('subscribe com Stripe configurado', () => {
  test('cria customer quando a org ainda não tem um', async () => {
    BillingRepository.findPlan.mockResolvedValue(PRO_PLAN);
    BillingRepository.findSubscription.mockResolvedValue(null);
    BillingRepository.upsertSubscription.mockImplementation(async (_o, d) => d);

    await BillingService.subscribe('org-1', 'PRO', 'monthly', 'renato@example.com');

    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: 'renato@example.com', metadata: { orgId: 'org-1' },
    });
  });

  test('reaproveita o customer existente em vez de duplicar', async () => {
    BillingRepository.findPlan.mockResolvedValue(PRO_PLAN);
    BillingRepository.findSubscription.mockResolvedValue({ id: 'sub-1', stripeCustomerId: 'cus_antigo' });
    BillingRepository.updateSubscription.mockImplementation(async (_o, d) => d);

    await BillingService.subscribe('org-1', 'PRO', 'monthly', 'renato@example.com');

    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_antigo' }),
    );
  });

  test('intervalo anual usa o price anual', async () => {
    BillingRepository.findPlan.mockResolvedValue(PRO_PLAN);
    BillingRepository.findSubscription.mockResolvedValue(null);
    BillingRepository.upsertSubscription.mockImplementation(async (_o, d) => d);

    await BillingService.subscribe('org-1', 'PRO', 'yearly', 'a@b.com');

    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ items: [{ price: 'price_y' }] }),
    );
  });

  test('assinatura nasce como TRIALING com 14 dias', async () => {
    BillingRepository.findPlan.mockResolvedValue(PRO_PLAN);
    BillingRepository.findSubscription.mockResolvedValue(null);
    BillingRepository.upsertSubscription.mockImplementation(async (_o, d) => d);

    const sub = await BillingService.subscribe('org-1', 'PRO', 'monthly', 'a@b.com');

    expect(sub.status).toBe('TRIALING');
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ trial_period_days: 14 }),
    );
    expect(sub.trialEndsAt).toBeInstanceOf(Date);
  });

  test('timestamps unix do Stripe viram Date', async () => {
    BillingRepository.findPlan.mockResolvedValue(PRO_PLAN);
    BillingRepository.findSubscription.mockResolvedValue(null);
    BillingRepository.upsertSubscription.mockImplementation(async (_o, d) => d);

    const sub = await BillingService.subscribe('org-1', 'PRO', 'monthly', 'a@b.com');

    expect(sub.currentPeriodStart.getTime()).toBe(AGORA * SEG);
    expect(sub.currentPeriodEnd.getTime()).toBe((AGORA + 30 * 86400) * SEG);
  });

  test('plano sem price configurado falha com 500 antes de cobrar', async () => {
    BillingRepository.findPlan.mockResolvedValue({ ...PRO_PLAN, stripePriceIdMonthly: null });
    BillingRepository.findSubscription.mockResolvedValue(null);

    await expect(BillingService.subscribe('org-1', 'PRO', 'monthly', 'a@b.com'))
      .rejects.toMatchObject({ status: 500 });
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });
});

// ─── cancelamento e portal ───────────────────────────────────────────────────
describe('cancel e portal com Stripe', () => {
  test('cancelamento propaga para o Stripe como fim de período', async () => {
    BillingRepository.findSubscription.mockResolvedValue({ id: 'sub-1', stripeSubId: 'sub_stripe_1' });

    await BillingService.cancel('org-1');

    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_stripe_1', { cancel_at_period_end: true });
    expect(BillingRepository.updateSubscription).toHaveBeenCalledWith('org-1', { cancelAtPeriodEnd: true });
  });

  test('portal devolve a URL da sessão', async () => {
    BillingRepository.findSubscription.mockResolvedValue({ id: 'sub-1', stripeCustomerId: 'cus_1' });

    await expect(BillingService.createPortalSession('org-1', 'http://localhost:4000/conta'))
      .resolves.toEqual({ url: 'https://portal.stripe/x' });
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_1', return_url: 'http://localhost:4000/conta',
    });
  });
});

// ─── checkout ────────────────────────────────────────────────────────────────
describe('createCheckoutSession', () => {
  beforeEach(() => {
    BillingRepository.findPlan.mockResolvedValue(PRO_PLAN);
    BillingRepository.findSubscription.mockResolvedValue(null);
  });

  test('rejeita successUrl de domínio não autorizado', async () => {
    await expect(BillingService.createCheckoutSession(
      'org-1', 'PRO', 'monthly', 'a@b.com', 'https://evil.test/ok', 'http://localhost:4000/cancel',
    )).rejects.toMatchObject({ status: 400 });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  test('devolve url e id da sessão', async () => {
    const out = await BillingService.createCheckoutSession(
      'org-1', 'PRO', 'monthly', 'a@b.com', 'http://localhost:4000/ok', 'http://localhost:4000/cancel',
    );
    expect(out).toEqual({ url: 'https://checkout.stripe/x', sessionId: 'cs_1' });
  });

  test('usa ? ou & conforme a URL de retorno já tenha querystring', async () => {
    await BillingService.createCheckoutSession(
      'org-1', 'PRO', 'monthly', 'a@b.com', 'http://localhost:4000/ok?ref=x', 'http://localhost:4000/cancel',
    );
    const [args] = stripe.checkout.sessions.create.mock.calls[0];

    expect(args.success_url).toContain('?ref=x&billing=success');
    expect(args.cancel_url).toContain('?billing=cancel');
  });

  test('propaga metadados necessários para reconciliar o webhook depois', async () => {
    await BillingService.createCheckoutSession(
      'org-1', 'PRO', 'yearly', 'a@b.com', 'http://localhost:4000/ok', 'http://localhost:4000/cancel',
    );
    const [args] = stripe.checkout.sessions.create.mock.calls[0];

    expect(args.metadata).toEqual({ orgId: 'org-1', planTier: 'PRO', interval: 'yearly' });
    expect(args.subscription_data.metadata).toEqual({ orgId: 'org-1', planTier: 'PRO' });
    expect(args.line_items).toEqual([{ price: 'price_y', quantity: 1 }]);
  });

  test('grava o customer recém-criado na assinatura existente', async () => {
    BillingRepository.findSubscription.mockResolvedValue({ id: 'sub-1', stripeCustomerId: null });
    BillingRepository.setStripeCustomerIfEmpty.mockResolvedValue(true);

    await BillingService.createCheckoutSession(
      'org-1', 'PRO', 'monthly', 'a@b.com', 'http://localhost:4000/ok', 'http://localhost:4000/cancel',
    );

    expect(BillingRepository.setStripeCustomerIfEmpty).toHaveBeenCalledWith('org-1', 'cus_novo');
  });
});

// ─── webhooks ────────────────────────────────────────────────────────────────
describe('handleWebhook — verificação de assinatura', () => {
  test('assinatura inválida devolve 400 e nada é processado', async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => { throw new Error('bad sig'); });

    await expect(BillingService.handleWebhook('{}', 'falsa')).rejects.toMatchObject({ status: 400 });
    expect(BillingRepository.updateSubscription).not.toHaveBeenCalled();
  });

  test('evento desconhecido é aceito sem efeito colateral', async () => {
    const out = await dispararWebhook('customer.created', { id: 'cus_1' });

    expect(out).toEqual({ received: true });
    expect(BillingRepository.updateSubscription).not.toHaveBeenCalled();
    expect(BillingRepository.upsertInvoice).not.toHaveBeenCalled();
  });

  test('evento duplicado (mesmo event.id) é ignorado', async () => {
    BillingRepository.claimWebhookEvent.mockResolvedValue(false);

    const out = await dispararWebhook('invoice.payment_succeeded', { id: 'in_1', subscription: 'sub_x' }, 'evt_dup');

    expect(out).toEqual({ received: true, duplicate: true });
    expect(BillingRepository.upsertInvoice).not.toHaveBeenCalled();
  });

  test('libera claim quando o handler falha (permite retry Stripe)', async () => {
    BillingRepository.findByStripeSubId.mockRejectedValue(new Error('db down'));

    await expect(dispararWebhook('invoice.payment_succeeded', {
      id: 'in_1', subscription: 'sub_stripe_1', amount_paid: 100,
      status_transitions: { paid_at: AGORA },
    })).rejects.toThrow('db down');

    expect(BillingRepository.releaseWebhookEvent).toHaveBeenCalledWith('evt_test_1');
  });
});

describe('webhook — invoice.payment_succeeded', () => {
  const invoice = {
    id: 'in_1',
    subscription: 'sub_stripe_1',
    amount_paid: 4990,
    customer_email: 'renato@example.com',
    status_transitions: { paid_at: AGORA },
    hosted_invoice_url: 'https://inv/x',
    invoice_pdf: 'https://inv/x.pdf',
    next_payment_attempt: AGORA + 30 * 86400,
  };

  beforeEach(() => {
    BillingRepository.findByStripeSubId.mockResolvedValue({
      id: 'sub-1', orgId: 'org-1', plan: { name: 'Pro' },
    });
  });

  test('converte centavos para a moeda corrente', async () => {
    await dispararWebhook('invoice.payment_succeeded', invoice);
    const [args] = BillingRepository.upsertInvoice.mock.calls[0];

    expect(args.amount).toBe(49.9);
    expect(args.status).toBe('paid');
    expect(args.stripeInvoiceId).toBe('in_1');
  });

  test('reativa a assinatura', async () => {
    await dispararWebhook('invoice.payment_succeeded', invoice);
    expect(BillingRepository.updateSubscription).toHaveBeenCalledWith('org-1', { status: 'ACTIVE' });
  });

  test('enfileira e-mail de ativação', async () => {
    await dispararWebhook('invoice.payment_succeeded', invoice);
    expect(enqueue).toHaveBeenCalledWith('email', 'subscription-activated',
      expect.objectContaining({ to: 'renato@example.com' }));
  });

  test('assinatura desconhecida é ignorada em silêncio', async () => {
    // Acontece de verdade: webhook de outro ambiente apontando para a mesma
    // conta Stripe. Ignorar é correto — criar fatura órfã, não.
    BillingRepository.findByStripeSubId.mockResolvedValue(null);

    await expect(dispararWebhook('invoice.payment_succeeded', invoice)).resolves.toEqual({ received: true });
    expect(BillingRepository.upsertInvoice).not.toHaveBeenCalled();
  });

  test('fatura já existente não dispara efeitos colaterais', async () => {
    BillingRepository.findInvoiceByStripeId.mockResolvedValue({ id: 'inv-1', stripeInvoiceId: 'in_1' });

    await dispararWebhook('invoice.payment_succeeded', invoice);

    expect(BillingRepository.upsertInvoice).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('webhook — invoice.payment_failed', () => {
  test('marca PAST_DUE e avisa o cliente', async () => {
    BillingRepository.findByStripeSubId.mockResolvedValue({ id: 'sub-1', orgId: 'org-1', plan: { name: 'Pro' } });

    await dispararWebhook('invoice.payment_failed', {
      subscription: 'sub_stripe_1', customer_email: 'renato@example.com',
    });

    expect(BillingRepository.updateSubscription).toHaveBeenCalledWith('org-1', { status: 'PAST_DUE' });
    expect(enqueue).toHaveBeenCalledWith('email', 'payment-failed', expect.any(Object));
  });

  test('não cria fatura em pagamento falho', async () => {
    BillingRepository.findByStripeSubId.mockResolvedValue({ id: 'sub-1', orgId: 'org-1', plan: {} });

    await dispararWebhook('invoice.payment_failed', { subscription: 'sub_stripe_1' });

    expect(BillingRepository.createInvoice).not.toHaveBeenCalled();
  });
});

describe('webhook — customer.subscription.deleted', () => {
  test('marca CANCELED e informa até quando o acesso vale', async () => {
    BillingRepository.findByStripeSubId.mockResolvedValue({ id: 'sub-1', orgId: 'org-1', plan: { name: 'Pro' } });

    await dispararWebhook('customer.subscription.deleted', {
      id: 'sub_stripe_1', customer_email: 'renato@example.com',
      current_period_end: AGORA + 5 * 86400,
    });

    expect(BillingRepository.updateSubscription).toHaveBeenCalledWith('org-1', { status: 'CANCELED' });
    const [, , payload] = enqueue.mock.calls[0];
    expect(payload.data.accessUntil).toBeInstanceOf(Date);
  });
});

describe('webhook — customer.subscription.updated', () => {
  test('espelha status e período do Stripe', async () => {
    BillingRepository.findByStripeSubId.mockResolvedValue({ id: 'sub-1', orgId: 'org-1', plan: {} });

    await dispararWebhook('customer.subscription.updated', {
      id: 'sub_stripe_1', status: 'past_due',
      current_period_start: AGORA, current_period_end: AGORA + 30 * 86400,
      cancel_at_period_end: true,
    });

    const [orgId, data] = BillingRepository.updateSubscription.mock.calls[0];
    expect(orgId).toBe('org-1');
    expect(data.status).toBe('PAST_DUE');            // normalizado para maiúsculas
    expect(data.cancelAtPeriodEnd).toBe(true);
    expect(data.currentPeriodEnd.getTime()).toBe((AGORA + 30 * 86400) * SEG);
  });

  test('assinatura não encontrada não gera escrita', async () => {
    BillingRepository.findByStripeSubId.mockResolvedValue(null);

    await dispararWebhook('customer.subscription.updated', { id: 'x', status: 'active' });

    expect(BillingRepository.updateSubscription).not.toHaveBeenCalled();
  });
});

describe('webhook — checkout.session.completed', () => {
  const session = {
    subscription: 'sub_stripe_1',
    customer: 'cus_1',
    metadata: { orgId: 'org-1', planTier: 'PRO', interval: 'yearly' },
  };

  test('cria a assinatura quando a org ainda não tem', async () => {
    BillingRepository.findPlan.mockResolvedValue(PRO_PLAN);
    BillingRepository.findSubscription.mockResolvedValue(null);

    await dispararWebhook('checkout.session.completed', session);

    const [orgId, data] = BillingRepository.upsertSubscription.mock.calls[0];
    expect(orgId).toBe('org-1');
    expect(data).toMatchObject({
      planId: 'plan-pro', status: 'ACTIVE',
      billingInterval: 'yearly', stripeCustomerId: 'cus_1', stripeSubId: 'sub_stripe_1',
    });
  });

  test('atualiza quando já existe — evita assinatura duplicada', async () => {
    BillingRepository.findPlan.mockResolvedValue(PRO_PLAN);
    BillingRepository.findSubscription.mockResolvedValue({ id: 'sub-1' });

    await dispararWebhook('checkout.session.completed', session);

    expect(BillingRepository.upsertSubscription).toHaveBeenCalled();
    expect(BillingRepository.createSubscription).not.toHaveBeenCalled();
  });

  test('sessão sem orgId é ignorada', async () => {
    await dispararWebhook('checkout.session.completed', { subscription: 'sub_1', metadata: {} });

    expect(BillingRepository.createSubscription).not.toHaveBeenCalled();
    expect(BillingRepository.updateSubscription).not.toHaveBeenCalled();
  });

  test('sessão sem subscription é ignorada (checkout de pagamento único)', async () => {
    await dispararWebhook('checkout.session.completed', { metadata: { orgId: 'org-1' } });

    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  test('plano inexistente aborta antes de gravar', async () => {
    BillingRepository.findPlan.mockResolvedValue(null);

    await dispararWebhook('checkout.session.completed', session);

    expect(BillingRepository.createSubscription).not.toHaveBeenCalled();
  });

  test('cai para o planTier dos metadados da assinatura quando a sessão não traz', async () => {
    BillingRepository.findPlan.mockResolvedValue(PRO_PLAN);
    BillingRepository.findSubscription.mockResolvedValue(null);

    await dispararWebhook('checkout.session.completed', {
      subscription: 'sub_stripe_1', customer: 'cus_1', metadata: { orgId: 'org-1' },
    });

    expect(BillingRepository.findPlan).toHaveBeenCalledWith('PRO');
  });
});

/**
 * A corrida do stripeCustomerId.
 *
 * Duas requisições simultâneas da mesma org criam DOIS customers no Stripe. O
 * `setStripeCustomerIfEmpty` é um write condicional: quem chega depois recebe
 * false e precisa reler o id que o primeiro gravou. Sem isso, a org fica
 * apontando para um customer órfão — e a cobrança sai na fatura errada, um
 * erro que só aparece no extrato do cliente.
 */
describe('subscribe — corrida ao gravar o stripeCustomerId', () => {
  test('perdedor da corrida adota o customer que o vencedor gravou', async () => {
    BillingRepository.findPlan.mockResolvedValue(PRO_PLAN);
    BillingRepository.findSubscription
      .mockResolvedValueOnce({ id: 'sub-1', orgId: 'org-1', stripeCustomerId: null })
      .mockResolvedValueOnce({ id: 'sub-1', orgId: 'org-1', stripeCustomerId: 'cus_do_vencedor' });
    BillingRepository.setStripeCustomerIfEmpty.mockResolvedValue(false);
    BillingRepository.upsertSubscription.mockImplementation(async (_o, d) => d);

    await BillingService.subscribe('org-1', 'PRO', 'monthly', 'renato@example.com');

    expect(BillingRepository.findSubscription).toHaveBeenCalledTimes(2);
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_do_vencedor' }),
    );
  });

  test('vencedor da corrida segue com o customer que acabou de criar', async () => {
    BillingRepository.findPlan.mockResolvedValue(PRO_PLAN);
    BillingRepository.findSubscription.mockResolvedValue({
      id: 'sub-1', orgId: 'org-1', stripeCustomerId: null,
    });
    BillingRepository.setStripeCustomerIfEmpty.mockResolvedValue(true);
    BillingRepository.upsertSubscription.mockImplementation(async (_o, d) => d);

    await BillingService.subscribe('org-1', 'PRO', 'monthly', 'renato@example.com');

    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_novo' }),
    );
  });
});

describe('reconcileSubscription', () => {
  test('sem stripeSubId a org é pulada, sem chamar o Stripe', async () => {
    BillingRepository.findSubscription.mockResolvedValue({ orgId: 'org-1', stripeSubId: null });

    const out = await BillingService.reconcileSubscription('org-1');

    expect(out).toEqual({ orgId: 'org-1', skipped: true });
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  test('traz status e período do Stripe para o banco', async () => {
    BillingRepository.findSubscription.mockResolvedValue({
      orgId: 'org-1', stripeSubId: 'sub_stripe_1',
    });

    const out = await BillingService.reconcileSubscription('org-1');

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_stripe_1');
    const [orgId, dados] = BillingRepository.updateSubscription.mock.calls[0];
    expect(orgId).toBe('org-1');
    // O Stripe manda o status em minúsculas e o banco guarda em maiúsculas —
    // sem a normalização, toda assinatura reconciliada vira status inválido.
    expect(dados.status).toBe('ACTIVE');
    expect(dados.currentPeriodStart).toBeInstanceOf(Date);
    expect(dados.cancelAtPeriodEnd).toBe(false);
    expect(out.status).toBe('active');
  });
});

