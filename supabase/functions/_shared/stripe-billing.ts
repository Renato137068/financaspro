// supabase/functions/_shared/stripe-billing.ts
//
// Port de backend/domain/services/billing.service.js (checkout + webhook).
import type Stripe from "https://esm.sh/stripe@16?target=deno";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertAllowedRedirectUrl } from "./stripe.ts";
import { notify } from "./email.ts";
import { TRIAL_DAYS } from "./billing-constants.ts";
import {
  findByStripeSubId,
  findInvoiceByStripeId,
  findPlan,
  findPlanById,
  findSubscription,
  setStripeCustomerIfEmpty,
  updateSubscription,
  upsertInvoice,
  upsertSubscriptionStripe,
} from "./db.ts";

function httpError(status: number, message: string): Error {
  const e: any = new Error(message);
  e.status = status;
  return e;
}

/** Port de createCheckoutSession. */
export async function createCheckout(
  sb: SupabaseClient,
  stripe: Stripe,
  opts: {
    orgId: string;
    planTier: string;
    interval: string;
    userEmail: string | null;
    successUrl: string;
    cancelUrl: string;
  },
) {
  assertAllowedRedirectUrl(opts.successUrl);
  assertAllowedRedirectUrl(opts.cancelUrl);

  const plan = await findPlan(sb, opts.planTier);
  if (!plan || plan.tier === "FREE") throw httpError(400, "plano-invalido-para-checkout");

  const existing = await findSubscription(sb, opts.orgId);
  let stripeCustomerId: string | undefined = existing?.stripeCustomerId ?? undefined;

  if (!stripeCustomerId && opts.userEmail) {
    const customer = await stripe.customers.create({
      email: opts.userEmail,
      metadata: { orgId: opts.orgId },
    });
    stripeCustomerId = customer.id;
    if (existing) {
      const set = await setStripeCustomerIfEmpty(sb, opts.orgId, stripeCustomerId);
      if (!set) {
        const fresh = await findSubscription(sb, opts.orgId);
        stripeCustomerId = fresh?.stripeCustomerId || stripeCustomerId;
      }
    }
  }

  const priceId = opts.interval === "yearly"
    ? plan.stripePriceIdYearly
    : plan.stripePriceIdMonthly;
  if (!priceId) throw httpError(500, "preco-stripe-nao-configurado");

  const successSep = opts.successUrl.includes("?") ? "&" : "?";
  const cancelSep = opts.cancelUrl.includes("?") ? "&" : "?";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: opts.successUrl + successSep + "billing=success&session_id={CHECKOUT_SESSION_ID}",
    cancel_url: opts.cancelUrl + cancelSep + "billing=cancel",
    allow_promotion_codes: true,
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: { orgId: opts.orgId, planTier: opts.planTier },
    },
    metadata: { orgId: opts.orgId, planTier: opts.planTier, interval: opts.interval },
  });

  return { url: session.url, sessionId: session.id };
}

/** Portal do cliente Stripe (gerenciar cartão / faturas). */
export async function createPortal(
  sb: SupabaseClient,
  stripe: Stripe,
  opts: { orgId: string; returnUrl: string },
) {
  assertAllowedRedirectUrl(opts.returnUrl);

  const existing = await findSubscription(sb, opts.orgId);
  if (!existing?.stripeCustomerId) throw httpError(400, "sem-conta-stripe");

  const session = await stripe.billingPortal.sessions.create({
    customer: existing.stripeCustomerId,
    return_url: opts.returnUrl,
  });

  return { url: session.url };
}

/** Cancela no fim do período (cancel_at_period_end). */
export async function cancelSubscription(
  sb: SupabaseClient,
  stripe: Stripe,
  opts: { orgId: string },
) {
  const existing = await findSubscription(sb, opts.orgId);
  if (!existing) throw httpError(404, "assinatura-nao-encontrada");

  if (existing.stripeSubId) {
    await stripe.subscriptions.update(existing.stripeSubId, {
      cancel_at_period_end: true,
    });
  }

  const updated = await updateSubscription(sb, opts.orgId, { cancelAtPeriodEnd: true });
  return updated || { ...existing, cancelAtPeriodEnd: true };
}

