// supabase/functions/_shared/play-billing.ts
//
// Port de backend/domain/services/play-billing.service.js.
// Verificação e sincronização de entitlement do Google Play.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSubscriptionV2 } from "./google-play.ts";
import {
  findByPlayPurchaseToken,
  revokePlayEntitlement,
  upsertPlayEntitlement,
} from "./db.ts";

const PRODUCT_TIERS: Record<string, string> = {
  "financaspro.pro.monthly": "PRO",
  "financaspro.pro.yearly": "PRO",
  "financaspro.business.monthly": "BUSINESS",
  "financaspro.business.yearly": "BUSINESS",
};

export function resolveTier(productId: string): string | null {
  return PRODUCT_TIERS[productId] || null;
}

function normalizeToken(token: unknown): string | null {
  if (typeof token !== "string") return null;
  const t = token.trim();
  if (t.length < 20 || t.length > 4096) return null;
  return t;
}

function httpError(status: number, message: string): Error {
  const e: any = new Error(message);
  e.status = status;
  return e;
}

function saJson(): string | null {
  return Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") || null;
}

/**
 * O pacote NÃO vem do cliente.
 *
 * Antes, `packageName(body.packageName)` deixava quem chama escolher contra
 * qual app a compra seria conferida, caindo na env só quando o campo vinha
 * vazio. O servidor já sabe a resposta — não há motivo para aceitar palpite em
 * um parâmetro de segurança. O corpo continua sendo aceito na requisição (o
 * app manda), mas é ignorado.
 */
function packageName(): string {
  return Deno.env.get("PLAY_PACKAGE_NAME") || "com.financaspro.mobile";
}

/**
 * Sandbox exige opt-in explícito.
 *
 * A regra antiga era `token começa com GPA.test. E não há service account`.
 * Ela transformava a AUSÊNCIA de configuração em permissão: num projeto onde
 * alguém esquecesse de setar GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, qualquer token
 * `GPA.test.*` valia 30 dias de Pro sem verificação nenhuma — e, no mesmo
 * cenário, as compras de verdade morriam em 503. Os dois lados do mesmo
 * interruptor: ninguém consegue pagar e qualquer um consegue não pagar.
 *
 * Agora o sandbox só existe quando PLAY_SANDBOX_ENABLED for ligado de
 * propósito. Sem ele, falta de service account é erro de configuração — que é
 * o que de fato é — e não uma porta aberta.
 */
function sandboxLiberado(): boolean {
  const flag = (Deno.env.get("PLAY_SANDBOX_ENABLED") || "").trim().toLowerCase();
  return flag === "1" || flag === "true";
}

/** Verifica uma compra e grava o entitlement. Port de verifyPurchase. */
export async function verifyPurchase(
  sb: SupabaseClient,
  orgId: string,
  body: { productId: string; purchaseToken: string; packageName?: string },
) {
  const token = normalizeToken(body.purchaseToken);
  if (!token) throw httpError(400, "purchase-token-invalido");

  let tier = resolveTier(body.productId);
  if (!tier) throw httpError(400, "produto-desconhecido");

  const pkg = packageName();
  const sa = saJson();
  const sandbox = sandboxLiberado() && !sa && token.startsWith("GPA.test.");

  let expiresAt: string;
  let verifiedProductId = body.productId;
  let cancelAtPeriodEnd = false;

  if (sandbox) {
    expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  } else if (sa) {
    const sub = await getSubscriptionV2({
      serviceAccountJson: sa,
      packageName: pkg,
      purchaseToken: token,
    });
    if (!sub.entitled) {
      // Reconciliação sem RTDN: se o token sustenta o Pro desta org, revoga.
      const dono = await findByPlayPurchaseToken(sb, token);
      if (dono && dono.orgId === orgId) {
        await revokePlayEntitlement(sb, orgId, { expiresAt: sub.expiryTime });
      }
      throw httpError(402, "assinatura-nao-ativa");
    }
    if (sub.productId) {
      const realTier = resolveTier(sub.productId);
      if (!realTier) throw httpError(400, "produto-desconhecido");
      tier = realTier;
      verifiedProductId = sub.productId;
    }
    expiresAt = sub.expiryTime || new Date(Date.now() + 30 * 86400000).toISOString();
    // Cancelou na Play mas ainda tem acesso até o fim do ciclo pago.
    cancelAtPeriodEnd = !!sub.cancelAtPeriodEnd;
  } else {
    throw httpError(503, "play-api-nao-configurada");
  }

  const existing = await findByPlayPurchaseToken(sb, token);
  if (existing && existing.orgId !== orgId) throw httpError(409, "token-em-uso");

  await upsertPlayEntitlement(sb, orgId, {
    productId: verifiedProductId,
    purchaseToken: token,
    tier,
    expiresAt,
    cancelAtPeriodEnd,
  });

  return {
    tier,
    productId: verifiedProductId,
    expiresAt,
    cancelAtPeriodEnd,
    restored: !!existing,
  };
}

