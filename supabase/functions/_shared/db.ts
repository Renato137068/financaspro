// supabase/functions/_shared/db.ts
//
// Cliente service_role (ignora RLS) + acesso a entitlement do Google Play.
// Port de backend/domain/repositories/billing.repository.js (parte Play).
// Reusa a coluna "stripeSubId" como chave `play:<token>` — mesma convenção do
// backend Express, para o modelo de dados não mudar.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
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
  const { data } = await sb
    .from("Plan")
    .select("id, tier, name, stripePriceIdMonthly, stripePriceIdYearly")
    .eq("tier", tier).eq("active", true)
    .maybeSingle();
  return data;
}

export async function findByPlayPurchaseToken(sb: SupabaseClient, token: string) {
  for (const key of playKeyCandidates(token)) {
    const { data } = await sb
      .from("Subscription").select("id, orgId, planId, stripeSubId")
      .eq("stripeSubId", key)
      .maybeSingle();
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
  const { data: existing } = await sb
    .from("Subscription").select("id").eq("orgId", orgId).maybeSingle();

  if (existing) {
    await sb.from("Subscription").update(row).eq("orgId", orgId);
  } else {
    await sb.from("Subscription").insert({ id: crypto.randomUUID(), orgId, ...row });
  }
}

export async function revokePlayEntitlement(
  sb: SupabaseClient,
  orgId: string,
  opts: { expiresAt: string | null },
) {
  const end = opts.expiresAt ? new Date(opts.expiresAt).toISOString() : new Date().toISOString();
  // Só revoga se a assinatura da org for do Play (nunca uma do Stripe).
  await sb.from("Subscription")
    .update({
      status: "CANCELED",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: end,
      updatedAt: new Date().toISOString(),
    })
    .eq("orgId", orgId)
    .like("stripeSubId", "play:%");
}

/** Papel do usuário na org (via service_role, determinístico). */
export async function orgRoleOf(sb: SupabaseClient, orgId: string, userId: string): Promise<string | null> {
  const { data } = await sb
    .from("OrganizationMember").select("role")
    .eq("orgId", orgId).eq("userId", userId)
    .maybeSingle();
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
  await sb.from("StripeWebhookEvent").delete().eq("id", id);
}

// ─── Stripe (port de billing.repository.js) ─────────────────────────────────

export async function findSubscription(sb: SupabaseClient, orgId: string) {
  const { data } = await sb.from("Subscription").select("*").eq("orgId", orgId).maybeSingle();
  return data;
}

export async function findByStripeSubId(sb: SupabaseClient, stripeSubId: string) {
  const { data } = await sb.from("Subscription").select("*").eq("stripeSubId", stripeSubId).maybeSingle();
  return data;
}

export async function findPlanById(sb: SupabaseClient, planId: string) {
  const { data } = await sb.from("Plan").select("id, name, tier").eq("id", planId).maybeSingle();
  return data;
}

export async function updateSubscription(sb: SupabaseClient, orgId: string, data: Record<string, unknown>) {
  await sb.from("Subscription").update({ ...data, updatedAt: new Date().toISOString() }).eq("orgId", orgId);
}

/** Grava/atualiza a assinatura da org (id e updatedAt são gerados aqui). */
export async function upsertSubscriptionStripe(sb: SupabaseClient, orgId: string, data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const { data: existing } = await sb.from("Subscription").select("id").eq("orgId", orgId).maybeSingle();
  if (existing) {
    await sb.from("Subscription").update({ ...data, updatedAt: now }).eq("orgId", orgId);
  } else {
    await sb.from("Subscription").insert({ id: crypto.randomUUID(), orgId, ...data, updatedAt: now });
  }
}

/** Grava o customerId só se ainda vazio (evita corrida). true = gravou. */
export async function setStripeCustomerIfEmpty(sb: SupabaseClient, orgId: string, customerId: string): Promise<boolean> {
  const { data } = await sb.from("Subscription")
    .update({ stripeCustomerId: customerId, updatedAt: new Date().toISOString() })
    .eq("orgId", orgId).is("stripeCustomerId", null)
    .select("id");
  return Array.isArray(data) && data.length > 0;
}

export async function findInvoiceByStripeId(sb: SupabaseClient, stripeInvoiceId: string | null) {
  if (!stripeInvoiceId) return null;
  const { data } = await sb.from("Invoice").select("id").eq("stripeInvoiceId", stripeInvoiceId).maybeSingle();
  return data;
}

export async function upsertInvoice(sb: SupabaseClient, data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const stripeInvoiceId = data.stripeInvoiceId as string | undefined;
  if (stripeInvoiceId) {
    const { data: existing } = await sb.from("Invoice").select("id").eq("stripeInvoiceId", stripeInvoiceId).maybeSingle();
    if (existing) {
      await sb.from("Invoice").update({
        amount: data.amount, status: data.status, paidAt: data.paidAt,
        hostedUrl: data.hostedUrl, pdfUrl: data.pdfUrl,
      }).eq("stripeInvoiceId", stripeInvoiceId);
      return;
    }
  }
  await sb.from("Invoice").insert({ id: crypto.randomUUID(), createdAt: now, ...data });
}
