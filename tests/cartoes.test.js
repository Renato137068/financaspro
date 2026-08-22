/**
 * cartoes.test.js — cartão de crédito como ciclo, não como rótulo.
 *
 * Até aqui o app tratava cartão como um nome. A compra parcelada em 12x no
 * cartão abatia o saldo do mês da compra, quando o desembolso real acontece em
 * doze faturas futuras. Para quem usa cartão — praticamente todo mundo — o
 * número mais visível do app contava a história errada.
 *
 * O que define um cartão é o CICLO: a compra entra numa fatura, a fatura fecha
 * num dia, e é paga em outro. Enquanto não vence, o dinheiro ainda está na
 * conta — comprometido, não gasto.
 *
 * REGRA DE FECHAMENTO (convenção brasileira): compra feita ATÉ o dia de
 * fechamento entra na fatura que fecha naquele mês; depois disso, vai para a
 * seguinte. O vencimento cai no mês do fechamento quando o dia de vencimento é
 * maior que o de fechamento, e no mês seguinte quando é menor ou igual — que é
 * o arranjo mais comum (fecha dia 28, vence dia 5).
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(() => { loadCoreModules(); });
beforeEach(() => { resetFixtures(); });

const HOJE = new Date(2026, 7, 10); // 10/08/2026

function cadastrarCartao(over) {
  const cartao = Object.assign({
    nome: 'Nubank',
    bandeira: 'Mastercard',
    limite: 5000,
    fechamento: 20,
    vencimento: 28,
  }, over || {});
  DADOS.salvarConfig({ cartoes: [cartao] });
  return cartao;
}

function compra(valor, data, over) {
  const t = Object.assign({
    id: UTILS.gerarId(),
    tipo: 'despesa',
    valor,
    categoria: 'compras',
    data,
    descricao: 'Compra',
    banco: '',
    cartao: 'Nubank',
  }, over || {});
  DADOS.salvarTransacao(t);
  return t;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('CARTOES.obter — leitura do cadastro', () => {
  test('encontra o cartão pelo nome', () => {
    cadastrarCartao();
    expect(CARTOES.obter('Nubank').limite).toBe(5000);
  });

  test('nome com espaços ou caixa diferente ainda encontra', () => {
    cadastrarCartao();
    expect(CARTOES.obter('  nubank  ')).not.toBeNull();
  });

  test('cartão inexistente devolve null', () => {
    cadastrarCartao();
    expect(CARTOES.obter('Inexistente')).toBeNull();
  });

  test('formato legado (string) é aceito, sem ciclo', () => {
    // Instalações antigas guardavam só o nome.
    DADOS.salvarConfig({ cartoes: ['Visa'] });
    const c = CARTOES.obter('Visa');
    expect(c).not.toBeNull();
    expect(c.limite).toBeNull();
    expect(c.temCiclo).toBe(false);
  });

  test('cartão com fechamento e vencimento tem ciclo', () => {
    cadastrarCartao();
    expect(CARTOES.obter('Nubank').temCiclo).toBe(true);
  });
});

describe('CARTOES.faturaDaCompra — em qual fatura a compra cai', () => {
  test('compra antes do fechamento entra na fatura deste mês', () => {
    cadastrarCartao(); // fecha 20, vence 28
    const f = CARTOES.faturaDaCompra('Nubank', '2026-08-15');
    expect(f.fechamento).toBe('2026-08-20');
    expect(f.vencimento).toBe('2026-08-28');
  });

  test('compra no próprio dia do fechamento ainda entra nesta fatura', () => {
    cadastrarCartao();
    expect(CARTOES.faturaDaCompra('Nubank', '2026-08-20').fechamento).toBe('2026-08-20');
  });

  test('compra depois do fechamento vai para a fatura seguinte', () => {
    cadastrarCartao();
    const f = CARTOES.faturaDaCompra('Nubank', '2026-08-21');
    expect(f.fechamento).toBe('2026-09-20');
    expect(f.vencimento).toBe('2026-09-28');
  });

  test('vencimento menor que fechamento cai no mês seguinte', () => {
    // Arranjo mais comum do mercado: fecha dia 28, vence dia 5.
    cadastrarCartao({ fechamento: 28, vencimento: 5 });
    const f = CARTOES.faturaDaCompra('Nubank', '2026-08-10');
    expect(f.fechamento).toBe('2026-08-28');
    expect(f.vencimento).toBe('2026-09-05');
  });

  test('fechamento dia 31 respeita meses curtos', () => {
    // Fevereiro não tem 31; a fatura fecha no último dia disponível.
    cadastrarCartao({ fechamento: 31, vencimento: 10 });
    expect(CARTOES.faturaDaCompra('Nubank', '2026-02-05').fechamento).toBe('2026-02-28');
  });

  test('atravessa a virada de ano', () => {
    cadastrarCartao({ fechamento: 20, vencimento: 28 });
    const f = CARTOES.faturaDaCompra('Nubank', '2026-12-25');
    expect(f.fechamento).toBe('2027-01-20');
    expect(f.vencimento).toBe('2027-01-28');
  });

  test('a competência identifica a fatura de forma estável', () => {
    cadastrarCartao();
    expect(CARTOES.faturaDaCompra('Nubank', '2026-08-15').competencia).toBe('2026-08');
    expect(CARTOES.faturaDaCompra('Nubank', '2026-08-21').competencia).toBe('2026-09');
  });

  test('cartão sem ciclo devolve null em vez de inventar datas', () => {
    DADOS.salvarConfig({ cartoes: ['Visa'] });
    expect(CARTOES.faturaDaCompra('Visa', '2026-08-15')).toBeNull();
  });

  test('cartão inexistente devolve null', () => {
    cadastrarCartao();
    expect(CARTOES.faturaDaCompra('Outro', '2026-08-15')).toBeNull();
  });
});

describe('CARTOES.fatura — o total de uma fatura', () => {
  test('soma as compras da competência', () => {
    cadastrarCartao();
    compra(100, '2026-08-05');
    compra(250, '2026-08-15');
    compra(999, '2026-08-25'); // já é da fatura de setembro

    const f = CARTOES.fatura('Nubank', '2026-08');
    expect(f.total).toBe(350);
    expect(f.transacoes).toHaveLength(2);
  });

  test('soma exata em centavos', () => {
    cadastrarCartao();
    for (let i = 0; i < 1000; i++) compra(0.1, '2026-08-05');
    expect(CARTOES.fatura('Nubank', '2026-08').total).toBe(100);
  });

  test('compras de outro cartão não entram', () => {
    DADOS.salvarConfig({ cartoes: [
      { nome: 'Nubank', limite: 5000, fechamento: 20, vencimento: 28 },
      { nome: 'Inter', limite: 2000, fechamento: 20, vencimento: 28 },
    ] });
    compra(100, '2026-08-05');
    compra(500, '2026-08-05', { cartao: 'Inter' });

    expect(CARTOES.fatura('Nubank', '2026-08').total).toBe(100);
    expect(CARTOES.fatura('Inter', '2026-08').total).toBe(500);
  });

  test('receita lançada no cartão não entra na fatura', () => {
    cadastrarCartao();
    compra(100, '2026-08-05');
    compra(300, '2026-08-06', { tipo: 'receita', categoria: 'reembolsos' });

    expect(CARTOES.fatura('Nubank', '2026-08').total).toBe(100);
  });

  test('transferência lançada no cartão não entra na fatura', () => {
    cadastrarCartao();
    compra(100, '2026-08-05');
    compra(900, '2026-08-06', { tipo: 'transferencia', contaDestino: 'X' });

    expect(CARTOES.fatura('Nubank', '2026-08').total).toBe(100);
  });

  test('fatura sem compras devolve zero, não null', () => {
    cadastrarCartao();
    const f = CARTOES.fatura('Nubank', '2026-08');
    expect(f.total).toBe(0);
    expect(f.transacoes).toEqual([]);
  });

  test('a fatura informa suas próprias datas', () => {
    cadastrarCartao();
    const f = CARTOES.fatura('Nubank', '2026-08');
    expect(f.fechamento).toBe('2026-08-20');
    expect(f.vencimento).toBe('2026-08-28');
  });
});

describe('CARTOES.resumo — limite, utilizado e disponível', () => {
  test('utilizado soma as faturas ainda não vencidas', () => {
    cadastrarCartao(); // fecha 20, vence 28
    compra(1000, '2026-08-05'); // fatura de agosto, vence 28/08 — em aberto
    compra(500, '2026-08-25');  // fatura de setembro — em aberto

    const r = CARTOES.resumo('Nubank', HOJE);
    expect(r.utilizado).toBe(1500);
    expect(r.disponivel).toBe(3500);
  });

  test('fatura já vencida é considerada paga e devolve limite', () => {
    // O app ainda não registra pagamento de fatura. Assumir que o que já
    // venceu foi pago é a hipótese menos enganosa: o contrário mostraria o
    // limite preso para sempre.
    cadastrarCartao();
    compra(1000, '2026-06-05'); // venceu em 28/06, antes de HOJE

    expect(CARTOES.resumo('Nubank', HOJE).utilizado).toBe(0);
  });

  test('percentual de uso é arredondado para inteiro', () => {
    cadastrarCartao();
    compra(2500, '2026-08-05');
    expect(CARTOES.resumo('Nubank', HOJE).percentualUso).toBe(50);
  });

  test('estouro de limite é sinalizado, não escondido', () => {
    cadastrarCartao({ limite: 1000 });
    compra(1200, '2026-08-05');

    const r = CARTOES.resumo('Nubank', HOJE);
    expect(r.disponivel).toBe(0);
    expect(r.estourado).toBe(true);
  });

  test('cartão sem limite não inventa disponível', () => {
    DADOS.salvarConfig({ cartoes: [{ nome: 'Nubank', fechamento: 20, vencimento: 28 }] });
    compra(1000, '2026-08-05');

    const r = CARTOES.resumo('Nubank', HOJE);
    expect(r.limite).toBeNull();
    expect(r.disponivel).toBeNull();
    expect(r.utilizado).toBe(1000);
  });

  test('a fatura atual e a próxima vêm separadas', () => {
    cadastrarCartao();
    compra(1000, '2026-08-05'); // agosto
    compra(400, '2026-08-25');  // setembro

    const r = CARTOES.resumo('Nubank', HOJE);
    expect(r.faturaAtual.total).toBe(1000);
    expect(r.faturaAtual.competencia).toBe('2026-08');
    expect(r.proximaFatura.total).toBe(400);
    expect(r.proximaFatura.competencia).toBe('2026-09');
  });

  test('cartão sem ciclo ainda reporta o limite', () => {
    DADOS.salvarConfig({ cartoes: [{ nome: 'Visa', limite: 3000 }] });
    compra(500, '2026-08-05', { cartao: 'Visa' });

    const r = CARTOES.resumo('Visa', HOJE);
    expect(r.temCiclo).toBe(false);
    expect(r.limite).toBe(3000);
    expect(r.faturaAtual).toBeNull();
  });

  test('cartão inexistente devolve null', () => {
    cadastrarCartao();
    expect(CARTOES.resumo('Outro', HOJE)).toBeNull();
  });
});

describe('CARTOES.listarResumos', () => {
  test('devolve um resumo por cartão cadastrado', () => {
    DADOS.salvarConfig({ cartoes: [
      { nome: 'Nubank', limite: 5000, fechamento: 20, vencimento: 28 },
      { nome: 'Inter', limite: 2000, fechamento: 10, vencimento: 20 },
    ] });
    expect(CARTOES.listarResumos(HOJE)).toHaveLength(2);
  });

  test('ordena pelo mais comprometido primeiro', () => {
    DADOS.salvarConfig({ cartoes: [
      { nome: 'Pouco', limite: 5000, fechamento: 20, vencimento: 28 },
      { nome: 'Muito', limite: 5000, fechamento: 20, vencimento: 28 },
    ] });
    compra(100, '2026-08-05', { cartao: 'Pouco' });
    compra(4000, '2026-08-05', { cartao: 'Muito' });

    expect(CARTOES.listarResumos(HOJE).map((r) => r.nome)).toEqual(['Muito', 'Pouco']);
  });

  test('sem cartões devolve lista vazia', () => {
    expect(CARTOES.listarResumos(HOJE)).toEqual([]);
  });
});
