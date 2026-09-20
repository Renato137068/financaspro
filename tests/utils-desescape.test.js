/**
 * utils-desescape.test.js — UTILS.desescapeHtml, inverso de escapeHtml.
 *
 * Descrições de transação são guardadas escapadas; exibi-las/editá-las exige
 * decodificar para não escapar de novo (escape duplo na tela, corrupção ao
 * reeditar). Este helper desfaz exatamente uma camada de escape.
 */
const { loadCoreModules } = require('./load-sources');

loadCoreModules();

const U = () => global.UTILS;

describe('UTILS.desescapeHtml', function() {
  test('reverte cada entidade que escapeHtml produz', function() {
    expect(U().desescapeHtml('&amp;')).toBe('&');
    expect(U().desescapeHtml('&lt;')).toBe('<');
    expect(U().desescapeHtml('&gt;')).toBe('>');
    expect(U().desescapeHtml('&quot;')).toBe('"');
    expect(U().desescapeHtml('&#039;')).toBe("'");
    expect(U().desescapeHtml('&#39;')).toBe("'"); // variante sem zero
  });

  test('é o inverso exato de escapeHtml (round-trip)', function() {
    ['C&A', 'H&M', 'Casa & Vídeo', 'Aspas "x"', "Ap'óstrofo", '<b>tag</b>', 'sem especiais'].forEach(function(s) {
      expect(U().desescapeHtml(U().escapeHtml(s))).toBe(s);
    });
  });

  test('desfaz só UMA camada (não sobre-decodifica)', function() {
    // "C&A" guardado uma vez = "C&amp;A". Decodificar dá "C&A", não mais.
    expect(U().desescapeHtml('C&amp;A')).toBe('C&A');
    // Texto que representa literalmente "&lt;" (duas camadas) só perde uma.
    expect(U().desescapeHtml('&amp;lt;')).toBe('&lt;');
  });

  test('escapeHtml(desescapeHtml(x)) preserva o valor guardado (sem compounding)', function() {
    // O que a edição faz: preencher (desescape) e salvar (escape). Deve voltar
    // ao mesmo valor guardado, não a um mais escapado.
    ['C&amp;A', 'Aluguel', '&lt;script&gt;', 'Cinema &amp; Cia'].forEach(function(guardado) {
      expect(U().escapeHtml(U().desescapeHtml(guardado))).toBe(guardado);
    });
  });

  test('trata null/undefined como string vazia', function() {
    expect(U().desescapeHtml(null)).toBe('');
    expect(U().desescapeHtml(undefined)).toBe('');
  });

  test('não altera texto sem entidades', function() {
    expect(U().desescapeHtml('Mercado Extra 123')).toBe('Mercado Extra 123');
  });
});
