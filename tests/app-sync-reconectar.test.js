/**
 * app-sync-reconectar.test.js — o que foi feito sem rede chega à nuvem quando
 * a conexão volta, com o app aberto, uma vez só.
 * @jest-environment node
 *
 * O ouvinte de `online` (js/core/dados.js, _sincronizarAoVoltarRede) não tinha
 * teste; só a volta do segundo plano tinha (integridade-sync.test.js), e lá com
 * o DADOS isolado. Aqui o app inteiro sobe na nuvem (sessão aberta, supabase-js
 * trocado por um dublê) e a tabela Transaction é um servidor em memória que
 * pode cair: criar, editar e excluir com ele fora do ar; o evento `online`
 * dispara o pull, que tem de mandar cada mudança exatamente uma vez e não
 * ressuscitar a exclusão.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');

const SESSAO = {
  access_token: 'tok', refresh_token: 'ref',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'u-ana', email: 'ana@exemplo.com', user_metadata: {} },
};
const ANTES = '2026-07-01T10:00:00.000Z';

function linha(id, extra) {
  return Object.assign({
    id, userId: 'u-ana', type: 'despesa', amount: 100, description: id, category: 'alimentacao',
    date: '2026-09-05T00:00:00.000Z', updatedAt: ANTES, deletedAt: null,
  }, extra || {});
}

/**
 * Tabela Transaction em memória, no formato do PostgREST visto pelo
 * supabase-js: consultas encadeadas que resolvem { data, error }. Fora do ar,
 * tudo resolve com o erro de rede (é o que o supabase-js faz com o fetch).
 */
function servidorFalso(linhasIniciais) {
  const linhas = new Map(linhasIniciais.map((l) => [l.id, Object.assign({}, l)]));
  const escritas = [];
  const estado = { noAr: true };

  function consulta() {
    const q = { op: 'select', payload: null, filtros: {} };
    const api = {};
    ['select', 'order', 'limit', 'range', 'gte', 'lte', 'in', 'is'].forEach((m) => { api[m] = () => api; });
    api.eq = (col, v) => { q.filtros[col] = v; return api; };
    api.upsert = (p) => { q.op = 'upsert'; q.payload = p; return api; };
    api.update = (p) => { q.op = 'update'; q.payload = p; return api; };
    api.insert = (p) => { q.op = 'insert'; q.payload = p; return api; };
    api.maybeSingle = () => api;
    api.single = () => api;
    api.then = (res, rej) => executar(q).then(res, rej);
    return api;
  }

  function executar(q) {
    if (!estado.noAr) {
      return Promise.resolve({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    }
    if (q.op === 'select') {
      return Promise.resolve({ data: Array.from(linhas.values()).map((l) => Object.assign({}, l)), error: null });
    }
    if (q.op === 'upsert' || q.op === 'insert') {
      (Array.isArray(q.payload) ? q.payload : [q.payload]).forEach((row) => {
        escritas.push({ op: q.op, id: row.id, row: Object.assign({}, row) });
        linhas.set(row.id, Object.assign({}, linhas.get(row.id) || {}, row));
      });
      return Promise.resolve({ data: [], error: null });
    }
    if (q.op === 'update') {
      const id = q.filtros.id;
      escritas.push({ op: 'update', id, row: Object.assign({}, q.payload) });
      if (linhas.has(id)) Object.assign(linhas.get(id), q.payload);
      return Promise.resolve({ data: [], error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }

  return {
    linhas, escritas, estado,
    from: (tabela) => (tabela === 'Transaction' ? consulta() : null),
  };
}

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

const tique = (ms) => new Promise((r) => setTimeout(r, ms || 0));

async function subirConectado(srv) {
  app = await subirApp({ nuvem: { sessao: SESSAO, from: srv.from } });
  const D = app.window.DADOS;
  // O pull da abertura traz o que está na nuvem.
  expect(await app.esperar(() => D.getTransacoes().length === 2, 4000)).toBe(true);
  return D;
}

const escritasDe = (srv, id) => srv.escritas.filter((e) => e.id === id);

describe('a conexão volta com o app aberto', () => {
  test('criar, editar e excluir sem rede: o `online` manda cada um uma vez e a exclusão não volta', async () => {
    const srv = servidorFalso([linha('aluguel', { amount: 1000 }), linha('mercado', { amount: 100 })]);
    const D = await subirConectado(srv);
    const T = app.global('TRANSACOES');
    srv.escritas.length = 0;

    // ── Sem rede.
    srv.estado.noAr = false;
    const nova = T.criar('despesa', 42.5, 'alimentacao', '2026-09-18', 'Padaria offline');
    T.atualizar('mercado', { valor: 120 });
    T.deletar('aluguel');
    await tique(50);

    // Na tela já vale: nova entrou, mercado mudou, aluguel saiu.
    expect(D.getTransacoes().map((t) => t.id).sort()).toEqual(['mercado', nova.id].sort());
    // E nada chegou ao servidor.
    expect(srv.linhas.has(nova.id)).toBe(false);
    expect(srv.linhas.get('mercado').amount).toBe(100);
    expect(srv.linhas.get('aluguel').deletedAt).toBeNull();

    // ── A rede volta.
    srv.estado.noAr = true;
    app.window.dispatchEvent(new app.window.Event('online'));

    expect(await app.esperar(() =>
      srv.linhas.has(nova.id)
      && srv.linhas.get('mercado').amount === 120
      && !!srv.linhas.get('aluguel').deletedAt, 4000)).toBe(true);
    await tique(100);

    // Cada mudança foi uma vez só.
    expect(escritasDe(srv, nova.id)).toHaveLength(1);
    expect(srv.linhas.get(nova.id)).toMatchObject({ description: 'Padaria offline', amount: 42.5 });
    expect(escritasDe(srv, 'mercado')).toHaveLength(1);
    expect(escritasDe(srv, 'aluguel')).toEqual([expect.objectContaining({ op: 'update' })]);

    // ── Outra volta de rede: nada a reenviar, e o aluguel não ressuscita.
    srv.escritas.length = 0;
    app.window.dispatchEvent(new app.window.Event('online'));
    await tique(300);
    expect(srv.escritas).toEqual([]);
    expect(D.getTransacoes().map((t) => t.id).sort()).toEqual(['mercado', nova.id].sort());
    // A marca de exclusão sai quando a nuvem confirma.
    expect(D.getTransacoesRaw().some((t) => t.id === 'aluguel')).toBe(false);
    expect(D.getTransacoes()).toHaveLength(2);
    expect(app.erros).toEqual([]);
  });

  test('`online` com a nuvem ainda fora: nada se perde e a próxima volta envia', async () => {
    const srv = servidorFalso([linha('aluguel', { amount: 1000 }), linha('mercado', { amount: 100 })]);
    const D = await subirConectado(srv);
    const T = app.global('TRANSACOES');
    srv.escritas.length = 0;

    srv.estado.noAr = false;
    T.atualizar('mercado', { valor: 130 });
    // O sistema diz que voltou, mas o servidor ainda não responde.
    app.window.dispatchEvent(new app.window.Event('online'));
    await tique(200);
    expect(srv.linhas.get('mercado').amount).toBe(100);
    expect(D.getTransacoes().find((t) => t.id === 'mercado').valor).toBe(130);

    srv.estado.noAr = true;
    app.window.dispatchEvent(new app.window.Event('online'));
    expect(await app.esperar(() => srv.linhas.get('mercado').amount === 130, 4000)).toBe(true);
    await tique(100);
    expect(escritasDe(srv, 'mercado')).toHaveLength(1);
  });
});
