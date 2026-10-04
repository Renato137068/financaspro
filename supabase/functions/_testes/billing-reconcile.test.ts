// billing-reconcile inteiro (index.ts + _shared/reconcile.ts + play-billing +
// db), com Request de verdade, banco em memória, Google por fetch falso e o
// dublê do Stripe. Substitui o worker billing-reconcile do Express; os casos
// de tests/backend/billing-reconcile* que valiam continuam aqui, e os que só
// existem agora: perguntar ao Google antes de revogar e a carência quando o
// Google falha.
import assert from "node:assert/strict";
import { BancoFalso } from "./dubles/banco.ts";
import { usarBanco } from "./dubles/supabase-js.ts";
import { estado as stripe } from "./dubles/stripe.ts";
import { contaDeServico, emDias, google, Rede } from "./dubles/rede.ts";
import { comAmbiente, emailUnico, tokenDeCompra } from "./dubles/ambiente.ts";

type Handler = (req: Request) => Promise<Response>;
let handler: Handler | null = null;
const serveOriginal = Deno.serve;
(Deno as any).serve = (fn: Handler) => {
  handler = fn;
  return { finished: Promise.resolve(), shutdown() {} };
};
await import("../billing-reconcile/index.ts");
(Deno as any).serve = serveOriginal;
const reconciliar = handler!;

const BASE = { SUPABASE_URL: "http://sb.test", SUPABASE_SERVICE_ROLE_KEY: "srk", BILLING_RECONCILE_SECRET: "cron-123" };
const PLANOS = [{ id: "plan_pro", tier: "PRO", name: "Pro", active: true }];
const ONTEM = emDias(-1);
const SEMANA_PASSADA = emDias(-7);

function pedido(segredo: string | null = "cron-123", metodo = "POST") {
  return new Request("http://fn.test/billing-reconcile", {
    method: metodo,
    headers: segredo === null ? {} : { "x-fp-cron-secret": segredo },
  });
}

function banco(assinaturas: Record<string, unknown>[]) {
  const sb = new BancoFalso({ Plan: PLANOS, Subscription: assinaturas });
  usarBanco(sb);
  stripe.reset();
  return sb;
}

const play = (orgId: string, token: string, fim: string, status = "ACTIVE") => ({
  id: "s-" + orgId, orgId, planId: "plan_pro", stripeSubId: "play:" + token, status, currentPeriodEnd: fim,
});

async function comGoogle(assinaturas: Parameters<typeof google>[1]) {
  google(new Rede(), assinaturas).instalar();
  return { ...BASE, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: await contaDeServico(emailUnico()) };
}

// ─── Quem pode chamar ───────────────────────────────────────────────────────

Deno.test("billing-reconcile: só POST, com o segredo certo; sem segredo configurado recusa tudo", async () => {
  await comAmbiente(BASE, async () => {
    const sb = banco([play("org1", tokenDeCompra("a"), ONTEM)]);
    assert.equal((await reconciliar(pedido("cron-123", "GET"))).status, 405);
    assert.equal((await reconciliar(pedido(null))).status, 403);
    assert.equal((await reconciliar(pedido("errado"))).status, 403);
    assert.equal(sb.escritas.length, 0);
  });
  await comAmbiente({ SUPABASE_URL: "http://sb.test", SUPABASE_SERVICE_ROLE_KEY: "srk" }, async () => {
    const sb = banco([play("org1", tokenDeCompra("a"), ONTEM)]);
    assert.equal((await reconciliar(pedido("qualquer"))).status, 503);
    assert.equal(sb.escritas.length, 0);
  });
});

// ─── Play ───────────────────────────────────────────────────────────────────

Deno.test("billing-reconcile: Play renovada cujo RTDN se perdeu ganha a validade nova, não é revogada", async () => {
  const token = tokenDeCompra("renovou");
  const novoFim = emDias(29);
  const vars = await comGoogle({
    [token]: { subscriptionState: "SUBSCRIPTION_STATE_ACTIVE", lineItems: [{ productId: "financaspro.pro.monthly", expiryTime: novoFim }] },
  });
  await comAmbiente(vars, async () => {
    const sb = banco([play("org1", token, ONTEM)]);
    const r = await reconciliar(pedido());
    assert.equal(r.status, 200);
    const corpo = await r.json();
    assert.deepEqual(corpo.play, { vencidas: 1, renovadas: 1, revogadas: 0, falhas: 0, semGoogle: false });
    const sub = sb.linhas("Subscription")[0];
    assert.equal(sub.status, "ACTIVE");
    assert.equal(sub.currentPeriodEnd, novoFim);
  });
});

Deno.test("billing-reconcile: Play que o Google dá por expirada é revogada", async () => {
  const token = tokenDeCompra("expirou");
  const vars = await comGoogle({
    [token]: { subscriptionState: "SUBSCRIPTION_STATE_EXPIRED", lineItems: [{ productId: "financaspro.pro.monthly", expiryTime: ONTEM }] },
  });
  await comAmbiente(vars, async () => {
    const sb = banco([play("org1", token, ONTEM)]);
    const corpo = await (await reconciliar(pedido())).json();
    assert.equal(corpo.play.revogadas, 1);
    const sub = sb.linhas("Subscription")[0];
    assert.equal(sub.status, "CANCELED");
    assert.equal(sub.cancelAtPeriodEnd, true);
  });
});

