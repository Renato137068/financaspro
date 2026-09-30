/**
 * sync-engine-erros.test.js — os caminhos de erro da sincronização.
 *
 * Achado M1 da reauditoria de 30/09: o sync-engine tinha 84% das linhas e só
 * 46% dos ramos cobertos, e os ramos de fora eram justamente os de rede
 * caindo, resposta parcial, rejeição e sessão expirada — onde um lançamento
 * se perde ou duplica. Aqui cada falha é um caso de tabela com a mesma
 * pergunta: a outbox sobrevive intacta, a tentativa conta, o usuário é
 * avisado e há nova tentativa agendada?
 *
 * Complementa tests/sync-engine.test.js (caminhos felizes e a corrida da
 * mutação enfileirada durante o POST em voo).
 */
const vm = require('vm');
const path = require('path');
const { carregarScript } = require('./helpers/carregar-script.cjs');
const { rodarNoContexto } = require('./helpers/esm-como-script.cjs');

const ARQ = path.join(__dirname, '..', 'js', 'core', 'sync-engine.js');
const SM = carregarScript('js/core/sync-merge.js');
const FC = carregarScript('js/core/finance-contract.js', { DADOS: null });
const ACTIONS = {
  SYNC_INICIAR: 'sync/iniciar', SYNC_CONCLUIR: 'sync/concluir', SYNC_FALHAR: 'sync/falhar',
  SYNC_PENDENTE: 'sync/pendente', SYNC_CONFLITO: 'sync/conflito',
};
const CONFIG = { STORAGE_OUTBOX: 'fp-outbox', STORAGE_SYNC_CURSOR: 'fp-sync-cursor', STORAGE_CONTAS: 'fp-contas' };
const T1 = '2026-07-09T10:00:00.000Z';
const T2 = '2026-07-09T11:00:00.000Z';

function armazenamento() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/**
 * Monta o engine com dublês. `o.contrato` usa o FINANCE_CONTRACT real;
 * `o.store: false` tira APP_STORE/ACTIONS (os guardas do módulo os pulam).
 */
function montar(o = {}) {
  const st = o.storage === null ? null : (o.storage || armazenamento());
  const despachos = [];
  const timers = [];
  const estado = { transacoes: [], contas: [], config: { recorrentes: [], orcamentos: {} }, orcRecarregado: 0 };
  let seq = 0;
  const DADOS = {
    getTransacoesRaw: () => estado.transacoes.slice(),
    getTransacoes: () => estado.transacoes.filter((t) => !t.deletedAt),
    _storageSetTransacoes: (l) => { estado.transacoes = l.slice(); },
    getContasRaw: () => estado.contas.slice(),
    _storageSetRaw: (k, v) => { estado.contas = JSON.parse(v); if (st) st.setItem(k, v); },
    getConfig: () => JSON.parse(JSON.stringify(estado.config)),
    salvarConfig: (c) => { estado.config = c; },
    _apiFetch: o.apiFetchPadrao,
  };
  const ctx = vm.createContext({
    Date, Math, Number, String, Array, Object, JSON, Promise, isNaN, parseFloat,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    CONFIG: o.semConfig ? undefined : CONFIG,
    SYNC_MERGE: SM,
    UTILS: o.semUtils ? undefined : { gerarUuid: () => 'op-' + (++seq) },
    DADOS: o.semDados ? undefined : DADOS,
    FINANCE_CONTRACT: o.contrato ? FC : undefined,
    ORCAMENTO: o.orcamento ? { _carregarOrcamentos: () => { estado.orcRecarregado++; } } : undefined,
    APP_STORE: o.store === false ? undefined : { dispatch: (tipo, p) => despachos.push({ tipo, p }) },
    ACTIONS: o.store === false ? undefined : ACTIONS,
    module: { exports: {} },
  });
  const engine = rodarNoContexto(ctx, ARQ).SYNC_ENGINE;
  engine._storage = st;
  engine._reset();
  const tipos = () => despachos.map((d) => d.tipo);
  const ultimo = (tipo) => [...despachos].reverse().find((d) => d.tipo === tipo);
  return { engine, st, despachos, tipos, ultimo, timers, estado };
}

/** Imita o timer pendente disparando: libera o slot e esquece os agendados. */
function dispararTimer(engine, timers) {
  engine._flushTimer = null;
  timers.length = 0;
}

