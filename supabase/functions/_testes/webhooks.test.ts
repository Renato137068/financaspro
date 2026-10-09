// Handlers inteiros de stripe-webhook e play-rtdn: o `Deno.serve` de cada
// index.ts é capturado aqui, e cada teste manda uma Request de verdade.
// O que só existe no handler (e não nos módulos _shared): quem é aceito,
// idempotência por id de evento e liberação do claim quando o processamento
// falha — é o que permite ao Stripe e ao Pub/Sub reentregarem.
import assert from "node:assert/strict";
import { BancoFalso } from "./dubles/banco.ts";
import { usarBanco } from "./dubles/supabase-js.ts";
import { estado as stripe } from "./dubles/stripe.ts";
import { contaDeServico, emDias, google, json, Rede } from "./dubles/rede.ts";
import { comAmbiente, emailUnico, tokenDeCompra } from "./dubles/ambiente.ts";

type Handler = (req: Request) => Promise<Response>;
const handlers: Handler[] = [];
const serveOriginal = Deno.serve;
(Deno as any).serve = (fn: Handler) => {
  handlers.push(fn);
  return { finished: Promise.resolve(), shutdown() {} };
};
await import("../stripe-webhook/index.ts");
await import("../play-rtdn/index.ts");
(Deno as any).serve = serveOriginal;
const [stripeWebhook, playRtdn] = handlers;

const BASE = { SUPABASE_URL: "http://sb.test", SUPABASE_SERVICE_ROLE_KEY: "srk" };
const PLANOS = [{ id: "plan_pro", tier: "PRO", name: "Pro", active: true }];

// ─── stripe-webhook ─────────────────────────────────────────────────────────

const STRIPE_VARS = { ...BASE, STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" };

function eventoStripe(id: string, type: string, object: Record<string, unknown>, assinatura = "valida") {
  return new Request("http://fn.test/stripe-webhook", {
    method: "POST",
    headers: { "stripe-signature": assinatura },
    body: JSON.stringify({ id, type, data: { object } }),
  });
}

const ATUALIZADA = {
  id: "sub_1", status: "active", current_period_start: 1759000000, current_period_end: 1761600000, cancel_at_period_end: false,
};

function bancoStripe() {
  const sb = new BancoFalso({
    Plan: PLANOS,
    Subscription: [{ id: "s1", orgId: "org1", planId: "plan_pro", stripeSubId: "sub_1", status: "TRIALING" }],
    StripeWebhookEvent: [],
  });
  usarBanco(sb);
  stripe.reset();
  return sb;
}

Deno.test("stripe-webhook: só POST", async () => {
  await comAmbiente(STRIPE_VARS, async () => {
    bancoStripe();
    const r = await stripeWebhook(new Request("http://fn.test/stripe-webhook"));
    assert.equal(r.status, 405);
  });
});

Deno.test("stripe-webhook: sem assinatura ou sem segredo configurado é 400 e nada é processado", async () => {
  await comAmbiente(STRIPE_VARS, async () => {
    const sb = bancoStripe();
    const semHeader = new Request("http://fn.test/stripe-webhook", { method: "POST", body: "{}" });
    assert.equal((await stripeWebhook(semHeader)).status, 400);
    assert.equal(sb.escritas.length, 0);
  });
  await comAmbiente({ ...BASE, STRIPE_SECRET_KEY: "sk_test_x" }, async () => {
    const sb = bancoStripe();
    assert.equal((await stripeWebhook(eventoStripe("evt_1", "customer.subscription.updated", ATUALIZADA))).status, 400);
    assert.equal(sb.escritas.length, 0);
  });
});

Deno.test("stripe-webhook: assinatura inválida é 400 e nada é processado", async () => {
  await comAmbiente(STRIPE_VARS, async () => {
    const sb = bancoStripe();
    const r = await stripeWebhook(eventoStripe("evt_1", "customer.subscription.updated", ATUALIZADA, "forjada"));
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { error: "assinatura-invalida" });
    assert.equal(sb.escritas.length, 0);
  });
});

