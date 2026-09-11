/**
 * billing-soft-ai-invite.test.js — soft paywall local + invite sem bypass Edge.
 */
const fs = require('fs');
const path = require('path');
const billingHelpers = require('../js/billing.js');

describe('OCR removido do produto', function() {
  test('cota OCR é noop (Infinity) em qualquer tier', function() {
    var free = billingHelpers.ocrQuota({ usesConsumed: 99, tier: 'FREE', consume: true });
    expect(free.remaining).toBe(Infinity);
    expect(free.remainingAfter).toBe(Infinity);
    var pro = billingHelpers.ocrQuota({ usesConsumed: 0, tier: 'PRO' });
    expect(pro.remaining).toBe(Infinity);
  });
});

describe('Invite Edge — sem bypass silencioso', function() {
  test('client não faz fallback para inviteMember em 404/503', function() {
    const billing = fs.readFileSync(path.join(__dirname, '..', 'js/billing.js'), 'utf8');
    expect(billing).toMatch(/org-invite-unavailable/);
    expect(billing).toMatch(/Serviço de convites indisponível/);
    // Não deve chamar inviteMember no catch do org-invite
    const catchBlock = billing.slice(
      billing.indexOf("invoke('org-invite'"),
      billing.indexOf('inviteShareUrl'),
    );
    expect(catchBlock).not.toMatch(/inviteMember\(/);
  });

  test('o paywall vende capacidade, não remoção de limite', function() {
    const init = fs.readFileSync(
      path.join(__dirname, '..', 'js/modules/init-billing.js'),
      'utf8',
    );
    expect(init).not.toMatch(/todos os recursos locais/i);
    // "tira os limites" posiciona a assinatura como pedágio: o usuário paga
    // para desfazer um obstáculo que o próprio app criou.
    expect(init).not.toMatch(/tira os limites/i);
    expect(init).not.toMatch(/sem limites de uso/i);
    expect(init).toMatch(/O Pro cuida do seu mês por você/);
  });

  test('init-billing captura ?invite= e consome pending', function() {
    const init = fs.readFileSync(
      path.join(__dirname, '..', 'js/modules/init-billing.js'),
      'utf8',
    );
    expect(init).toMatch(/_handleInviteReturn/);
    expect(init).toMatch(/_consumePendingInvite/);
    expect(init).toMatch(/fp-pending-invite/);
    expect(init).toMatch(/params\.get\('invite'\)/);
    expect(init).toMatch(/acceptInvite/);
  });

  test('abrirPaywall não é no-op sem nuvem', function() {
    const init = fs.readFileSync(
      path.join(__dirname, '..', 'js/modules/init-billing.js'),
      'utf8',
    );
    const chunk = init.slice(init.indexOf('abrirPaywall:'), init.indexOf('_setInterval:'));
    expect(chunk).not.toMatch(/_nuvemAtiva\(\)[\s\S]{0,80}\{\s*return;\s*\}/);
    expect(chunk).toMatch(/_fecharPaywall/);
  });

  test('insights avançados são gate de plano, não cota', function() {
    const insights = fs.readFileSync(path.join(__dirname, '..', 'js/insights.js'), 'utf8');
    // A cota por uso saiu: ou o plano tem inteligência, ou não tem. Contar
    // usos de conselho fazia o usuário racionar exatamente o que deveria
    // experimentar para querer assinar.
    expect(insights).not.toMatch(/consumeLocalAiUse/);
    expect(insights).not.toMatch(/_localSoftUseConsumed/);
    expect(insights).toMatch(/canUse\('aiFeatures'\)/);
  });

  test('SIGNED_IN consome convite pendente', function() {
    const sync = fs.readFileSync(
      path.join(__dirname, '..', 'js/core/supabase-sync.js'),
      'utf8',
    );
    expect(sync).toMatch(/_consumePendingInvite/);
    expect(sync).toMatch(/SIGNED_IN/);
  });

  test('restore Play vazio não finge sucesso', function() {
    const init = fs.readFileSync(
      path.join(__dirname, '..', 'js/modules/init-billing.js'),
      'utf8',
    );
    expect(init).toMatch(/Nenhuma compra encontrada nesta conta Google/);
  });
});
