/**
 * periodo-dados-fuso.test.js — o período do backup não pode escorregar de fuso.
 *
 * getPeriodoDados grava {inicio, fim, meses} no metadados do backup. A versão
 * anterior fazia new Date('YYYY-MM-DD') (parse em UTC) e depois calcularMesesEntre
 * lia getMonth() LOCAL: no fuso do Brasil (UTC-3), a meia-noite UTC do dia 1º cai
 * no mês anterior, e a contagem de meses do backup saía errada num dos extremos.
 *
 * O ambiente do jest roda fixo em UTC (getTimezoneOffset() === 0) e não deixa
 * trocar o fuso por process.env.TZ dentro do worker, então o bug não se reproduz
 * aqui por relógio. A garantia é dupla e independente de fuso:
 *   1. ESTRUTURAL — getPeriodoDados não pode voltar a usar new Date() (a origem
 *      do escorregão). Mesmo padrão de backup-simetria.test.js.
 *   2. COMPORTAMENTAL — calcularMesesEntre, agora por componentes de string, dá
 *      a contagem certa (inclusive) — o valor que vai para o backup.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'modules', 'init-config.js'), 'utf8');

/** Corpo de uma função do objeto INIT_CONFIG, do cabeçalho até o `},` da coluna 2. */
function corpoDe(nome) {
  const inicio = src.indexOf(`  ${nome}: function`);
  if (inicio === -1) throw new Error(`função ${nome} não encontrada em init-config.js`);
  const fim = src.indexOf('\n  },', inicio);
  return src.slice(inicio, fim === -1 ? src.length : fim);
}

function carregar(transacoes) {
  const sandbox = {
    document: { getElementById: function() { return null; }, createElement: function() { return {}; } },
    console: { error: function() {}, warn: function() {}, log: function() {} },
    CONFIG: { VERSION: '11.0.0' },
    UTILS: { escapeHtml: function(s) { return String(s); }, formatarMoeda: function(v) { return String(v); } },
    DADOS: { getConfig: function() { return {}; }, getContas: function() { return []; } },
    TRANSACOES: { obter: function() { return transacoes; } },
    Date: Date, String: String, Number: Number, Math: Math, JSON: JSON,
    Object: Object, Array: Array, parseInt: parseInt, isNaN: isNaN, RegExp: RegExp,
    module: { exports: {} },
  };
  sandbox.globalThis = sandbox;
  vm.runInContext(src.replace(/\bconst INIT_CONFIG =/, 'var INIT_CONFIG ='),
    vm.createContext(sandbox), { filename: path.join(root, 'js', 'modules', 'init-config.js') });
  return sandbox.INIT_CONFIG;
}

describe('getPeriodoDados — estrutura à prova de fuso', function() {
  test('não usa new Date() — deriva das strings ISO', function() {
    // O parse de string em UTC era a origem do escorregão. O período sai do sort
    // das strings; a contagem, de componentes. Nenhum parse de data no código
    // (comentários de linha são removidos antes da checagem).
    var codigo = corpoDe('getPeriodoDados').replace(/\/\/[^\n]*/g, '');
    expect(codigo).not.toMatch(/new Date\(/);
  });
});

describe('calcularMesesEntre — contagem inclusiva por componentes', function() {
  var C = carregar([]);

  test('fim no dia 1º não encolhe a contagem (jan-15 → mar-01 = 3)', function() {
    expect(C.calcularMesesEntre('2026-01-15', '2026-03-01')).toBe(3);
  });

  test('início no dia 1º não infla a contagem (jan-01 → mar-15 = 3)', function() {
    expect(C.calcularMesesEntre('2026-01-01', '2026-03-15')).toBe(3);
  });

  test('mesmo mês conta 1', function() {
    expect(C.calcularMesesEntre('2026-05-03', '2026-05-28')).toBe(1);
  });

  test('vira o ano: dez/2025 → jan/2026 conta 2', function() {
    expect(C.calcularMesesEntre('2025-12-01', '2026-01-01')).toBe(2);
  });

  test('ignora a parte de hora da string ISO', function() {
    expect(C.calcularMesesEntre('2026-03-01T10:00:00', '2026-03-31')).toBe(1);
  });

  test('ainda aceita Date (compatibilidade)', function() {
    expect(C.calcularMesesEntre(new Date(2026, 0, 10), new Date(2026, 2, 20))).toBe(3);
  });
});

describe('getPeriodoDados — comportamento', function() {
  test('início e fim vêm das strings, sem escorregar de dia', function() {
    var C = carregar([{ data: '2026-03-01T10:00:00' }, { data: '2026-03-31' }, { data: '2026-03-15' }]);
    var p = C.getPeriodoDados();
    expect(p.inicio).toBe('2026-03-01');
    expect(p.fim).toBe('2026-03-31');
    expect(p.meses).toBe(1);
  });

  test('janela de três meses conta 3', function() {
    var C = carregar([{ data: '2026-01-15' }, { data: '2026-02-10' }, { data: '2026-03-01' }]);
    expect(C.getPeriodoDados().meses).toBe(3);
  });

  test('sem transações devolve null', function() {
    expect(carregar([]).getPeriodoDados()).toBeNull();
  });

  test('ignora datas em formato inesperado ao achar o período', function() {
    var C = carregar([{ data: '2026-02-10' }, { data: '' }, { data: null }, { data: '2026-04-20' }]);
    var p = C.getPeriodoDados();
    expect(p.inicio).toBe('2026-02-10');
    expect(p.fim).toBe('2026-04-20');
    expect(p.meses).toBe(3);
  });
});
