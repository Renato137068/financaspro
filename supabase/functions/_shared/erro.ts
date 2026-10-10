// supabase/functions/_shared/erro.ts
//
// Resposta de erro das funções chamadas pelo app.
//
// 4xx é decisão nossa e leva o código para o app ("sem-permissao",
// "assinatura-paga-existe"...). 5xx é falha: a mensagem crua (do banco, do
// Stripe, do Google) ia para o cliente, com nome de tabela, de coluna e às
// vezes o corpo da resposta de outro serviço (achado 8 da auditoria do
// servidor, 09/10). Agora o detalhe fica só no log da função e o app recebe
// "erro-interno", que ele já trata como falha genérica.

/** Tempo máximo de uma chamada a serviço externo (Google, Resend). */
export const TEMPO_LIMITE_MS = 10_000;

export function erroParaCliente(err: unknown, rotulo: string): { status: number; error: string } {
  const status = Number((err as any)?.status) || 500;
  const message = (err as Error)?.message || "erro-interno";
  if (status >= 500) {
    console.error(rotulo + " erro", message);
    return { status, error: "erro-interno" };
  }
  return { status, error: message };
}
