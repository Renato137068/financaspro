/**
 * billing-dias-calendario.test.js — contagem do fim do trial e do Pro por dia
 * de calendário. Antes era Math.ceil em blocos de 24 h: no último dia o
 * banner dizia "acaba em 1 dia", e "acaba hoje" só aparecia depois do fim.
 */
const { carregarScript } = require('./helpers/carregar-script.cjs');
const { regrasDoBilling } = require('./helpers/billing-regras.cjs');

const regras = regrasDoBilling(carregarScript('js/billing.js'));
const realNow = Date.now;
afterEach(() => { Date.now = realNow; });

function agora(y, m, d, h) { Date.now = () => new Date(y, m - 1, d, h, 0, 0).getTime(); }
function iso(y, m, d, h) { return new Date(y, m - 1, d, h, 0, 0).toISOString(); }
const trial = (fim) => ({ status: 'TRIALING', trialEndsAt: fim, plan: { name: 'Pro', tier: 'PRO' } });
const cancelado = (fim) => ({ status: 'ACTIVE', cancelAtPeriodEnd: true, currentPeriodEnd: fim, plan: { name: 'Pro', tier: 'PRO' } });

describe('fim do trial e do Pro por dia de calendário', () => {
  test('8h com fim às 20h do mesmo dia: "Trial acaba hoje"', () => {
    agora(2026, 10, 12, 8);
    expect(regras.getLifecycleAlert(trial(iso(2026, 10, 12, 20)), true).title).toBe('Trial acaba hoje');
  });

  test('23h com fim às 1h do dia seguinte: "acaba em 1 dia"', () => {
    agora(2026, 10, 12, 23);
    expect(regras.getLifecycleAlert(trial(iso(2026, 10, 13, 1)), true).title).toBe('Trial acaba em 1 dia');
  });

  test('20h com fim às 8h de daqui a 2 dias: "acaba em 2 dias"', () => {
    agora(2026, 10, 12, 20);
    expect(regras.getLifecycleAlert(trial(iso(2026, 10, 14, 8)), true).title).toBe('Trial acaba em 2 dias');
  });

  test('cancelado: último dia mostra "Último dia de Pro"; depois do fim, "Assinatura cancelada"', () => {
    agora(2026, 10, 12, 8);
    expect(regras.getLifecycleAlert(cancelado(iso(2026, 10, 12, 20)), true).title).toBe('Último dia de Pro');
    agora(2026, 10, 12, 21);
    expect(regras.getLifecycleAlert(cancelado(iso(2026, 10, 12, 20)), true).title).toBe('Assinatura cancelada');
  });
});
