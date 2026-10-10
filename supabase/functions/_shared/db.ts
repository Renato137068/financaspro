// supabase/functions/_shared/db.ts
//
// Cliente service_role (ignora RLS) + acesso a entitlement do Google Play.
// Port de backend/domain/repositories/billing.repository.js (parte Play).
// Reusa a coluna "stripeSubId" como chave `play:<token>` — mesma convenção do
// backend Express, para o modelo de dados não mudar.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Resposta do supabase-js: ele NÃO lança em erro de banco, devolve `error`. */
interface RespostaDb<T = any> {
  data: T;
  error: { message?: string; code?: string } | null;
}

/**
 * Executa uma consulta e lança quando o banco recusa.
 *
 * O supabase-js devolve `{ error }` em vez de lançar. Escrita que ignorava o
 * erro dava a cobrança por gravada: o webhook respondia 200, o registro de
 * idempotência ficava e a loja não reenviava (achado 2 da auditoria do
 * servidor, 09/10). O erro lançado vira 500 nos webhooks, que liberam o claim
 * para a loja reentregar. Leitura também passa por aqui: um banco fora do ar
 * não pode parecer "assinatura não encontrada".
 */
export async function exigir<T = any>(consulta: PromiseLike<RespostaDb<T>>, onde: string): Promise<T> {
  const { data, error } = await consulta;
  if (error) {
    const e: any = new Error(`db ${onde}: ${error.message || error.code || "erro"}`);
    e.status = 500;
    e.code = error.code;
    throw e;
  }
  return data;
}

function playKey(token: string): string {
  // Token completo — truncar em 120 colidia RTDN×verify quando o prefixo era igual.
  return `play:${String(token)}`;
}

/** Chaves candidatas (novo formato + legado truncado em 120). */
function playKeyCandidates(token: string): string[] {
  const t = String(token);
  const keys = [playKey(t)];
  if (t.length > 120) keys.push(`play:${t.slice(0, 120)}`);
  return keys;
}

export async function findPlan(sb: SupabaseClient, tier: string) {
  return await exigir(
    sb.from("Plan")
      .select("id, tier, name, stripePriceIdMonthly, stripePriceIdYearly")
      .eq("tier", tier).eq("active", true)
      .maybeSingle(),
    "Plan.select",
  );
}

export async function findByPlayPurchaseToken(sb: SupabaseClient, token: string) {
  for (const key of playKeyCandidates(token)) {
    const data = await exigir(
      sb.from("Subscription").select("id, orgId, planId, stripeSubId")
        .eq("stripeSubId", key)
        .maybeSingle(),
      "Subscription.select play",
    );
    if (data) return data;
  }
  return null;
}

export async function upsertPlayEntitlement(
  sb: SupabaseClient,
  orgId: string,
  opts: {
    productId: string;
    purchaseToken: string;
    tier: string;
    expiresAt: string | null;
    cancelAtPeriodEnd?: boolean;
  },
) {
  const plan = await findPlan(sb, opts.tier);
  if (!plan) {
    const err: any = new Error("plano-nao-encontrado");
    err.status = 404;
    throw err;
  }
  const now = new Date().toISOString();
  const end = opts.expiresAt
    ? new Date(opts.expiresAt).toISOString()
    : new Date(Date.now() + 30 * 86400000).toISOString();

  const row = {
    planId: plan.id,
    status: "ACTIVE",
    billingInterval: String(opts.productId).includes("yearly") ? "yearly" : "monthly",
    stripeSubId: playKey(opts.purchaseToken),
    stripeCustomerId: null,
    currentPeriodStart: now,
    currentPeriodEnd: end,
    // Cancelou na loja mas o Google ainda libera até expiry — NÃO zerar o flag.
    cancelAtPeriodEnd: !!opts.cancelAtPeriodEnd,
    updatedAt: now,
  };

  // upsert manual: id e updatedAt não têm default de banco (Prisma os gera).
  const existing = await exigir(
    sb.from("Subscription").select("id").eq("orgId", orgId).maybeSingle(),
    "Subscription.select org",
  );

  if (existing) {
    await exigir(sb.from("Subscription").update(row).eq("orgId", orgId), "Subscription.update play");
  } else {
    await exigir(sb.from("Subscription").insert({ id: crypto.randomUUID(), orgId, ...row }), "Subscription.insert play");
  }
}

export async function revokePlayEntitlement(
  sb: SupabaseClient,
  orgId: string,
  opts: { expiresAt: string | null },
) {
  const end = opts.expiresAt ? new Date(opts.expiresAt).toISOString() : new Date().toISOString();
  // Só revoga se a assinatura da org for do Play (nunca uma do Stripe).
  await exigir(
    sb.from("Subscription")
      .update({
        status: "CANCELED",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: end,
        updatedAt: new Date().toISOString(),
      })
      .eq("orgId", orgId)
      .like("stripeSubId", "play:%"),
    "Subscription.update revogar play",
  );
}

