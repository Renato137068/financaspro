/**
 * contas-pagar-real.test.js — exercita js/contas-pagar.js REAL.
 *
 * Substitui `contas-pagar.test.js`, que recalculava a aritmética de vencimento
 * inline. Este módulo decide o que o usuário vê como "vencida" e, ao marcar
 * pago, cria uma despesa de verdade no extrato — errar aqui mexe no saldo.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

const CP = () => global.CONTAS_PAGAR;

/** Data ISO deslocada em dias a partir de hoje. */
function emDias(dias) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

beforeEach(function() {
  resetFixtures();
});

describe('CONTAS_PAGAR — criação', function() {
  test('cria conta com os campos esperados', function() {
    const c = CP().criar({ descricao: 'Luz', valor: '180,00', vencimento: emDias(5), categoria: 'moradia' });

    expect(c.id).toEqual(expect.any(String));
    expect(c.descricao).toBe('Luz');
    expect(c.valor).toBe(180);
    expect(c.status).toBe('pendente');
    expect(c.categoria).toBe('moradia');
  });

  test('aplica trim na descrição', function() {
    expect(CP().criar({ descricao: '  Água  ', valor: 90, vencimento: emDias(3) }).descricao).toBe('Água');
  });

  test('recusa descrição vazia', function() {
    expect(() => CP().criar({ descricao: '', valor: 10, vencimento: emDias(1) })).toThrow(/descrição/i);
    expect(() => CP().criar({ descricao: '   ', valor: 10, vencimento: emDias(1) })).toThrow(/descrição/i);
  });

  test('recusa valor zero ou negativo — conta sem valor não é conta', function() {
    expect(() => CP().criar({ descricao: 'X', valor: 0, vencimento: emDias(1) })).toThrow(/inválido/i);
    expect(() => CP().criar({ descricao: 'X', valor: -5, vencimento: emDias(1) })).toThrow(/inválido/i);
  });

  test('recusa vencimento ausente', function() {
    expect(() => CP().criar({ descricao: 'X', valor: 10 })).toThrow(/vencimento/i);
  });

  test('categoria omitida cai em "outro"', function() {
    expect(CP().criar({ descricao: 'X', valor: 10, vencimento: emDias(1) }).categoria).toBe('outro');
  });
});

describe('CONTAS_PAGAR — situação por vencimento', function() {
  test('vencida quando a data já passou', function() {
    const c = CP().criar({ descricao: 'Atrasada', valor: 50, vencimento: emDias(-2) });
    expect(CP().situacao(c)).toBe('vencida');
  });

  test('hoje quando vence hoje', function() {
    const c = CP().criar({ descricao: 'Hoje', valor: 50, vencimento: emDias(0) });
    expect(CP().situacao(c)).toBe('hoje');
  });

  test('próxima até três dias', function() {
    [1, 2, 3].forEach(function(d) {
      const c = CP().criar({ descricao: 'D' + d, valor: 50, vencimento: emDias(d) });
      expect(CP().situacao(c)).toBe('proxima');
    });
  });

  test('ok a partir do quarto dia', function() {
    const c = CP().criar({ descricao: 'Longe', valor: 50, vencimento: emDias(10) });
    expect(CP().situacao(c)).toBe('ok');
  });

  test('conta paga nunca é reportada como vencida', function() {
    // Mesmo com data no passado: já foi paga, não cabe alarme.
    const c = CP().criar({ descricao: 'Paga', valor: 50, vencimento: emDias(-30) });
    CP().marcarPago(c.id, false);

    expect(CP().situacao(CP().obter(c.id))).toBe('pago');
  });

  test('diasAteVencimento é positivo no futuro e negativo no passado', function() {
    expect(CP().diasAteVencimento(emDias(5))).toBeGreaterThan(0);
    expect(CP().diasAteVencimento(emDias(-5))).toBeLessThan(0);
    expect(CP().diasAteVencimento(emDias(0))).toBe(0);
  });
});

