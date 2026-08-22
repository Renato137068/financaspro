/**
 * metas-projecao.test.js — a meta precisa responder "vou conseguir?".
 *
 * O módulo já guardava alvo, valor atual e prazo, e mostrava percentual e dias
 * restantes. Faltava o que transforma isso em decisão: quanto poupar por mês,
 * se o ritmo atual chega lá, e quanto falta ajustar quando não chega.
 *
 * Uma barra em 40% não diz nada sozinha. Em 40% faltando dois meses é um
 * problema; em 40% faltando dois anos é tranquilidade.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(() => { loadCoreModules(); });
beforeEach(() => { resetFixtures(); });

// Data fixa para os testes não dependerem do dia em que rodam.
const HOJE = new Date(2026, 7, 10); // 10/08/2026, meio do ano

function meta(over) {
  return Object.assign({
    id: 'm1',
    titulo: 'Reserva',
    valorAlvo: 12000,
    valorAtual: 0,
    prazo: null,
    criadoEm: new Date(2026, 1, 10).toISOString(), // 6 meses atrás
    concluida: false,
  }, over || {});
}

describe('METAS.calcularProjecao — aporte necessário', () => {
  test('divide o que falta pelos meses restantes', () => {
    // Faltam R$ 12.000 e 12 meses -> R$ 1.000/mês.
    const p = METAS.calcularProjecao(meta({ prazo: '2027-08-10' }), HOJE);
    expect(p.mesesRestantes).toBe(12);
    expect(p.aporteMensalNecessario).toBeCloseTo(1000, 2);
  });

  test('desconta o que já foi guardado', () => {
    const p = METAS.calcularProjecao(
      meta({ valorAtual: 6000, prazo: '2027-08-10' }), HOJE,
    );
    expect(p.aporteMensalNecessario).toBeCloseTo(500, 2);
  });

  test('meta sem prazo não exige aporte mensal', () => {
    const p = METAS.calcularProjecao(meta({ valorAtual: 3000 }), HOJE);
    expect(p.situacao).toBe('sem-prazo');
    expect(p.aporteMensalNecessario).toBeNull();
  });

  test('meta concluída não pede mais nada', () => {
    const p = METAS.calcularProjecao(
      meta({ valorAtual: 12000, prazo: '2027-08-10' }), HOJE,
    );
    expect(p.situacao).toBe('concluida');
    expect(p.aporteMensalNecessario).toBe(0);
  });

  test('prazo no mês corrente pede o restante de uma vez, sem dividir por zero', () => {
    const p = METAS.calcularProjecao(
      meta({ valorAtual: 11000, prazo: '2026-08-25' }), HOJE,
    );
    expect(p.mesesRestantes).toBe(1);
    expect(p.aporteMensalNecessario).toBeCloseTo(1000, 2);
    expect(isFinite(p.aporteMensalNecessario)).toBe(true);
  });

  test('prazo vencido com meta incompleta é sinalizado', () => {
    const p = METAS.calcularProjecao(
      meta({ valorAtual: 5000, prazo: '2026-06-10' }), HOJE,
    );
    expect(p.situacao).toBe('vencida');
    expect(p.diasRestantes).toBeLessThan(0);
  });
});

describe('METAS.calcularProjecao — ritmo e diagnóstico', () => {
  test('quem está no ritmo é reconhecido como no-ritmo', () => {
    // Criada há 6 meses, guardou R$ 6.000 -> R$ 1.000/mês.
    // Faltam R$ 6.000 em 6 meses -> precisa de R$ 1.000/mês. Está em dia.
    const p = METAS.calcularProjecao(
      meta({ valorAtual: 6000, prazo: '2027-02-10' }), HOJE,
    );
    expect(p.ritmoMensal).toBeCloseTo(1000, 0);
    expect(p.situacao).toBe('no-ritmo');
    expect(p.ajusteMensal).toBe(0);
  });

  test('quem está atrasado recebe o valor exato do ajuste', () => {
    // Guardou R$ 3.000 em 6 meses (R$ 500/mês). Faltam R$ 9.000 em 6 meses,
    // ou seja R$ 1.500/mês. Precisa aumentar R$ 1.000.
    const p = METAS.calcularProjecao(
      meta({ valorAtual: 3000, prazo: '2027-02-10' }), HOJE,
    );
    expect(p.situacao).toBe('atrasado');
    expect(p.ajusteMensal).toBeCloseTo(1000, 0);
  });

  test('quem está adiantado é reconhecido como adiantado', () => {
    // Guardou R$ 9.000 em 6 meses (R$ 1.500/mês) e faltam R$ 3.000 em 6 meses.
    const p = METAS.calcularProjecao(
      meta({ valorAtual: 9000, prazo: '2027-02-10' }), HOJE,
    );
    expect(p.situacao).toBe('adiantado');
    expect(p.ajusteMensal).toBe(0);
  });

  test('sem ritmo apurável, não inventa projeção', () => {
    // Meta criada hoje, nada guardado: não há histórico para projetar.
    const p = METAS.calcularProjecao(
      meta({ criadoEm: HOJE.toISOString(), valorAtual: 0, prazo: '2027-08-10' }),
      HOJE,
    );
    expect(p.ritmoMensal).toBe(0);
    expect(p.previsaoConclusao).toBeNull();
  });

  test('a previsão de conclusão sai como YYYY-MM-DD', () => {
    const p = METAS.calcularProjecao(
      meta({ valorAtual: 6000, prazo: '2027-02-10' }), HOJE,
    );
    expect(p.previsaoConclusao).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('previsão de conclusão respeita o último dia do mês', () => {
    // Regressão do bug de calendário: a projeção usa soma de meses e não pode
    // transbordar 31/01 para 03/03.
    const p = METAS.calcularProjecao(
      meta({
        criadoEm: new Date(2025, 7, 31).toISOString(),
        valorAtual: 6000,
        prazo: '2027-02-10',
      }),
      new Date(2026, 0, 31),
    );
    if (p.previsaoConclusao) {
      const dia = parseInt(p.previsaoConclusao.slice(8, 10), 10);
      expect(dia).toBeGreaterThanOrEqual(1);
      expect(dia).toBeLessThanOrEqual(31);
    }
  });
});

describe('METAS.calcularProgresso — precisão e datas', () => {
  test('o restante fecha em centavos, sem resíduo de ponto flutuante', () => {
    const p = METAS.calcularProgresso(meta({ valorAlvo: 0.3, valorAtual: 0.1 }));
    expect(p.restante).toBe(0.2);
  });

  test('meta vencendo hoje devolve 0 dias, não 1', () => {
    // Mesmo erro de ancoragem que já havia aparecido em contas-pagar e
    // assinaturas: hoje às 00:00 contra prazo às 12:00, com Math.ceil,
    // empurrava a escala inteira um dia para frente.
    const hojeIso = UTILS.dataLocalIso();
    expect(METAS.calcularProgresso(meta({ prazo: hojeIso })).diasRestantes).toBe(0);
  });

  test('percentual nunca passa de 100', () => {
    expect(METAS.calcularProgresso(meta({ valorAtual: 99999 })).percentual).toBe(100);
  });

  test('alvo zero não gera divisão por zero', () => {
    const p = METAS.calcularProgresso(meta({ valorAlvo: 0, valorAtual: 0 }));
    expect(p.percentual).toBe(0);
    expect(isFinite(p.restante)).toBe(true);
  });
});
