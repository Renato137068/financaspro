/**
 * extrato-subtotal-centavos.test.js — o subtotal do dia soma em centavos.
 *
 * Regressão: _renderGruposHtml somava t.valor em float para o "Saldo do dia".
 * 0,10 × 3 virava 0,30000000000000004. O formatarMoeda stub aqui devolve o
 * número cru (sem toFixed) justamente para expor qualquer deriva.
 * @jest-environment jsdom
 */
const INIT_EXTRATO = require('../js/modules/init-extrato.js');

global.CONFIG = Object.assign(global.CONFIG || {}, { TIPO_RECEITA: 'receita', TIPO_DESPESA: 'despesa' });
global.UTILS = Object.assign(global.UTILS || {}, {
  escapeHtml: function(s) { return String(s).replace(/"/g, '&quot;'); },
  // cru, sem arredondar: deriva de float apareceria no texto.
  formatarMoeda: function(v) { return 'R$ ' + v; }
});

INIT_EXTRATO._renderTransacaoItem = function() { return '<div class="tx"></div>'; };

describe('subtotal do dia — soma em centavos exatos', function() {
  test('três despesas de 0,10 somam exatamente 0,30 (sem deriva)', function() {
    var grupos = { '2026-09-10': [
      { tipo: 'despesa', valor: 0.10, data: '2026-09-10' },
      { tipo: 'despesa', valor: 0.10, data: '2026-09-10' },
      { tipo: 'despesa', valor: 0.10, data: '2026-09-10' }
    ] };
    var out = INIT_EXTRATO._renderGruposHtml(grupos, 0, 10);
    // subtotal = −0,30 → "R$ -0.3", nunca "R$ -0.30000000000000004".
    expect(out.html).toContain('R$ -0.3<');
    expect(out.html).not.toContain('30000000');
  });

  test('receitas e despesas fracionadas se cancelam ao centavo', function() {
    var grupos = { '2026-09-10': [
      { tipo: 'receita', valor: 0.30, data: '2026-09-10' },
      { tipo: 'despesa', valor: 0.10, data: '2026-09-10' },
      { tipo: 'despesa', valor: 0.20, data: '2026-09-10' }
    ] };
    var out = INIT_EXTRATO._renderGruposHtml(grupos, 0, 10);
    expect(out.html).toContain('+R$ 0<'); // 0,30 − 0,30 = 0 exato
  });
});
