// A biblioteca do Stripe de verdade (npm:stripe@22.6.2, a mesma de
// _shared/stripe.ts) contra o código de cobrança. Nos outros testes o Stripe é
// um dublê, que aceita qualquer formato; aqui a biblioteca monta os pedidos e
// lê as respostas, e o fetch falso faz o papel da API: confere o que chega
// (rota, versão da API, corpo) e responde no formato da versão fixada.
//
// Não substitui um teste no modo de teste do Stripe (a API de verdade valida
// preço, cliente e sessão): ver docs/release/ligar-operacao.md.
import assert from "node:assert/strict";
import StripeReal from "stripe-real";
import { BancoFalso } from "./dubles/banco.ts";
import { comAmbiente } from "./dubles/ambiente.ts";
import { STRIPE_API_VERSION } from "../_shared/stripe.ts";
import { cancelSubscription, createCheckout, createPortal, processStripeEvent } from "../_shared/stripe-billing.ts";
import { TRIAL_DAYS } from "../_shared/billing-constants.ts";

const APP = "https://app.financaspro.com";
const VARS = { APP_URL: APP };
const PLANOS = [{ id: "plan_pro", tier: "PRO", name: "Pro", active: true, stripePriceIdMonthly: "price_pro_m", stripePriceIdYearly: "price_pro_y" }];

interface Pedido {
  metodo: string;
  caminho: string;
  versao: string | null;
  corpo: URLSearchParams;
}

/** Cliente de verdade com a API trocada por `rotas` ("POST /v1/..." → objeto de resposta). */
function stripeReal(rotas: Record<string, (p: Pedido) => unknown>) {
  const pedidos: Pedido[] = [];
  const fetchFalso = async (url: string | URL, init: RequestInit = {}) => {
    const u = new URL(String(url));
    const cabecalhos = new Headers(init.headers as HeadersInit);
    const p: Pedido = {
      metodo: String(init.method || "GET"),
      caminho: u.pathname,
      versao: cabecalhos.get("stripe-version"),
      corpo: new URLSearchParams(typeof init.body === "string" ? init.body : ""),
    };
    pedidos.push(p);
    const rota = rotas[p.metodo + " " + p.caminho];
    if (!rota) {
      return new Response(JSON.stringify({ error: { type: "invalid_request_error", message: "rota sem dublê: " + p.caminho } }), { status: 404 });
    }
    return new Response(JSON.stringify(rota(p)), { status: 200, headers: { "Content-Type": "application/json", "Request-Id": "req_1" } });
  };
  const stripe = new StripeReal("sk_test_x", {
    apiVersion: STRIPE_API_VERSION as any,
    httpClient: StripeReal.createFetchHttpClient(fetchFalso as typeof fetch),
    maxNetworkRetries: 0,
  });
  return { stripe, pedidos };
}

Deno.test("a versão da API fixada no código é a da biblioteca importada", () => {
  assert.equal(STRIPE_API_VERSION, StripeReal.API_VERSION);
});

