/**
 * play-billing.service.test.js — entitlement Google Play (sandbox).
 */
import { jest } from '@jest/globals';
import { createPrismaFake } from '../../scripts/lib/prisma-fake.mjs';

const prisma = createPrismaFake();
jest.unstable_mockModule('../../backend/lib/db.js', () => ({ default: prisma }));

// Mock da Google Play Developer API — controlável por teste.
const getSubscriptionV2 = jest.fn();
jest.unstable_mockModule('../../backend/lib/google-play-api.js', () => ({
  getSubscriptionV2,
  isEntitledState: () => true,
}));

const { PlayBillingService } = await import('../../backend/domain/services/play-billing.service.js');
const { BillingRepository } = await import('../../backend/domain/repositories/billing.repository.js');
const { default: CONFIG } = await import('../../backend/config.js');

const ORG = 'org-play-1';
const TOKEN = 'GPA.test.' + 'a'.repeat(40);

beforeEach(async () => {
  prisma.__reset();
  await prisma.plan.create({
    data: { id: 'plan-pro', tier: 'PRO', name: 'Pro', priceMonthly: 16.9, priceYearly: 169, active: true },
  });
  await prisma.organization.create({
    data: { id: ORG, name: 'Org Test', slug: 'org-test', ownerId: 'user-1' },
  });
});

