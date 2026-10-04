// Banco em memória com a mesma API encadeada do supabase-js que as Edge
// Functions usam: from().select/insert/update/delete, eq/neq/is/like/lt/gt,
// not(col, "is" | "like", v),
// maybeSingle/single, select() depois de insert/update, contagem
// ({ count: "exact", head: true }) e auth.getUser. Guarda cada escrita em
// `escritas`, para os testes provarem que um caminho NÃO escreveu nada.
//
// select("a, b") devolve SÓ as colunas pedidas, como o PostgREST. Antes
// devolvia a linha inteira, e um select que esquecia uma coluna passava nos
// testes (foi assim que o teto de membros do org-invite ficou quebrado).
//
// Restrições únicas que o código depende delas (e que o Postgres garante):
// StripeWebhookEvent.id (idempotência de webhook, erro 23505) e
// Subscription.orgId (uma assinatura por org).

type Linha = Record<string, any>;
type Filtro = (l: Linha) => boolean;

const UNICAS: Record<string, string[]> = {
  StripeWebhookEvent: ["id"],
  Subscription: ["orgId"],
  Invoice: ["stripeInvoiceId"],
};

export interface Escrita {
  tabela: string;
  op: "insert" | "update" | "delete";
  dados?: Linha;
}

export class BancoFalso {
  tabelas: Record<string, Linha[]> = {};
  escritas: Escrita[] = [];
  /** JWT → usuário, para auth.getUser. */
  usuarios: Record<string, Linha> = {};

  constructor(inicial: Record<string, Linha[]> = {}) {
    for (const [t, linhas] of Object.entries(inicial)) {
      this.tabelas[t] = linhas.map((l) => ({ ...l }));
    }
  }

  auth = {
    getUser: async (jwt: string) => {
      const user = this.usuarios[jwt];
      return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } };
    },
  };

  linhas(tabela: string): Linha[] {
    return (this.tabelas[tabela] ||= []);
  }

  from(tabela: string) {
    return new Consulta(this, tabela);
  }

  escritasEm(tabela: string): Escrita[] {
    return this.escritas.filter((e) => e.tabela === tabela);
  }
}

function comoLike(padrao: string): RegExp {
  const esc = padrao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp("^" + esc + "$");
}

class Consulta implements PromiseLike<{ data: any; error: any }> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Linha | null = null;
  private filtros: Filtro[] = [];
  private retornar = false;
  private colunas: string[] | null = null;
  private contar = false;
  private soContagem = false;

  constructor(private banco: BancoFalso, private tabela: string) {}

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op !== "select") this.retornar = true;
    const lista = String(cols ?? "*").split(",").map((c) => c.trim()).filter(Boolean);
    // "*" ou embutidos (rel(col)) ficam com a linha inteira.
    this.colunas = lista.includes("*") || lista.some((c) => c.includes("(")) ? null : lista;
    if (opts?.count) this.contar = true;
    if (opts?.head) this.soContagem = true;
    return this;
  }

  private projetar(l: Linha): Linha {
    if (!this.colunas) return { ...l };
    const p: Linha = {};
    for (const c of this.colunas) if (c in l) p[c] = l[c];
    return p;
  }
  insert(dados: Linha) {
    this.op = "insert";
    this.payload = dados;
    return this;
  }
  update(dados: Linha) {
    this.op = "update";
    this.payload = dados;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, v: unknown) {
    this.filtros.push((l) => l[col] === v);
    return this;
  }
  neq(col: string, v: unknown) {
    this.filtros.push((l) => l[col] !== v);
    return this;
  }
  /** Só os operadores que as funções usam com not(): "is" e "like". */
  not(col: string, op: "is" | "like", v: unknown) {
    if (op === "is") this.filtros.push((l) => (l[col] ?? null) !== v);
    else if (op === "like") {
      const re = comoLike(String(v));
      this.filtros.push((l) => !(typeof l[col] === "string" && re.test(l[col])));
    } else throw new Error("not(): operador sem suporte no banco falso: " + op);
    return this;
  }
  is(col: string, v: null) {
    this.filtros.push((l) => (l[col] ?? null) === v);
    return this;
  }
  like(col: string, padrao: string) {
    const re = comoLike(padrao);
    this.filtros.push((l) => typeof l[col] === "string" && re.test(l[col]));
    return this;
  }
  lt(col: string, v: unknown) {
    this.filtros.push((l) => l[col] < (v as any));
    return this;
  }
  gt(col: string, v: unknown) {
    this.filtros.push((l) => l[col] > (v as any));
    return this;
  }

  private casa(): Linha[] {
    return this.banco.linhas(this.tabela).filter((l) => this.filtros.every((f) => f(l)));
  }

  private executar(): { data: any; error: any; count?: number } {
    const linhas = this.banco.linhas(this.tabela);
    switch (this.op) {
      case "select": {
        const achadas = this.casa();
        if (this.contar) {
          return { data: this.soContagem ? null : achadas.map((l) => this.projetar(l)), count: achadas.length, error: null };
        }
        return { data: achadas.map((l) => this.projetar(l)), error: null };
      }
      case "insert": {
        const nova = { ...this.payload! };
        for (const col of UNICAS[this.tabela] || []) {
          if (nova[col] != null && linhas.some((l) => l[col] === nova[col])) {
            return { data: null, error: { code: "23505", message: `duplicate key ${this.tabela}.${col}` } };
          }
        }
        linhas.push(nova);
        this.banco.escritas.push({ tabela: this.tabela, op: "insert", dados: nova });
        return { data: this.retornar ? [this.projetar(nova)] : null, error: null };
      }
      case "update": {
        const alvo = this.casa();
        for (const l of alvo) {
          Object.assign(l, this.payload);
          this.banco.escritas.push({ tabela: this.tabela, op: "update", dados: { ...this.payload } });
        }
        return { data: this.retornar ? alvo.map((l) => this.projetar(l)) : null, error: null };
      }
      case "delete": {
        const alvo = new Set(this.casa());
        this.banco.tabelas[this.tabela] = linhas.filter((l) => !alvo.has(l));
        for (const l of alvo) this.banco.escritas.push({ tabela: this.tabela, op: "delete", dados: { ...l } });
        return { data: null, error: null };
      }
    }
  }

  maybeSingle(): Promise<{ data: any; error: any }> {
    const r = this.executar();
    const lista = Array.isArray(r.data) ? r.data : [];
    if (lista.length > 1) return Promise.resolve({ data: null, error: { message: "mais de uma linha" } });
    return Promise.resolve({ data: lista[0] ?? null, error: r.error });
  }

  single(): Promise<{ data: any; error: any }> {
    const r = this.executar();
    const lista = Array.isArray(r.data) ? r.data : [];
    if (r.error) return Promise.resolve({ data: null, error: r.error });
    if (lista.length !== 1) return Promise.resolve({ data: null, error: { message: `esperava 1 linha, veio ${lista.length}` } });
    return Promise.resolve({ data: lista[0], error: null });
  }

  then<A = { data: any; error: any }, B = never>(
    ok?: ((v: { data: any; error: any }) => A | PromiseLike<A>) | null,
    falha?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.executar()).then(ok, falha);
  }
}
