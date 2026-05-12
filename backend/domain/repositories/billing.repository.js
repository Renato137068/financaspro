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
