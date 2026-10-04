/**
 * plan-limits-parity.test.js — limites de plano iguais em JS e SQL.
 */
const { carregarScript } = require('./helpers/carregar-script.cjs');
const { regrasDoBilling } = require('./helpers/billing-regras.cjs');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CANONICAL = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'config/plan-limits.json'), 'utf8'),
);
const billing = regrasDoBilling(carregarScript('js/billing.js'));

/**
 * Todas as chaves do contrato de plano. Manter esta lista fechada e o que
 * impede um limite novo de nascer em billing.js e nunca chegar ao banco --
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

describe('supabase/seed/planos.sql — linhas da tabela Plan', function() {
  // As Edge Functions leem maxUsers da linha do plano (convite de equipe:
  // org-invite). A semente substituiu o seed do Express (ADR 0007) e não pode
  // divergir do contrato.
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/seed/planos.sql'), 'utf8');
  function linha(tier) {
    const m = sql.match(new RegExp("'[^']+', '" + tier + "', ([\\d.]+), ([\\d.]+), (\\d+), (\\d+), (\\d+), (\\d+)"));
    expect(m).not.toBeNull();
    return { priceMonthly: Number(m[1]), priceYearly: Number(m[2]), maxUsers: Number(m[3]) };
  }

  test.each(['FREE', 'PRO', 'BUSINESS'])('maxUsers de %s bate com config/plan-limits.json (0 = ilimitado)', function(tier) {
    const esperado = CANONICAL[tier].maxUsers === null ? 0 : CANONICAL[tier].maxUsers;
    expect(linha(tier).maxUsers).toBe(esperado);
  });

  test('preço do Pro igual ao da vitrine (R$ 16,99 / R$ 129,99)', function() {
    expect(linha('PRO')).toMatchObject({ priceMonthly: 16.99, priceYearly: 129.99 });
  });

  test('idempotente e sem apagar o ID de preço do Stripe', function() {
    expect(sql).toMatch(/on conflict \(tier\) do update set/);
    expect(sql.slice(sql.indexOf('on conflict'))).not.toMatch(/stripePriceId\w+"\s*=/);
  });
});
