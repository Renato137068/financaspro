/**
 * app-paywall.test.js — o paywall visto pelo usuário, com o app inteiro.
 * @jest-environment node
 *
 * Caminho real: usuário grátis com uma meta tenta criar a segunda pelo
 * Simulador. O limite do plano precisa abrir o paywall com o motivo — e, no
 * modo local (sem conta), o paywall não pode oferecer "Assinar", que seria um
 * botão morto e viola a política de pagamentos da Play.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');

const META_EXISTENTE = {
  id: 'm1', titulo: 'Reserva', valorAlvo: 10000, valorAtual: 2000,
  prazo: '2027-06-01', icone: 'target', criadaEm: '2026-09-01T12:00:00.000Z',
};

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

function digitar(el, texto) {
  el.value = texto;
  el.dispatchEvent(new app.window.Event('input', { bubbles: true }));
}

function paywall() {
  return app.document.querySelector('.billing-overlay[role="dialog"]');
}

async function tentarSegundaMetaPeloSimulador() {
  const d = app.document;
  app.window.mudarAba('config-simulador');
  await app.esperar(() => d.getElementById('sim-tab-meta'));
  d.getElementById('sim-tab-meta').click();
  digitar(d.getElementById('sim-m-objetivo'), '12000');
  digitar(d.getElementById('sim-m-meses'), '24');
  d.querySelector('[data-action="sim-calc-meta"]').click();
  await app.esperar(() => d.querySelector('[data-action="sim-criar-meta"]'));
  digitar(d.getElementById('sim-m-nome'), 'Viagem');
  d.querySelector('[data-action="sim-criar-meta"]').click();
}

describe('Paywall', () => {
  test('limite de metas do plano grátis abre o paywall com o motivo', async () => {
    app = await subirApp({ config: { metas: [META_EXISTENTE] } });
    await tentarSegundaMetaPeloSimulador();

    expect(await app.esperar(() => paywall())).toBe(true);
    expect(paywall().getAttribute('aria-modal')).toBe('true');
    expect(app.document.getElementById('billing-lead').textContent).toMatch(/Limite de metas/);
    // A segunda meta não foi criada.
    expect(app.global('METAS').listar().map((m) => m.titulo)).toEqual(['Reserva']);
  });

  test('no modo local o paywall mostra os planos sem botão "Assinar"', async () => {
    app = await subirApp();
    await app.carregarChunkConta();
    app.global('INIT_BILLING').abrirPaywall();

    expect(await app.esperar(() => paywall() && !paywall().querySelector('.billing-loading'))).toBe(true);
    const texto = paywall().textContent;
    expect(texto).toMatch(/Pro/);
    expect(paywall().querySelector('[data-action="billing-assinar"]')).toBeNull();
    expect(texto).not.toMatch(/\bAssinar\b/);
  });

  test('Esc fecha o paywall', async () => {
    app = await subirApp();
    await app.carregarChunkConta();
    app.global('INIT_BILLING').abrirPaywall('Teste');
    expect(await app.esperar(() => paywall())).toBe(true);

    // O foco fica preso no modal (FocusTrap); o Esc chega por ele.
    paywall().dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await app.esperar(() => !paywall(), 1000)).toBe(true);
  });

  test('o X fecha o paywall', async () => {
    app = await subirApp();
    await app.carregarChunkConta();
    app.global('INIT_BILLING').abrirPaywall('Teste');
    expect(await app.esperar(() => paywall())).toBe(true);

    paywall().querySelector('[data-action="billing-fechar"]').click();
    expect(await app.esperar(() => !paywall(), 1000)).toBe(true);
  });
});
