function situacaoConta(vencimento, hojeStr) {
  var hoje = new Date(hojeStr + 'T12:00:00');
  var v = new Date(vencimento + 'T12:00:00');
  var dias = Math.ceil((v - hoje) / 86400000);
  if (dias < 0) return 'vencida';
  if (dias === 0) return 'hoje';
  if (dias <= 3) return 'proxima';
  return 'ok';
}

describe('Contas a pagar — situação', function() {
  test('identifica vencida e hoje', function() {
    expect(situacaoConta('2026-01-01', '2026-06-15')).toBe('vencida');
    expect(situacaoConta('2026-06-15', '2026-06-15')).toBe('hoje');
    expect(situacaoConta('2026-06-18', '2026-06-15')).toBe('proxima');
  });
});
