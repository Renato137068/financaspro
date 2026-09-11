/**
 * supabase-quota-error.test.js — contrato de erro QUOTA_EXCEEDED do PostgREST.
 *
 * A versão anterior reescrevia isQuotaExceededError aqui dentro. Uma cópia
 * envelhece calada: quando o SQL v3 passou a recusar metas, contas a pagar,
 * assinaturas e categorias, o teste continuou verde testando a lista antiga de
 * três tipos, enquanto o app mostrava "Limite de uso no plano gratuito" — uma
 * frase que não diz nada. Agora o teste lê a função do fonte de verdade, então
 * um tipo novo no SQL sem tratamento no cliente reprova aqui.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ARQUIVO = path.join(__dirname, '..', 'js', 'core', 'supabase-sync.js');
const SRC = fs.readFileSync(ARQUIVO, 'utf8');

/** Recorta uma declaração `function nome(...) { ... }` por chaves balanceadas. */
function recortarFuncao(src, nome) {
  const inicio = src.indexOf('function ' + nome + '(');
  if (inicio < 0) throw new Error('função não encontrada no fonte: ' + nome);
  let nivel = 0;
  for (let j = src.indexOf('{', inicio); j < src.length; j++) {
    if (src[j] === '{') nivel++;
    else if (src[j] === '}') {
      nivel--;
      if (nivel === 0) return src.slice(inicio, j + 1);
    }
  }
  throw new Error('função sem fechamento: ' + nome);
}

const linhaKinds = SRC.match(/var QUOTA_KINDS = '[^']+';/);
if (!linhaKinds) throw new Error('QUOTA_KINDS não encontrado em supabase-sync.js');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  linhaKinds[0] + '\n' + recortarFuncao(SRC, 'isQuotaExceededError'),
  sandbox,
  { filename: ARQUIVO },
);
const { isQuotaExceededError, QUOTA_KINDS } = sandbox;

/** Tipos que o SQL sabe levantar — a fonte é o texto das migrations. */
function tiposNoSql() {
  const dir = path.join(__dirname, '..', 'supabase', 'migrations');
  const tipos = new Set();
  fs.readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .forEach((f) => {
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      const achados = sql.match(/QUOTA_EXCEEDED:(\w+)/g) || [];
      achados.forEach((a) => tipos.add(a.split(':')[1]));
    });
  return [...tipos].sort();
}

describe('Supabase quota errors', function() {
  test('detecta P0001 com mensagem QUOTA_EXCEEDED:transaction', function() {
    expect(isQuotaExceededError({ code: 'P0001', message: 'QUOTA_EXCEEDED:transaction' })).toBe(true);
  });

  test('detecta mensagem em details', function() {
    expect(isQuotaExceededError({ details: 'QUOTA_EXCEEDED:account' })).toBe(true);
  });

  test('ignora erro genérico de sync', function() {
    expect(isQuotaExceededError({ code: '23505', message: 'duplicate key' })).toBe(false);
  });

  test('nulo e indefinido não são quota', function() {
    expect(isQuotaExceededError(null)).toBe(false);
    expect(isQuotaExceededError(undefined)).toBe(false);
  });

  test('todo tipo que o SQL levanta é reconhecido pelo cliente', function() {
    const doSql = tiposNoSql();
    expect(doSql.length).toBeGreaterThanOrEqual(5);
    doSql.forEach(function(kind) {
      // Sem o code P0001: aqui interessa a lista de tipos, não o atalho.
      expect(isQuotaExceededError({ message: 'QUOTA_EXCEEDED:' + kind })).toBe(true);
      expect(QUOTA_KINDS.split('|')).toContain(kind);
    });
  });

  test('um tipo inventado não vira aviso de cota', function() {
    expect(isQuotaExceededError({ message: 'QUOTA_EXCEEDED:foguete' })).toBe(false);
  });
});

describe('Mensagem mostrada ao usuário', function() {
  const handler = recortarFuncao(SRC, 'handleQuotaExceeded');

  test('prefere a copy do BILLING, que nomeia o que o Pro faz', function() {
    expect(handler).toContain('BILLING._QUOTAS');
    expect(handler).toMatch(/msg\.replace\('%L'/);
  });

  test('o plano B cobre todos os tipos do SQL — nada cai em "uso"', function() {
    tiposNoSql().forEach(function(kind) {
      expect(handler).toMatch(new RegExp('\\b' + kind + ':'));
    });
  });
});