Deno.test("stripe-webhook: evento válido é processado uma vez; reentrega do mesmo id é só reconhecida", async () => {
  await comAmbiente(STRIPE_VARS, async () => {
    const sb = bancoStripe();
    const r1 = await stripeWebhook(eventoStripe("evt_7", "customer.subscription.updated", ATUALIZADA));
    assert.equal(r1.status, 200);
    assert.deepEqual(await r1.json(), { received: true });
    assert.equal(sb.linhas("Subscription")[0].status, "ACTIVE");

    const antes = sb.escritasEm("Subscription").length;
    const r2 = await stripeWebhook(eventoStripe("evt_7", "customer.subscription.updated", { ...ATUALIZADA, status: "canceled" }));
    assert.equal(r2.status, 200);
    assert.deepEqual(await r2.json(), { received: true, duplicate: true });
    assert.equal(sb.escritasEm("Subscription").length, antes);
    assert.equal(sb.linhas("Subscription")[0].status, "ACTIVE");
  });
});

Deno.test("stripe-webhook: falha no processamento libera o claim (500) para o Stripe reentregar", async () => {
  await comAmbiente(STRIPE_VARS, async () => {
    const sb = bancoStripe();
    stripe.respostas["subscriptions.retrieve"] = () => {
      throw new Error("Stripe indisponível");
    };
    const sessao = { metadata: { orgId: "org1", planTier: "PRO" }, subscription: "sub_9", customer: "cus_9" };
    const r = await stripeWebhook(eventoStripe("evt_9", "checkout.session.completed", sessao));
    assert.equal(r.status, 500);
    assert.equal(sb.linhas("StripeWebhookEvent").length, 0, "claim liberado");

    // Na reentrega, com o Stripe de volta, processa normalmente.
    stripe.respostas["subscriptions.retrieve"] = () => ({ ...ATUALIZADA, id: "sub_9", status: "active", metadata: {} });
    const r2 = await stripeWebhook(eventoStripe("evt_9", "checkout.session.completed", sessao));
    assert.equal(r2.status, 200);
    assert.equal(sb.linhas("Subscription")[0].stripeSubId, "sub_9");
  });
});

// ─── play-rtdn ──────────────────────────────────────────────────────────────

function envelope(messageId: string | null, notificacao: unknown) {
  const data = btoa(JSON.stringify(notificacao));
  return { message: { ...(messageId ? { messageId } : {}), data } };
}

function rtdn(corpo: unknown, headers: Record<string, string> = {}) {
  return new Request("http://fn.test/play-rtdn", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(corpo),
  });
}

async function bancoPlay(token: string, assinaturaGoogle: Record<string, unknown>) {
  const sb = new BancoFalso({
    Plan: PLANOS,
    Subscription: [{ id: "s1", orgId: "org1", planId: "plan_pro", status: "ACTIVE", stripeSubId: "play:" + token }],
    StripeWebhookEvent: [],
  });
  usarBanco(sb);
  const rede = google(new Rede(), { [token]: assinaturaGoogle as any }).instalar();
  return { sb, rede, sa: await contaDeServico(emailUnico()) };
}

const EXPIRADA = { subscriptionState: "SUBSCRIPTION_STATE_EXPIRED", lineItems: [{ productId: "financaspro.pro.monthly", expiryTime: emDias(-1) }] };

Deno.test("play-rtdn: sem nenhum mecanismo de autenticação configurado recusa tudo (503)", async () => {
  await comAmbiente(BASE, async () => {
    const { sb } = await bancoPlay(tokenDeCompra("a"), EXPIRADA);
    const r = await playRtdn(rtdn(envelope("m1", { subscriptionNotification: { purchaseToken: tokenDeCompra("a") } })));
    assert.equal(r.status, 503);
    assert.equal(sb.escritas.length, 0);
  });
});

