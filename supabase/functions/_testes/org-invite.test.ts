// org-invite inteiro (index.ts + db.ts + email.ts), com uma Request de verdade.
// Convidar alguém é o que o plano Pro vende além do uso individual (2
// assentos; Business, ilimitado). A checagem de tipos achou que o handler lia
// plan.maxUsers de uma consulta que não trazia a coluna: o teto caía no padrão
// de 1 assento e todo convite de Pro e Business voltava "limite-membros".
import assert from "node:assert/strict";
import { BancoFalso } from "./dubles/banco.ts";
import { usarBanco } from "./dubles/supabase-js.ts";
import { json, Rede } from "./dubles/rede.ts";
import { comAmbiente } from "./dubles/ambiente.ts";

type Handler = (req: Request) => Promise<Response>;
let handler: Handler | null = null;
const serveOriginal = Deno.serve;
(Deno as any).serve = (fn: Handler) => {
  handler = fn;
  return { finished: Promise.resolve(), shutdown() {} };
};
await import("../org-invite/index.ts");
(Deno as any).serve = serveOriginal;
const orgInvite = handler!;

const VARS = { SUPABASE_URL: "http://sb.test", SUPABASE_SERVICE_ROLE_KEY: "srk", RESEND_API_KEY: "re_teste" };
const PLANOS = [
  { id: "plan_free", tier: "FREE", name: "Grátis", maxUsers: 1 },
  { id: "plan_pro", tier: "PRO", name: "Pro", maxUsers: 2 },
  { id: "plan_biz", tier: "BUSINESS", name: "Business", maxUsers: 0 },
];
const FUTURO = "2099-01-01T00:00:00.000Z";

function banco(plano: string, extra: { membros?: any[]; convites?: any[] } = {}) {
  const sb = new BancoFalso({
    Plan: PLANOS,
    Subscription: [{ id: "s1", orgId: "org1", planId: plano, status: "ACTIVE" }],
    OrganizationMember: [{ id: "m1", orgId: "org1", userId: "u-dono", role: "OWNER" }, ...(extra.membros || [])],
    Invitation: extra.convites || [],
    Organization: [{ id: "org1", name: "Casa da Ana" }],
  });
  sb.usuarios = { "jwt-dono": { id: "u-dono", email: "ana@exemplo.com" }, "jwt-membro": { id: "u-membro" } };
  usarBanco(sb);
  return sb;
}

function convidar(corpo: Record<string, unknown>, jwt = "jwt-dono") {
  return orgInvite(new Request("http://fn.test/org-invite", {
    method: "POST",
    headers: jwt ? { Authorization: "Bearer " + jwt } : {},
    body: JSON.stringify(corpo),
  }));
}

const comResend = () => new Rede().rota(/api\.resend\.com\/emails/, () => json({ id: "em_1" })).instalar();

Deno.test("org-invite: Pro com o dono sozinho convida o segundo assento e manda o e-mail", async () => {
  await comAmbiente(VARS, async () => {
    const rede = comResend();
    const sb = banco("plan_pro");
    const r = await convidar({ orgId: "org1", email: " Bia@Exemplo.com " });
    assert.equal(r.status, 200);
    const { data } = await r.json();
    assert.equal(data.email, "bia@exemplo.com");
    assert.equal(data.role, "MEMBER");
    assert.equal(sb.linhas("Invitation").length, 1);
    const email = JSON.parse(rede.pedidosPara(/resend/)[0].corpo);
    assert.deepEqual(email.to, ["bia@exemplo.com"]);
    assert.match(email.text, /Casa da Ana/);
  });
});

