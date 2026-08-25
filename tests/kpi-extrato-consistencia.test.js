/**
 * kpi-extrato-consistencia.test.js — KPIs do mês = soma do extrato (centavos)
 *
 * Regressão da auditoria: R$ 6.300,00 / R$ 1.800,00 não podem virar
 * 6.297,65 / 1.799,33 no card após reload.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(function() { loadCoreModules(); });
beforeEach(function() { resetFixtures(); });

describe('KPIs vs extrato — mesma fonte', function() {
  test('receitas/despesas/saldo batem com a soma em centavos após "reload"', function() {
    var agora = new Date();
    var y = agora.getFullYear();
    var m = String(agora.getMonth() + 1).padStart(2, '0');
    var d = function(dia) {
      return y + '-' + m + '-' + String(dia).padStart(2, '0');
    };

    global.TRANSACOES.criar('receita', 6300, 'salario', d(5), 'Salário', '', '');
    global.TRANSACOES.criar('despesa', 1800, 'moradia', d(10), 'Aluguel', '', '');

    var mes = agora.getMonth() + 1;
    var ano = agora.getFullYear();
    var resumo1 = global.TRANSACOES.obterResumoMes(mes, ano);
    expect(resumo1.receitas).toBe(6300);
    expect(resumo1.despesas).toBe(1800);
    expect(resumo1.saldo).toBe(4500);

    if (global.TRANSACOES.invalidateCache) global.TRANSACOES.invalidateCache();
    global.TRANSACOES.obter({});

    var resumo2 = global.TRANSACOES.obterResumoMes(mes, ano);
    expect(resumo2.receitas).toBe(6300);
    expect(resumo2.despesas).toBe(1800);
    expect(resumo2.saldo).toBe(4500);

    var txs = global.TRANSACOES.obter({ mes: mes, ano: ano });
    var recC = 0;
    var despC = 0;
    txs.forEach(function(t) {
      if (t.tipo === 'receita') recC += global.UTILS.paraCentavos(t.valor);
      else if (t.tipo === 'despesa') despC += global.UTILS.paraCentavos(t.valor);
    });
    expect(recC / 100).toBe(resumo2.receitas);
    expect(despC / 100).toBe(resumo2.despesas);
  });

  test('projeção de fim de mês não altera o resumo realizado', function() {
    if (typeof global.AI_ENGINE === 'undefined' || !global.AI_ENGINE.projetarFimMes) {
      return;
    }
    var agora = new Date();
    var y = agora.getFullYear();
    var m = String(agora.getMonth() + 1).padStart(2, '0');
    global.TRANSACOES.criar('despesa', 100, 'alimentacao', y + '-' + m + '-01', 'Teste', '', '');
    var mes = agora.getMonth() + 1;
    var ano = agora.getFullYear();
    var realizado = global.TRANSACOES.obterResumoMes(mes, ano);
    expect(realizado.despesas).toBe(100);

    var proj = global.AI_ENGINE.projetarFimMes(global.TRANSACOES.obter({}), agora);
    expect(realizado.despesas).toBe(100);
    if (proj && proj.despesasRealizadas != null) {
      expect(proj.despesasRealizadas).toBeCloseTo(100, 2);
    }
  });
});
