// Ambiente de cada teste: variáveis, console silenciado e limpeza no fim.
// O token de acesso do Google fica em cache por client_email dentro do
// módulo; cada teste usa um e-mail próprio para não herdar o do anterior.

import { restaurarFetch } from "./rede.ts";

const VARIAVEIS = [
  "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "PLAY_PACKAGE_NAME", "PLAY_SANDBOX_ENABLED",
  "PLAY_RTDN_SECRET", "PLAY_RTDN_SERVICE_ACCOUNT", "PLAY_RTDN_AUDIENCE",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "APP_URL", "BILLING_ALLOWED_ORIGINS",
  "RESEND_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
];

export interface Logs {
  warn: unknown[][];
  error: unknown[][];
  log: unknown[][];
}

/** Roda `fn` com as variáveis dadas (as outras apagadas) e o console capturado. */
export async function comAmbiente<T>(vars: Record<string, string>, fn: (logs: Logs) => Promise<T>): Promise<T> {
  const antes = Object.fromEntries(VARIAVEIS.map((v) => [v, Deno.env.get(v)]));
  const cons = { warn: console.warn, error: console.error, log: console.log };
  const logs: Logs = { warn: [], error: [], log: [] };
  for (const v of VARIAVEIS) Deno.env.delete(v);
  for (const [k, v] of Object.entries(vars)) Deno.env.set(k, v);
  console.warn = (...a: unknown[]) => void logs.warn.push(a);
  console.error = (...a: unknown[]) => void logs.error.push(a);
  console.log = (...a: unknown[]) => void logs.log.push(a);
  try {
    return await fn(logs);
  } finally {
    Object.assign(console, cons);
    restaurarFetch();
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

let seq = 0;
/** E-mail de conta de serviço único por teste (fura o cache de token do módulo). */
export function emailUnico(): string {
  return `play-${++seq}-${Date.now()}@projeto.iam.gserviceaccount.com`;
}

/** Token de compra no formato aceito (20+ caracteres). */
export function tokenDeCompra(sufixo: string): string {
  return "tok-" + sufixo.padEnd(24, "x");
}

/** Espera um erro com `status` e mensagem. */
export async function falhaCom(p: Promise<unknown>, status: number, mensagem: string) {
  try {
    await p;
  } catch (e: any) {
    if (e?.status !== status || e?.message !== mensagem) {
      throw new Error(`esperava ${status} ${mensagem}, veio ${e?.status} ${e?.message}`);
    }
    return;
  }
  throw new Error(`esperava ${status} ${mensagem}, mas não falhou`);
}
