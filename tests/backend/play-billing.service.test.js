/**
 * play-billing.service.test.js — entitlement Google Play (sandbox).
 */
import { jest } from '@jest/globals';
import { createPrismaFake } from '../../scripts/lib/prisma-fake.mjs';

const prisma = createPrismaFake();
jest.unstable_mockModule('../../backend/lib/db.js', () => ({ default: prisma }));

const { PlayBillingService } = await import('../../backend/domain/services/play-billing.service.js');
const { BillingRepository } = await import('../../backend/domain/repositories/billing.repository.js');

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
});
