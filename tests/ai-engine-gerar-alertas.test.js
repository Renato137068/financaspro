/**
 * ai-engine-gerar-alertas.test.js — alertas financeiros do motor.
 *
 * Foco na regressão do item 7 (projeção de fim de mês): a conta inline usava
 * taxaDiaria = despesas/diaMes com as despesas do mês INTEIRAS, contando uma
 * parcela futura duas vezes (no total e no ritmo) e disparando "saldo negativo"
 * falso. Agora delega a projetarFimMes, que separa realizado de futuro. Também
 * exercita os demais ramos de gerarAlertas (antes sem cobertura).
 *
 * Carrega os módulos REAIS (load-sources) — UTILS e AI_ENGINE de produção.
 */
const { loadCoreModules } = require('./load-sources');

loadCoreModules();
const AI = global.AI_ENGINE;

// Dia 10 de janeiro/2026 (mês de 31 dias → 21 dias restantes).
const JAN10 = new Date(2026, 0, 10);
const JAN16 = new Date(2026, 0, 16);

function achar(alertas, id) { return alertas.find(function(a) { return a.id === id; }); }

describe('AI_ENGINE.gerarAlertas — projeção de fim de mês (regressão)', () => {
  test('NÃO dispara projeção negativa falsa por parcela futura contada em dobro', () => {
    const txs = [
      { tipo: 'receita', valor: 6000, data: '2026-01-05', categoria: 'salario' },
      { tipo: 'despesa', valor: 1000, data: '2026-01-05', categoria: 'mercado' },
      { tipo: 'despesa', valor: 2000, data: '2026-01-15', categoria: 'eletronicos' }, // parcela futura
    ];
    // Correto: 1000 + 2000 + (1000/10)*21 = 5100 < 6000 → sobra, sem alerta.
    // Antigo (bug): 3000 + (3000/10)*21 = 9300 → saldo -3300 → alarme falso.
    const alertas = AI.gerarAlertas(txs, {}, JAN10);
    expect(achar(alertas, 'projecao-negativa')).toBeUndefined();
  });

  test('dispara projeção negativa quando o ritmo real estoura a receita', () => {
    const txs = [
      { tipo: 'receita', valor: 2000, data: '2026-01-05', categoria: 'salario' },
      { tipo: 'despesa', valor: 1800, data: '2026-01-05', categoria: 'mercado' },
    ];
    const a = achar(AI.gerarAlertas(txs, {}, JAN10), 'projecao-negativa');
    expect(a).toBeDefined();
    expect(a.gravidade).toBe('alta');
  });

  test('sem receita no mês não projeta (não inventa alarme sem base)', () => {
    const txs = [{ tipo: 'despesa', valor: 500, data: '2026-01-05', categoria: 'mercado' }];
    expect(achar(AI.gerarAlertas(txs, {}, JAN10), 'projecao-negativa')).toBeUndefined();
  });
});

describe('AI_ENGINE.gerarAlertas — demais ramos', () => {
  test('saldo negativo do mês vira alerta crítico', () => {
    const txs = [
      { tipo: 'receita', valor: 1000, data: '2026-01-03', categoria: 'salario' },
      { tipo: 'despesa', valor: 1500, data: '2026-01-04', categoria: 'mercado' },
    ];
    const a = achar(AI.gerarAlertas(txs, {}, JAN10), 'saldo-negativo');
    expect(a).toBeDefined();
    expect(a.gravidade).toBe('critica');
  });

  test('orçamento excedido e orçamento quase no limite', () => {
    const txs = [
      { tipo: 'receita', valor: 9000, data: '2026-01-02', categoria: 'salario' },
      { tipo: 'despesa', valor: 120, data: '2026-01-05', categoria: 'mercado' }, // 120% de 100
      { tipo: 'despesa', valor: 85, data: '2026-01-06', categoria: 'lazer' },    // 85% de 100
    ];
    const alertas = AI.gerarAlertas(txs, { orcamentos: { mercado: 100, lazer: 100 } }, JAN10);
    expect(achar(alertas, 'orc-excedido-mercado')).toBeDefined();
    expect(achar(alertas, 'orc-alerta-lazer')).toBeDefined();
  });

  test('vencimento recorrente próximo (dentro de 5 dias) vira alerta', () => {
    const txs = [{ tipo: 'receita', valor: 5000, data: '2026-01-02', categoria: 'salario' }];
    const config = { recorrentes: [{ id: 'aluguel', descricao: 'Aluguel', valor: 1500, dia: 13 }] };
    const a = achar(AI.gerarAlertas(txs, config, JAN10), 'recorrente-aluguel');
    expect(a).toBeDefined();
    expect(a.msg).toContain('3 dia'); // dia 13 − dia 10
  });

  test('sem receita após o dia 15 vira alerta alto', () => {
    const txs = [{ tipo: 'despesa', valor: 200, data: '2026-01-04', categoria: 'mercado' }];
    const a = achar(AI.gerarAlertas(txs, {}, JAN16), 'sem-receita');
    expect(a).toBeDefined();
    expect(a.gravidade).toBe('alta');
  });
});
