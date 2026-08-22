/**
 * fatura-pagamento.test.js — tira a hipótese de dentro do cálculo.
 *
 * A Fase 5 entregou o ciclo de fatura com uma suposição embutida: fatura
 * vencida foi paga. Era a hipótese menos enganosa disponível — o contrário
 * mostraria o limite preso para sempre — mas continuava sendo uma suposição
 * silenciosa sobre dinheiro.
 *
 * As duas situações que ela erra:
 *
 *   PAGOU ANTES — quem quita a fatura no dia 20 e ela vence dia 28 fica uma
 *   semana vendo limite consumido que já está livre.
 *
 *   NÃO PAGOU — quem atrasou vê limite disponível que não tem, e o app não
 *   comenta nada.
 *
 * A solução não é trocar uma suposição por outra. É deixar o usuário
 * confirmar, e — quando ele não confirmou — dizer que não sabe, em vez de
 * fingir que sabe. Daí `naoConfirmadas`: faturas vencidas sem confirmação
 * continuam fora do cálculo (segurança), mas ficam visíveis para a UI
 * perguntar.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(() => { loadCoreModules(); });
beforeEach(() => { resetFixtures(); });

const HOJE = new Date(2026, 7, 25); // 25/08/2026

function cartao() {
  DADOS.salvarConfig({
    cartoes: [{ nome: 'Nubank', limite: 5000, fechamento: 20, vencimento: 28 }],
  });
}

function compra(valor, data) {
  DADOS.salvarTransacao({
    id: UTILS.gerarId(),
    tipo: 'despesa',
    valor,
    categoria: 'compras',
    data,
    descricao: 'Compra',
    banco: '',
    cartao: 'Nubank',
  });
}

describe('CARTOES.marcarFaturaPaga', () => {
  test('registra o pagamento da competência', () => {
    cartao();
    CARTOES.marcarFaturaPaga('Nubank', '2026-08', '2026-08-25');

    expect(CARTOES.faturaEstaPaga('Nubank', '2026-08')).toBe(true);
  });

  test('sem data informada usa hoje', () => {
    cartao();
    CARTOES.marcarFaturaPaga('Nubank', '2026-08');

    expect(CARTOES.pagamentoDaFatura('Nubank', '2026-08')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('desmarcar volta a fatura para em aberto', () => {
    cartao();
    CARTOES.marcarFaturaPaga('Nubank', '2026-08');
    CARTOES.desmarcarFaturaPaga('Nubank', '2026-08');

    expect(CARTOES.faturaEstaPaga('Nubank', '2026-08')).toBe(false);
  });

  test('marcar duas vezes não duplica registro', () => {
    cartao();
    CARTOES.marcarFaturaPaga('Nubank', '2026-08', '2026-08-20');
    CARTOES.marcarFaturaPaga('Nubank', '2026-08', '2026-08-25');

    expect(CARTOES.pagamentoDaFatura('Nubank', '2026-08')).toBe('2026-08-25');
  });

  test('faturas de cartões diferentes não se confundem', () => {
    DADOS.salvarConfig({ cartoes: [
      { nome: 'Nubank', limite: 5000, fechamento: 20, vencimento: 28 },
      { nome: 'Inter', limite: 2000, fechamento: 20, vencimento: 28 },
    ] });
    CARTOES.marcarFaturaPaga('Nubank', '2026-08');

    expect(CARTOES.faturaEstaPaga('Inter', '2026-08')).toBe(false);
  });

  test('cartão inexistente não grava nada', () => {
    cartao();
    expect(CARTOES.marcarFaturaPaga('Fantasma', '2026-08')).toBe(false);
  });
});

describe('pagar a fatura libera o limite antes do vencimento', () => {
  test('fatura em aberto consome limite', () => {
    cartao();
    compra(1500, '2026-08-10'); // fatura de agosto, vence 28/08

    expect(CARTOES.resumo('Nubank', HOJE).utilizado).toBe(1500);
  });

  test('marcada como paga, o limite volta na hora', () => {
    // Quem quita no dia 25 não deve esperar até o dia 28 para ver limite.
    cartao();
    compra(1500, '2026-08-10');
    CARTOES.marcarFaturaPaga('Nubank', '2026-08', '2026-08-25');

    const r = CARTOES.resumo('Nubank', HOJE);
    expect(r.utilizado).toBe(0);
    expect(r.disponivel).toBe(5000);
  });

  test('pagar a fatura de agosto não libera a de setembro', () => {
    cartao();
    compra(1500, '2026-08-10'); // agosto
    compra(800, '2026-08-25');  // setembro (após o fechamento)
    CARTOES.marcarFaturaPaga('Nubank', '2026-08');

    expect(CARTOES.resumo('Nubank', HOJE).utilizado).toBe(800);
  });

  test('a fatura paga sai do comprometido', () => {
    DADOS.salvarConfig({
      saldosIniciais: { Conta: 5000 },
      cartoes: [{ nome: 'Nubank', limite: 5000, fechamento: 20, vencimento: 28 }],
    });
    compra(1500, '2026-08-10');
    expect(COMPROMISSOS.comprometido(HOJE).cartoes).toBe(1500);

    CARTOES.marcarFaturaPaga('Nubank', '2026-08');
    expect(COMPROMISSOS.comprometido(HOJE).cartoes).toBe(0);
  });
});

describe('faturas vencidas sem confirmação', () => {
  test('continuam fora do cálculo — a conta segue segura', () => {
    // Manter o comportamento da Fase 5: não travar o limite de quem
    // simplesmente não usa o recurso de confirmar pagamento.
    cartao();
    compra(1000, '2026-06-05'); // venceu 28/06

    expect(CARTOES.resumo('Nubank', HOJE).utilizado).toBe(0);
  });

  test('mas aparecem como não confirmadas, em vez de sumir', () => {
    cartao();
    compra(1000, '2026-06-05');

    const r = CARTOES.resumo('Nubank', HOJE);
    expect(r.naoConfirmadas).toHaveLength(1);
    expect(r.naoConfirmadas[0].competencia).toBe('2026-06');
    expect(r.naoConfirmadas[0].total).toBe(1000);
  });

  test('fatura vencida e confirmada não aparece na lista', () => {
    cartao();
    compra(1000, '2026-06-05');
    CARTOES.marcarFaturaPaga('Nubank', '2026-06');

    expect(CARTOES.resumo('Nubank', HOJE).naoConfirmadas).toEqual([]);
  });

  test('fatura em aberto não é "não confirmada" — ainda não venceu', () => {
    cartao();
    compra(1500, '2026-08-10'); // vence 28/08, hoje é 25/08

    expect(CARTOES.resumo('Nubank', HOJE).naoConfirmadas).toEqual([]);
  });

  test('lista da mais recente para a mais antiga', () => {
    cartao();
    compra(100, '2026-04-05');
    compra(200, '2026-05-05');
    compra(300, '2026-06-05');

    const naoConf = CARTOES.resumo('Nubank', HOJE).naoConfirmadas;
    expect(naoConf.map((f) => f.competencia)).toEqual(['2026-06', '2026-05', '2026-04']);
  });

  test('a lista é limitada — não vira um histórico infinito', () => {
    cartao();
    for (let m = 1; m <= 6; m++) {
      compra(100, '2026-0' + m + '-05');
    }

    expect(CARTOES.resumo('Nubank', HOJE).naoConfirmadas.length).toBeLessThanOrEqual(3);
  });

  test('sem cartão com ciclo não há o que confirmar', () => {
    DADOS.salvarConfig({ cartoes: [{ nome: 'Visa', limite: 1000 }] });
    DADOS.salvarTransacao({
      id: UTILS.gerarId(), tipo: 'despesa', valor: 300, categoria: 'compras',
      data: '2026-06-05', descricao: 'x', banco: '', cartao: 'Visa',
    });

    expect(CARTOES.resumo('Visa', HOJE).naoConfirmadas).toEqual([]);
  });
});

describe('a fatura sabe o próprio estado', () => {
  test('em aberto antes do vencimento', () => {
    cartao();
    compra(500, '2026-08-10');
    expect(CARTOES.fatura('Nubank', '2026-08').status).toBe('aberta');
  });

  test('paga quando confirmada', () => {
    cartao();
    compra(500, '2026-08-10');
    CARTOES.marcarFaturaPaga('Nubank', '2026-08');

    expect(CARTOES.fatura('Nubank', '2026-08').status).toBe('paga');
  });

  test('não confirmada quando venceu sem registro', () => {
    cartao();
    compra(500, '2026-06-05');
    expect(CARTOES.fatura('Nubank', '2026-06').status).toBe('nao-confirmada');
  });

  test('fatura vazia e vencida não pede confirmação', () => {
    // Não há o que confirmar numa fatura de R$ 0,00.
    cartao();
    expect(CARTOES.fatura('Nubank', '2026-06').status).toBe('vazia');
  });
});

describe('compatibilidade', () => {
  test('config sem faturasPagas não quebra nada', () => {
    cartao();
    compra(1500, '2026-08-10');

    expect(() => CARTOES.resumo('Nubank', HOJE)).not.toThrow();
    expect(CARTOES.faturaEstaPaga('Nubank', '2026-08')).toBe(false);
  });

  test('o total comprometido continua somando os cartões', () => {
    DADOS.salvarConfig({ cartoes: [
      { nome: 'A', limite: 5000, fechamento: 20, vencimento: 28 },
      { nome: 'B', limite: 5000, fechamento: 20, vencimento: 28 },
    ] });
    ['A', 'B'].forEach((nome) => {
      DADOS.salvarTransacao({
        id: UTILS.gerarId(), tipo: 'despesa', valor: 700, categoria: 'compras',
        data: '2026-08-10', descricao: 'x', banco: '', cartao: nome,
      });
    });

    expect(CARTOES.totalComprometido(HOJE)).toBe(1400);
    CARTOES.marcarFaturaPaga('A', '2026-08');
    expect(CARTOES.totalComprometido(HOJE)).toBe(700);
  });
});