/** Papel do usuário na org (via service_role, determinístico). */
export async function orgRoleOf(sb: SupabaseClient, orgId: string, userId: string): Promise<string | null> {
  const data = await exigir(
    sb.from("OrganizationMember").select("role")
      .eq("orgId", orgId).eq("userId", userId)
      .maybeSingle(),
    "OrganizationMember.select",
  );
  return data?.role ?? null;
}

/** Idempotência de webhook (reusa StripeWebhookEvent). true = novo, false = duplicado. */
export async function claimEvent(sb: SupabaseClient, id: string, type: string): Promise<boolean> {
  const { error } = await sb.from("StripeWebhookEvent").insert({ id, type });
  if (!error) return true;
  if ((error as any).code === "23505") return false; // unique_violation
  throw error;
}

export async function releaseEvent(sb: SupabaseClient, id: string) {
  await exigir(sb.from("StripeWebhookEvent").delete().eq("id", id), "StripeWebhookEvent.delete");
}

// ─── Stripe (port de billing.repository.js) ─────────────────────────────────

export async function findSubscription(sb: SupabaseClient, orgId: string) {
  return await exigir(sb.from("Subscription").select("*").eq("orgId", orgId).maybeSingle(), "Subscription.select org");
}

export async function findByStripeSubId(sb: SupabaseClient, stripeSubId: string) {
  return await exigir(
    sb.from("Subscription").select("*").eq("stripeSubId", stripeSubId).maybeSingle(),
    "Subscription.select stripeSubId",
  );
}

export async function findPlanById(sb: SupabaseClient, planId: string) {
  // maxUsers é o teto de assentos que o org-invite confere. Sem ele na lista,
  // o PostgREST não devolve a coluna e o convite caía no padrão de 1 assento.
  return await exigir(sb.from("Plan").select("id, name, tier, maxUsers").eq("id", planId).maybeSingle(), "Plan.select id");
}

export async function updateSubscription(sb: SupabaseClient, orgId: string, data: Record<string, unknown>) {
  await exigir(
    sb.from("Subscription").update({ ...data, updatedAt: new Date().toISOString() }).eq("orgId", orgId),
    "Subscription.update",
  );
}

/** Grava/atualiza a assinatura da org (id e updatedAt são gerados aqui). */
export async function upsertSubscriptionStripe(sb: SupabaseClient, orgId: string, data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const existing = await exigir(
    sb.from("Subscription").select("id").eq("orgId", orgId).maybeSingle(),
    "Subscription.select org",
  );
  if (existing) {
    await exigir(sb.from("Subscription").update({ ...data, updatedAt: now }).eq("orgId", orgId), "Subscription.update stripe");
  } else {
    await exigir(
      sb.from("Subscription").insert({ id: crypto.randomUUID(), orgId, ...data, updatedAt: now }),
      "Subscription.insert stripe",
    );
  }
}

/** Grava o customerId só se ainda vazio (evita corrida). true = gravou. */
export async function setStripeCustomerIfEmpty(sb: SupabaseClient, orgId: string, customerId: string): Promise<boolean> {
  const data = await exigir(
    sb.from("Subscription")
      .update({ stripeCustomerId: customerId, updatedAt: new Date().toISOString() })
      .eq("orgId", orgId).is("stripeCustomerId", null)
      .select("id"),
    "Subscription.update customer",
  );
  return Array.isArray(data) && data.length > 0;
}

export async function findInvoiceByStripeId(sb: SupabaseClient, stripeInvoiceId: string | null) {
  if (!stripeInvoiceId) return null;
  return await exigir(
    sb.from("Invoice").select("id").eq("stripeInvoiceId", stripeInvoiceId).maybeSingle(),
    "Invoice.select",
  );
}

export async function upsertInvoice(sb: SupabaseClient, data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const stripeInvoiceId = data.stripeInvoiceId as string | undefined;
  if (stripeInvoiceId) {
    const existing = await findInvoiceByStripeId(sb, stripeInvoiceId);
    if (existing) {
      await exigir(
        sb.from("Invoice").update({
          amount: data.amount, status: data.status, paidAt: data.paidAt,
          hostedUrl: data.hostedUrl, pdfUrl: data.pdfUrl,
        }).eq("stripeInvoiceId", stripeInvoiceId),
        "Invoice.update",
      );
      return;
    }
  }
  await exigir(sb.from("Invoice").insert({ id: crypto.randomUUID(), createdAt: now, ...data }), "Invoice.insert");
}
