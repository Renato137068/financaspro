// supabase/functions/billing-reconcile/index.ts
//
// Reconciliação diária das assinaturas (Play e Stripe) com a loja. Substitui o
// worker billing-reconcile do Express. Quem chama é o pg_cron, via pg_net
// (migração 20261002120000_agendamentos.sql); à mão, para investigar:
//
//   curl -X POST "$SUPABASE_URL/functions/v1/billing-reconcile" \
//     -H "x-fp-cron-secret: $BILLING_RECONCILE_SECRET"
//
// É server-to-server, sem JWT de usuário: deploy com --no-verify-jwt. A
// defesa é o segredo BILLING_RECONCILE_SECRET no header x-fp-cron-secret,
// comparado em tempo constante. Sem o segredo configurado, recusa tudo (503).
import { adminClient } from "../_shared/db.ts";
import { reconcilePlay, reconcileStripe } from "../_shared/reconcile.ts";
import { segredoConfere } from "../_shared/segredo.ts";
import { stripeClient } from "../_shared/stripe.ts";

function resposta(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return resposta(405, { error: "method-not-allowed" });

  const segredo = Deno.env.get("BILLING_RECONCILE_SECRET");
  if (!segredo) {
    console.error("billing-reconcile: BILLING_RECONCILE_SECRET não configurado. Recusando.");
    return resposta(503, { error: "nao-configurado" });
  }
  const recebido = req.headers.get("x-fp-cron-secret") || "";
  if (!recebido || !(await segredoConfere(recebido, segredo))) {
    return resposta(403, { error: "forbidden" });
  }

  try {
    const sb = adminClient();
    const play = await reconcilePlay(sb);
    // Stripe é opcional (o app da loja vende pela Play): sem chave, não há o
    // que conferir, e isso não é falha da rodada.
    const stripe = Deno.env.get("STRIPE_SECRET_KEY")
      ? await reconcileStripe(sb, stripeClient())
      : { pulado: "stripe-nao-configurado" };
    console.log("billing-reconcile", JSON.stringify({ play, stripe }));
    return resposta(200, { ok: true, play, stripe });
  } catch (err) {
    console.error("billing-reconcile erro", (err as Error)?.message);
    return resposta(500, { error: "erro-interno" });
  }
});
