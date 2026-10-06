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
    await new Promise((resolve) => app.window.INIT_NAVIGATION.carregarChunkConfig(resolve));
    app.window.EXCLUIR_CONTA.pedirSenha = (_msg, ok) => ok('Senha-forte-123');
    app.window.INIT_NAVIGATION.excluirConta();

    expect(await app.esperar(() =>
      app.supabase.chamadas.some((c) => c.metodo === 'rpc' && c.nome === 'fp_delete_own_account'), 2000)).toBe(true);
    // Reautenticação com a senha antes de apagar.
    expect(app.supabase.chamadas.filter((c) => c.metodo === 'signInWithPassword')).toHaveLength(2);
    expect(toasts().some((t) => /Faça login na nuvem/.test(t))).toBe(false);
  });

  test('a senha é pedida num campo de senha, e cancelar não apaga nada', async () => {
    app = await subirApp({ nuvem: { contas: CREDENCIAIS } });
    await entrar();
    app.window.INIT_MODALS.confirm = (_msg, ok) => ok();
    app.window.prompt = () => { throw new Error('window.prompt mostra a senha às claras'); };
    app.window.INIT_NAVIGATION.excluirConta();

    await app.esperar(() => app.document.getElementById('input-pedir-senha'), 2000);
    const campo = app.document.getElementById('input-pedir-senha');
    expect(campo).not.toBeNull();
    expect(campo.type).toBe('password');

    app.document.getElementById('ms-cancelar').click();
    await new Promise((r) => setTimeout(r, 50));
    expect(app.document.getElementById('input-pedir-senha')).toBeNull();
    expect(app.supabase.chamadas.some((c) => c.nome === 'fp_delete_own_account')).toBe(false);
  });

  test('senha vazia não confirma', async () => {
    app = await subirApp({ nuvem: { contas: CREDENCIAIS } });
    await entrar();
    app.window.INIT_MODALS.confirm = (_msg, ok) => ok();
    app.window.INIT_NAVIGATION.excluirConta();
    await app.esperar(() => app.document.getElementById('form-pedir-senha'), 2000);
    app.document.getElementById('form-pedir-senha')
      .dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
    expect(app.document.getElementById('input-pedir-senha')).not.toBeNull();
    expect(app.supabase.chamadas.some((c) => c.nome === 'fp_delete_own_account')).toBe(false);
  });

  test('com senha digitada no campo, a exclusão segue', async () => {
    app = await subirApp({ nuvem: { contas: CREDENCIAIS } });
    await entrar();
    app.window.INIT_MODALS.confirm = (_msg, ok) => ok();
    app.window.INIT_NAVIGATION.excluirConta();
    await app.esperar(() => app.document.getElementById('input-pedir-senha'), 2000);
    app.document.getElementById('input-pedir-senha').value = 'Senha-forte-123';
    app.document.getElementById('form-pedir-senha')
      .dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
    expect(await app.esperar(() =>
      app.supabase.chamadas.some((c) => c.metodo === 'rpc' && c.nome === 'fp_delete_own_account'), 2000)).toBe(true);
  });

  test('sem login, a sessão é vazia e a exclusão não é tentada', async () => {
    app = await subirApp({ nuvem: { contas: CREDENCIAIS } });
    expect(app.window.DADOS.getSessao()).toEqual({ token: null, user: null });
    app.window.INIT_MODALS.confirm = () => { throw new Error('não deveria confirmar'); };
    app.window.INIT_NAVIGATION.excluirConta();
    expect(app.supabase.chamadas.some((c) => c.nome === 'fp_delete_own_account')).toBe(false);
  });

  describe('aviso de assinatura (excluir a conta não cancela a cobrança na loja)', () => {
    const futuro = () => new Date(Date.now() + 10 * 86400000).toISOString();

    async function primeiraMensagem(sub) {
      app = await subirApp({ nuvem: { contas: CREDENCIAIS } });
      await entrar();
      app.window.BILLING._cache.subscription = sub;
      const mensagens = [];
      app.window.INIT_MODALS.confirm = (msg) => { mensagens.push(msg); };
      app.window.INIT_NAVIGATION.excluirConta();
      await app.esperar(() => mensagens.length > 0, 2000);
      return mensagens[0];
    }

    test('Pro pago pela Play: avisa para cancelar na Play Store', async () => {
      const msg = await primeiraMensagem({
        status: 'ACTIVE', stripeSubId: 'play:token', currentPeriodEnd: futuro(), plan: { tier: 'PRO' },
      });
      expect(msg).toMatch(/^Você tem o Pro ativo pela Google Play\. Excluir a conta não cancela a cobrança/);
    });

    test('Pro pago pelo Stripe: avisa para cancelar no Perfil', async () => {
      const msg = await primeiraMensagem({
        status: 'ACTIVE', stripeSubId: 'sub_123', currentPeriodEnd: futuro(), plan: { tier: 'PRO' },
      });
      expect(msg).toMatch(/cancele antes em Perfil, Plano e assinatura/);
    });

    test('sem cobrança a interromper, não avisa', async () => {
      for (const sub of [
        null,
        { status: 'TRIALING', stripeSubId: 'welcome:u1', trialEndsAt: futuro() },
        { status: 'ACTIVE', stripeSubId: 'play:t', cancelAtPeriodEnd: true, currentPeriodEnd: futuro() },
        { status: 'CANCELED', stripeSubId: 'play:t' },
      ]) {
        const msg = await primeiraMensagem(sub);
        expect(msg).toMatch(/^Excluir sua conta apaga da nuvem/);
        app.fechar(); app = null;
      }
    });
  });
});
