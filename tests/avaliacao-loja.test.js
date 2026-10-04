/**
 * @jest-environment jsdom
 */
/**
 * avaliacao-loja.test.js — quando o app pede avaliação na Play.
 *
 * Regras: só no app Android, depois de 3 dias de uso, depois de um momento bom
 * (10 lançamentos em 7 dias ou meta concluída) e no máximo uma vez a cada 90
 * dias. Pedir demais irrita e o Google corta pela cota; pedir na hora errada
 * (logo na instalação, depois de erro) traz nota ruim.
 */
const { carregarScript } = require('./helpers/carregar-script.cjs');

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date(2026, 9, 24, 10, 0, 0).getTime();

let diasDeUso = 10;
// Dublê do import FUNIL: só o relógio de dias de uso.
const funilDuble = { diasDeUso: function() { return diasDeUso; } };
const AVALIACAO_LOJA = carregarScript('js/avaliacao-loja.js', { FUNIL: funilDuble });

let plugin;
function capacitor(plataforma) {
  plugin = { solicitar: jest.fn(function() { return Promise.resolve({ concluido: true }); }) };
  window.Capacitor = {
    isNativePlatform: function() { return plataforma !== 'web'; },
    getPlatform: function() { return plataforma; },
    Plugins: { FpInAppReview: plugin },
  };
}

beforeEach(function() {
  localStorage.clear();
  diasDeUso = 10;
  AVALIACAO_LOJA._atrasoMs = 0;
  capacitor('android');
});
afterAll(function() { delete window.Capacitor; });

function lancar(n, inicio, passo) {
  let ultimo = Promise.resolve(false);
  for (let i = 0; i < n; i++) ultimo = AVALIACAO_LOJA.aposLancamento(inicio + i * (passo || 1000));
  return ultimo;
}

describe('AVALIACAO_LOJA', function() {
  test('pede no 10º lançamento em 7 dias, não antes', async function() {
    expect(await lancar(9, AGORA)).toBe(false);
    expect(plugin.solicitar).not.toHaveBeenCalled();
    expect(await AVALIACAO_LOJA.aposLancamento(AGORA + 60000)).toBe(true);
    expect(plugin.solicitar).toHaveBeenCalledTimes(1);
  });

  test('lançamentos espalhados por mais de 7 dias não contam juntos', async function() {
    await lancar(10, AGORA, DIA); // um por dia, 10 dias
    expect(plugin.solicitar).not.toHaveBeenCalled();
  });

  test('no máximo uma vez a cada 90 dias', async function() {
    await lancar(10, AGORA);
    await AVALIACAO_LOJA.aposMetaConcluida(AGORA + 30 * DIA);
    await lancar(10, AGORA + 60 * DIA);
    expect(plugin.solicitar).toHaveBeenCalledTimes(1);
    await AVALIACAO_LOJA.aposMetaConcluida(AGORA + 91 * DIA);
    expect(plugin.solicitar).toHaveBeenCalledTimes(2);
  });

  test('meta concluída é momento bom', async function() {
    expect(await AVALIACAO_LOJA.aposMetaConcluida(AGORA)).toBe(true);
    expect(plugin.solicitar).toHaveBeenCalledTimes(1);
  });

  test('nunca nos primeiros 3 dias de uso', async function() {
    diasDeUso = 2;
    expect(await AVALIACAO_LOJA.aposMetaConcluida(AGORA)).toBe(false);
    expect(plugin.solicitar).not.toHaveBeenCalled();
  });

  test.each(['web', 'ios'])('fora do Android (%s) não faz nada', async function(plataforma) {
    capacitor(plataforma);
    expect(await AVALIACAO_LOJA.aposMetaConcluida(AGORA)).toBe(false);
    expect(plugin.solicitar).not.toHaveBeenCalled();
  });

  test('sem o plugin nativo (APK antigo) não quebra', async function() {
    delete window.Capacitor.Plugins.FpInAppReview;
    expect(await AVALIACAO_LOJA.aposMetaConcluida(AGORA)).toBe(false);
  });

  test('falha do Google não vira erro e conta como pedido', async function() {
    plugin.solicitar.mockImplementation(function() { return Promise.reject(new Error('cota')); });
    expect(await AVALIACAO_LOJA.aposMetaConcluida(AGORA)).toBe(false);
    expect(AVALIACAO_LOJA.podePedir(AGORA + DIA)).toBe(false);
  });

  test('guarda só horários, nada do lançamento', async function() {
    await lancar(3, AGORA);
    const salvo = JSON.parse(localStorage.getItem('fp-avaliacao-loja'));
    expect(Object.keys(salvo)).toEqual(['lancamentos']);
    salvo.lancamentos.forEach(function(t) { expect(typeof t).toBe('number'); });
  });

  test('storage corrompido não impede o app', async function() {
    localStorage.setItem('fp-avaliacao-loja', '{quebrado');
    expect(await AVALIACAO_LOJA.aposMetaConcluida(AGORA)).toBe(true);
  });
});
