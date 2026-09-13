/**
 * extrato-subtotal-parcial.test.js — roadmap/auditoria do Extrato (B5).
 *
 * O subtotal por dia é sempre o do DIA INTEIRO. Quando a rolagem virtual corta
 * o grupo e só parte das linhas aparece, o subtotal deixa de bater com a soma
 * visível — o que parecia "número errado". Agora o grupo cortado ganha a dica
 * "· dia inteiro" e um aria-label explicando "exibindo N de M".
 * @jest-environment jsdom
 */
const INIT_EXTRATO = require('../js/modules/init-extrato.js');

global.CONFIG = Object.assign(global.CONFIG || {}, { TIPO_RECEITA: 'receita', TIPO_DESPESA: 'despesa' });
global.UTILS = Object.assign(global.UTILS || {}, {
  escapeHtml: function(s) { return String(s).replace(/"/g, '&quot;'); },
  formatarMoeda: function(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }
});

// Item de linha é irrelevante para este teste — só precisamos contar quantos
// foram renderizados. Stub leve evita puxar as dependências de render de item.
INIT_EXTRATO._renderTransacaoItem = function() { return '<div class="tx"></div>'; };

function grupoDe(n) {
  var txs = [];
  for (var i = 0; i < n; i++) txs.push({ tipo: 'despesa', valor: 100, categoria: 'lazer', data: '2026-09-10' });
  return { Hoje: txs };
}

describe('subtotal do dia com rolagem virtual', function() {
  test('grupo cortado: subtotal é do dia inteiro + dica "dia inteiro"', function() {
    // 5 lançamentos de R$100 (despesa) → subtotal do dia = −R$500,00.
    var out = INIT_EXTRATO._renderGruposHtml(grupoDe(5), 0, 3); // só 3 de 5 cabem
    expect(out.rendered).toBe(3);
    // Subtotal exibido é o do dia inteiro (−500), não a soma das 3 visíveis (−300).
    expect(out.html).toContain('-500,00');
    expect(out.html).not.toContain('-300,00');
    // Marca de parcial + dica visível + aria-label honesto.
    expect(out.html).toContain('ext-grupo-subtotal--parcial');
    expect(out.html).toContain('· dia inteiro');
    expect(out.html).toMatch(/exibindo 3 de 5 lan/);
  });

  test('grupo inteiro: sem marca de parcial (soma visível = subtotal)', function() {
    var out = INIT_EXTRATO._renderGruposHtml(grupoDe(3), 0, 10);
    expect(out.rendered).toBe(3);
    expect(out.html).toContain('-300,00');
    expect(out.html).not.toContain('ext-grupo-subtotal--parcial');
    expect(out.html).not.toContain('· dia inteiro');
  });
});