Deno.test("checkout: a biblioteca manda cliente e sessão com a versão fixada, e o código lê a resposta", async () => {
  await comAmbiente(VARS, async () => {
    const { stripe, pedidos } = stripeReal({
      "POST /v1/customers": () => ({ id: "cus_1", object: "customer" }),
      "POST /v1/checkout/sessions": () => ({ id: "cs_1", object: "checkout.session", url: "https://checkout.stripe.com/c/cs_1" }),
    });
    const sb = new BancoFalso({ Plan: PLANOS, Subscription: [], Invoice: [] });
    const r = await createCheckout(sb as any, stripe as any, {
      orgId: "org1", planTier: "PRO", interval: "yearly", userEmail: "ana@exemplo.com",
      successUrl: APP + "/?aba=config", cancelUrl: APP + "/",
    });
    assert.deepEqual(r, { url: "https://checkout.stripe.com/c/cs_1", sessionId: "cs_1" });

    assert.deepEqual(pedidos.map((p) => p.metodo + " " + p.caminho), ["POST /v1/customers", "POST /v1/checkout/sessions"]);
    assert.ok(pedidos.every((p) => p.versao === STRIPE_API_VERSION));
    assert.equal(pedidos[0].corpo.get("email"), "ana@exemplo.com");
    assert.equal(pedidos[0].corpo.get("metadata[orgId]"), "org1");

    const s = pedidos[1].corpo;
    assert.equal(s.get("mode"), "subscription");
    assert.equal(s.get("customer"), "cus_1");
    assert.equal(s.get("line_items[0][price]"), "price_pro_y");
    assert.equal(s.get("line_items[0][quantity]"), "1");
    assert.equal(s.get("allow_promotion_codes"), "true");
    assert.equal(s.get("subscription_data[trial_period_days]"), String(TRIAL_DAYS));
    assert.equal(s.get("subscription_data[metadata][planTier]"), "PRO");
    assert.equal(s.get("metadata[interval]"), "yearly");
    assert.equal(s.get("success_url"), APP + "/?aba=config&billing=success&session_id={CHECKOUT_SESSION_ID}");
  });
});

Deno.test("portal e cancelamento: rotas e corpo que a biblioteca monta", async () => {
  await comAmbiente(VARS, async () => {
    const { stripe, pedidos } = stripeReal({
      "POST /v1/billing_portal/sessions": () => ({ id: "bps_1", object: "billing_portal.session", url: "https://billing.stripe.com/p/1" }),
      "POST /v1/subscriptions/sub_1": (p) => ({ id: "sub_1", object: "subscription", cancel_at_period_end: p.corpo.get("cancel_at_period_end") === "true" }),
    });
    const sb = new BancoFalso({ Plan: PLANOS, Subscription: [{ id: "s1", orgId: "org1", planId: "plan_pro", stripeSubId: "sub_1", stripeCustomerId: "cus_1", status: "ACTIVE" }], Invoice: [] });
    assert.deepEqual(await createPortal(sb as any, stripe as any, { orgId: "org1", returnUrl: APP + "/" }), { url: "https://billing.stripe.com/p/1" });
    assert.equal(pedidos[0].corpo.get("customer"), "cus_1");
    assert.equal(pedidos[0].corpo.get("return_url"), APP + "/");

    await cancelSubscription(sb as any, stripe as any, { orgId: "org1" });
    assert.equal(pedidos[1].caminho, "/v1/subscriptions/sub_1");
    assert.equal(pedidos[1].corpo.get("cancel_at_period_end"), "true");
    assert.equal(sb.linhas("Subscription")[0].cancelAtPeriodEnd, true);
  });
});

Deno.test("erro da API chega como exceção da biblioteca, com o status", async () => {
  await comAmbiente(VARS, async () => {
    const { stripe } = stripeReal({});
    const sb = new BancoFalso({ Plan: PLANOS, Subscription: [{ id: "s1", orgId: "org1", planId: "plan_pro", stripeCustomerId: "cus_1", status: "ACTIVE" }], Invoice: [] });
    await assert.rejects(
      createPortal(sb as any, stripe as any, { orgId: "org1", returnUrl: APP + "/" }),
      (e: any) => e.statusCode === 404 && /rota sem dublê/.test(e.message),
    );
  });
});

// ─── Webhook: assinatura (Web Crypto de verdade) e formato da versão fixada ─

const SEGREDO = "whsec_teste";

async function assinado(stripe: StripeReal, evento: unknown) {
  const corpo = JSON.stringify(evento);
  const cabecalho = await stripe.webhooks.generateTestHeaderStringAsync({ payload: corpo, secret: SEGREDO });
  return { corpo, cabecalho };
}

