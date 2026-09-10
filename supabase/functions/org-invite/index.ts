// supabase/functions/org-invite/index.ts
//
// Cria convite + e-mail (Resend). Exige OWNER/ADMIN e plano PRO+.
import { adminClient, findPlanById, findSubscription, orgRoleOf } from "../_shared/db.ts";
import { notify } from "../_shared/email.ts";
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
    const orgId = body?.orgId;
    const email = String(body?.email || "").trim().toLowerCase();
    const role = body?.role || "MEMBER";
    if (!orgId || !email || !email.includes("@")) {
      return json(req, { error: "parametros-invalidos" }, 400);
    }
    if (!["ADMIN", "MEMBER", "VIEWER"].includes(role)) {
      return json(req, { error: "papel-invalido" }, 400);
    }

    const callerRole = await orgRoleOf(sb, orgId, user.id);
    if (callerRole !== "OWNER" && callerRole !== "ADMIN") {
      return json(req, { error: "sem-permissao" }, 403);
    }

    const sub = await findSubscription(sb, orgId);
    const plan = sub?.planId ? await findPlanById(sb, sub.planId) : null;
    const tier = String(plan?.tier || "FREE").toUpperCase();
    if (tier === "FREE") return json(req, { error: "upgrade-necessario" }, 402);

    const rawMax = plan?.maxUsers;
    const maxUsers = rawMax == null ? 1 : (Number(rawMax) === 0 ? null : Number(rawMax));
    if (maxUsers != null) {
      const mem = await sb
        .from("OrganizationMember")
        .select("id", { count: "exact", head: true })
        .eq("orgId", orgId);
      const pend = await sb
        .from("Invitation")
        .select("id", { count: "exact", head: true })
        .eq("orgId", orgId)
        .is("acceptedAt", null)
        .gt("expiresAt", new Date().toISOString());
      const seats = (mem.count || 0) + (pend.count || 0);
      if (seats >= maxUsers) return json(req, { error: "limite-membros" }, 402);
    }

    const { data: existing } = await sb
      .from("Invitation")
      .select("id")
      .eq("orgId", orgId)
      .eq("email", email)
      .is("acceptedAt", null)
      .gt("expiresAt", new Date().toISOString())
      .maybeSingle();
    if (existing) return json(req, { error: "convite-ja-enviado" }, 409);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const id = crypto.randomUUID();
    const token = crypto.randomUUID();

    const { data: inv, error: insErr } = await sb
      .from("Invitation")
      .insert({
        id,
        orgId,
        email,
        role,
        token,
        expiresAt: expiresAt.toISOString(),
      })
      .select("id, email, role, token, expiresAt")
      .single();
    if (insErr) throw insErr;

    const { data: org } = await sb.from("Organization").select("name").eq("id", orgId).maybeSingle();
    await notify("invite-member", {
      to: email,
      orgName: org?.name || "FinançasPro",
      token,
    });

    return json(req, { data: inv });
  } catch (err) {
    const status = (err as any)?.status ?? 500;
    const message = (err as Error)?.message ?? "erro-interno";
    if (status >= 500) console.error("org-invite erro", message);
    return json(req, { error: message }, status);
  }
});