const esperarPromessas = () => new Promise((r) => setTimeout(r, 0));

const tx = (id, extra = {}) => ({ id, tipo: 'despesa', valor: 10, descricao: 'x', categoria: 'outro', data: '2026-07-09', updatedAt: T1, ...extra });

// ─── Falhas do POST: a outbox nunca perde nada ──────────────────────────────

const FALHAS = [
  ['rede caiu no meio do envio', () => Promise.reject(new TypeError('Failed to fetch')), 'Failed to fetch'],
  ['sessão expirada (401 sem refresh)', () => Promise.reject(Object.assign(new Error('Sessao expirada'), { status: 401 })), 'Sessao expirada'],
  ['servidor fora (5xx)', () => Promise.reject(Object.assign(new Error('HTTP 503'), { status: 503 })), 'HTTP 503'],
  ['erro sem mensagem', () => Promise.reject({}), 'rede'],
  // _apiFetch lê localStorage antes de devolver a promise; em modo privado
  // do Safari isso lança de forma síncrona.
  ['fetch lança de forma síncrona', () => { throw new Error('SecurityError'); }, 'SecurityError'],
];

describe.each(FALHAS)('flush com %s', (_nome, fetchFalho, erroEsperado) => {
  test('mantém a outbox, conta a tentativa, avisa e agenda nova tentativa com backoff', async () => {
    const { engine, tipos, ultimo, timers } = montar();
    engine.enqueueTransaction('upsert', tx('a'));
    engine.enqueueTransaction('delete', tx('b', { deletedAt: T2 }));
    dispararTimer(engine, timers);

    const r = await engine.flush(fetchFalho);
    expect(r).toEqual({ ok: false, reason: erroEsperado });
    const fila = engine.loadOutbox();
    expect(fila.map((m) => [m.id, m.op, m.attempts])).toEqual([['a', 'upsert', 1], ['b', 'delete', 1]]);
    expect(tipos()).toContain('sync/iniciar');
    expect(ultimo('sync/falhar').p).toEqual({ erro: erroEsperado });
    expect(ultimo('sync/pendente').p).toEqual({ count: 2 });
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBeGreaterThanOrEqual(2000);
    // E não fica travado: o próximo flush roda (não devolve "busy").
    const r2 = await engine.flush(() => Promise.resolve({ data: { results: fila.map((m) => ({ opId: m.opId, action: 'applied' })) } }));
    expect(r2.ok).toBe(true);
    expect(engine.outboxCount()).toBe(0);
  });
});

test('falhas seguidas aumentam o backoff até o teto de 60 s', async () => {
  const { engine, timers } = montar();
  engine.enqueueTransaction('upsert', tx('a'));
  const esperas = [];
  for (let i = 0; i < 10; i++) {
    dispararTimer(engine, timers);
    await engine.flush(() => Promise.reject(new Error('rede')));
    esperas.push(timers[0].ms);
  }
  expect(esperas[1]).toBeGreaterThan(esperas[0]);
  expect(Math.max(...esperas)).toBeLessThanOrEqual(60000);
  expect(esperas[esperas.length - 1]).toBe(60000);
  expect(engine.loadOutbox()[0].attempts).toBe(10);
});

// ─── Respostas do servidor ──────────────────────────────────────────────────

test('resposta parcial: o que não teve resultado fica, com aviso e nova tentativa', async () => {
  const { engine, ultimo, timers } = montar();
  engine.enqueueTransaction('upsert', tx('a'));
  engine.enqueueTransaction('upsert', tx('b'));
  const [ma] = engine.loadOutbox();
  dispararTimer(engine, timers);
  const r = await engine.flush(() => Promise.resolve({ data: { results: [{ opId: ma.opId, action: 'applied' }] } }));
  expect(r).toMatchObject({ ok: true, flushed: 1, remaining: 1 });
  expect(engine.pendingIds()).toEqual(['b']);
  expect(ultimo('sync/falhar').p).toEqual({ erro: 'operacoes-pendentes' });
  expect(timers).toHaveLength(1);
});

