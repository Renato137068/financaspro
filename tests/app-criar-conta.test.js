/**
 * app-criar-conta.test.js — o cadastro da nuvem, com o app inteiro e um Supabase falso.
 * @jest-environment node
 *
 * Até aqui o formulário "Criar conta" só era conferido lendo o HTML (o link da
 * Política de Privacidade). Se o botão parasse de funcionar, a CI continuava
 * verde. Aqui o caminho é o de quem usa: tocar na aba, preencher, enviar.
 *
 * O consentimento é declarado pelo próprio envio (nota abaixo do botão, sem
 * caixa de marcar), então o que se confere é que a nota com o link está no
 * formulário que de fato é enviado.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

/** O ping de saúde usa fetch; aqui o servidor responde. */
function servidorDePe() {
  app.window.fetch = (url) => {
    if (/\/auth\/v1\/health/.test(String(url))) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ name: 'GoTrue' }) });
    }
    return Promise.reject(new Error('sem rede no teste'));
  };
}

function digitar(id, texto) {
  const el = app.document.getElementById(id);
  el.value = texto;
  el.dispatchEvent(new app.window.Event('input', { bubbles: true }));
}

function clicar(el) {
  el.dispatchEvent(new app.window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

/** Toca no botão de envio, como o dedo: o form recebe o submit. */
function enviarCadastro() {
  const form = app.document.getElementById('auth-register-form');
  const botao = form.querySelector('button[type="submit"]');
  expect(botao.textContent).toMatch(/Criar conta/);
  form.dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
}

const $ = (id) => app.document.getElementById(id);
const mensagem = () => $('auth-message').textContent.trim();
const toasts = () => Array.from(app.document.querySelectorAll('.toast')).map((t) => t.textContent.trim());
const chamadasSignUp = () => app.supabase.chamadas.filter((c) => c.metodo === 'signUp');

async function abrirCadastro() {
  clicar($('auth-tab-register'));
  expect(await app.esperar(() => !$('auth-register-form').hidden, 1000)).toBe(true);
}

async function preencher(nome, email, senha) {
  await abrirCadastro();
  digitar('auth-register-name', nome);
  digitar('auth-register-email', email);
  digitar('auth-register-password', senha);
}

describe('Criar conta na nuvem', () => {
  test('a aba "Criar conta" troca o formulário e mostra a nota de privacidade', async () => {
    app = await subirApp({ nuvem: {} });
    expect($('auth-register-form').hidden).toBe(true);

    await abrirCadastro();

    expect($('auth-login-flow').hidden).toBe(true);
    expect($('auth-tab-register').getAttribute('aria-selected')).toBe('true');
    expect($('auth-dialog-title').textContent).toBe('Criar conta');
    const nota = $('auth-register-form').querySelector('.auth-consent-note a[href="privacidade.html"]');
    expect(nota).not.toBeNull();
    expect(app.erros).toEqual([]);
  });

  test('cadastro completo: chama signUp com nome e e-mail e pede a confirmação do e-mail', async () => {
    app = await subirApp({ nuvem: {} });
    servidorDePe();
    await preencher('Bia Souza', 'bia@exemplo.com', 'Cofre#forte-2026');
    enviarCadastro();

    expect(await app.esperar(() => /e-mail de confirmação/i.test(mensagem()), 3000)).toBe(true);
    expect(chamadasSignUp()).toEqual([{ metodo: 'signUp', email: 'bia@exemplo.com', nome: 'Bia Souza' }]);
    expect(toasts()).toContain('Confirme seu e-mail para entrar.');

    // Volta ao login já no passo da senha, com o e-mail preenchido e o reenvio à mão.
    expect($('auth-register-form').hidden).toBe(true);
    expect($('auth-login-form').hidden).toBe(false);
    expect($('auth-login-email').value).toBe('bia@exemplo.com');
    expect($('auth-resend-email-btn').hidden).toBe(false);
    // Sem sessão (falta confirmar), o app continua fechado.
    expect(app.document.body.classList.contains('auth-overlay-open')).toBe(true);
    expect(app.erros).toEqual([]);
  });

  test('senha fraca não chega ao Supabase', async () => {
    app = await subirApp({ nuvem: {} });
    servidorDePe();
    await preencher('Bia', 'bia@exemplo.com', '12345678');
    enviarCadastro();
    await new Promise((r) => setTimeout(r, 150));

    expect(chamadasSignUp()).toEqual([]);
    expect(toasts().join(' ')).toMatch(/senha/i);
    expect($('auth-register-form').hidden).toBe(false);
  });

  test('senha curta, sem número nem símbolo, também para antes do servidor', async () => {
    app = await subirApp({ nuvem: {} });
    servidorDePe();
    await preencher('Bia', 'bia@exemplo.com', 'abc');
    enviarCadastro();
    await new Promise((r) => setTimeout(r, 150));

    expect(chamadasSignUp()).toEqual([]);
  });

  test('e-mail já cadastrado: mensagem que não revela a conta', async () => {
    app = await subirApp({ nuvem: { jaCadastrados: ['ana@exemplo.com'] } });
    servidorDePe();
    await preencher('Ana', 'ana@exemplo.com', 'Cofre#forte-2026');
    enviarCadastro();

    expect(await app.esperar(() => /Não foi possível concluir o cadastro/.test(mensagem()), 3000)).toBe(true);
    expect(mensagem()).not.toMatch(/já|already|registered/i);
    expect(chamadasSignUp()).toHaveLength(1);
    expect($('auth-register-form').hidden).toBe(false);
    // O botão volta a aceitar toque depois da falha.
    expect(await app.esperar(() => !$('auth-register-form').querySelector('button[type="submit"]').disabled, 1000)).toBe(true);
  });

  test('servidor fora do ar: avisa e não tenta cadastrar', async () => {
    app = await subirApp({ nuvem: {} });
    // fetch padrão do harness rejeita: o ping falha.
    await preencher('Bia', 'bia@exemplo.com', 'Cofre#forte-2026');
    enviarCadastro();

    expect(await app.esperar(() => mensagem() !== '' && !/Preencha/.test(mensagem()), 3000)).toBe(true);
    expect(chamadasSignUp()).toEqual([]);
  });
});
