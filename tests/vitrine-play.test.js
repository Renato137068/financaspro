/**
 * vitrine-play.test.js — capturas da loja dentro das regras da Play.
 *
 * As legendas vão gravadas nas imagens (scripts/gerar-vitrine-play.cjs). A
 * política de metadados proíbe nos recursos gráficos chamadas para ação,
 * promoções e superlativos; e a loja só aceita a imagem certa se cada uma
 * existir no tamanho certo. Os dados de exemplo precisam usar o formato que o
 * app grava — com o formato antigo, as capturas esconderam um alerta de
 * orçamento que nunca disparava.
 */
const fs = require('fs');
const path = require('path');
const { CAPTURAS } = require('../scripts/gerar-vitrine-play.cjs');
const { dadosDaVitrine } = require('../scripts/lib/vitrine-dados.cjs');

const root = path.join(__dirname, '..');
const PROIBIDO = /gr[áa]tis|baixe|instale|agora|melhor|#\s?1|n[ºo°]\s?1|promo|desconto|oferta|sem an[úu]ncios|top\b/i;

describe('Vitrine da Play', function() {
  test('oito capturas, numeradas na ordem da loja', function() {
    expect(CAPTURAS).toHaveLength(8);
    CAPTURAS.forEach(function(c, i) {
      expect(c.arquivo.slice(0, 2)).toBe(String(i + 1).padStart(2, '0'));
    });
  });

  test('legendas curtas e sem termo que a política proíbe nas imagens', function() {
    CAPTURAS.forEach(function(c) {
      expect(c.legenda.length).toBeLessThanOrEqual(40);
      expect(c.apoio.length).toBeLessThanOrEqual(52);
      expect(c.legenda + ' ' + c.apoio).not.toMatch(PROIBIDO);
    });
  });

  test('recurso Pro é dito na própria captura', function() {
    CAPTURAS.filter(function(c) { return c.pro; }).forEach(function(c) {
      expect(c.apoio).toMatch(/\bPro\b/);
    });
  });

  test('as imagens geradas estão no repositório, nos tamanhos da loja', function() {
    function tamanhoPng(arquivo) {
      const b = fs.readFileSync(arquivo);
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }
    const dir = path.join(root, 'docs/play-store/vitrine');
    CAPTURAS.forEach(function(c) {
      expect(tamanhoPng(path.join(dir, c.arquivo + '.png'))).toEqual({ w: 1080, h: 1920 });
    });
    expect(tamanhoPng(path.join(dir, 'destaque-1024x500.png'))).toEqual({ w: 1024, h: 500 });
  });

  test('dados de exemplo no formato que o app grava', function() {
    const dados = dadosDaVitrine(new Date(2026, 9, 24));
    const config = JSON.parse(dados['fp-config']);
    Object.keys(config.orcamentos).forEach(function(cat) {
      expect(typeof config.orcamentos[cat].limite).toBe('number');
    });
    const tx = JSON.parse(dados['fp-transacoes']);
    expect(tx.some(function(t) { return /\(\d+\/\d+\)$/.test(t.descricao) && t.cartao; })).toBe(true);
    // Nenhum mês do exemplo fica vazio: o mês da captura tem receita e despesa.
    const doMes = tx.filter(function(t) { return t.data.slice(0, 7) === '2026-10'; });
    expect(doMes.some(function(t) { return t.tipo === 'receita'; })).toBe(true);
    expect(doMes.some(function(t) { return t.tipo === 'despesa'; })).toBe(true);
  });
});