/** Reconsulta o token no Google e renova ou revoga. Port de syncFromToken. */
export async function syncFromToken(sb: SupabaseClient, purchaseToken: string) {
  const token = normalizeToken(purchaseToken);
  if (!token) return { handled: false, reason: "token-invalido" };

  const owner = await findByPlayPurchaseToken(sb, token);
  if (!owner) {
    /* Nos logs, um RTDN quebrado é idêntico a um saudável: 200 em tudo. Se o
       play-verify nunca gravou o token, TODA notificação daquela assinatura
       cai aqui em silêncio e o entitlement nunca mais é atualizado. Um aviso
       transforma isso em algo procurável antes de virar reclamação. */
    console.warn(
      "play-rtdn: notificação para token não registrado — o play-verify gravou "
      + "esta compra? Sem o token no banco, o entitlement nunca é reconciliado.",
    );
    return { handled: false, reason: "token-desconhecido" };
  }
  const orgId = owner.orgId as string;

  const sa = saJson();
  if (!sa) return { handled: false, reason: "api-nao-configurada", orgId };

  const sub = await getSubscriptionV2({
    serviceAccountJson: sa,
    packageName: packageName(),
    purchaseToken: token,
  });

  if (sub.entitled) {
    const tier = sub.productId ? resolveTier(sub.productId) : null;
    if (tier) {
      await upsertPlayEntitlement(sb, orgId, {
        productId: sub.productId!,
        purchaseToken: token,
        tier,
        expiresAt: sub.expiryTime,
        cancelAtPeriodEnd: !!sub.cancelAtPeriodEnd,
      });
    }
    return {
      handled: true,
      orgId,
      entitled: true,
      tier,
      expiresAt: sub.expiryTime,
      cancelAtPeriodEnd: !!sub.cancelAtPeriodEnd,
    };
  }

  await revokePlayEntitlement(sb, orgId, { expiresAt: sub.expiryTime });
  return { handled: true, orgId, entitled: false, expiresAt: sub.expiryTime };
}

/** Processa uma Developer Notification já decodificada. Port de handleRtdn. */
export async function handleRtdn(sb: SupabaseClient, notification: any) {
  /* Teste do Play Console: reconhecer explicitamente. Antes caía no mesmo
     "sem-subscription-notification" de um envelope desconhecido, e quem clica
     em "Enviar notificação de teste" lia isso como falha do endpoint. */
  if (notification && notification.testNotification) {
    return { handled: true, tipo: "teste", reason: "notificacao-de-teste-do-play-console" };
  }

  const sn = notification && notification.subscriptionNotification;
  if (sn && sn.purchaseToken) {
    return syncFromToken(sb, sn.purchaseToken);
  }

  /* Compra anulada — reembolso ou chargeback.
   *
   * Para assinatura o caminho comum é SUBSCRIPTION_REVOKED (tipo 12), que já
   * cai no ramo acima. Mas o Google também manda voidedPurchaseNotification, e
   * ela era só reconhecida e descartada: a resposta era 200 com handled:false
   * e o Pro continuava de pé depois do estorno. Reconsultar o token resolve os
   * dois casos com o mesmo código — quem decide se ainda vale é o Google. */
  const vp = notification && notification.voidedPurchaseNotification;
  if (vp && vp.purchaseToken) {
    const out = await syncFromToken(sb, vp.purchaseToken);
    return Object.assign({ tipo: "compra-anulada" }, out);
  }

  return { handled: false, reason: "sem-subscription-notification" };
}
