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
};