Deno.test("play-rtdn: segredo errado ou ausente é 403; ?secret= na URL não vale", async () => {
  await comAmbiente({ ...BASE, PLAY_RTDN_SECRET: "segredo-certo" }, async () => {
    const token = tokenDeCompra("b");
    const { sb } = await bancoPlay(token, EXPIRADA);
    const corpo = envelope("m1", { subscriptionNotification: { purchaseToken: token } });
    assert.equal((await playRtdn(rtdn(corpo, { "x-rtdn-secret": "segredo-errado" }))).status, 403);
    assert.equal((await playRtdn(rtdn(corpo))).status, 403);
    const naUrl = new Request("http://fn.test/play-rtdn?secret=segredo-certo", { method: "POST", body: JSON.stringify(corpo) });
    assert.equal((await playRtdn(naUrl)).status, 403);
    assert.equal(sb.escritas.length, 0);
  });
});

Deno.test("play-rtdn: segredo certo processa a notificação e revoga a assinatura expirada", async () => {
  const token = tokenDeCompra("c");
  const { sb, sa } = await bancoPlay(token, EXPIRADA);
  await comAmbiente({ ...BASE, PLAY_RTDN_SECRET: "segredo-certo", GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: sa }, async () => {
    google(new Rede(), { [token]: EXPIRADA as any }).instalar();
    const r = await playRtdn(rtdn(envelope("m2", { subscriptionNotification: { notificationType: 13, purchaseToken: token } }), { "x-rtdn-secret": "segredo-certo" }));
    assert.equal(r.status, 200);
    const out = await r.json();
    assert.equal(out.ok, true);
    assert.equal(out.entitled, false);
    assert.equal(sb.linhas("Subscription")[0].status, "CANCELED");
  });
});

Deno.test("play-rtdn: OIDC do Pub/Sub com a conta de serviço esperada é aceito; outra conta não", async () => {
  const token = tokenDeCompra("d");
  const { sa } = await bancoPlay(token, EXPIRADA);
  await comAmbiente({ ...BASE, PLAY_RTDN_SERVICE_ACCOUNT: "pubsub@proj.iam.gserviceaccount.com", GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: sa }, async () => {
    const rede = google(new Rede(), { [token]: EXPIRADA as any });
    rede.rota(/oauth2\.googleapis\.com\/tokeninfo/, (p) => {
      const id = new URL(p.url).searchParams.get("id_token");
      if (id === "token-bom") return json({ email: "pubsub@proj.iam.gserviceaccount.com", email_verified: "true" });
      if (id === "token-alheio") return json({ email: "outro@proj.iam.gserviceaccount.com", email_verified: "true" });
      return json({ error: "invalid_token" }, 400);
    }).instalar();
    const corpo = envelope("m3", { subscriptionNotification: { purchaseToken: token } });
    assert.equal((await playRtdn(rtdn(corpo, { authorization: "Bearer token-alheio" }))).status, 403);
    assert.equal((await playRtdn(rtdn(corpo, { authorization: "Bearer lixo" }))).status, 403);
    assert.equal((await playRtdn(rtdn(corpo, { authorization: "Bearer token-bom" }))).status, 200);
    const consultas = rede.pedidosPara(/tokeninfo/);
    assert.ok(consultas.length > 0 && consultas.every((p) => p.sinal), "tokeninfo sem tempo limite");
  });
});

Deno.test("play-rtdn: reentrega do mesmo messageId é reconhecida sem reprocessar", async () => {
  const token = tokenDeCompra("e");
  const { sb, sa, rede } = await bancoPlay(token, EXPIRADA);
  await comAmbiente({ ...BASE, PLAY_RTDN_SECRET: "s", GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: sa }, async () => {
    rede.instalar();
    const corpo = envelope("m4", { subscriptionNotification: { purchaseToken: token } });
    assert.equal((await playRtdn(rtdn(corpo, { "x-rtdn-secret": "s" }))).status, 200);
    const consultas = rede.pedidosPara(/subscriptionsv2/).length;
    const r2 = await playRtdn(rtdn(corpo, { "x-rtdn-secret": "s" }));
    assert.deepEqual(await r2.json(), { duplicate: true });
    assert.equal(rede.pedidosPara(/subscriptionsv2/).length, consultas);
    assert.equal(sb.linhas("StripeWebhookEvent")[0].id, "rtdn:m4");
  });
});

