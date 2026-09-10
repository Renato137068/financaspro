/**
 * pagamento-form.test.js — PIX no padrão; XP/B3 fora.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('Forma de pagamento no Novo', function() {
  test('HTML padrão tem PIX e não tem XP/B3', function() {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const idx = html.indexOf('for="novo-cartao"');
    const bloco = html.slice(idx, idx + 900);
    expect(bloco).toMatch(/Pagamento/);
    expect(bloco).toMatch(/PIX/);
    expect(bloco).not.toMatch(/>XP</);
    expect(bloco).not.toMatch(/>B3</);
  });

  test('init-form remove XP/B3 e inclui PIX no fallback', function() {
    const src = fs.readFileSync(path.join(root, 'js/modules/init-form.js'), 'utf8');
    expect(src).toMatch(/PIX/);
    expect(src).toMatch(/CARTAO_REMOVIDOS/);
    expect(src).toMatch(/XP:\s*1/);
    expect(src).toMatch(/B3:\s*1/);
    expect(src).not.toMatch(/\['Crédito', 'Débito', 'XP', 'B3'\]/);
  });
});
