// supabase/functions/_shared/stripe.ts
//
// Cliente Stripe para Deno + utilidades. Usa o HTTP client baseado em fetch e o
// SubtleCryptoProvider (verificação de webhook via Web Crypto — o constructEvent
// síncrono depende do crypto do Node e não roda no Deno).
import Stripe from "https://esm.sh/stripe@16?target=deno";

export function stripeClient(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) {
    const e: any = new Error("stripe-nao-configurado");
    e.status = 503;
    throw e;
  }
  return new Stripe(key, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function cryptoProvider() {
  return Stripe.createSubtleCryptoProvider();
}

// ─── Anti-open-redirect (port de billing-urls.js) ───────────────────────────

function normalizeOrigin(raw: string): string | null {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export { normalizeOrigin as normalizeOriginSafe };

export function allowedBillingOrigins(): string[] {
  const origins = new Set<string>();
  const appUrl = Deno.env.get("APP_URL");
  const base = appUrl ? normalizeOrigin(appUrl) : null;
  if (base) origins.add(base);

  const extra = Deno.env.get("BILLING_ALLOWED_ORIGINS") || "";
  for (const entry of extra.split(",").map((s) => s.trim()).filter(Boolean)) {
    const o = normalizeOrigin(entry);
    if (o) origins.add(o);
  }
  return [...origins];
}

export function assertAllowedRedirectUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    const e: any = new Error("url-de-retorno-invalida");
    e.status = 400;
    throw e;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    const e: any = new Error("url-de-retorno-deve-ser-http");
    e.status = 400;
    throw e;
  }
  const origin = `${parsed.protocol}//${parsed.host}`;
  if (!allowedBillingOrigins().includes(origin)) {
    const e: any = new Error("url-de-retorno-nao-permitida");
    e.status = 400;
    throw e;
  }
}

/** @deprecated use ./email.ts — reexport para imports legados */
export { notify } from "./email.ts";
