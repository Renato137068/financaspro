// Google Play nas Edge Functions (_shared/play-billing.ts + db.ts +
// google-play.ts), executados de verdade: banco em memória, Google por fetch
// falso, JWT da conta de serviço assinado com uma chave RSA gerada aqui.
// Casos portados de tests/backend/play-billing.service.test.js (Express) e os
// que só existem na Edge Function (sandbox só com opt-in, pacote da env,
// chave legada truncada, compra anulada).
import assert from "node:assert/strict";
import { BancoFalso } from "./dubles/banco.ts";
import { contaDeServico, emDias, google, Rede } from "./dubles/rede.ts";
import { comAmbiente, emailUnico, falhaCom, tokenDeCompra } from "./dubles/ambiente.ts";
import { handleRtdn, resolveTier, syncFromToken, verifyPurchase } from "../_shared/play-billing.ts";
import { findByPlayPurchaseToken, revokePlayEntitlement } from "../_shared/db.ts";

const PLANOS = [
  { id: "plan_pro", tier: "PRO", name: "Pro", active: true },
  { id: "plan_biz", tier: "BUSINESS", name: "Business", active: true },
];

function banco(extra: Record<string, any[]> = {}) {
  return new BancoFalso({ Plan: PLANOS, Subscription: [], ...extra });
}

async function comGoogle(assinaturas: Parameters<typeof google>[1], vars: Record<string, string> = {}) {
  const rede = google(new Rede(), assinaturas).instalar();
  const sa = await contaDeServico(emailUnico());
  return { rede, vars: { GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: sa, ...vars } };
}

const ATIVA = (productId: string, dias = 30, extra: Record<string, unknown> = {}) => ({
  subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
  lineItems: [{ productId, expiryTime: emDias(dias), ...extra }],
});

// ─── verifyPurchase ─────────────────────────────────────────────────────────

Deno.test("verifyPurchase: token curto ou produto desconhecido é 400, sem tocar no Google nem no banco", async () => {
  await comAmbiente({}, async () => {
    const sb = banco();
    await falhaCom(verifyPurchase(sb, "org1", { productId: "financaspro.pro.monthly", purchaseToken: "curto" }), 400, "purchase-token-invalido");
    await falhaCom(verifyPurchase(sb, "org1", { productId: "outro.app", purchaseToken: tokenDeCompra("a") }), 400, "produto-desconhecido");
    assert.equal(sb.escritas.length, 0);
  });
});

Deno.test("verifyPurchase: sem conta de serviço é 503 — e token GPA.test.* NÃO vira Pro sem o opt-in de sandbox", async () => {
  await comAmbiente({}, async () => {
    const sb = banco();
    await falhaCom(
      verifyPurchase(sb, "org1", { productId: "financaspro.pro.monthly", purchaseToken: "GPA.test.1234-5678-9012-34567" }),
      503, "play-api-nao-configurada",
    );
    assert.equal(sb.escritas.length, 0);
  });
});

Deno.test("verifyPurchase: sandbox ligado de propósito aceita GPA.test.* por 30 dias", async () => {
  await comAmbiente({ PLAY_SANDBOX_ENABLED: "true" }, async () => {
    const sb = banco();
    const r = await verifyPurchase(sb, "org1", { productId: "financaspro.pro.monthly", purchaseToken: "GPA.test.1234-5678-9012-34567" });
    assert.equal(r.tier, "PRO");
    const sub = sb.linhas("Subscription")[0];
    assert.equal(sub.status, "ACTIVE");
    assert.equal(sub.stripeSubId, "play:GPA.test.1234-5678-9012-34567");
    const dias = (new Date(sub.currentPeriodEnd).getTime() - Date.now()) / 86400000;
    assert.ok(dias > 29 && dias <= 30, `validade de ~30 dias, veio ${dias}`);
  });
});

