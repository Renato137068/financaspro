// supabase/functions/_shared/cors.ts
//
// CORS com allowlist — substitui Access-Control-Allow-Origin: *.
// Com Content-Type: application/json o browser faz preflight; origem fora da
// lista não dispara o POST (protege cancel/checkout com JWT roubado em página
// maliciosa). curl/native ignoram CORS; auth JWT + OWNER continuam obrigatórios.
import { allowedBillingOrigins, normalizeOriginSafe } from "./stripe.ts";

const NATIVE_AND_DEV = [
  "https://app.financaspro.com",
  "https://financaspro.com",
  "http://localhost",
  "http://127.0.0.1",
  "https://localhost",
  "http://localhost:4321",
  "http://localhost:4322",
  "http://127.0.0.1:4321",
  "http://127.0.0.1:4322",
  "capacitor://localhost",
  "ionic://localhost",
];

function allowedSet(): Set<string> {
  const set = new Set<string>(NATIVE_AND_DEV);
  for (const o of allowedBillingOrigins()) set.add(o);
  return set;
}

/** Reexport / helper — stripe.ts tem normalizeOrigin privado; espelhamos aqui. */
export function originOf(req: Request): string | null {
  const raw = req.headers.get("Origin");
  if (!raw) return null;
  return normalizeOriginSafe(raw);
}

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true; // sem Origin (server-to-server / same-origin) — ok
  return allowedSet().has(origin);
}

/**
 * Headers CORS para a resposta. Se Origin presente e não permitida, omite
 * Access-Control-Allow-Origin (preflight falha no browser).
 */
export function corsHeadersFor(req: Request): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  const origin = originOf(req);
  if (origin && allowedSet().has(origin)) {
    base["Access-Control-Allow-Origin"] = origin;
  }
  return base;
}

export function corsPreflight(req: Request): Response {
  const origin = originOf(req);
  if (origin && !allowedSet().has(origin)) {
    return new Response(JSON.stringify({ error: "origin-not-allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json", Vary: "Origin" },
    });
  }
  return new Response("ok", { headers: corsHeadersFor(req) });
}
