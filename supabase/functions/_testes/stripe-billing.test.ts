// Stripe nas Edge Functions (_shared/stripe-billing.ts + db.ts + stripe.ts +
// email.ts), executados de verdade contra o banco em memória e um Stripe falso
// que registra cada chamada. Casos portados de tests/backend/billing.*.test.js
// (Express), que até aqui eram a única rede de teste dessa lógica — só que da
// cópia congelada, não da que roda em produção.
import assert from "node:assert/strict";
import { BancoFalso } from "./dubles/banco.ts";
import Stripe, { estado as stripe } from "./dubles/stripe.ts";
import { json, Rede } from "./dubles/rede.ts";
import { comAmbiente, falhaCom } from "./dubles/ambiente.ts";
import {
  cancelSubscription,
  createCheckout,
  createPortal,
  processStripeEvent,
  resumeSubscription,
} from "../_shared/stripe-billing.ts";
import { TRIAL_DAYS } from "../_shared/billing-constants.ts";

const APP = "https://app.financaspro.com";
const VARS = { APP_URL: APP };

const PLANOS = [
  { id: "plan_free", tier: "FREE", name: "Grátis", active: true },
  { id: "plan_pro", tier: "PRO", name: "Pro", active: true, stripePriceIdMonthly: "price_pro_m", stripePriceIdYearly: "price_pro_y" },
  { id: "plan_biz", tier: "BUSINESS", name: "Business", active: true, stripePriceIdMonthly: null, stripePriceIdYearly: null },
];

function banco(subs: any[] = [], extra: Record<string, any[]> = {}) {
  return new BancoFalso({ Plan: PLANOS, Subscription: subs, Invoice: [], ...extra });
}

function cliente() {
  stripe.reset();
  return new Stripe("sk_test_x") as any;
}

const chamadas = (metodo: string) => stripe.chamadas.filter((c) => c.metodo === metodo);

const checkout = (sb: BancoFalso, st: any, extra: Record<string, unknown> = {}) =>
  createCheckout(sb, st, {
    orgId: "org1",
    planTier: "PRO",
    interval: "monthly",
    userEmail: "ana@exemplo.com",
    successUrl: APP + "/?aba=config",
    cancelUrl: APP + "/",
    ...extra,
  } as any);

// ─── Checkout ───────────────────────────────────────────────────────────────

Deno.test("checkout: URL de retorno de outro domínio é 400 antes de qualquer chamada ao Stripe", async () => {
  await comAmbiente(VARS, async () => {
    const st = cliente();
    await falhaCom(checkout(banco(), st, { successUrl: "https://phishing.example/ok" }), 400, "url-de-retorno-nao-permitida");
    await falhaCom(checkout(banco(), st, { cancelUrl: "javascript:alert(1)" }), 400, "url-de-retorno-deve-ser-http");
    assert.equal(stripe.chamadas.length, 0);
  });
});

Deno.test("checkout: plano FREE ou inexistente é 400; plano sem price é 500 antes de cobrar", async () => {
  await comAmbiente(VARS, async () => {
    const st = cliente();
    await falhaCom(checkout(banco(), st, { planTier: "FREE" }), 400, "plano-invalido-para-checkout");
    await falhaCom(checkout(banco(), st, { planTier: "ULTRA" }), 400, "plano-invalido-para-checkout");
    await falhaCom(checkout(banco(), st, { planTier: "BUSINESS" }), 500, "preco-stripe-nao-configurado");
    assert.equal(chamadas("checkout.sessions.create").length, 0);
  });
});

Deno.test("checkout: org sem customer cria um com o e-mail e o orgId", async () => {
  await comAmbiente(VARS, async () => {
    const st = cliente();
    const r = await checkout(banco(), st);
    assert.deepEqual(r, { url: "https://checkout.stripe.test/cs_1", sessionId: "cs_1" });
    assert.deepEqual(chamadas("customers.create")[0].args[0], { email: "ana@exemplo.com", metadata: { orgId: "org1" } });
    assert.equal((chamadas("checkout.sessions.create")[0].args[0] as any).customer, "cus_novo");
  });
});