describe('CONTAS_PAGAR — pagamento', function() {
  test('conta comum vira paga e sai das pendentes', function() {
    const c = CP().criar({ descricao: 'Internet', valor: 100, vencimento: emDias(2) });
    const out = CP().marcarPago(c.id, false);

    expect(out.status).toBe('pago');
    expect(out.pagoEm).toEqual(expect.any(String));
    expect(CP().listarPendentes()).toHaveLength(0);
  });

  test('conta recorrente volta a pendente com vencimento no mês seguinte', function() {
    // É o comportamento que diferencia "conta do mês" de "conta avulsa":
    // pagar o aluguel não faz o aluguel deixar de existir.
    const c = CP().criar({ descricao: 'Aluguel', valor: 1500, vencimento: '2026-03-10', recorrente: true });
    const out = CP().marcarPago(c.id, false);

    expect(out.status).toBe('pendente');
    expect(out.vencimento).toBe('2026-04-10');
    expect(out.ultimoPagamento).toEqual(expect.any(String));
    expect(CP().listarPendentes()).toHaveLength(1);
  });

  test('pagar com registro cria a despesa no extrato', function() {
    const antes = global.DADOS.getTransacoes().length;
    const c = CP().criar({ descricao: 'Água', valor: 90, vencimento: emDias(1), categoria: 'moradia' });

    CP().marcarPago(c.id, true);

    const txs = global.DADOS.getTransacoes();
    expect(txs.length).toBe(antes + 1);
    expect(txs[txs.length - 1]).toMatchObject({ valor: 90, categoria: 'moradia' });
  });

  test('pagar sem registro não mexe no extrato', function() {
    const antes = global.DADOS.getTransacoes().length;
    const c = CP().criar({ descricao: 'Água', valor: 90, vencimento: emDias(1) });

    CP().marcarPago(c.id, false);

    expect(global.DADOS.getTransacoes().length).toBe(antes);
  });

  test('conta inexistente lança em vez de falhar em silêncio', function() {
    expect(() => CP().marcarPago('fantasma', false)).toThrow(/não encontrada/i);
  });

  test('virada de ano: dezembro avança para janeiro seguinte', function() {
    const c = CP().criar({ descricao: 'Aluguel', valor: 1000, vencimento: '2026-12-05', recorrente: true });
    expect(CP().marcarPago(c.id, false).vencimento).toBe('2027-01-05');
  });
});

describe('CONTAS_PAGAR — listagem e resumo', function() {
  test('listarNoMes filtra pelo mês do vencimento', function() {
    CP().criar({ descricao: 'A', valor: 10, vencimento: '2026-05-10' });
    CP().criar({ descricao: 'B', valor: 20, vencimento: '2026-06-10' });

    const maio = CP().listarNoMes(5, 2026);
    expect(maio).toHaveLength(1);
    expect(maio[0].descricao).toBe('A');
  });

  test('listarNoMes aceita mês de um dígito', function() {
    CP().criar({ descricao: 'A', valor: 10, vencimento: '2026-03-01' });
    expect(CP().listarNoMes(3, 2026)).toHaveLength(1);
  });

  test('listarPendentes ignora as pagas', function() {
    const a = CP().criar({ descricao: 'A', valor: 10, vencimento: emDias(1) });
    CP().criar({ descricao: 'B', valor: 20, vencimento: emDias(2) });
    CP().marcarPago(a.id, false);

    expect(CP().listarPendentes()).toHaveLength(1);
  });

  test('resumo soma pendentes e vencidas separadamente', function() {
    CP().criar({ descricao: 'Vencida', valor: 100, vencimento: emDias(-5) });
    CP().criar({ descricao: 'Futura', valor: 50, vencimento: emDias(5) });

    const r = CP().resumo();
    expect(r.pendentes).toBe(2);
    expect(r.vencidas).toBe(1);
    expect(r.totalVencidas).toBe(100);
  });

  test('resumo sem contas devolve zeros', function() {
    const r = CP().resumo();
    expect(r).toMatchObject({ pendentes: 0, vencidas: 0, totalMes: 0, totalVencidas: 0 });
  });

  test('totalMes soma em centavos, sem drift de float', function() {
    // 33,33 + 33,33 + 33,34 em float estoura 100 por uma dízima; em centavos
    // fecha exatamente 100,00 — que é o número que a KPI "Total do mês" mostra.
    CP().criar({ descricao: 'A', valor: 33.33, vencimento: emDias(0) });
    CP().criar({ descricao: 'B', valor: 33.33, vencimento: emDias(0) });
    CP().criar({ descricao: 'C', valor: 33.34, vencimento: emDias(0) });
    expect(CP().resumo().totalMes).toBe(100);
  });

  test('totalVencidas soma em centavos o valor das contas vencidas', function() {
    CP().criar({ descricao: 'V1', valor: 19.99, vencimento: emDias(-3) });
    CP().criar({ descricao: 'V2', valor: 0.01, vencimento: emDias(-1) });
    CP().criar({ descricao: 'Futura', valor: 500, vencimento: emDias(10) });

    const r = CP().resumo();
    expect(r.vencidas).toBe(2);
    expect(r.totalVencidas).toBe(20); // 19,99 + 0,01, exato
  });
});

