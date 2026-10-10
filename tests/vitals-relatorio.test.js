/**
 * vitals-relatorio.test.js — alerta semanal dos Android vitals.
 * @jest-environment node
 *
 * Achado 8 da auditoria de operação de 06/10: travamentos nativos e ANR só
 * eram vistos por quem abrisse o Play Console.
 */
const fs = require('fs');
const path = require('path');
const { METRICAS, avaliar, relatorioMd, diasAntes } = require('../scripts/vitals-relatorio.cjs');

const [CRASH, ANR] = METRICAS;
const linha = (day, metric, value) => ({ startTime: { year: 2026, month: 10, day }, metrics: [{ metric, decimalValue: { value: String(value) } }] });

test('limites são os de mau comportamento da Play', () => {
  expect(CRASH.limite).toBe(0.0109);
  expect(ANR.limite).toBe(0.0047);
});

test('a média de 7 dias mais recente decide o alerta', () => {
  const r = avaliar(CRASH, [linha(5, CRASH.metrica, 0.02), linha(6, CRASH.metrica, 0.004)]);
  expect(r.atual).toBe(0.004);
  expect(r.alerta).toBe(false);
  expect(avaliar(CRASH, [linha(6, CRASH.metrica, 0.0110)]).alerta).toBe(true);
});

test('sem dados não alerta', () => {
  const r = avaliar(ANR, []);
  expect(r).toMatchObject({ atual: null, alerta: false });
});

test('relatório diz o que passou do limite e mostra os números em %', () => {
  const md = relatorioMd([
    avaliar(CRASH, [linha(6, CRASH.metrica, 0.0123)]),
    avaliar(ANR, [linha(6, ANR.metrica, 0.001)]),
  ]);
  expect(md).toMatch(/Acima do limite da Play:\*\* Travamentos\./);
  expect(md).toMatch(/\| Travamentos \| 1,23% ⚠️ \| 1,09% \|/);
  expect(md).toMatch(/\| App não responde \(ANR\) \| 0,10% \| 0,47% \|/);
});

test('janela de 7 dias atravessa a virada do mês sem perder o fuso', () => {
  const tz = { id: 'America/Los_Angeles' };
  expect(diasAntes({ year: 2026, month: 10, day: 3, timeZone: tz }, 7)).toEqual({ year: 2026, month: 9, day: 26, timeZone: tz });
});

test('o workflow é semanal, usa a conta de serviço da Play e abre uma issue só', () => {
  const yml = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'vitals.yml'), 'utf8');
  expect(yml).toMatch(/cron: '\d+ \d+ \* \* 1'/);
  expect(yml).toMatch(/PLAY_SERVICE_ACCOUNT_JSON: \$\{\{ secrets\.PLAY_SERVICE_ACCOUNT_JSON \}\}/);
  expect(yml).toMatch(/if: steps\.vitals\.outputs\.alerta == 'true'/);
  expect(yml).toMatch(/gh issue comment/);
});
