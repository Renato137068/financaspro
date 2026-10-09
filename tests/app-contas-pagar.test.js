/**
 * app-contas-pagar.test.js — Resumo › Contas a pagar, com o app inteiro.
 * @jest-environment node
 *
 * Auditoria de qualidade de 08/10: a tela estava em 50% de cobertura e
 * "pagar" gera uma despesa. Conta paga sem lançamento, ou lançada duas vezes,
 * mexe direto no saldo do usuário.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');
const { gestos, tique } = require('./helpers/ui-app.cjs');

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

const conta = (extra) => Object.assign({
  id: 'cp-1', descricao: 'Internet', valor: 120, vencimento: '2026-09-25',
  categoria: 'moradia', recorrente: false, status: 'pendente', criadoEm: '2026-09-01T12:00:00.000Z'
}, extra || {});

async function abrir(contas) {
  app = await subirApp({ config: { contasPagar: contas || [] } });
  return gestos(app);
}

const contasSalvas = (g) => JSON.parse(g.w.localStorage.getItem('fp-config')).contasPagar || [];
const transacoes = (g) => JSON.parse(g.w.localStorage.getItem('fp-transacoes') || '[]');
const despesasDe = (g, desc) => transacoes(g).filter((t) => t.tipo === 'despesa' && String(t.descricao).indexOf(desc) === 0);

test('com conta pendente: a seção aparece com a conta e o valor', async () => {
  const g = await abrir([conta()]);
  await app.esperar(() => g.d.querySelector('#contas-pagar-panel .cp-item'));
  expect(g.d.getElementById('secao-contas-pagar').style.display).toBe('');
  const item = g.d.querySelector('#contas-pagar-panel .cp-item');
  expect(item.textContent).toMatch(/Internet/);
  expect(item.textContent).toMatch(/R\$\s?120,00/);
  expect(app.erros).toEqual([]);
});

test('criar pelo formulário salva a conta pendente', async () => {
  const g = await abrir([]);
  g.clicar('#secao-contas-pagar [data-action="conta-nova"]');
  await app.esperar(() => g.d.getElementById('conta-desc'));
  g.preencher('conta-desc', 'Aluguel');
  g.preencher('conta-valor', '1.500,00');
  g.preencher('conta-venc', '2026-10-05');
  g.okModal();
  await tique();
  expect(g.modal()).toBeNull();
  expect(contasSalvas(g)).toEqual([expect.objectContaining({ descricao: 'Aluguel', valor: 1500, vencimento: '2026-10-05', status: 'pendente' })]);
  expect(g.d.getElementById('secao-contas-pagar').style.display).toBe('');
  expect(app.erros).toEqual([]);
});

test('criar sem descrição avisa e não salva', async () => {
  const g = await abrir([]);
  g.clicar('#secao-contas-pagar [data-action="conta-nova"]');
  await app.esperar(() => g.d.getElementById('conta-desc'));
  g.preencher('conta-valor', '50,00');
  g.okModal();
  await tique();
  expect(g.modal()).not.toBeNull();
  expect(contasSalvas(g)).toEqual([]);
});

test('pagar conta avulsa gera exatamente uma despesa e tira a conta da lista', async () => {
  const g = await abrir([conta()]);
  await app.esperar(() => g.d.querySelector('[data-action="conta-pagar"]'));
  g.clicar('[data-action="conta-pagar"][data-conta-id="cp-1"]');
  await app.esperar(() => g.modal());
  expect(g.modal().textContent).toMatch(/Internet.*R\$\s?120,00/);
  g.confirmar();
  await tique();

  const desp = despesasDe(g, 'Internet');
  expect(desp).toHaveLength(1);
  expect(desp[0]).toMatchObject({ valor: 120, categoria: 'moradia', data: '2026-09-20' });
  expect(contasSalvas(g)[0].status).toBe('pago');
  expect(g.d.querySelector('#contas-pagar-panel .cp-item')).toBeNull();
  expect(app.erros).toEqual([]);
});

test('dois toques em "Marcar pago" antes de confirmar não lançam a despesa duas vezes', async () => {
  const g = await abrir([conta()]);
  await app.esperar(() => g.d.querySelector('[data-action="conta-pagar"]'));
  const btn = g.d.querySelector('[data-action="conta-pagar"][data-conta-id="cp-1"]');
  g.clicar(btn);
  g.clicar(btn);
  await app.esperar(() => g.modal());
  // Confirma tudo o que estiver aberto, como quem toca "Confirmar" duas vezes.
  for (let i = 0; i < 3 && g.d.querySelector('.modal-overlay #mo'); i++) {
    g.confirmar();
    await tique();
  }
  expect(despesasDe(g, 'Internet')).toHaveLength(1);
});

test('pagar conta mensal gera uma despesa e empurra o vencimento um mês', async () => {
  const g = await abrir([conta({ recorrente: true })]);
  await app.esperar(() => g.d.querySelector('[data-action="conta-pagar"]'));
  g.clicar('[data-action="conta-pagar"][data-conta-id="cp-1"]');
  await app.esperar(() => g.modal());
  g.confirmar();
  await tique();

  expect(despesasDe(g, 'Internet')).toHaveLength(1);
  const [c] = contasSalvas(g);
  expect(c).toMatchObject({ status: 'pendente', vencimento: '2026-10-25' });
  expect(c.ultimoPagamento).toBeTruthy();
});

test('cancelar o pagamento não lança nada', async () => {
  const g = await abrir([conta()]);
  await app.esperar(() => g.d.querySelector('[data-action="conta-pagar"]'));
  g.clicar('[data-action="conta-pagar"][data-conta-id="cp-1"]');
  await app.esperar(() => g.modal());
  g.cancelar();
  await tique();
  expect(despesasDe(g, 'Internet')).toHaveLength(0);
  expect(contasSalvas(g)[0].status).toBe('pendente');
});

test('editar muda valor e vencimento e preserva id e status', async () => {
  const g = await abrir([conta()]);
  await app.esperar(() => g.d.querySelector('[data-action="conta-editar"]'));
  g.clicar('[data-action="conta-editar"][data-conta-id="cp-1"]');
  await app.esperar(() => g.d.getElementById('conta-desc'));
  expect(g.d.getElementById('conta-desc').value).toBe('Internet');
  g.preencher('conta-valor', '135,90');
  g.preencher('conta-venc', '2026-09-28');
  g.okModal();
  await tique();
  expect(contasSalvas(g)).toEqual([expect.objectContaining({ id: 'cp-1', valor: 135.9, vencimento: '2026-09-28', status: 'pendente' })]);
  expect(despesasDe(g, 'Internet')).toHaveLength(0);
  expect(app.erros).toEqual([]);
});

test('excluir pede confirmação e remove só a conta, sem lançar nada', async () => {
  const g = await abrir([conta(), conta({ id: 'cp-2', descricao: 'Luz', valor: 90 })]);
  await app.esperar(() => g.d.querySelector('[data-action="conta-excluir"]'));
  g.clicar('[data-action="conta-excluir"][data-conta-id="cp-1"]');
  await app.esperar(() => g.modal());
  g.confirmar();
  await tique();
  expect(contasSalvas(g).map((c) => c.id)).toEqual(['cp-2']);
  expect(transacoes(g).filter((t) => t.tipo === 'despesa')).toHaveLength(0);
});

test('sem nenhuma conta, Orçamento › Gastos fixos leva ao cadastro da primeira', async () => {
  const g = await abrir([]);
  expect(g.d.getElementById('secao-contas-pagar').style.display).toBe('none');
  g.w.mudarAba('orcamento');
  await app.esperar(() => g.d.querySelector('[data-orc-sub="assinaturas"]'));
  g.clicar('[data-orc-sub="assinaturas"]');
  await app.esperar(() => g.d.querySelector('#assinaturas-list [data-action="conta-nova"]'));
  g.clicar('#assinaturas-list [data-action="conta-nova"]');
  await app.esperar(() => g.d.getElementById('conta-desc'));
  g.preencher('conta-desc', 'Luz');
  g.preencher('conta-valor', '89,90');
  g.okModal();
  await tique();
  expect(contasSalvas(g)).toEqual([expect.objectContaining({ descricao: 'Luz', valor: 89.9, status: 'pendente' })]);
  expect(g.d.getElementById('secao-contas-pagar').style.display).toBe('');
  expect(app.erros).toEqual([]);
});

test('"Editar" é uma ação conhecida do app (sem aviso de ação desconhecida)', async () => {
  const g = await abrir([conta()]);
  const avisos = [];
  const original = g.w.console.warn;
  g.w.console.warn = (...a) => { avisos.push(a.join(' ')); };
  await app.esperar(() => g.d.querySelector('[data-action="conta-editar"]'));
  g.clicar('[data-action="conta-editar"][data-conta-id="cp-1"]');
  await tique();
  g.w.console.warn = original;
  expect(avisos.filter((a) => /desconhecida/.test(a))).toEqual([]);
});
