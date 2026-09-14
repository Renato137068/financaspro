/**
 * auth-resend-cooldown.test.js — cooldown do botão "reenviar e-mail".
 *
 * Contexto (incidente do grupo de testes): sem cooldown, quem não recebia o
 * e-mail clicava repetido e cada clique gastava a cota de e-mail do Supabase,
 * estourando o limite do projeto e bloqueando o cadastro de todos. O cooldown
 * trava o botão por 60s com contagem regressiva mesmo se o reenvio falhar.
 * @jest-environment jsdom
 */
const AUTH = require('../js/authController.js');

describe('authResendCooldown', function() {
  beforeEach(function() { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-09-14T12:00:00Z')); });
  afterEach(function() { jest.useRealTimers(); });

  function botao() {
    document.body.innerHTML = '<button id="b">Reenviar e-mail</button>';
    return document.getElementById('b');
  }

  test('trava o botão e mostra a contagem regressiva', function() {
    var b = botao();
    AUTH.authResendCooldown(b, 60);
    expect(b.disabled).toBe(true);
    expect(b.textContent).toBe('Reenviar em 60s');
    jest.advanceTimersByTime(1000);
    expect(b.textContent).toBe('Reenviar em 59s');
    jest.advanceTimersByTime(58000);
    expect(b.disabled).toBe(true); // ainda 1s
    expect(b.textContent).toBe('Reenviar em 1s');
  });

  test('ao fim do tempo, reabilita e restaura o rótulo', function() {
    var b = botao();
    AUTH.authResendCooldown(b, 3);
    expect(b.disabled).toBe(true);
    jest.advanceTimersByTime(3000);
    expect(b.disabled).toBe(false);
    expect(b.textContent).toBe('Reenviar e-mail');
  });

  test('a função de parada restaura o botão imediatamente (caso de sucesso)', function() {
    var b = botao();
    var parar = AUTH.authResendCooldown(b, 60);
    parar();
    expect(b.disabled).toBe(false);
    expect(b.textContent).toBe('Reenviar e-mail');
    // não deve mais alterar o botão após parar
    jest.advanceTimersByTime(5000);
    expect(b.textContent).toBe('Reenviar e-mail');
  });

  test('segundos inválidos caem no padrão de 60s', function() {
    var b = botao();
    AUTH.authResendCooldown(b, 0);
    expect(b.textContent).toBe('Reenviar em 60s');
  });
});
