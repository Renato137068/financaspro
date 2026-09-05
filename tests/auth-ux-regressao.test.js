/**
 * auth-ux-regressao.test.js — três bugs reportados na tela de entrar:
 *   1. biometria não entrava depois de fechar e reabrir o app;
 *   2. rodapé da tela cortado (sem rolagem no overlay);
 *   3. "Esqueci minha senha" sem retorno visível (toast atrás do overlay).
 *
 * Testes estáticos: não provam o comportamento em runtime, mas travam a
 * correção para que ela não seja desfeita sem alguém ver.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Biometria — reabrir o app não invalida o login', () => {
  const bio = read('js/auth-biometric.js');

  test('usa a sessão existente antes de tocar no token do Keystore', () => {
    const trecho = bio.slice(bio.indexOf('tryLogin:'), bio.indexOf('_loginComKeystore:'));
    expect(trecho).toContain('SUPA_AUTH.validate');
    expect(trecho).toContain('getSessionSync');
    // O restore do Keystore saiu do caminho principal.
    expect(trecho).not.toContain('restoreSession');
  });

  test('restaurar do Keystore regrava o token rotacionado', () => {
    const trecho = bio.slice(bio.indexOf('_loginComKeystore:'));
    expect(trecho).toContain('restoreSession');
    expect(trecho).toContain('onLoginSuccess');
  });

  test('token já usado vira instrução, não erro cru', () => {
    expect(bio).toMatch(/already used\|invalid refresh token/);
    expect(bio).toContain('Entre com a senha uma vez para reativar a biometria');
  });

  test('só desativa a biometria quando a credencial some de verdade', () => {
    expect(bio).toMatch(/not found\|no credentials[\s\S]{0,120}disable\(\)/);
  });
});

describe('Tela de entrar — nada de conteúdo cortado', () => {
  const css = read('css/features/auth.css');
  // Comentários citam as regras antigas — comparar só declaração de verdade.
  const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const overlay = semComentarios.slice(
    semComentarios.indexOf('.auth-overlay {'),
    semComentarios.indexOf('.auth-overlay[style'),
  );

  test('o overlay rola quando o conteúdo não cabe', () => {
    expect(overlay).toContain('overflow-y: auto');
    expect(overlay).toContain('align-items: flex-start');
    expect(overlay).not.toMatch(/align-items:\s*center/);
  });

  test('o cartão continua centralizado quando cabe', () => {
    expect(semComentarios).toMatch(/\.auth-overlay > \.auth-card[\s\S]{0,80}margin: auto/);
  });

  test('o rodapé respeita a safe-area do aparelho', () => {
    expect(semComentarios).toMatch(/\.auth-shell[\s\S]{0,300}env\(safe-area-inset-bottom/);
  });

  test('a Activity redimensiona quando o teclado abre', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('android:windowSoftInputMode="adjustResize"');
  });
});

describe('Avisos da tela de entrar são visíveis', () => {
  test('o toast fica acima do overlay de login', () => {
    const ds = read('css/design-system.css');
    const toast = Number((ds.match(/--z-toast:\s*(\d+)/) || [])[1]);
    const overlay = Number((ds.match(/--z-overlay:\s*(\d+)/) || [])[1]);
    // O login em tela cheia usa z-overlay + 10.
    expect(toast).toBeGreaterThan(overlay + 10);
  });

  test('"Esqueci minha senha" não submete o formulário', () => {
    const html = read('index.html');
    expect(html).toMatch(/id="auth-forgot-password"[^>]*|<button type="button" id="auth-forgot-password"/);
    const btn = html.slice(html.indexOf('id="auth-forgot-password"') - 60, html.indexOf('id="auth-forgot-password"') + 40);
    expect(btn).toContain('type="button"');
  });
});
