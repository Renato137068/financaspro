// supabase/functions/play-rtdn/index.ts
//
// Webhook RTDN (Real-time Developer Notifications) do Google Play.
// Substitui POST /api/v1/play-billing/rtdn do Express.
// Faça o deploy com --no-verify-jwt (é server-to-server, sem JWT de usuário).
//
// ── Autenticação, em ordem de preferência ──────────────────────────────────
//
//   1. OIDC do Pub/Sub (recomendado). Configure a push subscription com uma
//      service account e defina PLAY_RTDN_SERVICE_ACCOUNT (e-mail dela) — e,
//      se você definiu audience no push, PLAY_RTDN_AUDIENCE. O Google assina
//      um token curto no header Authorization e nada secreto trafega na URL.
//
//        gcloud pubsub subscriptions update SUB \
//          --push-auth-service-account=SA@PROJETO.iam.gserviceaccount.com
//
//   2. Segredo compartilhado em header (x-rtdn-secret) — para chamadas que
//      você mesmo dispara.
//
//   3. Segredo em query string (?secret=) — DEPRECADO. O Pub/Sub push não
//      envia headers customizados, então este era o único caminho; mas URL vai
//      para log de proxy, de plataforma e de erro. Continua aceito para não
//      derrubar integração existente, com aviso no log. Migre para o item 1.
//
// Sem nenhum dos três configurados a função RECUSA tudo (503). Antes ela
// aceitava qualquer POST quando PLAY_RTDN_SECRET estava vazio — falha aberta
// num endpoint que mexe em assinatura.
import { adminClient, claimEvent, releaseEvent } from "../_shared/db.ts";
import { handleRtdn } from "../_shared/play-billing.ts";

/**
 * Comparação sem vazar tamanho nem posição da primeira diferença: compara os
 * digests, que têm sempre 32 bytes.
 */
async function segredoConfere(recebido: string, esperado: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(recebido)),
    crypto.subtle.digest("SHA-256", enc.encode(esperado)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/**
 * Valida o token OIDC que o Pub/Sub anexa. Usa o tokeninfo do próprio Google
 * em vez de verificar RS256 na mão: menos código para errar, e o volume de
 * RTDN não justifica cache de JWKS.
 */
async function oidcConfere(req: Request, saEsperada: string, audiencia: string | undefined) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return false;
  try {
    const r = await fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token),
    );
    if (!r.ok) return false;
    const info = await r.json();
    if (info.email !== saEsperada) return false;
    if (String(info.email_verified) !== "true") return false;
    if (audiencia && info.aud !== audiencia) return false;
    return true;
  } catch {
    return false;
  }
}

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
    // 1. Autenticação. Sem mecanismo configurado, recusa — nunca aceita geral.
    const secret = Deno.env.get("PLAY_RTDN_SECRET");
    const saEsperada = Deno.env.get("PLAY_RTDN_SERVICE_ACCOUNT");
    const audiencia = Deno.env.get("PLAY_RTDN_AUDIENCE") || undefined;

    if (!secret && !saEsperada) {
      console.error(
        "play-rtdn: nenhum mecanismo de autenticação configurado " +
        "(defina PLAY_RTDN_SERVICE_ACCOUNT ou PLAY_RTDN_SECRET). Recusando.",
      );
      return new Response(JSON.stringify({ error: "nao-configurado" }), { status: 503 });
    }

    let autorizado = false;

    if (saEsperada) {
      autorizado = await oidcConfere(req, saEsperada, audiencia);
    }

    if (!autorizado && secret) {
      const doHeader = req.headers.get("x-rtdn-secret");
      const daQuery = new URL(req.url).searchParams.get("secret");
      if (doHeader) {
        autorizado = await segredoConfere(doHeader, secret);
      } else if (daQuery) {
        autorizado = await segredoConfere(daQuery, secret);
        if (autorizado) {
          console.warn(
            "play-rtdn: segredo recebido em query string (deprecado — vai para " +
            "log de proxy e de plataforma). Migre para OIDC do Pub/Sub.",
          );
        }
      }
    }

    if (!autorizado) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
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
