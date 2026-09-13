/**
 * auth-consent-capslock.test.js — duas melhorias de boas práticas na tela
 * de login/cadastro:
 *   1. Consentimento/link legal (LGPD) no ponto de criação da conta.
 *   2. Aviso de Caps Lock no campo de senha (erro clássico de desktop).
 *
 * Testes estáticos, no mesmo estilo de auth-ux-regressao.test.js: travam a
 * correção para que não seja desfeita sem alguém ver.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Cadastro — consentimento/link legal (LGPD)', () => {
  const html = read('index.html');
  const registerForm = html.slice(
    html.indexOf('id="auth-register-form"'),
    html.indexOf('</form>', html.indexOf('id="auth-register-form"'))
  );

  test('o formulário de criar conta linka a Política de Privacidade', () => {
    expect(registerForm).toContain('href="privacidade.html"');
    expect(registerForm).toMatch(/Pol[ií]tica de Privacidade/);
  });

  test('o link abre em nova aba com rel=noopener (não perde o app)', () => {
    expect(registerForm).toContain('target="_blank"');
    expect(registerForm).toContain('rel="noopener"');
  });

  test('a página de privacidade linkada existe', () => {
    expect(fs.existsSync(path.join(root, 'privacidade.html'))).toBe(true);
  });
});

describe('Senha — aviso de Caps Lock', () => {
  const ctrl = read('js/authController.js');

  test('monta o aviso nos três campos de senha', () => {
    expect(ctrl).toContain("_montarAvisoCapsLock('auth-login-password')");
    expect(ctrl).toContain("_montarAvisoCapsLock('auth-register-password')");
    expect(ctrl).toContain("_montarAvisoCapsLock('auth-reset-password')");
  });

  test('detecta o estado do Caps Lock via getModifierState', () => {
    const fn = ctrl.slice(
      ctrl.indexOf('function _montarAvisoCapsLock'),
      ctrl.indexOf("_montarAvisoCapsLock('auth-login-password')")
    );
    expect(fn).toContain("getModifierState('CapsLock')");
    expect(fn).toContain("addEventListener('keydown'");
    expect(fn).toContain("addEventListener('keyup'");
    // Some ao desfocar — não fica preso na tela.
    expect(fn).toContain("addEventListener('blur'");
    // role=status para anúncio acessível.
    expect(fn).toContain("setAttribute('role', 'status')");
  });

  test('o CSS do aviso usa tokens (sem cor hex crua)', () => {
    const css = read('css/features/auth.css');
    const bloco = css.slice(
      css.indexOf('.auth-capslock-aviso {'),
      css.indexOf('.auth-capslock-aviso i {')
    );
    expect(bloco).toContain('var(--color-warning-bg)');
    expect(bloco).not.toMatch(/#[0-9a-fA-F]{3,6}(?![\w-])/);
  });
});
