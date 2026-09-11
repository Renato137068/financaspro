/**
 * billing.service.test.js — assinaturas, checkout e webhooks sem Stripe real.
 *
 * O serviço carrega o SDK do Stripe sob demanda (import dinâmico) e só quando
 * CONFIG.stripe.secretKey existe. Sem a chave — cenário do setup-backend.js —
 * os caminhos de erro 503 e o fluxo FREE local ficam totalmente testáveis.
 */
import { jest } from '@jest/globals';
import { makeBillingRepo, makeLogger, makeQueue } from './helpers/mocks.js';

let BillingRepository, BillingService;

beforeEach(async () => {
  jest.resetModules();
  BillingRepository = makeBillingRepo();

  jest.unstable_mockModule('../../backend/domain/repositories/billing.repository.js', () => ({ BillingRepository }));
  jest.unstable_mockModule('../../backend/lib/logger.js', makeLogger);
  jest.unstable_mockModule('../../backend/lib/queue.js', makeQueue);

  ({ BillingService } = await import('../../backend/domain/services/billing.service.js'));
});

const FREE_PLAN = { id: 'plan-free', tier: 'FREE', name: 'Free' };
const PRO_PLAN = {
  id: 'plan-pro', tier: 'PRO', name: 'Pro',
  stripePriceIdMonthly: 'price_m', stripePriceIdYearly: 'price_y',
};

describe('BillingService.listPlans', () => {
  test('delega ao repositório', async () => {
    BillingRepository.listPlans.mockResolvedValue([FREE_PLAN, PRO_PLAN]);
    await expect(BillingService.listPlans()).resolves.toHaveLength(2);
  });
});

describe('BillingService.getSubscription', () => {
  test('devolve a assinatura existente', async () => {
    BillingRepository.findSubscription.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE' });
    await expect(BillingService.getSubscription('org-1')).resolves.toMatchObject({ id: 'sub-1' });
  });

  test('404 quando a organização não tem assinatura', async () => {
    BillingRepository.findSubscription.mockResolvedValue(null);
    await expect(BillingService.getSubscription('org-1')).rejects.toMatchObject({ status: 404 });
  });
});

describe('BillingService.subscribe', () => {
  test('404 para plano inexistente', async () => {
    BillingRepository.findPlan.mockResolvedValue(null);
    await expect(BillingService.subscribe('org-1', 'GOLD')).rejects.toMatchObject({ status: 404 });
  });

  test('plano pago sem Stripe configurado devolve 503', async () => {
    BillingRepository.findPlan.mockResolvedValue(PRO_PLAN);
    BillingRepository.findSubscription.mockResolvedValue(null);

    await expect(BillingService.subscribe('org-1', 'PRO')).rejects.toMatchObject({ status: 503 });
    expect(BillingRepository.createSubscription).not.toHaveBeenCalled();
  });

  test('plano FREE cria assinatura local ativa por um ano', async () => {
    BillingRepository.findPlan.mockResolvedValue(FREE_PLAN);
    BillingRepository.findSubscription.mockResolvedValue(null);
    BillingRepository.upsertSubscription.mockImplementation(async (orgId, data) => ({
      id: 'sub-new', orgId, ...data,
    }));

    const sub = await BillingService.subscribe('org-1', 'FREE');

    expect(sub).toMatchObject({ orgId: 'org-1', planId: 'plan-free', status: 'ACTIVE' });
    const [orgId, data] = BillingRepository.upsertSubscription.mock.calls[0];
    expect(orgId).toBe('org-1');
    const meses = (data.currentPeriodEnd - data.currentPeriodStart) / (1000 * 60 * 60 * 24);
    expect(meses).toBeGreaterThan(360);
  });

  test('plano FREE em org já assinante atualiza em vez de duplicar', async () => {
    BillingRepository.findPlan.mockResolvedValue(FREE_PLAN);
    BillingRepository.findSubscription.mockResolvedValue({ id: 'sub-1' });
    BillingRepository.updateSubscription.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE' });

    await BillingService.subscribe('org-1', 'FREE');

    expect(BillingRepository.updateSubscription).toHaveBeenCalledWith('org-1', expect.any(Object));
    expect(BillingRepository.createSubscription).not.toHaveBeenCalled();
  });
});

describe('BillingService.cancel', () => {
  test('404 sem assinatura', async () => {
    BillingRepository.findSubscription.mockResolvedValue(null);
    await expect(BillingService.cancel('org-1')).rejects.toMatchObject({ status: 404 });
  });

  test('marca cancelamento ao fim do período (não corta acesso na hora)', async () => {
    BillingRepository.findSubscription.mockResolvedValue({ id: 'sub-1', stripeSubId: null });
    BillingRepository.updateSubscription.mockResolvedValue({ id: 'sub-1', cancelAtPeriodEnd: true });

    await BillingService.cancel('org-1');

    expect(BillingRepository.updateSubscription).toHaveBeenCalledWith('org-1', { cancelAtPeriodEnd: true });
  });
});