test('resposta sem corpo (200 vazio) não apaga nada', async () => {
  const { engine } = montar();
  engine.enqueueTransaction('upsert', tx('a'));
  const r = await engine.flush(() => Promise.resolve(null));
  expect(r).toMatchObject({ ok: true, flushed: 0, remaining: 1 });
  expect(engine.pendingIds()).toEqual(['a']);
});

test('rejeitado pelo servidor volta à fila com a tentativa contada', async () => {
  const { engine } = montar();
  engine.enqueueTransaction('upsert', tx('a'));
  const [m] = engine.loadOutbox();
  await engine.flush(() => Promise.resolve({ data: { results: [{ opId: m.opId, action: 'reject', error: 'validation' }] } }));
  const [depois] = engine.loadOutbox();
  expect(depois.id).toBe('a');
  expect(depois.attempts).toBe(1);
});

test('rejeitado que foi editado durante o envio: a edição nova fica, a velha não volta', async () => {
  const { engine } = montar();
  engine.enqueueTransaction('upsert', tx('a', { valor: 10 }));
  const [velha] = engine.loadOutbox();
  await engine.flush(() => {
    engine.enqueueTransaction('upsert', tx('a', { valor: 99, updatedAt: T2 }));
    return Promise.resolve({ data: { results: [{ opId: velha.opId, action: 'reject' }] } });
  });
  const fila = engine.loadOutbox();
  expect(fila).toHaveLength(1);
  expect(fila[0].payload.amount).toBe(99);
  expect(fila[0].attempts).toBe(0);
});

test('resultado de opId desconhecido (não enviado agora) é ignorado', async () => {
  const { engine } = montar();
  engine.enqueueTransaction('upsert', tx('a'));
  await engine.flush(() => Promise.resolve({ data: { results: [{ opId: 'fantasma', action: 'reject' }] } }));
  expect(engine.pendingIds()).toEqual(['a']);
  expect(engine.loadOutbox()[0].attempts).toBe(0);
});

test('conflito (server-wins/stale, o 409 do sync) sai da fila e o usuário é avisado', async () => {
  const { engine, ultimo, tipos } = montar();
  engine.enqueueTransaction('upsert', tx('a'));
  engine.enqueueTransaction('upsert', tx('b'));
  const [ma, mb] = engine.loadOutbox();
  const r = await engine.flush(() => Promise.resolve({ data: { results: [
    { opId: ma.opId, action: 'server-wins' }, { opId: mb.opId, status: 'stale' },
  ] } }));
  expect(r.conflicts).toHaveLength(2);
  expect(engine.outboxCount()).toBe(0);
  expect(ultimo('sync/conflito').p.conflicts).toHaveLength(2);
  expect(tipos()).toContain('sync/concluir');
});

test('flush já em andamento devolve "busy" sem novo POST', async () => {
  const { engine } = montar();
  engine.enqueueTransaction('upsert', tx('a'));
  let soltar;
  const chamadas = [];
  const lento = () => { chamadas.push(1); return new Promise((ok) => { soltar = ok; }); };
  const p1 = engine.flush(lento);
  expect(await engine.flush(lento)).toEqual({ ok: false, reason: 'busy' });
  expect(chamadas).toHaveLength(1);
  soltar({ data: { results: [] } });
  await p1;
});

test('outbox vazia não chama a API; sem API configurada, a fila fica esperando', async () => {
  const { engine } = montar();
  const nada = jest.fn();
  expect(await engine.flush(nada)).toEqual({ ok: true, flushed: 0 });
  expect(nada).not.toHaveBeenCalled();
  engine.enqueueTransaction('upsert', tx('a'));
  expect(await engine.flush()).toEqual({ ok: false, reason: 'no-api' });
  expect(engine.outboxCount()).toBe(1);
});

test('sem APP_STORE (antes do boot) o flush funciona igual, só não avisa', async () => {
  const { engine } = montar({ store: false });
  engine.enqueueTransaction('upsert', tx('a'));
  expect((await engine.flush(() => Promise.reject(new Error('rede')))).ok).toBe(false);
  const [m] = engine.loadOutbox();
  expect(m.attempts).toBe(1);
  const r = await engine.flush(() => Promise.resolve({ data: { results: [{ opId: m.opId, action: 'applied' }] } }));
  expect(r).toMatchObject({ ok: true, remaining: 0 });
});

