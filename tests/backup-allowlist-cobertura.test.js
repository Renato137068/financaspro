/**
 * backup-allowlist-cobertura.test.js — nenhum dado do usuário some no restore.
 *
 * O backup exporta a config INTEIRA (_configParaExportacao só tira o PIN), mas a
 * importação é allow-list (_IMPORT_CONFIG_ALLOWED): tudo que não está na lista é
 * ignorado ao restaurar. Foi assim que faturasDevidas e classificacao503020
 * escaparam — persistidos, exportados, e silenciosamente descartados no restore.
 *
 * Este teste é ESTRUTURAL: varre o código atrás de toda chave gravada com
 * salvarConfig({ chave: ... }) e exige que cada uma esteja OU na allow-list OU
 * numa lista de exclusões conscientes (estado interno, PIN, entitlement). Uma
 * chave nova de dado do usuário que ninguém colocou na allow-list quebra aqui,
 * antes de virar perda de dados no backup de alguém.
 * @jest-environment node
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function initConfig() {
  const src = fs.readFileSync(path.join(root, 'js', 'modules', 'init-config.js'), 'utf8')
    .replace(/\bconst INIT_CONFIG =/, 'var INIT_CONFIG =');
  const sandbox = {
    document: { getElementById: function() { return null; } },
    console: { error: function() {}, warn: function() {}, log: function() {} },
    CONFIG: {}, UTILS: {}, DADOS: { getConfig: function() { return {}; } },
    Date: Date, String: String, Object: Object, Array: Array, module: { exports: {} },
  };
  sandbox.globalThis = sandbox;
  vm.runInContext(src, vm.createContext(sandbox),
    { filename: path.join(root, 'js', 'modules', 'init-config.js') });
  return sandbox.INIT_CONFIG;
}

/** Toda chave gravada como salvarConfig({ chave: ... }) em js/. */
function chavesPersistidas() {
  var chaves = new Set();
  var re = /salvarConfig\(\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g;
  function varrer(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function(ent) {
      var full = path.join(dir, ent.name);
      if (ent.isDirectory()) return varrer(full);
      if (!ent.name.endsWith('.js')) return;
      var txt = fs.readFileSync(full, 'utf8');
      var m;
      while ((m = re.exec(txt)) !== null) chaves.add(m[1]);
    });
  }
  varrer(path.join(root, 'js'));
  return chaves;
}

// Chaves que, de propósito, NÃO voltam no restore. Cada uma com um motivo:
//  - estado interno/derivado (prefixo _): migração, funil, versão de schema;
//  - PIN: segredo e estado de bloqueio nunca vêm de um arquivo importado;
//  - plano: entitlement vem da assinatura verificada, não do backup (RISK-02).
const EXCLUIDAS_DE_PROPOSITO = new Set([
  'pinAtivo', 'pinTentativas', 'pinHash', 'pinSalt', 'pinAlgoritmo', 'pinBloqueadoAte',
  'plano',
]);

describe('cobertura da allow-list de importação de backup', function() {
  const C = initConfig();
  const allowed = new Set(C._IMPORT_CONFIG_ALLOWED);

  test('toda chave persistida de dado do usuário está na allow-list', function() {
    var faltando = [];
    chavesPersistidas().forEach(function(chave) {
      if (chave.charAt(0) === '_') return;            // estado interno
      if (EXCLUIDAS_DE_PROPOSITO.has(chave)) return;  // exclusão consciente
      if (!allowed.has(chave)) faltando.push(chave);
    });
    // Se algo aparecer aqui: ou entra em _IMPORT_CONFIG_ALLOWED (dado do usuário)
    // ou em EXCLUIDAS_DE_PROPOSITO (com motivo). Nunca silenciosamente de fora.
    expect(faltando).toEqual([]);
  });

  test('as duas chaves que já escaparam continuam cobertas', function() {
    expect(allowed.has('faturasDevidas')).toBe(true);
    expect(allowed.has('classificacao503020')).toBe(true);
  });
});
