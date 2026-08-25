/**
 * import-config.test.js — Proteção de campos sensíveis na importação
 * Espelha a whitelist de INIT_CONFIG (P1.2).
 */

var IMPORT_CONFIG_BLOCKED = [
  'pinHash', 'pinSalt', 'pinAlgoritmo', 'pinAtivo', 'pinTentativas', 'pinBloqueadoAte'
];

var IMPORT_CONFIG_ALLOWED = [
  'nome', 'email', 'telefone', 'nascimento', 'endereco', 'cidade',
  'moeda', 'tema', 'alertaOrcamento', 'lembreteDiario',
  'categoriasCustom', 'bancos', 'cartoes',
  'renda', 'rendaMensal', 'regra503020',
  'ultimoExportoDados', 'ultimoAcessoApp',
  'metas', 'contasPagar', 'assinaturas', 'patrimonio', 'openFinance',
  'onboardingConcluido', 'feedbacks',
  'saldosIniciais', 'faturasPagas', 'recorrentesProcessadas',
  'plano'
];

function mergeImportedConfig(current, imported) {
  var merged = Object.assign({}, current);
  IMPORT_CONFIG_ALLOWED.forEach(function(key) {
    if (Object.prototype.hasOwnProperty.call(imported, key)) {
      merged[key] = imported[key];
    }
  });
  IMPORT_CONFIG_BLOCKED.forEach(function(key) {
    merged[key] = current[key];
  });
  return merged;
}

describe('Import config — campos sensíveis', function() {
  test('preserva PIN local ao importar backup', function() {
    var atual = {
      nome: 'Renato',
      pinAtivo: true,
      pinHash: 'hash-local',
      pinSalt: 'salt-local',
      plano: 'free'
    };
    var backup = {
      nome: 'Atacante',
      pinAtivo: false,
      pinHash: 'hash-malicioso',
      pinSalt: 'salt-malicioso',
      plano: 'premium'
    };
    var merged = mergeImportedConfig(atual, backup);
    expect(merged.nome).toBe('Atacante');
    expect(merged.plano).toBe('premium');
    expect(merged.pinHash).toBe('hash-local');
    expect(merged.pinSalt).toBe('salt-local');
    expect(merged.pinAtivo).toBe(true);
  });

  test('ignora chave fora da whitelist', function() {
    var atual = { nome: 'Renato', apiBaseUrl: 'https://ok.local' };
    var backup = { nome: 'X', apiBaseUrl: 'https://evil.local', syncV2Enabled: false };
    var merged = mergeImportedConfig(atual, backup);
    expect(merged.nome).toBe('X');
    expect(merged.apiBaseUrl).toBe('https://ok.local');
    expect(merged.syncV2Enabled).toBeUndefined();
  });
});