test('usa DADOS._apiFetch quando nenhum fetch é injetado', async () => {
  const apiFetch = jest.fn(() => Promise.resolve({ data: { results: [] } }));
  const { engine } = montar({ apiFetchPadrao: apiFetch });
  engine.enqueueTransaction('upsert', tx('a'));
  await engine.flush();
  expect(apiFetch).toHaveBeenCalledWith('/api/v1/sync', expect.objectContaining({ method: 'POST' }));
  const corpo = JSON.parse(apiFetch.mock.calls[0][1].body);
  expect(corpo.mutations[0]).toMatchObject({ entity: 'transaction', op: 'upsert', id: 'a', clientUpdatedAt: T1 });
  expect(corpo.mutations[0].attempts).toBeUndefined();
});

// ─── Agendamento ────────────────────────────────────────────────────────────

test('scheduleFlush não empilha timers; o timer dispara o flush', async () => {
  const apiFetch = jest.fn(() => Promise.resolve({ data: { results: [] } }));
  const { engine, timers } = montar({ apiFetchPadrao: apiFetch });
  engine.enqueueTransaction('upsert', tx('a'));
  engine.enqueueTransaction('upsert', tx('b'));
  engine.scheduleFlush(10);
  expect(timers).toHaveLength(1);
  expect(timers[0].ms).toBe(300);
  timers[0].fn();
  await esperarPromessas();
  expect(apiFetch).toHaveBeenCalledTimes(1);
});

test('erro inesperado dentro do flush agendado vira aviso de falha, não exceção solta', async () => {
  const { engine, timers, ultimo } = montar({ apiFetchPadrao: () => Promise.resolve({ data: { results: [] } }) });
  engine.enqueueTransaction('upsert', tx('a'));
  engine.saveOutbox = () => { throw new Error('QuotaExceededError'); };
  timers[0].fn();
  await esperarPromessas();
  expect(ultimo('sync/falhar').p.erro).toBe('QuotaExceededError');
});

// ─── Enfileirar ─────────────────────────────────────────────────────────────

test('registro sem id não entra na fila', () => {
  const { engine } = montar();
  engine.enqueueTransaction('upsert', { tipo: 'despesa', valor: 1 });
  engine.enqueueAccount('upsert', null);
  expect(engine.outboxCount()).toBe(0);
});

test('contas, recorrentes e orçamentos desativados sobem como active:false (com o contrato real)', () => {
  const { engine } = montar({ contrato: true });
  engine.enqueueAccount('upsert', { id: 'c1', nome: 'Nubank', tipo: 'corrente', saldoInicial: 0, ativo: false, updatedAt: T1 });
  engine.enqueueRecurring('upsert', { id: 'r1', descricao: 'Aluguel', valor: 1000, tipo: 'despesa', categoria: 'moradia', frequencia: 'mensal', ativo: false, updatedAt: T1 });
  engine.enqueueBudget('upsert', { id: 'b1', categoria: 'lazer', limite: 200, periodo: 'mensal', ativo: false, updatedAt: T1 });
  engine.enqueueBudget('delete', { id: 'b2', updatedAt: T1 });
  const fila = engine.loadOutbox();
  expect(fila.map((m) => m.entity)).toEqual(['account', 'recurring', 'budget', 'budget']);
  fila.slice(0, 3).forEach((m) => expect(m.payload.active).toBe(false));
  expect(fila[3].payload).toBeUndefined();
});

test('sem o contrato, conta/recorrente/orçamento sobem como estão e a transação usa DADOS._txPtToEn ou o fallback', () => {
  const { engine } = montar();
  engine.enqueueAccount('upsert', { id: 'c1', nome: 'X', updatedAt: T1 });
  engine.enqueueRecurring('upsert', { id: 'r1', descricao: 'Y', updatedAt: T1 });
  engine.enqueueBudget('upsert', { id: 'b1', categoria: 'lazer', updatedAt: T1 });
  expect(engine.loadOutbox().map((m) => m.payload.id)).toEqual(['c1', 'r1', 'b1']);
  const p = engine._txToPayload({ tipo: 'receita', valor: '12,5', data: '2026-07-09', banco: 'x'.repeat(36), tags: ['a'], notas: 'n', recorrente: 1 });
  expect(p).toEqual({ type: 'receita', amount: 12.5, description: 'Sem descrição', category: 'outro', subcategory: undefined,
    date: '2026-07-09T00:00:00.000Z', accountId: 'x'.repeat(36), tags: ['a'], notes: 'n', recurring: true });
  expect(engine._txToPayload({ valor: 'abc', data: '2026-07-09T12:00:00.000Z', banco: 'curto' })).toMatchObject({ amount: 0, date: '2026-07-09T12:00:00.000Z', accountId: undefined, tags: [] });
});

