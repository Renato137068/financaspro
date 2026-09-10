// supabase/functions/stripe-checkout/index.ts
//
// Cria uma sessão de checkout do Stripe (assinatura na WEB).
// Substitui POST /api/v1/billing/:orgId/checkout do Express.
// Exige usuário autenticado + OWNER da org.
import { adminClient, orgRoleOf } from "../_shared/db.ts";
import { stripeClient } from "../_shared/stripe.ts";
import { createCheckout } from "../_shared/stripe-billing.ts";
import { corsHeadersFor, corsPreflight } from "../_shared/cors.ts";

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
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
    const { orgId, planTier, interval, successUrl, cancelUrl } = body ?? {};
    if (!orgId || !planTier || !successUrl || !cancelUrl) {
      return json(req, { error: "parametros-invalidos" }, 400);
    }

    const role = await orgRoleOf(sb, orgId, user.id);
    if (role !== "OWNER") return json(req, { error: "sem-permissao" }, 403);

    const stripe = stripeClient();
    const out = await createCheckout(sb, stripe, {
      orgId,
      planTier,
      interval: interval || "monthly",
      userEmail: user.email ?? null,
      successUrl,
      cancelUrl,
    });
    return json(req, { data: out });
  } catch (err) {
    const status = (err as any)?.status ?? 500;
    const message = (err as Error)?.message ?? "erro-interno";
    if (status >= 500) console.error("stripe-checkout erro", message);
    return json(req, { error: message }, status);
  }
});
