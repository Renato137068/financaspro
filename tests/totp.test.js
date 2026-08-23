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
    // O issuer é o nome do produto e vem de backend/lib/totp.js. O teste lê
    // o valor de lá em vez de repetir a string: assim ele continua valendo
    // depois de uma troca de marca, que foi o que o quebrou uma vez.
    var fs = require('fs');
    var path = require('path');
    var fonte = fs.readFileSync(
      path.join(__dirname, '..', 'backend', 'lib', 'totp.js'), 'utf8');
    var emissor = (fonte.match(/const ISSUER\s*=\s*'([^']+)'/) || [])[1];
    expect(emissor).toBeTruthy();

    var url = authenticator.keyuri('user@test.com', emissor, 'SECRET');
    expect(url).toContain('otpauth://totp/');
    expect(url).toContain('issuer=' + encodeURIComponent(emissor));
  });
});