Deno.test("checkout: reaproveita o customer existente em vez de duplicar", async () => {
  await comAmbiente(VARS, async () => {
    const st = cliente();
    await checkout(banco([{ id: "s1", orgId: "org1", stripeCustomerId: "cus_antigo" }]), st);
    assert.equal(chamadas("customers.create").length, 0);
    assert.equal((chamadas("checkout.sessions.create")[0].args[0] as any).customer, "cus_antigo");
  });
});

Deno.test("checkout: grava o customer recém-criado na assinatura existente", async () => {
  await comAmbiente(VARS, async () => {
    const sb = banco([{ id: "s1", orgId: "org1", stripeCustomerId: null }]);
    await checkout(sb, cliente());
    assert.equal(sb.linhas("Subscription")[0].stripeCustomerId, "cus_novo");
  });
});

Deno.test("checkout: perdedor da corrida adota o customer que o vencedor gravou", async () => {
  await comAmbiente(VARS, async () => {
    const sb = banco([{ id: "s1", orgId: "org1", stripeCustomerId: null }]);
    const st = cliente();
    // Entre ler a assinatura e gravar, outra requisição grava o customer dela.
    stripe.respostas["customers.create"] = () => {
      sb.linhas("Subscription")[0].stripeCustomerId = "cus_vencedor";
      return { id: "cus_perdedor" };
    };
    await checkout(sb, st);
    assert.equal(sb.linhas("Subscription")[0].stripeCustomerId, "cus_vencedor");
    assert.equal((chamadas("checkout.sessions.create")[0].args[0] as any).customer, "cus_vencedor");
  });
});

Deno.test("checkout: sessão com trial de 7 dias, metadados para o webhook e price do intervalo", async () => {
  await comAmbiente(VARS, async () => {
    const st = cliente();
    await checkout(banco(), st, { interval: "yearly" });
    const s = chamadas("checkout.sessions.create")[0].args[0] as any;
    assert.equal(TRIAL_DAYS, 7);
    assert.equal(s.subscription_data.trial_period_days, 7);
    assert.deepEqual(s.subscription_data.metadata, { orgId: "org1", planTier: "PRO" });
    assert.deepEqual(s.metadata, { orgId: "org1", planTier: "PRO", interval: "yearly" });
    assert.deepEqual(s.line_items, [{ price: "price_pro_y", quantity: 1 }]);
    assert.equal(s.mode, "subscription");
  });
});

Deno.test("checkout: usa ? ou & conforme a URL de retorno já tenha querystring", async () => {
  await comAmbiente(VARS, async () => {
    const st = cliente();
    await checkout(banco(), st, { successUrl: APP + "/?aba=config", cancelUrl: APP + "/planos" });
    const s = chamadas("checkout.sessions.create")[0].args[0] as any;
    assert.equal(s.success_url, APP + "/?aba=config&billing=success&session_id={CHECKOUT_SESSION_ID}");
    assert.equal(s.cancel_url, APP + "/planos?billing=cancel");
  });
});

Deno.test("checkout: origem extra de BILLING_ALLOWED_ORIGINS é aceita", async () => {
  await comAmbiente({ ...VARS, BILLING_ALLOWED_ORIGINS: "https://beta.financaspro.com, lixo" }, async () => {
    await checkout(banco(), cliente(), { successUrl: "https://beta.financaspro.com/ok" });
    assert.equal(chamadas("checkout.sessions.create").length, 1);
  });
});

// ─── Portal, cancelar, reativar ─────────────────────────────────────────────

Deno.test("portal: sem customer é 400; com customer devolve a URL da sessão", async () => {
  await comAmbiente(VARS, async () => {
    const st = cliente();
    await falhaCom(createPortal(banco([{ id: "s1", orgId: "org1" }]), st, { orgId: "org1", returnUrl: APP }), 400, "sem-conta-stripe");
    const r = await createPortal(banco([{ id: "s1", orgId: "org1", stripeCustomerId: "cus_1" }]), st, { orgId: "org1", returnUrl: APP + "/" });
    assert.deepEqual(r, { url: "https://billing.stripe.test/p_1" });
    assert.deepEqual(chamadas("billingPortal.sessions.create")[0].args[0], { customer: "cus_1", return_url: APP + "/" });
  });
});

