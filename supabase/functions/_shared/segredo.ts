// supabase/functions/_shared/segredo.ts
//
// Comparação de segredo compartilhado (header) sem vazar tamanho nem posição
// da primeira diferença: compara os digests, que têm sempre 32 bytes. Usada
// pelas funções server-to-server que sobem com --no-verify-jwt.

export async function segredoConfere(recebido: string, esperado: string): Promise<boolean> {
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
