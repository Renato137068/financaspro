/**
 * usuarios-virtuais-fixes.test.js — dois achados da auditoria "usuários virtuais"
 * (exploração do app como várias personas no navegador):
 *   1. A tela de planos ficava presa em "Carregando planos…" offline, porque
 *      listPlans() fica PENDENTE (não rejeita) sem rede. Um teto de tempo cai
 *      nos planos estáticos.
 *   2. O CTA "Defina sua renda" ficava branco/brilhante no tema escuro
 *      (--color-bg-body-soft não tem override escuro). Agora usa uma superfície
 *      escura sob [data-theme="dark"].
 * Testes estáticos, no estilo de regressão do repo.
 */
const fs = require('fs');
const path = require('path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('paywall — não trava em "Carregando planos…" offline', () => {
  const billing = read('js/modules/init-billing.js');
  const fn = billing.slice(billing.indexOf('_renderPlans:'), billing.indexOf('_renderFooter:'));

  test('há um teto de tempo (setTimeout) no carregamento dos planos', () => {
    expect(fn).toMatch(/setTimeout\(/);
  });

  test('o timeout cai nos planos estáticos (vitrine offline)', () => {
    expect(fn).toContain('BILLING.STATIC_PLANS');
    // guarda contra render duplo: um flag "settled".
    expect(fn).toMatch(/settled/);
  });

  test('o timer é cancelado quando listPlans resolve/rejeita', () => {
    expect(fn).toMatch(/clearTimeout\(/);
  });
});

describe('CTA "Defina sua renda" — superfície escura no tema escuro', () => {
  const css = read('css/layouts/dashboard.css');

  test('há override de fundo sob [data-theme="dark"] para .indicador-cta', () => {
    expect(css).toMatch(/\[data-theme="dark"\]\s+\.indicador-cta\s*\{[^}]*background:\s*var\(--color-bg-dark-card\)/);
  });

  test('o override não usa a tinta clara --color-bg-body-soft', () => {
    var bloco = css.slice(css.indexOf('[data-theme="dark"] .indicador-cta'));
    bloco = bloco.slice(0, bloco.indexOf('}'));
    expect(bloco).not.toContain('--color-bg-body-soft');
  });
});
