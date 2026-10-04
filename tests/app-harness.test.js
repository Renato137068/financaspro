/**
 * app-harness.test.js — as regras do harness que sobe o app (app-jsdom).
 * @jest-environment node
 *
 * Achado M3 da reauditoria de 1º/out: as suítes do app usavam o relógio real
 * e o tempo-limite de 5 s do Jest. Na virada do mês uma suíte com lançamentos
 * de setembro ficou vermelha; com a máquina ocupada, um teste que sobe o app
 * duas vezes passou dos 5 s. Isto trava as duas defesas.
 */
const fs = require('fs');
const path = require('path');
const { subirApp, AGORA_PADRAO, TEMPO_LIMITE_MS } = require('./helpers/app-jsdom.cjs');

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

test('sem opção, o app acorda em AGORA_PADRAO e o relógio anda dali', async () => {
  app = await subirApp();
  const agora = app.window.Date.now();
  const fixo = new Date(AGORA_PADRAO).getTime();
  expect(agora).toBeGreaterThanOrEqual(fixo);
  expect(agora - fixo).toBeLessThan(TEMPO_LIMITE_MS);
  expect(new app.window.Date().toISOString().slice(0, 7)).toBe(AGORA_PADRAO.slice(0, 7));
  // Date com argumento continua sendo a data pedida.
  expect(new app.window.Date('2020-01-02T00:00:00Z').getTime()).toBe(Date.UTC(2020, 0, 2));
});

test("agora: 'real' deixa o relógio da máquina; uma data ISO o fixa ali", async () => {
  app = await subirApp({ agora: 'real' });
  expect(Math.abs(app.window.Date.now() - Date.now())).toBeLessThan(5000);
  app.fechar();
  app = await subirApp({ agora: '2027-03-01T09:00:00.000-03:00' });
  expect(new app.window.Date().getUTCFullYear()).toBe(2027);
});

test('o harness dá 15 s por teste a quem o importa', () => {
  expect(TEMPO_LIMITE_MS).toBe(15000);
  const fonte = fs.readFileSync(path.join(__dirname, 'helpers', 'app-jsdom.cjs'), 'utf8');
  expect(fonte).toMatch(/jest\.setTimeout\(TEMPO_LIMITE_MS\)/);
});

test('toda suíte app-* sobe o app pelo harness', () => {
  const suites = fs.readdirSync(__dirname).filter((f) => /^app-.+\.test\.js$/.test(f) && f !== 'app-harness.test.js');
  expect(suites.length).toBeGreaterThan(10);
  for (const f of suites) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    expect({ f, usa: src.includes("require('./helpers/app-jsdom.cjs')") }).toEqual({ f, usa: true });
    expect({ f, jsdomProprio: /new JSDOM\(/.test(src) }).toEqual({ f, jsdomProprio: false });
  }
});
