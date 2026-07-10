// backend/domain/services/billing.service.js
import { BillingRepository } from '../repositories/billing.repository.js';
import { AppError } from '../errors.js';
import CONFIG from '../../config.js';
import logger from '../../lib/logger.js';
import { enqueue, QUEUES } from '../../lib/queue.js';

let _stripePromise = null;

function getStripe() {
  if (!CONFIG.stripe?.secretKey) return Promise.resolve(null);
  if (!_stripePromise) {
    _stripePromise = import('stripe').then(function(mod) {
      return new mod.default(CONFIG.stripe.secretKey, { apiVersion: '2024-06-20' });
    });
  }
  return _stripePromise;
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

    const stripe = await getStripe();
    const now = new Date();

    if (plan.tier !== 'FREE' && !stripe) {
      if (CONFIG.isProd) {
        throw new AppError('Pagamentos indisponíveis. Configure Stripe em produção.', 503);
      }
      throw new AppError('Stripe não configurado. Defina STRIPE_SECRET_KEY para planos pagos.', 503);
    }

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

    // Modo sem Stripe — apenas FREE em dev
    if (plan.tier !== 'FREE') {
      throw new AppError('Plano pago requer Stripe configurado', 503);
    }

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

    const stripe = await getStripe();
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

    const stripe = await getStripe();
    if (!stripe) throw new AppError('Stripe não configurado', 503);

    const session = await stripe.billingPortal.sessions.create({
      customer:   sub.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  },

  async createCheckoutSession(orgId, planTier, interval, userEmail, successUrl, cancelUrl) {
    const plan = await BillingRepository.findPlan(planTier);
    if (!plan || plan.tier === 'FREE') throw new AppError('Plano inválido para checkout', 400);

    const stripe = await getStripe();
    if (!stripe) throw new AppError('Stripe não configurado', 503);

    const existing = await BillingRepository.findSubscription(orgId);
    let stripeCustomerId = existing?.stripeCustomerId;

    if (!stripeCustomerId && userEmail) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { orgId },
      });
      stripeCustomerId = customer.id;
      if (existing) {
        await BillingRepository.updateSubscription(orgId, { stripeCustomerId });
      }
    }

    const priceId = interval === 'yearly'
      ? plan.stripePriceIdYearly
      : plan.stripePriceIdMonthly;

    if (!priceId) throw new AppError('Preço Stripe não configurado para este plano', 500);

    const successSep = successUrl.includes('?') ? '&' : '?';
    const cancelSep = cancelUrl.includes('?') ? '&' : '?';

    const session = await stripe.checkout.sessions.create({
      mode:                 'subscription',
      customer:             stripeCustomerId,
      line_items:           [{ price: priceId, quantity: 1 }],
      success_url:          successUrl + successSep + 'billing=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url:           cancelUrl + cancelSep + 'billing=cancel',
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: 14,
        metadata:          { orgId, planTier },
      },
      metadata: { orgId, planTier, interval },
    });

    return { url: session.url, sessionId: session.id };
  },

  async listInvoices(orgId) {
    const sub = await BillingRepository.findSubscription(orgId);
    if (!sub) return [];
    return BillingRepository.listInvoices(sub.id);
  },

  /** Processa eventos de webhook do Stripe. */
  async handleWebhook(payload, signature) {
    const stripe = await getStripe();
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
      case 'checkout.session.completed':
        await this._onCheckoutCompleted(event.data.object);
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

  async _onCheckoutCompleted(session) {
    const orgId = session.metadata?.orgId;
    if (!orgId || !session.subscription) return;

    const stripe = await getStripe();
    if (!stripe) return;

    const stripeSub = await stripe.subscriptions.retrieve(String(session.subscription));
    const planTier = session.metadata?.planTier || stripeSub.metadata?.planTier || 'PRO';
    const plan = await BillingRepository.findPlan(planTier);
    if (!plan) return;

    const data = {
      planId:             plan.id,
      status:             String(stripeSub.status).toUpperCase(),
      billingInterval:    session.metadata?.interval || 'monthly',
      stripeCustomerId:   String(session.customer),
      stripeSubId:        stripeSub.id,
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd:   new Date(stripeSub.current_period_end * 1000),
      trialEndsAt:        stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
      cancelAtPeriodEnd:  !!stripeSub.cancel_at_period_end,
    };

    const existing = await BillingRepository.findSubscription(orgId);
    if (existing) {
      await BillingRepository.updateSubscription(orgId, data);
    } else {
      await BillingRepository.createSubscription({ orgId, ...data });
    }

    logger.info({ orgId, planTier }, 'Checkout Stripe concluído');
  },
};
