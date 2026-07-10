/**
 * import-config.test.js — Proteção de campos sensíveis na importação
 */

var IMPORT_CONFIG_BLOCKED = [
  'pinHash', 'pinSalt', 'pinAlgoritmo', 'pinAtivo', 'pinTentativas', 'pinBloqueadoAte'
];

function mergeImportedConfig(current, imported) {
  var merged = Object.assign({}, current, imported);
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
});
