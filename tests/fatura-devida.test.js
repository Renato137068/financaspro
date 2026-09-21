/**
 * fatura-devida.test.js — a outra metade da pergunta honesta.
 *
 * O `naoConfirmadas` deixava responder "sim, paguei" (marcarFaturaPaga), mas
 * não "não, ainda devo". Sem isso, uma fatura vencida e não paga ficava fora do
 * limite e do comprometido — o app subestimava a dívida, o pior erro possível
 * num app de dinheiro.
 *
 * A regra do módulo continua: o app não inventa fatos. A diferença é que agora
 * o fato vem do usuário — ele confirma que ainda deve —, então contar contra o
 * limite deixa de ser suposição. Vencida SEM resposta segue de fora (conservador).
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

beforeEach(function() {
  resetFixtures();
  global.DADOS._modoLocal = true;
});

const HOJE = new Date(2026, 7, 25); // 25/08/2026

function cartaoComVencida() {
  global.DADOS.salvarConfig({
    saldosIniciais: { Corrente: 5000 },
    cartoes: [{ nome: 'Nubank', limite: 5000, fechamento: 20, vencimento: 28 }],
  });
  // Compra em junho: fatura de junho venceu 28/06, bem antes de 25/08.
  global.DADOS.salvarTransacao({
    id: global.UTILS.gerarId(), tipo: 'despesa', valor: 1000, categoria: 'compras',
    data: '2026-06-05', descricao: 'Compra', banco: '', cartao: 'Nubank',
  });
}

describe('CARTOES.confirmarFaturaDevida', function() {
  test('sem confirmação, a fatura vencida fica fora do limite (conservador)', function() {
    cartaoComVencida();
    var r = global.CARTOES.resumo('Nubank', HOJE);
    expect(r.utilizado).toBe(0);
    expect(r.naoConfirmadas).toHaveLength(1);
    expect(r.vencidasDevidas).toEqual([]);
  });

  test('confirmada como devida, passa a consumir o limite', function() {
    cartaoComVencida();
    global.CARTOES.confirmarFaturaDevida('Nubank', '2026-06');

    var r = global.CARTOES.resumo('Nubank', HOJE);
    expect(r.utilizado).toBe(1000);
    expect(r.disponivel).toBe(4000);
    expect(r.devidoVencido).toBe(1000);
  });

  test('sai da lista de "não confirmadas" e entra na de devidas', function() {
    cartaoComVencida();
    global.CARTOES.confirmarFaturaDevida('Nubank', '2026-06');

    var r = global.CARTOES.resumo('Nubank', HOJE);
    expect(r.naoConfirmadas).toEqual([]);
    expect(r.vencidasDevidas).toHaveLength(1);
    expect(r.vencidasDevidas[0]).toMatchObject({ competencia: '2026-06', total: 1000 });
  });

  test('o estado da fatura vira "devida"', function() {
    cartaoComVencida();
    global.CARTOES.confirmarFaturaDevida('Nubank', '2026-06');
    expect(global.CARTOES.fatura('Nubank', '2026-06').status).toBe('devida');
  });

  test('cartão inexistente não grava nada', function() {
    cartaoComVencida();
    expect(global.CARTOES.confirmarFaturaDevida('Fantasma', '2026-06')).toBe(false);
  });

  test('desfazer volta a fatura para "não confirmada" e libera o limite', function() {
    cartaoComVencida();
    global.CARTOES.confirmarFaturaDevida('Nubank', '2026-06');
    global.CARTOES.desmarcarFaturaDevida('Nubank', '2026-06');

    var r = global.CARTOES.resumo('Nubank', HOJE);
    expect(r.utilizado).toBe(0);
    expect(r.naoConfirmadas).toHaveLength(1);
    expect(r.vencidasDevidas).toEqual([]);
  });
});

describe('devo e paga são mutuamente exclusivos', function() {
  test('marcar como paga apaga o "ainda devo"', function() {
    cartaoComVencida();
    global.CARTOES.confirmarFaturaDevida('Nubank', '2026-06');
    global.CARTOES.marcarFaturaPaga('Nubank', '2026-06');

    expect(global.CARTOES.faturaConfirmadaDevida('Nubank', '2026-06')).toBe(false);
    expect(global.CARTOES.faturaEstaPaga('Nubank', '2026-06')).toBe(true);
    expect(global.CARTOES.resumo('Nubank', HOJE).utilizado).toBe(0); // paga sai do limite
  });

  test('confirmar "ainda devo" apaga o registro de paga', function() {
    cartaoComVencida();
    global.CARTOES.marcarFaturaPaga('Nubank', '2026-06');
    global.CARTOES.confirmarFaturaDevida('Nubank', '2026-06');

    expect(global.CARTOES.faturaEstaPaga('Nubank', '2026-06')).toBe(false);
    expect(global.CARTOES.faturaConfirmadaDevida('Nubank', '2026-06')).toBe(true);
    expect(global.CARTOES.resumo('Nubank', HOJE).utilizado).toBe(1000); // devida volta ao limite
  });
});

describe('COMPROMISSOS enxerga a fatura devida', function() {
  test('entra no comprometido de cartões', function() {
    cartaoComVencida();
    expect(global.COMPROMISSOS.comprometido(HOJE).cartoes).toBe(0);

    global.CARTOES.confirmarFaturaDevida('Nubank', '2026-06');
    expect(global.COMPROMISSOS.comprometido(HOJE).cartoes).toBe(1000);
  });

  test('a agenda joga a fatura devida no primeiro mês e a soma bate com o comprometido', function() {
    cartaoComVencida();
    global.CARTOES.confirmarFaturaDevida('Nubank', '2026-06');

    var r = global.COMPROMISSOS.porMes(3, HOJE);
    expect(r[0].cartoes).toBe(1000); // devida agora, no mês corrente

    var somaJanela = r.reduce(function(s, m) { return s + m.total; }, 0);
    expect(somaJanela).toBe(global.COMPROMISSOS.comprometido(HOJE).total);
  });

  test('reduz o disponível na mesma medida', function() {
    cartaoComVencida();
    var antes = global.COMPROMISSOS.disponivel(HOJE);
    global.CARTOES.confirmarFaturaDevida('Nubank', '2026-06');
    var depois = global.COMPROMISSOS.disponivel(HOJE);

    expect(global.UTILS.somarMoeda([antes.valor, -depois.valor])).toBe(1000);
    expect(depois.saldo).toBe(antes.saldo); // o saldo em conta não muda
  });
});
