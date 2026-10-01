/**
 * app-excluir-conta.test.js — excluir a conta da nuvem, com o app inteiro.
 * @jest-environment node
 *
 * Exclusão de conta é exigência da Play (e direito do titular, LGPD art. 18,
 * VI). Até a saída da API Express, DADOS.getSessao() lia o usuário que o
 * login da API gravava no aparelho; quem entrava pelo Supabase (o app da
 * loja) nunca tinha esse usuário, e "Excluir conta" respondia "Faça login na
 * nuvem" a quem estava logado. A exclusão nunca chegava ao banco.
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

async function entrar() {
  digitar('auth-login-email', 'ana@exemplo.com');
  enviar('auth-login-step-email');
  await app.esperar(() => !app.document.getElementById('auth-login-form').hidden, 1000);
  digitar('auth-login-password', 'Senha-forte-123');
  enviar('auth-login-form');
  await app.esperar(() => !app.document.body.classList.contains('auth-overlay-open'), 4000);
}

function toasts() {
  return [...app.document.querySelectorAll('.toast, [role="status"], [role="alert"]')]
    .map((t) => t.textContent.trim()).filter(Boolean);
}

describe('Excluir conta (nuvem)', () => {
  test('logado pelo Supabase: a sessão aparece para o app e a exclusão chega ao banco', async () => {
    app = await subirApp({ nuvem: { contas: CREDENCIAIS } });
    await entrar();

    expect(app.window.DADOS.getSessao().user).toMatchObject({ email: 'ana@exemplo.com' });

    app.window.INIT_MODALS.confirm = (_msg, ok) => ok();
    app.window.prompt = () => 'Senha-forte-123';
    app.window.INIT_NAVIGATION.excluirConta();

    expect(await app.esperar(() =>
      app.supabase.chamadas.some((c) => c.metodo === 'rpc' && c.nome === 'fp_delete_own_account'), 2000)).toBe(true);
    // Reautenticação com a senha antes de apagar.
    expect(app.supabase.chamadas.filter((c) => c.metodo === 'signInWithPassword')).toHaveLength(2);
    expect(toasts().some((t) => /Faça login na nuvem/.test(t))).toBe(false);
  });

  test('sem senha no prompt, nada é apagado', async () => {
    app = await subirApp({ nuvem: { contas: CREDENCIAIS } });
    await entrar();
    app.window.INIT_MODALS.confirm = (_msg, ok) => ok();
    app.window.prompt = () => null;
    app.window.INIT_NAVIGATION.excluirConta();
    await new Promise((r) => setTimeout(r, 50));
    expect(app.supabase.chamadas.some((c) => c.nome === 'fp_delete_own_account')).toBe(false);
  });

  test('sem login, a sessão é vazia e a exclusão não é tentada', async () => {
    app = await subirApp({ nuvem: { contas: CREDENCIAIS } });
    expect(app.window.DADOS.getSessao()).toEqual({ token: null, user: null });
    app.window.INIT_MODALS.confirm = () => { throw new Error('não deveria confirmar'); };
    app.window.INIT_NAVIGATION.excluirConta();
    expect(app.supabase.chamadas.some((c) => c.nome === 'fp_delete_own_account')).toBe(false);
  });
});