// ─── Webhook ────────────────────────────────────────────────────────────────

export async function processStripeEvent(sb: SupabaseClient, stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {
    case "invoice.payment_succeeded":
      await onInvoicePaid(sb, event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_failed":
      await onPaymentFailed(sb, event.data.object as Stripe.Invoice);
      break;
    case "customer.subscription.deleted":
      await onSubscriptionDeleted(sb, event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.updated":
      await onSubscriptionUpdated(sb, event.data.object as Stripe.Subscription);
      break;
    case "checkout.session.completed":
      await onCheckoutCompleted(sb, stripe, event.data.object as Stripe.Checkout.Session);
      break;
  }
}

async function onInvoicePaid(sb: SupabaseClient, invoice: any) {
  const sub = await findByStripeSubId(sb, invoice.subscription);
  if (!sub) return;
  if (await findInvoiceByStripeId(sb, invoice.id)) return;

  await upsertInvoice(sb, {
    subscriptionId: sub.id,
    stripeInvoiceId: invoice.id,
    amount: invoice.amount_paid / 100,
    status: "paid",
    paidAt: new Date(invoice.status_transitions.paid_at * 1000).toISOString(),
    hostedUrl: invoice.hosted_invoice_url,
    pdfUrl: invoice.invoice_pdf,
  });
  await updateSubscription(sb, sub.orgId, { status: "ACTIVE" });

  const plan = await findPlanById(sb, sub.planId);
  await notify("subscription-activated", { to: invoice.customer_email, planName: plan?.name });
}

async function onPaymentFailed(sb: SupabaseClient, invoice: any) {
  const sub = await findByStripeSubId(sb, invoice.subscription);
  if (!sub) return;
  await updateSubscription(sb, sub.orgId, { status: "PAST_DUE" });
  await notify("payment-failed", { to: invoice.customer_email });
}

async function onSubscriptionDeleted(sb: SupabaseClient, stripeSub: any) {
  const sub = await findByStripeSubId(sb, stripeSub.id);
  if (!sub) return;
  await updateSubscription(sb, sub.orgId, { status: "CANCELED" });

  const plan = await findPlanById(sb, sub.planId);
  await notify("subscription-canceled", {
    to: stripeSub.customer_email,
    planName: plan?.name,
    accessUntil: new Date(stripeSub.current_period_end * 1000).toISOString(),
  });
}

async function onSubscriptionUpdated(sb: SupabaseClient, stripeSub: any) {
  const sub = await findByStripeSubId(sb, stripeSub.id);
  if (!sub) return;
  await updateSubscription(sb, sub.orgId, {
    status: String(stripeSub.status).toUpperCase(),
    currentPeriodStart: new Date(stripeSub.current_period_start * 1000).toISOString(),
    currentPeriodEnd: new Date(stripeSub.current_period_end * 1000).toISOString(),
    cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
  });
}

async function onCheckoutCompleted(sb: SupabaseClient, stripe: Stripe, session: any) {
  const orgId = session.metadata?.orgId;
  if (!orgId || !session.subscription) return;

  const stripeSub: any = await stripe.subscriptions.retrieve(String(session.subscription));
  const planTier = session.metadata?.planTier || stripeSub.metadata?.planTier || "PRO";
  const plan = await findPlan(sb, planTier);
  if (!plan) return;

  await upsertSubscriptionStripe(sb, orgId, {
    planId: plan.id,
    status: String(stripeSub.status).toUpperCase(),
    billingInterval: session.metadata?.interval || "monthly",
    stripeCustomerId: String(session.customer),
    stripeSubId: stripeSub.id,
    currentPeriodStart: new Date(stripeSub.current_period_start * 1000).toISOString(),
    currentPeriodEnd: new Date(stripeSub.current_period_end * 1000).toISOString(),
    trialEndsAt: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: !!stripeSub.cancel_at_period_end,
  });
  console.log("Checkout Stripe concluído", orgId, planTier);
}