Deno.test("cancelar: 404 sem assinatura; Play manda cancelar na loja (400) sem escrever", async () => {
  await comAmbiente(VARS, async () => {
    const st = cliente();
    await falhaCom(cancelSubscription(banco(), st, { orgId: "org1" }), 404, "assinatura-nao-encontrada");
    const sb = banco([{ id: "s1", orgId: "org1", stripeSubId: "play:tok", cancelAtPeriodEnd: false }]);
    await falhaCom(cancelSubscription(sb, st, { orgId: "org1" }), 400, "cancele-na-play-store");
    assert.equal(sb.escritas.length, 0);
    assert.equal(stripe.chamadas.length, 0);
  });
});

Deno.test("cancelar: assinatura do Stripe cancela no fim do período, lá e aqui", async () => {
  await comAmbiente(VARS, async () => {
    const st = cliente();
    const sb = banco([{ id: "s1", orgId: "org1", stripeSubId: "sub_123", status: "ACTIVE", cancelAtPeriodEnd: false }]);
    await cancelSubscription(sb, st, { orgId: "org1" });
    assert.deepEqual(chamadas("subscriptions.update")[0].args, ["sub_123", { cancel_at_period_end: true }]);
    const sub = sb.linhas("Subscription")[0];
    assert.equal(sub.cancelAtPeriodEnd, true);
    assert.equal(sub.status, "ACTIVE", "não corta o acesso na hora");
  });
});

Deno.test("cancelar: trial de boas-vindas (welcome:) só marca aqui, sem chamar o Stripe", async () => {
  await comAmbiente(VARS, async () => {
    const st = cliente();
    const sb = banco([{ id: "s1", orgId: "org1", stripeSubId: "welcome:org1", cancelAtPeriodEnd: false }]);
    await cancelSubscription(sb, st, { orgId: "org1" });
    assert.equal(stripe.chamadas.length, 0);
    assert.equal(sb.linhas("Subscription")[0].cancelAtPeriodEnd, true);
  });
});

Deno.test("reativar: quem não estava cancelando volta como está, sem escrever", async () => {
  await comAmbiente(VARS, async () => {
    const st = cliente();
    const sb = banco([{ id: "s1", orgId: "org1", stripeSubId: "sub_1", cancelAtPeriodEnd: false }]);
    const r = await resumeSubscription(sb, st, { orgId: "org1" });
    assert.equal(r.id, "s1");
    assert.equal(sb.escritas.length, 0);
    assert.equal(stripe.chamadas.length, 0);
  });
});

Deno.test("reativar: Play manda reativar na loja; Stripe desfaz o cancelamento lá e aqui", async () => {
  await comAmbiente(VARS, async () => {
    const st = cliente();
    await falhaCom(
      resumeSubscription(banco([{ id: "s1", orgId: "org1", stripeSubId: "play:tok", cancelAtPeriodEnd: true }]), st, { orgId: "org1" }),
      400, "reative-na-play-store",
    );
    const sb = banco([{ id: "s1", orgId: "org1", stripeSubId: "sub_1", cancelAtPeriodEnd: true }]);
    await resumeSubscription(sb, st, { orgId: "org1" });
    assert.deepEqual(chamadas("subscriptions.update")[0].args, ["sub_1", { cancel_at_period_end: false }]);
    assert.equal(sb.linhas("Subscription")[0].cancelAtPeriodEnd, false);
  });
});

// ─── Webhook: processStripeEvent ────────────────────────────────────────────

const ev = (type: string, object: Record<string, unknown>) => ({ id: "evt_1", type, data: { object } }) as any;
const SUB = { id: "s1", orgId: "org1", planId: "plan_pro", stripeSubId: "sub_1", status: "TRIALING" };

function comResend() {
  return new Rede().rota(/api\.resend\.com\/emails/, () => json({ id: "em_1" })).instalar();
}

