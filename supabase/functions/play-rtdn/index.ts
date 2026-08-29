// supabase/functions/play-rtdn/index.ts
//
// Webhook RTDN (Real-time Developer Notifications) do Google Play.
// Substitui POST /api/v1/play-billing/rtdn do Express.
// É público (push do Pub/Sub) — proteja com segredo compartilhado (?secret=).
// Faça o deploy com --no-verify-jwt (é server-to-server, sem JWT de usuário).
import { adminClient, claimEvent, releaseEvent } from "../_shared/db.ts";
import { handleRtdn } from "../_shared/play-billing.ts";

interface Decoded {
  messageId: string | null;
  notification: any | null;
}

// Envelope de push do Pub/Sub → DeveloperNotification.
function decodeEnvelope(body: any): Decoded {
  const msg = body?.message;
  const messageId = msg?.messageId || msg?.message_id || null;
  const dataB64 = msg?.data;
  if (!dataB64) return { messageId, notification: null };
  try {
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(String(dataB64)), (c) => c.charCodeAt(0)),
    );
    return { messageId, notification: JSON.parse(json) };
  } catch {
    return { messageId, notification: null };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method-not-allowed" }), { status: 405 });
  }

  try {
    // 1. Segredo compartilhado (se configurado).
    const secret = Deno.env.get("PLAY_RTDN_SECRET");
    if (secret) {
      const url = new URL(req.url);
      const provided = url.searchParams.get("secret") || req.headers.get("x-rtdn-secret");
      if (provided !== secret) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
      }
    }

    const body = await req.json().catch(() => null);
    const { messageId, notification } = decodeEnvelope(body);
    // Envelope vazio/inválido: reconhece para o Pub/Sub não reenviar.
    if (!notification) return new Response(null, { status: 204 });

    const sb = adminClient();

    // 2. Idempotência por messageId.
    if (messageId) {
      const fresh = await claimEvent(sb, `rtdn:${messageId}`, "play_rtdn");
      if (!fresh) {
        return new Response(JSON.stringify({ duplicate: true }), { status: 200 });
      }
    }

    try {
      const out = await handleRtdn(sb, notification);
      return new Response(JSON.stringify({ ok: true, ...out }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      // Falha de processamento: libera o claim para o Pub/Sub reentregar.
      if (messageId) await releaseEvent(sb, `rtdn:${messageId}`).catch(() => {});
      throw err;
    }
  } catch (err) {
    console.error("play-rtdn erro", (err as Error)?.message);
    return new Response(JSON.stringify({ error: "erro-interno" }), { status: 500 });
  }
});
