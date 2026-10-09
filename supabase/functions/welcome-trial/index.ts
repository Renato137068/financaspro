// supabase/functions/welcome-trial/index.ts
//
// Concede o "Pro de boas-vindas": WELCOME_TRIAL_DAYS dias de PRO na criação da
// conta, SEM cartão.
//
// Por que existe: o trial de 7 dias do SKU da loja pede cartão antes de o
// usuário ter visto valor nenhum, e 7 dias nem cobrem um fechamento de mês —
// que é justamente quando o app mostra para que serve. Aqui ele passa duas
// semanas COM os recursos pagos e depois os perde: a decisão deixa de ser
// sobre uma lista de features e passa a ser sobre um hábito que ele já tem.
//
// Não é assinatura da loja — é entitlement nosso (TRIALING + trialEndsAt), e
// por isso convive com o trial do SKU sem conflitar com a política da Play.
import { adminClient, findPlan, findPlanById, orgRoleOf } from "../_shared/db.ts";
import { WELCOME_TRIAL_DAYS } from "../_shared/billing-constants.ts";
import { corsHeadersFor, corsPreflight } from "../_shared/cors.ts";

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

/** Marca de origem no lugar de stripeSubId — nunca confundir com loja real. */
function welcomeKey(userId: string): string {
  return `welcome:${userId}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(req);
  if (req.method !== "POST") return json(req, { error: "method-not-allowed" }, 405);

  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json(req, { error: "nao-autenticado" }, 401);

    const sb = adminClient();
    const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
    if (authErr || !user) return json(req, { error: "nao-autenticado" }, 401);

    const body = await req.json().catch(() => ({}));
    const orgId = body?.orgId;
    if (!orgId) return json(req, { error: "parametros-invalidos" }, 400);

    const role = await orgRoleOf(sb, orgId, user.id);
    if (role !== "OWNER") return json(req, { error: "sem-permissao" }, 403);

    // ── Idempotência, checada por USUÁRIO ────────────────────────────────
    // Sair da conta e entrar de novo não pode renovar o Pro, e criar uma org
    // nova também não. A chave é a pessoa, não a organização.
    const { data: jaConcedido } = await sb
      .from("fp_welcome_trial_grant")
      .select("user_id, ends_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (jaConcedido) {
      return json(req, { error: "welcome-trial-ja-concedido", data: jaConcedido }, 409);
    }

    // ── Nunca por cima de uma assinatura de verdade ──────────────────────
    // Quem já paga (ou já está em trial da loja) não pode ter o entitlement
    // sobrescrito por um trial gratuito — isso apagaria uma assinatura real.
    //
    // Mas toda org nasce com uma Subscription FREE ACTIVE, criada pelo gatilho
    // handle_new_organization (20260901120000_org_bootstrap.sql). Recusar
    // "qualquer assinatura" recusava todo mundo, e o Pro de boas-vindas nunca
    // era concedido (achado 1 da auditoria do servidor de 09/10). A FREE do
    // gatilho é trocada pelo trial; qualquer outra assinatura é recusada.
    const { data: subExistente } = await sb
      .from("Subscription")
      .select("id, status, planId, stripeSubId")
      .eq("orgId", orgId)
      .maybeSingle();

    if (subExistente) {
      const planoAtual = subExistente.planId ? await findPlanById(sb, subExistente.planId) : null;
      const ehFreeDoGatilho = planoAtual?.tier === "FREE" &&
        subExistente.status === "ACTIVE" &&
        !subExistente.stripeSubId;
      if (!ehFreeDoGatilho) {
        return json(req, { error: "assinatura-paga-existe" }, 409);
      }
    }

    const plan = await findPlan(sb, "PRO");
    if (!plan) return json(req, { error: "plano-nao-encontrado" }, 404);

    const agora = new Date();
    const fim = new Date(agora.getTime() + WELCOME_TRIAL_DAYS * 86400000);
    const nowIso = agora.toISOString();
    const fimIso = fim.toISOString();

    const trial = {
      planId: plan.id,
      status: "TRIALING",
      billingInterval: "monthly",
      stripeCustomerId: null,
      stripeSubId: welcomeKey(user.id),
      currentPeriodStart: nowIso,
      currentPeriodEnd: fimIso,
      cancelAtPeriodEnd: false,
      trialEndsAt: fimIso,
      updatedAt: nowIso,
    };

    if (subExistente) {
      // Update condicionado ao estado lido: se uma compra (ou outro pedido de
      // boas-vindas) gravou a linha entre a leitura e aqui, nada é trocado.
      const { data: trocadas, error: updErr } = await sb
        .from("Subscription")
        .update(trial)
        .eq("id", subExistente.id)
        .eq("planId", subExistente.planId)
        .eq("status", "ACTIVE")
        .is("stripeSubId", null)
        .select("id");
      if (updErr) throw new Error(updErr.message);
      if (!Array.isArray(trocadas) || trocadas.length === 0) {
        return json(req, { error: "assinatura-paga-existe" }, 409);
      }
    } else {
      const { error: insErr } = await sb.from("Subscription").insert({ id: crypto.randomUUID(), orgId, ...trial });
      if (insErr) throw new Error(insErr.message);
    }

    // O registro de concessão vem DEPOIS da assinatura: se a assinatura falhar, o
    // usuário não fica marcado como "já ganhou" sem nunca ter recebido nada.
    const { error: grantErr } = await sb.from("fp_welcome_trial_grant").insert({
      user_id: user.id,
      org_id: orgId,
      granted_at: nowIso,
      ends_at: fimIso,
    });
    if (grantErr) console.error("welcome-trial grant nao gravado", grantErr.message);

    return json(req, {
      data: {
        tier: "PRO",
        status: "TRIALING",
        trialEndsAt: fimIso,
        days: WELCOME_TRIAL_DAYS,
      },
    });
  } catch (err) {
    const status = (err as any)?.status ?? 500;
    const message = (err as Error)?.message ?? "erro-interno";
    if (status >= 500) console.error("welcome-trial erro", message);
    return json(req, { error: message }, status);
  }
});