test('sem storage (ambiente sem localStorage) a fila fica vazia em vez de quebrar', () => {
  const { engine } = montar({ storage: null });
  expect(engine.loadOutbox()).toEqual([]);
  expect(engine.getCursor()).toBeNull();
  expect(() => engine.saveOutbox([{ id: 'a' }])).not.toThrow();
});

test('outbox corrompida no storage é tratada como vazia', () => {
  const st = armazenamento();
  st.setItem('fp-outbox', '{quebrado');
  const { engine } = montar({ storage: st });
  expect(engine.loadOutbox()).toEqual([]);
});

test('sem CONFIG nem UTILS, usa as chaves padrão e um opId próprio', () => {
  const { engine, st } = montar({ semConfig: true, semUtils: true });
  engine.enqueueTransaction('upsert', tx('a'));
  engine.setCursor(T1);
  engine.setCursor(null);
  expect(JSON.parse(st.getItem('fp-outbox'))[0].opId).toMatch(/^\d+-[a-z0-9]+$/);
  expect(engine.getCursor()).toBe(T1);
  expect(engine.pendingIds('transaction')).toEqual(['a']);
});

// ─── Pull ───────────────────────────────────────────────────────────────────

test('pull com erro de rede rejeita sem mexer no cursor nem no cache local', async () => {
  const { engine, estado } = montar();
  engine.setCursor(T1);
  estado.transacoes = [tx('a')];
  await expect(engine.pull(() => Promise.reject(new Error('rede')))).rejects.toThrow('rede');
  expect(engine.getCursor()).toBe(T1);
  expect(estado.transacoes).toHaveLength(1);
});

test('pull manda o cursor e aplica contas, recorrentes e orçamentos (com o contrato real)', async () => {
  const { engine, estado } = montar({ contrato: true, orcamento: true });
  engine.setCursor(T1);
  estado.contas = [{ id: 'c-velha', nome: 'Velha', updatedAt: T1 }];
  const pedidos = [];
  const r = await engine.pull((url) => {
    pedidos.push(url);
    return Promise.resolve({ data: {
      cursor: T2,
      transactions: [{ id: 't1', type: 'despesa', amount: 5, description: 'pão', category: 'alimentacao', date: T1, updatedAt: T2 }],
      accounts: [
        { id: 'c-velha', name: 'Velha', type: 'checking', active: false, updatedAt: T2 },
        { id: 'c2', name: 'Inter', type: 'checking', initialBalance: 0, updatedAt: T2 },
      ],
      recurringTransactions: [{ id: 'r1', description: 'Aluguel', amount: 900, type: 'despesa', category: 'moradia', frequency: 'mensal', updatedAt: T2 }],
      budgets: [{ id: 'b1', category: 'lazer', limit: 300, period: 'mensal', updatedAt: T2 }],
    } });
  });
  expect(pedidos[0]).toBe('/api/v1/sync?since=' + encodeURIComponent(T1));
  expect(r).toMatchObject({ ok: true, delta: 1 });
  expect(engine.getCursor()).toBe(T2);
  expect(estado.transacoes.map((t) => t.id)).toEqual(['t1']);
  expect(estado.contas.map((c) => c.id)).toEqual(['c2']);
  expect(estado.config.recorrentes.map((x) => x.id)).toEqual(['r1']);
  expect(Object.keys(estado.config.orcamentos)).toEqual(['lazer']);
  expect(estado.orcRecarregado).toBe(1);
});

test('pull sem API configurada não faz nada; resposta sem dados não quebra', async () => {
  const { engine, estado } = montar();
  expect(await engine.pull()).toEqual({ ok: false, reason: 'no-api' });
  expect(await engine.pullAll()).toEqual({ ok: false, reason: 'no-api' });
  estado.transacoes = [tx('a')];
  expect(await engine.pull(() => Promise.resolve(null))).toMatchObject({ ok: true, delta: 0 });
  expect(estado.transacoes.map((t) => t.id)).toEqual(['a']);
  expect(engine.getCursor()).toBeNull();
});