Deno.test("fatura paga: centavos viram reais, cria a fatura, reativa e manda o e-mail de ativação", async () => {
  await comAmbiente({ ...VARS, RESEND_API_KEY: "re_teste" }, async () => {
    const rede = comResend();
    const sb = banco([{ ...SUB }]);
    await processStripeEvent(sb, cliente(), ev("invoice.payment_succeeded", {
      id: "in_1", subscription: "sub_1", amount_paid: 1990, customer_email: "ana@exemplo.com",
      status_transitions: { paid_at: 1759000000 }, hosted_invoice_url: "https://h", invoice_pdf: "https://p",
    }));
    const inv = sb.linhas("Invoice")[0];
    assert.equal(inv.amount, 19.9);
    assert.equal(inv.status, "paid");
    assert.equal(inv.subscriptionId, "s1");
    assert.equal(inv.paidAt, new Date(1759000000 * 1000).toISOString());
    assert.equal(sb.linhas("Subscription")[0].status, "ACTIVE");
    const email = JSON.parse(rede.pedidosPara(/resend/)[0].corpo);
    assert.deepEqual(email.to, ["ana@exemplo.com"]);
    assert.match(email.subject, /Pro ativada/);
  });
});

Deno.test("fatura paga repetida: nenhum efeito colateral (nem e-mail)", async () => {
  await comAmbiente({ ...VARS, RESEND_API_KEY: "re_teste" }, async () => {
    const rede = comResend();
    const sb = banco([{ ...SUB }], { Invoice: [{ id: "i0", stripeInvoiceId: "in_1" }] });
    await processStripeEvent(sb, cliente(), ev("invoice.payment_succeeded", {
      id: "in_1", subscription: "sub_1", amount_paid: 1990, status_transitions: { paid_at: 1 },
    }));
    assert.equal(sb.escritas.length, 0);
    assert.equal(rede.pedidos.length, 0);
  });
});

Deno.test("fatura de assinatura desconhecida é ignorada em silêncio", async () => {
  await comAmbiente(VARS, async () => {
    const sb = banco([{ ...SUB }]);
    await processStripeEvent(sb, cliente(), ev("invoice.payment_succeeded", { id: "in_9", subscription: "sub_outra", amount_paid: 1 }));
    await processStripeEvent(sb, cliente(), ev("invoice.payment_failed", { id: "in_9", subscription: "sub_outra" }));
    assert.equal(sb.escritas.length, 0);
  });
});

Deno.test("pagamento falho: PAST_DUE, avisa o cliente e não cria fatura", async () => {
  await comAmbiente({ ...VARS, RESEND_API_KEY: "re_teste" }, async () => {
    const rede = comResend();
    const sb = banco([{ ...SUB, status: "ACTIVE" }]);
    await processStripeEvent(sb, cliente(), ev("invoice.payment_failed", { id: "in_2", subscription: "sub_1", customer_email: "ana@exemplo.com" }));
    assert.equal(sb.linhas("Subscription")[0].status, "PAST_DUE");
    assert.equal(sb.linhas("Invoice").length, 0);
    assert.equal(rede.pedidosPara(/resend/).length, 1);
  });
});

Deno.test("assinatura apagada no Stripe: CANCELED e o e-mail diz até quando o acesso vale", async () => {
  await comAmbiente({ ...VARS, RESEND_API_KEY: "re_teste" }, async () => {
    const rede = comResend();
    const sb = banco([{ ...SUB, status: "ACTIVE" }]);
    await processStripeEvent(sb, cliente(), ev("customer.subscription.deleted", {
      id: "sub_1", customer_email: "ana@exemplo.com", current_period_end: 1761000000,
    }));
    assert.equal(sb.linhas("Subscription")[0].status, "CANCELED");
    const texto = JSON.parse(rede.pedidosPara(/resend/)[0].corpo).text;
    assert.match(texto, /acesso ao plano até/);
  });
});

Deno.test("assinatura atualizada: espelha status, período e cancelamento do Stripe", async () => {
  await comAmbiente(VARS, async () => {
    const sb = banco([{ ...SUB }]);
    await processStripeEvent(sb, cliente(), ev("customer.subscription.updated", {
      id: "sub_1", status: "past_due", current_period_start: 1759000000, current_period_end: 1761600000, cancel_at_period_end: true,
    }));
    const sub = sb.linhas("Subscription")[0];
    assert.equal(sub.status, "PAST_DUE");
    assert.equal(sub.currentPeriodStart, new Date(1759000000 * 1000).toISOString());
    assert.equal(sub.currentPeriodEnd, new Date(1761600000 * 1000).toISOString());
    assert.equal(sub.cancelAtPeriodEnd, true);
  });
});

