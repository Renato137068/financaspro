/**
 * O saldo era lido duas vezes pelo TalkBack ao passar o dedo: o cartão e a
 * região que anuncia a mudança ficam lado a lado (auditoria de acessibilidade
 * de 08/10, item 5). Depois de anunciada, a região se esvazia.
 * @jest-environment node
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

test('a região do saldo anuncia e depois fica vazia', async () => {
  app = await subirApp({
    transacoes: [{ id: 't1', tipo: 'receita', valor: 1000, categoria: 'salario', data: '2026-09-05', descricao: 'Salário' }],
  });
  const regiao = app.document.getElementById('saldo-anuncio');
  await app.esperar(() => regiao.textContent !== '');
  expect(regiao.textContent).toMatch(/Saldo do mês \(realizado\): R\$\s?1\.000,00/);
  expect(await app.esperar(() => regiao.textContent === '', 6000)).toBe(true);
  expect(app.document.getElementById('card-saldo-principal').textContent).toMatch(/1\.000,00/);
});
