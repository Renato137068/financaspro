/**
 * prisma-fake.mjs — duplo em memória do Prisma Client.
 *
 * Permite rodar testes de integração HTTP contra a pilha Express REAL
 * (middleware, auth, validação, RBAC, tratamento de erro) sem precisar de um
 * PostgreSQL. É injetado via `globalThis.__prisma`, que backend/lib/db.js
 * consulta antes de instanciar o PrismaClient de verdade.
 *
 * NÃO substitui os testes com Postgres (backend-integration-test.mjs): aqui não
 * se exercita SQL, constraints do banco, cascatas nem tipos Decimal. O objetivo
 * é cobrir o comportamento da API — o que o banco real não valida sozinho.
 *
 * Suporta o subconjunto do Prisma usado pelo backend: findUnique, findFirst,
 * findMany, create, createMany, update, updateMany, upsert, delete, deleteMany,
 * count e $transaction.
 */
import { randomUUID } from 'crypto';

/** Defaults por modelo, espelhando @default() do prisma/schema.prisma. */
const DEFAULTS = {
  user: { role: 'USER', active: true, totpEnabled: false, emailVerified: false },
  transaction: { recurring: false, tags: [] },
  session: { revokedAt: null },
  account: { currency: 'BRL', balance: 0 },
  budget: { period: 'monthly' },
};

/** Campos DateTime que o Prisma preenche sozinho. */
function applyTimestamps(record, { isCreate }) {
  const now = new Date();
  if (isCreate && record.createdAt === undefined) record.createdAt = now;
  record.updatedAt = now;
  return record;
}

/** Avalia um filtro de campo do Prisma (equality ou operadores). */
function matchField(value, condition) {
  if (condition === null) return value === null || value === undefined;
  if (condition instanceof Date) return value?.getTime?.() === condition.getTime();

  // Igualdade direta (string, number, boolean)
  if (typeof condition !== 'object') return value === condition;

  // Operadores: { gte, lte, gt, lt, in, not, contains, equals }
  for (const [op, operand] of Object.entries(condition)) {
    switch (op) {
      case 'equals': if (!matchField(value, operand)) return false; break;
      case 'not':    if (matchField(value, operand)) return false; break;
      case 'in':     if (!operand.includes(value)) return false; break;
      case 'notIn':  if (operand.includes(value)) return false; break;
      case 'gte':    if (!(value >= operand)) return false; break;
      case 'lte':    if (!(value <= operand)) return false; break;
      case 'gt':     if (!(value > operand)) return false; break;
      case 'lt':     if (!(value < operand)) return false; break;
      case 'contains':
        if (!String(value ?? '').includes(String(operand))) return false;
        break;
      default:
        throw new Error(`prisma-fake: operador não suportado "${op}"`);
    }
  }
  return true;
}

/** Avalia um objeto `where` completo, incluindo AND/OR/NOT. */
function matchWhere(record, where) {
  if (!where) return true;

  for (const [key, condition] of Object.entries(where)) {
    if (condition === undefined) continue;

    if (key === 'AND') {
      if (!(Array.isArray(condition) ? condition : [condition]).every((w) => matchWhere(record, w))) return false;
      continue;
    }
    if (key === 'OR') {
      if (!condition.some((w) => matchWhere(record, w))) return false;
      continue;
    }
    if (key === 'NOT') {
      if (matchWhere(record, condition)) return false;
      continue;
    }
    if (!matchField(record[key], condition)) return false;
  }
  return true;
}

