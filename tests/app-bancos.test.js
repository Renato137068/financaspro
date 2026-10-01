/**
 * app-bancos.test.js — Perfil › Bancos e cartões e Gerenciar categorias.
 * @jest-environment node
 *
 * Achado M2 da reauditoria de 30/09: estas telas chegam no chunk 'config' e
 * config-bancos.js estava em 27%. Cartão cadastrado aqui decide a fatura
 * (fechamento/vencimento) e categoria removida some do formulário de
 * lançamento: os dois fluxos são exercidos pelo Perfil, como o usuário faz.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');
const { gestos, tique } = require('./helpers/ui-app.cjs');

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

const cfg = (g) => JSON.parse(g.w.localStorage.getItem('fp-config'));

async function abrirBancos(opts) {
  app = await subirApp(opts || {});
  const g = gestos(app);
  g.w.mudarAba('config');
  await app.esperar(() => g.d.querySelector('[data-action="abrir-config-bancos"]'));
  g.clicar('[data-action="abrir-config-bancos"]');
  await app.esperar(() => g.d.getElementById('aba-gerenciar-bancos').classList.contains('ativo'));
  return g;
}

function enviar(g, formId) {
  g.d.getElementById(formId).dispatchEvent(new g.w.Event('submit', { bubbles: true, cancelable: true }));
}

test('abre a tela com as duas listas vazias', async () => {
  const g = await abrirBancos();
  expect(g.d.getElementById('bancos-list').textContent).toMatch(/Nenhum banco cadastrado/);
  expect(g.d.getElementById('cartoes-list').textContent).toMatch(/Nenhum cartão cadastrado/);
  expect(app.erros).toEqual([]);
});

test('adicionar banco: nome validado, lista atualiza, formulário limpa e remover pede confirmação', async () => {
  const g = await abrirBancos();
  g.preencher('banco-nome', '   ');
  enviar(g, 'form-adicionar-banco');
  expect(cfg(g).bancos || []).toEqual([]);

  g.preencher('banco-nome', 'Nubank');
  g.preencher('banco-tipo', 'Conta Poupança');
  enviar(g, 'form-adicionar-banco');
  expect(cfg(g).bancos).toEqual([{ nome: 'Nubank', tipo: 'Conta Poupança' }]);
  expect(g.d.getElementById('banco-nome').value).toBe('');
  expect(g.d.querySelector('#bancos-list .banco-item-nome').textContent).toBe('Nubank');

  g.clicar('#bancos-list .btn-remover-banco');
  await app.esperar(() => g.modal());
  expect(g.modal().textContent).toMatch(/remover este banco/);
  g.confirmar();
  await tique();
  expect(cfg(g).bancos).toEqual([]);
  expect(g.d.getElementById('bancos-list').textContent).toMatch(/Nenhum banco cadastrado/);
});

test('adicionar cartão com fechamento e vencimento mostra o melhor dia de compra; sem ciclo, avisa', async () => {
  const g = await abrirBancos({ config: { plano: 'pro' } });
  g.preencher('cartao-nome', 'Roxinho');
  g.preencher('cartao-bandeira', 'Mastercard');
  g.preencher('cartao-limite', '5.000,00');
  g.preencher('cartao-fechamento', '3');
  g.preencher('cartao-vencimento', '10');
  enviar(g, 'form-adicionar-cartao');

  const [c] = cfg(g).cartoes;
  expect(c).toMatchObject({ nome: 'Roxinho', bandeira: 'Mastercard', fechamento: 3, vencimento: 10 });
  expect(Number(c.limite)).toBe(5000);
  const lista = g.d.getElementById('cartoes-list');
  expect(lista.textContent).toMatch(/Melhor dia de compra: dia 4/);
  expect(g.d.getElementById('cartao-nome').value).toBe('');

  g.preencher('cartao-nome', 'Sem Ciclo');
  enviar(g, 'form-adicionar-cartao');
  expect(lista.querySelector('.banco-item--aviso').textContent).toMatch(/Sem ciclo/);
});

test('editar cartão: o nome não muda, limite e ciclo sim', async () => {
  const g = await abrirBancos({ config: { plano: 'pro', cartoes: [{ nome: 'Visa Gold', bandeira: 'Visa', limite: 1000, fechamento: 5, vencimento: 15 }] } });
  g.clicar('#cartoes-list .btn-editar-cartao');
  await app.esperar(() => g.d.getElementById('cartao-edit-nome'));
  expect(g.d.getElementById('cartao-edit-nome').disabled).toBe(true);
  g.preencher('cartao-edit-limite', '2.500,00');
  g.preencher('cartao-edit-fech', '20');
  g.preencher('cartao-edit-venc', '28');
  g.okModal();
  await tique();
  expect(cfg(g).cartoes[0]).toMatchObject({ nome: 'Visa Gold', limite: 2500, fechamento: 20, vencimento: 28 });
  expect(g.modal()).toBeNull();
});

test('remover cartão pede confirmação; cancelar mantém', async () => {
  const g = await abrirBancos({ config: { plano: 'pro', cartoes: [{ nome: 'Visa Gold', bandeira: 'Visa' }] } });
  g.clicar('#cartoes-list .btn-remover-banco');
  await app.esperar(() => g.modal());
  g.cancelar();
  await tique();
  expect(cfg(g).cartoes).toHaveLength(1);
  g.clicar('#cartoes-list .btn-remover-banco');
  await app.esperar(() => g.modal());
  g.confirmar();
  await tique();
  expect(cfg(g).cartoes).toEqual([]);
});

// ─── Categorias ─────────────────────────────────────────────────────────────
// Os modais de categoria ligam os botões 100 ms depois de abrir (setTimeout).

async function abrirCategorias(tipo, opts) {
  app = await subirApp(opts || {});
  const g = gestos(app);
  g.w.mudarAba('config');
  await app.esperar(() => g.d.querySelector(`[data-action="gerenciar-categorias"][data-tipo="${tipo}"]`));
  g.clicar(`[data-action="gerenciar-categorias"][data-tipo="${tipo}"]`);
  await app.esperar(() => g.d.getElementById('add-cat-btn'));
  await tique(150);
  return g;
}

async function adicionarCategoria(g, nome) {
  g.clicar('#add-cat-btn');
  await app.esperar(() => g.d.getElementById('cat-nome'));
  await tique(150);
  g.preencher('cat-nome', nome);
  g.okModal();
  await tique(150);
}

const custom = (g, tipo) => ((cfg(g).categoriasCustom || {})[tipo]) || [];
const itens = (g) => [...g.d.querySelectorAll('#cats-list .perfil-modal-item-title')].map((e) => e.textContent);

test('categorias: adicionar aparece na lista reaberta; nome vazio ou repetido é recusado', async () => {
  const g = await abrirCategorias('despesa');
  expect(g.d.querySelector('.perfil-modal-empty').textContent).toMatch(/Nenhuma categoria personalizada/);
  expect(g.d.querySelector('.modal-overlay .modal-btn').textContent).toBe('Fechar');

  await adicionarCategoria(g, 'Streaming');
  expect(custom(g, 'despesa')).toEqual(['Streaming']);
  expect(itens(g)).toEqual(['Streaming']);

  // Vazio: avisa e o modal de adicionar continua aberto para corrigir.
  await adicionarCategoria(g, '   ');
  expect(custom(g, 'despesa')).toEqual(['Streaming']);
  expect(g.d.getElementById('cat-nome')).not.toBeNull();

  g.preencher('cat-nome', 'Streaming');
  g.okModal();
  await tique();
  expect(g.toast()).toMatch(/Já existe uma categoria/);
  expect(custom(g, 'despesa')).toEqual(['Streaming']);
});

test('categorias: remover pede confirmação e reabre a lista atualizada; receita e despesa são separadas', async () => {
  const g = await abrirCategorias('receita', { config: { categoriasCustom: { receita: ['Freela', 'Aluguel recebido'], despesa: ['Pet'] } } });
  expect(itens(g)).toEqual(['Freela', 'Aluguel recebido']);
  g.clicar('#cats-list .btn-remover-cat[data-index="0"]');
  await app.esperar(() => g.d.querySelector('.modal-overlay #mo'));
  g.confirmar();
  await tique(150);
  expect(custom(g, 'receita')).toEqual(['Aluguel recebido']);
  expect(custom(g, 'despesa')).toEqual(['Pet']);
  expect(itens(g)).toEqual(['Aluguel recebido']);
});
