/**
 * trial-parity.test.js — um só número de trial em todas as fontes.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CANONICAL = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'config/plan-limits.json'), 'utf8'),
);
const DAYS = CANONICAL.trialDays;

describe('trialDays — paridade canônica', function() {
  test('config/plan-limits.json define trialDays numérico positivo', function() {
    expect(typeof DAYS).toBe('number');
    expect(DAYS).toBeGreaterThan(0);
    expect(DAYS).toBe(7);
  });

  test('billing.js TRIAL_DAYS', function() {
    const src = fs.readFileSync(path.join(ROOT, 'js/billing.js'), 'utf8');
    expect(src).toMatch(new RegExp('TRIAL_DAYS:\\s*' + DAYS));
  });

  test('Express Stripe usa trial_period_days canônico', function() {
    const src = fs.readFileSync(
      path.join(ROOT, 'backend/domain/services/billing.service.js'),
      'utf8',
    );
    expect(src).toMatch(/trial_period_days:\s*TRIAL_DAYS/);
    expect(src).not.toMatch(/trial_period_days:\s*14/);
    expect(src).toMatch(/plan-limits\.json/);
  });

  test('Edge stripe-checkout usa trial_period_days canônico', function() {
    const src = fs.readFileSync(
      path.join(ROOT, 'supabase/functions/_shared/stripe-billing.ts'),
      'utf8',
    );
    const constants = fs.readFileSync(
      path.join(ROOT, 'supabase/functions/_shared/billing-constants.ts'),
      'utf8',
    );
    expect(constants).toMatch(new RegExp('TRIAL_DAYS\\s*=\\s*' + DAYS));
    expect(src).toMatch(/trial_period_days:\s*TRIAL_DAYS/);
    expect(src).not.toMatch(/trial_period_days:\s*14/);
  });

  test('paywall não anuncia 14 dias', function() {
    const init = fs.readFileSync(path.join(ROOT, 'js/modules/init-billing.js'), 'utf8');
    expect(init).not.toMatch(/Trial de 14 dias/);
    expect(init).toMatch(/TRIAL_DAYS|trialDays/);
  });

  test('Play billing runbook documenta trial canônico', function() {
    const runbook = fs.readFileSync(
      path.join(ROOT, 'docs/play-store-billing-runbook.md'),
      'utf8',
    );
    expect(runbook).toMatch(new RegExp('Trial de ' + DAYS + ' dias|\\*\\*' + DAYS + ' dias\\*\\*'));
    expect(runbook).not.toMatch(/Trial de 14 dias/);
  });
});
