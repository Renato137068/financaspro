// supabase/functions/_shared/stripe-billing.ts
//
// Port de backend/domain/services/billing.service.js (checkout + webhook).
import type Stripe from "npm:stripe@22.6.2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
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

  // Teste grátis só na primeira assinatura de loja da org. Sem isto, cancelar e
  // assinar de novo dava mais 7 dias a cada volta. O Pro de boas-vindas
  // (welcome:) não conta: não é assinatura, é cortesia sem cartão.
  const jaAssinou = String(existing?.stripeSubId || "").startsWith("play:")
    || isStripeManagedSubId(existing?.stripeSubId);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: opts.successUrl + successSep + "billing=success&session_id={CHECKOUT_SESSION_ID}",
    cancel_url: opts.cancelUrl + cancelSep + "billing=cancel",
    allow_promotion_codes: true,
    subscription_data: {
      ...(jaAssinou ? {} : { trial_period_days: TRIAL_DAYS }),
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

/** play:/welcome: reutilizam stripeSubId — não são IDs Stripe. */
function isStripeManagedSubId(id: string | null | undefined): boolean {
  const s = String(id || "");
  if (!s) return false;
  if (s.startsWith("play:") || s.startsWith("welcome:")) return false;
  return true;
}

/** Cancela no fim do período (cancel_at_period_end). */
export async function cancelSubscription(
  sb: SupabaseClient,
  stripe: Stripe,
  opts: { orgId: string },
) {
  const existing = await findSubscription(sb, opts.orgId);
  if (!existing) throw httpError(404, "assinatura-nao-encontrada");

  if (String(existing.stripeSubId || "").startsWith("play:")) {
    throw httpError(400, "cancele-na-play-store");
  }

  if (isStripeManagedSubId(existing.stripeSubId)) {
    await stripe.subscriptions.update(existing.stripeSubId!, {
      cancel_at_period_end: true,
    });
  }

  await updateSubscription(sb, opts.orgId, { cancelAtPeriodEnd: true });
  return { ...existing, cancelAtPeriodEnd: true };
}

/** Desfaz cancel_at_period_end — volta a renovar. */
export async function resumeSubscription(
  sb: SupabaseClient,
  stripe: Stripe,
  opts: { orgId: string },
) {
  const existing = await findSubscription(sb, opts.orgId);
  if (!existing) throw httpError(404, "assinatura-nao-encontrada");
  if (!existing.cancelAtPeriodEnd) return existing;

  if (String(existing.stripeSubId || "").startsWith("play:")) {
    throw httpError(400, "reative-na-play-store");
  }

  if (isStripeManagedSubId(existing.stripeSubId)) {
    await stripe.subscriptions.update(existing.stripeSubId!, {
      cancel_at_period_end: false,
    });
  }

  await updateSubscription(sb, opts.orgId, { cancelAtPeriodEnd: false });
  return { ...existing, cancelAtPeriodEnd: false };
}

// ─── Webhook ────────────────────────────────────────────────────────────────
//
// Formatos da API. A partir da 2025-03-31 (basil), a fatura não tem mais
// `subscription` (virou `parent.subscription_details.subscription`) e a
// assinatura não tem mais `current_period_*` (foi para cada item). O cliente
// usa a versão do stripe@22 (STRIPE_API_VERSION), mas o corpo do webhook vem na
// versão configurada no endpoint do painel — então lemos os dois formatos.

/** ID da assinatura de uma fatura, no formato novo ou no antigo. */
function subIdDaFatura(invoice: any): string | null {
  const s = invoice?.parent?.subscription_details?.subscription ?? invoice?.subscription;
  if (!s) return null;
  return typeof s === "string" ? s : (s.id ?? null);
}

/** Período atual: na assinatura (antigo) ou no item (novo; o app vende um item por assinatura). */
function periodo(stripeSub: any): { inicio: string | null; fim: string | null } {
  const item = stripeSub?.items?.data?.[0];
  return {
    inicio: iso(stripeSub?.current_period_start ?? item?.current_period_start),
    fim: iso(stripeSub?.current_period_end ?? item?.current_period_end),
  };
}

/** Segundos Unix → ISO; ausente vira null (antes, `new Date(NaN)` derrubava o webhook). */
function iso(segundos: unknown): string | null {
  return typeof segundos === "number" && Number.isFinite(segundos) ? new Date(segundos * 1000).toISOString() : null;
}

/** Só as chaves com valor: um período ausente não apaga o que o banco já tem. */
function semVazios(dados: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== null && v !== undefined));
}

