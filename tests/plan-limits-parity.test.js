/**
 * plan-limits-parity.test.js — limites de plano iguais em JS, Express e SQL.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CANONICAL = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'config/plan-limits.json'), 'utf8'),
);
const billing = require('../js/billing.js');

const FIELDS = [
  'maxTransPerMonth',
  'maxAccounts',
  'maxBudgets',
  'aiFeatures',
  'teamFeatures',
  'reportExport',
  'advancedAlerts',
];

function normNumeric(value) {
  if (value === null || value === undefined || value === Infinity) return null;
  return value;
}

function parseSqlLimits() {
  const migration = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20260901150000_quota_enforcement.sql'),
    'utf8',
  );
  const rows = {};
  const re = /\('(\w+)',\s*(\d+|null),\s*(\d+|null),\s*(\d+|null)\)/g;
  let m;
  while ((m = re.exec(migration))) {
    rows[m[1]] = {
      maxTransPerMonth: m[2] === 'null' ? null : Number(m[2]),
      maxAccounts: m[3] === 'null' ? null : Number(m[3]),
      maxBudgets: m[4] === 'null' ? null : Number(m[4]),
    };
  }
  return rows;
}

function limitsFromBilling(tier) {
  const src = billing.PLAN_LIMITS[tier];
  const out = {};
  FIELDS.forEach(function(field) {
    if (field.startsWith('max')) {
      out[field] = normNumeric(src[field]);
    } else {
      out[field] = src[field];
    }
  });
  return out;
}

function limitsFromCanonical(tier) {
  return CANONICAL[tier];
}

describe('PLAN_LIMITS — paridade', function() {
  const sqlLimits = parseSqlLimits();

  ['FREE', 'PRO', 'BUSINESS'].forEach(function(tier) {
    test('billing.js e config/plan-limits.json — ' + tier, function() {
      const fromBilling = limitsFromBilling(tier);
      const fromJson = limitsFromCanonical(tier);
      FIELDS.forEach(function(field) {
        expect(fromBilling[field]).toEqual(fromJson[field]);
      });
    });

    test('SQL fp_plan_limit_config e config/plan-limits.json (numéricos) — ' + tier, function() {
      expect(sqlLimits[tier]).toBeDefined();
      expect(sqlLimits[tier].maxTransPerMonth).toBe(CANONICAL[tier].maxTransPerMonth);
      expect(sqlLimits[tier].maxAccounts).toBe(CANONICAL[tier].maxAccounts);
      expect(sqlLimits[tier].maxBudgets).toBe(CANONICAL[tier].maxBudgets);
    });
  });
});
