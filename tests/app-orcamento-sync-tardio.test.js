/**
 * app-orcamento-sync-tardio.test.js — Metas e Patrimônio aparecem quando a
 * nuvem responde, mesmo com o Orçamento já aberto.
 * @jest-environment node
 *
 * Relato de 11/10: depois de reinstalar e entrar na conta, o Orçamento
 * mostrava Metas e Patrimônio vazios; ao criar uma meta ou um ativo, "voltava
 * todo o histórico". A sincronização gravava tudo no aparelho, mas só o Resumo
 * era redesenhado quando ela terminava: a sub-aba aberta antes da resposta da
 * nuvem continuava com o desenho vazio até a próxima gravação.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');
const { gestos, tique } = require('./helpers/ui-app.cjs');

const SESSAO = {
  access_token: 'tok', refresh_token: 'ref',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'u-ana', email: 'ana@exemplo.com', user_metadata: {} },
};

const CONFIG_NA_NUVEM = {
  metas: [{
    id: 'm-viagem', titulo: 'Viagem', valorAlvo: 1000, valorAtual: 100,
    criadoEm: '2026-01-01T00:00:00.000Z', concluida: false,
  }],
  patrimonio: {
    ativos: [{ id: 'a-casa', nome: 'Casa', tipo: 'imovel', valor: 300000 }],
    dividas: [{ id: 'd-carro', nome: 'Financiamento do carro', tipo: 'financiamento', valor: 20000 }],
  },
  assinaturas: [{
    id: 's-streaming', nome: 'Streaming', valor: 39.9, diaCobranca: 10, ativa: true,
    icone: 'tv', criadoEm: '2026-01-01T00:00:00.000Z',
  }],
  renda: 8000,
};

/**
 * Nuvem que só responde quando o teste manda (`responder()`): é a rede lenta
 * do celular logo depois de entrar na conta. UserConfig traz metas e
 * patrimônio; as tabelas de linhas vêm vazias.
 */
function nuvemLenta() {
  let responder;
  const liberada = new Promise((r) => { responder = r; });
  function from(tabela) {
    let leitura = true;
    const api = {};
    ['select', 'order', 'limit', 'range', 'eq', 'gte', 'lte', 'in', 'is', 'maybeSingle', 'single']
      .forEach((m) => { api[m] = () => api; });
    ['update', 'insert', 'upsert'].forEach((m) => { api[m] = () => { leitura = false; return api; }; });
    api.then = (res, rej) => {
      if (!leitura) return Promise.resolve({ data: null, error: null }).then(res, rej);
      const data = tabela === 'UserConfig' ? { data: CONFIG_NA_NUVEM } : [];
      return liberada.then(() => ({ data, error: null })).then(res, rej);
    };
    return api;
  }
  return { from, responder: () => responder() };
}

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

async function abrirSubAba(g, sub, painel) {
  g.clicar('[data-orc-sub="' + sub + '"]');
  await app.esperar(() => g.d.querySelector(painel + ' > *'));
}

test('Metas abertas antes da nuvem responder: a meta aparece sem precisar salvar nada', async () => {
  const nuvem = nuvemLenta();
  app = await subirApp({ nuvem: { sessao: SESSAO, from: nuvem.from } });
  const g = gestos(app);
  g.w.mudarAba('orcamento');
  await app.esperar(() => g.d.querySelector('[data-orc-sub="metas"]'));
  await abrirSubAba(g, 'metas', '#metas-list');
  expect(g.d.querySelector('#metas-list').textContent).toMatch(/Nenhuma meta ainda/);

  nuvem.responder();

  expect(await app.esperar(() => /Viagem/.test(g.d.querySelector('#metas-list').textContent), 3000)).toBe(true);
  expect(g.d.querySelector('#metas-list').textContent).not.toMatch(/Nenhuma meta ainda/);
  expect(app.erros).toEqual([]);
});

test('Patrimônio aberto antes da nuvem responder: ativos e dívidas aparecem', async () => {
  const nuvem = nuvemLenta();
  app = await subirApp({ nuvem: { sessao: SESSAO, from: nuvem.from } });
  const g = gestos(app);
  g.w.mudarAba('orcamento');
  await app.esperar(() => g.d.querySelector('[data-orc-sub="patrimonio"]'));
  await abrirSubAba(g, 'patrimonio', '#patrimonio-panel');
  expect(g.d.querySelector('#patrimonio-panel').textContent).not.toMatch(/Casa/);

  nuvem.responder();

  const painel = () => g.d.querySelector('#patrimonio-panel').textContent;
  expect(await app.esperar(() => /Casa/.test(painel()), 3000)).toBe(true);
  expect(painel()).toMatch(/Financiamento do carro/);
  expect(painel()).toMatch(/280\.000,00/);
  expect(app.erros).toEqual([]);
});

test('Gastos fixos abertos antes da nuvem responder: a assinatura aparece', async () => {
  const nuvem = nuvemLenta();
  app = await subirApp({ nuvem: { sessao: SESSAO, from: nuvem.from } });
  const g = gestos(app);
  g.w.mudarAba('orcamento');
  await app.esperar(() => g.d.querySelector('[data-orc-sub="assinaturas"]'));
  await abrirSubAba(g, 'assinaturas', '#assinaturas-list');
  expect(g.d.querySelector('#assinaturas-list').textContent).not.toMatch(/Streaming/);

  nuvem.responder();

  expect(await app.esperar(() => /Streaming/.test(g.d.querySelector('#assinaturas-list').textContent), 3000)).toBe(true);
  expect(app.erros).toEqual([]);
});

test('Planejamento aberto antes da nuvem responder: a renda que veio da nuvem monta o painel', async () => {
  const nuvem = nuvemLenta();
  // Aparelho recém-instalado: sem renda, o Planejamento pede para cadastrá-la.
  app = await subirApp({ nuvem: { sessao: SESSAO, from: nuvem.from }, config: { renda: 0 } });
  const g = gestos(app);
  g.w.mudarAba('orcamento');
  const painel = () => g.d.getElementById('orc-dashboard');
  const pedeRenda = () => g.d.getElementById('orc-renda-setup');
  await app.esperar(() => pedeRenda() && pedeRenda().style.display === 'block');
  expect(painel().style.display).toBe('none');

  nuvem.responder();

  expect(await app.esperar(() => painel().style.display === 'block', 3000)).toBe(true);
  expect(pedeRenda().style.display).toBe('none');
  expect(app.erros).toEqual([]);
});

test('com outra aba aberta, a sincronização não mexe no Orçamento escondido', async () => {
  const nuvem = nuvemLenta();
  app = await subirApp({ nuvem: { sessao: SESSAO, from: nuvem.from } });
  const g = gestos(app);
  g.w.mudarAba('orcamento');
  await app.esperar(() => g.d.querySelector('[data-orc-sub="metas"]'));
  await abrirSubAba(g, 'metas', '#metas-list');
  g.w.mudarAba('resumo');
  const antes = g.d.querySelector('#metas-list').innerHTML;

  nuvem.responder();
  await app.esperar(() => (g.w.DADOS.getConfig().metas || []).length === 1, 3000);
  await tique(50);

  expect(g.d.querySelector('#metas-list').innerHTML).toBe(antes);
  // Ao voltar, a tela é desenhada com o que chegou.
  g.w.mudarAba('orcamento', { orcSub: 'metas' });
  expect(await app.esperar(() => /Viagem/.test(g.d.querySelector('#metas-list').textContent), 3000)).toBe(true);
  expect(app.erros).toEqual([]);
});