describe('BillingService.resume', () => {
  test('404 sem assinatura', async () => {
    BillingRepository.findSubscription.mockResolvedValue(null);
    await expect(BillingService.resume('org-1')).rejects.toMatchObject({ status: 404 });
  });

  test('assinatura que não estava cancelando volta como está, sem escrever', async () => {
    const sub = { id: 'sub-1', cancelAtPeriodEnd: false };
    BillingRepository.findSubscription.mockResolvedValue(sub);

    await expect(BillingService.resume('org-1')).resolves.toBe(sub);
    expect(BillingRepository.updateSubscription).not.toHaveBeenCalled();
  });

  test('assinatura do Play manda reativar na loja (400)', async () => {
    BillingRepository.findSubscription.mockResolvedValue({
      id: 'sub-1', cancelAtPeriodEnd: true, stripeSubId: 'play:token-x',
    });

    await expect(BillingService.resume('org-1')).rejects.toMatchObject({ status: 400 });
    expect(BillingRepository.updateSubscription).not.toHaveBeenCalled();
  });

  test('reativa a renovação (desfaz cancelAtPeriodEnd) sem Stripe configurado', async () => {
    BillingRepository.findSubscription.mockResolvedValue({
      id: 'sub-1', cancelAtPeriodEnd: true, stripeSubId: null,
    });
    BillingRepository.updateSubscription.mockResolvedValue({ id: 'sub-1', cancelAtPeriodEnd: false });

    await BillingService.resume('org-1');

    expect(BillingRepository.updateSubscription).toHaveBeenCalledWith('org-1', { cancelAtPeriodEnd: false });
  });
});

describe('BillingService.createPortalSession', () => {
  test('400 quando a org não tem customer Stripe', async () => {
    BillingRepository.findSubscription.mockResolvedValue({ id: 'sub-1', stripeCustomerId: null });
    await expect(BillingService.createPortalSession('org-1', 'http://localhost:4000/conta'))
      .rejects.toMatchObject({ status: 400 });
  });

  test('503 quando há customer mas Stripe não está configurado', async () => {
    BillingRepository.findSubscription.mockResolvedValue({ id: 'sub-1', stripeCustomerId: 'cus_1' });
    await expect(BillingService.createPortalSession('org-1', 'http://localhost:4000/conta'))
      .rejects.toMatchObject({ status: 503 });
  });
});

describe('BillingService.createCheckoutSession', () => {
  test('400 para plano FREE (não existe checkout de plano gratuito)', async () => {
    BillingRepository.findPlan.mockResolvedValue(FREE_PLAN);
    await expect(
      BillingService.createCheckoutSession('org-1', 'FREE', 'monthly', 'a@b.com', 'http://localhost:4000/s', 'http://localhost:4000/c'),
    ).rejects.toMatchObject({ status: 400 });
  });

  test('400 para plano inexistente', async () => {
    BillingRepository.findPlan.mockResolvedValue(null);
    await expect(
      BillingService.createCheckoutSession('org-1', 'PRO', 'monthly', 'a@b.com', 'http://localhost:4000/s', 'http://localhost:4000/c'),
    ).rejects.toMatchObject({ status: 400 });
  });

  test('503 sem Stripe configurado', async () => {
    BillingRepository.findPlan.mockResolvedValue(PRO_PLAN);
    await expect(
      BillingService.createCheckoutSession('org-1', 'PRO', 'monthly', 'a@b.com', 'http://localhost:4000/s', 'http://localhost:4000/c'),
    ).rejects.toMatchObject({ status: 503 });
  });
});

describe('BillingService.listInvoices', () => {
  test('devolve lista vazia quando não há assinatura', async () => {
    BillingRepository.findSubscription.mockResolvedValue(null);
    await expect(BillingService.listInvoices('org-1')).resolves.toEqual([]);
    expect(BillingRepository.listInvoices).not.toHaveBeenCalled();
  });

  test('busca faturas pela assinatura encontrada', async () => {
    BillingRepository.findSubscription.mockResolvedValue({ id: 'sub-7' });
    BillingRepository.listInvoices.mockResolvedValue([{ id: 'inv-1' }]);

    await expect(BillingService.listInvoices('org-1')).resolves.toHaveLength(1);
    expect(BillingRepository.listInvoices).toHaveBeenCalledWith('sub-7');
  });
});

describe('BillingService.handleWebhook', () => {
  test('503 sem Stripe configurado — nunca confia em payload não verificado', async () => {
    await expect(BillingService.handleWebhook('{}', 'sig')).rejects.toMatchObject({ status: 503 });
  });
});

describe('BillingService.reconcileAll', () => {
  test('registra erro por org quando Stripe indisponível', async () => {
    BillingRepository.findStripeLinkedSubscriptions.mockResolvedValue([{ orgId: 'org-1' }]);
    BillingRepository.findSubscription.mockResolvedValue({ orgId: 'org-1', stripeSubId: 'sub_x' });

    const out = await BillingService.reconcileAll();

    expect(out.results[0]).toMatchObject({ orgId: 'org-1', error: expect.any(String) });
    expect(out.reconciled).toBe(0);
  });
});
