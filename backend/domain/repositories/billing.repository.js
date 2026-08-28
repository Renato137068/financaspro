// backend/domain/repositories/billing.repository.js
import prisma from '../../lib/db.js';

export const BillingRepository = {
  async listPlans() {
    return prisma.plan.findMany({
      where: { active: true },
      orderBy: { priceMonthly: 'asc' },
    });
  },

  async findPlan(idOrTier) {
    return prisma.plan.findFirst({
      where: { active: true, OR: [{ id: idOrTier }, { tier: idOrTier }] },
    });
  },

  async findSubscription(orgId) {
    return prisma.subscription.findUnique({
      where: { orgId },
      include: { plan: true },
    });
  },

  async createSubscription(data) {
    return prisma.subscription.create({ data, include: { plan: true } });
  },

  async updateSubscription(orgId, data) {
    return prisma.subscription.update({
      where: { orgId },
      data,
      include: { plan: true },
    });
  },

  async upsertSubscription(orgId, data) {
    return prisma.subscription.upsert({
      where: { orgId },
      create: { orgId, ...data },
      update: data,
      include: { plan: true },
    });
  },

  /** Grava stripeCustomerId só se ainda vazio (evita corrida paralela). */
  async setStripeCustomerIfEmpty(orgId, stripeCustomerId) {
    const result = await prisma.subscription.updateMany({
      where: { orgId, stripeCustomerId: null },
      data: { stripeCustomerId },
    });
    return result.count > 0;
  },

  async findStripeLinkedSubscriptions() {
    return prisma.subscription.findMany({
      where: { stripeSubId: { not: null } },
      select: { orgId: true, stripeSubId: true },
    });
  },

  /** Assinaturas do Google Play (chave `play:<token>`). */
  async findPlayLinkedSubscriptions() {
    return prisma.subscription.findMany({
      where: { stripeSubId: { startsWith: 'play:' } },
      select: { orgId: true, stripeSubId: true, status: true, currentPeriodEnd: true },
    });
  },

  async recordUsage(subscriptionId, metric, value, periodStart, periodEnd) {
    return prisma.usageRecord.create({
      data: { subscriptionId, metric, value, periodStart, periodEnd },
    });
  },

  async getUsage(subscriptionId, metric, periodStart) {
    return prisma.usageRecord.findFirst({
      where: { subscriptionId, metric, periodStart: { gte: periodStart } },
      orderBy: { createdAt: 'desc' },
    });
  },

  async listInvoices(subscriptionId) {
    return prisma.invoice.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
      take: 24,
    });
  },

  async createInvoice(data) {
    return prisma.invoice.create({ data });
  },

  async findInvoiceByStripeId(stripeInvoiceId) {
    if (!stripeInvoiceId) return null;
    return prisma.invoice.findUnique({ where: { stripeInvoiceId } });
  },

  async upsertInvoice(data) {
    if (!data.stripeInvoiceId) return this.createInvoice(data);
    return prisma.invoice.upsert({
      where: { stripeInvoiceId: data.stripeInvoiceId },
      create: data,
      update: {
        amount: data.amount,
        status: data.status,
        paidAt: data.paidAt,
        hostedUrl: data.hostedUrl,
        pdfUrl: data.pdfUrl,
      },
    });
  },

  /** Registra event.id do Stripe; retorna false se já processado. */
  async claimWebhookEvent(eventId, type) {
    try {
      await prisma.stripeWebhookEvent.create({ data: { id: eventId, type } });
      return true;
    } catch (err) {
      if (err.code === 'P2002') return false;
      throw err;
    }
  },

  /** Libera claim para permitir retry do Stripe após falha de processamento. */
  async releaseWebhookEvent(eventId) {
    try {
      await prisma.stripeWebhookEvent.delete({ where: { id: eventId } });
    } catch (err) {
      if (err.code === 'P2025') return;
      throw err;
    }
  },

  async updateInvoice(id, data) {
    return prisma.invoice.update({ where: { id }, data });
  },

  async findByStripeSubId(stripeSubId) {
    return prisma.subscription.findUnique({
      where: { stripeSubId },
      include: { plan: true, org: true },
    });
  },

  async findByStripeCustomerId(stripeCustomerId) {
    return prisma.subscription.findFirst({
      where: { stripeCustomerId },
      include: { plan: true, org: true },
    });
  },

  /** Entitlement Google Play — reutiliza stripeSubId como chave `play:<token>`. */
  async findByPlayPurchaseToken(purchaseToken) {
    const playKey = `play:${String(purchaseToken).slice(0, 120)}`;
    const sub = await this.findByStripeSubId(playKey);
    if (!sub) return null;
    return { orgId: sub.orgId, subscription: sub };
  },

  async upsertPlayEntitlement(orgId, { productId, purchaseToken, tier, expiresAt }) {
    const plan = await this.findPlan(tier);
    if (!plan) {
      const err = new Error('plano-nao-encontrado');
      err.status = 404;
      throw err;
    }
    const playKey = `play:${String(purchaseToken).slice(0, 120)}`;
    const end = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 30 * 86400000);
    return this.upsertSubscription(orgId, {
      planId: plan.id,
      status: 'ACTIVE',
      billingInterval: String(productId).includes('yearly') ? 'yearly' : 'monthly',
      stripeSubId: playKey,
      stripeCustomerId: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: end,
      cancelAtPeriodEnd: false,
    });
  },

  async findPlayEntitlement(orgId) {
    const sub = await this.findSubscription(orgId);
    if (!sub || !sub.stripeSubId || !String(sub.stripeSubId).startsWith('play:')) return null;
    return {
      orgId,
      tier: sub.plan?.tier || null,
      productId: sub.billingInterval,
      expiresAt: sub.currentPeriodEnd,
      source: 'google_play',
    };
  },

  /**
   * Revoga o entitlement do Play (cancelamento/reembolso/expiração via RTDN).
   * Só age se a assinatura atual da org for de fato do Play — nunca mexe numa
   * assinatura Stripe. Encerra o período em `expiresAt` (ou agora).
   */
  async revokePlayEntitlement(orgId, { expiresAt } = {}) {
    const sub = await this.findSubscription(orgId);
    if (!sub || !sub.stripeSubId || !String(sub.stripeSubId).startsWith('play:')) return null;
    const end = expiresAt ? new Date(expiresAt) : new Date();
    return this.updateSubscription(orgId, {
      status: 'CANCELED',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: end,
    });
  },
};