Deno.test("billing-reconcile: Google fora do ar dentro da carência não escreve; depois dela, revoga pela data", async () => {
  const recente = tokenDeCompra("recente");
  const antiga = tokenDeCompra("antiga");
  const vars = await comGoogle({ [recente]: 500, [antiga]: 500 });
  await comAmbiente(vars, async () => {
    const sb = banco([play("org1", recente, ONTEM), play("org2", antiga, SEMANA_PASSADA)]);
    const corpo = await (await reconciliar(pedido())).json();
    assert.deepEqual(corpo.play, { vencidas: 2, renovadas: 0, revogadas: 1, falhas: 1, semGoogle: false });
    const [a, b] = sb.linhas("Subscription");
    assert.equal(a.status, "ACTIVE", "dentro da carência fica como está para a próxima rodada");
    assert.equal(b.status, "CANCELED");
    assert.equal(b.currentPeriodEnd, SEMANA_PASSADA, "revoga mantendo o fim do período que já tinha");
  });
});

Deno.test("billing-reconcile: sem conta de serviço do Google, revoga pela data (critério do worker do Express)", async () => {
  await comAmbiente(BASE, async () => {
    const sb = banco([play("org1", tokenDeCompra("x"), ONTEM)]);
    const corpo = await (await reconciliar(pedido())).json();
    assert.deepEqual(corpo.play, { vencidas: 1, renovadas: 0, revogadas: 1, falhas: 0, semGoogle: true });
    assert.equal(sb.linhas("Subscription")[0].status, "CANCELED");
  });
});

Deno.test("billing-reconcile: não toca em Play dentro do período, já cancelada, nem em assinatura do Stripe", async () => {
  await comAmbiente(BASE, async () => {
    const sb = banco([
      play("org1", tokenDeCompra("vale"), emDias(10)),
      play("org2", tokenDeCompra("cancelada"), ONTEM, "CANCELED"),
      { id: "s3", orgId: "org3", planId: "plan_pro", stripeSubId: "sub_3", status: "ACTIVE", currentPeriodEnd: ONTEM },
    ]);
    const corpo = await (await reconciliar(pedido())).json();
    assert.equal(corpo.play.vencidas, 0);
    assert.deepEqual(corpo.stripe, { pulado: "stripe-nao-configurado" });
    assert.equal(sb.escritas.length, 0);
  });
});

// ─── Stripe ─────────────────────────────────────────────────────────────────

Deno.test("billing-reconcile: Stripe relido na API grava status, período (formato dahlia) e cancelamento", async () => {
  await comAmbiente({ ...BASE, STRIPE_SECRET_KEY: "sk_test_x" }, async () => {
    const sb = banco([
      { id: "s1", orgId: "org1", planId: "plan_pro", stripeSubId: "sub_1", status: "ACTIVE", currentPeriodEnd: ONTEM },
      { id: "s2", orgId: "org2", planId: "plan_pro", stripeSubId: "sub_2", status: "CANCELED" },
      play("org3", tokenDeCompra("p"), emDias(5)),
      { id: "s4", orgId: "org4", planId: "plan_pro", stripeSubId: null, status: "ACTIVE" },
    ]);
    stripe.respostas["subscriptions.retrieve"] = (id: string) => ({
      id, status: "past_due", cancel_at_period_end: true,
      items: { data: [{ current_period_start: 1759000000, current_period_end: 1761600000 }] },
    });
    const corpo = await (await reconciliar(pedido())).json();
    assert.deepEqual(corpo.stripe, { conferidas: 1, atualizadas: 1, falhas: 0 });
    assert.deepEqual(stripe.chamadas.map((c) => c.args[0]), ["sub_1"], "só a do Stripe que não está cancelada");
    const sub = sb.linhas("Subscription")[0];
    assert.equal(sub.status, "PAST_DUE");
    assert.equal(sub.cancelAtPeriodEnd, true);
    assert.equal(sub.currentPeriodEnd, new Date(1761600000 * 1000).toISOString());
  });
});

Deno.test("billing-reconcile: erro do Stripe numa assinatura não escreve nela nem para as outras", async () => {
  await comAmbiente({ ...BASE, STRIPE_SECRET_KEY: "sk_test_x" }, async () => {
    const sb = banco([
      { id: "s1", orgId: "org1", planId: "plan_pro", stripeSubId: "sub_sumiu", status: "ACTIVE" },
      { id: "s2", orgId: "org2", planId: "plan_pro", stripeSubId: "sub_ok", status: "TRIALING" },
    ]);
    stripe.respostas["subscriptions.retrieve"] = (id: string) => {
      if (id === "sub_sumiu") throw Object.assign(new Error("No such subscription"), { code: "resource_missing" });
      return { id, status: "active", cancel_at_period_end: false, current_period_start: 1759000000, current_period_end: 1761600000 };
    };
    const corpo = await (await reconciliar(pedido())).json();
    assert.deepEqual(corpo.stripe, { conferidas: 2, atualizadas: 1, falhas: 1 });
    const [a, b] = sb.linhas("Subscription");
    assert.equal(a.status, "ACTIVE", "'não existe' não vira cancelamento: chave de teste contra id de produção");
    assert.equal(b.status, "ACTIVE");
  });
});

Deno.test("billing-reconcile: erro do banco vira 500 sem detalhe", async () => {
  await comAmbiente(BASE, async (logs) => {
    const sb = banco([]);
    sb.from = () => { throw new Error("conexão recusada"); };
    const r = await reconciliar(pedido());
    assert.equal(r.status, 500);
    assert.deepEqual(await r.json(), { error: "erro-interno" });
    assert.ok(logs.error.length > 0);
  });
});
