/**
 * supabase-quota-error.test.js — contrato de erro QUOTA_EXCEEDED do PostgREST.
 */
describe('Supabase quota errors', function() {
  function isQuotaExceededError(err) {
    if (!err) return false;
    var msg = String(err.message || err.details || err.hint || '');
    return err.code === 'P0001' || /QUOTA_EXCEEDED:(transaction|account|budget)/.test(msg);
  }

  test('detecta P0001 com mensagem QUOTA_EXCEEDED:transaction', function() {
    expect(isQuotaExceededError({ code: 'P0001', message: 'QUOTA_EXCEEDED:transaction' })).toBe(true);
  });

  test('detecta mensagem em details', function() {
    expect(isQuotaExceededError({ details: 'QUOTA_EXCEEDED:account' })).toBe(true);
  });

  test('ignora erro genérico de sync', function() {
    expect(isQuotaExceededError({ code: '23505', message: 'duplicate key' })).toBe(false);
  });
});
