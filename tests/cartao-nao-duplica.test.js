/**
 * cartao-nao-duplica.test.js — a compra no cartão sai da conta uma vez só.
 *
 * Esta é a regra mais fácil de errar em app financeiro, e errar aqui destrói o
 * número que o usuário mais olha.
 *
 * Uma compra no crédito NÃO tira dinheiro da conta no dia da compra. Ela entra
 * numa fatura, e é o pagamento da fatura que debita. Enquanto a fatura não
 * vence, o dinheiro continua no banco — comprometido, não gasto.
 *
 * Três formas de errar, todas cobertas aqui:
 *
 *   1. Descontar do saldo no dia da compra (o app fazia isso).
 *   2. Contar como comprometido E descontar do saldo — o mesmo dinheiro
 *      sumindo duas vezes.
 *   3. Somar o comprometido do cartão junto com as parcelas futuras genéricas,
 *      contando a mesma compra por dois caminhos.
 *
 * O caso do parcelamento é o mais sensível: o app grava uma transação por
 * parcela. Doze parcelas de cartão precisam aparecer inteiras no comprometido
 * e zero vezes no saldo de hoje.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(() => { loadCoreModules(); });
beforeEach(() => { resetFixtures(); });

const HOJE = new Date(2026, 7, 10); // 10/08/2026

function cenario() {
  DADOS.salvarConfig({
    saldosIniciais: { Nubank: 5000 },
    cartoes: [{ nome: 'Cartão Nubank', limite: 8000, fechamento: 20, vencimento: 28 }],
  });
}

function lancar(over) {
  const t = Object.assign({
    id: UTILS.gerarId(),
    tipo: 'despesa',
    valor: 100,
    categoria: 'compras',
    data: '2026-08-05',
    descricao: 'Compra',
    banco: 'Nubank',
    cartao: '',
  }, over || {});
  DADOS.salvarTransacao(t);
  return t;
}

describe('saldo da conta', () => {
  test('compra no crédito não reduz o saldo no dia da compra', () => {
    cenario();
    lancar({ valor: 1200, cartao: 'Cartão Nubank' });

    expect(CONTAS.saldoTotal({ ate: HOJE })).toBe(5000);
  });

  test('compra no débito reduz o saldo normalmente', () => {
    cenario();
    lancar({ valor: 1200 }); // sem cartão = débito/dinheiro

    expect(CONTAS.saldoTotal({ ate: HOJE })).toBe(3800);
  });

  test('a conta do cartão não aparece na lista de saldos', () => {
    // O cartão não é uma conta com dinheiro dentro; listá-lo junto sugeriria
    // um saldo que não existe.
    cenario();
    lancar({ valor: 1200, cartao: 'Cartão Nubank' });

    const nomes = CONTAS.saldos({ ate: HOJE }).map((c) => c.nome);
    expect(nomes).not.toContain('Cartão Nubank');
  });

  test('doze parcelas no cartão não tiram nada do saldo de hoje', () => {
    cenario();
    for (let p = 0; p < 12; p++) {
      lancar({
        valor: 500,
        cartao: 'Cartão Nubank',
        data: UTILS.addMesesClamp('2026-08-05', p),
        descricao: 'TV (' + (p + 1) + '/12)',
      });
    }

    expect(CONTAS.saldoTotal({ ate: HOJE })).toBe(5000);
  });
});

describe('comprometido', () => {
  test('a compra no cartão entra como comprometida', () => {
    cenario();
    lancar({ valor: 1200, cartao: 'Cartão Nubank' });

    expect(COMPROMISSOS.comprometido(HOJE).cartoes).toBe(1200);
  });

  test('as doze parcelas entram inteiras', () => {
    cenario();
    for (let p = 0; p < 12; p++) {
      lancar({
        valor: 500,
        cartao: 'Cartão Nubank',
        data: UTILS.addMesesClamp('2026-08-05', p),
      });
    }

    expect(COMPROMISSOS.comprometido(HOJE).cartoes).toBe(6000);
  });

  test('a mesma compra não é contada duas vezes', () => {
    // Uma parcela de cartão com data futura é, ao mesmo tempo, "despesa
    // futura" e "compra no cartão". Só pode entrar por um caminho.
    cenario();
    lancar({ valor: 900, cartao: 'Cartão Nubank', data: '2026-09-15' });

    const c = COMPROMISSOS.comprometido(HOJE);
    expect(c.cartoes).toBe(900);
    expect(c.parcelasFuturas).toBe(0);
    expect(c.total).toBe(900);
  });

  test('despesa futura sem cartão continua contando como parcela', () => {
    cenario();
    lancar({ valor: 700, data: '2026-09-15' });

    const c = COMPROMISSOS.comprometido(HOJE);
    expect(c.parcelasFuturas).toBe(700);
    expect(c.cartoes).toBe(0);
  });

  test('cartão e débito futuros somam sem se atrapalhar', () => {
    cenario();
    lancar({ valor: 900, cartao: 'Cartão Nubank', data: '2026-09-15' });
    lancar({ valor: 700, data: '2026-09-20' });

    const c = COMPROMISSOS.comprometido(HOJE);
    expect(c.cartoes).toBe(900);
    expect(c.parcelasFuturas).toBe(700);
    expect(c.total).toBe(1600);
  });

  test('fatura já vencida sai do comprometido', () => {
    cenario();
    lancar({ valor: 1000, cartao: 'Cartão Nubank', data: '2026-06-05' });

    expect(COMPROMISSOS.comprometido(HOJE).cartoes).toBe(0);
  });
});

describe('disponível para gastar', () => {
  test('a compra no cartão reduz o disponível, não o saldo', () => {
    cenario();
    lancar({ valor: 1200, cartao: 'Cartão Nubank' });

    const d = COMPROMISSOS.disponivel(HOJE);
    expect(d.saldo).toBe(5000);        // o dinheiro ainda está no banco
    expect(d.comprometido).toBe(1200); // mas já tem dono
    expect(d.valor).toBe(3800);        // e não 5000 - 1200 - 1200
  });

  test('o cenário completo fecha', () => {
    cenario();
    lancar({ valor: 800, cartao: 'Cartão Nubank' });          // fatura ago
    lancar({ valor: 400, cartao: 'Cartão Nubank', data: '2026-09-15' }); // fatura set
    lancar({ valor: 300, data: '2026-08-03' });               // débito já saiu
    lancar({ valor: 500, data: '2026-09-10' });               // débito futuro
    DADOS.salvarConfig({
      contasPagar: [{ id: '1', descricao: 'Aluguel', valor: 1000,
        vencimento: '2026-08-20', status: 'pendente' }],
    });

    const d = COMPROMISSOS.disponivel(HOJE);
    expect(d.saldo).toBe(4700);         // 5000 - 300 (só o débito já ocorrido)
    expect(d.comprometido).toBe(2700);  // 800 + 400 (cartão) + 500 + 1000
    expect(d.valor).toBe(2000);
  });

  test('sem cartões cadastrados nada muda', () => {
    DADOS.salvarConfig({ saldosIniciais: { Nubank: 5000 } });
    lancar({ valor: 1200 });

    const d = COMPROMISSOS.disponivel(HOJE);
    expect(d.saldo).toBe(3800);
    expect(d.comprometido).toBe(0);
  });
});

describe('compatibilidade com dados antigos', () => {
  test('cartão não cadastrado se comporta como antes: debita a conta', () => {
    // Instalações antigas têm lançamentos com `cartao: 'Crédito'` sem cadastro
    // correspondente. Tratá-los como fatura invisível esconderia gasto real —
    // é melhor manter o comportamento anterior do que adivinhar.
    DADOS.salvarConfig({ saldosIniciais: { Nubank: 5000 }, cartoes: [] });
    lancar({ valor: 1200, cartao: 'Crédito' });

    expect(CONTAS.saldoTotal({ ate: HOJE })).toBe(3800);
    expect(COMPROMISSOS.comprometido(HOJE).cartoes).toBe(0);
  });

  test('cartão cadastrado sem ciclo já não debita a conta', () => {
    // Cadastrado significa que o usuário declarou que é crédito. Mesmo sem
    // fechamento e vencimento, a compra não sai da conta no dia.
    DADOS.salvarConfig({
      saldosIniciais: { Nubank: 5000 },
      cartoes: [{ nome: 'Visa', limite: 2000 }],
    });
    lancar({ valor: 1200, cartao: 'Visa' });

    expect(CONTAS.saldoTotal({ ate: HOJE })).toBe(5000);
    expect(COMPROMISSOS.comprometido(HOJE).cartoes).toBe(1200);
  });

  test('transferência com campo cartão preenchido não vira fatura', () => {
    cenario();
    lancar({ valor: 900, cartao: 'Cartão Nubank', tipo: 'transferencia', contaDestino: 'X' });

    expect(COMPROMISSOS.comprometido(HOJE).cartoes).toBe(0);
  });
});

describe('orçamento continua enxergando o gasto do cartão', () => {
  test('compra no cartão consome o orçamento da categoria', () => {
    // A compra não saiu da conta ainda, mas o gasto aconteceu — o orçamento
    // mensal existe para medir consumo, não fluxo de caixa.
    cenario();
    ORCAMENTO.init();
    ORCAMENTO.definirLimite('compras', 1000);
    lancar({ valor: 800, cartao: 'Cartão Nubank', categoria: 'compras' });

    expect(ORCAMENTO.calcularGastoMes('compras', 8, 2026)).toBe(800);
  });
});
