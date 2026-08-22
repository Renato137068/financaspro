/**
 * password-policy.test.js — alinhamento FE/BE de regras de senha.
 */
const PASSWORD_POLICY = require('../js/core/password-policy.js');

describe('PASSWORD_POLICY — alinhado ao backend', () => {
  test('aceita senha com 8+ chars e número', () => {
    expect(PASSWORD_POLICY.validar('senha123')).toEqual({ valido: true, valor: 'senha123' });
  });

  test('aceita senha com caractere especial', () => {
    expect(PASSWORD_POLICY.validar('abcdefg!')).toMatchObject({ valido: true });
  });

  test('rejeita menos de 8 caracteres', () => {
    expect(PASSWORD_POLICY.validar('abc1!')).toMatchObject({
      valido: false,
      erro: 'Senha deve ter pelo menos 8 caracteres',
    });
  });

  test('rejeita só letras (sem número nem especial)', () => {
    expect(PASSWORD_POLICY.validar('abcdefgh')).toMatchObject({
      valido: false,
      erro: 'Senha deve conter pelo menos um número ou caractere especial',
    });
  });

  test('rejeita senha acima de 128 caracteres', () => {
    expect(PASSWORD_POLICY.validar('a1!' + 'x'.repeat(130)).valido).toBe(false);
  });
});