Deno.test("webhook: a verificação da biblioteca aceita a assinatura certa e recusa corpo mexido, segredo errado e evento velho", async () => {
  const { stripe } = stripeReal({});
  const cripto = StripeReal.createSubtleCryptoProvider();
  const { corpo, cabecalho } = await assinado(stripe, { id: "evt_1", object: "event", type: "invoice.paid", data: { object: {} } });

  const ev = await stripe.webhooks.constructEventAsync(corpo, cabecalho, SEGREDO, undefined, cripto);
  assert.equal(ev.id, "evt_1");

  await assert.rejects(stripe.webhooks.constructEventAsync(corpo.replace("evt_1", "evt_2"), cabecalho, SEGREDO, undefined, cripto));
  await assert.rejects(stripe.webhooks.constructEventAsync(corpo, cabecalho, "whsec_outro", undefined, cripto));
  const velho = await stripe.webhooks.generateTestHeaderStringAsync({ payload: corpo, secret: SEGREDO, timestamp: Math.floor(Date.now() / 1000) - 3600 });
  await assert.rejects(stripe.webhooks.constructEventAsync(corpo, velho, SEGREDO, undefined, cripto));
});

Deno.test("webhook no formato da versão fixada: checkout concluído busca a assinatura e grava o período do item", async () => {
  await comAmbiente(VARS, async () => {
    const { stripe, pedidos } = stripeReal({
      "GET /v1/subscriptions/sub_9": () => ({
        id: "sub_9", object: "subscription", status: "trialing", customer: "cus_9", trial_end: 1759604800,
        cancel_at_period_end: false, metadata: {},
        items: { object: "list", data: [{ id: "si_1", object: "subscription_item", current_period_start: 1759000000, current_period_end: 1759604800 }] },
      }),
    });
    const { corpo, cabecalho } = await assinado(stripe, {
      id: "evt_9", object: "event", api_version: STRIPE_API_VERSION, type: "checkout.session.completed",
      data: { object: { id: "cs_9", object: "checkout.session", subscription: "sub_9", customer: "cus_9", metadata: { orgId: "org1", planTier: "PRO", interval: "monthly" } } },
    });
    const ev = await stripe.webhooks.constructEventAsync(corpo, cabecalho, SEGREDO, undefined, StripeReal.createSubtleCryptoProvider());

    const sb = new BancoFalso({ Plan: PLANOS, Subscription: [], Invoice: [] });
    await processStripeEvent(sb as any, stripe as any, ev as any);
    assert.equal(pedidos[0].caminho, "/v1/subscriptions/sub_9");
    assert.equal(pedidos[0].versao, STRIPE_API_VERSION);
    const sub = sb.linhas("Subscription")[0];
    assert.equal(sub.stripeSubId, "sub_9");
    assert.equal(sub.status, "TRIALING");
    assert.equal(sub.currentPeriodStart, new Date(1759000000 * 1000).toISOString());
    assert.equal(sub.currentPeriodEnd, new Date(1759604800 * 1000).toISOString());
  });
});

Deno.test("webhook no formato da versão fixada: assinatura apagada busca o e-mail no cliente", async () => {
  await comAmbiente(VARS, async () => {
    const { stripe, pedidos } = stripeReal({
      "GET /v1/customers/cus_1": () => ({ id: "cus_1", object: "customer", email: "ana@exemplo.com" }),
    });
    const sb = new BancoFalso({ Plan: PLANOS, Subscription: [{ id: "s1", orgId: "org1", planId: "plan_pro", stripeSubId: "sub_1", status: "ACTIVE" }], Invoice: [] });
    await processStripeEvent(sb as any, stripe as any, {
      id: "evt_2", type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", object: "subscription", customer: "cus_1", items: { object: "list", data: [{ current_period_end: 1761000000 }] } } },
    } as any);
    assert.equal(sb.linhas("Subscription")[0].status, "CANCELED");
    assert.equal(pedidos[0].caminho, "/v1/customers/cus_1");
  });
});
