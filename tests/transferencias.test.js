/**
 * transferencias.test.js — mover dinheiro entre contas não é ganhar nem gastar.
 *
 * Sem um tipo próprio, a única forma de registrar "passei R$ 1.000 da corrente
 * para a poupança" era lançar uma despesa e uma receita. O efeito colateral é
 * grande: R$ 1.000 aparecem como renda do mês, R$ 1.000 como gasto, o
 * 50/30/20 é calculado sobre uma renda inflada e a categoria escolhida para a
 * "despesa" estoura um orçamento que nunca foi gasto de verdade.
 *
 * A transferência é gravada como UM registro (`tipo: 'transferencia'`) com
 * conta de origem e destino. Um registro só, e não um par, porque par é como
 * nascem as duplicidades quando alguém edita ou apaga uma das pontas.
 *
 * A escolha do tipo próprio tem um efeito de projeto importante: todos os
 * agregadores do app filtram por `=== 'receita'` ou `=== 'despesa'`, então a
 * transferência é ignorada por eles automaticamente, sem precisar mexer em 17
 * arquivos. Os testes abaixo travam justamente esse comportamento.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(() => { loadCoreModules(); });
beforeEach(() => { resetFixtures(); });

describe('CONFIG.TIPO_TRANSFERENCIA', () => {
  test('existe como constante, não como string solta pelo código', () => {
    expect(CONFIG.TIPO_TRANSFERENCIA).toBe('transferencia');
  });
});

describe('TRANSACOES.criarTransferencia', () => {
  test('grava um único registro, não um par', () => {
    TRANSACOES.criarTransferencia({
      valor: 1000, data: '2026-08-05', origem: 'Corrente', destino: 'Poupança',
    });

    const txs = DADOS.getTransacoes();
    expect(txs).toHaveLength(1);
    expect(txs[0].tipo).toBe('transferencia');
  });

  test('guarda origem e destino', () => {
    const t = TRANSACOES.criarTransferencia({
      valor: 1000, data: '2026-08-05', origem: 'Corrente', destino: 'Poupança',
    });

    expect(t.banco).toBe('Corrente');
    expect(t.contaDestino).toBe('Poupança');
    expect(t.valor).toBe(1000);
  });

  test('recusa transferência para a mesma conta', () => {
    expect(() => TRANSACOES.criarTransferencia({
      valor: 100, data: '2026-08-05', origem: 'Corrente', destino: 'Corrente',
    })).toThrow(/mesma conta/i);
  });

  test('recusa origem ou destino em branco', () => {
    expect(() => TRANSACOES.criarTransferencia({
      valor: 100, data: '2026-08-05', origem: '', destino: 'Poupança',
    })).toThrow();

    expect(() => TRANSACOES.criarTransferencia({
      valor: 100, data: '2026-08-05', origem: 'Corrente', destino: '',
    })).toThrow();
  });

  test('recusa valor zero ou negativo', () => {
    expect(() => TRANSACOES.criarTransferencia({
      valor: 0, data: '2026-08-05', origem: 'A', destino: 'B',
    })).toThrow();

    expect(() => TRANSACOES.criarTransferencia({
      valor: -50, data: '2026-08-05', origem: 'A', destino: 'B',
    })).toThrow();
  });

  test('descrição padrão diz de onde para onde', () => {
    const t = TRANSACOES.criarTransferencia({
      valor: 100, data: '2026-08-05', origem: 'Corrente', destino: 'Poupança',
    });
    expect(t.descricao).toContain('Corrente');
    expect(t.descricao).toContain('Poupança');
  });
});

describe('a transferência não polui receitas nem despesas', () => {
  beforeEach(() => {
    TRANSACOES.criar('receita', 5000, 'salario', '2026-08-01', 'Salário', 'Corrente', '');
    TRANSACOES.criar('despesa', 800, 'alimentacao', '2026-08-02', 'Mercado', 'Corrente', '');
    TRANSACOES.criarTransferencia({
      valor: 2000, data: '2026-08-03', origem: 'Corrente', destino: 'Poupança',
    });
  });

  test('o resumo do mês ignora a transferência', () => {
    const r = TRANSACOES.obterResumoMes(8, 2026);
    expect(r.receitas).toBe(5000);
    expect(r.despesas).toBe(800);
    expect(r.saldo).toBe(4200);
  });

  test('R$ 2.000 movidos não viram renda de R$ 7.000', () => {
    expect(TRANSACOES.obterResumoMes(8, 2026).receitas).toBe(5000);
  });

  test('o orçamento da categoria não é afetado', () => {
    // A transferência não tem categoria de despesa; nenhum limite pode ser
    // consumido por dinheiro que apenas mudou de lugar.
    expect(ORCAMENTO.calcularGastoMes('alimentacao', 8, 2026)).toBe(800);
  });

  test('o saldo geral não conta a transferência como gasto', () => {
    // R$ 5.000 de receita menos R$ 800 de despesa. Os R$ 2.000 transferidos
    // não podem reduzir o patrimônio: continuam com o usuário.
    expect(TRANSACTION_SERVICE.calculateBalance(DADOS.getTransacoes())).toBe(4200);
  });
});

describe('a transferência move o saldo entre as contas', () => {
  test('sai da origem e entra no destino', () => {
    TRANSACOES.criar('receita', 5000, 'salario', '2026-08-01', 'Salário', 'Corrente', '');
    TRANSACOES.criarTransferencia({
      valor: 2000, data: '2026-08-03', origem: 'Corrente', destino: 'Poupança',
    });

    const contas = CONTAS.saldos();
    expect(contas.find((c) => c.nome === 'Corrente').saldo).toBe(3000);
    expect(contas.find((c) => c.nome === 'Poupança').saldo).toBe(2000);
  });

  test('o total do usuário não muda — dinheiro só mudou de lugar', () => {
    TRANSACOES.criar('receita', 5000, 'salario', '2026-08-01', 'Salário', 'Corrente', '');
    const antes = CONTAS.saldoTotal();

    TRANSACOES.criarTransferencia({
      valor: 2000, data: '2026-08-03', origem: 'Corrente', destino: 'Poupança',
    });

    expect(CONTAS.saldoTotal()).toBe(antes);
  });

  test('a conta de destino aparece na lista mesmo sem outros lançamentos', () => {
    TRANSACOES.criar('receita', 5000, 'salario', '2026-08-01', 'Salário', 'Corrente', '');
    TRANSACOES.criarTransferencia({
      valor: 1000, data: '2026-08-03', origem: 'Corrente', destino: 'Nova Conta',
    });

    expect(CONTAS.saldos().find((c) => c.nome === 'Nova Conta')).toBeDefined();
  });

  test('a soma segue exata em centavos', () => {
    TRANSACOES.criar('receita', 0.3, 'salario', '2026-08-01', 'Salário', 'A', '');
    TRANSACOES.criarTransferencia({
      valor: 0.1, data: '2026-08-03', origem: 'A', destino: 'B',
    });

    const contas = CONTAS.saldos();
    expect(contas.find((c) => c.nome === 'A').saldo).toBe(0.2);
    expect(contas.find((c) => c.nome === 'B').saldo).toBe(0.1);
    expect(CONTAS.saldoTotal()).toBe(0.3);
  });

  test('apagar a transferência devolve os saldos ao estado anterior', () => {
    TRANSACOES.criar('receita', 5000, 'salario', '2026-08-01', 'Salário', 'Corrente', '');
    const t = TRANSACOES.criarTransferencia({
      valor: 2000, data: '2026-08-03', origem: 'Corrente', destino: 'Poupança',
    });

    TRANSACOES.deletar(t.id);

    expect(CONTAS.saldos().find((c) => c.nome === 'Corrente').saldo).toBe(5000);
    const poupanca = CONTAS.saldos().find((c) => c.nome === 'Poupança');
    expect(poupanca === undefined || poupanca.saldo === 0).toBe(true);
  });
});

describe('validação aceita o novo tipo', () => {
  test('UTILS.validarTransacao não rejeita transferencia', () => {
    const r = UTILS.validarTransacao({
      tipo: 'transferencia', valor: 100, categoria: 'transferencia', data: '2026-08-05',
    });
    expect(r.valido).toBe(true);
  });

  test('tipo inventado continua sendo rejeitado', () => {
    const r = UTILS.validarTransacao({
      tipo: 'estorno-magico', valor: 100, categoria: 'outro', data: '2026-08-05',
    });
    expect(r.valido).toBe(false);
  });
});
