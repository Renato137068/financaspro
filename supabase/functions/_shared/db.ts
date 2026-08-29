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
  return `play:${String(token).slice(0, 120)}`;
}

export async function findPlan(sb: SupabaseClient, tier: string) {
  const { data } = await sb
    .from("Plan").select("id, tier")
    .eq("tier", tier).eq("active", true)
    .maybeSingle();
  return data;
}

export async function findByPlayPurchaseToken(sb: SupabaseClient, token: string) {
  const { data } = await sb
    .from("Subscription").select("id, orgId, planId, stripeSubId")
    .eq("stripeSubId", playKey(token))
    .maybeSingle();
  return data; // null se não existe
}

export async function upsertPlayEntitlement(
  sb: SupabaseClient,
  orgId: string,
  opts: { productId: string; purchaseToken: string; tier: string; expiresAt: string | null },
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
    cancelAtPeriodEnd: false,
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
