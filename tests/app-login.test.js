/**
 * app-login.test.js — o login da nuvem, com o app inteiro e um Supabase falso.
 * @jest-environment node
 *
 * Build de nuvem (sem fp-force-local) e cliente Supabase trocado por um dublê
 * com a mesma superfície (tests/helpers/app-jsdom.cjs). O resto — overlay,
 * authController, SUPA_AUTH, boot — é o código real.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');

const CREDENCIAIS = { 'ana@exemplo.com': 'Senha-forte-123' };

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

function enviar(formId) {
  app.document.getElementById(formId)
    .dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
}

function digitar(id, texto) {
  const el = app.document.getElementById(id);
  el.value = texto;
  el.dispatchEvent(new app.window.Event('input', { bubbles: true }));
}

const overlay = () => app.document.getElementById('auth-overlay');
const mensagem = () => app.document.getElementById('auth-message').textContent.trim();
const loginAberto = () => overlay().style.display !== 'none'
  && app.document.body.classList.contains('auth-overlay-open');

async function irParaSenha(email) {
  digitar('auth-login-email', email);
  enviar('auth-login-step-email');
  await app.esperar(() => !app.document.getElementById('auth-login-form').hidden, 1000);
}

describe('Login na nuvem', () => {
  test('sem sessão, o login aparece antes do app', async () => {
    app = await subirApp({ nuvem: { contas: CREDENCIAIS } });
    expect(loginAberto()).toBe(true);
    expect(app.erros).toEqual([]);
  });

  test('o passo do e-mail leva à senha e mostra o e-mail mascarado', async () => {
    app = await subirApp({ nuvem: { contas: CREDENCIAIS } });
    await irParaSenha('ana@exemplo.com');

    expect(app.document.getElementById('auth-login-form').hidden).toBe(false);
    const saudacao = app.document.getElementById('auth-greeting-email').textContent;
    expect(saudacao).toMatch(/@exemplo\.com$/);
    expect(saudacao).not.toContain('ana@');
  });

  test('senha errada: mensagem clara e o login continua aberto', async () => {
    app = await subirApp({ nuvem: { contas: CREDENCIAIS } });
    await irParaSenha('ana@exemplo.com');
    digitar('auth-login-password', 'senha-errada');
    enviar('auth-login-form');

    expect(await app.esperar(() => /inválid/i.test(mensagem()))).toBe(true);
    expect(mensagem()).toBe('E-mail ou senha inválidos.');
    expect(loginAberto()).toBe(true);
    expect(app.supabase.chamadas).toEqual([{ metodo: 'signInWithPassword', email: 'ana@exemplo.com' }]);
  });

  test('senha certa: o login fecha e o dashboard aparece', async () => {
    app = await subirApp({ nuvem: { contas: CREDENCIAIS } });
    await irParaSenha('ana@exemplo.com');
    digitar('auth-login-password', 'Senha-forte-123');
    enviar('auth-login-form');

    expect(await app.esperar(() => !loginAberto(), 4000)).toBe(true);
    expect(await app.esperar(() =>
      app.document.getElementById('aba-resumo').getAttribute('data-dashboard-ready') === '1')).toBe(true);
    expect(app.erros).toEqual([]);
  });

  test('e-mail inválido não avança nem chama o Supabase', async () => {
    app = await subirApp({ nuvem: { contas: CREDENCIAIS } });
    digitar('auth-login-email', 'ana@');
    enviar('auth-login-step-email');
    await new Promise((r) => setTimeout(r, 150));

    expect(app.document.getElementById('auth-login-form').hidden).toBe(true);
    expect(app.supabase.chamadas).toEqual([]);
  });
});
