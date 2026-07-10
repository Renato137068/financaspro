/**
 * totp.test.js — Validação TOTP (otplib)
 */
const { authenticator } = require('otplib');

describe('TOTP — códigos de 6 dígitos', function() {
  test('aceita código válido para secret fixo', function() {
    var secret = 'JBSWY3DPEHPK3PXP';
    var token = authenticator.generate(secret);
    expect(authenticator.verify({ token: token, secret: secret })).toBe(true);
  });

  test('rejeita código inválido', function() {
    var secret = 'JBSWY3DPEHPK3PXP';
    expect(authenticator.verify({ token: '000000', secret: secret })).toBe(false);
  });

  test('gera otpauth URL com issuer', function() {
    var url = authenticator.keyuri('user@test.com', 'FinançasPro', 'SECRET');
    expect(url).toContain('otpauth://totp/');
    expect(url).toContain('issuer=Finan');
  });
});