Deno.test("play-rtdn: envelope vazio é reconhecido (204) para o Pub/Sub não reenviar", async () => {
  await comAmbiente({ ...BASE, PLAY_RTDN_SECRET: "s" }, async () => {
    const { sb } = await bancoPlay(tokenDeCompra("f"), EXPIRADA);
    const r = await playRtdn(rtdn({ message: { messageId: "m5" } }, { "x-rtdn-secret": "s" }));
    assert.equal(r.status, 204);
    assert.equal(sb.escritas.length, 0);
  });
});

Deno.test("play-rtdn: falha ao falar com o Google libera o claim (500) para o Pub/Sub reentregar", async () => {
  const token = tokenDeCompra("g");
  const { sb, sa } = await bancoPlay(token, EXPIRADA);
  await comAmbiente({ ...BASE, PLAY_RTDN_SECRET: "s", GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: sa }, async () => {
    google(new Rede(), { [token]: 503 }).instalar();
    const corpo = envelope("m6", { subscriptionNotification: { purchaseToken: token } });
    const r = await playRtdn(rtdn(corpo, { "x-rtdn-secret": "s" }));
    assert.equal(r.status, 500);
    assert.equal(sb.linhas("StripeWebhookEvent").length, 0, "claim liberado");
    assert.equal(sb.linhas("Subscription")[0].status, "ACTIVE", "não revogou por falha do Google");
  });
});

// ─── Gravação recusada pelo banco ───────────────────────────────────────────
// O supabase-js não lança em erro de banco. Antes, a escrita recusada passava
// por gravada: 200 para a loja, claim mantido, aviso perdido para sempre.

Deno.test("stripe-webhook: gravação recusada pelo banco é 500 e libera o claim", async () => {
  await comAmbiente(STRIPE_VARS, async (logs) => {
    const sb = bancoStripe();
    sb.falharEm("Subscription", "update", "connection reset");
    const r = await stripeWebhook(eventoStripe("evt_db", "customer.subscription.updated", ATUALIZADA));
    assert.equal(r.status, 500);
    assert.deepEqual(await r.json(), { error: "erro-interno" });
    assert.equal(sb.linhas("StripeWebhookEvent").length, 0, "claim liberado");
    assert.equal(sb.linhas("Subscription")[0].status, "TRIALING");
    assert.ok(logs.error.some((l) => String(l[1]).includes("connection reset")));
  });
});

Deno.test("stripe-webhook: status 'incomplete' do Stripe grava a assinatura (antes: recusado pelo enum, 200 e nada gravado)", async () => {
  await comAmbiente(STRIPE_VARS, async () => {
    const sb = bancoStripe();
    stripe.respostas["subscriptions.retrieve"] = () => ({ ...ATUALIZADA, id: "sub_9", status: "incomplete", metadata: {} });
    const sessao = { metadata: { orgId: "org1", planTier: "PRO" }, subscription: "sub_9", customer: "cus_9" };
    const r = await stripeWebhook(eventoStripe("evt_inc", "checkout.session.completed", sessao));
    assert.equal(r.status, 200);
    const sub = sb.linhas("Subscription")[0];
    assert.equal(sub.stripeSubId, "sub_9");
    assert.equal(sub.status, "UNPAID");
  });
});

Deno.test("play-rtdn: gravação recusada pelo banco é 500 e libera o claim", async () => {
  const token = tokenDeCompra("h");
  const { sb, sa } = await bancoPlay(token, EXPIRADA);
  await comAmbiente({ ...BASE, PLAY_RTDN_SECRET: "s", GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: sa }, async () => {
    google(new Rede(), { [token]: EXPIRADA as any }).instalar();
    sb.falharEm("Subscription", "update");
    const r = await playRtdn(rtdn(envelope("m7", { subscriptionNotification: { purchaseToken: token } }), { "x-rtdn-secret": "s" }));
    assert.equal(r.status, 500);
    assert.equal(sb.linhas("StripeWebhookEvent").length, 0, "claim liberado");
    assert.equal(sb.linhas("Subscription")[0].status, "ACTIVE");
  });
});
