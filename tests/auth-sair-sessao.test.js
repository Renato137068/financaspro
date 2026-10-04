/**
 * auth-sair-sessao.test.js — sair da conta e o rótulo de sessão do Perfil.
 * @jest-environment jsdom
 *
 * Sair pede confirmação, encerra a sessão, revoga a biometria e reabre o
 * login — sem apagar os dados do aparelho, e o aviso diz isso. O rótulo do
 * Perfil mostra quem está logado ou "Sessão local". O botão de sair do Perfil
 * chega com a tela (chunk 'config') e é ligado quando ela chega.
 */
const { carregarScript, viaGlobalDosImports } = require('./helpers/carregar-script.cjs');

const auth = carregarScript('js/authController.js', viaGlobalDosImports('js/authController.js'));

let toasts;
let confirmacoes;

beforeEach(() => {
  toasts = [];
  confirmacoes = [];
  document.body.className = '';
  document.body.innerHTML =
    '<div id="auth-overlay" style="display:none"><input id="auth-login-email"></div>' +
    '<span id="user-session-label"></span>';
  global.UTILS = { mostrarToast: (msg, tipo) => toasts.push({ msg, tipo }) };
  global.INIT_MODALS = { confirm: (msg, ok) => { confirmacoes.push(msg); ok(); } };
  global.AUTH_BIOMETRIC = { disable: jest.fn(() => Promise.resolve()) };
  global.DADOS = { encerrarSessao: jest.fn(), getSessao: () => ({ token: null, user: null }) };
});

afterEach(() => {
  ['UTILS', 'INIT_MODALS', 'AUTH_BIOMETRIC', 'DADOS', 'SUPA_AUTH'].forEach((k) => delete global[k]);
});

describe('sair da conta', () => {
  test('confirma, encerra a sessão, revoga a biometria e reabre o login', () => {
    auth.sairDaConta();

    expect(confirmacoes).toEqual(['Deseja sair da sua conta?']);
    expect(global.DADOS.encerrarSessao).toHaveBeenCalledTimes(1);
    expect(global.AUTH_BIOMETRIC.disable).toHaveBeenCalledTimes(1);
    expect(document.getElementById('auth-overlay').style.display).toBe('flex');
    expect(document.body.classList.contains('auth-overlay-open')).toBe(true);
    expect(document.activeElement.id).toBe('auth-login-email');
    expect(toasts).toEqual([{ msg: 'Você saiu da conta. Seus dados continuam neste aparelho.', tipo: 'info' }]);
    expect(document.getElementById('user-session-label').textContent).toBe('Sessão local');
  });

  test('sem o modal de confirmação disponível, sai direto', () => {
    delete global.INIT_MODALS;
    auth.sairDaConta();
    expect(global.DADOS.encerrarSessao).toHaveBeenCalledTimes(1);
    expect(document.getElementById('auth-overlay').style.display).toBe('flex');
  });

  test('o botão de sair do Perfil é ligado quando a tela chega, uma vez só', () => {
    document.body.insertAdjacentHTML('beforeend', '<button id="btn-logout"></button>');
    document.dispatchEvent(new CustomEvent('fp:tela-carregada', { detail: { nome: 'config' } }));
    document.dispatchEvent(new CustomEvent('fp:tela-carregada', { detail: { nome: 'config' } }));
    const btn = document.getElementById('btn-logout');
    expect(btn.dataset.logoutBound).toBe('1');

    btn.click();
    expect(confirmacoes).toHaveLength(1);
  });

  test('outra tela chegando não mexe no botão de sair', () => {
    document.body.insertAdjacentHTML('beforeend', '<button id="btn-logout"></button>');
    document.dispatchEvent(new CustomEvent('fp:tela-carregada', { detail: { nome: 'extrato' } }));
    expect(document.getElementById('btn-logout').dataset.logoutBound).toBeUndefined();
  });
});

describe('rótulo da sessão', () => {
  test('na nuvem, mostra o nome de quem está logado', () => {
    global.SUPA_AUTH = { isActive: () => true, getSessionSync: () => ({ user: { name: 'Ana Souza' } }) };
    auth.atualizarBarraSessao();
    expect(document.getElementById('user-session-label').textContent).toBe('Logado como Ana Souza');
  });

  test('sessão sem nome (ou sem conta) mostra "Sessão local"', () => {
    global.SUPA_AUTH = { isActive: () => true, getSessionSync: () => ({ user: { email: 'a@b.c' } }) };
    auth.atualizarBarraSessao();
    expect(document.getElementById('user-session-label').textContent).toBe('Sessão local');
  });

  test('sem o rótulo na página, não quebra', () => {
    document.body.innerHTML = '';
    expect(() => auth.atualizarBarraSessao()).not.toThrow();
  });
});
