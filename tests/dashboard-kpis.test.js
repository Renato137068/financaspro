/**
 * dashboard-kpis.test.js — "quanto eu posso gastar?" e "quanto já está preso?".
 *
 * O dashboard respondia quanto entrou e quanto saiu. Não respondia as duas
 * perguntas que decidem se a pessoa compra ou não compra alguma coisa hoje:
 *
 *   COMPROMETIDO — o que já tem dono mas ainda não saiu da conta: parcelas de
 *   meses futuros, contas a pagar em aberto, assinaturas do ciclo.
 *
 *   DISPONÍVEL — o que sobra depois de tirar o comprometido do saldo.
 *
 * Sem isso, um saldo de R$ 3.000 parece folga quando na verdade R$ 2.400 já
 * estão prometidos ao cartão. É exatamente aí que o orçamento estoura.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(() => { loadCoreModules(); });
beforeEach(() => { resetFixtures(); });

const HOJE = new Date(2026, 7, 10); // 10/08/2026

function despesa(valor, data, over) {
  return Object.assign({
    id: UTILS.gerarId(),
    tipo: 'despesa',
    valor,
    categoria: 'outro',
    data,
    descricao: 'x',
    banco: 'Nubank',
    cartao: '',
  }, over || {});
}

describe('COMPROMISSOS.comprometido — o que já tem dono', () => {
  test('toda parcela ainda por vencer conta, inclusive a deste mês', () => {
    // Compra de R$ 900 em 3x. Estando hoje em 10/08, as três parcelas (15/08,
    // 15/09, 15/10) ainda vão sair da conta — o corte é a DATA, não o mês.
    DADOS.salvarTransacao(despesa(300, '2026-08-15', { descricao: 'TV (1/3)' }));
    DADOS.salvarTransacao(despesa(300, '2026-09-15', { descricao: 'TV (2/3)' }));
    DADOS.salvarTransacao(despesa(300, '2026-10-15', { descricao: 'TV (3/3)' }));

    expect(COMPROMISSOS.comprometido(HOJE).parcelasFuturas).toBe(900);
  });

  test('parcela já paga sai do comprometido', () => {
    DADOS.salvarTransacao(despesa(300, '2026-07-15', { descricao: 'TV (1/3)' }));
    DADOS.salvarTransacao(despesa(300, '2026-08-15', { descricao: 'TV (2/3)' }));

    expect(COMPROMISSOS.comprometido(HOJE).parcelasFuturas).toBe(300);
  });

  test('despesa do passado não conta como compromisso', () => {
    DADOS.salvarTransacao(despesa(500, '2026-07-15'));
    expect(COMPROMISSOS.comprometido(HOJE).parcelasFuturas).toBe(0);
  });

  test('despesa de hoje não conta — já aconteceu', () => {
    DADOS.salvarTransacao(despesa(500, '2026-08-10'));
    expect(COMPROMISSOS.comprometido(HOJE).parcelasFuturas).toBe(0);
  });

  test('contas a pagar em aberto contam', () => {
    DADOS.salvarConfig({
      contasPagar: [
        { id: '1', descricao: 'Aluguel', valor: 1800, vencimento: '2026-08-20', status: 'pendente' },
        { id: '2', descricao: 'Luz', valor: 200, vencimento: '2026-08-25', status: 'pago' },
      ],
    });

    expect(COMPROMISSOS.comprometido(HOJE).contasPagar).toBe(1800);
  });

  test('transferência futura não é compromisso — o dinheiro continua com o usuário', () => {
    DADOS.salvarTransacao(despesa(1000, '2026-09-15', {
      tipo: 'transferencia', contaDestino: 'Poupança',
    }));

    expect(COMPROMISSOS.comprometido(HOJE).parcelasFuturas).toBe(0);
  });

  test('receita futura não vira compromisso', () => {
    DADOS.salvarTransacao(despesa(5000, '2026-09-01', { tipo: 'receita' }));
    expect(COMPROMISSOS.comprometido(HOJE).parcelasFuturas).toBe(0);
  });

  test('o total soma as fontes', () => {
    DADOS.salvarTransacao(despesa(300, '2026-09-15'));
    DADOS.salvarConfig({
      contasPagar: [
        { id: '1', descricao: 'Aluguel', valor: 1800, vencimento: '2026-08-20', status: 'pendente' },
      ],
    });

    expect(COMPROMISSOS.comprometido(HOJE).total).toBe(2100);
  });

  test('soma exata em centavos', () => {
    for (let i = 0; i < 1000; i++) {
      DADOS.salvarTransacao(despesa(0.1, '2026-09-15'));
    }
    expect(COMPROMISSOS.comprometido(HOJE).total).toBe(100);
  });

  test('sem dados devolve zero, não NaN', () => {
    const c = COMPROMISSOS.comprometido(HOJE);
    expect(c.total).toBe(0);
    expect(Number.isNaN(c.total)).toBe(false);
  });
});

describe('COMPROMISSOS.disponivel — o que sobra de verdade', () => {
  test('saldo menos comprometido', () => {
    DADOS.salvarConfig({ saldosIniciais: { Nubank: 3000 } });
    DADOS.salvarTransacao(despesa(2400, '2026-09-15', { descricao: 'Cartão (2/3)' }));

    const d = COMPROMISSOS.disponivel(HOJE);
    expect(d.saldo).toBe(3000);
    expect(d.comprometido).toBe(2400);
    expect(d.valor).toBe(600);
  });

  test('pode ficar negativo — o alerta é justamente esse', () => {
    DADOS.salvarConfig({ saldosIniciais: { Nubank: 500 } });
    DADOS.salvarTransacao(despesa(2000, '2026-09-15'));

    expect(COMPROMISSOS.disponivel(HOJE).valor).toBe(-1500);
  });

  test('sem compromissos, disponível é o próprio saldo', () => {
    DADOS.salvarConfig({ saldosIniciais: { Nubank: 1200 } });
    expect(COMPROMISSOS.disponivel(HOJE).valor).toBe(1200);
  });

  test('classifica a folga para a UI', () => {
    DADOS.salvarConfig({ saldosIniciais: { Nubank: 1000 } });
    expect(COMPROMISSOS.disponivel(HOJE).situacao).toBe('folga');

    DADOS.salvarTransacao(despesa(950, '2026-09-15'));
    expect(COMPROMISSOS.disponivel(HOJE).situacao).toBe('apertado');

    DADOS.salvarTransacao(despesa(500, '2026-09-15'));
    expect(COMPROMISSOS.disponivel(HOJE).situacao).toBe('negativo');
  });
});

describe('saldo e comprometido não contam a mesma parcela duas vezes', () => {
  test('a parcela futura sai do comprometido, nunca do saldo de hoje', () => {
    // O erro clássico: descontar a parcela do saldo E somá-la ao comprometido.
    // O usuário veria o dinheiro sumir duas vezes.
    DADOS.salvarConfig({ saldosIniciais: { Nubank: 3000 } });
    DADOS.salvarTransacao(despesa(500, '2026-09-15', { descricao: 'Parcela futura' }));

    const d = COMPROMISSOS.disponivel(HOJE);
    expect(d.saldo).toBe(3000);        // a parcela ainda não saiu do banco
    expect(d.comprometido).toBe(500);  // mas já tem dono
    expect(d.valor).toBe(2500);        // 3000 - 500, e não 3000 - 500 - 500
  });

  test('depois de vencida, a parcela aparece no saldo e some do comprometido', () => {
    DADOS.salvarConfig({ saldosIniciais: { Nubank: 3000 } });
    DADOS.salvarTransacao(despesa(500, '2026-08-05', { descricao: 'Parcela paga' }));

    const d = COMPROMISSOS.disponivel(HOJE);
    expect(d.saldo).toBe(2500);
    expect(d.comprometido).toBe(0);
    expect(d.valor).toBe(2500); // o disponível não muda ao virar a data
  });
});
