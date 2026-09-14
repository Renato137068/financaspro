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
    // Prefixo R$ é aceito (usuário cola do extrato bancário).
    expect(global.UTILS.parseMoedaEstrita('R$ 39,90')).toBe(39.9);
  });

  test('estrita preserva o sinal negativo', function() {
    expect(global.UTILS.parseMoedaEstrita('-100')).toBe(-100);
  });
});

describe('ASSINATURAS — edição', function() {
  test('atualiza nome, valor e dia preservando id, ícone, estado e criadoEm', function() {
    const s = A().criar({ nome: 'Netflix', valor: '39,90', diaCobranca: 10, icone: 'tv' });
    A().toggleAtiva(s.id); // deixa inativa antes de editar
    const antes = A().obter(s.id);

    const r = A().editar(s.id, { nome: 'Netflix 4 telas', valor: '55,90', diaCobranca: 20 });

    expect(r.id).toBe(s.id);
    expect(r.nome).toBe('Netflix 4 telas');
    expect(r.valor).toBe(55.9);
    expect(r.diaCobranca).toBe(20);
    // preserva o que não estava no formulário
    expect(r.icone).toBe('tv');
    expect(r.ativa).toBe(antes.ativa); // continua inativa
    expect(r.criadoEm).toBe(antes.criadoEm);
  });

  test('aplica trim no nome', function() {
    const s = A().criar({ nome: 'X', valor: '10', diaCobranca: 5 });
    const r = A().editar(s.id, { nome: '   Spotify   ', valor: '21,90', diaCobranca: 5 });
    expect(r.nome).toBe('Spotify');
  });

  test('id inexistente lança erro e não cria nada', function() {
    expect(function() { A().editar('nao-existe', { nome: 'Z', valor: '10', diaCobranca: 1 }); })
      .toThrow('Assinatura não encontrada');
    expect(A().listar().length).toBe(0);
  });

  test('recusa nome vazio, valor inválido e dia fora de 1–31', function() {
    const s = A().criar({ nome: 'Base', valor: '10', diaCobranca: 5 });
    expect(function() { A().editar(s.id, { nome: '  ', valor: '10', diaCobranca: 5 }); }).toThrow('nome');
    expect(function() { A().editar(s.id, { nome: 'Ok', valor: '0', diaCobranca: 5 }); }).toThrow('Valor');
    expect(function() { A().editar(s.id, { nome: 'Ok', valor: '10', diaCobranca: 0 }); }).toThrow('Dia');
    expect(function() { A().editar(s.id, { nome: 'Ok', valor: '10', diaCobranca: 32 }); }).toThrow('Dia');
    // depois dos erros, o registro original permanece intacto
    const a = A().obter(s.id);
    expect(a.nome).toBe('Base');
    expect(a.valor).toBe(10);
  });
});

describe('ASSINATURAS — total mensal em centavos (sem drift de float)', function() {
  test('soma decimais que estouram o float sem perder centavo', function() {
    // 0.1 + 0.2 em float dá 0.30000000000000004; somando 3x isso, o total tem
    // de bater exatamente 0,90 e não arrastar dízima.
    A().criar({ nome: 'A', valor: 0.1, diaCobranca: 1 });
    A().criar({ nome: 'B', valor: 0.2, diaCobranca: 2 });
    A().criar({ nome: 'C', valor: 0.6, diaCobranca: 3 });
    expect(A().totalMensal()).toBe(0.9);
    expect(A().totalAnual()).toBe(10.8);
  });

  test('valores típicos de assinatura somam exatamente', function() {
    A().criar({ nome: 'A', valor: '19,99', diaCobranca: 1 });
    A().criar({ nome: 'B', valor: '29,99', diaCobranca: 2 });
    expect(A().totalMensal()).toBe(49.98);
  });
});

describe('ASSINATURAS — sugerir do extrato exige recorrência real', function() {
  test('só sugere o que aparece 2+ vezes; ocorrência única fica de fora', function() {
    const D = global.CONFIG.TIPO_DESPESA;
    global.TRANSACOES.criar(D, 39.90, 'assinaturas', '2026-01-05', 'Netflix');
    global.TRANSACOES.criar(D, 39.90, 'assinaturas', '2026-02-05', 'Netflix');
    global.TRANSACOES.criar(D, 21.90, 'assinaturas', '2026-01-08', 'Spotify'); // uma vez só

    const nomes = A().sugerirDoExtrato().map(function(s) { return s.nome.toLowerCase(); });
    expect(nomes).toContain('netflix');
    expect(nomes).not.toContain('spotify');
  });

  test('não sugere o que já está cadastrado', function() {
    const D = global.CONFIG.TIPO_DESPESA;
    global.TRANSACOES.criar(D, 39.90, 'assinaturas', '2026-01-05', 'Netflix');
    global.TRANSACOES.criar(D, 39.90, 'assinaturas', '2026-02-05', 'Netflix');
    A().criar({ nome: 'Netflix', valor: '39,90', diaCobranca: 5 });

    const nomes = A().sugerirDoExtrato().map(function(s) { return s.nome.toLowerCase(); });
    expect(nomes).not.toContain('netflix');
  });

  test('detecta pela descrição fora da categoria e ignora ruído (sem descrição / curta)', function() {
    const D = global.CONFIG.TIPO_DESPESA;
    // Categoria comum, mas a descrição casa o padrão de serviço → recorrente.
    global.TRANSACOES.criar(D, 30, 'lazer', '2026-01-05', 'Disney');
    global.TRANSACOES.criar(D, 30, 'lazer', '2026-02-05', 'Disney');
    // Ruído que o detector precisa atravessar sem quebrar nem sugerir:
    global.TRANSACOES.criar(D, 10, 'assinaturas', '2026-01-05', '');   // sem descrição
    global.TRANSACOES.criar(D, 10, 'assinaturas', '2026-01-06', 'ab'); // descrição curta (<3)

    const nomes = A().sugerirDoExtrato().map(function(s) { return s.nome.toLowerCase(); });
    expect(nomes).toContain('disney');
    expect(nomes).not.toContain('');
    expect(nomes).not.toContain('ab');
  });
});
