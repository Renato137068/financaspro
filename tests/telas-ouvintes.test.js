/**
 * telas-ouvintes.test.js — quem escreve numa tela lazy se religa quando ela chega.
 * @jest-environment node
 *
 * No build, o Extrato e as telas do Perfil chegam com os chunks, às vezes
 * depois do código do núcleo que liga os controles delas (biometria, 2FA,
 * billing, botão de sair). Esse código escuta `fp:tela-carregada`
 * (js/core/telas.js). Aqui a tela volta ao estado "recém-chegada": markup
 * novo, sem nenhum listener, e o evento precisa religar tudo.
 */
const fs = require('fs');
const path = require('path');
const { subirApp } = require('./helpers/app-jsdom.cjs');

const ROOT = path.join(__dirname, '..');
let app;
afterEach(() => { if (app) app.fechar(); app = null; });

function markupDaTela(chunk, tela) {
  return fs.readFileSync(path.join(ROOT, 'telas', chunk, tela + '.html'), 'utf8').replace(/^\s*<!--[\s\S]*?-->\s*/, '');
}

/**
 * Troca o conteúdo da casca por markup novo e avisa, como o TELAS.registrar
 * faz. `preparar` roda entre os dois (ex.: apagar um texto padrão do markup,
 * para provar que foi o ouvinte que o escreveu).
 */
function chegar(chunk, tela, preparar) {
  const d = app.document;
  d.getElementById('aba-' + tela).innerHTML = markupDaTela(chunk, tela);
  if (preparar) preparar(d);
  d.dispatchEvent(new app.window.CustomEvent('fp:tela-carregada', { detail: { nome: tela } }));
}

describe('ouvintes de fp:tela-carregada', () => {
  test('Segurança: biometria e 2FA voltam a ter o toggle ligado', async () => {
    app = await subirApp();
    // O 2FA mora no chunk 'conta', que o app carrega ao abrir o Perfil.
    await app.carregarChunkConta();
    chegar('config', 'config-seguranca');
    const d = app.document;
    expect(d.getElementById('chk-biometric').dataset.bound).toBe('1');
    expect(d.getElementById('chk-2fa').dataset.bound).toBe('1');
    expect(app.erros).toEqual([]);
  });

  test('Perfil: botão de sair ligado e rótulo da sessão preenchido', async () => {
    app = await subirApp();
    chegar('config', 'config', (doc) => { doc.getElementById('user-session-label').textContent = ''; });
    const d = app.document;
    expect(d.getElementById('btn-logout').dataset.logoutBound).toBe('1');
    expect(d.getElementById('user-session-label').textContent).toMatch(/Sessão local|Logado como/);
  });

  test('Conta: o billing preenche o plano quando a tela chega', async () => {
    app = await subirApp();
    await app.carregarChunkConta();
    chegar('config', 'config-conta', (d) => { d.getElementById('perfil-plano-subtitle').textContent = ''; });
    expect(app.document.getElementById('perfil-plano-subtitle').textContent.trim()).not.toBe('');
  });

  test('o "Sair" do login não depende do botão do Perfil existir', async () => {
    app = await subirApp();
    const d = app.document;
    d.getElementById('aba-config').innerHTML = '';
    const sair = d.getElementById('auth-exit-btn');
    delete sair.dataset.logoutBound;
    app.global('setupLogoutButton')();
    expect(sair.dataset.logoutBound).toBe('1');
  });

  test('atalho "/" abre o Extrato e foca a busca mesmo antes de a tela chegar', async () => {
    app = await subirApp();
    const d = app.document;
    const w = app.window;
    d.getElementById('aba-extrato').innerHTML = '';
    const abas = [];
    const mudarAbaReal = w.mudarAba;
    w.mudarAba = function(nome) { abas.push(nome); };
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: '/', bubbles: true }));
    w.mudarAba = mudarAbaReal;
    expect(abas).toEqual(['extrato']);

    chegar('extrato', 'extrato');
    expect(await app.esperar(() => d.activeElement && d.activeElement.id === 'extrato-busca', 1000)).toBe(true);
  });
});
