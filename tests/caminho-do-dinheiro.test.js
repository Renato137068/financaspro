/**
 * caminho-do-dinheiro.test.js — os módulos precisam concordar entre si.
 *
 * Todos os testes deste projeto verificam um módulo por vez. Isso pega erro de
 * cálculo, mas não pega o erro mais caro que apareceu na auditoria: **cada
 * módulo certo sozinho, e errados em conjunto**.
 *
 * Foi assim com o cartão descontando do saldo E entrando no comprometido; com
 * a parcela futura contada pelos dois caminhos; com a projeção de fim de mês
 * somando a mesma despesa duas vezes. Em nenhum desses casos havia um módulo
 * "quebrado" — havia dois módulos com leituras incompatíveis do mesmo dinheiro.
 *
 * Este arquivo monta UM cenário realista e cobra que todo mundo conte a mesma
 * história sobre ele: extrato, orçamento, saldo por conta, comprometido,
 * fatura de cartão, meta e projeção. Depois edita e apaga, exigindo que os
 * números voltem exatamente ao ponto anterior.
 *
 * A invariante que sustenta o app inteiro está no fim do arquivo:
 *
 *     disponível = saldo das contas − tudo que já tem dono
 *
 * Se ela quebrar, o número mais visível da tela está mentindo.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(() => { loadCoreModules(); });
beforeEach(() => {
  resetFixtures();
  ORCAMENTO.init();
  DADOS._modoLocal = true;
});

const HOJE = new Date(2026, 7, 15); // 15/08/2026

/**
 * Cenário de um mês típico de quem usa o app de verdade:
 * salário na conta, mercado no débito, TV parcelada no cartão, conta a pagar
 * em aberto, transferência para a poupança e uma meta em andamento.
 */
