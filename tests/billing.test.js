/**
 * billing.test.js — Mapeamento de planos e limites SaaS
 */

var billingHelpers = require('../js/billing.js');

describe('Billing — tiers e limites', function() {
  test('mapeia plano local para tier', function() {
    expect(billingHelpers.tierFromPlano('free')).toBe('FREE');
    expect(billingHelpers.tierFromPlano('premium')).toBe('PRO');
    expect(billingHelpers.tierFromPlano('pro')).toBe('PRO');
    expect(billingHelpers.tierFromPlano('business')).toBe('BUSINESS');
  });

  test('mapeia tier para plano local', function() {
    expect(billingHelpers.planoFromTier('FREE')).toBe('free');
    expect(billingHelpers.planoFromTier('PRO')).toBe('pro');
    expect(billingHelpers.planoFromTier('BUSINESS')).toBe('business');
  });

  test('hasTier compara ordem corretamente', function() {
    expect(billingHelpers.hasTier('FREE', 'PRO')).toBe(false);
    expect(billingHelpers.hasTier('PRO', 'PRO')).toBe(true);
    expect(billingHelpers.hasTier('BUSINESS', 'PRO')).toBe(true);
  });

  test('canUseFeature libera recursos offline', function() {
    expect(billingHelpers.canUseFeature('aiFeatures', 'FREE', false)).toBe(true);
  });

  test('canUseFeature bloqueia IA no FREE na nuvem', function() {
    expect(billingHelpers.canUseFeature('aiFeatures', 'FREE', true)).toBe(false);
    expect(billingHelpers.canUseFeature('aiFeatures', 'PRO', true)).toBe(true);
  });

  test('limites FREE incluem teto de transações', function() {
    expect(billingHelpers.PLAN_LIMITS.FREE.maxTransPerMonth).toBe(100);
    expect(billingHelpers.PLAN_LIMITS.PRO.maxTransPerMonth).toBe(Infinity);
  });
});
