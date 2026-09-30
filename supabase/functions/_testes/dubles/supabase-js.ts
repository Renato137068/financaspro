// Substitui https://esm.sh/@supabase/supabase-js@2 nos testes (deno.json).
// adminClient() devolve o banco em memória que o teste instalou.
import type { BancoFalso } from "./banco.ts";

export type SupabaseClient = any;

let atual: BancoFalso | null = null;

export function usarBanco(banco: BancoFalso) {
  atual = banco;
}

export function createClient(_url: string, _key: string, _opts?: unknown): SupabaseClient {
  if (!atual) throw new Error("teste não instalou um banco (usarBanco)");
  return atual;
}
