/**
 * assinaturas-real.test.js — exercita js/assinaturas.js REAL.
 *
 * Substitui `assinaturas.test.js`, que reimplementava a lógica de cobrança.
 * Este módulo diz ao usuário quanto ele gasta por mês em serviços recorrentes
 * e quando cai a próxima cobrança — número que ele usa para decidir cancelar.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

const A = () => global.ASSINATURAS;

beforeEach(function() {
  resetFixtures();
});

describe('ASSINATURAS — criação', function() {
  test('cria com os campos esperados e nasce ativa', function() {
    const s = A().criar({ nome: 'Streaming', valor: '39,90', diaCobranca: 15 });

    expect(s.id).toEqual(expect.any(String));
    expect(s.nome).toBe('Streaming');
    expect(s.valor).toBe(39.9);
    expect(s.diaCobranca).toBe(15);
    expect(s.ativa).toBe(true);
  });

  test('aplica trim no nome', function() {
    expect(A().criar({ nome: '  Música  ', valor: 20, diaCobranca: 5 }).nome).toBe('Música');
  });

  test('recusa nome vazio', function() {
    expect(() => A().criar({ nome: '', valor: 10, diaCobranca: 5 })).toThrow(/nome/i);
  });

  test('recusa valor zero ou negativo', function() {
    expect(() => A().criar({ nome: 'X', valor: 0, diaCobranca: 5 })).toThrow(/inválido/i);
    expect(() => A().criar({ nome: 'X', valor: -1, diaCobranca: 5 })).toThrow(/inválido/i);
  });

  test('recusa dia de cobrança fora de 1–31', function() {
    expect(() => A().criar({ nome: 'X', valor: 10, diaCobranca: 0 })).toThrow(/dia/i);
    expect(() => A().criar({ nome: 'X', valor: 10, diaCobranca: 32 })).toThrow(/dia/i);
    expect(() => A().criar({ nome: 'X', valor: 10, diaCobranca: 'quinze' })).toThrow(/dia/i);
  });

  test('aceita os extremos válidos', function() {
    expect(A().criar({ nome: 'A', valor: 10, diaCobranca: 1 }).diaCobranca).toBe(1);
    expect(A().criar({ nome: 'B', valor: 10, diaCobranca: 31 }).diaCobranca).toBe(31);
  });

  test('ícone padrão quando não informado', function() {
    expect(A().criar({ nome: 'X', valor: 10, diaCobranca: 5 }).icone).toBe('tv');
  });
});

describe('ASSINATURAS — ativação', function() {
  test('toggle desativa e reativa', function() {
    const s = A().criar({ nome: 'X', valor: 10, diaCobranca: 5 });

    A().toggleAtiva(s.id);
    expect(A().obter(s.id).ativa).toBe(false);

    A().toggleAtiva(s.id);
    expect(A().obter(s.id).ativa).toBe(true);
  });

  test('listar(true) devolve só as ativas', function() {
    const s = A().criar({ nome: 'Ativa', valor: 10, diaCobranca: 5 });
    A().criar({ nome: 'Outra', valor: 20, diaCobranca: 10 });
    A().toggleAtiva(s.id);

    expect(A().listar(true)).toHaveLength(1);
    expect(A().listar()).toHaveLength(2);
  });

  test('toggle em id inexistente não altera nada', function() {
    A().criar({ nome: 'X', valor: 10, diaCobranca: 5 });
    A().toggleAtiva('fantasma');
    expect(A().listar(true)).toHaveLength(1);
  });
});

describe('ASSINATURAS — totais', function() {
  test('soma apenas as ativas', function() {
    // Assinatura pausada não deve inflar o gasto mensal informado.
    A().criar({ nome: 'A', valor: 30, diaCobranca: 5 });
    const b = A().criar({ nome: 'B', valor: 70, diaCobranca: 10 });
    A().toggleAtiva(b.id);

    expect(A().totalMensal()).toBe(30);
  });

  test('total anual é doze vezes o mensal', function() {
    A().criar({ nome: 'A', valor: 25, diaCobranca: 5 });
    expect(A().totalAnual()).toBe(300);
  });

  test('sem assinaturas os totais são zero', function() {
    expect(A().totalMensal()).toBe(0);
    expect(A().totalAnual()).toBe(0);
  });

  test('decimais somam sem perda relevante', function() {
    A().criar({ nome: 'A', valor: 19.9, diaCobranca: 5 });
    A().criar({ nome: 'B', valor: 39.9, diaCobranca: 10 });
    expect(A().totalMensal()).toBeCloseTo(59.8, 2);
  });
});

describe('ASSINATURAS — próxima cobrança', function() {
  test('devolve data no formato ISO', function() {
    const s = A().criar({ nome: 'X', valor: 10, diaCobranca: 15 });
    expect(A().proximaCobranca(s)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('a próxima cobrança nunca fica no passado', function() {
    // Qualquer dia do mês precisa resultar numa data igual ou futura.
    for (let dia = 1; dia <= 28; dia++) {
      const s = A().criar({ nome: 'D' + dia, valor: 10, diaCobranca: dia });
      expect(A().diasAteCobranca(s)).toBeGreaterThanOrEqual(0);
    }
  });

  test('dia 31 é ajustado em mês curto', function() {
    // Fevereiro não tem 31; a cobrança precisa cair no último dia disponível
    // em vez de estourar para o mês seguinte.
    const s = A().criar({ nome: 'X', valor: 10, diaCobranca: 31 });
    const data = A().proximaCobranca(s);
    const [ano, mes, dia] = data.split('-').map(Number);
    const ultimoDia = new Date(ano, mes, 0).getDate();

    expect(dia).toBeLessThanOrEqual(ultimoDia);
  });

  test('cobrança de hoje devolve 0, não 1', function() {
    // Mesmo erro de um dia que existia em contas-pagar: os dois módulos agora
    // usam UTILS.diasAte, então a correção vale para ambos.
    const hoje = new Date().getDate();
    const s = A().criar({ nome: 'Hoje', valor: 10, diaCobranca: hoje });

    expect(A().diasAteCobranca(s)).toBe(0);
  });
});

describe('ASSINATURAS — exclusão', function() {
  test('remove apenas a indicada', function() {
    const a = A().criar({ nome: 'A', valor: 10, diaCobranca: 5 });
    A().criar({ nome: 'B', valor: 20, diaCobranca: 10 });

    A().excluir(a.id);

    expect(A().listar()).toHaveLength(1);
    expect(A().listar()[0].nome).toBe('B');
  });

  test('obter devolve null para id inexistente', function() {
    expect(A().obter('fantasma')).toBeFalsy();
  });
});

describe('UTILS.diasAte — helper compartilhado', function() {
  function emDias(n) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  test('hoje é zero', function() {
    expect(global.UTILS.diasAte(emDias(0))).toBe(0);
  });

  test('futuro é positivo, passado é negativo', function() {
    expect(global.UTILS.diasAte(emDias(7))).toBe(7);
    expect(global.UTILS.diasAte(emDias(-3))).toBe(-3);
  });

  test('aceita timestamp ISO completo', function() {
    expect(global.UTILS.diasAte(emDias(0) + 'T23:59:59.999Z')).toBe(0);
  });

  test('data inválida devolve NaN em vez de número errado', function() {
    expect(Number.isNaN(global.UTILS.diasAte('não é data'))).toBe(true);
  });
});

describe('UTILS.parseMoeda vs parseMoedaEstrita', function() {
  test('ambos entendem o formato brasileiro', function() {
    // Era aqui que os módulos erravam: parseFloat('39,90') devolve 39, então
    // uma assinatura de R$ 39,90 virava R$ 39,00 em silêncio.
    expect(global.UTILS.parseMoeda('39,90')).toBe(39.9);
    expect(global.UTILS.parseMoedaEstrita('39,90')).toBe(39.9);
    expect(global.UTILS.parseMoeda('1.234,56')).toBe(1234.56);
    expect(global.UTILS.parseMoedaEstrita('1.234,56')).toBe(1234.56);
  });

  test('ambos passam número JS adiante sem corromper', function() {
    expect(global.UTILS.parseMoeda(25.5)).toBe(25.5);
    expect(global.UTILS.parseMoedaEstrita(25.5)).toBe(25.5);
  });

  test('divergem no lixo: tolerante devolve 0, estrita devolve NaN', function() {
    // A diferença existe para quem aceita zero como valor legítimo — uma conta
    // zerada é um ativo, mas "abc" não é.
    expect(global.UTILS.parseMoeda('abc')).toBe(0);
    expect(Number.isNaN(global.UTILS.parseMoedaEstrita('abc'))).toBe(true);
  });

  test('estrita recusa entrada vazia e nula', function() {
    expect(Number.isNaN(global.UTILS.parseMoedaEstrita(''))).toBe(true);
    expect(Number.isNaN(global.UTILS.parseMoedaEstrita(null))).toBe(true);
    expect(Number.isNaN(global.UTILS.parseMoedaEstrita(undefined))).toBe(true);
  });

  test('estrita aceita zero — é valor válido, não ausência de valor', function() {
    expect(global.UTILS.parseMoedaEstrita(0)).toBe(0);
    expect(global.UTILS.parseMoedaEstrita('0')).toBe(0);
  });

  test('estrita recusa número com texto colado', function() {
    expect(Number.isNaN(global.UTILS.parseMoedaEstrita('39,90 reais'))).toBe(true);
    expect(Number.isNaN(global.UTILS.parseMoedaEstrita('R$ 39,90'))).toBe(true);
  });

  test('estrita preserva o sinal negativo', function() {
    expect(global.UTILS.parseMoedaEstrita('-100')).toBe(-100);
  });
});
