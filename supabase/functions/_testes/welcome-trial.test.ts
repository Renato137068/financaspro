// welcome-trial inteiro (index.ts + db.ts), com uma Request de verdade.
// Achado 1 da auditoria do servidor (09/10): toda org nasce com a
// Subscription FREE ACTIVE do gatilho handle_new_organization, e a função
// recusava "qualquer assinatura". O Pro de boas-vindas nunca era concedido.
import assert from "node:assert/strict";
import { BancoFalso } from "./dubles/banco.ts";
import { usarBanco } from "./dubles/supabase-js.ts";
import { comAmbiente } from "./dubles/ambiente.ts";

type Handler = (req: Request) => Promise<Response>;
let handler: Handler | null = null;
const serveOriginal = Deno.serve;
(Deno as any).serve = (fn: Handler) => {
  handler = fn;
  return { finished: Promise.resolve(), shutdown() {} };
};
await import("../welcome-trial/index.ts");
(Deno as any).serve = serveOriginal;
const welcomeTrial = handler!;

const VARS = { SUPABASE_URL: "http://sb.test", SUPABASE_SERVICE_ROLE_KEY: "srk" };
const PLANOS = [
  { id: "plan_free", tier: "FREE", name: "Grátis", active: true },
  { id: "plan_pro", tier: "PRO", name: "Pro", active: true },
];

/** A linha que o gatilho handle_new_organization cria em toda org nova. */
const FREE_DO_GATILHO = {
  id: "s1", orgId: "org1", planId: "plan_free", status: "ACTIVE", billingInterval: "monthly",
  stripeSubId: null, stripeCustomerId: null, trialEndsAt: null, cancelAtPeriodEnd: false,
};

function banco(extra: { assinaturas?: any[]; concessoes?: any[] } = {}) {
  const sb = new BancoFalso({
    Plan: PLANOS,
    Subscription: extra.assinaturas ?? [FREE_DO_GATILHO],
    OrganizationMember: [{ id: "m1", orgId: "org1", userId: "u-dono", role: "OWNER" }],
    fp_welcome_trial_grant: extra.concessoes ?? [],
  });
  sb.usuarios = { "jwt-dono": { id: "u-dono" } };
  usarBanco(sb);
  return sb;
}

function pedir(corpo: Record<string, unknown> = { orgId: "org1" }) {
  return welcomeTrial(new Request("http://fn.test/welcome-trial", {
    method: "POST",
    headers: { Authorization: "Bearer jwt-dono" },
    body: JSON.stringify(corpo),
  }));
}

Deno.test("welcome-trial: org com a FREE do gatilho ganha o Pro, trocando a linha existente", async () => {
  await comAmbiente(VARS, async () => {
    const sb = banco();
    const r = await pedir();
    assert.equal(r.status, 200);
    const { data } = await r.json();
    assert.equal(data.tier, "PRO");
    assert.equal(data.status, "TRIALING");

    // Uma linha só (Subscription.orgId é única): update, não insert.
    const subs = sb.linhas("Subscription");
    assert.equal(subs.length, 1);
    assert.equal(subs[0].id, "s1");
    assert.equal(subs[0].planId, "plan_pro");
    assert.equal(subs[0].status, "TRIALING");
    assert.equal(subs[0].stripeSubId, "welcome:u-dono");
    assert.equal(subs[0].trialEndsAt, data.trialEndsAt);
    assert.equal(sb.escritasEm("Subscription").filter((e) => e.op === "insert").length, 0);

    const grant = sb.linhas("fp_welcome_trial_grant");
    assert.equal(grant.length, 1);
    assert.equal(grant[0].user_id, "u-dono");
  });
});

Deno.test("welcome-trial: org sem assinatura nenhuma ganha o Pro por insert", async () => {
  await comAmbiente(VARS, async () => {
    const sb = banco({ assinaturas: [] });
    const r = await pedir();
    assert.equal(r.status, 200);
    assert.equal(sb.linhas("Subscription").length, 1);
    assert.equal(sb.linhas("Subscription")[0].status, "TRIALING");
  });
});

Deno.test("welcome-trial: assinatura paga (Stripe, Play ou trial da loja) é recusada sem escrever nada", async () => {
  const pagas = [
    { ...FREE_DO_GATILHO, planId: "plan_pro", status: "ACTIVE", stripeSubId: "sub_123" },
    { ...FREE_DO_GATILHO, planId: "plan_pro", status: "TRIALING", stripeSubId: "play:tok" },
    { ...FREE_DO_GATILHO, planId: "plan_pro", status: "PAST_DUE", stripeSubId: "sub_456" },
    // FREE que não é a do gatilho (veio de um cancelamento, com chave de loja)
    { ...FREE_DO_GATILHO, planId: "plan_free", status: "CANCELED", stripeSubId: "sub_789" },
  ];
  for (const paga of pagas) {
    await comAmbiente(VARS, async () => {
      const sb = banco({ assinaturas: [paga] });
      const r = await pedir();
      assert.equal(r.status, 409, JSON.stringify(paga));
      assert.equal((await r.json()).error, "assinatura-paga-existe");
      assert.equal(sb.escritas.length, 0);
      assert.equal(sb.linhas("Subscription")[0].stripeSubId, paga.stripeSubId);
    });
  }
});

Deno.test("welcome-trial: quem já recebeu leva 409 já-concedido, mesmo com a FREE de volta", async () => {
  await comAmbiente(VARS, async () => {
    const sb = banco({
      concessoes: [{ user_id: "u-dono", org_id: "org1", granted_at: "2026-01-01", ends_at: "2026-01-15" }],
    });
    const r = await pedir();
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, "welcome-trial-ja-concedido");
    assert.equal(sb.escritas.length, 0);
  });
});

Deno.test("welcome-trial: segundo pedido depois de conceder é 409 já-concedido", async () => {
  await comAmbiente(VARS, async () => {
    const sb = banco();
    assert.equal((await pedir()).status, 200);
    const r = await pedir();
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, "welcome-trial-ja-concedido");
    assert.equal(sb.linhas("Subscription").length, 1);
  });
});

Deno.test("welcome-trial: quem não é dono da org não pede", async () => {
  await comAmbiente(VARS, async () => {
    const sb = banco();
    sb.linhas("OrganizationMember")[0].role = "MEMBER";
    const r = await pedir();
    assert.equal(r.status, 403);
    assert.equal(sb.escritas.length, 0);
  });
});
