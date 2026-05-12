// backend/domain/services/billing.service.js
import { BillingRepository } from '../repositories/billing.repository.js';
import { AppError } from '../errors.js';
import CONFIG from '../../config.js';
import logger from '../../lib/logger.js';
import { enqueue, QUEUES } from '../../lib/queue.js';

function getStripe() {
  if (!CONFIG.stripe?.secretKey) return null;
  // Importação lazy para não crashar se stripe não estiver instalado
  const Stripe = globalThis._stripeModule;
  if (!Stripe) return null;
  return new Stripe(CONFIG.stripe.secretKey, { apiVersion: '2024-06-20' });
}

export const BillingService = {
  async listPlans() {
    return BillingRepository.listPlans();
  },

  async getSubscription(orgId) {
    const sub = await BillingRepository.findSubscription(orgId);
    if (!sub) throw new AppError('Assinatura não encontrada', 404);
    return sub;
  },

  async subscribe(orgId, planTier, interval = 'monthly', userEmail = null) {
    const plan = await BillingRepository.findPlan(planTier);
    if (!plan) throw new AppError('Plano não encontrado', 404);

    const existing = await BillingRepository.findSubscription(orgId);

    const stripe = getStripe();
    const now = new Date();

    if (stripe && plan.tier !== 'FREE') {
      // Cria customer no Stripe se ainda não existir
      let stripeCustomerId = existing?.stripeCustomerId;
      if (!stripeCustomerId && userEmail) {
        const customer = await stripe.customers.create({
          email: userEmail,
          metadata: { orgId },
        });
        stripeCustomerId = customer.id;
      }

      const priceId = interval === 'yearly'
        ? plan.stripePriceIdYearly
        : plan.stripePriceIdMonthly;

      if (!priceId) throw new AppError('Preço Stripe não configurado para este plano', 500);

      const stripeSub = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: priceId }],
        trial_period_days: 14,
        metadata: { orgId },
      });

      const data = {
        planId:             plan.id,
        status:             'TRIALING',
        billingInterval:    interval,
        stripeCustomerId,
        stripeSubId:        stripeSub.id,
        currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
        currentPeriodEnd:   new Date(stripeSub.current_period_end * 1000),
        trialEndsAt:        stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
      };

      const sub = existing
        ? await BillingRepository.updateSubscription(orgId, data)
        : await BillingRepository.createSubscription({ orgId, ...data });

      return sub;
    }

    // Modo sem Stripe (FREE ou dev sem chave)
    const periodEnd = new Date(now);
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    const data = {
      planId:             plan.id,
      status:             'ACTIVE',
      billingInterval:    interval,
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd,
    };

    return existing
      ? BillingRepository.updateSubscription(orgId, data)
      : BillingRepository.createSubscription({ orgId, ...data });
  },

  async cancel(orgId) {
    const sub = await BillingRepository.findSubscription(orgId);
    if (!sub) throw new AppError('Assinatura não encontrada', 404);

    const stripe = getStripe();
    if (stripe && sub.stripeSubId) {
      await stripe.subscriptions.update(sub.stripeSubId, {
        cancel_at_period_end: true,
      });
    }

    return BillingRepository.updateSubscription(orgId, { cancelAtPeriodEnd: true });
  },

  async createPortalSession(orgId, returnUrl) {
    const sub = await BillingRepository.findSubscription(orgId);
    if (!sub?.stripeCustomerId) throw new AppError('Sem conta Stripe associada', 400);

    const stripe = getStripe();
    if (!stripe) throw new AppError('Stripe não configurado', 503);

    const session = await stripe.billingPortal.sessions.create({
      customer:   sub.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  },

  async listInvoices(orgId) {
    const sub = await BillingRepository.findSubscription(orgId);
    if (!sub) return [];
    return BillingRepository.listInvoices(sub.id);
  },

  /** Processa eventos de webhook do Stripe. */
  async handleWebhook(payload, signature) {
    const stripe = getStripe();
    if (!stripe) throw new AppError('Stripe não configurado', 503);

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        payload,
        signature,
        CONFIG.stripe.webhookSecret
      );
    } catch {
      throw new AppError('Assinatura de webhook inválida', 400);
    }

    logger.info({ type: event.type }, 'Webhook Stripe recebido');

    switch (event.type) {
      case 'invoice.payment_succeeded':
        await this._onInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this._onPaymentFailed(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this._onSubscriptionDeleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await this._onSubscriptionUpdated(event.data.object);
        break;
    }

    return { received: true };
  },

  async _onInvoicePaid(invoice) {
    const sub = await BillingRepository.findByStripeSubId(invoice.subscription);
    if (!sub) return;

    await BillingRepository.createInvoice({
      subscriptionId:  sub.id,
      stripeInvoiceId: invoice.id,
      amount:          invoice.amount_paid / 100,
      status:          'paid',
      paidAt:          new Date(invoice.status_transitions.paid_at * 1000),
      hostedUrl:       invoice.hosted_invoice_url,
      pdfUrl:          invoice.invoice_pdf,
    });

    await BillingRepository.updateSubscription(sub.orgId, { status: 'ACTIVE' });

    await enqueue(QUEUES.EMAIL, 'subscription-activated', {
      to: invoice.customer_email,
      templateName: 'subscription-activated',
      data: { planName: sub.plan.name, nextBilling: invoice.next_payment_attempt },
    });
  },

  async _onPaymentFailed(invoice) {
    const sub = await BillingRepository.findByStripeSubId(invoice.subscription);
    if (!sub) return;

    await BillingRepository.updateSubscription(sub.orgId, { status: 'PAST_DUE' });

    await enqueue(QUEUES.EMAIL, 'payment-failed', {
      to: invoice.customer_email,
      templateName: 'payment-failed',
      data: {},
    });
  },

  async _onSubscriptionDeleted(stripeSub) {
    const sub = await BillingRepository.findByStripeSubId(stripeSub.id);
    if (!sub) return;

    await BillingRepository.updateSubscription(sub.orgId, { status: 'CANCELED' });

    await enqueue(QUEUES.EMAIL, 'subscription-canceled', {
      to: stripeSub.customer_email,
      templateName: 'subscription-canceled',
      data: { planName: sub.plan.name, accessUntil: new Date(stripeSub.current_period_end * 1000) },
    });
  },

  async _onSubscriptionUpdated(stripeSub) {
    const sub = await BillingRepository.findByStripeSubId(stripeSub.id);
    if (!sub) return;

    await BillingRepository.updateSubscription(sub.orgId, {
      status:             stripeSub.status.toUpperCase(),
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd:   new Date(stripeSub.current_period_end * 1000),
      cancelAtPeriodEnd:  stripeSub.cancel_at_period_end,
    });
  },
};
