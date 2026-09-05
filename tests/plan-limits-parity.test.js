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

/**
 * Todas as chaves do contrato de plano. Manter esta lista fechada e o que
 * impede um limite novo de nascer em billing.js e nunca chegar ao backend --
 * o modo como as duas tabelas divergiram da ultima vez.
 */
const FIELDS = [
  'maxUsers',
  'maxTransPerMonth',
  'maxAccounts',
  'maxBudgets',
  'maxCustomCategories',
  'maxGoals',
  'maxRecurring',
  'maxBillsToPay',
  'maxSubscriptions',
  'maxAttachments',
  'maxDevices',
  'historyMonths',
  'ocrPerMonth',
  'aiFeatures',
  'teamFeatures',
  'exportCsv',
  'exportPdf',
  'advancedAlerts',
  'openFinance',
  'learnedCategorization',
  'futureInvoiceProjection',
  'netWorthHistory',
];

/** Colunas numericas espelhadas na tabela fp_plan_limit_config. */
const SQL_FIELDS = [
  'maxTransPerMonth',
  'maxAccounts',
  'maxBudgets',
  'maxCustomCategories',
  'maxGoals',
  'maxRecurring',
  'maxBillsToPay',
  'maxSubscriptions',
  'maxAttachments',
  'maxDevices',
  'historyMonths',
  'ocrPerMonth',
];

function normNumeric(value) {
  if (value === null || value === undefined || value === Infinity) return null;
  return value;
}

/**
 * Le a migration de quota mais recente. A v2 reescreve a tabela inteira via
 * `on conflict do update`, entao e ela que descreve o estado final do banco.
 */
function parseSqlLimits() {
  const dir = path.join(ROOT, 'supabase/migrations');
  const arquivo = fs.readdirSync(dir)
    .filter(function(f) { return /quota/.test(f) && f.endsWith('.sql'); })
    .sort()
    .pop();
  const migration = fs.readFileSync(path.join(dir, arquivo), 'utf8');
  const rows = {};
  const re = /\('(FREE|PRO|BUSINESS)',((?:\s*(?:\d+|null),?){12})\)/g;
  let m;
  while ((m = re.exec(migration))) {
    const valores = m[2].split(',').map(function(v) {
      const t = v.trim();
      return t === 'null' ? null : Number(t);
    });
    const linha = {};
    SQL_FIELDS.forEach(function(field, i) { linha[field] = valores[i]; });
    rows[m[1]] = linha;
  }
  return rows;
}

function limitsFromBilling(tier) {
  const src = billing.PLAN_LIMITS[tier];
  const out = {};
  FIELDS.forEach(function(field) {
    // Normaliza qualquer campo numerico, nao so os que comecam com "max":
    // historyMonths e ocrPerMonth tambem usam Infinity no JS e null no JSON.
    out[field] = typeof src[field] === 'number' ? normNumeric(src[field]) : src[field];
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
      SQL_FIELDS.forEach(function(field) {
        expect(sqlLimits[tier][field]).toBe(CANONICAL[tier][field]);
      });
    });
  });
});
