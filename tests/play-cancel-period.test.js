/**
 * play-cancel-period.test.js — cancelamento Play no período pago.
 * Detecta cancelAtPeriodEnd no payload v2 e mensagem de dias restantes.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('Play cancel-at-period-end', () => {
  test('Edge google-play detecta CANCELED e autoRenewEnabled=false', () => {
    const src = fs.readFileSync(
      path.join(root, 'supabase/functions/_shared/google-play.ts'),
      'utf8',
    );
    expect(src).toMatch(/isCancelAtPeriodEnd/);
    expect(src).toMatch(/SUBSCRIPTION_STATE_CANCELED/);
    expect(src).toMatch(/autoRenewEnabled === false/);
    expect(src).toMatch(/cancelAtPeriodEnd:\s*isCancelAtPeriodEnd/);
  });

  test('upsertPlayEntitlement grava cancelAtPeriodEnd (não zera sempre)', () => {
    const db = fs.readFileSync(
      path.join(root, 'supabase/functions/_shared/db.ts'),
      'utf8',
    );
    expect(db).toMatch(/cancelAtPeriodEnd:\s*!!opts\.cancelAtPeriodEnd/);
    const play = fs.readFileSync(
      path.join(root, 'supabase/functions/_shared/play-billing.ts'),
      'utf8',
    );
    expect(play).toMatch(/cancelAtPeriodEnd:\s*!!sub\.cancelAtPeriodEnd/);
  });

  test('cliente anuncia dias restantes após cancelar', () => {
    const billing = fs.readFileSync(path.join(root, 'js/billing.js'), 'utf8');
    expect(billing).toMatch(/Mais ' \+ dias \+ ' dia/);
    expect(billing).toMatch(/Último dia de Pro/);
    expect(billing).toMatch(/\(cancelado\)/);
  });
});

describe('getLifecycleAlert — cancelamento', () => {
  const billingHelpers = require('../js/billing.js');

  test('mostra dias restantes quando cancelAtPeriodEnd', () => {
    const em5 = new Date(Date.now() + 5 * 86400000).toISOString();
    const alert = billingHelpers.getLifecycleAlert({
      status: 'ACTIVE',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: em5,
      plan: { name: 'Pro', tier: 'PRO' },
    }, true);
    expect(alert).toBeTruthy();
    expect(alert.title).toMatch(/Mais 5 dias de Pro|Mais 4 dias de Pro/);
    expect(alert.message).toMatch(/cancelou|gratuito/i);
  });
});
