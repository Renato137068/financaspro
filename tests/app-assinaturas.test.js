/**
 * app-assinaturas.test.js — Orçamento › Gastos fixos, com o app inteiro.
 * @jest-environment node
 *
 * Achado M2 da reauditoria de 30/09: a tela chega no chunk 'assinaturas' e
 * nenhuma suíte a carregava (0% de cobertura). Aqui ela é aberta pelo
 * caminho do usuário — sub-aba do Orçamento → LAZY.load → INIT_ASSINATURAS —
 * e cada ação da tela é exercida pelos botões, com os modais de verdade.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');
const { gestos, tique } = require('./helpers/ui-app.cjs');
// Os lançamentos de exemplo são de setembro de 2026 e o dashboard mostra o mês
// corrente: sem relógio fixo, a suíte quebrava na virada do mês (1º/10).
const AGORA = '2026-09-20T12:00:00.000-03:00';

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

async function abrirGastosFixos(opts) {
  app = await subirApp({ agora: AGORA, ...(opts || {}) });
  const g = gestos(app);
  g.w.mudarAba('orcamento');
  await app.esperar(() => g.d.querySelector('[data-orc-sub="assinaturas"]'));
  g.clicar('[data-orc-sub="assinaturas"]');
  await app.esperar(() => g.w.INIT_ASSINATURAS && g.d.querySelector('#assinaturas-list .sub-kpis'));
  return g;
}

const lista = (g) => [...g.d.querySelectorAll('#assinaturas-list .sub-card-title')].map((e) => e.textContent);
const assinaturasSalvas = (g) => JSON.parse(g.w.localStorage.getItem('fp-config')).assinaturas || [];

async function novaAssinatura(g, { nome, valor, dia }) {
  g.clicar('[data-action="assinatura-nova"]');
  await app.esperar(() => g.d.getElementById('sub-nome'));
  g.preencher('sub-nome', nome);
  g.preencher('sub-valor', valor);
  if (dia) g.preencher('sub-dia', String(dia));
  g.okModal();
  await tique();
}

test('sem assinaturas: estado vazio com o botão de adicionar, e o chunk só chega ao abrir a sub-aba', async () => {
  app = await subirApp({ agora: AGORA });
  expect(app.window.INIT_ASSINATURAS).toBeUndefined();
  app.fechar();
  const g = await abrirGastosFixos();
  expect(g.d.querySelector('.sub-empty').textContent).toMatch(/Nenhuma assinatura cadastrada/);
  expect(g.d.querySelector('#assinaturas-section .orc-secao-header [data-action="assinatura-nova"]').hidden).toBe(true);
  expect(app.erros).toEqual([]);
});

test('criar: o modal salva, a lista e os totais atualizam e o dado vai para o fp-config', async () => {
  const g = await abrirGastosFixos();
  await novaAssinatura(g, { nome: 'Netflix', valor: '55,90', dia: 5 });
  await novaAssinatura(g, { nome: 'Spotify', valor: '21,90', dia: 12 });

  expect(g.modal()).toBeNull();
  expect(lista(g)).toEqual(expect.arrayContaining(['Netflix', 'Spotify']));
  const kpis = g.d.querySelectorAll('#assinaturas-list .sub-kpi-val');
  expect(kpis[0].textContent).toMatch(/77,80/);
  expect(kpis[1].textContent).toMatch(/933,60/);
  expect(kpis[2].textContent).toBe('2');
  const salvas = assinaturasSalvas(g);
  expect(salvas.map((a) => [a.nome, a.valor, a.diaCobranca])).toEqual(expect.arrayContaining([['Netflix', 55.9, 5], ['Spotify', 21.9, 12]]));
  expect(app.erros).toEqual([]);
});

test('criar com dado inválido: avisa, o modal continua aberto e nada é salvo', async () => {
  const g = await abrirGastosFixos();
  await novaAssinatura(g, { nome: '', valor: '10,00' });
  expect(g.modal()).not.toBeNull();
  expect(g.toast()).not.toBe('');
  expect(assinaturasSalvas(g)).toEqual([]);
});

test('editar, pausar, reativar e excluir pelos botões do card', async () => {
  const g = await abrirGastosFixos();
  await novaAssinatura(g, { nome: 'Disney+', valor: '33,90', dia: 20 });
  const id = assinaturasSalvas(g)[0].id;

  g.clicar(`[data-action="assinatura-editar"][data-assinatura-id="${id}"]`);
  await app.esperar(() => g.d.getElementById('sub-nome'));
  expect(g.d.getElementById('sub-nome').value).toBe('Disney+');
  g.preencher('sub-valor', '43,90');
  g.okModal();
  await tique();
  expect(assinaturasSalvas(g)[0].valor).toBe(43.9);

  g.clicar(`[data-action="assinatura-toggle"][data-assinatura-id="${id}"]`);
  expect(assinaturasSalvas(g)[0].ativa).toBe(false);
  expect(g.d.querySelector('.sub-card--inactive')).not.toBeNull();
  expect(g.d.querySelector(`[data-action="assinatura-toggle"][data-assinatura-id="${id}"]`).textContent).toBe('Reativar');
  g.clicar(`[data-action="assinatura-toggle"][data-assinatura-id="${id}"]`);
  expect(assinaturasSalvas(g)[0].ativa).not.toBe(false);

  g.clicar(`[data-action="assinatura-excluir"][data-assinatura-id="${id}"]`);
  await app.esperar(() => g.modal());
  expect(g.modal().textContent).toMatch(/Excluir assinatura "Disney\+"/);
  g.confirmar();
  await tique();
  expect(assinaturasSalvas(g)).toEqual([]);
  expect(g.d.querySelector('.sub-empty')).not.toBeNull();
  expect(app.erros).toEqual([]);
});

test('cancelar a exclusão mantém a assinatura', async () => {
  const g = await abrirGastosFixos();
  await novaAssinatura(g, { nome: 'iCloud', valor: '4,90' });
  const id = assinaturasSalvas(g)[0].id;
  g.clicar(`[data-action="assinatura-excluir"][data-assinatura-id="${id}"]`);
  await app.esperar(() => g.modal());
  g.cancelar();
  await tique();
  expect(assinaturasSalvas(g)).toHaveLength(1);
});

test('cobrança repetida no extrato vira sugestão, e a sugestão abre o formulário preenchido', async () => {
  const TXS = [
    { id: 't1', tipo: 'despesa', valor: 55.9, data: '2026-08-05', categoria: 'assinaturas', descricao: 'Netflix' },
    { id: 't2', tipo: 'despesa', valor: 55.9, data: '2026-09-05', categoria: 'assinaturas', descricao: 'Netflix' },
    { id: 't3', tipo: 'despesa', valor: 120, data: '2026-09-06', categoria: 'lazer', descricao: 'Cinema' },
  ];
  const g = await abrirGastosFixos({ transacoes: TXS });
  const chips = [...g.d.querySelectorAll('[data-action="assinatura-importar"]')];
  expect(chips.map((c) => c.dataset.nome)).toEqual(['Netflix']);
  g.clicar(chips[0]);
  await app.esperar(() => g.d.getElementById('sub-nome'));
  expect(g.d.getElementById('sub-nome').value).toBe('Netflix');
  expect(g.d.getElementById('sub-valor').value).toBe('55,9');
  g.okModal();
  await tique();
  // Já cadastrada: deixa de ser sugerida.
  expect(g.d.querySelectorAll('[data-action="assinatura-importar"]')).toHaveLength(0);
});

test('resumo do painel: total mensal e as próximas cobranças, escondido sem assinaturas', async () => {
  const g = await abrirGastosFixos();
  const resumo = g.d.getElementById('dashboard-assinaturas-resumo');
  const secao = g.d.getElementById('secao-assinaturas-resumo');
  g.w.INIT_ASSINATURAS.renderResumo();
  expect(resumo.innerHTML).toBe('');
  expect(secao.style.display).toBe('none');
  await novaAssinatura(g, { nome: 'Netflix', valor: '55,90', dia: 5 });
  await novaAssinatura(g, { nome: 'Adobe', valor: '100,00', dia: 6 });
  expect(secao.style.display).toBe('');
  expect(resumo.textContent).toMatch(/Total em assinaturas/);
  expect(resumo.textContent).toMatch(/155,90/);
  expect(resumo.querySelectorAll('.sub-resumo-line')).toHaveLength(2);
});
