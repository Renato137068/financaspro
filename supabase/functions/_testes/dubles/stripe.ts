// Substitui https://esm.sh/stripe@16.12.0?target=deno nos testes (deno.json).
// Registra cada chamada à API em `chamadas` e responde com o que o teste
// configurou em `respostas`. A verificação de assinatura do webhook é da
// biblioteca do Stripe; aqui a assinatura "valida" passa e qualquer outra
// falha, para testar o que o handler faz em cada caso.

export interface Chamada {
  metodo: string;
  args: unknown[];
}

export const estado = {
  chamadas: [] as Chamada[],
  respostas: {} as Record<string, (...args: any[]) => unknown>,
  reset() {
    this.chamadas = [];
    this.respostas = {};
  },
};

function registrar(metodo: string, padrao: (...args: any[]) => unknown) {
  return async (...args: unknown[]) => {
    estado.chamadas.push({ metodo, args });
    const r = estado.respostas[metodo];
    return r ? await r(...args) : padrao(...args);
  };
}

export default class Stripe {
  customers = {
    create: registrar("customers.create", () => ({ id: "cus_novo" })),
  };
  checkout = {
    sessions: {
      create: registrar("checkout.sessions.create", () => ({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" })),
    },
  };
  billingPortal = {
    sessions: {
      create: registrar("billingPortal.sessions.create", () => ({ url: "https://billing.stripe.test/p_1" })),
    },
  };
  subscriptions = {
    update: registrar("subscriptions.update", (id: string, dados: any) => ({ id, ...dados })),
    retrieve: registrar("subscriptions.retrieve", (id: string) => ({ id })),
  };
  webhooks = {
    constructEventAsync: async (corpo: string, assinatura: string) => {
      estado.chamadas.push({ metodo: "webhooks.constructEventAsync", args: [assinatura] });
      if (assinatura !== "valida") throw new Error("No signatures found matching the expected signature");
      return JSON.parse(corpo);
    },
  };

  constructor(public chave: string, public opcoes?: unknown) {}

  static createFetchHttpClient() {
    return {};
  }
  static createSubtleCryptoProvider() {
    return {};
  }
}
