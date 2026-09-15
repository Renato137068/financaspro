/**
 * cartao-fatura-desmarcar.test.js — a fatura paga tem volta na tela.
 *
 * O backend já sabia desfazer um pagamento (desmarcarFaturaPaga), mas o render
 * só oferecia "Marcar fatura como paga" e escondia qualquer ação depois disso.
 * Um toque por engano prendia o dinheiro fora do limite sem saída pela
 * interface. Aqui se verifica que o estado 'paga' aparece com um "Desmarcar"
 * de verdade, e que ele some quando o pagamento é desfeito.
 *
 * Nota: o status da fatura ('aberta'/'paga'/'nao-confirmada') é calculado
 * contra a data real do sistema, não contra um `hoje` injetável. Por isso a
 * compra é datada em HOJE (real) — assim cai sempre na "fatura atual" — e os
 * casos giram em torno de 'paga', que independe de data (curto-circuito em
 * _statusFatura: fatura confirmada é 'paga' venha o vencimento que vier).
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(() => { loadCoreModules(); });
beforeEach(() => {
  resetFixtures();
  document.body.innerHTML =
    '<div id="secao-cartoes"><span id="cartoes-total"></span>' +
    '<div id="cartoes-lista"></div></div>';
});

function cadastrarCartao() {
  DADOS.salvarConfig({ cartoes: [{
    nome: 'Nubank', bandeira: 'Mastercard', limite: 5000, fechamento: 20, vencimento: 28
  }] });
}

/** Compra datada em HOJE (real): cai sempre na competência da "fatura atual". */
function compraHoje(valor) {
  var hojeIso = UTILS.dataLocalIso();
  DADOS.salvarTransacao({
    id: UTILS.gerarId(), tipo: 'despesa', valor, categoria: 'compras',
    data: hojeIso, descricao: 'Compra', banco: '', cartao: 'Nubank'
  });
  return CARTOES.faturaDaCompra('Nubank', hojeIso).competencia;
}

function html() { return document.getElementById('cartoes-lista').innerHTML; }

describe('render — fatura paga oferece desmarcar', () => {
  test('antes de pagar não há botão desmarcar', () => {
    cadastrarCartao();
    compraHoje(300);
    CARTOES.render();

    expect(html()).not.toContain('data-cartao-acao="desmarcar"');
    expect(html()).not.toContain('Fatura paga');
  });

  test('depois de paga, aparece o selo + botão desmarcar e some o "pagar"', () => {
    cadastrarCartao();
    var comp = compraHoje(300);
    CARTOES.marcarFaturaPaga('Nubank', comp);
    CARTOES.render();

    expect(html()).toContain('Fatura paga');
    expect(html()).toContain('data-cartao-acao="desmarcar"');
    expect(html()).toContain('data-competencia="' + comp + '"');
    expect(html()).not.toContain('data-cartao-acao="pagar"');
  });

  test('o botão desmarcar carrega o cartão e a competência corretos', () => {
    cadastrarCartao();
    var comp = compraHoje(300);
    CARTOES.marcarFaturaPaga('Nubank', comp);
    CARTOES.render();

    var btn = document.querySelector('[data-cartao-acao="desmarcar"]');
    expect(btn).not.toBeNull();
    expect(btn.dataset.cartao.toLowerCase()).toContain('nubank');
    expect(btn.dataset.competencia).toBe(comp);
  });

  test('desmarcar remove o selo e o botão desmarcar do render', () => {
    cadastrarCartao();
    var comp = compraHoje(300);
    CARTOES.marcarFaturaPaga('Nubank', comp);
    CARTOES.desmarcarFaturaPaga('Nubank', comp);
    CARTOES.render();

    expect(html()).not.toContain('data-cartao-acao="desmarcar"');
    expect(html()).not.toContain('Fatura paga');
  });
});
