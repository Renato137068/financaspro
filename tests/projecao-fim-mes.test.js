/**
 * projecao-fim-mes.test.js — a projeção não pode contar a mesma parcela duas vezes.
 *
 * `projetarFimMes` estimava o fechamento do mês assim: pega TODAS as despesas
 * do mês, divide pelos dias já decorridos e extrapola para os dias restantes.
 *
 * Funciona enquanto o mês só tem lançamentos passados. Quebra feio quando o
 * usuário parcela — que é justamente o recurso principal do app. O parcelamento
 * grava uma transação por parcela, cada uma na sua data. Uma parcela com data
 * futura DENTRO do mês corrente entrava na conta duas vezes:
 *
 *   1. somava ao total já gasto;
 *   2. inflava a taxa diária, que era então multiplicada pelos dias restantes.
 *
 * Cenário real medido: gasto de R$ 1.000 até o dia 10 mais uma parcela de
 * R$ 2.000 marcada para o dia 15.
 *
 *   projeção correta : ~R$ 5.100   (1.000 gastos + 2.000 da parcela + 2.100 de ritmo)
 *   projeção anterior:  R$ 9.300   (82% a mais)
 *
 * Com receita de R$ 5.000, a tela dizia "o mês fecha R$ 4.300 no vermelho"
 * quando o fechamento real era próximo de zero. Um número errado nessa direção
 * não é conservador — é alarme falso, e alarme falso ensina a ignorar o app.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAiEngine() {
  const ctx = vm.createContext({ Date, Math, Number, String, Array, Object, JSON });
  const file = path.join(__dirname, '..', 'js', 'ai-engine.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  return ctx.AI_ENGINE;
}
const AI = loadAiEngine();

// 10/08/2026 — agosto tem 31 dias, então 10 decorridos e 21 restantes.
const HOJE = new Date(2026, 7, 10);

describe('projetarFimMes — parcela futura do mês corrente', () => {
  const txs = [
    { tipo: 'receita', valor: 5000, data: '2026-08-01', categoria: 'salario' },
    { tipo: 'despesa', valor: 1000, data: '2026-08-05', categoria: 'outro' },
    { tipo: 'despesa', valor: 2000, data: '2026-08-15', categoria: 'outro' }, // futura
  ];

  test('a taxa diária vem só do que já foi gasto', () => {
    // R$ 1.000 em 10 dias = R$ 100/dia. A parcela de dia 15 não pode entrar aqui.
    expect(AI.projetarFimMes(txs, HOJE).taxaDiaria).toBeCloseTo(100, 2);
  });

  test('a parcela conhecida entra uma vez, pelo valor cheio', () => {
    expect(AI.projetarFimMes(txs, HOJE).despesasFuturasConhecidas).toBe(2000);
  });

  test('a projeção soma gasto + parcela conhecida + ritmo', () => {
    // 1.000 (gasto) + 2.000 (parcela) + 100/dia × 21 dias = 5.100
    expect(AI.projetarFimMes(txs, HOJE).projecaoDespesas).toBeCloseTo(5100, 2);
  });

  test('não devolve o valor inflado da versão anterior', () => {
    expect(AI.projetarFimMes(txs, HOJE).projecaoDespesas).not.toBeCloseTo(9300, 0);
  });

  test('o saldo projetado deixa de acusar vermelho falso', () => {
    // 5.000 de receita contra 5.100 de despesa: praticamente empatado.
    const s = AI.projetarFimMes(txs, HOJE).saldoProjetado;
    expect(s).toBeCloseTo(-100, 2);
    expect(s).toBeGreaterThan(-500);
  });
});

describe('projetarFimMes — comportamento preservado', () => {
  test('sem lançamentos futuros, a conta é a de sempre', () => {
    const txs = [
      { tipo: 'receita', valor: 3000, data: '2026-08-01', categoria: 'salario' },
      { tipo: 'despesa', valor: 500, data: '2026-08-05', categoria: 'outro' },
    ];
    // 500 em 10 dias = 50/dia; 500 + 50 × 21 = 1.550
    expect(AI.projetarFimMes(txs, HOJE).projecaoDespesas).toBeCloseTo(1550, 2);
  });

  test('receita futura do mês entra na projeção de receitas', () => {
    const txs = [
      { tipo: 'receita', valor: 3000, data: '2026-08-01', categoria: 'salario' },
      { tipo: 'receita', valor: 1000, data: '2026-08-20', categoria: 'freelance' },
      { tipo: 'despesa', valor: 500, data: '2026-08-05', categoria: 'outro' },
    ];
    expect(AI.projetarFimMes(txs, HOJE).projecaoReceitas).toBe(4000);
  });

  test('nos primeiros dias do mês não projeta nada', () => {
    const txs = [{ tipo: 'despesa', valor: 100, data: '2026-08-01', categoria: 'outro' }];
    expect(AI.projetarFimMes(txs, new Date(2026, 7, 2)).dadosInsuficientes).toBe(true);
  });

  test('mês sem lançamento nenhum não projeta R$ 0,00 como se fosse real', () => {
    expect(AI.projetarFimMes([], HOJE).dadosInsuficientes).toBe(true);
  });

  test('transferência não entra na projeção de despesas', () => {
    const txs = [
      { tipo: 'receita', valor: 3000, data: '2026-08-01', categoria: 'salario' },
      { tipo: 'despesa', valor: 500, data: '2026-08-05', categoria: 'outro' },
      { tipo: 'transferencia', valor: 2000, data: '2026-08-06', categoria: 'transferencia' },
    ];
    expect(AI.projetarFimMes(txs, HOJE).projecaoDespesas).toBeCloseTo(1550, 2);
  });

  test('no último dia do mês a projeção é o próprio realizado', () => {
    const txs = [
      { tipo: 'receita', valor: 3000, data: '2026-08-01', categoria: 'salario' },
      { tipo: 'despesa', valor: 900, data: '2026-08-05', categoria: 'outro' },
    ];
    const p = AI.projetarFimMes(txs, new Date(2026, 7, 31));
    expect(p.diasRestantes).toBe(0);
    expect(p.projecaoDespesas).toBeCloseTo(900, 2);
  });

  test('valores fecham em centavos', () => {
    const txs = [
      { tipo: 'receita', valor: 1000, data: '2026-08-01', categoria: 'salario' },
      { tipo: 'despesa', valor: 0.1, data: '2026-08-05', categoria: 'outro' },
    ];
    const p = AI.projetarFimMes(txs, HOJE);
    expect(Number.isFinite(p.projecaoDespesas)).toBe(true);
    expect(p.projecaoDespesas).toBe(Math.round(p.projecaoDespesas * 100) / 100);
  });
});

describe('mensagemFimMes acompanha a projeção corrigida', () => {
  test('deixa de dar alarme falso de vermelho', () => {
    const txs = [
      { tipo: 'receita', valor: 8000, data: '2026-08-01', categoria: 'salario' },
      { tipo: 'despesa', valor: 1000, data: '2026-08-05', categoria: 'outro' },
      { tipo: 'despesa', valor: 2000, data: '2026-08-15', categoria: 'outro' },
    ];
    const m = AI.mensagemFimMes(txs, HOJE);
    expect(m.tom).toBe('positivo');
  });

  test('vermelho real continua sendo sinalizado', () => {
    const txs = [
      { tipo: 'receita', valor: 1000, data: '2026-08-01', categoria: 'salario' },
      { tipo: 'despesa', valor: 2000, data: '2026-08-05', categoria: 'outro' },
    ];
    expect(AI.mensagemFimMes(txs, HOJE).tom).toBe('alerta');
  });
});
