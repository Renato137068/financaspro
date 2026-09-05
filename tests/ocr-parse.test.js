/**
 * ocr-parse.test.js — parsing heurístico de comprovantes (js/ocr.js).
 * Não exercita Tesseract/câmera; foca em _parseComprovante (regex BR).
 */
const OCR = require('../js/ocr.js');

global.UTILS = {
  dataLocalIso: function(d) {
    if (!d || typeof d.getTime !== 'function' || isNaN(d.getTime())) return '';
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  },
};

describe('OCR._parseComprovante', function() {
  test('texto curto ou vazio retorna objeto vazio', function() {
    expect(OCR._parseComprovante('')).toEqual({});
    expect(OCR._parseComprovante('abc')).toEqual({});
  });

  test('extrai valor total em formato BR', function() {
    var txt = 'SUPERMERCADO XYZ\nTotal: R$ 127,45\nData: 10/08/2026';
    var r = OCR._parseComprovante(txt);
    expect(r.valor).toBeCloseTo(127.45, 2);
    expect(r.descricao).toMatch(/SUPERMERCADO/i);
    // OCR usa new Date('YYYY-MM-DD') (UTC) → dataLocalIso local; espelha o parser.
    expect(r.data).toBe(UTILS.dataLocalIso(new Date('2026-08-10')));
  });

  test('detecta banco e pix', function() {
    var txt = 'Nubank\nPix enviado\nValor pago 55,90\n02/09/2026';
    var r = OCR._parseComprovante(txt);
    expect(r.banco).toMatch(/nubank/);
    expect(r.cartao).toBe('pix');
    expect(r.valor).toBeCloseTo(55.9, 2);
  });

  test('detecta crédito e débito', function() {
    expect(OCR._parseComprovante('Compra crédito 10,00').cartao).toBe('crédito');
    expect(OCR._parseComprovante('Pagamento débito 10,00').cartao).toBe('débito');
  });

  test('ignora valor acima de 100k', function() {
    // Formato sem separador de milhar — evita falso positivo do regex curto.
    var txt = 'VALOR PAGO 150000,00\nLoja Teste';
    var r = OCR._parseComprovante(txt);
    expect(r.valor).toBeNull();
  });

  test('aceita data ISO', function() {
    var r = OCR._parseComprovante('Loja ABC\n2026-09-02\n15,00');
    expect(r.data).toBe(UTILS.dataLocalIso(new Date('2026-09-02')));
    expect(r.valor).toBeCloseTo(15, 2);
  });
});

describe('OCR — contrato de módulo', function() {
  test('exporta API principal', function() {
    expect(typeof OCR.init).toBe('function');
    expect(typeof OCR.processarImagem).toBe('function');
    expect(typeof OCR._parseComprovante).toBe('function');
  });
});
