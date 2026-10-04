/**
 * app-relatorios.test.js — painel de Relatórios do Resumo, com o app inteiro.
 * @jest-environment node
 *
 * Achado M2 da reauditoria de 30/09: a tela chega no chunk 'relatorios' e
 * estava em 16% — os cálculos (RELATORIOS) têm suíte própria, mas a tela que
 * os monta não. O relógio da janela é fixado (opts.agora): os blocos da tela
 * dependem de "hoje" (a retrospectiva do ano só aparece a partir de julho).
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');
const { gestos, tique } = require('./helpers/ui-app.cjs');

const AGORA = '2026-09-20T12:00:00.000-03:00';

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

/** Nove meses (jan→set/2026) de salário, aluguel e mercado; setembro com excesso. */
function historico() {
  const txs = [];
  let n = 0;
  const add = (t) => txs.push({ id: 'h' + (++n), ...t });
  for (let m = 1; m <= 9; m++) {
    const mm = String(m).padStart(2, '0');
    add({ tipo: 'receita', valor: 5000, data: `2026-${mm}-05`, categoria: 'salario', descricao: 'Salário' });
    add({ tipo: 'despesa', valor: 1800, data: `2026-${mm}-10`, categoria: 'moradia', descricao: 'Aluguel', banco: 'Nubank' });
    add({ tipo: 'despesa', valor: 400 + m * 10, data: `2026-${mm}-12`, categoria: 'alimentacao', descricao: 'Mercado', banco: 'Inter', tags: ['casa'] });
  }
  // Setembro: lazer muito acima da média e várias compras no mesmo lugar.
  add({ tipo: 'despesa', valor: 900, data: '2026-09-14', categoria: 'lazer', descricao: 'Show', banco: 'Inter', tags: ['viagem'] });
  add({ tipo: 'despesa', valor: 120, data: '2026-09-15', categoria: 'alimentacao', descricao: 'Mercado', banco: 'Inter' });
  add({ tipo: 'despesa', valor: 80, data: '2026-08-14', categoria: 'lazer', descricao: 'Cinema', banco: 'Inter' });
  return txs;
}

async function abrirRelatorios(opts) {
  app = await subirApp({ agora: AGORA, ...(opts || {}) });
  const g = gestos(app);
  expect(g.w.INIT_RELATORIOS).toBeUndefined();
  g.clicar('#btn-relatorios');
  await app.esperar(() => g.w.INIT_RELATORIOS && g.d.getElementById('relatorios-panel').innerHTML !== '');
  return g;
}

const painel = (g) => g.d.getElementById('relatorios-panel');
const subtitulos = (g) => [...painel(g).querySelectorAll('.rel-subtitle')].map((h) => h.textContent);

test('sem lançamentos: avisa que não há dados em vez de mostrar zeros', async () => {
  const g = await abrirRelatorios();
  expect(painel(g).textContent).toMatch(/Sem dados suficientes/);
  expect(g.d.getElementById('btn-relatorios').getAttribute('aria-expanded')).toBe('true');
  expect(painel(g).querySelector('[data-action="compartilhar-mes"]')).toBeNull();
  expect(app.erros).toEqual([]);
});

test('mês atual vazio com o anterior lançado: mostra a comparação (a queda é informação)', async () => {
  const g = await abrirRelatorios({ transacoes: historico().filter((t) => t.data < '2026-09-01' && t.data >= '2026-08-01') });
  expect(painel(g).querySelector('.rel-tx-count').textContent).toBe('0 lançamentos');
  expect(painel(g).querySelector('.rel-kpi--desp').textContent).toMatch(/-R\$\s?2\.360,00 vs mês ant\./);
});

test('com histórico: mês, KPIs com a variação e os blocos de análise', async () => {
  const g = await abrirRelatorios({ transacoes: historico() });
  const p = painel(g);
  expect(p.querySelector('.rel-header h3').textContent).toMatch(/Setembro de 2026/);
  expect(p.querySelector('.rel-tx-count').textContent).toBe('5 lançamentos');

  const kpi = (cls) => p.querySelector('.rel-kpi--' + cls).textContent;
  expect(kpi('rec')).toMatch(/5\.000,00/);
  expect(kpi('desp')).toMatch(/3\.310,00/); // 1800 + 490 + 900 + 120
  expect(kpi('desp')).toMatch(/\+R\$\s?950,00 vs mês ant\./); // agosto: 1800 + 480 + 80 = 2360
  expect(kpi('saldo')).toMatch(/1\.690,00/);

  expect(subtitulos(g)).toEqual(expect.arrayContaining([
    'Top despesas por categoria', 'Maiores despesas', 'Gastos por conta/cartão', 'Acima da média',
    'Gastos por dia da semana', 'Gastos por marcador', 'Últimos 6 meses', 'Retrospectiva de 2026',
  ]));
  expect(p.querySelector('.rel-cat-list').textContent).toMatch(/Moradia/i);
  expect(app.erros).toEqual([]);
});

test('fechar e reabrir o painel não recarrega o chunk', async () => {
  const g = await abrirRelatorios({ transacoes: historico() });
  const modulo = g.w.INIT_RELATORIOS;
  g.clicar('#btn-relatorios');
  expect(painel(g).style.display).toBe('none');
  expect(g.d.getElementById('btn-relatorios').getAttribute('aria-expanded')).toBe('false');
  g.clicar('#btn-relatorios');
  await tique(30);
  expect(g.w.INIT_RELATORIOS).toBe(modulo);
  expect(painel(g).style.display).toBe('block');
  expect(painel(g).querySelector('.rel-header')).not.toBeNull();
});

test('compartilhar o mês e a retrospectiva do ano mandam o texto pelo Web Share', async () => {
  const g = await abrirRelatorios({ transacoes: historico() });
  const enviados = [];
  Object.defineProperty(g.w.navigator, 'share', { value: (d) => { enviados.push(d.text); return Promise.resolve(); }, configurable: true });
  g.clicar('[data-action="compartilhar-mes"]');
  g.clicar('[data-action="compartilhar-ano"]');
  await tique();
  expect(enviados).toHaveLength(2);
  expect(enviados[0]).toMatch(/setembro/i);
  expect(enviados[1]).toMatch(/2026/);
});

test('com poucos meses de histórico, os blocos de período longo não aparecem', async () => {
  const txs = historico().filter((t) => t.data >= '2026-08-01');
  const g = await abrirRelatorios({ transacoes: txs });
  expect(subtitulos(g)).not.toContain('Últimos 6 meses');
  expect(subtitulos(g)).not.toContain('Retrospectiva de 2026');
  expect(g.d.querySelector('[data-action="compartilhar-ano"]')).toBeNull();
});
