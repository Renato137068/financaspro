// supabase/functions/_shared/reconcile.ts
//
// Reconciliação periódica das assinaturas com a loja. Substitui o worker
// billing-reconcile do Express (backend/workers/), que rodava a cada ciclo do
// BullMQ: aqui quem chama é o pg_cron, uma vez por dia (migração
// 20261002120000_agendamentos.sql), pela Edge Function billing-reconcile.
//
// O fluxo normal não depende disto: a Play avisa pelo RTDN (play-rtdn) e o
// Stripe pelo webhook (stripe-webhook). A reconciliação é a rede para o aviso
// que não chegou — endpoint fora do ar mais tempo que a janela de reentrega,
// segredo trocado, notificação descartada.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import type Stripe from "npm:stripe@22.6.2";
import { revokePlayEntitlement, updateSubscription } from "./db.ts";
import { syncFromToken } from "./play-billing.ts";

/**
 * Quanto tempo, depois do fim do período, uma assinatura da Play que o Google
 * não conseguiu confirmar ainda espera antes de ser revogada só pela data.
 * Cobre uma falha passageira da API do Google sem cortar quem pagou; depois
 * disso, vale o que o Express fazia (revogar pela data).
 */
export const CARENCIA_SEM_GOOGLE_MS = 3 * 86400000;

export interface ResultadoPlay {
  vencidas: number;
  renovadas: number;
  revogadas: number;
  falhas: number;
  semGoogle: boolean;
}

function temContaDeServico(): boolean {
  return !!(Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") || "").trim();
}

/**
 * Assinaturas da Play ainda ACTIVE com o período vencido. Para cada uma,
 * pergunta ao Google (syncFromToken): se renovou e o RTDN se perdeu, grava a
 * validade nova; se não vale mais, revoga.
 *
 * Sem a conta de serviço, ou com o Google falhando por mais que a carência,
 * revoga pela data — o mesmo critério do worker do Express. Uma falha dentro
 * da carência não escreve nada: a próxima rodada tenta de novo.
 */
export async function reconcilePlay(sb: SupabaseClient, agora = new Date()): Promise<ResultadoPlay> {
  const { data, error } = await sb
    .from("Subscription")
    .select("orgId, stripeSubId, status, currentPeriodEnd")
    .like("stripeSubId", "play:%")
    .eq("status", "ACTIVE")
    .lt("currentPeriodEnd", agora.toISOString());
  if (error) throw new Error("reconcile-play: " + error.message);

  const linhas = data || [];
  const semGoogle = !temContaDeServico();
  const r: ResultadoPlay = { vencidas: linhas.length, renovadas: 0, revogadas: 0, falhas: 0, semGoogle };

  for (const linha of linhas) {
    const fim = linha.currentPeriodEnd ? new Date(linha.currentPeriodEnd).toISOString() : null;
    const pelaData = () => revokePlayEntitlement(sb, linha.orgId, { expiresAt: fim });

    if (semGoogle) {
      await pelaData();
      r.revogadas++;
      continue;
    }

    try {
      const out: any = await syncFromToken(sb, String(linha.stripeSubId).slice("play:".length));
      if (!out.handled) throw new Error(out.reason || "nao-tratado");
      if (out.entitled) r.renovadas++;
      else r.revogadas++;
    } catch (e) {
      const vencidaHa = fim ? agora.getTime() - new Date(fim).getTime() : Infinity;
      if (vencidaHa > CARENCIA_SEM_GOOGLE_MS) {
        await pelaData();
        r.revogadas++;
      } else {
        r.falhas++;
      }
      console.warn("reconcile-play: Google não confirmou", linha.orgId, (e as Error)?.message);
    }
  }
  return r;
}

export interface ResultadoStripe {
  conferidas: number;
  atualizadas: number;
  falhas: number;
}

/** Período atual: na assinatura (API antiga) ou no item (dahlia), como no webhook. */
function periodo(stripeSub: any): { inicio: string | null; fim: string | null } {
  const item = stripeSub?.items?.data?.[0];
  const iso = (s: unknown) => (typeof s === "number" && Number.isFinite(s) ? new Date(s * 1000).toISOString() : null);
  return {
    inicio: iso(stripeSub?.current_period_start ?? item?.current_period_start),
    fim: iso(stripeSub?.current_period_end ?? item?.current_period_end),
  };
}

/**
 * Assinaturas do Stripe que o banco ainda não deu por canceladas: relê cada uma
 * na API e grava status, período e cancel_at_period_end, como o webhook
 * customer.subscription.updated faria. Erro numa assinatura (inclusive "não
 * existe") é contado e não escreve nada: chave de teste contra id de produção
 * não pode cancelar a base inteira.
 */
export async function reconcileStripe(sb: SupabaseClient, stripe: Stripe): Promise<ResultadoStripe> {
  const { data, error } = await sb
    .from("Subscription")
    .select("orgId, stripeSubId, status")
    .not("stripeSubId", "is", null)
    .not("stripeSubId", "like", "play:%")
    .neq("status", "CANCELED");
  if (error) throw new Error("reconcile-stripe: " + error.message);

  const linhas = data || [];
  const r: ResultadoStripe = { conferidas: linhas.length, atualizadas: 0, falhas: 0 };

  for (const linha of linhas) {
    try {
      const s: any = await stripe.subscriptions.retrieve(String(linha.stripeSubId));
      const p = periodo(s);
      const dados: Record<string, unknown> = {
        status: String(s.status).toUpperCase(),
        cancelAtPeriodEnd: !!s.cancel_at_period_end,
      };
      // Período ausente não apaga o que o banco já tem.
      if (p.inicio) dados.currentPeriodStart = p.inicio;
      if (p.fim) dados.currentPeriodEnd = p.fim;
      await updateSubscription(sb, linha.orgId, dados);
      r.atualizadas++;
    } catch (e) {
      r.falhas++;
      console.warn("reconcile-stripe: falhou", linha.orgId, (e as Error)?.message);
    }
  }
  return r;
}
