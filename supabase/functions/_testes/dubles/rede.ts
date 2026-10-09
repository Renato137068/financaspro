// fetch falso: responde pelo Google (OAuth da conta de serviço, Play Developer
// API, tokeninfo do OIDC) e pelo Resend, e registra cada pedido. Qualquer URL
// sem rota falha o teste — nenhum teste sai para a rede.

export interface Pedido {
  url: string;
  metodo: string;
  headers: Headers;
  corpo: string;
  /** O signal passado ao fetch (tempo limite); null quando não veio nenhum. */
  sinal: AbortSignal | null;
}

export type Rota = (p: Pedido) => Response | Promise<Response>;

const original = globalThis.fetch;

export class Rede {
  pedidos: Pedido[] = [];
  private rotas: Array<[RegExp, Rota]> = [];

  rota(padrao: RegExp, fn: Rota) {
    this.rotas.unshift([padrao, fn]);
    return this;
  }

  instalar() {
    globalThis.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(entrada, init);
      const p: Pedido = {
        url: req.url,
        metodo: req.method,
        headers: req.headers,
        corpo: init?.body instanceof URLSearchParams ? init.body.toString() : await req.text(),
        sinal: init?.signal ?? null,
      };
      this.pedidos.push(p);
      for (const [re, fn] of this.rotas) if (re.test(p.url)) return fn(p);
      throw new Error("teste tentou sair para a rede: " + p.url);
    };
    return this;
  }

  pedidosPara(re: RegExp): Pedido[] {
    return this.pedidos.filter((p) => re.test(p.url));
  }
}

export function restaurarFetch() {
  globalThis.fetch = original;
}

export function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

// ─── Google ─────────────────────────────────────────────────────────────────

function pem(der: ArrayBuffer): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  return "-----BEGIN PRIVATE KEY-----\n" + b64.replace(/(.{64})/g, "$1\n") + "\n-----END PRIVATE KEY-----\n";
}

let chaveCache: string | null = null;

/** JSON de conta de serviço com uma chave RSA de verdade (o código assina o JWT). */
export async function contaDeServico(email = "play@projeto.iam.gserviceaccount.com"): Promise<string> {
  if (!chaveCache) {
    const par = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    chaveCache = pem(await crypto.subtle.exportKey("pkcs8", par.privateKey));
  }
  return JSON.stringify({ client_email: email, private_key: chaveCache });
}

export interface AssinaturaGoogle {
  subscriptionState: string;
  lineItems: Array<{ productId?: string; expiryTime?: string; autoRenewingPlan?: { autoRenewEnabled?: boolean } }>;
  canceledStateContext?: unknown;
}

/**
 * Instala as rotas do Google. `assinaturas` mapeia purchaseToken → resposta da
 * subscriptionsv2 (ou um status HTTP de erro).
 */
export function google(rede: Rede, assinaturas: Record<string, AssinaturaGoogle | number>) {
  rede.rota(/^https:\/\/oauth2\.googleapis\.com\/token$/, () => json({ access_token: "ya29.teste", expires_in: 3600 }));
  rede.rota(/androidpublisher\.googleapis\.com\/.*\/purchases\/subscriptionsv2\/tokens\//, (p) => {
    const token = decodeURIComponent(p.url.split("/tokens/")[1]);
    const r = assinaturas[token];
    if (r === undefined) return json({ error: { code: 404 } }, 404);
    if (typeof r === "number") return json({ error: { code: r } }, r);
    return json(r);
  });
  return rede;
}

export function emDias(dias: number): string {
  return new Date(Date.now() + dias * 86400000).toISOString();
}
