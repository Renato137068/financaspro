/**
 * app-pin.test.js — a tranca por PIN com o app inteiro: criar, desbloquear,
 * errar até bloquear, migrar hash antigo e desativar.
 * @jest-environment node
 *
 * Achado da auditoria de qualidade de 08/10: js/pin.js estava em 43% de linhas.
 * Só as regras puras (PIN fraco, comparação, iterações) tinham teste; o
 * caminho que o usuário percorre — a tela de bloqueio, o rate limit aplicado de
 * verdade, a migração do hash de 100k e a desativação que exige o PIN — não.
 * Uma regressão ali deixava a tranca aberta (ou trancava o dono para fora) sem
 * nenhum teste vermelho.
 */
const nodeCrypto = require('crypto');
const { subirApp } = require('./helpers/app-jsdom.cjs');
const { gestos, tique } = require('./helpers/ui-app.cjs');

const SALT = '00112233445566778899aabbccddeeff';
const PIN_CERTO = '4831';

function hashDe(pin, iteracoes) {
  return nodeCrypto.pbkdf2Sync(pin, Buffer.from(SALT, 'hex'), iteracoes, 32, 'sha256').toString('hex');
}

const PIN_310K = {
  pinAtivo: true, pinSalt: SALT, pinHash: hashDe(PIN_CERTO, 310000),
  pinAlgoritmo: 'pbkdf2-sha256-310k', pinTentativas: 0, pinBloqueadoAte: 0,
};

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

const cfg = () => app.window.DADOS.getConfig();
/** Relógio do app (o harness o adianta para a data fixa dos testes). */
const agora = () => app.window.Date.now();
const telaBloqueio = () => app.document.querySelector('.pin-lock-screen');
const travado = () => app.document.documentElement.classList.contains('pin-locked');

/** Digita os 4 dígitos como o usuário: o 4º dispara a verificação sozinho. */
function digitarPin(prefixo, pin) {
  const d = app.document;
  for (let i = 0; i < 4; i++) {
    const el = d.getElementById(prefixo + '-' + (i + 1));
    el.value = pin[i];
    el.dispatchEvent(new app.window.Event('input', { bubbles: true }));
  }
}

async function abrirTravado(extraConfig) {
  app = await subirApp({ config: { ...PIN_310K, ...(extraConfig || {}) } });
  const ok = await app.esperar(() => !!telaBloqueio());
  expect(ok).toBe(true);
  return gestos(app);
}

describe('Tela de bloqueio', () => {
  test('sem PIN ativo o app abre direto', async () => {
    app = await subirApp({});
    expect(telaBloqueio()).toBeNull();
    expect(travado()).toBe(false);
  });

  test('com PIN ativo o app abre travado e o PIN certo libera', async () => {
    const g = await abrirTravado({ pinTentativas: 2 });
    expect(travado()).toBe(true);
    expect(telaBloqueio().getAttribute('role')).toBe('dialog');
    digitarPin('unlock', PIN_CERTO);
    expect(await app.esperar(() => !telaBloqueio())).toBe(true);
    expect(travado()).toBe(false);
    // Acertar zera o contador de erros.
    expect(cfg().pinTentativas).toBe(0);
    expect(g.toast()).toMatch(/Que bom te ver/);
  });

  test('PIN errado continua travado, limpa os campos e conta a tentativa', async () => {
    const g = await abrirTravado();
    digitarPin('unlock', '9137');
    expect(await app.esperar(() => cfg().pinTentativas === 1)).toBe(true);
    expect(telaBloqueio()).not.toBeNull();
    expect(travado()).toBe(true);
    expect(g.toast()).toMatch(/PIN incorreto\. 4 tentativa/);
    expect(app.document.getElementById('unlock-1').value).toBe('');
  });

  test('a 5ª tentativa errada bloqueia, e nem o PIN certo entra durante o bloqueio', async () => {
    const g = await abrirTravado({ pinTentativas: 4 });
    digitarPin('unlock', '9137');
    expect(await app.esperar(() => cfg().pinBloqueadoAte > agora())).toBe(true);
    expect(g.toast()).toMatch(/Muitas tentativas\. Bloqueado por 30s/);

    digitarPin('unlock', PIN_CERTO);
    await tique(50);
    expect(telaBloqueio()).not.toBeNull();
    expect(g.toast()).toMatch(/Aguarde \d+s/);
  });

  test('o bloqueio dobra a cada erro depois do limite', async () => {
    await abrirTravado({ pinTentativas: 5 });
    const antes = agora();
    digitarPin('unlock', '9137');
    expect(await app.esperar(() => cfg().pinTentativas === 6)).toBe(true);
    const espera = cfg().pinBloqueadoAte - antes;
    expect(espera).toBeGreaterThanOrEqual(60000);
    expect(espera).toBeLessThan(61000);
  });

  test('hash antigo (100k) entra e é regravado no formato forte', async () => {
    await abrirTravado({ pinHash: hashDe(PIN_CERTO, 100000), pinAlgoritmo: 'pbkdf2-sha256-100k' });
    digitarPin('unlock', PIN_CERTO);
    expect(await app.esperar(() => !telaBloqueio())).toBe(true);
    expect(await app.esperar(() => cfg().pinAlgoritmo === 'pbkdf2-sha256-310k')).toBe(true);
    expect(cfg().pinHash).toBe(PIN_310K.pinHash);
  });

  test('hash antigo com PIN errado não migra nada', async () => {
    const legado = hashDe(PIN_CERTO, 100000);
    await abrirTravado({ pinHash: legado, pinAlgoritmo: 'pbkdf2-sha256-100k' });
    digitarPin('unlock', '9137');
    expect(await app.esperar(() => cfg().pinTentativas === 1)).toBe(true);
    expect(cfg()).toMatchObject({ pinHash: legado, pinAlgoritmo: 'pbkdf2-sha256-100k' });
  });
});

