/**
 * quota-sql-triggers.test.js — RISK-03: triggers de profundidade no SQL.
 * Não sobe o banco; trava a migration v3 no repositório.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const mig = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260905180000_quota_v3_triggers_profundidade.sql'),
  'utf8',
);

describe('quota SQL v3 (RISK-03)', () => {
  test('trigger RecurringTransaction', () => {
    expect(mig).toMatch(/trg_fp_recurring_quota/);
    expect(mig).toMatch(/QUOTA_EXCEEDED:recurring/);
    expect(mig).toMatch(/before insert on public\."RecurringTransaction"/i);
  });

  test('trigger UserConfig cobre metas, bills, assinaturas, categorias', () => {
    expect(mig).toMatch(/trg_fp_userconfig_quota/);
    expect(mig).toMatch(/QUOTA_EXCEEDED:goal/);
    expect(mig).toMatch(/QUOTA_EXCEEDED:bill/);
    expect(mig).toMatch(/QUOTA_EXCEEDED:subscription/);
    expect(mig).toMatch(/QUOTA_EXCEEDED:category/);
    expect(mig).toMatch(/before insert or update of data on public\."UserConfig"/i);
  });

  test('grandfather: não rejeita se contagem não aumentou', () => {
    expect(mig).toMatch(/v_new > v_old/);
  });
});
