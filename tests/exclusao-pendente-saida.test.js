/**
 * Excluir um lançamento e fechar o app nos 5 s do "Desfazer" cancelava a
 * exclusão: ela só era efetivada pelo timer, e o item "apagado" voltava na
 * próxima abertura. Ao sair de cena (app para o fundo ou página fechando), o
 * que está pendente precisa ser efetivado.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();
const domDescribe = global.__vmHasDocument ? describe : describe.skip;

function esconderPagina() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: function() { return 'hidden'; } });
  document.dispatchEvent(new Event('visibilitychange'));
  delete document.visibilityState;
}

domDescribe('UTILS.agendarExclusao ao sair do app', function() {
  beforeEach(function() {
    resetFixtures();
    document.body.innerHTML = '';
    jest.useFakeTimers();
  });
  afterEach(function() {
    jest.useRealTimers();
  });

  test('app indo para o fundo efetiva a exclusão pendente uma vez só', function() {
    var efetivacoes = 0;
    global.UTILS.agendarExclusao('tx-saida', function() { efetivacoes++; });
    esconderPagina();
    expect(efetivacoes).toBe(1);
    expect(global.UTILS._exclusoesPendentes['tx-saida']).toBeUndefined();
    jest.advanceTimersByTime(6000);
    expect(efetivacoes).toBe(1);
  });

  test('pagehide também efetiva', function() {
    var efetivou = false;
    global.UTILS.agendarExclusao('tx-pagehide', function() { efetivou = true; });
    window.dispatchEvent(new Event('pagehide'));
    expect(efetivou).toBe(true);
  });

  test('o que foi desfeito não é efetivado ao sair', function() {
    var efetivou = false;
    global.UTILS.agendarExclusao('tx-desfeita', function() { efetivou = true; });
    document.querySelector('.toast-acao-btn').click();
    esconderPagina();
    jest.advanceTimersByTime(6000);
    expect(efetivou).toBe(false);
  });

  test('voltar a ficar visível não efetiva nada', function() {
    var efetivou = false;
    global.UTILS.agendarExclusao('tx-visivel', function() { efetivou = true; });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(efetivou).toBe(false);
    jest.advanceTimersByTime(6000);
    expect(efetivou).toBe(true);
  });

  test('reagendar a mesma chave efetiva só a última', function() {
    var chamadas = [];
    global.UTILS.agendarExclusao('tx-dupla', function() { chamadas.push('primeira'); });
    global.UTILS.agendarExclusao('tx-dupla', function() { chamadas.push('segunda'); });
    expect(global.UTILS.efetivarExclusoesPendentes()).toBe(1);
    expect(chamadas).toEqual(['segunda']);
  });
});
