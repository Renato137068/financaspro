/**
 * billing-dual-path.test.js — Supabase preferido; sem fallback Express silencioso.
 */
const fs = require('fs');
const path = require('path');
const billingHelpers = require('../js/billing.js');

const billingSrc = fs.readFileSync(path.join(__dirname, '..', 'js/billing.js'), 'utf8');

describe('Dual path Supabase × Express', function() {
  test('expõe _useSupabaseBilling', function() {
    expect(typeof billingHelpers._useSupabaseBilling).toBe('function');
    expect(billingSrc).toMatch(/_useSupabaseBilling:\s*function/);
  });

  test('portal/cancel preferem Supabase sem gate !_apiAtiva', function() {
    expect(billingSrc).toMatch(/invoke\('stripe-cancel'/);
    expect(billingSrc).toMatch(/invoke\('stripe-portal'/);
    expect(billingSrc).toMatch(/_useSupabaseBilling\(\)/);
    expect(billingSrc).not.toMatch(/!\(DADOS\._apiAtiva && DADOS\._apiAtiva\(\)\)/);
  });

  test('checkoutOrSubscribe não cai em subscribe no path Supabase', function() {
    expect(billingSrc).toMatch(/express-subscribe-disabled/);
    expect(billingSrc).toMatch(/checkout-unavailable/);
    const block = billingSrc.slice(
      billingSrc.indexOf('checkoutOrSubscribe:'),
      billingSrc.indexOf('cancelSubscription:'),
    );
    expect(block).toMatch(/_useSupabaseBilling\(\)/);
    expect(block).toMatch(/checkout-unavailable/);
  });
});