describe('CONTAS_PAGAR — edição', function() {
  test('atualiza campos preservando id, status e criadoEm', function() {
    const c = CP().criar({ descricao: 'Luz', valor: 100, vencimento: emDias(3), categoria: 'moradia' });
    const antes = CP().obter(c.id);

    const r = CP().editar(c.id, { descricao: 'Energia', valor: '150,50', vencimento: emDias(5), categoria: 'servicos_financeiros', recorrente: true });

    expect(r.id).toBe(c.id);
    expect(r.descricao).toBe('Energia');
    expect(r.valor).toBe(150.5);
    expect(r.categoria).toBe('servicos_financeiros');
    expect(r.recorrente).toBe(true);
    expect(r.status).toBe('pendente');
    expect(r.criadoEm).toBe(antes.criadoEm);
  });

  test('categoria omitida mantém a atual', function() {
    const c = CP().criar({ descricao: 'X', valor: 10, vencimento: emDias(1), categoria: 'saude' });
    const r = CP().editar(c.id, { descricao: 'X', valor: 20, vencimento: emDias(1) });
    expect(r.categoria).toBe('saude');
  });

  test('id inexistente lança e não altera nada', function() {
    expect(function() { CP().editar('fantasma', { descricao: 'Z', valor: 10, vencimento: emDias(1) }); })
      .toThrow('não encontrada');
    expect(CP().listar()).toHaveLength(0);
  });

  test('recusa descrição vazia, valor inválido e vencimento ausente', function() {
    const c = CP().criar({ descricao: 'Base', valor: 10, vencimento: emDias(1) });
    expect(function() { CP().editar(c.id, { descricao: ' ', valor: 10, vencimento: emDias(1) }); }).toThrow(/descrição/i);
    expect(function() { CP().editar(c.id, { descricao: 'Ok', valor: 0, vencimento: emDias(1) }); }).toThrow(/inválido/i);
    expect(function() { CP().editar(c.id, { descricao: 'Ok', valor: 10, vencimento: '' }); }).toThrow(/vencimento/i);
    // registro original intacto
    expect(CP().obter(c.id).descricao).toBe('Base');
  });
});

describe('CONTAS_PAGAR — exclusão', function() {
  test('remove apenas a conta indicada', function() {
    const a = CP().criar({ descricao: 'A', valor: 10, vencimento: emDias(1) });
    CP().criar({ descricao: 'B', valor: 20, vencimento: emDias(2) });

    CP().excluir(a.id);

    const restantes = CP().listar();
    expect(restantes).toHaveLength(1);
    expect(restantes[0].descricao).toBe('B');
  });

  test('excluir id inexistente não altera nada', function() {
    CP().criar({ descricao: 'A', valor: 10, vencimento: emDias(1) });
    CP().excluir('fantasma');
    expect(CP().listar()).toHaveLength(1);
  });

  test('obter devolve null para id inexistente', function() {
    expect(CP().obter('fantasma')).toBeFalsy();
  });
});
