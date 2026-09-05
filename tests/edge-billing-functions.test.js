/**
 * edge-billing-functions.test.js — contratos das Edge Functions de billing.
 *
 * Não executa Deno: valida o TypeScript fonte (auth, OWNER, gates, trial).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const fn = (name) =>
  fs.readFileSync(path.join(ROOT, 'supabase/functions', name, 'index.ts'), 'utf8');
const shared = (name) =>
  fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared', name), 'utf8');

describe('Edge stripe-portal', function() {
  const src = fn('stripe-portal');

  test('POST + JWT + OWNER + createPortal', function() {
    expect(src).toMatch(/req\.method !== "POST"/);
    expect(src).toMatch(/auth\.getUser\(jwt\)/);
    expect(src).toMatch(/role !== "OWNER"/);
    expect(src).toMatch(/createPortal/);
    expect(src).toMatch(/returnUrl/);
  });
});

describe('Edge stripe-cancel', function() {
  const src = fn('stripe-cancel');

  test('POST + JWT + OWNER + cancelSubscription', function() {
    expect(src).toMatch(/req\.method !== "POST"/);
    expect(src).toMatch(/auth\.getUser\(jwt\)/);
    expect(src).toMatch(/role !== "OWNER"/);
    expect(src).toMatch(/cancelSubscription/);
  });
});

describe('Edge org-invite', function() {
  const src = fn('org-invite');

  test('exige PRO+ e respeita teto de assentos', function() {
    expect(src).toMatch(/tier === "FREE"/);
    expect(src).toMatch(/upgrade-necessario/);
    expect(src).toMatch(/limite-membros/);
    expect(src).toMatch(/OWNER.*ADMIN|callerRole !== "OWNER"/);
  });

  test('cria Invitation e notifica invite-member', function() {
    expect(src).toMatch(/\.from\("Invitation"\)/);
    expect(src).toMatch(/notify\("invite-member"/);
    expect(src).toMatch(/expiresAt/);
  });
});

describe('Edge stripe-billing shared', function() {
  const src = shared('stripe-billing.ts');
  const constants = shared('billing-constants.ts');

  test('checkout usa TRIAL_DAYS canônico', function() {
    expect(constants).toMatch(/TRIAL_DAYS\s*=\s*7/);
    expect(src).toMatch(/trial_period_days:\s*TRIAL_DAYS/);
  });

  test('exporta createPortal e cancelSubscription', function() {
    expect(src).toMatch(/export async function createPortal/);
    expect(src).toMatch(/export async function cancelSubscription/);
    expect(src).toMatch(/cancel_at_period_end:\s*true/);
  });
});
