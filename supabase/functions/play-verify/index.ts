// supabase/functions/play-verify/index.ts
//
// Verificação de compra do Google Play (chamada autenticada pelo app).
// Substitui POST /api/v1/billing/play/:orgId/verify do Express.
// Exige usuário autenticado + papel OWNER na org, depois verifica no Google.
import { adminClient, orgRoleOf } from "../_shared/db.ts";
import { verifyPurchase } from "../_shared/play-billing.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method-not-allowed" }, 405);

  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "nao-autenticado" }, 401);

    const sb = adminClient();
    const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
    if (authErr || !user) return json({ error: "nao-autenticado" }, 401);

    const body = await req.json().catch(() => ({}));
    const { orgId, productId, purchaseToken, packageName } = body ?? {};
    if (!orgId || !productId || !purchaseToken) {
      return json({ error: "parametros-invalidos" }, 400);
    }

    // Só o OWNER da org ativa uma assinatura para ela.
    const role = await orgRoleOf(sb, orgId, user.id);
    if (role !== "OWNER") return json({ error: "sem-permissao" }, 403);

    const out = await verifyPurchase(sb, orgId, { productId, purchaseToken, packageName });
    return json({ data: out });
  } catch (err) {
    const status = (err as any)?.status ?? 500;
    const message = (err as Error)?.message ?? "erro-interno";
    if (status >= 500) console.error("play-verify erro", message);
    return json({ error: message }, status);
  }
});