export async function processStripeEvent(sb: SupabaseClient, stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {
    case "invoice.payment_succeeded":
      await onInvoicePaid(sb, event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_failed":
      await onPaymentFailed(sb, event.data.object as Stripe.Invoice);
      break;
    case "customer.subscription.deleted":
      await onSubscriptionDeleted(sb, stripe, event.data.object as Stripe.Subscription);
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
  const subId = subIdDaFatura(invoice);
  if (!subId) return; // fatura avulsa, sem assinatura
  const sub = await findByStripeSubId(sb, subId);
  if (!sub) return;
  if (await findInvoiceByStripeId(sb, invoice.id)) return;

  await upsertInvoice(sb, {
    subscriptionId: sub.id,
    stripeInvoiceId: invoice.id,
    amount: invoice.amount_paid / 100,
    status: "paid",
    paidAt: iso(invoice.status_transitions?.paid_at) ?? new Date().toISOString(),
    hostedUrl: invoice.hosted_invoice_url,
    pdfUrl: invoice.invoice_pdf,
  });
  await updateSubscription(sb, sub.orgId, { status: "ACTIVE" });

  const plan = await findPlanById(sb, sub.planId);
  await notify("subscription-activated", { to: invoice.customer_email, planName: plan?.name });
}

async function onPaymentFailed(sb: SupabaseClient, invoice: any) {
  const subId = subIdDaFatura(invoice);
  if (!subId) return; // fatura avulsa, sem assinatura
  const sub = await findByStripeSubId(sb, subId);
  if (!sub) return;
  await updateSubscription(sb, sub.orgId, { status: "PAST_DUE" });
  await notify("payment-failed", { to: invoice.customer_email });
}

async function onSubscriptionDeleted(sb: SupabaseClient, stripe: Stripe, stripeSub: any) {
  const sub = await findByStripeSubId(sb, stripeSub.id);
  if (!sub) return;
  await updateSubscription(sb, sub.orgId, { status: "CANCELED" });

  const plan = await findPlanById(sb, sub.planId);
  await notify("subscription-canceled", {
    to: await emailDoCliente(stripe, stripeSub.customer),
    planName: plan?.name,
    accessUntil: periodo(stripeSub).fim,
  });
}

/**
 * A assinatura não traz e-mail (nunca trouxe: o `customer_email` que se lia
 * aqui não existe no objeto, e o aviso de cancelamento não saía). O e-mail é
 * do cliente. Falha na consulta não pode derrubar o webhook: sem e-mail, o
 * aviso só não sai.
 */
async function emailDoCliente(stripe: Stripe, customer: any): Promise<string | null> {
  if (customer && typeof customer === "object") return customer.email ?? null;
  if (!customer) return null;
  try {
    const c: any = await stripe.customers.retrieve(String(customer));
    return c && !c.deleted ? (c.email ?? null) : null;
  } catch (e) {
    console.warn("Stripe: e-mail do cliente indisponível", (e as Error)?.message);
    return null;
  }
}

async function onSubscriptionUpdated(sb: SupabaseClient, stripeSub: any) {
  const sub = await findByStripeSubId(sb, stripeSub.id);
  if (!sub) return;
  const p = periodo(stripeSub);
  await updateSubscription(sb, sub.orgId, semVazios({
    status: String(stripeSub.status).toUpperCase(),
    currentPeriodStart: p.inicio,
    currentPeriodEnd: p.fim,
    cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
  }));
}

async function onCheckoutCompleted(sb: SupabaseClient, stripe: Stripe, session: any) {
  const orgId = session.metadata?.orgId;
  if (!orgId || !session.subscription) return;

  const stripeSub: any = await stripe.subscriptions.retrieve(String(session.subscription));
  const planTier = session.metadata?.planTier || stripeSub.metadata?.planTier || "PRO";
  const plan = await findPlan(sb, planTier);
  if (!plan) return;

  const p = periodo(stripeSub);
  await upsertSubscriptionStripe(sb, orgId, {
    ...semVazios({ currentPeriodStart: p.inicio, currentPeriodEnd: p.fim }),
    planId: plan.id,
    status: String(stripeSub.status).toUpperCase(),
    billingInterval: session.metadata?.interval || "monthly",
    stripeCustomerId: String(session.customer),
    stripeSubId: stripeSub.id,
    trialEndsAt: iso(stripeSub.trial_end),
    cancelAtPeriodEnd: !!stripeSub.cancel_at_period_end,
  });
  console.log("Checkout Stripe concluído", orgId, planTier);
}
