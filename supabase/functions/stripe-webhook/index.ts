// supabase/functions/stripe-webhook/index.ts
//
// Webhook do Stripe. Substitui POST /api/v1/billing/webhook do Express.
// É server-to-server (assinado pelo Stripe) — deploy com --no-verify-jwt.
// A assinatura é verificada com constructEventAsync (Web Crypto), pois o
// constructEvent síncrono depende do crypto do Node.
import { adminClient, claimEvent, releaseEvent } from "../_shared/db.ts";
import { cryptoProvider, stripeClient } from "../_shared/stripe.ts";
import { processStripeEvent } from "../_shared/stripe-billing.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method-not-allowed" }), { status: 405 });
  }

  const sig = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!sig || !webhookSecret) {
    return new Response(JSON.stringify({ error: "webhook-nao-configurado" }), { status: 400 });
  }

  const body = await req.text(); // corpo cru — necessário para a verificação
  const stripe = stripeClient();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret, undefined, cryptoProvider());
  } catch (err) {
    console.error("Assinatura de webhook Stripe inválida", (err as Error)?.message);
    return new Response(JSON.stringify({ error: "assinatura-invalida" }), { status: 400 });
  }

  const sb = adminClient();

  // Idempotência por event.id.
  const fresh = await claimEvent(sb, event.id, event.type);
  if (!fresh) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  try {
    await processStripeEvent(sb, stripe, event);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // Falha de processamento: libera o claim para o Stripe reentregar.
    await releaseEvent(sb, event.id).catch(() => {});
    console.error("stripe-webhook erro", (err as Error)?.message);
    return new Response(JSON.stringify({ error: "erro-interno" }), { status: 500 });
  }
});