const SESSAO = { metadata: { orgId: "org1", planTier: "PRO", interval: "yearly" }, subscription: "sub_9", customer: "cus_9" };
const ASSINATURA_STRIPE = {
  id: "sub_9", status: "trialing", current_period_start: 1759000000, current_period_end: 1759604800,
  trial_end: 1759604800, cancel_at_period_end: false, metadata: {},
};

Deno.test("checkout concluído: cria a assinatura da org com os dados do Stripe", async () => {
  await comAmbiente(VARS, async () => {
    const st = cliente();
    stripe.respostas["subscriptions.retrieve"] = () => ASSINATURA_STRIPE;
    const sb = banco();
    await processStripeEvent(sb, st, ev("checkout.session.completed", SESSAO));
    const sub = sb.linhas("Subscription")[0];
    assert.equal(sub.orgId, "org1");
    assert.equal(sub.planId, "plan_pro");
    assert.equal(sub.status, "TRIALING");
    assert.equal(sub.billingInterval, "yearly");
    assert.equal(sub.stripeCustomerId, "cus_9");
    assert.equal(sub.stripeSubId, "sub_9");
    assert.equal(sub.trialEndsAt, new Date(1759604800 * 1000).toISOString());
  });
});

Deno.test("checkout concluído em org que já tem assinatura: atualiza, não duplica", async () => {
  await comAmbiente(VARS, async () => {
    const st = cliente();
    stripe.respostas["subscriptions.retrieve"] = () => ({ ...ASSINATURA_STRIPE, status: "active" });
    const sb = banco([{ id: "s1", orgId: "org1", planId: "plan_free", status: "ACTIVE", stripeSubId: "welcome:org1" }]);
    await processStripeEvent(sb, st, ev("checkout.session.completed", SESSAO));
    assert.equal(sb.linhas("Subscription").length, 1);
    assert.equal(sb.linhas("Subscription")[0].stripeSubId, "sub_9");
    assert.equal(sb.linhas("Subscription")[0].planId, "plan_pro");
  });
});

Deno.test("checkout concluído sem orgId, sem subscription ou com plano inexistente não grava nada", async () => {
  await comAmbiente(VARS, async () => {
    const st = cliente();
    stripe.respostas["subscriptions.retrieve"] = () => ({ ...ASSINATURA_STRIPE, metadata: {} });
    const sb = banco();
    await processStripeEvent(sb, st, ev("checkout.session.completed", { ...SESSAO, metadata: {} }));
    await processStripeEvent(sb, st, ev("checkout.session.completed", { ...SESSAO, subscription: null }));
    await processStripeEvent(sb, st, ev("checkout.session.completed", { ...SESSAO, metadata: { orgId: "org1", planTier: "ULTRA" } }));
    assert.equal(sb.escritas.length, 0);
    // Sem orgId nem subscription, nem pergunta ao Stripe.
    assert.equal(chamadas("subscriptions.retrieve").length, 1);
  });
});

Deno.test("checkout concluído: sem planTier na sessão, usa o dos metadados da assinatura", async () => {
  await comAmbiente(VARS, async () => {
    const st = cliente();
    stripe.respostas["subscriptions.retrieve"] = () => ({ ...ASSINATURA_STRIPE, metadata: { planTier: "PRO" } });
    const sb = banco();
    await processStripeEvent(sb, st, ev("checkout.session.completed", { ...SESSAO, metadata: { orgId: "org1" } }));
    assert.equal(sb.linhas("Subscription")[0].planId, "plan_pro");
    assert.equal(sb.linhas("Subscription")[0].billingInterval, "monthly");
  });
});

Deno.test("evento que o app não trata é aceito sem efeito colateral", async () => {
  await comAmbiente(VARS, async () => {
    const sb = banco([{ ...SUB }]);
    await processStripeEvent(sb, cliente(), ev("customer.created", { id: "cus_1" }));
    assert.equal(sb.escritas.length, 0);
    assert.equal(stripe.chamadas.length, 0);
  });
});
