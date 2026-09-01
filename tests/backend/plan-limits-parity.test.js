/**
 * plan-limits-parity.test.js (backend) — PLAN_LIMITS do Express vs config/plan-limits.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAN_LIMITS } from '../../backend/middleware/plan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const CANONICAL = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'config/plan-limits.json'), 'utf8'),
);

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

describe('backend/middleware/plan.js — paridade com config/plan-limits.json', function() {
  ['FREE', 'PRO', 'BUSINESS'].forEach(function(tier) {
    test(tier, function() {
      const src = PLAN_LIMITS[tier];
      const expected = CANONICAL[tier];
      FIELDS.forEach(function(field) {
        if (field.startsWith('max')) {
          expect(normNumeric(src[field])).toBe(expected[field]);
        } else {
          expect(src[field]).toBe(expected[field]);
        }
      });
    });
  });
});