function montarCenario() {
  DADOS.salvarConfig({
    renda: 6000,
    saldosIniciais: { Corrente: 2000 },
    cartoes: [{ nome: 'Cartão', limite: 8000, fechamento: 20, vencimento: 28 }],
    contasPagar: [{
      id: 'cp-1', descricao: 'Aluguel', valor: 1800,
      vencimento: '2026-08-25', status: 'pendente',
    }],
    metas: [{
      id: 'meta-1', titulo: 'Reserva', valorAlvo: 12000, valorAtual: 3000,
      prazo: '2027-02-28', criadoEm: new Date(2026, 1, 15).toISOString(),
      concluida: false,
    }],
  });

  ORCAMENTO.definirLimite('alimentacao', 1000);

  // Entradas e saídas em débito, já ocorridas.
  TRANSACOES.criar('receita', 6000, 'salario', '2026-08-01', 'Salário', 'Corrente', '');
  TRANSACOES.criar('despesa', 700, 'alimentacao', '2026-08-05', 'Mercado', 'Corrente', '');

  // TV de R$ 1.200 em 3x no cartão — usa o mesmo caminho do formulário real.
  const parcelas = UTILS.dividirEmParcelas(1200, 3);
  parcelas.forEach((valor, i) => {
    TRANSACOES.criar(
      'despesa', valor, 'compras',
      UTILS.addMesesClamp('2026-08-10', i),
      'TV (' + (i + 1) + '/3)', '', 'Cartão',
    );
  });

  // Dinheiro que só mudou de lugar.
  TRANSACOES.criarTransferencia({
    valor: 500, data: '2026-08-12', origem: 'Corrente', destino: 'Poupança',
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('o mesmo dinheiro, contado uma vez por cada módulo', () => {
  beforeEach(montarCenario);

  test('o resumo do mês não conta cartão como saída da conta nem transferência como gasto', () => {
    const r = TRANSACOES.obterResumoMes(8, 2026);

    expect(r.receitas).toBe(6000);
    // 700 (mercado) + 400 (só a parcela de AGOSTO — as de set e out são de
    // outros meses). A transferência de 500 fica de fora.
    expect(r.despesas).toBe(1100);
  });

  test('o orçamento enxerga o gasto da categoria, inclusive no cartão', () => {
    // Alimentação foi no débito; compras foi no cartão. Os dois consomem
    // orçamento — o limite mede consumo, não fluxo de caixa.
    expect(ORCAMENTO.calcularGastoMes('alimentacao', 8, 2026)).toBe(700);
    expect(ORCAMENTO.calcularGastoMes('compras', 8, 2026)).toBe(400);
  });

  test('o saldo da conta reflete só o que saiu do banco', () => {
    // 2000 inicial + 6000 salário − 700 mercado − 500 transferido = 6800
    // A TV no cartão NÃO sai daqui.
    const contas = CONTAS.saldos({ ate: HOJE });
    expect(contas.find((c) => c.nome === 'Corrente').saldo).toBe(6800);
    expect(contas.find((c) => c.nome === 'Poupança').saldo).toBe(500);
  });

  test('o total das contas não muda por causa da transferência', () => {
    expect(CONTAS.saldoTotal({ ate: HOJE })).toBe(7300);
  });

  test('a fatura do cartão tem só a parcela do ciclo', () => {
    const f = CARTOES.fatura('Cartão', '2026-08');
    expect(f.total).toBe(400);
    expect(f.transacoes).toHaveLength(1);
  });

  test('o comprometido soma cartão e contas a pagar sem repetir a parcela', () => {
    const c = COMPROMISSOS.comprometido(HOJE);

    expect(c.cartoes).toBe(1200);      // as três parcelas ainda por vencer
    expect(c.contasPagar).toBe(1800);  // aluguel em aberto
    expect(c.parcelasFuturas).toBe(0); // já contadas como cartão — nunca duas vezes
    expect(c.total).toBe(3000);
  });

  test('a meta lê o próprio progresso sem interferir no resto', () => {
    const p = METAS.calcularProjecao(DADOS.getConfig().metas[0], HOJE);
    expect(p.restante).toBe(9000);
    expect(p.diasRestantes).toBeGreaterThan(0);
  });

  test('a projeção de fim de mês não conta a parcela futura duas vezes', () => {
    const proj = AI_ENGINE.projetarFimMes(DADOS.getTransacoes(), HOJE);

    // Realizado até 15/08: 700 + 400 = 1100. As parcelas de set e out são de
    // OUTRO mês e não entram na projeção deste.
    expect(proj.despesasRealizadas).toBe(1100);
    expect(proj.despesasFuturasConhecidas).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('a invariante que sustenta a tela', () => {
  beforeEach(montarCenario);

  test('disponível = saldo − comprometido, e o número bate com as partes', () => {
    const d = COMPROMISSOS.disponivel(HOJE);

    expect(d.saldo).toBe(7300);
    expect(d.comprometido).toBe(3000);
    expect(d.valor).toBe(4300);
    expect(d.valor).toBe(d.saldo - d.comprometido);
  });

  test('o comprometido é exatamente a soma das suas fontes', () => {
    const c = COMPROMISSOS.comprometido(HOJE);
    expect(c.total).toBe(
      UTILS.somarMoeda([c.cartoes, c.parcelasFuturas, c.contasPagar]),
    );
  });

  test('nenhuma despesa aparece ao mesmo tempo no saldo e no comprometido', () => {
    // Reconciliação direta: o que já saiu da conta somado ao que ainda vai sair
    // tem de dar o total de despesas registradas, sem sobra nem falta.
    const txs = DADOS.getTransacoes();
    const totalDespesas = UTILS.somarMoeda(
      txs.filter((t) => t.tipo === 'despesa').map((t) => t.valor),
    );

    const saidasDaConta = UTILS.somarMoeda(
      CONTAS.saldos({ ate: HOJE }).map((c) => c.saidas),
    );
    // A transferência conta como saída da conta de origem, mas não é despesa.
    const saidasSemTransferencia = UTILS.somarMoeda([saidasDaConta, -500]);

    const comprometido = COMPROMISSOS.comprometido(HOJE);
    const aindaVaiSair = UTILS.somarMoeda([comprometido.cartoes, comprometido.parcelasFuturas]);

    expect(UTILS.somarMoeda([saidasSemTransferencia, aindaVaiSair])).toBe(totalDespesas);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('editar e apagar devolvem os números ao lugar', () => {
  beforeEach(montarCenario);

  test('editar o valor do mercado propaga para resumo, orçamento e saldo', () => {
    const mercado = DADOS.getTransacoes().find((t) => t.descricao === 'Mercado');
    TRANSACOES.atualizar(mercado.id, { valor: 900 });

    expect(TRANSACOES.obterResumoMes(8, 2026).despesas).toBe(1300);
    expect(ORCAMENTO.calcularGastoMes('alimentacao', 8, 2026)).toBe(900);
    expect(CONTAS.saldos({ ate: HOJE }).find((c) => c.nome === 'Corrente').saldo).toBe(6600);
  });

  test('apagar uma parcela reduz fatura e comprometido na mesma medida', () => {
    const antes = COMPROMISSOS.comprometido(HOJE).cartoes;
    const parcela = DADOS.getTransacoes().find((t) => t.descricao === 'TV (2/3)');

    TRANSACOES.deletar(parcela.id);

    const depois = COMPROMISSOS.comprometido(HOJE).cartoes;
    expect(UTILS.somarMoeda([antes, -depois])).toBe(parcela.valor);
  });

  test('apagar a transferência devolve o dinheiro à conta de origem', () => {
    const transf = DADOS.getTransacoes().find((t) => t.tipo === 'transferencia');
    TRANSACOES.deletar(transf.id);

    const contas = CONTAS.saldos({ ate: HOJE });
    expect(contas.find((c) => c.nome === 'Corrente').saldo).toBe(7300);
    const poupanca = contas.find((c) => c.nome === 'Poupança');
    expect(poupanca === undefined || poupanca.saldo === 0).toBe(true);
    // O total nunca muda: transferência não cria nem destrói dinheiro.
    expect(CONTAS.saldoTotal({ ate: HOJE })).toBe(7300);
  });

  test('apagar tudo do mês zera o mês sem deixar resíduo', () => {
    DADOS.getTransacoes().forEach((t) => TRANSACOES.deletar(t.id));

    const r = TRANSACOES.obterResumoMes(8, 2026);
    expect(r.receitas).toBe(0);
    expect(r.despesas).toBe(0);
    expect(ORCAMENTO.calcularGastoMes('alimentacao', 8, 2026)).toBe(0);
    expect(COMPROMISSOS.comprometido(HOJE).cartoes).toBe(0);
    // O saldo volta ao inicial declarado, não a zero.
    expect(CONTAS.saldoTotal({ ate: HOJE })).toBe(2000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('pagar a fatura atravessa a cadeia inteira', () => {
  beforeEach(montarCenario);

  test('confirmar o pagamento libera limite e aumenta o disponível', () => {
    const antes = COMPROMISSOS.disponivel(HOJE);

    CARTOES.marcarFaturaPaga('Cartão', '2026-08');

    const depois = COMPROMISSOS.disponivel(HOJE);
    // Sai do comprometido exatamente o valor da fatura de agosto.
    expect(UTILS.somarMoeda([antes.comprometido, -depois.comprometido])).toBe(400);
    expect(UTILS.somarMoeda([depois.valor, -antes.valor])).toBe(400);
    // O saldo em conta não muda: o app não sabe de qual conta saiu o pagamento.
    expect(depois.saldo).toBe(antes.saldo);
  });

  test('o limite do cartão volta na mesma medida', () => {
    const antes = CARTOES.resumo('Cartão', HOJE);
    CARTOES.marcarFaturaPaga('Cartão', '2026-08');
    const depois = CARTOES.resumo('Cartão', HOJE);

    expect(UTILS.somarMoeda([depois.disponivel, -antes.disponivel])).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('precisão sobrevive ao cenário inteiro', () => {
  test('mil lançamentos de um centavo atravessam a cadeia sem perder nada', () => {
    DADOS.salvarConfig({ saldosIniciais: { Corrente: 0 } });
    ORCAMENTO.definirLimite('alimentacao', 100);

    for (let i = 0; i < 1000; i++) {
      TRANSACOES.criar('despesa', 0.1, 'alimentacao', '2026-08-05', 'Café', 'Corrente', '');
    }

    expect(TRANSACOES.obterResumoMes(8, 2026).despesas).toBe(100);
    expect(ORCAMENTO.calcularGastoMes('alimentacao', 8, 2026)).toBe(100);
    expect(CONTAS.saldoTotal({ ate: HOJE })).toBe(-100);
    expect(ORCAMENTO.obterStatus('alimentacao', 8, 2026).status).toBe('excedido');
  });

  test('parcelamento com resto fecha o valor original em toda a cadeia', () => {
    DADOS.salvarConfig({
      saldosIniciais: { Corrente: 0 },
      cartoes: [{ nome: 'Cartão', limite: 5000, fechamento: 20, vencimento: 28 }],
    });

    const parcelas = UTILS.dividirEmParcelas(1000, 3);
    parcelas.forEach((valor, i) => {
      TRANSACOES.criar('despesa', valor, 'compras',
        UTILS.addMesesClamp('2026-08-10', i), 'Compra', '', 'Cartão');
    });

    // 333,34 + 333,33 + 333,33 — a soma tem de ser exatamente mil, e o
    // comprometido tem de refletir isso sem arredondar por conta própria.
    expect(UTILS.somarMoeda(parcelas)).toBe(1000);
    expect(COMPROMISSOS.comprometido(HOJE).cartoes).toBe(1000);
    expect(CARTOES.resumo('Cartão', HOJE).utilizado).toBe(1000);
  });
});
