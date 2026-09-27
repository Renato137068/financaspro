// supabase/functions/obs-ingest/index.ts
//
// Recebe relatórios de erro do app (OBS.captureError) e grava em
// public.fp_client_error. Sem isto, um crash no aparelho de um cliente era
// invisível: o OBS só guardava num buffer local.
//
// Público por desenho — o erro pode acontecer antes do login, e o app envia
// com navigator.sendBeacon, que não carrega header de autenticação. Deploy com
// --no-verify-jwt. As defesas ficam aqui:
//   • só relatórios de erro (kind "error"); eventos de analytics são recusados;
//   • corpo até 8 KB, sanitizado por _shared/obs-sanitize.js (allowlist de
//     contexto, máscara de e-mail, valores e números longos);
//   • origem fora da allowlist de CORS é recusada;
//   • limite por IP em memória (30/min por instância) — o IP não é gravado;
//   • retenção de 30 dias, purgada aqui mesmo em ~1% das gravações.
import { adminClient } from "../_shared/db.ts";
import { corsHeadersFor, corsPreflight, isOriginAllowed, originOf } from "../_shared/cors.ts";
import { LIMITE_CORPO, sanitizarRelatorio } from "../_shared/obs-sanitize.js";

const JANELA_MS = 60_000;
const MAX_POR_JANELA = 30;
const RETENCAO_DIAS = 30;
const porIp = new Map<string, { n: number; ate: number }>();

function dentroDoLimite(ip: string): boolean {
  const agora = Date.now();
  const atual = porIp.get(ip);
  if (!atual || atual.ate < agora) {
    if (porIp.size > 5000) porIp.clear();
    porIp.set(ip, { n: 1, ate: agora + JANELA_MS });
    return true;
  }
  atual.n += 1;
  return atual.n <= MAX_POR_JANELA;
}

function resposta(req: Request, status: number, erro?: string): Response {
  const headers = { ...corsHeadersFor(req), "Content-Type": "application/json" };
  if (status === 204) return new Response(null, { status, headers });
  return new Response(JSON.stringify({ error: erro }), { status, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(req);
  if (req.method !== "POST") return resposta(req, 405, "method-not-allowed");
  if (!isOriginAllowed(originOf(req))) return resposta(req, 403, "origin-not-allowed");

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "sem-ip";
  if (!dentroDoLimite(ip)) return resposta(req, 429, "rate-limited");

  const texto = await req.text();
  if (texto.length > LIMITE_CORPO) return resposta(req, 413, "corpo-grande");

  let entrada: unknown;
  try {
    entrada = JSON.parse(texto);
  } catch {
    return resposta(req, 400, "json-invalido");
  }

  const linha = sanitizarRelatorio(entrada, req.headers.get("user-agent"));
  if (!linha) return resposta(req, 400, "relatorio-invalido");

  const sb = adminClient();
  const { error } = await sb.from("fp_client_error").insert(linha);
  if (error) {
    console.error("[obs-ingest] falha ao gravar:", error.message);
    return resposta(req, 500, "falha-ao-gravar");
  }

  if (Math.random() < 0.01) {
    const corte = new Date(Date.now() - RETENCAO_DIAS * 86_400_000).toISOString();
    const { error: purgaErr } = await sb.from("fp_client_error").delete().lt("created_at", corte);
    if (purgaErr) console.error("[obs-ingest] falha na retenção:", purgaErr.message);
  }

  return resposta(req, 204);
});
