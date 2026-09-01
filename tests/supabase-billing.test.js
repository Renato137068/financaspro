/**
 * supabase-billing.test.js — helpers de billing no Supabase (modo estático).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSupaBilling() {
  const ctx = vm.createContext({
    window: {},
    CONFIG: {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
    },
    DADOS: {
      _supabaseAtivo: () => true,
      getConfig: () => ({ nome: 'Renato' }),
    },
    SUPA_AUTH: {
      isActive: () => true,
      getSessionSync: () => ({ user: { id: 'user-1' } }),
      getAccessToken: () => Promise.resolve('jwt-token'),
    },
    UTILS: { gerarUuid: () => 'uuid-test-1234' },
  });
  ctx.window.SB = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({
            data: [{ tier: 'FREE', name: 'Gratuito', priceMonthly: 0, priceYearly: 0, features: [] }],
            error: null,
          }),
        }),
      }),
    }),
  };
  ctx.window.SUPA_AUTH = ctx.SUPA_AUTH;
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'supabase-billing.js'), 'utf8'),
    ctx,
    { filename: path.join(__dirname, '..', 'js', 'core', 'supabase-billing.js') },
  );
  return ctx.window.SUPA_BILLING;
}

describe('SUPA_BILLING', () => {
  test('isActive quando Supabase configurado', () => {
    const SBILL = loadSupaBilling();
    expect(SBILL.isActive()).toBe(true);
  });

  test('listPlans mapeia planos do Postgres', async () => {
    const SBILL = loadSupaBilling();
    const plans = await SBILL.listPlans();
    expect(plans[0].tier).toBe('FREE');
    expect(plans[0].name).toBe('Gratuito');
  });
});