Deno.test("verifyPurchase: usa validade e produto reais do Google e grava a assinatura", async () => {
  const token = tokenDeCompra("real");
  const expira = emDias(31);
  const { rede, vars } = await comGoogle({
    [token]: { subscriptionState: "SUBSCRIPTION_STATE_ACTIVE", lineItems: [{ productId: "financaspro.pro.monthly", expiryTime: expira }] },
  });
  await comAmbiente(vars, async () => {
    const sb = banco();
    const r = await verifyPurchase(sb, "org1", { productId: "financaspro.pro.monthly", purchaseToken: token });
    assert.deepEqual(r, { tier: "PRO", productId: "financaspro.pro.monthly", expiresAt: expira, cancelAtPeriodEnd: false, restored: false });
    const sub = sb.linhas("Subscription")[0];
    assert.equal(sub.orgId, "org1");
    assert.equal(sub.planId, "plan_pro");
    assert.equal(sub.billingInterval, "monthly");
    assert.equal(sub.currentPeriodEnd, expira);
    // A API foi chamada com um bearer obtido pelo JWT da conta de serviço.
    const oauth = rede.pedidosPara(/oauth2\.googleapis\.com\/token/)[0];
    assert.match(oauth.corpo, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
    assert.match(oauth.corpo, /assertion=[\w-]+\.[\w-]+\.[\w-]+/);
    assert.equal(rede.pedidosPara(/subscriptionsv2/)[0].headers.get("authorization"), "Bearer ya29.teste");
  });
});

Deno.test("verifyPurchase: o tier vem do produto que o Google confirmou, não do que o cliente pediu", async () => {
  const token = tokenDeCompra("tier");
  const { vars } = await comGoogle({ [token]: ATIVA("financaspro.business.yearly") });
  await comAmbiente(vars, async () => {
    const sb = banco();
    const r = await verifyPurchase(sb, "org1", { productId: "financaspro.pro.monthly", purchaseToken: token });
    assert.equal(r.tier, "BUSINESS");
    assert.equal(r.productId, "financaspro.business.yearly");
    const sub = sb.linhas("Subscription")[0];
    assert.equal(sub.planId, "plan_biz");
    assert.equal(sub.billingInterval, "yearly");
  });
});

Deno.test("verifyPurchase: o pacote consultado é o da env, nunca o que veio no corpo", async () => {
  const token = tokenDeCompra("pkg");
  const { rede, vars } = await comGoogle({ [token]: ATIVA("financaspro.pro.monthly") }, { PLAY_PACKAGE_NAME: "com.financaspro.mobile" });
  await comAmbiente(vars, async () => {
    await verifyPurchase(banco(), "org1", { productId: "financaspro.pro.monthly", purchaseToken: token, packageName: "com.atacante.app" });
    const url = rede.pedidosPara(/subscriptionsv2/)[0].url;
    assert.match(url, /\/applications\/com\.financaspro\.mobile\//);
    assert.doesNotMatch(url, /atacante/);
  });
});

Deno.test("verifyPurchase: cancelou na loja mas ainda tem acesso → cancelAtPeriodEnd, sem cortar o Pro", async () => {
  const token = tokenDeCompra("cancel");
  const { vars } = await comGoogle({
    [token]: ATIVA("financaspro.pro.monthly", 10, { autoRenewingPlan: { autoRenewEnabled: false } }),
  });
  await comAmbiente(vars, async () => {
    const sb = banco();
    const r = await verifyPurchase(sb, "org1", { productId: "financaspro.pro.monthly", purchaseToken: token });
    assert.equal(r.cancelAtPeriodEnd, true);
    const sub = sb.linhas("Subscription")[0];
    assert.equal(sub.status, "ACTIVE");
    assert.equal(sub.cancelAtPeriodEnd, true);
  });
});

Deno.test("verifyPurchase: assinatura não ativa é 402 e revoga o Pro que o token sustentava nesta org", async () => {
  const token = tokenDeCompra("expirou");
  const { vars } = await comGoogle({
    [token]: { subscriptionState: "SUBSCRIPTION_STATE_EXPIRED", lineItems: [{ productId: "financaspro.pro.monthly", expiryTime: emDias(-1) }] },
  });
  await comAmbiente(vars, async () => {
    const sb = banco({
      Subscription: [{ id: "s1", orgId: "org1", planId: "plan_pro", status: "ACTIVE", stripeSubId: "play:" + token }],
    });
    await falhaCom(verifyPurchase(sb, "org1", { productId: "financaspro.pro.monthly", purchaseToken: token }), 402, "assinatura-nao-ativa");
    assert.equal(sb.linhas("Subscription")[0].status, "CANCELED");
  });
});

Deno.test("verifyPurchase: assinatura não ativa de token de OUTRA org é 402 sem mexer na assinatura dela", async () => {
  const token = tokenDeCompra("alheio");
  const { vars } = await comGoogle({
    [token]: { subscriptionState: "SUBSCRIPTION_STATE_ON_HOLD", lineItems: [{ productId: "financaspro.pro.monthly", expiryTime: emDias(5) }] },
  });
  await comAmbiente(vars, async () => {
    const sb = banco({
      Subscription: [{ id: "s2", orgId: "org2", planId: "plan_pro", status: "ACTIVE", stripeSubId: "play:" + token }],
    });
    await falhaCom(verifyPurchase(sb, "org1", { productId: "financaspro.pro.monthly", purchaseToken: token }), 402, "assinatura-nao-ativa");
    assert.equal(sb.linhas("Subscription")[0].status, "ACTIVE");
    assert.equal(sb.escritas.length, 0);
  });
});

Deno.test("verifyPurchase: token já usado por outra org é 409 e nada é gravado", async () => {
  const token = tokenDeCompra("dup");
  const { vars } = await comGoogle({ [token]: ATIVA("financaspro.pro.monthly") });
  await comAmbiente(vars, async () => {
    const sb = banco({
      Subscription: [{ id: "s2", orgId: "org2", planId: "plan_pro", status: "ACTIVE", stripeSubId: "play:" + token }],
    });
    await falhaCom(verifyPurchase(sb, "org1", { productId: "financaspro.pro.monthly", purchaseToken: token }), 409, "token-em-uso");
    assert.equal(sb.escritas.length, 0);
  });
});

Deno.test("verifyPurchase: restaurar na mesma org atualiza a assinatura existente, não duplica", async () => {
  const token = tokenDeCompra("restaura");
  const { vars } = await comGoogle({ [token]: ATIVA("financaspro.pro.yearly", 200) });
  await comAmbiente(vars, async () => {
    const sb = banco({
      Subscription: [{ id: "s1", orgId: "org1", planId: "plan_pro", status: "CANCELED", stripeSubId: "play:" + token }],
    });
    const r = await verifyPurchase(sb, "org1", { productId: "financaspro.pro.yearly", purchaseToken: token });
    assert.equal(r.restored, true);
    assert.equal(sb.linhas("Subscription").length, 1);
    assert.equal(sb.linhas("Subscription")[0].status, "ACTIVE");
    assert.equal(sb.escritasEm("Subscription").filter((e) => e.op === "insert").length, 0);
  });
});

Deno.test("verifyPurchase: Google fora do ar vira 502; token que o Google não conhece vira 404", async () => {
  const fora = tokenDeCompra("503");
  const sumiu = tokenDeCompra("sumiu");
  const { vars } = await comGoogle({ [fora]: 503 });
  await comAmbiente(vars, async () => {
    const sb = banco();
    await falhaCom(verifyPurchase(sb, "org1", { productId: "financaspro.pro.monthly", purchaseToken: fora }), 502, "google-play-api-falhou:503");
    await falhaCom(verifyPurchase(sb, "org1", { productId: "financaspro.pro.monthly", purchaseToken: sumiu }), 404, "assinatura-nao-encontrada");
    assert.equal(sb.escritas.length, 0);
  });
});

Deno.test("verifyPurchase: o token de acesso do Google é reaproveitado entre chamadas", async () => {
  const t1 = tokenDeCompra("cache1");
  const t2 = tokenDeCompra("cache2");
  const { rede, vars } = await comGoogle({ [t1]: ATIVA("financaspro.pro.monthly"), [t2]: ATIVA("financaspro.pro.monthly") });
  await comAmbiente(vars, async () => {
    await verifyPurchase(banco(), "org1", { productId: "financaspro.pro.monthly", purchaseToken: t1 });
    await verifyPurchase(banco(), "org2", { productId: "financaspro.pro.monthly", purchaseToken: t2 });
    assert.equal(rede.pedidosPara(/oauth2\.googleapis\.com\/token/).length, 1);
    assert.equal(rede.pedidosPara(/subscriptionsv2/).length, 2);
  });
});

Deno.test("verifyPurchase: plano do tier inexistente no banco é 404 antes de gravar", async () => {
  const token = tokenDeCompra("semplano");
  const { vars } = await comGoogle({ [token]: ATIVA("financaspro.business.monthly") });
  await comAmbiente(vars, async () => {
    const sb = new BancoFalso({ Plan: [PLANOS[0]], Subscription: [] });
    await falhaCom(verifyPurchase(sb, "org1", { productId: "financaspro.business.monthly", purchaseToken: token }), 404, "plano-nao-encontrado");
    assert.equal(sb.escritas.length, 0);
  });
});

// ─── RTDN: syncFromToken / handleRtdn ──────────────────────────────────────

Deno.test("RTDN: renovação atualiza a validade com o valor real do Google", async () => {
  const token = tokenDeCompra("renova");
  const nova = emDias(62);
  const { vars } = await comGoogle({
    [token]: { subscriptionState: "SUBSCRIPTION_STATE_ACTIVE", lineItems: [{ productId: "financaspro.pro.monthly", expiryTime: nova }] },
  });
  await comAmbiente(vars, async () => {
    const sb = banco({
      Subscription: [{ id: "s1", orgId: "org1", planId: "plan_pro", status: "ACTIVE", stripeSubId: "play:" + token, currentPeriodEnd: emDias(1) }],
    });
    const r = await handleRtdn(sb, { subscriptionNotification: { notificationType: 2, purchaseToken: token } });
    assert.equal(r.handled, true);
    assert.equal((r as any).entitled, true);
    assert.equal(sb.linhas("Subscription")[0].currentPeriodEnd, nova);
    assert.equal(sb.linhas("Subscription").length, 1);
  });
});

Deno.test("RTDN: cancelamento/expiração revoga o acesso", async () => {
  const token = tokenDeCompra("revoga");
  const { vars } = await comGoogle({
    [token]: { subscriptionState: "SUBSCRIPTION_STATE_EXPIRED", lineItems: [{ productId: "financaspro.pro.monthly", expiryTime: emDias(-2) }] },
  });
  await comAmbiente(vars, async () => {
    const sb = banco({
      Subscription: [{ id: "s1", orgId: "org1", planId: "plan_pro", status: "ACTIVE", stripeSubId: "play:" + token }],
    });
    const r = await syncFromToken(sb, token);
    assert.deepEqual({ handled: r.handled, entitled: (r as any).entitled }, { handled: true, entitled: false });
    const sub = sb.linhas("Subscription")[0];
    assert.equal(sub.status, "CANCELED");
    assert.equal(sub.cancelAtPeriodEnd, true);
  });
});

Deno.test("RTDN: compra anulada (reembolso/chargeback) reconsulta o Google e revoga", async () => {
  const token = tokenDeCompra("estorno");
  const { vars } = await comGoogle({
    [token]: { subscriptionState: "SUBSCRIPTION_STATE_EXPIRED", lineItems: [{ productId: "financaspro.pro.monthly", expiryTime: emDias(-1) }] },
  });
  await comAmbiente(vars, async () => {
    const sb = banco({
      Subscription: [{ id: "s1", orgId: "org1", planId: "plan_pro", status: "ACTIVE", stripeSubId: "play:" + token }],
    });
    const r = await handleRtdn(sb, { voidedPurchaseNotification: { purchaseToken: token, refundType: 1 } });
    assert.equal((r as any).tipo, "compra-anulada");
    assert.equal(sb.linhas("Subscription")[0].status, "CANCELED");
  });
});

Deno.test("RTDN: notificação de teste do Play Console é reconhecida sem efeito", async () => {
  await comAmbiente({}, async () => {
    const sb = banco();
    const r = await handleRtdn(sb, { testNotification: { version: "1.0" } });
    assert.deepEqual(r, { handled: true, tipo: "teste", reason: "notificacao-de-teste-do-play-console" });
    assert.equal(sb.escritas.length, 0);
  });
});

Deno.test("RTDN: envelope sem notificação conhecida é ignorado", async () => {
  await comAmbiente({}, async () => {
    const sb = banco();
    assert.deepEqual(await handleRtdn(sb, { oneTimeProductNotification: {} }), { handled: false, reason: "sem-subscription-notification" });
    assert.equal(sb.escritas.length, 0);
  });
});

Deno.test("RTDN: token desconhecido não revoga nada e deixa um aviso procurável no log", async () => {
  const { rede, vars } = await comGoogle({});
  await comAmbiente(vars, async (logs) => {
    const sb = banco({
      Subscription: [{ id: "s1", orgId: "org1", planId: "plan_pro", status: "ACTIVE", stripeSubId: "play:" + tokenDeCompra("outro") }],
    });
    const r = await syncFromToken(sb, tokenDeCompra("desconhecido"));
    assert.deepEqual(r, { handled: false, reason: "token-desconhecido" });
    assert.equal(sb.escritas.length, 0);
    assert.equal(rede.pedidos.length, 0);
    assert.match(String(logs.warn[0]?.[0]), /token não registrado/);
  });
});

Deno.test("RTDN: sem conta de serviço, reconhece mas não decide nada", async () => {
  const token = tokenDeCompra("semsa");
  await comAmbiente({}, async () => {
    const sb = banco({
      Subscription: [{ id: "s1", orgId: "org1", planId: "plan_pro", status: "ACTIVE", stripeSubId: "play:" + token }],
    });
    assert.deepEqual(await syncFromToken(sb, token), { handled: false, reason: "api-nao-configurada", orgId: "org1" });
    assert.equal(sb.escritas.length, 0);
  });
});

// ─── db.ts ──────────────────────────────────────────────────────────────────

Deno.test("db: token longo acha a assinatura gravada no formato legado (truncado em 120)", async () => {
  const longo = "tok-" + "y".repeat(200);
  const sb = banco({
    Subscription: [{ id: "s1", orgId: "org1", planId: "plan_pro", stripeSubId: "play:" + longo.slice(0, 120) }],
  });
  const achada = await findByPlayPurchaseToken(sb, longo);
  assert.equal(achada?.orgId, "org1");
  // E dois tokens com o mesmo prefixo de 120 não se confundem no formato novo.
  const outro = longo.slice(0, 150) + "z".repeat(54);
  const sb2 = banco({ Subscription: [{ id: "s1", orgId: "org1", stripeSubId: "play:" + longo }] });
  assert.equal(await findByPlayPurchaseToken(sb2, outro), null);
});

Deno.test("db: revogar do Play nunca toca numa assinatura do Stripe", async () => {
  const sb = banco({
    Subscription: [{ id: "s1", orgId: "org1", planId: "plan_pro", status: "ACTIVE", stripeSubId: "sub_stripe123" }],
  });
  await revokePlayEntitlement(sb, "org1", { expiresAt: null });
  assert.equal(sb.linhas("Subscription")[0].status, "ACTIVE");
  assert.equal(sb.escritas.length, 0);
});

Deno.test("resolveTier: só os quatro SKUs do app", () => {
  assert.equal(resolveTier("financaspro.pro.monthly"), "PRO");
  assert.equal(resolveTier("financaspro.business.yearly"), "BUSINESS");
  assert.equal(resolveTier("financaspro.pro.weekly"), null);
});

// ─── Tempo limite nas chamadas ao Google ────────────────────────────────────

Deno.test("Google: toda chamada leva tempo limite; estourou, 502 sem gravar nada", async () => {
  const token = tokenDeCompra("lento");
  const { rede, vars } = await comGoogle({ [token]: ATIVA("financaspro.pro.monthly") });
  await comAmbiente(vars, async () => {
    const sb = banco();
    await verifyPurchase(sb, "org1", { productId: "financaspro.pro.monthly", purchaseToken: token });
    for (const p of rede.pedidos) assert.ok(p.sinal, "sem tempo limite: " + p.url);

    // O Google não responde: o AbortSignal.timeout dispara TimeoutError.
    rede.rota(/subscriptionsv2/, () => {
      throw new DOMException("signal timed out", "TimeoutError");
    });
    const sb2 = banco();
    await falhaCom(
      verifyPurchase(sb2, "org1", { productId: "financaspro.pro.monthly", purchaseToken: token }),
      502,
      "google-play-tempo-esgotado",
    );
    assert.equal(sb2.escritas.length, 0);
  });
});
