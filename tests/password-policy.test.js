/**
 * password-policy.test.js — alinhamento FE/BE de regras de senha.
 */
const PASSWORD_POLICY = require('../js/core/password-policy.js');

describe('PASSWORD_POLICY — alinhado ao backend', () => {
  test('aceita senha com 8+ chars e número', () => {
    // 'senha123' saiu daqui de propósito: agora é barrada pela blocklist.
    expect(PASSWORD_POLICY.validar('caderno42')).toEqual({ valido: true, valor: 'caderno42' });
  });

  test('aceita senha com caractere especial', () => {
    // 'abcdefg!' normaliza para sequência trivial — usar senha não conhecida.
    expect(PASSWORD_POLICY.validar('Caderno9!')).toMatchObject({ valido: true });
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

describe('PASSWORD_POLICY — senhas conhecidas por atacantes', () => {
  test('barra as campeãs de vazamento, mesmo passando nas regras de formato', () => {
    ['senha123', '12345678', 'password123', 'brasil123', 'teste123'].forEach((s) => {
      expect(PASSWORD_POLICY.validar(s)).toMatchObject({ valido: false });
    });
  });

  test('trocar letra por símbolo não salva a senha', () => {
    // Normalizamos antes de comparar: 'senha@123' é 'senha123' para o dicionário.
    expect(PASSWORD_POLICY.ehComum('senha@123')).toBe(true);
    expect(PASSWORD_POLICY.ehComum('S.E.N.H.A.1.2.3')).toBe(true);
  });

  test('acento não disfarça', () => {
    expect(PASSWORD_POLICY.ehComum('senhá123')).toBe(true);
  });

  test('sequência e repetição contam como conhecidas', () => {
    expect(PASSWORD_POLICY.ehComum('abcdefgh')).toBe(true);
    expect(PASSWORD_POLICY.ehComum('qwertyui')).toBe(true);
    expect(PASSWORD_POLICY.ehComum('aaaaaaaa')).toBe(true);
  });

  test('senha própria do usuário passa', () => {
    expect(PASSWORD_POLICY.ehComum('Chuva-Verde-42!')).toBe(false);
    expect(PASSWORD_POLICY.validar('Chuva-Verde-42!')).toMatchObject({ valido: true });
  });
});

describe('PASSWORD_POLICY.forca — medidor', () => {
  test('senha conhecida é nota 0, com o motivo', () => {
    const f = PASSWORD_POLICY.forca('senha123');
    expect(f.nota).toBe(0);
    expect(f.rotulo).toMatch(/conhecida/i);
  });

  test('a nota sobe com tamanho e variedade', () => {
    const fraca = PASSWORD_POLICY.forca('abcdefg1');
    const forte = PASSWORD_POLICY.forca('Chuva-Verde-42!');
    expect(forte.nota).toBeGreaterThan(fraca.nota);
    expect(forte.nota).toBe(4);
  });

  test('vazio não quebra o medidor', () => {
    expect(PASSWORD_POLICY.forca('')).toEqual({ nota: 0, rotulo: '' });
    expect(PASSWORD_POLICY.forca(null).nota).toBe(0);
  });

  test('o medidor informa, mas quem decide é validar()', () => {
    // Nota 1 e ainda assim aceita: força baixa não bloqueia.
    expect(PASSWORD_POLICY.forca('caderno42').nota).toBeLessThan(3);
    expect(PASSWORD_POLICY.validar('caderno42').valido).toBe(true);
  });
});