Deno.test("org-invite: Pro com o segundo assento ocupado (membro ou convite pendente) recusa", async () => {
  await comAmbiente(VARS, async () => {
    banco("plan_pro", { membros: [{ id: "m2", orgId: "org1", userId: "u-bia", role: "MEMBER" }] });
    let r = await convidar({ orgId: "org1", email: "caio@exemplo.com" });
    assert.equal(r.status, 402);
    assert.equal((await r.json()).error, "limite-membros");

    const sb = banco("plan_pro", { convites: [{ id: "i1", orgId: "org1", email: "bia@exemplo.com", acceptedAt: null, expiresAt: FUTURO }] });
    r = await convidar({ orgId: "org1", email: "caio@exemplo.com" });
    assert.equal(r.status, 402);
    assert.equal(sb.escritasEm("Invitation").length, 0);
  });
});

Deno.test("org-invite: convite vencido ou aceito não ocupa assento", async () => {
  await comAmbiente(VARS, async () => {
    comResend();
    banco("plan_pro", { convites: [
      { id: "i1", orgId: "org1", email: "velho@exemplo.com", acceptedAt: null, expiresAt: "2020-01-01T00:00:00.000Z" },
    ] });
    const r = await convidar({ orgId: "org1", email: "caio@exemplo.com" });
    assert.equal(r.status, 200);
  });
});

Deno.test("org-invite: Business (maxUsers 0) não tem teto", async () => {
  await comAmbiente(VARS, async () => {
    comResend();
    const membros = [2, 3, 4, 5, 6].map((n) => ({ id: "m" + n, orgId: "org1", userId: "u" + n, role: "MEMBER" }));
    banco("plan_biz", { membros });
    const r = await convidar({ orgId: "org1", email: "novo@exemplo.com", role: "ADMIN" });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).data.role, "ADMIN");
  });
});

Deno.test("org-invite: plano grátis pede upgrade; convite repetido para o mesmo e-mail é 409", async () => {
  await comAmbiente(VARS, async () => {
    banco("plan_free");
    let r = await convidar({ orgId: "org1", email: "bia@exemplo.com" });
    assert.equal(r.status, 402);
    assert.equal((await r.json()).error, "upgrade-necessario");

    banco("plan_biz", { convites: [{ id: "i1", orgId: "org1", email: "bia@exemplo.com", acceptedAt: null, expiresAt: FUTURO }] });
    r = await convidar({ orgId: "org1", email: "BIA@exemplo.com" });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, "convite-ja-enviado");
  });
});

Deno.test("org-invite: quem pode convidar e o que é aceito", async () => {
  await comAmbiente(VARS, async () => {
    banco("plan_biz", { membros: [{ id: "m2", orgId: "org1", userId: "u-membro", role: "MEMBER" }] });
    assert.equal((await convidar({ orgId: "org1", email: "x@y.com" }, "jwt-membro")).status, 403);
    assert.equal((await convidar({ orgId: "org1", email: "x@y.com" }, "")).status, 401);
    assert.equal((await convidar({ orgId: "org1", email: "x@y.com" }, "jwt-falso")).status, 401);
    assert.equal((await convidar({ orgId: "org1", email: "sem-arroba" })).status, 400);
    assert.equal((await convidar({ email: "x@y.com" })).status, 400);
    assert.equal((await convidar({ orgId: "org1", email: "x@y.com", role: "OWNER" })).status, 400);
    const get = await orgInvite(new Request("http://fn.test/org-invite"));
    assert.equal(get.status, 405);
  });
});

Deno.test("org-invite: e-mail com tempo limite; Resend sem resposta não derruba o convite", async () => {
  await comAmbiente(VARS, async (logs) => {
    const rede = new Rede().rota(/api\.resend\.com\/emails/, () => {
      throw new DOMException("signal timed out", "TimeoutError");
    }).instalar();
    const sb = banco("plan_pro");
    const r = await convidar({ orgId: "org1", email: "bia@exemplo.com" });
    assert.equal(r.status, 200);
    assert.equal(sb.linhas("Invitation").length, 1);
    assert.ok(rede.pedidosPara(/resend/)[0].sinal, "fetch do Resend sem tempo limite");
    assert.ok(logs.error.some((l) => String(l[0]).includes("resend-sem-resposta")));
  });
});
