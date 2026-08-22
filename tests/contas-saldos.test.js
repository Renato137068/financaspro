/**
 * contas-saldos.test.js — "quanto eu tenho?" por conta.
 *
 * O app registrava a conta de cada lançamento (campo `banco`) e nunca somava
 * nada por conta. A pergunta mais básica de um app financeiro — quanto tem em
 * cada lugar — não tinha resposta em lugar nenhum da interface.
 *
 * O saldo é derivado das transações, não guardado. Guardar um saldo e mantê-lo
 * em sincronia com lançamentos que podem ser editados e apagados é como se
 * criam divergências silenciosas; derivar sempre custa alguns milissegundos e
 * nunca diverge.
 *
 * O saldo inicial (`config.saldosIniciais`) existe porque ninguém começa a usar
 * o app com as contas zeradas.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(() => { loadCoreModules(); });
beforeEach(() => { resetFixtures(); });

function tx(over) {
  return Object.assign({
    id: UTILS.gerarId(),
    tipo: 'despesa',
    valor: 100,
    categoria: 'outro',
    data: '2026-08-05',
    descricao: 'teste',
    banco: 'Nubank',
    cartao: '',
  }, over || {});
}

function semear(lista) {
  lista.forEach((t) => DADOS.salvarTransacao(tx(t)));
}

describe('CONTAS.saldos — soma por conta', () => {
  test('receita entra, despesa sai', () => {
    semear([
      { tipo: 'receita', valor: 5000, banco: 'Nubank' },
      { tipo: 'despesa', valor: 1200, banco: 'Nubank' },
    ]);

    const contas = CONTAS.saldos();
    const nubank = contas.find((c) => c.nome === 'Nubank');

    expect(nubank.entradas).toBe(5000);
    expect(nubank.saidas).toBe(1200);
    expect(nubank.saldo).toBe(3800);
  });

  test('cada conta é somada separadamente', () => {
    semear([
      { tipo: 'receita', valor: 3000, banco: 'Nubank' },
      { tipo: 'receita', valor: 1000, banco: 'Itaú' },
      { tipo: 'despesa', valor: 500, banco: 'Itaú' },
    ]);

    const contas = CONTAS.saldos();
    expect(contas.find((c) => c.nome === 'Nubank').saldo).toBe(3000);
    expect(contas.find((c) => c.nome === 'Itaú').saldo).toBe(500);
  });

  test('soma em centavos — mil lançamentos de R$ 0,10 dão exatamente R$ 100', () => {
    const muitos = [];
    for (let i = 0; i < 1000; i++) muitos.push({ tipo: 'receita', valor: 0.1, banco: 'Nubank' });
    semear(muitos);

    expect(CONTAS.saldos().find((c) => c.nome === 'Nubank').saldo).toBe(100);
  });

  test('saldo inicial entra na conta', () => {
    DADOS.salvarConfig({ saldosIniciais: { Nubank: 2000 } });
    semear([{ tipo: 'despesa', valor: 500, banco: 'Nubank' }]);

    const nubank = CONTAS.saldos().find((c) => c.nome === 'Nubank');
    expect(nubank.saldoInicial).toBe(2000);
    expect(nubank.saldo).toBe(1500);
  });

  test('saldo pode ficar negativo — não é escondido', () => {
    semear([{ tipo: 'despesa', valor: 300, banco: 'Nubank' }]);
    expect(CONTAS.saldos().find((c) => c.nome === 'Nubank').saldo).toBe(-300);
  });
});

describe('CONTAS.saldos — quais contas aparecem', () => {
  test('conta cadastrada sem lançamento aparece zerada, não some', () => {
    DADOS.salvarConfig({ bancos: [{ nome: 'C6', tipo: 'Conta Digital' }] });

    const c6 = CONTAS.saldos().find((c) => c.nome === 'C6');
    expect(c6).toBeDefined();
    expect(c6.saldo).toBe(0);
    expect(c6.transacoes).toBe(0);
  });

  test('conta que só existe nas transações também aparece', () => {
    // Sem isso, dinheiro lançado numa conta apagada da lista sumiria do total.
    semear([{ tipo: 'receita', valor: 800, banco: 'Banco Antigo' }]);

    expect(CONTAS.saldos().find((c) => c.nome === 'Banco Antigo').saldo).toBe(800);
  });

  test('lançamento sem conta é agrupado, não descartado', () => {
    semear([{ tipo: 'receita', valor: 400, banco: '' }]);

    const semConta = CONTAS.saldos().find((c) => c.semConta);
    expect(semConta).toBeDefined();
    expect(semConta.saldo).toBe(400);
  });

  test('nomes com espaço nas pontas não viram contas separadas', () => {
    semear([
      { tipo: 'receita', valor: 100, banco: 'Nubank' },
      { tipo: 'receita', valor: 100, banco: '  Nubank  ' },
    ]);

    const nubanks = CONTAS.saldos().filter((c) => c.nome === 'Nubank');
    expect(nubanks).toHaveLength(1);
    expect(nubanks[0].saldo).toBe(200);
  });

  test('ordena do maior saldo para o menor', () => {
    semear([
      { tipo: 'receita', valor: 100, banco: 'Pequena' },
      { tipo: 'receita', valor: 9000, banco: 'Grande' },
      { tipo: 'receita', valor: 500, banco: 'Media' },
    ]);

    expect(CONTAS.saldos().map((c) => c.nome)).toEqual(['Grande', 'Media', 'Pequena']);
  });

  test('sem dado nenhum devolve lista vazia, não quebra', () => {
    expect(CONTAS.saldos()).toEqual([]);
  });
});

describe('CONTAS.saldoTotal', () => {
  test('soma todas as contas', () => {
    DADOS.salvarConfig({ saldosIniciais: { Nubank: 1000 } });
    semear([
      { tipo: 'receita', valor: 2000, banco: 'Nubank' },
      { tipo: 'despesa', valor: 500, banco: 'Itaú' },
    ]);

    expect(CONTAS.saldoTotal()).toBe(2500);
  });

  test('bate com a soma da lista devolvida por saldos()', () => {
    semear([
      { tipo: 'receita', valor: 1234.56, banco: 'A' },
      { tipo: 'despesa', valor: 78.9, banco: 'B' },
      { tipo: 'receita', valor: 0.07, banco: '' },
    ]);

    const soma = UTILS.somarMoeda(CONTAS.saldos().map((c) => c.saldo));
    expect(CONTAS.saldoTotal()).toBe(soma);
  });

  test('sem dados devolve 0', () => {
    expect(CONTAS.saldoTotal()).toBe(0);
  });
});