describe('PlayBillingService.verifyPurchase', () => {
  test('aceita token sandbox e grava entitlement', async () => {
    const out = await PlayBillingService.verifyPurchase(ORG, {
      productId: 'financaspro.pro.monthly',
      purchaseToken: TOKEN,
    });
    expect(out.tier).toBe('PRO');
    const ent = await BillingRepository.findPlayEntitlement(ORG);
    expect(ent).toBeTruthy();
    expect(ent.source).toBe('google_play');
  });

  describe('verificação real (Google Play Developer API)', () => {
    const REAL_TOKEN = 'x'.repeat(60);
    let saOriginal;

    beforeEach(async () => {
      getSubscriptionV2.mockReset();
      saOriginal = CONFIG.playBilling.serviceAccountJson;
      CONFIG.playBilling.serviceAccountJson = '{"client_email":"x@y.iam","private_key":"k"}';
      await prisma.plan.create({
        data: { id: 'plan-biz', tier: 'BUSINESS', name: 'Business', priceMonthly: 39, priceYearly: 390, active: true },
      });
    });

    afterEach(() => {
      CONFIG.playBilling.serviceAccountJson = saOriginal;
    });

    test('usa validade e produto reais retornados pelo Google', async () => {
      const expiry = new Date(Date.now() + 400 * 86400000).toISOString();
      getSubscriptionV2.mockResolvedValue({
        state: 'SUBSCRIPTION_STATE_ACTIVE',
        productId: 'financaspro.pro.yearly',
        expiryTime: expiry,
        entitled: true,
      });
      const out = await PlayBillingService.verifyPurchase(ORG, {
        productId: 'financaspro.pro.yearly',
        purchaseToken: REAL_TOKEN,
      });
      expect(getSubscriptionV2).toHaveBeenCalledTimes(1);
      expect(out.tier).toBe('PRO');
      expect(out.expiresAt).toBe(expiry);
    });

    test('rejeita assinatura não ativa (402)', async () => {
      getSubscriptionV2.mockResolvedValue({
        state: 'SUBSCRIPTION_STATE_EXPIRED',
        productId: 'financaspro.pro.monthly',
        expiryTime: null,
        entitled: false,
      });
      await expect(PlayBillingService.verifyPurchase(ORG, {
        productId: 'financaspro.pro.monthly',
        purchaseToken: REAL_TOKEN,
      })).rejects.toMatchObject({ status: 402 });
    });

    test('deriva o tier do produto verificado, não do que o cliente pediu', async () => {
      // Cliente afirma PRO, mas o Google confirma BUSINESS.
      getSubscriptionV2.mockResolvedValue({
        state: 'SUBSCRIPTION_STATE_ACTIVE',
        productId: 'financaspro.business.monthly',
        expiryTime: new Date(Date.now() + 30 * 86400000).toISOString(),
        entitled: true,
      });
      const out = await PlayBillingService.verifyPurchase(ORG, {
        productId: 'financaspro.pro.monthly',
        purchaseToken: REAL_TOKEN,
      });
      expect(out.tier).toBe('BUSINESS');
      expect(out.productId).toBe('financaspro.business.monthly');
    });
  });

  test('rejeita token duplicado em outra org', async () => {
    await prisma.organization.create({
      data: { id: 'org-other', name: 'Outra', slug: 'org-other', ownerId: 'user-2' },
    });
    await PlayBillingService.verifyPurchase(ORG, {
      productId: 'financaspro.pro.monthly',
      purchaseToken: TOKEN,
    });
    await expect(PlayBillingService.verifyPurchase('org-other', {
      productId: 'financaspro.pro.monthly',
      purchaseToken: TOKEN,
    })).rejects.toMatchObject({ message: 'token-em-uso', status: 409 });
  });

  describe('RTDN — sincronização por notificação', () => {
    let saOriginal;

    beforeEach(async () => {
      getSubscriptionV2.mockReset();
      saOriginal = CONFIG.playBilling.serviceAccountJson;
      CONFIG.playBilling.serviceAccountJson = '{"client_email":"x@y.iam","private_key":"k"}';
      // Cria a posse do token (via sandbox, que não toca na rede).
      await PlayBillingService.verifyPurchase(ORG, {
        productId: 'financaspro.pro.monthly',
        purchaseToken: TOKEN,
      });
    });

    afterEach(() => {
      CONFIG.playBilling.serviceAccountJson = saOriginal;
    });

    test('renovação atualiza a validade com o valor real do Google', async () => {
      const novaValidade = new Date(Date.now() + 60 * 86400000).toISOString();
      getSubscriptionV2.mockResolvedValue({
        state: 'SUBSCRIPTION_STATE_ACTIVE',
        productId: 'financaspro.pro.monthly',
        expiryTime: novaValidade,
        entitled: true,
      });
      const out = await PlayBillingService.handleRtdn({
        subscriptionNotification: { notificationType: 2, purchaseToken: TOKEN },
      });
      expect(out).toMatchObject({ handled: true, entitled: true, orgId: ORG });
      const ent = await BillingRepository.findPlayEntitlement(ORG);
      expect(new Date(ent.expiresAt).toISOString()).toBe(novaValidade);
    });

    test('cancelamento/expiração revoga o acesso', async () => {
      const passado = new Date(Date.now() - 86400000).toISOString();
      getSubscriptionV2.mockResolvedValue({
        state: 'SUBSCRIPTION_STATE_EXPIRED',
        productId: 'financaspro.pro.monthly',
        expiryTime: passado,
        entitled: false,
      });
      const out = await PlayBillingService.handleRtdn({
        subscriptionNotification: { notificationType: 13, purchaseToken: TOKEN },
      });
      expect(out).toMatchObject({ handled: true, entitled: false, orgId: ORG });
      const ent = await BillingRepository.findPlayEntitlement(ORG);
      expect(new Date(ent.expiresAt).getTime()).toBeLessThan(Date.now());
    });

    test('ignora notificação sem subscriptionNotification (ex.: teste do Google)', async () => {
      const out = await PlayBillingService.handleRtdn({
        testNotification: { version: '1.0' },
      });
      expect(out.handled).toBe(false);
      expect(getSubscriptionV2).not.toHaveBeenCalled();
    });

    test('token desconhecido não revoga nada', async () => {
      const out = await PlayBillingService.handleRtdn({
        subscriptionNotification: { notificationType: 3, purchaseToken: 'z'.repeat(50) },
      });
      expect(out).toMatchObject({ handled: false, reason: 'token-desconhecido' });
      expect(getSubscriptionV2).not.toHaveBeenCalled();
    });
  });

  describe('reconcileExpiries — varredura de segurança', () => {
    test('revoga entitlement vencido que ficou ACTIVE (RTDN perdido)', async () => {
      await PlayBillingService.verifyPurchase(ORG, {
        productId: 'financaspro.pro.monthly',
        purchaseToken: TOKEN,
      });
      // Força o período a expirar no passado, mantendo ACTIVE.
      await BillingRepository.updateSubscription(ORG, {
        currentPeriodEnd: new Date(Date.now() - 86400000),
      });
      const out = await PlayBillingService.reconcileExpiries();
      expect(out.revoked).toBe(1);
      const ent = await BillingRepository.findPlayEntitlement(ORG);
      expect(new Date(ent.expiresAt).getTime()).toBeLessThan(Date.now());
    });

    test('não mexe em entitlement ainda vigente', async () => {
      await PlayBillingService.verifyPurchase(ORG, {
        productId: 'financaspro.pro.monthly',
        purchaseToken: TOKEN,
      });
      const out = await PlayBillingService.reconcileExpiries();
      expect(out.revoked).toBe(0);
    });
  });
});