function applyOrderBy(rows, orderBy) {
  if (!orderBy) return rows;
  const specs = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const spec of specs) {
      const [field, dir] = Object.entries(spec)[0];
      const av = a[field], bv = b[field];
      if (av === bv) continue;
      const cmp = av > bv ? 1 : -1;
      return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

/** Clona para que o chamador não mute o store por referência. */
function clone(record) {
  if (record === null || record === undefined) return record;
  return structuredClone(record);
}

function createModel(name, store) {
  const rows = () => {
    if (!store.has(name)) store.set(name, []);
    return store.get(name);
  };

  const model = {
    async findUnique({ where }) {
      return clone(rows().find((r) => matchWhere(r, where)) ?? null);
    },

    async findFirst({ where, orderBy } = {}) {
      const found = applyOrderBy(rows().filter((r) => matchWhere(r, where)), orderBy);
      return clone(found[0] ?? null);
    },

    async findMany({ where, orderBy, skip = 0, take } = {}) {
      let found = applyOrderBy(rows().filter((r) => matchWhere(r, where)), orderBy);
      found = found.slice(skip, take === undefined ? undefined : skip + take);
      return found.map(clone);
    },

    async count({ where } = {}) {
      return rows().filter((r) => matchWhere(r, where)).length;
    },

    async create({ data }) {
      const record = applyTimestamps(
        { id: randomUUID(), ...DEFAULTS[name], ...structuredClone(data) },
        { isCreate: true },
      );
      rows().push(record);
      return clone(record);
    },

    async createMany({ data }) {
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) await model.create({ data: item });
      return { count: items.length };
    },

    async update({ where, data }) {
      const idx = rows().findIndex((r) => matchWhere(r, where));
      if (idx === -1) {
        // Espelha o comportamento do Prisma: update sem match é erro P2025.
        const err = new Error(`prisma-fake: registro não encontrado em ${name}`);
        err.code = 'P2025';
        throw err;
      }
      const merged = applyTimestamps({ ...rows()[idx], ...structuredClone(data) }, { isCreate: false });
      rows()[idx] = merged;
      return clone(merged);
    },

    async updateMany({ where, data }) {
      const targets = rows().filter((r) => matchWhere(r, where));
      for (const t of targets) Object.assign(t, structuredClone(data), { updatedAt: new Date() });
      return { count: targets.length };
    },

    async upsert({ where, create, update }) {
      const existing = rows().find((r) => matchWhere(r, where));
      if (existing) return model.update({ where, data: update });
      return model.create({ data: create });
    },

    async delete({ where }) {
      const idx = rows().findIndex((r) => matchWhere(r, where));
      if (idx === -1) {
        const err = new Error(`prisma-fake: registro não encontrado em ${name}`);
        err.code = 'P2025';
        throw err;
      }
      return clone(rows().splice(idx, 1)[0]);
    },

    async deleteMany({ where } = {}) {
      const keep = rows().filter((r) => !matchWhere(r, where));
      const removed = rows().length - keep.length;
      store.set(name, keep);
      return { count: removed };
    },
  };

  return model;
}

/**
 * Cria o duplo. Cada nome de modelo acessado é materializado sob demanda,
 * então não é preciso declarar a lista de modelos antecipadamente.
 */
export function createPrismaFake() {
  const store = new Map();
  const models = new Map();

  const target = {
    $on() { /* db.js registra listeners de log — no-op */ },
    $connect: async () => {},
    $disconnect: async () => {},
    /** Usado pelo health check (`SELECT 1`) para aferir conectividade. */
    $queryRaw: async () => [{ '?column?': 1 }],
    $executeRaw: async () => 0,
    /** Sem atomicidade real: executa as promises na ordem recebida. */
    $transaction: async (arg) => {
      if (typeof arg === 'function') return arg(proxy);
      return Promise.all(arg);
    },
    /** Utilitário de teste: limpa o estado entre casos. */
    __reset() { store.clear(); },
    /** Utilitário de teste: acesso direto ao store para arranjo/asserção. */
    __store: store,
  };

  const proxy = new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop !== 'string' || prop.startsWith('$') || prop.startsWith('__')) return undefined;
      if (!models.has(prop)) models.set(prop, createModel(prop, store));
      return models.get(prop);
    },
  });

  return proxy;
}

/**
 * Instala o duplo no slot global que backend/lib/db.js consulta.
 * DEVE ser chamado antes de qualquer import de módulo do backend.
 */
export function installPrismaFake() {
  const fake = createPrismaFake();
  globalThis.__prisma = fake;
  return fake;
}
