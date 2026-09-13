/**
 * extrato-filtro-valor-br.test.js — auditoria do Extrato (B8 / máscara BR).
 *
 * Os filtros de valor (mín/máx) usavam type=number + parseFloat, que rejeita a
 * vírgula do teclado BR e lê "1.500,00" errado. Agora são type=text/inputmode
 * decimal e a leitura usa UTILS.parseMoeda (BR-aware).
 * @jest-environment jsdom
 */
const INIT_EXTRATO = require('../js/modules/init-extrato.js');

// parseMoeda BR-aware (equivalente ao de utils.js) — não fazemos require do
// utils.js real para não sequestrar a atribuição de cobertura daquele arquivo.
function parseMoedaBR(input) {
  var str = String(input == null ? '' : input).trim().replace(/[R$\s]/gi, '');
  if (!str) return 0;
  var lastComma = str.lastIndexOf(',');
  var lastDot = str.lastIndexOf('.');
  var norm;
  if (lastComma > lastDot) norm = str.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma && lastComma >= 0) norm = str.replace(/,/g, '');
  else if (lastComma >= 0) norm = str.replace(',', '.');
  else norm = str;
  var n = parseFloat(norm);
  return isFinite(n) ? n : 0;
}

global.UTILS = Object.assign(global.UTILS || {}, {
  parseMoeda: parseMoedaBR,
  mostrarToast: function() {}
});

INIT_EXTRATO.filtrarExtrato = function() {}; // evita render pesado

function montar(min, max) {
  document.body.innerHTML =
    '<input id="valor-min" value="' + min + '">' +
    '<input id="valor-max" value="' + max + '">' +
    '<input id="data-inicio" value="">' +
    '<input id="data-fim" value="">';
}

describe('filtro de valor — aceita formato BR', function() {
  test('"1.500,00" e "3.000,50" são lidos como 1500 e 3000.5 (parseFloat daria 1 e 3)', function() {
    montar('1.500,00', '3.000,50');
    INIT_EXTRATO.aplicarBuscaAvancada();
    expect(INIT_EXTRATO.state.buscaAvancada.valorMin).toBe(1500);
    expect(INIT_EXTRATO.state.buscaAvancada.valorMax).toBe(3000.5);
  });

  test('inteiro sem separador continua funcionando', function() {
    montar('1500', '');
    INIT_EXTRATO.aplicarBuscaAvancada();
    expect(INIT_EXTRATO.state.buscaAvancada.valorMin).toBe(1500);
    // vazio → null (sem filtro)
    expect(INIT_EXTRATO.state.buscaAvancada.valorMax).toBeNull();
  });

  test('só espaços → null (sem filtro)', function() {
    montar('   ', '');
    INIT_EXTRATO.aplicarBuscaAvancada();
    expect(INIT_EXTRATO.state.buscaAvancada.valorMin).toBeNull();
    expect(INIT_EXTRATO.state.buscaAvancada.valorMax).toBeNull();
  });
});
