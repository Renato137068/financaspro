/**
 * app-metas.test.js — Orçamento › Metas, com o app inteiro.
 * @jest-environment node
 *
 * Achado M2 da reauditoria de 30/09: a tela chega no chunk 'metas' e só as
 * regras (METAS, PLANO_METAS) tinham teste; a interface estava em 32%. Aqui
 * ela é aberta pela sub-aba do Orçamento e cada ação passa pelos modais.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');
const { gestos, tique } = require('./helpers/ui-app.cjs');

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

async function abrirMetas(opts) {
  app = await subirApp(opts || {});
  const g = gestos(app);
  g.w.mudarAba('orcamento');
  await app.esperar(() => g.d.querySelector('[data-orc-sub="metas"]'));
  g.clicar('[data-orc-sub="metas"]');
  await app.esperar(() => g.w.INIT_METAS && g.d.querySelector('#metas-list > *'));
  return g;
}

const metasSalvas = (g) => JSON.parse(g.w.localStorage.getItem('fp-config')).metas || [];

async function novaMeta(g, { titulo, alvo, atual, prazo, icone }) {
  g.clicar('#metas-list [data-action="meta-nova"], #metas-section [data-action="meta-nova"]:not([hidden])');
  await app.esperar(() => g.d.getElementById('meta-titulo'));
  g.preencher('meta-titulo', titulo);
  g.preencher('meta-valor', alvo);
  if (atual) g.preencher('meta-atual', atual);
  if (prazo) g.preencher('meta-prazo', prazo);
  if (icone) g.preencher('meta-icone', icone);
  g.okModal();
  await tique();
}

test('sem metas: estado vazio com uma CTA só (o cabeçalho some)', async () => {
  const g = await abrirMetas();
  expect(g.d.querySelector('.meta-empty-title').textContent).toBe('Nenhuma meta ainda');
  expect(g.d.querySelector('#metas-section .metas-header-actions').hidden).toBe(true);
  expect(app.erros).toEqual([]);
});

test('criar: o card aparece com o progresso e a meta vai para o fp-config', async () => {
  const g = await abrirMetas();
  await novaMeta(g, { titulo: 'Viagem', alvo: '10.000,00', atual: '2.500,00', prazo: '2027-12-31', icone: 'plane' });
  expect(g.modal()).toBeNull();
  const [m] = metasSalvas(g);
  expect(m).toMatchObject({ titulo: 'Viagem', valorAlvo: 10000, valorAtual: 2500, prazo: '2027-12-31', icone: 'plane' });
  const card = g.d.querySelector('#metas-list');
  expect(card.textContent).toMatch(/Viagem/);
  expect(card.textContent).toMatch(/25\s?%/);
  expect(g.d.querySelector('#metas-section .metas-header-actions').hidden).toBe(false);
  expect(app.erros).toEqual([]);
});

test('criar sem título ou sem valor: avisa e não salva', async () => {
  const g = await abrirMetas();
  await novaMeta(g, { titulo: '', alvo: '100,00' });
  expect(g.modal()).not.toBeNull();
  expect(metasSalvas(g)).toEqual([]);
});

test('aporte soma ao valor atual; aporte inválido avisa e não soma', async () => {
  const g = await abrirMetas();
  await novaMeta(g, { titulo: 'Reserva', alvo: '1.000,00' });
  const id = metasSalvas(g)[0].id;

  g.clicar(`[data-action="meta-aporte"][data-meta-id="${id}"]`);
  await app.esperar(() => g.d.getElementById('meta-aporte-valor'));
  expect(g.modal().textContent).toMatch(/Faltam R\$\s?1\.000,00/);
  g.preencher('meta-aporte-valor', '0');
  g.okModal();
  await tique();
  expect(g.modal()).not.toBeNull();
  expect(metasSalvas(g)[0].valorAtual).toBe(0);

  g.preencher('meta-aporte-valor', '250,00');
  g.okModal();
  await tique();
  expect(g.modal()).toBeNull();
  expect(metasSalvas(g)[0].valorAtual).toBe(250);
  expect(g.d.querySelector('#metas-list').textContent).toMatch(/25\s?%/);
});

test('editar abre o formulário preenchido e salva a mudança', async () => {
  const g = await abrirMetas();
  await novaMeta(g, { titulo: 'Carro', alvo: '40.000,00' });
  const id = metasSalvas(g)[0].id;
  g.clicar(`[data-action="meta-editar"][data-meta-id="${id}"]`);
  await app.esperar(() => g.d.getElementById('meta-titulo'));
  expect(g.d.getElementById('meta-titulo').value).toBe('Carro');
  g.preencher('meta-titulo', 'Carro novo');
  g.preencher('meta-valor', '45.000,00');
  g.okModal();
  await tique();
  expect(metasSalvas(g)[0]).toMatchObject({ titulo: 'Carro novo', valorAlvo: 45000 });
});

test('excluir some da tela na hora, e "Desfazer" traz de volta sem apagar', async () => {
  const g = await abrirMetas();
  await novaMeta(g, { titulo: 'Casa', alvo: '100.000,00' });
  const id = metasSalvas(g)[0].id;
  g.clicar(`[data-action="meta-excluir"][data-meta-id="${id}"]`);
  await app.esperar(() => g.modal());
  expect(g.modal().textContent).toMatch(/Excluir a meta "Casa"/);
  g.confirmar();
  await tique();
  expect(g.d.querySelector('.meta-empty')).not.toBeNull();
  expect(metasSalvas(g)).toHaveLength(1);
  g.clicar('.toast-acao-btn');
  await tique();
  expect(g.d.querySelector('#metas-list').textContent).toMatch(/Casa/);
  expect(metasSalvas(g)).toHaveLength(1);
});

test('excluir sem desfazer: quando o prazo do "Desfazer" acaba, a meta sai do fp-config', async () => {
  const g = await abrirMetas();
  await novaMeta(g, { titulo: 'Moto', alvo: '12.000,00' });
  const id = metasSalvas(g)[0].id;
  // O prazo real é de 5 s; aqui a exclusão agendada roda na hora.
  g.w.UTILS.agendarExclusao = (_chave, efetivar) => efetivar();
  g.clicar(`[data-action="meta-excluir"][data-meta-id="${id}"]`);
  await app.esperar(() => g.modal());
  g.confirmar();
  await tique();
  expect(metasSalvas(g)).toEqual([]);
  expect(g.d.querySelector('.meta-empty')).not.toBeNull();
});

test('compartilhar: usa o Web Share com o texto do plano; sem ele, copia', async () => {
  const g = await abrirMetas();
  await novaMeta(g, { titulo: 'Intercâmbio', alvo: '30.000,00', prazo: '2028-01-31' });
  const enviados = [];
  Object.defineProperty(g.w.navigator, 'share', { value: (d) => { enviados.push(d); return Promise.resolve(); }, configurable: true });
  g.clicar('[data-action="meta-compartilhar"]');
  await tique();
  expect(enviados).toHaveLength(1);
  expect(enviados[0].text).toMatch(/Intercâmbio/);

  delete g.w.navigator.share;
  const copiados = [];
  Object.defineProperty(g.w.navigator, 'clipboard', { value: { writeText: (t) => { copiados.push(t); return Promise.resolve(); } }, configurable: true });
  g.clicar('[data-action="meta-compartilhar"]');
  await tique();
  expect(copiados[0]).toMatch(/Intercâmbio/);
  expect(g.toast()).toMatch(/Plano copiado/);
});

test('plano grátis: a segunda meta é barrada com aviso e o modal continua aberto', async () => {
  const g = await abrirMetas();
  await novaMeta(g, { titulo: 'Primeira', alvo: '1.000,00' });
  await novaMeta(g, { titulo: 'Segunda', alvo: '1.000,00' });
  expect(g.toast()).toMatch(/Limite de metas do plano gratuito/);
  expect(g.modal()).not.toBeNull();
  expect(metasSalvas(g).map((m) => m.titulo)).toEqual(['Primeira']);
});

test('resumo do painel mostra só as três metas mais urgentes', async () => {
  const meta = (id, titulo) => ({ id, titulo, valorAlvo: 1000, valorAtual: 100, ativa: true, criadaEm: '2026-09-01T00:00:00.000Z' });
  const g = await abrirMetas({ config: { metas: ['A', 'B', 'C', 'D'].map((t) => meta('m' + t, 'Meta ' + t)) } });
  const sec = g.d.getElementById('secao-metas-resumo');
  const resumo = g.d.getElementById('dashboard-metas-resumo');
  g.w.INIT_METAS.renderResumo();
  expect(sec.style.display).toBe('');
  expect(resumo.querySelectorAll('.meta-card--compact')).toHaveLength(3);
  expect(g.d.querySelectorAll('#metas-list .meta-card')).toHaveLength(4);
});
