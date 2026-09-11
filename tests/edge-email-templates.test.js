/**
 * edge-email-templates.test.js — contratos dos templates de e-mail Edge.
 *
 * Não roda Deno: valida o arquivo TypeScript fonte (templates + Resend)
 * e um espelho mínimo do render de invite para o link ?invite=.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const emailTs = fs.readFileSync(
  path.join(ROOT, 'supabase/functions/_shared/email.ts'),
  'utf8',
);

describe('Edge email templates (fonte)', function() {
  test('expõe templates de billing e convite', function() {
    ['subscription-activated', 'subscription-canceled', 'payment-failed', 'invite-member']
      .forEach(function(name) {
        expect(emailTs).toContain('case "' + name + '"');
      });
  });

  test('usa Resend com fallback de log sem key', function() {
    expect(emailTs).toMatch(/api\.resend\.com\/emails/);
    expect(emailTs).toMatch(/RESEND_API_KEY/);
    expect(emailTs).toMatch(/simulated:\s*true/);
  });

  test('convite gera link ?invite= compatível com o client', function() {
    expect(emailTs).toMatch(/\?invite=\$\{encodeURIComponent\(token\)\}/);
    const billing = fs.readFileSync(path.join(ROOT, 'js/billing.js'), 'utf8');
    expect(billing).toMatch(/\?invite=/);
  });

  test('payment-failed não interpola dados sensíveis de cartão', function() {
    const start = emailTs.indexOf('case "payment-failed"');
    const chunk = emailTs.slice(start, start + 600);
    expect(chunk).not.toMatch(/card|cartão|cvv|últimos dígitos/i);
    expect(chunk).toMatch(/Atualize seu método de pagamento/);
  });

  test('subscription-activated não promete “todos os recursos”', function() {
    expect(emailTs).toMatch(/Aproveite o Pro:/);
    expect(emailTs).not.toMatch(/todos os recursos/i);
  });
});