describe('Configurações: desativar o PIN', () => {
  async function abrirDesativar(extraConfig) {
    const g = await abrirTravado(extraConfig);
    digitarPin('unlock', PIN_CERTO);
    expect(await app.esperar(() => !telaBloqueio())).toBe(true);
    app.window.confirmarDesativarPin();
    // O botão do modal ganha a ação ~100 ms depois de o modal aparecer.
    expect(await app.esperar(() => /Confirmar/.test((app.document.querySelector('.modal-overlay .modal-btn') || {}).textContent), 1000)).toBe(true);
    return g;
  }

  test('PIN errado não desativa e conta para o mesmo rate limit da tela de bloqueio', async () => {
    const g = await abrirDesativar();
    digitarPin('pinoff', '9137');
    g.okModal();
    expect(await app.esperar(() => cfg().pinTentativas === 1)).toBe(true);
    expect(cfg().pinAtivo).toBe(true);
    expect(g.toast()).toMatch(/PIN incorreto/);
  });

  test('bloqueado, nem tenta verificar', async () => {
    const g = await abrirDesativar();
    app.window.DADOS.salvarConfig({ pinBloqueadoAte: agora() + 60000 });
    digitarPin('pinoff', PIN_CERTO);
    g.okModal();
    await tique(50);
    expect(cfg().pinAtivo).toBe(true);
    expect(g.toast()).toMatch(/Aguarde \d+s/);
  });

  test('PIN certo desativa e apaga hash e salt', async () => {
    const g = await abrirDesativar();
    digitarPin('pinoff', PIN_CERTO);
    g.okModal();
    expect(await app.esperar(() => cfg().pinAtivo === false)).toBe(true);
    expect(cfg()).toMatchObject({ pinHash: null, pinSalt: null, pinAlgoritmo: null });
    expect(app.window.localStorage.getItem('financaspro_pin_locked')).toBeNull();
  });
});

describe('Configurações: criar o PIN', () => {
  async function abrirCriar() {
    app = await subirApp({});
    const g = gestos(app);
    const chk = app.document.createElement('input');
    chk.type = 'checkbox';
    chk.id = 'chk-pin';
    chk.checked = true;
    app.document.body.appendChild(chk);
    app.window.togglePinSeguranca();
    expect(await app.esperar(() => /Ativar PIN/.test((app.document.querySelector('.modal-overlay .modal-btn') || {}).textContent), 1000)).toBe(true);
    return g;
  }

  test('PIN óbvio é recusado e nada é salvo', async () => {
    const g = await abrirCriar();
    digitarPin('pin', '1234');
    g.okModal();
    expect(g.toast()).toMatch(/\S/);
    expect(cfg().pinAtivo).toBeFalsy();
    expect(app.document.getElementById('pin-1').value).toBe('');
  });

  test('PIN bom é salvo como hash forte com salt próprio (nunca em claro)', async () => {
    const g = await abrirCriar();
    digitarPin('pin', PIN_CERTO);
    g.okModal();
    expect(await app.esperar(() => cfg().pinAtivo === true)).toBe(true);
    const c = cfg();
    expect(c.pinAlgoritmo).toBe('pbkdf2-sha256-310k');
    expect(c.pinSalt).toMatch(/^[0-9a-f]{32}$/);
    expect(c.pinHash).toBe(nodeCrypto.pbkdf2Sync(PIN_CERTO, Buffer.from(c.pinSalt, 'hex'), 310000, 32, 'sha256').toString('hex'));
    expect(JSON.stringify(c)).not.toContain('"' + PIN_CERTO + '"');
    expect(app.window.localStorage.getItem('financaspro_pin_locked')).toBe('1');
  });
});
