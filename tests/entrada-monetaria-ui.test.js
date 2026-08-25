/**
 * entrada-monetaria-ui.test.js — máscara e preview devem tratar 6000 como R$ 6.000,00
 */
/**
 * @jest-environment jsdom
 */
const { loadCoreModules } = require('./load-sources');

beforeAll(function() { loadCoreModules(); });

describe('UTILS.parseMoeda — formatos comuns da auditoria', function() {
  test.each([
    ['6000', 6000],
    ['6.000', 6000],
    ['6000,00', 6000],
    ['6.000,00', 6000],
    ['R$ 6.000,00', 6000],
    ['0', 0],
    ['0,01', 0.01],
    ['8.000', 8000],
  ])('%s → %s', function(entrada, esperado) {
    expect(global.UTILS.parseMoeda(entrada)).toBeCloseTo(esperado, 2);
  });

  test('entradas inválidas → 0 (tolerante)', function() {
    expect(global.UTILS.parseMoeda('abc')).toBe(0);
    expect(global.UTILS.parseMoeda('')).toBe(0);
  });
});

describe('UTILS.bindCampoMoeda — preview e blur', function() {
  beforeEach(function() {
    document.body.innerHTML =
      '<input id="v" type="text" />' +
      '<p id="prev" hidden></p>';
  });

  test('6000 mostra prévia de R$ 6.000,00 e não R$ 60,00', function() {
    var input = document.getElementById('v');
    global.UTILS.bindCampoMoeda(input, { previewId: 'prev' });
    input.value = '6000';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    var prev = document.getElementById('prev');
    expect(prev.hidden).toBe(false);
    expect(prev.textContent).toMatch(/6\.000,00/);
    expect(prev.textContent).not.toMatch(/^Você está salvando R\$\s*60,00$/);

    input.dispatchEvent(new Event('blur', { bubbles: true }));
    expect(global.UTILS.parseMoeda(input.value)).toBe(6000);
  });

  test('R$ 6.000,00 e 6.000,00 produzem o mesmo valor', function() {
    var input = document.getElementById('v');
    global.UTILS.bindCampoMoeda(input, { previewId: 'prev' });

    input.value = 'R$ 6.000,00';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    var a = global.UTILS.parseMoeda(input.value);

    input.value = '6.000,00';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    var b = global.UTILS.parseMoeda(input.value);

    expect(a).toBe(6000);
    expect(b).toBe(6000);
  });

  test('zero é valor válido na prévia', function() {
    var input = document.getElementById('v');
    global.UTILS.bindCampoMoeda(input, { previewId: 'prev' });
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.getElementById('prev').textContent).toMatch(/0,00/);
  });
});

describe('limite de cartão — parseMoeda e não parseFloat', function() {
  test('8.000 não vira 8', function() {
    expect(parseFloat('8.000')).toBe(8); // o bug antigo
    expect(global.UTILS.parseMoeda('8.000')).toBe(8000);
  });
});
