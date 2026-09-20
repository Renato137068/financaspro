/**
 * compromissos-por-mes.test.js — agenda de desembolsos mês a mês.
 *
 * COMPROMISSOS.porMes quebra o comprometido daqui pra frente por mês de saída:
 * faturas de cartão abertas (pelo vencimento), parcelas/despesas futuras fora
 * de cartão (pela data) e contas a pagar pendentes (pelo vencimento). A soma da
 * janela bate com COMPROMISSOS.comprometido. Centavos inteiros.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

const HOJE = new Date(2026, 7, 15); // 15/08/2026

beforeEach(function() {
  resetFixtures();
  global.DADOS._modoLocal = true;
});

function cenario() {
  global.DADOS.salvarConfig({
    saldosIniciais: { Corrente: 5000 },
    cartoes: [{ nome: 'Cartão', limite: 8000, fechamento: 20, vencimento: 28 }],
    contasPagar: [{
      id: 'cp-1', descricao: 'Aluguel', valor: 1800,
      vencimento: '2026-08-25', status: 'pendente',
    }],
  });

  // TV de R$ 1.200 em 3x no cartão: parcelas em ago, set, out (400 cada).
  const parcelas = global.UTILS.dividirEmParcelas(1200, 3);
  parcelas.forEach(function(valor, i) {
    global.TRANSACOES.criar('despesa', valor, 'compras',
      global.UTILS.addMesesClamp('2026-08-10', i), 'TV (' + (i + 1) + '/3)', '', 'Cartão');
  });

  // Um boleto futuro fora de cartão, em setembro.
  global.TRANSACOES.criar('despesa', 300, 'educacao', '2026-09-05', 'Curso', 'Corrente', '');
  // Uma despesa passada fora de cartão (não é compromisso futuro).
  global.TRANSACOES.criar('despesa', 700, 'alimentacao', '2026-08-05', 'Mercado', 'Corrente', '');
}

describe('COMPROMISSOS.porMes', function() {
  test('devolve a janela pedida, começando no mês corrente', function() {
    cenario();
    const r = global.COMPROMISSOS.porMes(3, HOJE);
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ ano: 2026, mes: 8 });
    expect(r[1]).toMatchObject({ ano: 2026, mes: 9 });
    expect(r[2]).toMatchObject({ ano: 2026, mes: 10 });
  });

  test('distribui cartão (pelo vencimento), parcelas e contas por mês', function() {
    cenario();
    const r = global.COMPROMISSOS.porMes(3, HOJE);
    // Agosto: fatura 400 (vence 28/08) + aluguel 1800.
    expect(r[0]).toMatchObject({ cartoes: 400, parcelas: 0, contas: 1800, total: 2200 });
    // Setembro: fatura 400 + curso 300.
    expect(r[1]).toMatchObject({ cartoes: 400, parcelas: 300, contas: 0, total: 700 });
    // Outubro: fatura 400.
    expect(r[2]).toMatchObject({ cartoes: 400, parcelas: 0, contas: 0, total: 400 });
  });

  test('a soma da janela bate com COMPROMISSOS.comprometido', function() {
    cenario();
    const r = global.COMPROMISSOS.porMes(3, HOJE);
    const somaJanela = r.reduce(function(s, m) { return s + m.total; }, 0);
    const comp = global.COMPROMISSOS.comprometido(HOJE).total;
    expect(somaJanela).toBe(comp);
  });

  test('fatura paga sai do mês', function() {
    cenario();
    global.CARTOES.marcarFaturaPaga('Cartão', '2026-08');
    const r = global.COMPROMISSOS.porMes(3, HOJE);
    expect(r[0].cartoes).toBe(0);       // agosto sem a fatura paga
    expect(r[0].total).toBe(1800);      // só o aluguel
  });

  test('não conta a parcela de cartão duas vezes (só via fatura)', function() {
    cenario();
    const r = global.COMPROMISSOS.porMes(3, HOJE);
    // Em outubro só há a fatura do cartão (400) — a parcela não entra também
    // como "parcela futura".
    expect(r[2].parcelas).toBe(0);
    expect(r[2].cartoes).toBe(400);
  });

  test('conta a pagar vencida cai no primeiro mês da janela', function() {
    global.DADOS.salvarConfig({
      contasPagar: [{ id: 'cp-x', descricao: 'Atrasada', valor: 250, vencimento: '2026-07-10', status: 'pendente' }],
    });
    const r = global.COMPROMISSOS.porMes(3, HOJE);
    expect(r[0].contas).toBe(250);
  });

  test('conta além do horizonte da janela é ignorada', function() {
    global.DADOS.salvarConfig({
      contasPagar: [{ id: 'cp-f', descricao: 'Futura', valor: 900, vencimento: '2026-12-10', status: 'pendente' }],
    });
    const r = global.COMPROMISSOS.porMes(3, HOJE); // ago–out
    const soma = r.reduce(function(s, m) { return s + m.contas; }, 0);
    expect(soma).toBe(0);
  });

  test('janela vazia (sem compromissos) devolve meses zerados', function() {
    global.DADOS.salvarConfig({ saldosIniciais: { Corrente: 100 } });
    const r = global.COMPROMISSOS.porMes(2, HOJE);
    expect(r).toHaveLength(2);
    expect(r.every(function(m) { return m.total === 0; })).toBe(true);
  });

  test('default de 3 meses quando o tamanho não é informado', function() {
    cenario();
    expect(global.COMPROMISSOS.porMes(undefined, HOJE)).toHaveLength(3);
  });

  test('vira o ano na janela (nov 2026 → jan 2027)', function() {
    const nov = new Date(2026, 10, 10);
    const r = global.COMPROMISSOS.porMes(3, nov);
    expect(r.map(function(m) { return m.ano + '-' + m.mes; })).toEqual(['2026-11', '2026-12', '2027-1']);
  });
});