test('pull de orçamento: desativado some, legado sem id fica se o servidor não mandou a categoria', async () => {
  const { engine, estado } = montar({ contrato: true });
  estado.config.orcamentos = {
    lazer: { id: 'b1', limite: 100, definidoEm: T1 },
    mercado: { limite: 500, definidoEm: T1 },
  };
  await engine.pull(() => Promise.resolve({ data: { budgets: [{ id: 'b1', category: 'lazer', limit: 100, active: false, updatedAt: T2 }] } }));
  expect(Object.keys(estado.config.orcamentos)).toEqual(['mercado']);
});

test('pullAll: erro na segunda página para sem gravar o cursor final', async () => {
  const { engine, estado } = montar();
  let pagina = 0;
  const apiFetch = (url) => {
    pagina++;
    if (pagina === 1) {
      expect(url).toBe('/api/v1/sync?limit=500');
      return Promise.resolve({ data: { transactions: [{ id: 't1', type: 'despesa', amount: 1, description: 'a', category: 'outro', date: T1, updatedAt: T1 }], hasMore: true, nextCursor: 'p2', cursor: T2 } });
    }
    expect(url).toBe('/api/v1/sync?cursor=p2&limit=500');
    return Promise.reject(new Error('rede'));
  };
  await expect(engine.pullAll(apiFetch)).rejects.toThrow('rede');
  expect(engine.getCursor()).toBeNull();
  // O que chegou na primeira página já foi aplicado (merge é idempotente).
  expect(estado.transacoes.map((t) => t.id)).toEqual(['t1']);
});

test('syncCycle: se o pull falha, o flush não roda e a fila fica', async () => {
  const { engine } = montar();
  engine.enqueueTransaction('upsert', tx('a'));
  const apiFetch = jest.fn(() => Promise.reject(new Error('rede')));
  await expect(engine.syncCycle(apiFetch)).rejects.toThrow('rede');
  expect(apiFetch).toHaveBeenCalledTimes(1);
  expect(engine.outboxCount()).toBe(1);
});

test('syncCycle: pull e depois flush com o mesmo fetch', async () => {
  const { engine } = montar();
  engine.enqueueTransaction('upsert', tx('a'));
  const [m] = engine.loadOutbox();
  const urls = [];
  const r = await engine.syncCycle((url, op) => {
    urls.push((op && op.method) || 'GET');
    return Promise.resolve(op ? { data: { results: [{ opId: m.opId, action: 'applied' }] } } : { data: { cursor: T2 } });
  });
  expect(urls).toEqual(['GET', 'POST']);
  expect(r.remaining).toBe(0);
  expect(engine.getCursor()).toBe(T2);
});

test('bootstrap por snapshot: vazio não faz nada; com dados aplica e grava o cursor', () => {
  const { engine, estado } = montar();
  engine.bootstrapFromSnapshot(null);
  engine.bootstrapFromSnapshot({ transactions: [] });
  expect(estado.transacoes).toEqual([]);
  engine.bootstrapFromSnapshot({ transactions: [{ id: 't1', type: 'despesa', amount: 1, description: 'a', category: 'outro', date: T1, createdAt: T1 }] });
  expect(estado.transacoes.map((t) => t.id)).toEqual(['t1']);
  expect(engine.getCursor()).toBeNull();
  engine.bootstrapFromSnapshot({ transactions: [{ id: 't2', type: 'despesa', amount: 1, description: 'b', category: 'outro', date: T1, updatedAt: T2 }], meta: { syncedAt: T2 } });
  expect(engine.getCursor()).toBe(T2);
});

test('sem DADOS, aplicar delta é no-op (retorna 0)', () => {
  const { engine } = montar({ semDados: true });
  expect(engine._applyDeltaToLocal([{ id: 't1' }])).toBe(0);
  expect(engine._applyAccountsDelta([{ id: 'c1' }])).toBe(0);
  expect(engine._applyRecurringDelta([])).toBe(0);
  expect(engine._applyBudgetsDelta([])).toBe(0);
});
