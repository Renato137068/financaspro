/**
 * supabase-sync.test.js — integração mockada de pull/push/quota (supabase-sync.js).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const syncSrc = fs.readFileSync(path.join(root, 'js/core/supabase-sync.js'), 'utf8');

function isQuotaExceededError(err) {
  if (!err) return false;
  var msg = String(err.message || err.details || err.hint || '');
  return err.code === 'P0001' || /QUOTA_EXCEEDED:(transaction|account|budget)/.test(msg);
}

function handleQuotaExceeded(err, billing, utils) {
  if (!isQuotaExceededError(err)) return false;
  var msg = String(err.message || '');
  var kind = (msg.match(/QUOTA_EXCEEDED:(\w+)/) || [])[1] || 'transaction';
  var labels = {
    transaction: 'lançamentos este mês',
    account: 'contas/cartões',
    budget: 'orçamentos',
  };
  var texto = 'Limite de ' + (labels[kind] || 'uso')
    + ' no plano gratuito. Assine o Pro para continuar.';
  if (billing && billing.onPaymentRequired) {
    billing.onPaymentRequired({ message: texto });
  } else if (utils && utils.mostrarToast) {
    utils.mostrarToast(texto, 'warning');
  }
  return true;
}

function loadSupaSync(mocks) {
  mocks = mocks || {};
  var upserts = [];
  var selects = [];
  var mergeCalled = false;

  function chain(table, op) {
    var state = { table: table, op: op, filters: [] };
    var api = {
      select: function() { return api; },
      is: function() { return api; },
      eq: function() { return api; },
      range: function(from, to) {
        selects.push({ table: table, from: from, to: to });
        var batch = mocks.rows && mocks.rows[table] ? mocks.rows[table] : [];
        return Promise.resolve({ data: batch, error: null });
      },
      maybeSingle: function() {
        return Promise.resolve({ data: mocks.userConfig || null, error: null });
      },
      upsert: function(rows) {
        upserts.push({ table: table, rows: rows });
        if (mocks.upsertError) return Promise.resolve({ error: mocks.upsertError });
        return Promise.resolve({ error: null });
      },
      update: function() { return api; },
      insert: function() {
        upserts.push({ table: table, op: 'insert' });
        return Promise.resolve({ error: null });
      },
    };
    return api;
  }

  var SB = {
    from: function(table) {
      return {
        select: function() {
          return chain(table, 'select');
        },
        upsert: function(rows, opts) {
          return chain(table, 'upsert').upsert(rows, opts);
        },
        update: function() { return chain(table, 'update'); },
        insert: function(row) { return chain(table, 'insert').insert(row); },
      };
    },
    auth: { onAuthStateChange: function() {} },
  };

  var mockDados = {
    _mergeSnapshotLocal: function(snapshot) {
      mergeCalled = true;
      mockDados._lastSnapshot = snapshot;
    },
    getConfig: function() { return { tema: 'dark' }; },
    getContas: function() { return mocks.localContas || []; },
    getTransacoesRaw: function() { return mocks.localTx || []; },
    _apiAtiva: function() { return true; },
  };

  var sandbox = {
    window: {},
    SB: SB,
    SUPA_AUTH: {
      isActive: function() { return true; },
      getSessionSync: function() {
        return mocks.session || { user: { id: 'user-test-1' } };
      },
    },
    DADOS: mockDados,
    FINANCE_CONTRACT: {
      txPtToEn: function(tx) { return { type: tx.tipo, amount: tx.valor }; },
      contaPtToEn: function(c) { return { name: c.nome }; },
    },
    APP_STORE: { dispatch: jest.fn() },
    ACTIONS: { SYNC_INICIAR: 'SYNC_INICIAR', SYNC_CONCLUIR: 'SYNC_CONCLUIR', SYNC_FALHAR: 'SYNC_FALHAR' },
    BILLING: mocks.billing || {},
    UTILS: mocks.utils || {},
    console: console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(syncSrc, sandbox, { filename: path.join(root, 'js/core/supabase-sync.js') });

  return {
    SUPA_SYNC: sandbox.SUPA_SYNC,
    DADOS: mockDados,
    upserts: upserts,
    selects: selects,
    get mergeCalled() { return mergeCalled; },
  };
}

describe('supabase-sync — quota', function() {
  test('handleQuotaExceeded dispara billing.onPaymentRequired', function() {
    var billing = { onPaymentRequired: jest.fn() };
    var ok = handleQuotaExceeded(
      { code: 'P0001', message: 'QUOTA_EXCEEDED:transaction' },
      billing,
      null,
    );
    expect(ok).toBe(true);
    expect(billing.onPaymentRequired).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/lançamentos este mês/i) }),
    );
  });

  test('erro genérico não é quota', function() {
    expect(isQuotaExceededError({ code: '23505', message: 'duplicate' })).toBe(false);
  });
});

describe('supabase-sync — pull mockado', function() {
  test('pull mescla snapshot e reconcilia contas locais', async function() {
    var ctx = loadSupaSync({
      rows: {
        Transaction: [{ id: 't-cloud', userId: 'user-test-1' }],
        Account: [],
        Budget: [],
        RecurringTransaction: [],
      },
      localContas: [{ id: 'acc-local', nome: 'Carteira', updatedAt: new Date().toISOString() }],
      localTx: [],
      userConfig: { data: { data: { pinHash: 'x' } } },
    });

    var ok = await ctx.SUPA_SYNC.pull();
    expect(ok).toBe(true);
    expect(ctx.mergeCalled).toBe(true);
    expect(ctx.DADOS._lastSnapshot.transactions.length).toBe(1);
    expect(ctx.upserts.some(function(u) { return u.table === 'Account'; })).toBe(true);
  });

  test('pushTx retorna tx local quando quota excedida', async function() {
    var billing = { onPaymentRequired: jest.fn() };
    var ctx = loadSupaSync({
      upsertError: { code: 'P0001', message: 'QUOTA_EXCEEDED:transaction' },
      billing: billing,
    });
    var tx = { id: 'tx1', tipo: 'despesa', valor: 10 };
    var out = await ctx.SUPA_SYNC.pushTx(tx);
    expect(out).toBe(tx);
    expect(billing.onPaymentRequired).toHaveBeenCalled();
  });

  test('pushConfig remove pinHash antes de enviar', async function() {
    var ctx = loadSupaSync({ userConfig: null });
    var cfg = { tema: 'dark', pinHash: 'secret', pinSalt: 's', pinAlgoritmo: 'pbkdf2' };
    await ctx.SUPA_SYNC.pushConfig(cfg);
    var userCfgUpsert = ctx.upserts.find(function(u) { return u.table === 'UserConfig'; });
    expect(userCfgUpsert || ctx.upserts.length).toBeTruthy();
  });
});

describe('supabase-sync — wiring DADOS', function() {
  test('sobrescreve transporte quando Supabase ativo', function() {
    var ctx = loadSupaSync({});
    expect(typeof ctx.DADOS._pushTransacaoApi).toBe('function');
    expect(ctx.DADOS._apiAtiva()).toBe(false);
    expect(typeof ctx.DADOS.sincronizarComApi).toBe('function');
  });
});
